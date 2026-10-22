import uuid

from fastapi import APIRouter, Request, Response, status

from app.core.deps import Auth, DbSession
from app.schemas.secrets import (
    CreateSecretRequest,
    HistoryEntry,
    UpdateAccessRequest,
    UpdateSecretRequest,
    VaultItem,
)
from app.services import secrets_service as service
from app.services.audit_service import AuditAction, record

router = APIRouter(prefix="/secrets", tags=["secrets"])


@router.get("", response_model=list[VaultItem])
def list_vault(auth: Auth, db: DbSession):
    return service.list_vault(db, auth.user_id)


@router.post("", response_model=VaultItem, status_code=status.HTTP_201_CREATED)
def create_secret(body: CreateSecretRequest, request: Request, auth: Auth, db: DbSession):
    item = service.create_secret(db, auth.user_id, body)
    record(
        db,
        request,
        AuditAction.SECRET_CREATE,
        user_id=auth.user_id,
        target_type="Secret",
        target_id=item.id,
        details={"type": item.type.value},
    )
    db.commit()
    return item


@router.put("/{secret_id}", response_model=VaultItem)
def update_secret(
    secret_id: uuid.UUID, body: UpdateSecretRequest, request: Request, auth: Auth, db: DbSession
):
    item = service.update_secret(db, auth.user_id, secret_id, body)
    record(
        db,
        request,
        AuditAction.SECRET_UPDATE,
        user_id=auth.user_id,
        target_type="Secret",
        target_id=secret_id,
        details={"revision": item.revision},
    )
    db.commit()
    return item


@router.patch("/{secret_id}/access", response_model=VaultItem)
def update_access(
    secret_id: uuid.UUID, body: UpdateAccessRequest, request: Request, auth: Auth, db: DbSession
):
    item = service.update_own_access(db, auth.user_id, secret_id, body)
    if body.wrapped_key:
        record(
            db,
            request,
            AuditAction.SHARE_ACCEPT,
            user_id=auth.user_id,
            target_type="Secret",
            target_id=secret_id,
        )
    db.commit()
    return item


@router.delete("/{secret_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_secret(secret_id: uuid.UUID, request: Request, auth: Auth, db: DbSession) -> Response:
    service.delete_secret(db, auth.user_id, secret_id)
    record(
        db,
        request,
        AuditAction.SECRET_DELETE,
        user_id=auth.user_id,
        target_type="Secret",
        target_id=secret_id,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{secret_id}/history", response_model=list[HistoryEntry])
def list_history(secret_id: uuid.UUID, auth: Auth, db: DbSession):
    return service.list_history(db, auth.user_id, secret_id)
