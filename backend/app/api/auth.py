import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status

from app.constants.http import REFRESH_COOKIE_PATH
from app.core.config import get_settings
from app.core.deps import DbSession, SessionAuth
from app.core.errors import AppError, error_response
from app.core.rate_limit import auth_limit, refresh_limit
from app.core.security import create_access_token, create_mfa_token, decode_mfa_token
from app.db.models.user_model import User
from app.schemas.auth import (
    Account,
    LoginMfaRequest,
    LoginRequest,
    LoginResponse,
    MfaChallenge,
    PreloginRequest,
    PreloginResponse,
    RegisterRequest,
    TokenResponse,
)
from app.services import account_service as account_service
from app.services import auth_service as service
from app.services import notifications_service as notify
from app.services import recovery_service
from app.services.audit_service import AuditAction, client_meta, record

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        get_settings().refresh_cookie_name,
        token,
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
        path=REFRESH_COOKIE_PATH,
        secure=settings.is_production,
        httponly=True,
        samesite="strict",
    )


@router.post("/prelogin", response_model=PreloginResponse, dependencies=[Depends(auth_limit)])
def prelogin(body: PreloginRequest, db: DbSession):
    return service.get_prelogin(db, body.email)


@router.post(
    "/register",
    response_model=LoginResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(auth_limit)],
)
def register(
    body: RegisterRequest, request: Request, response: Response, background: BackgroundTasks, db: DbSession
):
    user = service.register_user(db, body)
    session, token = service.create_session(db, user.id, *client_meta(request))
    record(db, request, AuditAction.USER_REGISTER, user_id=user.id, target_type="User", target_id=user.id)
    verification_token = recovery_service.issue_verification(user)
    db.commit()
    if verification_token:
        notify.verify_email(background, user, verification_token.token, verification_token.code)
    _set_refresh_cookie(response, token)
    return LoginResponse(
        access_token=create_access_token(user.id, session.id), account=Account.model_validate(user)
    )


def _fail_attempt(
    db: DbSession, request: Request, background: BackgroundTasks, user: User | None, details: dict
) -> None:
    """Records a failed attempt, locks the account after too many, and commits."""
    record(db, request, AuditAction.USER_LOGIN_FAILED, user_id=user.id if user else None, details=details)
    if user is not None and service.register_failure(user):
        record(db, request, AuditAction.USER_LOCKED, user_id=user.id)
        notify.account_locked(background, user, get_settings().account_lock_minutes)
    db.commit()


def _complete_login(
    db: DbSession,
    request: Request,
    response: Response,
    background: BackgroundTasks,
    user: User,
    method: str | None,
) -> LoginResponse:
    ip, user_agent = client_meta(request)
    new_device = service.is_new_device(db, user, user_agent)
    service.register_success(user)
    session, token = service.create_session(db, user.id, ip, user_agent)
    verification_token = recovery_service.issue_verification(user) if not user.email_verified else None
    record(db, request, AuditAction.USER_LOGIN, user_id=user.id, details={"mfa": method} if method else None)
    db.commit()
    if verification_token:
        notify.verify_email(background, user, verification_token.token, verification_token.code)
    if new_device and user.email_verified:
        notify.new_sign_in(background, user, ip, user_agent)
    _set_refresh_cookie(response, token)
    return LoginResponse(
        access_token=create_access_token(user.id, session.id), account=Account.model_validate(user)
    )


@router.post("/login", response_model=LoginResponse | MfaChallenge, dependencies=[Depends(auth_limit)])
def login(
    body: LoginRequest, request: Request, response: Response, background: BackgroundTasks, db: DbSession
):
    user = service.find_user(db, body.email, lock=True)
    if user is not None:
        service.ensure_not_locked(user)
    password_ok = service.verify_password(user, body.auth_hash)  # dummy check when user is None
    if user is None or not password_ok:
        _fail_attempt(db, request, background, user, {"email": body.email})
        return error_response(AppError.unauthorized("Invalid email or master password"), background)

    if user.mfa_required:
        # No session yet: the client must complete the second step with this short-lived token.
        return MfaChallenge(
            mfa_token=create_mfa_token(user.id, user.auth_hash),
            methods=service.mfa_methods(user),
        )
    return _complete_login(db, request, response, background, user, None)


@router.post("/login/mfa", response_model=LoginResponse, dependencies=[Depends(auth_limit)])
def login_mfa(
    body: LoginMfaRequest, request: Request, response: Response, background: BackgroundTasks, db: DbSession
):
    try:
        user = service.get_user(db, decode_mfa_token(body.mfa_token), lock=True)
        decode_mfa_token(body.mfa_token, user.auth_hash)
    except (jwt.PyJWTError, ValueError):
        raise AppError.unauthorized("Your sign-in expired. Enter your master password again.") from None
    service.ensure_not_locked(user)
    if not account_service.verify_second_factor(user, body.method, body.code):
        _fail_attempt(db, request, background, user, {"step": "mfa", "method": body.method})
        return error_response(AppError.unauthorized("That code isn't right. Try again."), background)
    result = _complete_login(db, request, response, background, user, body.method)
    if body.method == "recovery":
        notify.recovery_code_used(
            background, user, len(user.mfa_recovery_hashes or []), *client_meta(request)
        )
    return result


@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(refresh_limit)])
def refresh(request: Request, response: Response, db: DbSession):
    token = request.cookies.get(get_settings().refresh_cookie_name)
    if not token:
        raise AppError.unauthorized()
    session, next_token = service.rotate_session(db, token, *client_meta(request))
    db.commit()
    _set_refresh_cookie(response, next_token)
    return TokenResponse(access_token=create_access_token(session.user_id, session.id))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: DbSession) -> Response:
    token = request.cookies.get(get_settings().refresh_cookie_name)
    if token:
        user_id = service.delete_session_by_token(db, token)
        if user_id:
            record(db, request, AuditAction.USER_LOGOUT, user_id=user_id)
        db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(get_settings().refresh_cookie_name, path=REFRESH_COOKIE_PATH)
    return response


@router.get("/me", response_model=Account)
def me(auth: SessionAuth, db: DbSession):
    return service.get_user(db, auth.user_id)
