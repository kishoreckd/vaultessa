import uuid

from ...core.schema import ApiModel, RequestModel, RsaWrappedKey
from ...models import Permission


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


class GrantShareRequest(RequestModel):
    user_id: uuid.UUID
    # the secret key wrapped with the recipient's RSA-OAEP public key
    wrapped_key: RsaWrappedKey
    permission: Permission


class UpdateShareRequest(RequestModel):
    permission: Permission


class Ok(ApiModel):
    ok: bool = True
