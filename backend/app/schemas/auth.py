import uuid
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.constants.vault import Kdf
from app.core.schema import ApiModel, Base64Hash, Base64Salt, Email, EncString, PublicKey, RequestModel


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
    email_verified: bool


class LoginResponse(ApiModel):
    access_token: str
    account: Account


MfaMethod = Literal["totp", "recovery"]


class MfaChallenge(ApiModel):
    """Master password was right; a second step is needed before a session is created."""

    mfa_required: Literal[True] = True
    mfa_token: str
    methods: list[MfaMethod]


class LoginMfaRequest(RequestModel):
    mfa_token: Annotated[str, StringConstraints(max_length=2048)]
    method: MfaMethod
    code: Annotated[str, StringConstraints(strip_whitespace=True, max_length=32)] | None = None
    # Skip the two-step code on this browser for `trusted_device_days` (master password still required).
    remember_device: bool = False


class TokenResponse(ApiModel):
    access_token: str
