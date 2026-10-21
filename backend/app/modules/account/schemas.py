import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import StringConstraints

from ...core.schema import ApiModel, Base64Hash, RequestModel

Code = Annotated[str, StringConstraints(strip_whitespace=True, min_length=6, max_length=32)]
FirebaseToken = Annotated[str, StringConstraints(max_length=8192)]


class SecurityOverview(ApiModel):
    totp_enabled: bool
    phone: str | None
    recovery_codes_left: int
    sms_available: bool  # Firebase configured on this server
    email_available: bool


class TotpSetup(ApiModel):
    secret: str
    otpauth_uri: str


class TotpEnableRequest(RequestModel):
    code: Code


class SmsEnableRequest(RequestModel):
    firebase_id_token: FirebaseToken


class RecoveryCodes(ApiModel):
    # shown once; only hashes are stored
    recovery_codes: list[str] | None


class DisableMethodRequest(RequestModel):
    method: Literal["totp", "sms"]
    # re-authentication: proof of the master password (client-derived, as at login)
    auth_hash: Base64Hash


class ReauthRequest(RequestModel):
    auth_hash: Base64Hash


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


class NotificationPrefsRequest(RequestModel):
    sharing: bool
    links: bool
