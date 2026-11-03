"""Folder ACLs stay independent of direct item grants. All keys arrive encrypted."""

import json
import uuid
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.constants.vault import Permission
from app.core.errors import AppError
from app.db.model_helpers import utcnow
from app.db.models.folder_model import Folder
from app.db.models.folder_share_model import FolderItemKey, FolderShare
from app.db.models.secret_access_model import SecretAccess
from app.db.models.secret_model import Secret
from app.db.models.user_model import User
from app.schemas.folders import FolderMember, FolderOut
from app.services.folders_service import get_owned_folder, lock_folders


def active_membership():
    return or_(FolderShare.expires_at.is_(None), FolderShare.expires_at > utcnow())


def checked_member_expiry(value):
    if value is not None and value <= utcnow():
        raise AppError.bad_request("Expiry must be in the future")
    return value


@dataclass
class InheritedAccess:
    """Nonpersistent projection of folder access; never added to the ORM session."""

    secret_id: uuid.UUID
    user_id: uuid.UUID
    secret: Secret
    wrapped_key: str
    permission: Permission
    folder_id: uuid.UUID
    inherited_folder_id: uuid.UUID
    key_wrap: Literal["FOLDER"] = "FOLDER"
    favorite: bool = False
    organization_id: uuid.UUID | None = None
    shared_folder_ids: list[uuid.UUID] = field(default_factory=list)


def visible_folders(db: Session, user_id: uuid.UUID):
    owned = list(db.scalars(select(Folder).where(Folder.user_id == user_id).order_by(Folder.created_at)))
    counts = dict(
        db.execute(
            select(FolderShare.folder_id, func.count())
            .where(active_membership())
            .where(
                FolderShare.folder_id.in_(
                    select(Folder.id).where(
                        or_(
                            Folder.user_id == user_id,
                            Folder.id.in_(
                                select(FolderShare.folder_id).where(FolderShare.user_id == user_id)
                            ),
                        )
                    )
                )
            )
            .group_by(FolderShare.folder_id)
        ).all()
    )
    result = [
        FolderOut.model_validate(f).model_copy(update={"member_count": counts.get(f.id, 0)}) for f in owned
    ]
    for folder, share in db.execute(
        select(Folder, FolderShare)
        .join(FolderShare)
        .where(FolderShare.user_id == user_id, active_membership())
    ):
        result.append(
            FolderOut(
                id=folder.id,
                encrypted_name=folder.shared_name,
                wrapped_key=share.wrapped_key,
                shared_name=folder.shared_name,
                is_owner=False,
                permission=share.permission,
                member_count=counts.get(folder.id, 0),
                created_at=folder.created_at,
                updated_at=folder.updated_at,
                expires_at=share.expires_at,
            )
        )
    return result


def enable(db: Session, user_id: uuid.UUID, folder_id: uuid.UUID, data):
    lock_folders(db, user_id)
    folder = get_owned_folder(db, user_id, folder_id)
    if folder.wrapped_key:
        raise AppError.conflict("Folder sharing was enabled elsewhere. Reload and try again.")
    rows = list(
        db.scalars(
            select(SecretAccess)
            .join(SecretAccess.secret)
            .where(
                SecretAccess.user_id == user_id,
                SecretAccess.folder_id == folder_id,
                Secret.deleted_at.is_(None),
            )
        )
    )
    if any(a.secret.owner_id != user_id for a in rows):
        raise AppError.bad_request("Move items owned by other people out before sharing this folder")
    entries = {e.secret_id: e.wrapped_key for e in data.items}
    if len(entries) != len(data.items) or set(entries) != {a.secret_id for a in rows}:
        raise AppError.conflict("Folder contents changed. Reload and try again.")
    folder.wrapped_key, folder.shared_name = data.wrapped_key, data.shared_name
    for secret_id, wrapped_key in entries.items():
        db.add(FolderItemKey(secret_id=secret_id, folder_id=folder_id, wrapped_key=wrapped_key))
    db.flush()


def members(db: Session, user_id: uuid.UUID, folder_id: uuid.UUID):
    get_owned_folder(db, user_id, folder_id)
    return [
        FolderMember(
            user_id=u.id,
            name=u.name,
            email=u.email,
            permission=s.permission,
            expires_at=s.expires_at,
            active=s.expires_at is None or s.expires_at > utcnow(),
        )
        for s, u in db.execute(
            select(FolderShare, User)
            .join(User, User.id == FolderShare.user_id)
            .where(FolderShare.folder_id == folder_id)
            .order_by(User.name)
        )
    ]


def grant(db: Session, user_id: uuid.UUID, folder_id: uuid.UUID, data):
    lock_folders(db, user_id)
    folder = get_owned_folder(db, user_id, folder_id)
    if not folder.wrapped_key:
        raise AppError.bad_request("Enable encrypted folder sharing first")
    if data.user_id == user_id:
        raise AppError.bad_request("You already own this folder")
    if db.get(User, data.user_id) is None:
        raise AppError.not_found("User not found")
    if db.get(FolderShare, (folder_id, data.user_id)):
        raise AppError.conflict("Folder already shared with this person")
    db.add(
        FolderShare(
            folder_id=folder_id,
            user_id=data.user_id,
            wrapped_key=data.wrapped_key,
            permission=data.permission,
            expires_at=checked_member_expiry(data.expires_at),
        )
    )
    db.flush()


def change(
    db: Session,
    user_id: uuid.UUID,
    folder_id: uuid.UUID,
    target_id: uuid.UUID,
    permission=None,
    expires_at=None,
    update_expiry=False,
):
    folder = db.get(Folder, folder_id)
    if folder is None:
        raise AppError.not_found("Folder not found")
    lock_folders(db, folder.user_id)
    if user_id != folder.user_id and (user_id != target_id or permission is not None or update_expiry):
        raise AppError.not_found("Folder not found")
    share = db.get(FolderShare, (folder_id, target_id))
    if share is None:
        raise AppError.not_found("Folder share not found")
    if permission is None and not update_expiry:
        db.delete(share)
    else:
        if permission is not None:
            share.permission = permission
        if update_expiry:
            share.expires_at = checked_member_expiry(expires_at)
    db.flush()


def set_item_folder(db: Session, user_id: uuid.UUID, secret_id: uuid.UUID, folder_id, wrapped_key):
    folder = get_owned_folder(db, user_id, folder_id) if folder_id else None
    secret = db.get(Secret, secret_id)
    if secret.owner_id != user_id:
        if folder and folder.wrapped_key:
            raise AppError.forbidden("Only your own items can be added to a shared folder")
        return  # A recipient's private organisation must never alter the owner's shared contents.
    existing = db.get(FolderItemKey, secret_id)
    if folder and folder.wrapped_key:
        if not wrapped_key:
            raise AppError.conflict("Reload your vault to prepare this item for folder sharing")
        if existing:
            existing.folder_id, existing.wrapped_key = folder_id, wrapped_key
        else:
            db.add(FolderItemKey(secret_id=secret_id, folder_id=folder_id, wrapped_key=wrapped_key))
    elif existing:
        db.delete(existing)


def inherited_accesses(db: Session, user_id: uuid.UUID, secret_id=None):
    query = (
        select(FolderItemKey, FolderShare, Secret)
        .join(FolderShare, FolderShare.folder_id == FolderItemKey.folder_id)
        .join(Secret, Secret.id == FolderItemKey.secret_id)
        .where(FolderShare.user_id == user_id, Secret.deleted_at.is_(None), active_membership())
    )
    if secret_id is not None:
        query = query.where(Secret.id == secret_id)
    return [
        InheritedAccess(
            secret_id=s.id,
            user_id=user_id,
            secret=s,
            wrapped_key=json.dumps({"folderKey": membership.wrapped_key, "itemKey": key.wrapped_key}),
            key_wrap="FOLDER",
            permission=Permission(membership.permission),
            folder_id=key.folder_id,
            inherited_folder_id=key.folder_id,
            favorite=False,
            organization_id=None,
        )
        for key, membership, s in db.execute(query)
    ]


def set_owned_items_folder(db: Session, folder: Folder | None, secret_ids: list[uuid.UUID], wrapped_keys):
    """Batch variant for IDs already locked and verified as owned by the caller.

    Validate the complete request before writing anything. Keep query count constant
    for bulk moves; do not fetch and update each secret/key separately.
    """
    if folder and folder.wrapped_key:
        if any(not wrapped_keys.get(secret_id) for secret_id in secret_ids):
            raise AppError.conflict("Reload your vault to prepare these items for folder sharing")
        statement = insert(FolderItemKey).values(
            [
                {"secret_id": secret_id, "folder_id": folder.id, "wrapped_key": wrapped_keys[secret_id]}
                for secret_id in secret_ids
            ]
        )
        db.execute(
            statement.on_conflict_do_update(
                index_elements=[FolderItemKey.secret_id],
                set_={
                    "folder_id": statement.excluded.folder_id,
                    "wrapped_key": statement.excluded.wrapped_key,
                },
            )
        )
    else:
        db.execute(delete(FolderItemKey).where(FolderItemKey.secret_id.in_(secret_ids)))
