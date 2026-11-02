import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field

from app.core.schema import ApiModel, EncName, RequestModel


class FolderRequest(RequestModel):
    encrypted_name: EncName
    name_fingerprint: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class FolderOut(ApiModel):
    id: uuid.UUID
    encrypted_name: str
    name_fingerprint: str | None = None
    created_at: datetime
    updated_at: datetime


class FolderFingerprint(RequestModel):
    id: uuid.UUID
    name_fingerprint: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class FolderFingerprintRequest(RequestModel):
    folders: Annotated[list[FolderFingerprint], Field(max_length=1000)]
