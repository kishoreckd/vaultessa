import uuid
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from ...core.schema import (
    ApiModel,
    Base64Hash,
    Base64Salt,
    Email,
    EncString,
    PublicKey,
    RequestModel,
)
from ...models import Kdf


class PreloginRequest(RequestModel):
    email: Email


class PreloginResponse(ApiModel):
    kdf: Kdf
    kdf_iterations: int
    kdf_salt: str


class RegisterRequest(RequestModel):
    email: Email
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    auth_hash: Base64Hash
    kdf_iterations: Annotated[int, Field(strict=True, ge=100_000, le=10_000_000)]
    kdf_salt: Base64Salt
    protected_vault_key: EncString
    public_key: PublicKey
    protected_private_key: EncString


class LoginRequest(RequestModel):
    email: Email
    auth_hash: Base64Hash


class Account(ApiModel):
    id: uuid.UUID
    email: str
    name: str
    kdf: Kdf
    kdf_iterations: int
    kdf_salt: str
    protected_vault_key: str
    public_key: str
    protected_private_key: str
    totp_enabled: bool
    mfa_phone: str | None


class LoginResponse(ApiModel):
    access_token: str
    account: Account


MfaMethod = Literal["totp", "sms", "recovery"]


class MfaChallenge(ApiModel):
    """Master password was right; a second step is needed before a session is created."""

    mfa_required: Literal[True] = True
    mfa_token: str
    methods: list[MfaMethod]
    # Firebase's client SDK needs the full number to send the SMS; the user already proved factor one.
    phone: str | None = None


class LoginMfaRequest(RequestModel):
    mfa_token: Annotated[str, StringConstraints(max_length=2048)]
    method: MfaMethod
    code: Annotated[str, StringConstraints(strip_whitespace=True, max_length=32)] | None = None
    firebase_id_token: Annotated[str, StringConstraints(max_length=8192)] | None = None


class TokenResponse(ApiModel):
    access_token: str
