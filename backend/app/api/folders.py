import uuid

from fastapi import APIRouter, Request, Response, status

from app.core.deps import Auth, DbSession
from app.schemas.folders import FolderOut, FolderRequest
from app.services import folders_service as service
from app.services.audit_service import AuditAction, record

router = APIRouter(prefix="/folders", tags=["folders"])


@router.get("", response_model=list[FolderOut])
def list_folders(auth: Auth, db: DbSession):
    return service.list_folders(db, auth.user_id)


@router.post("", response_model=FolderOut, status_code=status.HTTP_201_CREATED)
def create_folder(body: FolderRequest, request: Request, auth: Auth, db: DbSession):
    folder = service.create_folder(db, auth.user_id, body.encrypted_name)
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


@router.put("/{folder_id}", response_model=FolderOut)
def rename_folder(folder_id: uuid.UUID, body: FolderRequest, request: Request, auth: Auth, db: DbSession):
    folder = service.rename_folder(db, auth.user_id, folder_id, body.encrypted_name)
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
