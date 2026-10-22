from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import select

from app.core.deps import Auth, DbSession
from app.core.errors import AppError
from app.core.rate_limit import auth_limit
from app.db.models.user_model import User
from app.schemas.account import ReauthRequest
from app.schemas.recovery import (
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


@public_router.post("/email/request", status_code=202)
def request_verification(body: EmailRequest, background: BackgroundTasks, db: DbSession):
    user = db.scalar(select(User).where(User.email == body.email).with_for_update())
    token = service.issue_verification(user) if user else None
    db.commit()
    if token:
        notify.verify_email(background, user, token)
    return ACCEPTED


@public_router.post("/email/verify")
def verify_email(body: TokenRequest, request: Request, background: BackgroundTasks, db: DbSession):
    user = service.verify_email(db, body.token)
    record(db, request, AuditAction.EMAIL_VERIFIED, user_id=user.id)
    db.commit()
    notify.welcome(background, user)
    return {"message": "Email verified. You can now enable vault recovery in Settings."}


@public_router.post("/recovery/request", status_code=202)
def request_recovery(body: EmailRequest, background: BackgroundTasks, db: DbSession):
    user = db.scalar(select(User).where(User.email == body.email).with_for_update())
    token = service.issue_reset(user) if user else None
    db.commit()
    if token:
        notify.forgot_password(background, user, token)
    return ACCEPTED


@public_router.post("/recovery/inspect", response_model=RecoveryInfo)
def inspect_recovery(body: TokenRequest, db: DbSession):
    user = service.reset_user(db, body.token)
    return RecoveryInfo(wrapped_vault_key=user.recovery_wrapped_vault_key)


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
    response.delete_cookie("pv_refresh", path="/api/auth")
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
