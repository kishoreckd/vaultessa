import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from ...core.schema import ApiModel, Base64Hash, EncKey, EncString, RequestModel
from ...models import SecretType

TokenStatus = Literal["active", "expired", "revoked"]


class TokenGrantIn(RequestModel):
    secret_id: uuid.UUID
    # the item key wrapped with the token's derived encryption key
    wrapped_key: EncKey


class CreateTokenRequest(RequestModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    # key derived from the token secret; the server stores only sha256 of it
    auth_key: Base64Hash
    # token secret encrypted with the creator's vault key (to add items later)
    owner_key: EncString
    expires_at: datetime | None = None
    grants: Annotated[list[TokenGrantIn], Field(max_length=500)]


class UpdateGrantsRequest(RequestModel):
    grants: Annotated[list[TokenGrantIn], Field(max_length=500)]


class TokenOut(ApiModel):
    id: uuid.UUID
    name: str
    status: TokenStatus
    item_ids: list[uuid.UUID]
    owner_key: str
    created_at: datetime
    expires_at: datetime | None
    last_used_at: datetime | None
    last_used_ip: str | None


class MachineSecret(ApiModel):
    id: uuid.UUID
    type: SecretType
    encrypted_data: str
    wrapped_key: str
    revision: int
    updated_at: datetime
