"""Folder database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import (
    ForeignKey,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.model_helpers import created_at_column, updated_at_column
from app.db.session import Base


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    encrypted_name: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()
