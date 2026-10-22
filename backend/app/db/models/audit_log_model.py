"""AuditLog database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    ForeignKey,
    Index,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.model_helpers import created_at_column
from app.db.session import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_user_created", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(50))
    target_type: Mapped[str | None] = mapped_column(String(50))
    target_id: Mapped[str | None] = mapped_column(String(64))
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    # never contains secrets, keys or tokens ("metadata" is reserved by SQLAlchemy, hence the attribute name)
    details: Mapped[dict | None] = mapped_column("metadata", JSON().with_variant(JSONB(), "postgresql"))
    created_at: Mapped[datetime] = created_at_column()
