"""ExternalShare database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.model_helpers import created_at_column
from app.db.models.user_model import User
from app.db.session import Base


class ExternalShare(Base):
    """A link that lets someone without access (even without an account) view a snapshot of an item.

    The decryption key lives only in the link's #fragment, so the server can't read `encrypted_data`.
    An optional access code is mixed into that key client-side and also verified here (attempt-limited).
    """

    __tablename__ = "external_shares"
    __table_args__ = (Index("ix_external_shares_owner_created", "owner_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    secret_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("secrets.id", ondelete="SET NULL"), index=True
    )
    # wiped (set to NULL) as soon as the link is used up, expires on access, or is revoked
    encrypted_data: Mapped[str | None] = mapped_column(Text)
    code_salt: Mapped[str | None] = mapped_column(String(64))
    code_hash: Mapped[str | None] = mapped_column(Text)  # scrypt of the client-derived code verifier
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_views: Mapped[int | None] = mapped_column(Integer)  # None = unlimited until expiry
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recipient_email: Mapped[str | None] = mapped_column(String(254))
    # link key + access code + chosen fields, encrypted with the OWNER's vault key so only they can
    # re-copy or re-open the link later. The server can't read it.
    owner_key_enc: Mapped[str | None] = mapped_column(Text)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()

    owner: Mapped[User] = relationship()
