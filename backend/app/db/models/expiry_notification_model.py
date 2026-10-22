"""ExpiryNotification database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.model_helpers import created_at_column
from app.db.session import Base


class ExpiryNotification(Base):
    """Delivery ledger only: no password, item name, key or message body."""

    __tablename__ = "expiry_notifications"
    __table_args__ = (
        UniqueConstraint("secret_id", "expires_at", "stage", name="uq_expiry_notification_stage"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    secret_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("secrets.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    stage: Mapped[str] = mapped_column(String(16))
    accepted_at: Mapped[datetime] = created_at_column()
