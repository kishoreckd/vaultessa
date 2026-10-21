import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...config import get_settings
from ...core.errors import AppError
from ...core.security import (
    dummy_auth_hash,
    fake_kdf_salt,
    hash_auth_key,
    random_token,
    sha256_hex,
    verify_auth_key,
)
from ...models import AuditLog, Kdf, User, UserSession
from .schemas import PreloginResponse, RegisterRequest


def get_prelogin(db: Session, email: str) -> PreloginResponse:
    user = db.scalar(select(User).where(User.email == email))
    if user:
        return PreloginResponse(kdf=user.kdf, kdf_iterations=user.kdf_iterations, kdf_salt=user.kdf_salt)
    # Unknown email: answer exactly like a real account would.
    settings = get_settings()
    return PreloginResponse(
        kdf=Kdf.PBKDF2_SHA256,
        kdf_iterations=settings.default_kdf_iterations,
        kdf_salt=fake_kdf_salt(email, settings.prelogin_secret),
    )


def register_user(db: Session, data: RegisterRequest) -> User:
    if db.scalar(select(User.id).where(User.email == data.email)):
        raise AppError.conflict("An account with this email already exists")
    user = User(
        email=data.email,
        name=data.name,
        auth_hash=hash_auth_key(data.auth_hash),
        kdf_iterations=data.kdf_iterations,
        kdf_salt=data.kdf_salt,
        protected_vault_key=data.protected_vault_key,
        public_key=data.public_key,
        protected_private_key=data.protected_private_key,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:  # concurrent registration with the same email
        db.rollback()
        raise AppError.conflict("An account with this email already exists") from None
    return user


MAX_FAILED_LOGINS = 5
LOCK_MINUTES = 15


def find_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def ensure_not_locked(user: User) -> None:
    if user.locked_until and user.locked_until > datetime.now(UTC):
        minutes = max(1, round((user.locked_until - datetime.now(UTC)).total_seconds() / 60))
        raise AppError(
            429,
            "ACCOUNT_LOCKED",
            f"Too many failed attempts. Try again in {minutes} minute{'s' if minutes > 1 else ''}.",
        )


def register_failure(user: User) -> bool:
    """Counts a failed attempt (password or second step). Returns True if this attempt locked the account."""
    user.failed_logins = (user.failed_logins or 0) + 1
    if user.failed_logins >= MAX_FAILED_LOGINS:
        user.locked_until = datetime.now(UTC) + timedelta(minutes=LOCK_MINUTES)
        user.failed_logins = 0
        return True
    return False


def register_success(user: User) -> None:
    user.failed_logins = 0
    user.locked_until = None


def verify_password(user: User | None, auth_hash: str) -> bool:
    """Constant-ish time whether or not the user exists."""
    if user is None:
        verify_auth_key(auth_hash, dummy_auth_hash())
        return False
    return verify_auth_key(auth_hash, user.auth_hash)


def mfa_methods(user: User) -> list[str]:
    methods = []
    if user.totp_enabled:
        methods.append("totp")
    if user.mfa_phone:
        methods.append("sms")
    if user.mfa_recovery_hashes:
        methods.append("recovery")
    return methods


def is_new_device(db: Session, user: User, user_agent: str | None) -> bool:
    """True if this browser/device has never signed in to the account before."""
    if not user_agent:
        return False
    seen = db.scalar(
        select(AuditLog.id)
        .where(
            AuditLog.user_id == user.id,
            AuditLog.action.in_(("USER_LOGIN", "USER_REGISTER")),
            AuditLog.user_agent == user_agent[:512],
        )
        .limit(1)
    )
    return seen is None


def _refresh_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(days=get_settings().refresh_token_ttl_days)


def create_session(
    db: Session, user_id: uuid.UUID, ip: str | None, user_agent: str | None
) -> tuple[UserSession, str]:
    token = random_token()
    session = UserSession(
        user_id=user_id,
        token_hash=sha256_hex(token),
        ip=ip,
        user_agent=user_agent,
        expires_at=_refresh_expiry(),
    )
    db.add(session)
    db.flush()
    return session, token


def rotate_session(
    db: Session, token: str, ip: str | None, user_agent: str | None
) -> tuple[UserSession, str]:
    """Exchanges a refresh token for a new one. The old token stops working."""
    session = db.scalar(select(UserSession).where(UserSession.token_hash == sha256_hex(token)))
    if session is None:
        raise AppError.unauthorized("Session expired")
    if session.expires_at < datetime.now(UTC):
        db.delete(session)
        db.commit()
        raise AppError.unauthorized("Session expired")

    next_token = random_token()
    session.token_hash = sha256_hex(next_token)
    session.last_used_at = datetime.now(UTC)
    session.expires_at = _refresh_expiry()
    session.ip = ip
    session.user_agent = user_agent
    db.flush()
    return session, next_token


def delete_session_by_token(db: Session, token: str) -> uuid.UUID | None:
    """Deletes the session; returns its user id if it existed."""
    session = db.scalar(select(UserSession).where(UserSession.token_hash == sha256_hex(token)))
    if session is None:
        return None
    user_id = session.user_id
    db.delete(session)
    db.flush()
    return user_id


def get_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise AppError.unauthorized()
    return user
