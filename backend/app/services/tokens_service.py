import hmac
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.security import MACHINE_TOKEN_PREFIX
from app.constants.vault import Permission
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import sha256_hex
from app.db.models.api_token_grant_model import ApiTokenGrant
from app.db.models.api_token_model import ApiToken
from app.db.models.secret_access_model import SecretAccess
from app.db.models.secret_model import Secret
from app.schemas.tokens import CreateTokenRequest, MachineSecret, TokenGrantIn, TokenOut, TokenStatus
from app.services.secrets_service import require_access


def status_of(token: ApiToken) -> TokenStatus:
    if token.revoked_at:
        return "revoked"
    if token.expires_at and token.expires_at <= datetime.now(UTC):
        return "expired"
    return "active"


def to_out(token: ApiToken) -> TokenOut:
    return TokenOut(
        id=token.id,
        name=token.name,
        status=status_of(token),
        item_ids=[g.secret_id for g in token.grants],
        owner_key=token.owner_key_enc,
        created_at=token.created_at,
        expires_at=token.expires_at,
        last_used_at=token.last_used_at,
        last_used_ip=token.last_used_ip,
    )


def _validated_grants(db: Session, user_id: uuid.UUID, grants: list[TokenGrantIn]) -> list[TokenGrantIn]:
    seen: set[uuid.UUID] = set()
    for grant in grants:
        if grant.secret_id in seen:
            raise AppError.bad_request("An item was listed twice")
        seen.add(grant.secret_id)
        # A token can only read what its creator can see (not "login only" items).
        require_access(db, user_id, grant.secret_id, Permission.VIEW)
    return grants


def _owned_token(db: Session, user_id: uuid.UUID, token_id: uuid.UUID) -> ApiToken:
    token = db.get(ApiToken, token_id)
    if token is None or token.user_id != user_id:
        raise AppError.not_found("Token not found")
    return token


def list_tokens(db: Session, user_id: uuid.UUID) -> list[ApiToken]:
    return list(
        db.scalars(select(ApiToken).where(ApiToken.user_id == user_id).order_by(ApiToken.created_at.desc()))
    )


def create_token(db: Session, user_id: uuid.UUID, data: CreateTokenRequest) -> ApiToken:
    expires_at = data.expires_at
    if expires_at is not None:
        expires_at = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=UTC)
        now = datetime.now(UTC)
        if expires_at <= now:
            raise AppError.bad_request("Expiry must be in the future")
        if expires_at - now > timedelta(days=get_settings().api_token_max_lifetime_days):
            raise AppError.bad_request(
                f"Tokens can last at most {get_settings().api_token_max_lifetime_days} days"
            )
    grants = _validated_grants(db, user_id, data.grants)

    token = ApiToken(
        user_id=user_id,
        name=data.name,
        auth_hash=sha256_hex(data.auth_key),
        owner_key_enc=data.owner_key,
        expires_at=expires_at,
        grants=[ApiTokenGrant(secret_id=g.secret_id, wrapped_key=g.wrapped_key) for g in grants],
    )
    db.add(token)
    db.flush()
    return token


def replace_grants(
    db: Session, user_id: uuid.UUID, token_id: uuid.UUID, grants: list[TokenGrantIn]
) -> ApiToken:
    token = _owned_token(db, user_id, token_id)
    if status_of(token) != "active":
        raise AppError.bad_request("This token is no longer active")
    grants = _validated_grants(db, user_id, grants)
    token.grants = [ApiTokenGrant(secret_id=g.secret_id, wrapped_key=g.wrapped_key) for g in grants]
    db.flush()
    return token


def revoke_token(db: Session, user_id: uuid.UUID, token_id: uuid.UUID) -> ApiToken:
    token = _owned_token(db, user_id, token_id)
    token.revoked_at = token.revoked_at or datetime.now(UTC)
    token.grants = []
    db.flush()
    return token


def authenticate_machine(db: Session, credential: str) -> ApiToken:
    """credential = "pvm.<token id>.<base64 auth key>" (what the CLI/SDK sends as a Bearer token)."""
    try:
        prefix, token_id, auth_key = credential.split(".", 2)
        if prefix != MACHINE_TOKEN_PREFIX:
            raise ValueError
        token = db.get(ApiToken, uuid.UUID(token_id))
    except ValueError:
        token = None
    if (
        token is None
        or not hmac.compare_digest(token.auth_hash, sha256_hex(auth_key))
        or status_of(token) != "active"
    ):
        raise AppError.unauthorized("Invalid or expired access token")
    return token


def machine_secrets(db: Session, token: ApiToken) -> list[MachineSecret]:
    # Re-check the creator's current access: revoking a share also cuts off their tokens.
    rows = db.execute(
        select(Secret, ApiTokenGrant.wrapped_key)
        .join(ApiTokenGrant, ApiTokenGrant.secret_id == Secret.id)
        .join(SecretAccess, (SecretAccess.secret_id == Secret.id) & (SecretAccess.user_id == token.user_id))
        .where(ApiTokenGrant.token_id == token.id, SecretAccess.permission != Permission.LOGIN_ONLY)
        .order_by(Secret.updated_at.desc())
    )
    return [
        MachineSecret(
            id=secret.id,
            type=secret.type,
            encrypted_data=secret.encrypted_data,
            wrapped_key=wrapped_key,
            revision=secret.revision,
            updated_at=secret.updated_at,
        )
        for secret, wrapped_key in rows
    ]
