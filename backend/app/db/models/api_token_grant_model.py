"""ApiTokenGrant database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import (
    ForeignKey,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.model_helpers import created_at_column
from app.db.session import Base


class ApiTokenGrant(Base):
    __tablename__ = "api_token_grants"

    token_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("api_tokens.id", ondelete="CASCADE"), primary_key=True
    )
    secret_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("secrets.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    # the item's key wrapped with the token's derived encryption key (EncString)
    wrapped_key: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
