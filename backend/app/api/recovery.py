import math
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import select

from app.constants.http import REFRESH_COOKIE_PATH
from app.core.config import get_settings
from app.core.deps import Auth, DbSession, SessionAuth
from app.core.errors import AppError
from app.core.rate_limit import auth_limit
from app.db.models.user_model import User
from app.schemas.account import ReauthRequest
from app.schemas.recovery import (
    EmailCodeRequest,
    EmailRequest,
    EnableRecoveryRequest,
    RecoveryInfo,
    RecoveryStatus,
    ResetPasswordRequest,
    TokenRequest,
)
from app.services import notifications_service as notify
from app.services import recovery_service as service
from app.services.audit_service import AuditAction, record
from app.services.auth_service import get_user

public_router = APIRouter(
    prefix="/auth", tags=["email verification and recovery"], dependencies=[Depends(auth_limit)]
)
router = APIRouter(prefix="/account/recovery", tags=["vault recovery"], dependencies=[Depends(auth_limit)])
ACCEPTED = {
    "message": "If this account is eligible, an email will arrive shortly. Check your inbox and spam folder."
}


@public_router.get("/email/policy")
def email_policy():
    settings = get_settings()
    return {
        "resendAfterSeconds": settings.email_resend_cooldown_seconds,
        "codeTtlMinutes": settings.email_code_ttl_minutes,
    }


@public_router.get("/email/status")
def verification_status(auth: SessionAuth, db: DbSession):
    user = get_user(db, auth.user_id)
    remaining = 0
    if user.email_verification_sent_at:
        until = user.email_verification_sent_at + timedelta(
            seconds=get_settings().email_resend_cooldown_seconds
        )
        remaining = max(0, math.ceil((until - datetime.now(UTC)).total_seconds()))
    return {"resendAfterSeconds": remaining}


def _codes_blocked(remaining: timedelta) -> AppError:
    minutes = max(1, math.ceil(remaining.total_seconds() / 60))
    wait = f"{minutes // 60} h {minutes % 60} min" if minutes >= 60 else f"{minutes} min"
    total = get_settings().email_code_lockout_minutes
    period = f"{total // 60} hours" if total % 60 == 0 and total >= 120 else f"{total} minutes"
    return AppError(
        429,
        "CODES_BLOCKED",
        f"Too many incorrect codes. For your security, codes are blocked for {period}. Try again in {wait}.",
    )


@public_router.post("/email/verify-code")
def verify_email_code(body: EmailCodeRequest, request: Request, background: BackgroundTasks, db: DbSession):
    check = service.verify_code(db, body.email, body.code)
    user = check.user
    if user is None:
        db.commit()  # persist the attempt count / block before reporting it
        if check.locked_for:
            raise _codes_blocked(check.locked_for)
        raise AppError.bad_request(
            "This code is incorrect, expired, or already used. Request a new code if needed."
        )
    record(db, request, AuditAction.EMAIL_VERIFIED, user_id=user.id)
    db.commit()
    notify.welcome(background, user)
    return {"message": "Email verified. You can now open your vault."}


@public_router.post("/recovery/verify-code")
def verify_recovery_code(body: EmailCodeRequest, db: DbSession):
    token, locked_for = service.exchange_recovery_code(db, body.email, body.code)
    if token is None:
        db.commit()
        if locked_for:
            raise _codes_blocked(locked_for)
        raise AppError.bad_request(
            "This code is incorrect, expired, or already used. Request a new code if needed."
        )
    # Exchange the emailed proof for a fresh capability; neither the code nor the old link can be replayed.
    db.commit()
    return {"token": token}


@public_router.post("/email/request", status_code=202)
def request_verification(body: EmailRequest, background: BackgroundTasks, db: DbSession):
    user = db.scalar(select(User).where(User.email == body.email).with_for_update())
    if user and (locked := service.lock_remaining(user)):
        raise _codes_blocked(locked)
    token = service.issue_verification(user) if user else None
    db.commit()
    if token:
        notify.verify_email(background, user, token.token, token.code)
    return {**ACCEPTED, "resendAfterSeconds": get_settings().email_resend_cooldown_seconds}


@public_router.post("/email/verify")
def verify_email(body: TokenRequest, request: Request, background: BackgroundTasks, db: DbSession):
    user = service.verify_email(db, body.token)
    record(db, request, AuditAction.EMAIL_VERIFIED, user_id=user.id)
    db.commit()
    notify.welcome(background, user)
    return {"message": "Email verified. You can now sign in and open your vault."}


@public_router.post("/recovery/request", status_code=202)
def request_recovery(body: EmailRequest, background: BackgroundTasks, db: DbSession):
    user = db.scalar(select(User).where(User.email == body.email).with_for_update())
    if user and (locked := service.lock_remaining(user, recovery=True)):
        raise _codes_blocked(locked)
    token = service.issue_reset(user) if user else None
    db.commit()
    if token:
        notify.forgot_password(background, user, token.token, token.code)
    return {**ACCEPTED, "resendAfterSeconds": get_settings().email_resend_cooldown_seconds}


@public_router.post("/recovery/inspect", response_model=RecoveryInfo)
def inspect_recovery(body: TokenRequest, db: DbSession):
    user = service.reset_user(db, body.token)
    return RecoveryInfo(
        wrapped_vault_key=user.recovery_wrapped_vault_key,
        kdf_salt=user.kdf_salt,
        kdf_iterations=user.kdf_iterations,
    )


@public_router.post("/recovery/reset")
def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    response: Response,
    background: BackgroundTasks,
    db: DbSession,
):
    user, valid = service.complete_reset(db, body)
    if not valid:
        db.commit()  # Persist failed attempts before returning the error.
        raise AppError.bad_request("Recovery key is incorrect. Check your saved key and try again.")
    record(db, request, AuditAction.PASSWORD_RECOVERED, user_id=user.id)
    db.commit()
    notify.recovered(background, user)
    response.delete_cookie(get_settings().refresh_cookie_name, path=REFRESH_COOKIE_PATH)
    return {
        "message": "Master password reset. Sign in with your new password, then create a new recovery key."
    }


@router.get("", response_model=RecoveryStatus)
def recovery_status(auth: Auth, db: DbSession):
    user = get_user(db, auth.user_id)
    return RecoveryStatus(
        email_verified=user.email_verified,
        recovery_enabled=bool(user.recovery_auth_hash and user.recovery_wrapped_vault_key),
        email_available=notify.email_enabled(),
    )


@router.put("", status_code=204)
def enable_recovery(
    body: EnableRecoveryRequest, request: Request, background: BackgroundTasks, auth: Auth, db: DbSession
):
    user = get_user(db, auth.user_id, lock=True)
    service.enable_recovery(user, body)
    record(db, request, AuditAction.RECOVERY_KEY_ENABLE, user_id=user.id)
    db.commit()
    notify.recovery_key_changed(background, user, True)
    return Response(status_code=204)


@router.post("/disable", status_code=204)
def disable_recovery(
    body: ReauthRequest, request: Request, background: BackgroundTasks, auth: Auth, db: DbSession
):
    user = get_user(db, auth.user_id, lock=True)
    service.disable_recovery(user, body.auth_hash)
    record(db, request, AuditAction.RECOVERY_KEY_DISABLE, user_id=user.id)
    db.commit()
    notify.recovery_key_changed(background, user, False)
    return Response(status_code=204)
