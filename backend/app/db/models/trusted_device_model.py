"""TrustedDevice database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.model_helpers import created_at_column, utcnow
from app.db.session import Base


class TrustedDevice(Base):
    """A browser that may skip the two-step code (the master password is always required).

    The browser holds a random token in an httpOnly cookie; only its sha256 is stored. `binding` is a
    digest of the user's current login proof and authenticator secret, so changing the master password
    or re-enrolling the authenticator silently invalidates every remembered device.
    """

    __tablename__ = "trusted_devices"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    binding: Mapped[str] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at: Mapped[datetime] = created_at_column()
