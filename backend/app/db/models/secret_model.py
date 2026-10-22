"""Secret database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.vault import SecretType
from app.db.model_helpers import created_at_column, updated_at_column
from app.db.models.user_model import User
from app.db.session import Base


class Secret(Base):
    __tablename__ = "secrets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[SecretType] = mapped_column(Enum(SecretType, name="secret_type"))
    encrypted_data: Mapped[str] = mapped_column(Text)
    # Optional operational metadata for reminders; names and secret contents remain encrypted.
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    # incremented on every update; used for optimistic concurrency
    revision: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    owner: Mapped[User] = relationship(lazy="selectin")
