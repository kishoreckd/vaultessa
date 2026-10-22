"""EmailOutbox database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.model_helpers import created_at_column
from app.db.session import Base


class EmailOutbox(Base):
    """Durable record of every outgoing email so failed or interrupted sends are retried.

    The rendered message (which can contain one-time codes and links) is sealed with the server key
    and wiped as soon as the email is sent, expires or permanently fails; the row stays as a ledger.
    """

    __tablename__ = "email_outbox"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    to_address: Mapped[str] = mapped_column(String(320))
    category: Mapped[str] = mapped_column(String(16))
    # pending → sent | failed (gave up) | expired (too late to be useful, e.g. a stale code)
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)
    payload_enc: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = created_at_column()
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
