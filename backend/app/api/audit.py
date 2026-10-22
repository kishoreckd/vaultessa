import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.core.deps import Auth, DbSession
from app.core.schema import ApiModel
from app.services import audit_service as service

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditEntry(ApiModel):
    id: uuid.UUID
    action: str
    target_type: str | None
    target_id: str | None
    ip: str | None
    user_agent: str | None
    metadata: dict | None
    created_at: datetime


class AuditPage(ApiModel):
    items: list[AuditEntry]
    next_cursor: uuid.UUID | None


@router.get("", response_model=AuditPage)
def list_audit(
    auth: Auth,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=100),
    cursor: uuid.UUID | None = None,
    link_id: uuid.UUID | None = Query(default=None, alias="linkId"),
):
    items, next_cursor = service.list_entries(db, auth.user_id, limit, cursor, link_id)
    return AuditPage(
        items=[
            AuditEntry(
                id=row.id,
                action=row.action,
                target_type=row.target_type,
                target_id=row.target_id,
                ip=row.ip,
                user_agent=row.user_agent,
                metadata=row.details,
                created_at=row.created_at,
            )
            for row in items
        ],
        next_cursor=next_cursor,
    )
