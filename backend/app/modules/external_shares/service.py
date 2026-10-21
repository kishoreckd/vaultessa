import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.errors import AppError
from ...core.security import hash_auth_key, verify_auth_key
from ...models import ExternalShare, Permission
from ..secrets.service import require_access
from .schemas import (
    CreateExternalShareRequest,
    ExternalShareOut,
    PublicShareInfo,
    ReopenExternalShareRequest,
    ShareStatus,
)

MAX_LIFETIME = timedelta(days=90)
MAX_CODE_ATTEMPTS = 5


def status_of(share: ExternalShare, now: datetime | None = None) -> ShareStatus:
    now = now or datetime.now(UTC)
    if share.revoked_at:
        return "revoked"
    if share.failed_attempts >= MAX_CODE_ATTEMPTS:
        return "locked"
    if share.max_views is not None and share.view_count >= share.max_views:
        return "used"
    if share.expires_at <= now:
        return "expired"
    return "active"


def email_domain(email: str | None) -> str | None:
    return email.rsplit("@", 1)[-1].lower() if email and "@" in email else None


def is_outside_domain(sender_email: str, recipient_email: str | None) -> bool:
    """TODO(P2): compare against the organisation's verified domains and enforce its sharing policy."""
    recipient = email_domain(recipient_email)
    return recipient is not None and recipient != email_domain(sender_email)


def to_out(share: ExternalShare, emailed: bool = False) -> ExternalShareOut:
    return ExternalShareOut(
        id=share.id,
        secret_id=share.secret_id,
        status=status_of(share),
        has_code=share.code_hash is not None,
        max_views=share.max_views,
        view_count=share.view_count,
        expires_at=share.expires_at,
        recipient_email=share.recipient_email,
        outside_domain=is_outside_domain(share.owner.email, share.recipient_email),
        owner_key=share.owner_key_enc,
        created_at=share.created_at,
        last_viewed_at=share.last_viewed_at,
        emailed=emailed,
    )


def _checked_expiry(expires_at: datetime) -> datetime:
    now = datetime.now(UTC)
    expires_at = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=UTC)
    if expires_at <= now:
        raise AppError.bad_request("Expiry must be in the future")
    if expires_at - now > MAX_LIFETIME:
        raise AppError.bad_request("Links can last at most 90 days")
    return expires_at


def _check_code_pair(code_salt: str | None, code_verifier: str | None) -> None:
    if (code_salt is None) != (code_verifier is None):
        raise AppError.bad_request("Access code salt and verifier must be sent together")


def create_share(db: Session, user_id: uuid.UUID, data: CreateExternalShareRequest) -> ExternalShare:
    # Sending an item outside the organisation is a "manage" decision, like sharing with a user.
    require_access(db, user_id, data.secret_id, Permission.MANAGE)
    expires_at = _checked_expiry(data.expires_at)
    _check_code_pair(data.code_salt, data.code_verifier)

    share = ExternalShare(
        owner_id=user_id,
        secret_id=data.secret_id,
        encrypted_data=data.encrypted_data,
        code_salt=data.code_salt,
        code_hash=hash_auth_key(data.code_verifier) if data.code_verifier else None,
        max_views=data.max_views,
        expires_at=expires_at,
        recipient_email=data.recipient_email,
        owner_key_enc=data.owner_key,
    )
    db.add(share)
    db.flush()
    return share


def reopen_share(
    db: Session, user_id: uuid.UUID, share_id: uuid.UUID, data: ReopenExternalShareRequest
) -> ExternalShare:
    """Re-activates an existing link URL with fresh ciphertext (the recipient's link works again)."""
    share = db.get(ExternalShare, share_id)
    if share is None or share.owner_id != user_id:
        raise AppError.not_found("Link not found")
    if share.secret_id is None:
        raise AppError.bad_request("The item this link shared was deleted")
    require_access(db, user_id, share.secret_id, Permission.MANAGE)
    if share.owner_key_enc is None:
        raise AppError.bad_request(
            "This link was created before re-opening was available. Share again instead."
        )
    _check_code_pair(data.code_salt, data.code_verifier)

    share.encrypted_data = data.encrypted_data
    share.expires_at = _checked_expiry(data.expires_at)
    share.max_views = data.max_views
    share.view_count = 0
    share.failed_attempts = 0
    share.revoked_at = None
    share.code_salt = data.code_salt
    share.code_hash = hash_auth_key(data.code_verifier) if data.code_verifier else None
    db.flush()
    return share


def list_shares(db: Session, user_id: uuid.UUID, secret_id: uuid.UUID | None) -> list[ExternalShare]:
    query = select(ExternalShare).where(ExternalShare.owner_id == user_id)
    if secret_id:
        query = query.where(ExternalShare.secret_id == secret_id)
    return list(db.scalars(query.order_by(ExternalShare.created_at.desc()).limit(200)))


def revoke_share(db: Session, user_id: uuid.UUID, share_id: uuid.UUID) -> ExternalShare:
    share = db.get(ExternalShare, share_id)
    if share is None or share.owner_id != user_id:
        raise AppError.not_found("Link not found")
    if share.revoked_at is None:
        share.revoked_at = datetime.now(UTC)
    share.encrypted_data = None
    db.flush()
    return share


def _get_public(db: Session, share_id: uuid.UUID) -> ExternalShare:
    share = db.get(ExternalShare, share_id)
    if share is None:
        raise AppError.not_found("This link doesn't exist or was deleted")
    return share


def public_info(db: Session, share_id: uuid.UUID) -> PublicShareInfo:
    share = _get_public(db, share_id)
    status = status_of(share)
    if status != "active" and share.encrypted_data is not None:
        share.encrypted_data = None  # lazily wipe ciphertext of dead links
        db.flush()
    return PublicShareInfo(
        status=status,
        sender_name=share.owner.name,
        has_code=share.code_hash is not None,
        code_salt=share.code_salt,
        expires_at=share.expires_at,
        views_left=None if share.max_views is None else max(share.max_views - share.view_count, 0),
    )


def open_share(
    db: Session, share_id: uuid.UUID, code_verifier: str | None
) -> tuple[ExternalShare, str, bool]:
    """Returns (share, ciphertext, code_ok). code_ok=False: a wrong code was recorded (caller commits)."""
    share = _get_public(db, share_id)
    if status_of(share) != "active" or share.encrypted_data is None:
        raise AppError(410, "GONE", "This link has expired or was already used")

    if share.code_hash is not None:
        if not code_verifier or not verify_auth_key(code_verifier, share.code_hash):
            share.failed_attempts += 1
            if share.failed_attempts >= MAX_CODE_ATTEMPTS:
                share.encrypted_data = None
            db.flush()
            return share, "", False

    ciphertext = share.encrypted_data
    share.view_count += 1
    share.last_viewed_at = datetime.now(UTC)
    if share.max_views is not None and share.view_count >= share.max_views:
        share.encrypted_data = None  # one-time / last allowed view: delete immediately
    db.flush()
    return share, ciphertext, True
