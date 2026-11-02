import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models.folder_model import Folder
from app.db.models.user_model import User


def get_owned_folder(db: Session, user_id: uuid.UUID, folder_id: uuid.UUID) -> Folder:
    folder = db.get(Folder, folder_id)
    if folder is None or folder.user_id != user_id:
        raise AppError.not_found("Folder not found")
    return folder


def list_folders(db: Session, user_id: uuid.UUID) -> list[Folder]:
    return list(db.scalars(select(Folder).where(Folder.user_id == user_id).order_by(Folder.created_at)))


def create_folder(db: Session, user_id: uuid.UUID, encrypted_name: str, name_fingerprint: str) -> Folder:
    lock_folders(db, user_id)
    folder = Folder(user_id=user_id, encrypted_name=encrypted_name, name_fingerprint=name_fingerprint)
    db.add(folder)
    flush_folder(db)
    return folder


def rename_folder(
    db: Session, user_id: uuid.UUID, folder_id: uuid.UUID, encrypted_name: str, name_fingerprint: str
) -> Folder:
    lock_folders(db, user_id)
    folder = get_owned_folder(db, user_id, folder_id)
    folder.name_fingerprint = name_fingerprint
    folder.encrypted_name = encrypted_name
    flush_folder(db)
    return folder


def delete_folder(db: Session, user_id: uuid.UUID, folder_id: uuid.UUID) -> None:
    """Secrets in the folder are kept; their access rows fall back to "no folder" (ON DELETE SET NULL)."""
    db.delete(get_owned_folder(db, user_id, folder_id))
    db.flush()


def lock_folders(db: Session, user_id: uuid.UUID) -> None:
    db.execute(select(User.id).where(User.id == user_id).with_for_update())


def flush_folder(db: Session) -> None:
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if getattr(exc.orig, "diag", None) and exc.orig.diag.constraint_name == "uq_folder_user_fingerprint":
            raise AppError.conflict("A folder with this name already exists") from exc
        raise


def register_fingerprints(db: Session, user_id: uuid.UUID, entries) -> None:
    # Serialize legacy backfill with create/rename. Existing duplicates remain deletable.
    lock_folders(db, user_id)
    folders = {f.id: f for f in list_folders(db, user_id)}
    claimed = {f.name_fingerprint for f in folders.values() if f.name_fingerprint}
    for entry in entries:
        folder = folders.get(entry.id)
        if folder is None:
            raise AppError.not_found("Folder not found")
        if folder.name_fingerprint is None and entry.name_fingerprint not in claimed:
            folder.name_fingerprint = entry.name_fingerprint
            claimed.add(entry.name_fingerprint)
    db.flush()
