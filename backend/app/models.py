"""Vaultessa data model. See docs/04-data-model.md.

Columns named encrypted_* / protected_* / wrapped_key hold client-side ciphertext the server cannot read.
"""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class Kdf(enum.StrEnum):
    PBKDF2_SHA256 = "PBKDF2_SHA256"


class SecretType(enum.StrEnum):
    LOGIN = "LOGIN"
    SECURE_NOTE = "SECURE_NOTE"
    CARD = "CARD"
    IDENTITY = "IDENTITY"
    BANK_ACCOUNT = "BANK_ACCOUNT"
    SSH_KEY = "SSH_KEY"
    API_KEY = "API_KEY"
    WIFI = "WIFI"
    SERVER = "SERVER"


class Permission(enum.StrEnum):
    """Ordered: LOGIN_ONLY < VIEW < MODIFY < MANAGE."""

    LOGIN_ONLY = "LOGIN_ONLY"
    VIEW = "VIEW"
    MODIFY = "MODIFY"
    MANAGE = "MANAGE"


PERMISSION_RANK = {Permission.LOGIN_ONLY: 0, Permission.VIEW: 1, Permission.MODIFY: 2, Permission.MANAGE: 3}


class KeyWrap(enum.StrEnum):
    VAULT = "VAULT"  # AES-GCM under the user's vault key
    RSA = "RSA"  # RSA-OAEP under the user's public key (share not yet accepted)


def created_at_column() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow)


def updated_at_column() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


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
    mfa_phone: Mapped[str | None] = mapped_column(String(32))  # verified via Firebase phone auth (SMS)
    mfa_recovery_hashes: Mapped[list | None] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))

    # Email notification opt-outs, e.g. {"sharing": false}. Security alerts can't be disabled.
    notification_prefs: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))

    @property
    def mfa_required(self) -> bool:
        return self.totp_enabled or self.mfa_phone is not None


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # sha256 of the opaque refresh token
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_agent: Mapped[str | None] = mapped_column(String(512))
    ip: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at: Mapped[datetime] = created_at_column()


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    encrypted_name: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()


class Secret(Base):
    __tablename__ = "secrets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[SecretType] = mapped_column(Enum(SecretType, name="secret_type"))
    encrypted_data: Mapped[str] = mapped_column(Text)
    # incremented on every update; used for optimistic concurrency
    revision: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    owner: Mapped[User] = relationship(lazy="selectin")


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


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_user_created", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(50))
    target_type: Mapped[str | None] = mapped_column(String(50))
    target_id: Mapped[str | None] = mapped_column(String(64))
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    # never contains secrets, keys or tokens ("metadata" is reserved by SQLAlchemy, hence the attribute name)
    details: Mapped[dict | None] = mapped_column("metadata", JSON().with_variant(JSONB(), "postgresql"))
    created_at: Mapped[datetime] = created_at_column()
