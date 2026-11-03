import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field

from app.core.schema import ApiModel, EncKey, EncName, RequestModel, RsaWrappedKey


class FolderRequest(RequestModel):
    encrypted_name: EncName
    name_fingerprint: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    shared_name: EncName | None = None


class FolderOut(ApiModel):
    id: uuid.UUID
    encrypted_name: str
    name_fingerprint: str | None = None
    created_at: datetime
    updated_at: datetime
    wrapped_key: str | None = None
    shared_name: str | None = None
    is_owner: bool = True
    permission: Literal["VIEW", "MODIFY", "MANAGE"] = "MANAGE"
    member_count: int = 0


class FolderKeyEntry(RequestModel):
    secret_id: uuid.UUID
    wrapped_key: EncKey


class EnableFolderSharing(RequestModel):
    wrapped_key: EncKey
    shared_name: EncName
    items: Annotated[list[FolderKeyEntry], Field(max_length=10000)]


class FolderGrant(RequestModel):
    user_id: uuid.UUID
    wrapped_key: RsaWrappedKey
    permission: Literal["VIEW", "MODIFY"]


class FolderPermission(RequestModel):
    permission: Literal["VIEW", "MODIFY"]


class FolderMember(ApiModel):
    user_id: uuid.UUID
    name: str
    email: str
    permission: Literal["VIEW", "MODIFY"]


class FolderFingerprint(RequestModel):
    id: uuid.UUID
    name_fingerprint: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class FolderFingerprintRequest(RequestModel):
    folders: Annotated[list[FolderFingerprint], Field(max_length=1000)]
