"""Folder database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import (
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.model_helpers import created_at_column, updated_at_column
from app.db.session import Base


class Folder(Base):
    __tablename__ = "folders"

    __table_args__ = (UniqueConstraint("user_id", "name_fingerprint", name="uq_folder_user_fingerprint"),)

    name_fingerprint: Mapped[str | None] = mapped_column(String(64))
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    encrypted_name: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()
