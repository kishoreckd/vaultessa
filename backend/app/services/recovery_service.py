import hashlib
import hmac
import secrets
from dataclasses import dataclass
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


@dataclass(frozen=True)
class EmailChallenge:
    token: str
    code: str


@dataclass(frozen=True)
class CodeCheck:
    """Result of checking an emailed code: the user on success, or how long codes stay blocked."""

    user: User | None
    locked_for: timedelta | None = None


def _prefix(recovery: bool) -> str:
    return "password_reset" if recovery else "email_verification"


def lock_remaining(user: User, *, recovery: bool = False) -> timedelta | None:
    """Time left on the block that follows too many wrong codes, or None if not blocked."""
    until = getattr(user, _prefix(recovery) + "_locked_until")
    now = datetime.now(UTC)
    return until - now if until and until > now else None


def code_hash(user: User, purpose: str, code: str) -> str:
    # A keyed digest protects low-entropy codes if the database alone is exposed.
    return hmac.new(
        get_settings().prelogin_secret.encode(),
        f"email-code:{purpose}:{user.id}:{code}".encode(),
        hashlib.sha256,
    ).hexdigest()


def clear_verification(user: User) -> None:
    user.email_verification_hash = None
    user.email_verification_expires_at = None
    user.email_verification_code_hash = None
    user.email_verification_code_expires_at = None
    user.email_verification_attempts = 0


def issue_verification(user: User) -> EmailChallenge | None:
    now = datetime.now(UTC)
    if user.email_verified or not notify.email_enabled() or lock_remaining(user):
        return None
    if user.email_verification_sent_at and now - user.email_verification_sent_at < timedelta(
        seconds=get_settings().email_resend_cooldown_seconds
    ):
        return None
    token = random_token()
    user.email_verification_hash = sha256_hex(token)
    user.email_verification_expires_at = now + timedelta(hours=get_settings().verification_ttl_hours)
    user.email_verification_sent_at = now
    code = f"{secrets.randbelow(1_000_000):06d}"
    user.email_verification_code_hash = code_hash(user, "verification", code)
    user.email_verification_code_expires_at = now + timedelta(minutes=get_settings().email_code_ttl_minutes)
    user.email_verification_attempts = 0
    return EmailChallenge(token, code)


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
    clear_verification(user)
    db.flush()
    return user


def clear_reset(user: User) -> None:
    user.password_reset_hash = None
    user.password_reset_expires_at = None
    user.password_reset_attempts = 0
    user.password_reset_code_hash = None
    user.password_reset_code_expires_at = None


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


def issue_reset(user: User) -> EmailChallenge | None:
    now = datetime.now(UTC)
    if not (
        user.email_verified
        and user.recovery_auth_hash
        and user.recovery_wrapped_vault_key
        and notify.email_enabled()
    ) or lock_remaining(user, recovery=True):
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
    code = f"{secrets.randbelow(1_000_000):06d}"
    user.password_reset_code_hash = code_hash(user, "recovery", code)
    user.password_reset_code_expires_at = now + timedelta(minutes=get_settings().email_code_ttl_minutes)
    return EmailChallenge(token, code)


def verify_code(db: Session, email: str, code: str, *, recovery: bool = False) -> CodeCheck:
    """Caller commits failed attempts, including lockout, before reporting the error.

    After `email_code_max_attempts` wrong codes the code is wiped and both entering and requesting
    codes are blocked for `email_code_lockout_minutes`.
    """
    user = db.scalar(select(User).where(User.email == email).with_for_update())
    if user is None:
        return CodeCheck(None)
    if locked := lock_remaining(user, recovery=recovery):
        return CodeCheck(None, locked)
    prefix = _prefix(recovery)
    digest = getattr(user, prefix + "_code_hash")
    expires = getattr(user, prefix + "_code_expires_at")
    attempts = getattr(user, prefix + "_attempts")
    eligible = (
        bool(user.email_verified and user.recovery_auth_hash and user.recovery_wrapped_vault_key)
        if recovery
        else not user.email_verified
    )
    if (
        not eligible
        or not digest
        or not expires
        or expires <= datetime.now(UTC)
        or attempts >= get_settings().email_code_max_attempts
    ):
        return CodeCheck(None)
    if not hmac.compare_digest(digest, code_hash(user, "recovery" if recovery else "verification", code)):
        setattr(user, prefix + "_attempts", attempts + 1)
        if attempts + 1 >= get_settings().email_code_max_attempts:
            if recovery:
                clear_reset(user)
            else:
                clear_verification(user)
            lockout = timedelta(minutes=get_settings().email_code_lockout_minutes)
            setattr(user, prefix + "_locked_until", datetime.now(UTC) + lockout)
            db.flush()
            return CodeCheck(None, lockout)
        db.flush()
        return CodeCheck(None)
    if recovery:
        user.password_reset_code_hash = None
        user.password_reset_code_expires_at = None
        user.password_reset_attempts = 0
    else:
        user.email_verified = True
        clear_verification(user)
    db.flush()
    return CodeCheck(user)


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


def exchange_recovery_code(db: Session, email: str, code: str) -> tuple[str | None, timedelta | None]:
    """Returns (single-use reset token, None) on success, or (None, block time left if blocked)."""
    check = verify_code(db, email, code, recovery=True)
    if check.user is None:
        return None, check.locked_for
    user = check.user
    token = random_token()
    user.password_reset_hash = sha256_hex(token)
    user.password_reset_expires_at = datetime.now(UTC) + timedelta(
        minutes=get_settings().password_reset_ttl_minutes
    )
    return token, None


def complete_reset(db: Session, body: ResetPasswordRequest) -> tuple[User, bool]:
    user = reset_user(db, body.token)
    if not verify_auth_key(body.recovery_auth, user.recovery_auth_hash):
        user.password_reset_attempts += 1
        if user.password_reset_attempts >= get_settings().max_password_reset_attempts:
            clear_reset(user)
        db.flush()
        return user, False
    if verify_auth_key(body.current_kdf_auth_hash, user.auth_hash):
        raise AppError(
            400, "PASSWORD_REUSED", "Choose a new master password different from your current password."
        )
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
