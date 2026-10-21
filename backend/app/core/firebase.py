"""Verifies Firebase phone-auth ID tokens (SMS one-time codes) for two-step verification.

The browser sends/confirms the SMS with the Firebase JS SDK and gets a signed ID token; we verify that
token against Google's published keys. Only FIREBASE_PROJECT_ID is needed — no service account.
"""

import time
from functools import lru_cache

import jwt

from ..config import get_settings
from .errors import AppError

GOOGLE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
MAX_AUTH_AGE_SECONDS = 300


def firebase_enabled() -> bool:
    return bool(get_settings().firebase_project_id)


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(GOOGLE_JWKS_URL, cache_keys=True, lifespan=3600)


def verify_phone_token(id_token: str) -> str:
    """Returns the verified E.164 phone number, or raises AppError."""
    project = get_settings().firebase_project_id
    if not project:
        raise AppError.bad_request("SMS verification isn't set up on this server")
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=project,
            issuer=f"https://securetoken.google.com/{project}",
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
            leeway=30,
        )
    except (jwt.PyJWTError, OSError):
        raise AppError.unauthorized("The SMS verification couldn't be confirmed. Try again.") from None

    if time.time() - float(claims.get("auth_time", 0)) > MAX_AUTH_AGE_SECONDS:
        raise AppError.unauthorized("That SMS verification is too old. Request a new code.")
    phone = claims.get("phone_number")
    provider = (claims.get("firebase") or {}).get("sign_in_provider")
    if not phone or provider != "phone":
        raise AppError.unauthorized("That isn't an SMS verification.")
    return str(phone)
