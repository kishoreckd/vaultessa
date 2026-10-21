import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field

from ...core.schema import ApiModel, EncKey, EncString, RequestModel
from ...models import KeyWrap, Permission, SecretType


class CreateSecretRequest(RequestModel):
    type: SecretType
    encrypted_data: EncString
    # the new secret key, wrapped with the creator's vault key
    wrapped_key: EncKey
    folder_id: uuid.UUID | None = None
    favorite: bool = False


class UpdateSecretRequest(RequestModel):
    encrypted_data: EncString
    # the revision the client edited; a mismatch means someone else saved first
    revision: Annotated[int, Field(strict=True, ge=0)]


class UpdateAccessRequest(RequestModel):
    """Only fields present in the body are applied (folderId: null moves the item out of its folder)."""

    folder_id: uuid.UUID | None = None
    favorite: bool | None = None
    # accept an RSA share by re-wrapping the secret key with your own vault key
    wrapped_key: EncKey | None = None


class UserBrief(ApiModel):
    id: uuid.UUID
    name: str
    email: str


class VaultItem(ApiModel):
    id: uuid.UUID
    type: SecretType
    encrypted_data: str
    revision: int
    owner_id: uuid.UUID
    # so recipients can see who shared an item and whom to ask for more access
    owner: UserBrief
    is_owner: bool
    wrapped_key: str
    key_wrap: KeyWrap
    permission: Permission
    folder_id: uuid.UUID | None
    favorite: bool
    created_at: datetime
    updated_at: datetime


class HistoryEntry(ApiModel):
    id: uuid.UUID
    encrypted_data: str
    changed_by: UserBrief | None
    created_at: datetime
