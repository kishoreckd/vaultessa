import uuid

from app.constants.vault import Permission
from app.core.schema import ApiModel, RequestModel, RsaWrappedKey


class UserLookup(ApiModel):
    id: uuid.UUID
    email: str
    name: str
    public_key: str


class ShareOut(ApiModel):
    user_id: uuid.UUID
    email: str
    name: str
    permission: Permission
    is_owner: bool
    accepted: bool
    organization_id: uuid.UUID | None = None


class GrantShareRequest(RequestModel):
    user_id: uuid.UUID
    # the secret key wrapped with the recipient's RSA-OAEP public key
    wrapped_key: RsaWrappedKey
    permission: Permission
    organization_id: uuid.UUID | None = None


class UpdateShareRequest(RequestModel):
    permission: Permission


class Ok(ApiModel):
    ok: bool = True
