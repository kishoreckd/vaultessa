import uuid
from datetime import datetime
from enum import StrEnum

from fastapi import Request
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.db.models.audit_log_model import AuditLog


class AuditAction(StrEnum):
    ORGANIZATION_CREATE = "ORGANIZATION_CREATE"
    ORGANIZATION_UPDATE = "ORGANIZATION_UPDATE"
    ORGANIZATION_JOIN = "ORGANIZATION_JOIN"
    ORGANIZATION_MEMBER_UPDATE = "ORGANIZATION_MEMBER_UPDATE"
    ORGANIZATION_TRANSFER = "ORGANIZATION_TRANSFER"
    ORGANIZATION_INVITE = "ORGANIZATION_INVITE"
    ORGANIZATION_DOMAIN_UPDATE = "ORGANIZATION_DOMAIN_UPDATE"

    USER_REGISTER = "USER_REGISTER"
    EMAIL_VERIFIED = "EMAIL_VERIFIED"
    RECOVERY_KEY_ENABLE = "RECOVERY_KEY_ENABLE"
    RECOVERY_KEY_DISABLE = "RECOVERY_KEY_DISABLE"
    PASSWORD_RECOVERED = "PASSWORD_RECOVERED"
    USER_LOGIN = "USER_LOGIN"
    USER_LOGIN_FAILED = "USER_LOGIN_FAILED"
    USER_LOGOUT = "USER_LOGOUT"
    SECRET_CREATE = "SECRET_CREATE"
    SECRET_UPDATE = "SECRET_UPDATE"
    SECRET_DELETE = "SECRET_DELETE"
    FOLDER_CREATE = "FOLDER_CREATE"
    FOLDER_UPDATE = "FOLDER_UPDATE"
    FOLDER_DELETE = "FOLDER_DELETE"
    SHARE_GRANT = "SHARE_GRANT"
    SHARE_UPDATE = "SHARE_UPDATE"
    SHARE_REVOKE = "SHARE_REVOKE"
    SHARE_ACCEPT = "SHARE_ACCEPT"
    EXTERNAL_SHARE_CREATE = "EXTERNAL_SHARE_CREATE"
    EXTERNAL_SHARE_EMAIL = "EXTERNAL_SHARE_EMAIL"
    EXTERNAL_SHARE_REVOKE = "EXTERNAL_SHARE_REVOKE"
    EXTERNAL_SHARE_REOPEN = "EXTERNAL_SHARE_REOPEN"
    EXTERNAL_SHARE_LIMITS_UPDATE = "EXTERNAL_SHARE_LIMITS_UPDATE"
    EXTERNAL_SHARE_VIEW = "EXTERNAL_SHARE_VIEW"
    EXTERNAL_SHARE_LOCKED = "EXTERNAL_SHARE_LOCKED"
    MFA_ENABLE = "MFA_ENABLE"
    MFA_DISABLE = "MFA_DISABLE"
    MASTER_PASSWORD_CHANGE = "MASTER_PASSWORD_CHANGE"
    SESSION_REVOKE = "SESSION_REVOKE"
    USER_LOCKED = "USER_LOCKED"
    RECOVERY_CODES_REGENERATE = "RECOVERY_CODES_REGENERATE"
    TOKEN_CREATE = "TOKEN_CREATE"
    TOKEN_UPDATE = "TOKEN_UPDATE"
    TOKEN_REVOKE = "TOKEN_REVOKE"
    MACHINE_READ = "MACHINE_READ"


def client_meta(request: Request) -> tuple[str | None, str | None]:
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return ip, user_agent[:512] if user_agent else None


def record(
    db: Session,
    request: Request,
    action: AuditAction,
    *,
    user_id: uuid.UUID | None,
    target_type: str | None = None,
    target_id: uuid.UUID | str | None = None,
    details: dict | None = None,
) -> None:
    """Adds an audit row to the current transaction; it commits with the change it describes.

    Never put secrets, keys, tokens or auth hashes in `details`.
    """
    ip, user_agent = client_meta(request)
    db.add(
        AuditLog(
            user_id=user_id,
            action=action.value,
            target_type=target_type,
            target_id=str(target_id) if target_id else None,
            ip=ip,
            user_agent=user_agent,
            details=details,
        )
    )


def list_entries(
    db: Session, user_id: uuid.UUID, limit: int, cursor: uuid.UUID | None, link_id: uuid.UUID | None = None
) -> tuple[list[AuditLog], uuid.UUID | None]:
    query = select(AuditLog).where(AuditLog.user_id == user_id)
    if link_id is not None:
        query = query.where(AuditLog.details["linkId"].as_string() == str(link_id))
    if cursor:
        anchor = db.get(AuditLog, cursor)
        if anchor and anchor.user_id == user_id:
            query = query.where(_older_than(anchor.created_at, anchor.id))
    rows = list(db.scalars(query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit + 1)))
    has_more = len(rows) > limit
    items = rows[:limit]
    return items, (items[-1].id if has_more else None)


def _older_than(created_at: datetime, row_id: uuid.UUID):
    return or_(
        AuditLog.created_at < created_at,
        and_(AuditLog.created_at == created_at, AuditLog.id < row_id),
    )
