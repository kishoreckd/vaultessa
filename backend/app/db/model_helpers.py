"""Shared timezone-aware model timestamp defaults."""

from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


def created_at_column() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow)


def updated_at_column() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
