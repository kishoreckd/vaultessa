import uuid

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session, contains_eager, joinedload, object_session

from app.constants.vault import PERMISSION_RANK, KeyWrap, Permission
from app.core.errors import AppError
from app.db.model_helpers import utcnow
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
from app.services.folders_service import get_owned_folder


def has_permission(actual: Permission, required: Permission) -> bool:
    return PERMISSION_RANK[actual] >= PERMISSION_RANK[required]


def require_access(
    db: Session, user_id: uuid.UUID, secret_id: uuid.UUID, required: Permission
) -> SecretAccess:
    """Loads the caller's access row and enforces a minimum permission.

    No access at all → 404 (don't reveal the secret exists); insufficient permission → 403.
    """
    access = db.get(SecretAccess, {"secret_id": secret_id, "user_id": user_id})
    if access is None:
        raise AppError.not_found("Secret not found")
    if not has_permission(access.permission, required):
        raise AppError.forbidden()
    return access


def _shared_with_counts(db: Session, secret_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """Number of people besides the owner who can open each secret (one grouped query)."""
    if not secret_ids:
        return {}
    rows = db.execute(
        select(SecretAccess.secret_id, func.count())
        .where(SecretAccess.secret_id.in_(secret_ids))
        .group_by(SecretAccess.secret_id)
    )
    return {secret_id: count - 1 for secret_id, count in rows}


def to_vault_item(access: SecretAccess, shared_with: int | None = None) -> VaultItem:
    secret = access.secret
    if shared_with is None:
        db = object_session(access)
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
        permission=access.permission,
        folder_id=access.folder_id,
        favorite=access.favorite,
        shared_with=shared_with,
        created_at=secret.created_at,
        updated_at=secret.updated_at,
        expires_at=secret.expires_at,
    )


def list_vault(db: Session, user_id: uuid.UUID) -> list[VaultItem]:
    query = (
        select(SecretAccess)
        .join(SecretAccess.secret)
        .options(contains_eager(SecretAccess.secret))
        .where(SecretAccess.user_id == user_id)
        .order_by(Secret.updated_at.desc())
    )
    accesses = list(db.scalars(query).unique())
    counts = _shared_with_counts(db, [a.secret_id for a in accesses])
    return [to_vault_item(a, counts.get(a.secret_id, 0)) for a in accesses]


def create_secret(db: Session, user_id: uuid.UUID, data: CreateSecretRequest) -> VaultItem:
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
    return to_vault_item(access, shared_with=0)


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
    access = require_access(db, user_id, secret_id, Permission.LOGIN_ONLY)
    fields = data.model_fields_set

    if "folder_id" in fields:
        if data.folder_id:
            get_owned_folder(db, user_id, data.folder_id)
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
    access = require_access(db, user_id, secret_id, Permission.MANAGE)
    if access.secret.owner_id != user_id:
        raise AppError.forbidden("Only the owner can delete a secret")
    db.execute(delete(Secret).where(Secret.id == secret_id))  # access rows + history cascade in the DB


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
