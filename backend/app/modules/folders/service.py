import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.errors import AppError
from ...models import Folder


def get_owned_folder(db: Session, user_id: uuid.UUID, folder_id: uuid.UUID) -> Folder:
    folder = db.get(Folder, folder_id)
    if folder is None or folder.user_id != user_id:
        raise AppError.not_found("Folder not found")
    return folder


def list_folders(db: Session, user_id: uuid.UUID) -> list[Folder]:
    return list(db.scalars(select(Folder).where(Folder.user_id == user_id).order_by(Folder.created_at)))


def create_folder(db: Session, user_id: uuid.UUID, encrypted_name: str) -> Folder:
    folder = Folder(user_id=user_id, encrypted_name=encrypted_name)
    db.add(folder)
    db.flush()
    return folder


def rename_folder(db: Session, user_id: uuid.UUID, folder_id: uuid.UUID, encrypted_name: str) -> Folder:
    folder = get_owned_folder(db, user_id, folder_id)
    folder.encrypted_name = encrypted_name
    db.flush()
    return folder


def delete_folder(db: Session, user_id: uuid.UUID, folder_id: uuid.UUID) -> None:
    """Secrets in the folder are kept; their access rows fall back to "no folder" (ON DELETE SET NULL)."""
    db.delete(get_owned_folder(db, user_id, folder_id))
    db.flush()
