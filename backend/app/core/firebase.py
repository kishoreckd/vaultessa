"""Verifies Firebase phone-auth ID tokens (SMS one-time codes) for two-step verification.

The browser sends/confirms the SMS with the Firebase JS SDK and gets a signed ID token; we verify that
token against Google's published keys. Only FIREBASE_PROJECT_ID is needed — no service account.
"""

import time
from functools import lru_cache

import jwt

from app.core.config import get_settings
from app.core.errors import AppError


def firebase_enabled() -> bool:
    return bool(get_settings().firebase_project_id)


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    settings = get_settings()
    return jwt.PyJWKClient(
        settings.firebase_jwks_url, cache_keys=True, lifespan=settings.firebase_jwks_cache_seconds
    )


def verify_phone_token(id_token: str) -> str:
    """Returns the verified E.164 phone number, or raises AppError."""
    settings = get_settings()
    project = settings.firebase_project_id
    if not project:
        raise AppError.bad_request("SMS verification isn't set up on this server")
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=project,
            issuer=f"{settings.firebase_issuer_base_url.rstrip('/')}/{project}",
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
            leeway=settings.firebase_token_leeway_seconds,
        )
    except (jwt.PyJWTError, OSError):
        raise AppError.unauthorized("The SMS verification couldn't be confirmed. Try again.") from None

    if time.time() - float(claims.get("auth_time", 0)) > settings.firebase_max_auth_age_seconds:
        raise AppError.unauthorized("That SMS verification is too old. Request a new code.")
    phone = claims.get("phone_number")
    provider = (claims.get("firebase") or {}).get("sign_in_provider")
    if not phone or provider != "phone":
        raise AppError.unauthorized("That isn't an SMS verification.")
    return str(phone)
