from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import hash_auth_key, random_token, sha256_hex, verify_auth_key
from app.db.models.api_token_grant_model import ApiTokenGrant
from app.db.models.api_token_model import ApiToken
from app.db.models.session_model import UserSession
from app.db.models.user_model import User
from app.schemas.recovery import EnableRecoveryRequest, ResetPasswordRequest
from app.services import notifications_service as notify
from app.services.account_service import require_master_password


def issue_verification(user: User) -> str | None:
    now = datetime.now(UTC)
    if user.email_verified or not notify.email_enabled():
        return None
    if user.email_verification_sent_at and now - user.email_verification_sent_at < timedelta(
        seconds=get_settings().email_resend_cooldown_seconds
    ):
        return None
    token = random_token()
    user.email_verification_hash = sha256_hex(token)
    user.email_verification_expires_at = now + timedelta(hours=get_settings().verification_ttl_hours)
    user.email_verification_sent_at = now
    return token


def verify_email(db: Session, token: str) -> User:
    user = db.scalar(select(User).where(User.email_verification_hash == sha256_hex(token)).with_for_update())
    if (
        user is None
        or user.email_verified
        or not user.email_verification_expires_at
        or user.email_verification_expires_at <= datetime.now(UTC)
    ):
        raise AppError.bad_request("This verification link expired or was already used. Request a new email.")
    user.email_verified = True
    user.email_verification_hash = None
    user.email_verification_expires_at = None
    db.flush()
    return user


def clear_reset(user: User) -> None:
    user.password_reset_hash = None
    user.password_reset_expires_at = None
    user.password_reset_attempts = 0


def enable_recovery(user: User, body: EnableRecoveryRequest) -> None:
    require_master_password(user, body.auth_hash)
    if not user.email_verified:
        raise AppError.bad_request("Verify your email before enabling vault recovery")
    user.recovery_auth_hash = hash_auth_key(body.recovery_auth)
    user.recovery_wrapped_vault_key = body.wrapped_vault_key
    clear_reset(user)


def disable_recovery(user: User, auth_hash: str) -> None:
    require_master_password(user, auth_hash)
    user.recovery_auth_hash = None
    user.recovery_wrapped_vault_key = None
    clear_reset(user)


def issue_reset(user: User) -> str | None:
    now = datetime.now(UTC)
    if not (
        user.email_verified
        and user.recovery_auth_hash
        and user.recovery_wrapped_vault_key
        and notify.email_enabled()
    ):
        return None
    if user.password_reset_sent_at and now - user.password_reset_sent_at < timedelta(
        seconds=get_settings().email_resend_cooldown_seconds
    ):
        return None
    token = random_token()
    user.password_reset_hash = sha256_hex(token)
    user.password_reset_expires_at = now + timedelta(minutes=get_settings().password_reset_ttl_minutes)
    user.password_reset_sent_at = now
    user.password_reset_attempts = 0
    return token


def reset_user(db: Session, token: str) -> User:
    user = db.scalar(select(User).where(User.password_reset_hash == sha256_hex(token)).with_for_update())
    if (
        user is None
        or not user.password_reset_expires_at
        or user.password_reset_expires_at <= datetime.now(UTC)
        or not user.recovery_auth_hash
        or not user.recovery_wrapped_vault_key
        or user.password_reset_attempts >= get_settings().max_password_reset_attempts
    ):
        raise AppError.bad_request("This recovery link expired or was already used. Request a new email.")
    return user


def complete_reset(db: Session, body: ResetPasswordRequest) -> tuple[User, bool]:
    user = reset_user(db, body.token)
    if not verify_auth_key(body.recovery_auth, user.recovery_auth_hash):
        user.password_reset_attempts += 1
        if user.password_reset_attempts >= get_settings().max_password_reset_attempts:
            user.password_reset_hash = None
            user.password_reset_expires_at = None
        db.flush()
        return user, False
    user.auth_hash = hash_auth_key(body.new_auth_hash)
    user.kdf_salt = body.kdf_salt
    user.kdf_iterations = body.kdf_iterations
    user.protected_vault_key = body.protected_vault_key
    user.failed_logins = 0
    user.locked_until = None
    # A successful recovery consumes its vault recovery key, but does not disable MFA.
    user.recovery_auth_hash = None
    user.recovery_wrapped_vault_key = None
    clear_reset(user)
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    token_ids = select(ApiToken.id).where(ApiToken.user_id == user.id)
    db.execute(delete(ApiTokenGrant).where(ApiTokenGrant.token_id.in_(token_ids)))
    db.execute(
        update(ApiToken)
        .where(ApiToken.user_id == user.id, ApiToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    db.flush()
    return user, True
