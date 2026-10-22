"""ApiToken database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.model_helpers import created_at_column
from app.db.models.api_token_grant_model import ApiTokenGrant
from app.db.session import Base


class ApiToken(Base):
    """Machine access token for CLI / SDK / CI pipelines (zero-knowledge).

    The token secret never reaches the server: the client sends an auth key derived from it
    (stored here only as sha256) and keeps a separate derived encryption key that unwraps the
    item keys in `ApiTokenGrant`.
    """

    __tablename__ = "api_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    auth_hash: Mapped[str] = mapped_column(String(64))  # sha256 hex of the derived auth key
    # token secret encrypted with the creator's vault key, so they can grant more items later
    owner_key_enc: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = created_at_column()

    grants: Mapped[list["ApiTokenGrant"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)
