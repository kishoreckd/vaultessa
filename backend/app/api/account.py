import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status

from app.core.deps import Auth, DbSession
from app.core.errors import AppError
from app.core.rate_limit import auth_limit
from app.schemas.account import (
    ChangePasswordRequest,
    DisableMethodRequest,
    NotificationPrefs,
    NotificationPrefsRequest,
    ReauthRequest,
    RecoveryCodes,
    RevokeSessionsResponse,
    SecurityOverview,
    SessionOut,
    TotpEnableRequest,
    TotpSetup,
)
from app.schemas.auth import Account
from app.services import account_service as service
from app.services import notifications_service as notify
from app.services.audit_service import AuditAction, record
from app.services.auth_service import get_user
from app.services.email_service import email_enabled

router = APIRouter(prefix="/account", tags=["account"])


@router.post("/password", response_model=Account, dependencies=[Depends(auth_limit)])
def change_password(
    body: ChangePasswordRequest, request: Request, background: BackgroundTasks, auth: Auth, db: DbSession
):
    user = service.change_password(db, auth.user_id, auth.session_id, body)
    record(db, request, AuditAction.MASTER_PASSWORD_CHANGE, user_id=user.id)
    db.commit()
    notify.master_password_changed(background, user)
    return Account.model_validate(user)


@router.get("/security", response_model=SecurityOverview)
def security_overview(auth: Auth, db: DbSession):
    user = get_user(db, auth.user_id)
    return SecurityOverview(
        totp_enabled=user.totp_enabled,
        recovery_codes_left=len(user.mfa_recovery_hashes or []),
        email_available=email_enabled(),
    )


@router.post("/mfa/totp/setup", response_model=TotpSetup)
def totp_setup(auth: Auth, db: DbSession):
    user = get_user(db, auth.user_id)
    secret, uri = service.start_totp_setup(user)
    db.commit()
    return TotpSetup(secret=secret, otpauth_uri=uri)


@router.post("/mfa/totp/enable", response_model=RecoveryCodes, dependencies=[Depends(auth_limit)])
def totp_enable(
    body: TotpEnableRequest, request: Request, background: BackgroundTasks, auth: Auth, db: DbSession
):
    user = get_user(db, auth.user_id)
    codes = service.enable_totp(user, body.code)
    record(db, request, AuditAction.MFA_ENABLE, user_id=user.id, details={"method": "totp"})
    db.commit()
    notify.two_step_changed(background, user, "totp", enabled=True)
    return RecoveryCodes(recovery_codes=codes)


@router.post("/mfa/disable", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(auth_limit)])
def mfa_disable(
    body: DisableMethodRequest, request: Request, background: BackgroundTasks, auth: Auth, db: DbSession
) -> Response:
    user = get_user(db, auth.user_id)
    service.require_master_password(user, body.auth_hash)
    service.disable_method(user, body.method)
    record(db, request, AuditAction.MFA_DISABLE, user_id=user.id, details={"method": body.method})
    db.commit()
    notify.two_step_changed(background, user, body.method, enabled=False)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/mfa/recovery-codes", response_model=RecoveryCodes, dependencies=[Depends(auth_limit)])
def regenerate_recovery_codes(body: ReauthRequest, request: Request, auth: Auth, db: DbSession):
    user = get_user(db, auth.user_id)
    service.require_master_password(user, body.auth_hash)
    if not user.mfa_required:
        raise AppError.bad_request("Turn on two-step verification first")
    codes = service.regenerate_recovery_codes(user)
    record(db, request, AuditAction.RECOVERY_CODES_REGENERATE, user_id=user.id)
    db.commit()
    return RecoveryCodes(recovery_codes=codes)


@router.get("/sessions", response_model=list[SessionOut])
def sessions(auth: Auth, db: DbSession):
    return [
        SessionOut(
            id=s.id,
            ip=s.ip,
            user_agent=s.user_agent,
            created_at=s.created_at,
            last_used_at=s.last_used_at,
            current=s.id == auth.session_id,
        )
        for s in service.list_sessions(db, auth.user_id)
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(session_id: uuid.UUID, request: Request, auth: Auth, db: DbSession) -> Response:
    service.revoke_session(db, auth.user_id, session_id, auth.session_id)
    record(
        db, request, AuditAction.SESSION_REVOKE, user_id=auth.user_id, details={"sessionId": str(session_id)}
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sessions/revoke-others", response_model=RevokeSessionsResponse)
def revoke_others(request: Request, auth: Auth, db: DbSession):
    count = service.revoke_other_sessions(db, auth.user_id, auth.session_id)
    record(db, request, AuditAction.SESSION_REVOKE, user_id=auth.user_id, details={"others": count})
    db.commit()
    return {"revoked": count}


@router.get("/notifications", response_model=NotificationPrefs)
def get_notifications(auth: Auth, db: DbSession):
    return NotificationPrefs(**notify.preferences(get_user(db, auth.user_id)))


@router.put("/notifications", response_model=NotificationPrefs)
def set_notifications(body: NotificationPrefsRequest, auth: Auth, db: DbSession):
    user = get_user(db, auth.user_id)
    user.notification_prefs = {"sharing": body.sharing, "links": body.links, "expiry": body.expiry}
    db.commit()
    return NotificationPrefs(**notify.preferences(user))
