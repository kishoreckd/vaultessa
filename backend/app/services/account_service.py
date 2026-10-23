import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core import totp
from app.core.errors import AppError
from app.core.security import hash_auth_key, seal, unseal, verify_auth_key
from app.db.models.session_model import UserSession
from app.db.models.user_model import User
from app.schemas.account import ChangePasswordRequest


def require_master_password(user: User, auth_hash: str) -> None:
    if not verify_auth_key(auth_hash, user.auth_hash):
        raise AppError.unauthorized("Master password is incorrect")


def change_password(
    db: Session, user_id: uuid.UUID, current_session: uuid.UUID, body: ChangePasswordRequest
) -> User:
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise AppError.unauthorized()
    require_master_password(user, body.auth_hash)
    if body.auth_hash == body.new_auth_hash:
        raise AppError.bad_request("Choose a different master password")
    user.auth_hash = hash_auth_key(body.new_auth_hash)
    user.kdf_salt = body.kdf_salt
    user.kdf_iterations = body.kdf_iterations
    user.protected_vault_key = body.protected_vault_key
    user.password_reset_hash = None
    user.password_reset_expires_at = None
    user.password_reset_attempts = 0
    user.password_reset_code_hash = None
    user.password_reset_code_expires_at = None
    revoke_other_sessions(db, user_id, current_session)
    db.flush()
    return user


def verify_second_factor(user: User, method: str, code: str | None) -> bool:
    """Checks one second-step attempt. Mutates the user (replay counter / used recovery code) on success."""
    if method == "totp":
        if not user.totp_enabled or not user.mfa_secret_enc or not code:
            return False
        counter = totp.matching_counter(unseal(user.mfa_secret_enc), code)
        if counter is None or (user.mfa_last_counter is not None and counter <= user.mfa_last_counter):
            return False  # wrong, or a code that was already used (replay)
        user.mfa_last_counter = counter
        return True

    if method == "recovery":
        hashes = list(user.mfa_recovery_hashes or [])
        hashed = totp.hash_recovery_code(code or "")
        if hashed not in hashes:
            return False
        hashes.remove(hashed)
        user.mfa_recovery_hashes = hashes  # each recovery code works once
        return True

    return False


def _ensure_recovery_codes(user: User) -> list[str] | None:
    """Issues recovery codes the first time a method is enabled. Returns them (shown once) or None."""
    if user.mfa_recovery_hashes:
        return None
    return regenerate_recovery_codes(user)


def regenerate_recovery_codes(user: User) -> list[str]:
    codes = totp.new_recovery_codes()
    user.mfa_recovery_hashes = [totp.hash_recovery_code(c) for c in codes]
    return codes


def start_totp_setup(user: User) -> tuple[str, str]:
    if user.totp_enabled:
        raise AppError.conflict("The authenticator app is already set up")
    secret = totp.new_secret()
    user.mfa_secret_enc = seal(secret)
    user.mfa_last_counter = None
    return secret, totp.otpauth_uri(secret, user.email)


def enable_totp(user: User, code: str) -> list[str] | None:
    if user.totp_enabled:
        raise AppError.conflict("The authenticator app is already set up")
    if not user.mfa_secret_enc:
        raise AppError.bad_request("Start the authenticator setup first")
    counter = totp.matching_counter(unseal(user.mfa_secret_enc), code)
    if counter is None:
        raise AppError.bad_request("That code isn't right. Check the time on your phone and try again.")
    user.mfa_last_counter = counter
    user.totp_enabled = True
    return _ensure_recovery_codes(user)


def disable_method(user: User, method: str) -> None:
    if method == "totp":
        if not user.totp_enabled:
            raise AppError.bad_request("The authenticator app isn't set up")
        user.totp_enabled = False
        user.mfa_secret_enc = None
        user.mfa_last_counter = None
    else:
        raise AppError.bad_request("Unsupported verification method")
    if not user.mfa_required:
        user.mfa_recovery_hashes = None


def list_sessions(db: Session, user_id: uuid.UUID) -> list[UserSession]:
    return list(
        db.scalars(
            select(UserSession)
            .where(UserSession.user_id == user_id)
            .order_by(UserSession.last_used_at.desc())
        )
    )


def revoke_session(db: Session, user_id: uuid.UUID, session_id: uuid.UUID, current_id: uuid.UUID) -> None:
    if session_id == current_id:
        raise AppError.bad_request("Use “Log out” to end this session")
    session = db.get(UserSession, session_id)
    if session is None or session.user_id != user_id:
        raise AppError.not_found("Session not found")
    db.delete(session)
    db.flush()


def revoke_other_sessions(db: Session, user_id: uuid.UUID, current_id: uuid.UUID) -> int:
    result = db.execute(
        delete(UserSession).where(UserSession.user_id == user_id, UserSession.id != current_id)
    )
    return result.rowcount or 0
