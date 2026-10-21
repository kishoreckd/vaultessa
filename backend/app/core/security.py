"""Server-side crypto only.

The server never decrypts user data — it hashes the client's auth hash, issues tokens,
and derives anti-enumeration salts. See docs/03-security-model.md.
"""

import base64
import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from functools import lru_cache

import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ..config import get_settings

SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_DKLEN = 2**15, 8, 1, 32
SCRYPT_MAXMEM = 64 * 1024 * 1024
JWT_ALGORITHM = "HS256"


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _scrypt(value: str, salt: bytes, n: int, r: int, p: int, dklen: int) -> bytes:
    return hashlib.scrypt(value.encode(), salt=salt, n=n, r=r, p=p, maxmem=SCRYPT_MAXMEM, dklen=dklen)


def hash_auth_key(auth_hash: str) -> str:
    """Hash the client-derived auth hash for storage. Format: scrypt$N$r$p$salt$hash"""
    salt = secrets.token_bytes(16)
    digest = _scrypt(auth_hash, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_DKLEN)
    return "$".join(["scrypt", str(SCRYPT_N), str(SCRYPT_R), str(SCRYPT_P), _b64(salt), _b64(digest)])


def verify_auth_key(auth_hash: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(hash_b64)
        actual = _scrypt(auth_hash, base64.b64decode(salt_b64), int(n), int(r), int(p), len(expected))
    except ValueError:
        return False
    return hmac.compare_digest(actual, expected)


@lru_cache
def dummy_auth_hash() -> str:
    """Verified against when the email is unknown, so login timing doesn't reveal account existence."""
    return hash_auth_key(secrets.token_urlsafe(32))


def random_token() -> str:
    return secrets.token_urlsafe(32)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def fake_kdf_salt(email: str, secret: str) -> str:
    """Deterministic fake KDF salt for unknown emails (prelogin anti-enumeration)."""
    return _b64(hmac.new(secret.encode(), email.encode(), hashlib.sha256).digest()[:16])


def create_access_token(user_id: uuid.UUID, session_id: uuid.UUID) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    claims = {
        "typ": "access",
        "sub": str(user_id),
        "sid": str(session_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
    }
    return jwt.encode(claims, settings.jwt_access_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> tuple[uuid.UUID, uuid.UUID]:
    """Returns (user_id, session_id). Raises jwt.PyJWTError or ValueError if invalid."""
    claims = jwt.decode(
        token,
        get_settings().jwt_access_secret,
        algorithms=[JWT_ALGORITHM],
        options={"require": ["exp", "sub", "sid", "typ"]},
    )
    if claims["typ"] != "access":
        raise jwt.InvalidTokenError("not an access token")
    return uuid.UUID(claims["sub"]), uuid.UUID(claims["sid"])


MFA_TOKEN_TTL = timedelta(minutes=5)


def create_mfa_token(user_id: uuid.UUID) -> str:
    """Proves the master password step passed; only exchangeable for a session with a valid 2nd factor."""
    now = datetime.now(UTC)
    claims = {"typ": "mfa", "sub": str(user_id), "iat": now, "exp": now + MFA_TOKEN_TTL}
    return jwt.encode(claims, get_settings().jwt_access_secret, algorithm=JWT_ALGORITHM)


def decode_mfa_token(token: str) -> uuid.UUID:
    claims = jwt.decode(
        token,
        get_settings().jwt_access_secret,
        algorithms=[JWT_ALGORITHM],
        options={"require": ["exp", "sub", "typ"]},
    )
    if claims["typ"] != "mfa":
        raise jwt.InvalidTokenError("not an MFA token")
    return uuid.UUID(claims["sub"])


def _box() -> AESGCM:
    return AESGCM(hashlib.sha256(get_settings().mfa_encryption_key.encode()).digest())


def seal(plaintext: str) -> str:
    """Encrypts a server-held secret at rest (AES-256-GCM)."""
    nonce = secrets.token_bytes(12)
    return _b64(nonce + _box().encrypt(nonce, plaintext.encode(), b"passvault-seal"))


def unseal(token: str) -> str:
    raw = base64.b64decode(token)
    return _box().decrypt(raw[:12], raw[12:], b"passvault-seal").decode()
