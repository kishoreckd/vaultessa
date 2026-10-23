import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.core.schema import ApiModel, Base64Hash, Base64Salt, EncString, RequestModel

Code = Annotated[str, StringConstraints(strip_whitespace=True, min_length=6, max_length=32)]


class SecurityOverview(ApiModel):
    totp_enabled: bool
    recovery_codes_left: int
    email_available: bool


class TotpSetup(ApiModel):
    secret: str
    otpauth_uri: str


class TotpEnableRequest(RequestModel):
    code: Code


class RecoveryCodes(ApiModel):
    # shown once; only hashes are stored
    recovery_codes: list[str] | None


class DisableMethodRequest(RequestModel):
    method: Literal["totp"]
    # re-authentication: proof of the master password (client-derived, as at login)
    auth_hash: Base64Hash


class ReauthRequest(RequestModel):
    auth_hash: Base64Hash


class ChangePasswordRequest(RequestModel):
    auth_hash: Base64Hash
    new_auth_hash: Base64Hash
    kdf_salt: Base64Salt
    kdf_iterations: Annotated[int, Field(strict=True, ge=600_000, le=10_000_000)]
    protected_vault_key: EncString


class SessionOut(ApiModel):
    id: uuid.UUID
    ip: str | None
    user_agent: str | None
    created_at: datetime
    last_used_at: datetime
    current: bool


class NotificationPrefs(ApiModel):
    sharing: bool
    links: bool
    expiry: bool = True


class NotificationPrefsRequest(RequestModel):
    sharing: bool
    links: bool
    expiry: bool = True


class RevokeSessionsResponse(ApiModel):
    revoked: int
