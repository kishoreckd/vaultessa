"""RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — compatible with Google Authenticator, Microsoft
Authenticator, Zoho OneAuth, 1Password, etc."""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

from app.constants.security import RECOVERY_CODE_ALPHABET
from app.core.config import get_settings


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _key(secret: str) -> bytes:
    cleaned = secret.replace(" ", "").upper()
    return base64.b32decode(cleaned + "=" * (-len(cleaned) % 8))


def code_at(secret: str, counter: int) -> str:
    mac = hmac.new(_key(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    value = struct.unpack(">I", mac[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10 ** get_settings().totp_digits).zfill(get_settings().totp_digits)


def matching_counter(secret: str, code: str, now: float | None = None, window: int = 1) -> int | None:
    """Returns the time-step counter the code belongs to (±window steps for clock drift), else None."""
    code = code.strip().replace(" ", "")
    if len(code) != get_settings().totp_digits or not code.isdigit():
        return None
    current = int((now if now is not None else time.time()) // get_settings().totp_period_seconds)
    for counter in range(current - window, current + window + 1):
        if hmac.compare_digest(code_at(secret, counter), code):
            return counter
    return None


def otpauth_uri(secret: str, account: str, issuer: str | None = None) -> str:
    issuer = issuer or get_settings().totp_issuer
    label = quote(f"{issuer}:{account}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits={get_settings().totp_digits}&period={get_settings().totp_period_seconds}"


def new_recovery_codes(count: int | None = None) -> list[str]:
    """10-character codes (≈49 bits each), shown as xxxxx-xxxxx."""
    codes = []
    for _ in range(count if count is not None else get_settings().recovery_code_count):
        raw = "".join(secrets.choice(RECOVERY_CODE_ALPHABET) for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")
    return codes


def hash_recovery_code(code: str) -> str:
    normalized = code.strip().lower().replace("-", "").replace(" ", "")
    return hashlib.sha256(normalized.encode()).hexdigest()
