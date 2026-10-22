"""SecretAccess database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Enum,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.vault import KeyWrap, Permission
from app.db.model_helpers import created_at_column, updated_at_column
from app.db.models.secret_model import Secret
from app.db.models.user_model import User
from app.db.session import Base


class SecretAccess(Base):
    """Access-control list and per-user key store for secrets."""

    __tablename__ = "secret_accesses"

    secret_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("secrets.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    wrapped_key: Mapped[str] = mapped_column(Text)
    key_wrap: Mapped[KeyWrap] = mapped_column(Enum(KeyWrap, name="key_wrap"))
    permission: Mapped[Permission] = mapped_column(Enum(Permission, name="permission"))
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("folders.id", ondelete="SET NULL"), index=True
    )
    favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    granted_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    secret: Mapped[Secret] = relationship(lazy="joined")
    user: Mapped[User] = relationship(foreign_keys=[user_id])
