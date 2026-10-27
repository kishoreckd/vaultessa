"""User database mapping."""

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.constants.vault import Kdf
from app.db.model_helpers import created_at_column, updated_at_column
from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    # scrypt hash of the client-derived auth hash — never the master password
    auth_hash: Mapped[str] = mapped_column(Text)
    kdf: Mapped[Kdf] = mapped_column(Enum(Kdf, name="kdf"), default=Kdf.PBKDF2_SHA256)
    kdf_iterations: Mapped[int] = mapped_column(Integer)
    kdf_salt: Mapped[str] = mapped_column(String(64))
    protected_vault_key: Mapped[str] = mapped_column(Text)
    public_key: Mapped[str] = mapped_column(Text)
    protected_private_key: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    # Brute-force protection (per account, on top of per-IP rate limits)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Two-step verification (an authentication factor, not vault data — so the server may hold it)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    mfa_secret_enc: Mapped[str | None] = mapped_column(Text)  # TOTP seed, sealed with MFA_ENCRYPTION_KEY
    mfa_last_counter: Mapped[int | None] = mapped_column(Integer)  # blocks replay of a used code
    mfa_phone: Mapped[str | None] = mapped_column(
        String(32)
    )  # legacy factor marker; retained to avoid bypassing existing two-step requirements
    mfa_recovery_hashes: Mapped[list | None] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))

    # Email notification opt-outs, e.g. {"sharing": false}. Security alerts can't be disabled.
    notification_prefs: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))

    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    email_verification_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    email_verification_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_verification_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_verification_code_hash: Mapped[str | None] = mapped_column(String(64))
    email_verification_code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_verification_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    email_verification_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Independent client-derived proof and vault key encrypted under a recovery key held only by the user.
    recovery_auth_hash: Mapped[str | None] = mapped_column(Text)
    recovery_wrapped_vault_key: Mapped[str | None] = mapped_column(Text)
    password_reset_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_reset_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_reset_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    password_reset_code_hash: Mapped[str | None] = mapped_column(String(64))
    password_reset_code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_reset_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def mfa_required(self) -> bool:
        return self.totp_enabled or self.mfa_phone is not None
