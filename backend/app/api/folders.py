import uuid

from fastapi import APIRouter, Request, Response, status

from app.core.deps import Auth, DbSession
from app.schemas.folders import (
    EnableFolderSharing,
    FolderFingerprintRequest,
    FolderGrant,
    FolderMember,
    FolderOut,
    FolderPermission,
    FolderRequest,
)
from app.services import folder_sharing_service as sharing
from app.services import folders_service as service
from app.services.audit_service import AuditAction, record

router = APIRouter(prefix="/folders", tags=["folders"])


@router.get("", response_model=list[FolderOut])
def list_folders(auth: Auth, db: DbSession):
    return sharing.visible_folders(db, auth.user_id)


@router.post("", response_model=FolderOut, status_code=status.HTTP_201_CREATED)
def create_folder(body: FolderRequest, request: Request, auth: Auth, db: DbSession):
    folder = service.create_folder(db, auth.user_id, body.encrypted_name, body.name_fingerprint)
    record(
        db,
        request,
        AuditAction.FOLDER_CREATE,
        user_id=auth.user_id,
        target_type="Folder",
        target_id=folder.id,
    )
    db.commit()
    return folder


@router.post("/fingerprints", status_code=status.HTTP_204_NO_CONTENT)
def register_fingerprints(body: FolderFingerprintRequest, auth: Auth, db: DbSession) -> Response:
    service.register_fingerprints(db, auth.user_id, body.folders)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{folder_id}", response_model=FolderOut)
def rename_folder(folder_id: uuid.UUID, body: FolderRequest, request: Request, auth: Auth, db: DbSession):
    folder = service.rename_folder(db, auth.user_id, folder_id, body.encrypted_name, body.name_fingerprint)
    if folder.wrapped_key:
        if not body.shared_name:
            from app.core.errors import AppError

            raise AppError.conflict("Reload to rename this shared folder")
        folder.shared_name = body.shared_name
    record(
        db,
        request,
        AuditAction.FOLDER_UPDATE,
        user_id=auth.user_id,
        target_type="Folder",
        target_id=folder_id,
    )
    db.commit()
    return folder


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(folder_id: uuid.UUID, request: Request, auth: Auth, db: DbSession) -> Response:
    service.delete_folder(db, auth.user_id, folder_id)
    record(
        db,
        request,
        AuditAction.FOLDER_DELETE,
        user_id=auth.user_id,
        target_type="Folder",
        target_id=folder_id,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{folder_id}/sharing", status_code=204)
def enable_sharing(
    folder_id: uuid.UUID, body: EnableFolderSharing, request: Request, auth: Auth, db: DbSession
):
    sharing.enable(db, auth.user_id, folder_id, body)
    record(
        db,
        request,
        AuditAction.FOLDER_UPDATE,
        user_id=auth.user_id,
        target_type="Folder",
        target_id=folder_id,
    )
    db.commit()
    return Response(status_code=204)


@router.get("/{folder_id}/members", response_model=list[FolderMember])
def list_members(folder_id: uuid.UUID, auth: Auth, db: DbSession):
    return sharing.members(db, auth.user_id, folder_id)


@router.post("/{folder_id}/members", status_code=201)
def grant_member(folder_id: uuid.UUID, body: FolderGrant, request: Request, auth: Auth, db: DbSession):
    sharing.grant(db, auth.user_id, folder_id, body)
    record(
        db,
        request,
        AuditAction.SHARE_GRANT,
        user_id=auth.user_id,
        target_type="Folder",
        target_id=folder_id,
        details={"recipientId": str(body.user_id)},
    )
    db.commit()
    return {"ok": True}


@router.patch("/{folder_id}/members/{user_id}", status_code=204)
def update_member(
    folder_id: uuid.UUID,
    user_id: uuid.UUID,
    body: FolderPermission,
    request: Request,
    auth: Auth,
    db: DbSession,
):
    sharing.change(db, auth.user_id, folder_id, user_id, body.permission)
    record(
        db,
        request,
        AuditAction.SHARE_UPDATE,
        user_id=auth.user_id,
        target_type="Folder",
        target_id=folder_id,
        details={"recipientId": str(user_id)},
    )
    db.commit()
    return Response(status_code=204)


@router.delete("/{folder_id}/members/{user_id}", status_code=204)
def remove_member(folder_id: uuid.UUID, user_id: uuid.UUID, request: Request, auth: Auth, db: DbSession):
    sharing.change(db, auth.user_id, folder_id, user_id)
    record(
        db,
        request,
        AuditAction.SHARE_REVOKE,
        user_id=auth.user_id,
        target_type="Folder",
        target_id=folder_id,
        details={"recipientId": str(user_id)},
    )
    db.commit()
    return Response(status_code=204)
