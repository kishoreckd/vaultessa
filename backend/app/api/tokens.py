import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.deps import Auth, DbSession
from app.core.errors import AppError
from app.core.rate_limit import RateLimiter
from app.db.models.api_token_model import ApiToken
from app.db.session import get_db
from app.schemas.tokens import CreateTokenRequest, MachineSecret, TokenOut, UpdateGrantsRequest
from app.services import notifications_service as notify
from app.services import tokens_service as service
from app.services.audit_service import AuditAction, client_meta, record
from app.services.auth_service import get_user

router = APIRouter(prefix="/tokens", tags=["access tokens"])
machine_router = APIRouter(prefix="/machine", tags=["machine (CLI / SDK)"])
machine_limit = RateLimiter("rate_limit_machine_requests", "machine")
_bearer = HTTPBearer(auto_error=False)


@router.get("", response_model=list[TokenOut])
def list_tokens(auth: Auth, db: DbSession):
    return [service.to_out(t) for t in service.list_tokens(db, auth.user_id)]


@router.post("", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def create_token(
    body: CreateTokenRequest, request: Request, background: BackgroundTasks, auth: Auth, db: DbSession
):
    token = service.create_token(db, auth.user_id, body)
    record(
        db,
        request,
        AuditAction.TOKEN_CREATE,
        user_id=auth.user_id,
        details={"tokenId": str(token.id), "name": token.name, "items": len(body.grants)},
    )
    db.commit()
    notify.token_created(background, get_user(db, auth.user_id), token.name, len(body.grants))
    return service.to_out(token)


@router.put("/{token_id}/grants", response_model=TokenOut)
def update_grants(
    token_id: uuid.UUID, body: UpdateGrantsRequest, request: Request, auth: Auth, db: DbSession
):
    token = service.replace_grants(db, auth.user_id, token_id, body.grants)
    record(
        db,
        request,
        AuditAction.TOKEN_UPDATE,
        user_id=auth.user_id,
        details={"tokenId": str(token.id), "name": token.name, "items": len(body.grants)},
    )
    db.commit()
    return service.to_out(token)


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_token(token_id: uuid.UUID, request: Request, auth: Auth, db: DbSession) -> Response:
    token = service.revoke_token(db, auth.user_id, token_id)
    record(
        db,
        request,
        AuditAction.TOKEN_REVOKE,
        user_id=auth.user_id,
        details={"tokenId": str(token.id), "name": token.name},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Machine API (authenticated by access token, not a user session) ──────────


def get_machine_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> ApiToken:
    if credentials is None:
        raise AppError.unauthorized("Access token required")
    token = service.authenticate_machine(db, credentials.credentials)
    token.last_used_at = datetime.now(UTC)
    token.last_used_ip = client_meta(request)[0]
    return token


MachineToken = Annotated[ApiToken, Depends(get_machine_token)]


@machine_router.get("/secrets", response_model=list[MachineSecret], dependencies=[Depends(machine_limit)])
def machine_secrets(request: Request, token: MachineToken, db: DbSession):
    secrets = service.machine_secrets(db, token)
    record(
        db,
        request,
        AuditAction.MACHINE_READ,
        user_id=token.user_id,
        details={"tokenId": str(token.id), "name": token.name, "items": len(secrets)},
    )
    db.commit()
    return secrets
