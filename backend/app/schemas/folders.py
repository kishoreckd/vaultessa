import uuid
from datetime import datetime

from app.core.schema import ApiModel, EncName, RequestModel


class FolderRequest(RequestModel):
    encrypted_name: EncName


class FolderOut(ApiModel):
    id: uuid.UUID
    encrypted_name: str
    created_at: datetime
    updated_at: datetime
