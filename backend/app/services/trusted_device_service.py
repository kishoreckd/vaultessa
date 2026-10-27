"""'Remember this device': skip the two-step code on a trusted browser for a limited time.

Never skips the master password — it is what decrypts the vault (zero-knowledge).
"""

import hmac
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import random_token, sha256_hex
from app.db.models.trusted_device_model import TrustedDevice
from app.db.models.user_model import User


def _binding(user: User) -> str:
    # Changes whenever the master password (auth hash) or the authenticator secret changes.
    return sha256_hex(f"{user.auth_hash}|{user.mfa_secret_enc or ''}")


def remember(db: Session, user: User, user_agent: str | None) -> str:
    """Creates a trusted device and returns the raw token for the cookie (shown nowhere else)."""
    token = random_token()
    db.add(
        TrustedDevice(
            user_id=user.id,
            token_hash=sha256_hex(token),
            binding=_binding(user),
            user_agent=(user_agent or "")[:512] or None,
            expires_at=datetime.now(UTC) + timedelta(days=get_settings().trusted_device_days),
        )
    )
    db.flush()
    return token


def is_trusted(db: Session, user: User, token: str | None) -> bool:
    if not token:
        return False
    device = db.scalar(
        select(TrustedDevice).where(
            TrustedDevice.token_hash == sha256_hex(token), TrustedDevice.user_id == user.id
        )
    )
    now = datetime.now(UTC)
    if device is None or device.expires_at <= now or not hmac.compare_digest(device.binding, _binding(user)):
        return False
    device.last_used_at = now
    return True


def forget_all(db: Session, user_id: uuid.UUID) -> None:
    db.execute(delete(TrustedDevice).where(TrustedDevice.user_id == user_id))
