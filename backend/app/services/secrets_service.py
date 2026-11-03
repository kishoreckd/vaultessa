import uuid

from sqlalchemy import delete, func, or_, select, union, update
from sqlalchemy.orm import Session, contains_eager, joinedload, object_session

from app.constants.vault import PERMISSION_RANK, KeyWrap, Permission
from app.core.errors import AppError
from app.db.model_helpers import utcnow
from app.db.models.api_token_grant_model import ApiTokenGrant
from app.db.models.external_share_model import ExternalShare, ExternalShareSource
from app.db.models.folder_share_model import FolderItemKey, FolderShare
from app.db.models.secret_access_model import SecretAccess
from app.db.models.secret_history_model import SecretHistory
from app.db.models.secret_model import Secret
from app.schemas.secrets import (
    CreateSecretRequest,
    UpdateAccessRequest,
    UpdateSecretRequest,
    UserBrief,
    VaultItem,
)
from app.services.folder_sharing_service import (
    InheritedAccess,
    active_membership,
    inherited_accesses,
    set_item_folder,
    set_owned_items_folder,
)
from app.services.folders_service import get_owned_folder, lock_folders


def has_permission(actual: Permission, required: Permission) -> bool:
    return PERMISSION_RANK[actual] >= PERMISSION_RANK[required]


def require_access(
    db: Session, user_id: uuid.UUID, secret_id: uuid.UUID, required: Permission
) -> SecretAccess | InheritedAccess:
    """Loads the caller's access row and enforces a minimum permission.

    No access at all → 404 (don't reveal the secret exists); insufficient permission → 403.
    """
    # Serialize permission-changing operations with moving the item to Trash.
    secret = db.scalar(select(Secret).where(Secret.id == secret_id).with_for_update())
    if secret is None or secret.deleted_at is not None:
        raise AppError.not_found("Secret not found")
    access = db.get(SecretAccess, {"secret_id": secret_id, "user_id": user_id})
    inherited = inherited_accesses(db, user_id, secret_id)
    if inherited and (
        access is None or PERMISSION_RANK[inherited[0].permission] > PERMISSION_RANK[access.permission]
    ):
        access = inherited[0]
    if access is None or access.secret.deleted_at is not None:
        raise AppError.not_found("Secret not found")
    if not has_permission(access.permission, required):
        raise AppError.forbidden()
    access.shared_folder_ids = [a.folder_id for a in inherited]
    return access


def _shared_with_counts(db: Session, secret_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """Number of people besides the owner who can open each secret (one grouped query)."""
    if not secret_ids:
        return {}
    recipients = union(
        select(SecretAccess.secret_id, SecretAccess.user_id).where(SecretAccess.secret_id.in_(secret_ids)),
        select(FolderItemKey.secret_id, FolderShare.user_id)
        .join(FolderShare, FolderShare.folder_id == FolderItemKey.folder_id)
        .where(FolderItemKey.secret_id.in_(secret_ids), active_membership()),
    ).subquery()
    rows = db.execute(select(recipients.c.secret_id, func.count()).group_by(recipients.c.secret_id))
    return {secret_id: count - 1 for secret_id, count in rows}


def to_vault_item(access: SecretAccess | InheritedAccess, shared_with: int | None = None) -> VaultItem:
    secret = access.secret
    if shared_with is None:
        db = object_session(secret)
        shared_with = _shared_with_counts(db, [secret.id]).get(secret.id, 0) if db else 0
    return VaultItem(
        id=secret.id,
        type=secret.type,
        encrypted_data=secret.encrypted_data,
        revision=secret.revision,
        owner_id=secret.owner_id,
        owner=UserBrief.model_validate(secret.owner),
        is_owner=secret.owner_id == access.user_id,
        wrapped_key=access.wrapped_key,
        key_wrap=access.key_wrap,
        inherited_folder_id=getattr(access, "inherited_folder_id", None),
        shared_folder_ids=getattr(access, "shared_folder_ids", []),
        permission=access.permission,
        folder_id=access.folder_id,
        favorite=access.favorite,
        shared_with=shared_with,
        created_at=secret.created_at,
        updated_at=secret.updated_at,
        expires_at=secret.expires_at,
        organization_id=access.organization_id,
    )


def list_vault(db: Session, user_id: uuid.UUID, trash: bool = False) -> list[VaultItem]:
    query = (
        select(SecretAccess)
        .join(SecretAccess.secret)
        .options(contains_eager(SecretAccess.secret))
        .where(SecretAccess.user_id == user_id)
        .where(Secret.deleted_at.is_not(None) if trash else Secret.deleted_at.is_(None))
        .where(Secret.owner_id == user_id if trash else True)
        .order_by(Secret.updated_at.desc())
    )
    accesses = list(db.scalars(query).unique())
    if not trash:
        by_id = {a.secret_id: a for a in accesses}
        for inherited in inherited_accesses(db, user_id):
            direct = by_id.get(inherited.secret_id)
            if direct is None or PERMISSION_RANK[inherited.permission] > PERMISSION_RANK[direct.permission]:
                by_id[inherited.secret_id] = inherited
            by_id[inherited.secret_id].shared_folder_ids = [inherited.folder_id]
        accesses = list(by_id.values())
    counts = _shared_with_counts(db, [a.secret_id for a in accesses])
    return [to_vault_item(a, counts.get(a.secret_id, 0)) for a in accesses]


def create_secret(db: Session, user_id: uuid.UUID, data: CreateSecretRequest) -> VaultItem:
    lock_folders(db, user_id)
    if data.folder_id:
        get_owned_folder(db, user_id, data.folder_id)
    secret = Secret(
        owner_id=user_id, type=data.type, encrypted_data=data.encrypted_data, expires_at=data.expires_at
    )
    access = SecretAccess(
        secret=secret,
        user_id=user_id,
        wrapped_key=data.wrapped_key,
        key_wrap=KeyWrap.VAULT,
        permission=Permission.MANAGE,
        folder_id=data.folder_id,
        favorite=data.favorite,
    )
    db.add_all([secret, access])
    db.flush()
    set_item_folder(db, user_id, secret.id, data.folder_id, data.folder_wrapped_key)
    db.flush()
    return to_vault_item(access)


def update_secret(
    db: Session, user_id: uuid.UUID, secret_id: uuid.UUID, data: UpdateSecretRequest
) -> VaultItem:
    access = require_access(db, user_id, secret_id, Permission.MODIFY)
    previous = access.secret.encrypted_data

    # Conditional update: only succeeds if nobody saved since the client loaded `revision`.
    values = {"encrypted_data": data.encrypted_data, "revision": Secret.revision + 1, "updated_at": utcnow()}
    if "expires_at" in data.model_fields_set:
        values["expires_at"] = data.expires_at
    result = db.execute(
        update(Secret)
        .where(Secret.id == secret_id, Secret.revision == data.revision)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        raise AppError.conflict("This secret was changed elsewhere. Reload and try again.")

    # `previous` was read at the revision the client edited, so it's exactly the version being replaced.
    db.add(SecretHistory(secret_id=secret_id, encrypted_data=previous, changed_by_id=user_id))
    db.flush()
    db.refresh(access.secret)
    return to_vault_item(access)


def update_own_access(
    db: Session, user_id: uuid.UUID, secret_id: uuid.UUID, data: UpdateAccessRequest
) -> VaultItem:
    lock_folders(db, user_id)
    require_access(db, user_id, secret_id, Permission.LOGIN_ONLY)
    access = db.get(SecretAccess, (secret_id, user_id))
    if access is None:
        raise AppError.bad_request("This item belongs to a shared folder. Manage access from the folder.")
    fields = data.model_fields_set

    if "folder_id" in fields:
        if data.folder_id:
            get_owned_folder(db, user_id, data.folder_id)
        if data.folder_id != access.folder_id:
            set_item_folder(db, user_id, secret_id, data.folder_id, data.folder_wrapped_key)
        access.folder_id = data.folder_id
    if "favorite" in fields and data.favorite is not None:
        access.favorite = data.favorite
    if data.wrapped_key:
        if access.key_wrap != KeyWrap.RSA:
            raise AppError.bad_request("This share has already been accepted")
        access.wrapped_key = data.wrapped_key
        access.key_wrap = KeyWrap.VAULT
    db.flush()
    return to_vault_item(access)


def delete_secret(db: Session, user_id: uuid.UUID, secret_id: uuid.UUID) -> None:
    lock_folders(db, user_id)
    access = require_access(db, user_id, secret_id, Permission.MANAGE)
    if access.secret.owner_id != user_id:
        raise AppError.forbidden("Only the owner can delete a secret")
    access.secret.deleted_at = utcnow()
    key = db.get(FolderItemKey, secret_id)
    if key:
        db.delete(key)
        # Restoring an item never silently restores folder sharing.
        access.folder_id = None
    # Recovery restores the owner's item, never its old sharing permissions.
    db.execute(
        delete(SecretAccess).where(SecretAccess.secret_id == secret_id, SecretAccess.user_id != user_id)
    )
    db.execute(delete(ApiTokenGrant).where(ApiTokenGrant.secret_id == secret_id))
    db.execute(
        update(ExternalShare)
        .where(
            or_(
                ExternalShare.secret_id == secret_id,
                ExternalShare.id.in_(
                    select(ExternalShareSource.share_id).where(ExternalShareSource.secret_id == secret_id)
                ),
            )
        )
        .values(revoked_at=utcnow(), encrypted_data=None, owner_key_enc=None)
    )
    db.flush()


def list_history(db: Session, user_id: uuid.UUID, secret_id: uuid.UUID) -> list[SecretHistory]:
    require_access(db, user_id, secret_id, Permission.VIEW)
    query = (
        select(SecretHistory)
        .options(joinedload(SecretHistory.changed_by))
        .where(SecretHistory.secret_id == secret_id)
        .order_by(SecretHistory.created_at.desc())
        .limit(50)
    )
    return list(db.scalars(query))


def move_secrets(
    db: Session,
    user_id: uuid.UUID,
    ids: list[uuid.UUID],
    folder_id: uuid.UUID | None,
    folder_wrapped_keys=None,
):
    lock_folders(db, user_id)
    folder = get_owned_folder(db, user_id, folder_id) if folder_id else None
    ids = list(dict.fromkeys(ids))
    eligible = list(
        db.scalars(
            select(SecretAccess.secret_id)
            .join(SecretAccess.secret)
            .where(
                SecretAccess.user_id == user_id,
                SecretAccess.secret_id.in_(ids),
                Secret.deleted_at.is_(None),
                Secret.owner_id == user_id,
            )
            .with_for_update(of=SecretAccess)
        )
    )
    if eligible:
        set_owned_items_folder(db, folder, eligible, folder_wrapped_keys or {})
        db.execute(
            update(SecretAccess)
            .where(SecretAccess.user_id == user_id, SecretAccess.secret_id.in_(eligible))
            .values(folder_id=folder_id)
        )
    moved = set(eligible)
    return {"moved": [i for i in ids if i in moved], "failed": [i for i in ids if i not in moved]}


def owned_trash(db: Session, user_id: uuid.UUID, secret_id: uuid.UUID) -> Secret:
    secret = db.scalar(
        select(Secret)
        .where(Secret.id == secret_id, Secret.owner_id == user_id, Secret.deleted_at.is_not(None))
        .with_for_update()
    )
    if secret is None:
        raise AppError.not_found("Trashed item not found")
    return secret


def restore_secret(db: Session, user_id: uuid.UUID, secret_id: uuid.UUID) -> None:
    lock_folders(db, user_id)
    owned_trash(db, user_id, secret_id).deleted_at = None
    access = db.get(SecretAccess, (secret_id, user_id))
    if access and access.folder_id:
        folder = get_owned_folder(db, user_id, access.folder_id)
        if folder.wrapped_key:
            access.folder_id = None
    db.flush()


def purge_secret(db: Session, user_id: uuid.UUID, secret_id: uuid.UUID) -> None:
    db.delete(owned_trash(db, user_id, secret_id))
    db.flush()
