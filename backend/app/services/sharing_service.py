import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.constants.vault import KeyWrap, Permission
from app.core.errors import AppError
from app.db.models.secret_access_model import SecretAccess
from app.db.models.user_model import User
from app.schemas.sharing import GrantShareRequest, ShareOut
from app.services.secrets_service import require_access


# TODO(P2): restrict lookup to members of the caller's organisation (enumeration risk).
def lookup_user(db: Session, email: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise AppError.not_found("No user with that email")
    return user


def list_shares(db: Session, user_id: uuid.UUID, secret_id: uuid.UUID) -> list[ShareOut]:
    access = require_access(db, user_id, secret_id, Permission.MANAGE)
    rows = db.scalars(
        select(SecretAccess)
        .options(joinedload(SecretAccess.user))
        .where(SecretAccess.secret_id == secret_id)
        .order_by(SecretAccess.created_at)
    )
    return [
        ShareOut(
            user_id=row.user_id,
            email=row.user.email,
            name=row.user.name,
            permission=row.permission,
            is_owner=row.user_id == access.secret.owner_id,
            accepted=row.key_wrap == KeyWrap.VAULT,
        )
        for row in rows.unique()
    ]


def grant_share(db: Session, user_id: uuid.UUID, secret_id: uuid.UUID, data: GrantShareRequest) -> None:
    require_access(db, user_id, secret_id, Permission.MANAGE)
    if data.user_id == user_id:
        raise AppError.bad_request("You already have access to this secret")
    if db.get(User, data.user_id) is None:
        raise AppError.not_found("User not found")
    if db.get(SecretAccess, {"secret_id": secret_id, "user_id": data.user_id}):
        raise AppError.conflict("Already shared with this user")

    db.add(
        SecretAccess(
            secret_id=secret_id,
            user_id=data.user_id,
            wrapped_key=data.wrapped_key,
            key_wrap=KeyWrap.RSA,
            permission=data.permission,
            granted_by_id=user_id,
        )
    )
    db.flush()


def _target_access(db: Session, secret_id: uuid.UUID, target_user_id: uuid.UUID) -> SecretAccess:
    target = db.get(SecretAccess, {"secret_id": secret_id, "user_id": target_user_id})
    if target is None:
        raise AppError.not_found("Share not found")
    if target.secret.owner_id == target_user_id:
        raise AppError.forbidden("The owner's access cannot be changed")
    return target


def update_share(
    db: Session, user_id: uuid.UUID, secret_id: uuid.UUID, target_user_id: uuid.UUID, permission: Permission
) -> None:
    require_access(db, user_id, secret_id, Permission.MANAGE)
    _target_access(db, secret_id, target_user_id).permission = permission
    db.flush()


def revoke_share(db: Session, user_id: uuid.UUID, secret_id: uuid.UUID, target_user_id: uuid.UUID) -> None:
    """Managers can revoke anyone but the owner; any recipient can remove themselves.

    NOTE: the secret key is not rotated yet (P2) — see docs/03-security-model.md.
    """
    required = Permission.LOGIN_ONLY if target_user_id == user_id else Permission.MANAGE
    require_access(db, user_id, secret_id, required)
    db.delete(_target_access(db, secret_id, target_user_id))
    db.flush()
