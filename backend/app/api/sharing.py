import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response, status
from pydantic import TypeAdapter
from sqlalchemy.orm import Session

from app.core.deps import Auth, DbSession
from app.core.rate_limit import lookup_limit
from app.core.schema import Email
from app.db.models.user_model import User
from app.schemas.sharing import GrantShareRequest, Ok, ShareOut, UpdateShareRequest, UserLookup
from app.services import notifications_service as notify
from app.services import sharing_service as service
from app.services.audit_service import AuditAction, record

# Paths span /users and /secrets/{id}/shares, so this router has no prefix of its own.
router = APIRouter(tags=["sharing"])
_email = TypeAdapter(Email)


def _notify_recipient(
    db: Session,
    background: BackgroundTasks,
    actor_id: uuid.UUID,
    recipient_id: uuid.UUID,
    permission: str | None,
    granted: bool,
) -> None:
    actor, recipient = db.get(User, actor_id), db.get(User, recipient_id)
    if actor is None or recipient is None:
        return
    if granted and permission:
        notify.item_shared(background, recipient, actor, permission)
    else:
        notify.access_changed(background, recipient, actor, permission)


@router.get("/users/lookup", response_model=UserLookup, dependencies=[Depends(lookup_limit)])
def lookup_user(auth: Auth, db: DbSession, email: str = Query(max_length=254)):
    return service.lookup_user(db, _email.validate_python(email))


@router.get("/secrets/{secret_id}/shares", response_model=list[ShareOut])
def list_shares(secret_id: uuid.UUID, auth: Auth, db: DbSession):
    return service.list_shares(db, auth.user_id, secret_id)


@router.post("/secrets/{secret_id}/shares", response_model=Ok, status_code=status.HTTP_201_CREATED)
def grant_share(
    secret_id: uuid.UUID,
    body: GrantShareRequest,
    request: Request,
    background: BackgroundTasks,
    auth: Auth,
    db: DbSession,
):
    service.grant_share(db, auth.user_id, secret_id, body)
    _notify_recipient(db, background, auth.user_id, body.user_id, body.permission.value, granted=True)
    record(
        db,
        request,
        AuditAction.SHARE_GRANT,
        user_id=auth.user_id,
        target_type="Secret",
        target_id=secret_id,
        details={"recipientId": str(body.user_id), "permission": body.permission.value},
    )
    db.commit()
    return Ok()


@router.patch("/secrets/{secret_id}/shares/{user_id}", response_model=Ok)
def update_share(
    secret_id: uuid.UUID,
    user_id: uuid.UUID,
    body: UpdateShareRequest,
    request: Request,
    background: BackgroundTasks,
    auth: Auth,
    db: DbSession,
):
    service.update_share(db, auth.user_id, secret_id, user_id, body.permission)
    _notify_recipient(db, background, auth.user_id, user_id, body.permission.value, granted=False)
    record(
        db,
        request,
        AuditAction.SHARE_UPDATE,
        user_id=auth.user_id,
        target_type="Secret",
        target_id=secret_id,
        details={"recipientId": str(user_id), "permission": body.permission.value},
    )
    db.commit()
    return Ok()


@router.delete("/secrets/{secret_id}/shares/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_share(
    secret_id: uuid.UUID,
    user_id: uuid.UUID,
    request: Request,
    background: BackgroundTasks,
    auth: Auth,
    db: DbSession,
) -> Response:
    service.revoke_share(db, auth.user_id, secret_id, user_id)
    if user_id != auth.user_id:  # leaving a share yourself needs no email
        _notify_recipient(db, background, auth.user_id, user_id, None, granted=False)
    record(
        db,
        request,
        AuditAction.SHARE_REVOKE,
        user_id=auth.user_id,
        target_type="Secret",
        target_id=secret_id,
        details={"recipientId": str(user_id)},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
