from typing import Annotated

from pydantic import Field, StringConstraints

from app.core.schema import ApiModel, Base64Hash, Base64Salt, Email, EncKey, RequestModel

EmailToken = Annotated[str, StringConstraints(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")]


class EmailRequest(RequestModel):
    email: Email


class TokenRequest(RequestModel):
    token: EmailToken


class EmailCodeRequest(EmailRequest):
    code: Annotated[str, StringConstraints(min_length=6, max_length=6, pattern=r"^[0-9]{6}$")]


class EnableRecoveryRequest(RequestModel):
    auth_hash: Base64Hash
    recovery_auth: Base64Hash
    wrapped_vault_key: EncKey


class RecoveryInfo(ApiModel):
    wrapped_vault_key: str
    kdf_salt: str
    kdf_iterations: int


class ResetPasswordRequest(RequestModel):
    token: EmailToken
    recovery_auth: Base64Hash
    new_auth_hash: Base64Hash
    current_kdf_auth_hash: Base64Hash
    kdf_salt: Base64Salt
    kdf_iterations: Annotated[int, Field(strict=True, ge=600_000, le=10_000_000)]
    protected_vault_key: EncKey


class RecoveryStatus(ApiModel):
    email_verified: bool
    recovery_enabled: bool
    email_available: bool
