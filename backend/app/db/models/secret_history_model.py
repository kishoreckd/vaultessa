"""SecretHistory database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import (
    ForeignKey,
    Index,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.model_helpers import created_at_column
from app.db.models.user_model import User
from app.db.session import Base


class SecretHistory(Base):
    __tablename__ = "secret_history"
    __table_args__ = (Index("ix_secret_history_secret_created", "secret_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    secret_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("secrets.id", ondelete="CASCADE"))
    # the previous version of Secret.encrypted_data
    encrypted_data: Mapped[str] = mapped_column(Text)
    changed_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_at_column()

    changed_by: Mapped[User | None] = relationship()
