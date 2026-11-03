import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.core.schema import ApiModel, Base64Hash, Base64Salt, Email, EncString, RequestModel

ShareStatus = Literal["active", "expired", "used", "revoked", "locked"]


class CreateExternalShareRequest(RequestModel):
    secret_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None
    secret_ids: Annotated[list[uuid.UUID], Field(max_length=1000)] = Field(default_factory=list)
    # snapshot of the chosen fields, encrypted with a key that only exists in the link fragment
    encrypted_data: EncString
    expires_at: datetime
    max_views: Annotated[int, Field(strict=True, ge=1, le=100)] | None = None
    # present only when an access code protects the link
    code_salt: Base64Salt | None = None
    code_verifier: Base64Hash | None = None
    recipient_email: Email | None = None
    # the link key etc., encrypted with the owner's vault key (lets the owner re-copy / re-open the link)
    owner_key: EncString | None = None

    @model_validator(mode="after")
    def check_target(self):
        if (self.secret_id is None) == (self.folder_id is None):
            raise ValueError("Choose exactly one item or folder")
        if self.folder_id is not None and not self.secret_ids:
            raise ValueError("Choose at least one folder item")
        if self.secret_id is not None and self.secret_ids:
            raise ValueError("Item links cannot include folder item IDs")
        return self


class ReopenExternalShareRequest(RequestModel):
    """Re-activates the SAME link: fresh ciphertext (same link key), new expiry, view counter reset."""

    encrypted_data: EncString
    expires_at: datetime
    max_views: Annotated[int, Field(strict=True, ge=1, le=100)] | None = None
    code_salt: Base64Salt | None = None
    code_verifier: Base64Hash | None = None


class ExternalShareOut(ApiModel):
    id: uuid.UUID
    secret_id: uuid.UUID | None
    folder_id: uuid.UUID | None = None
    kind: Literal["item", "folder"] = "item"
    status: ShareStatus
    has_code: bool
    max_views: int | None
    view_count: int
    expires_at: datetime
    recipient_email: str | None
    # recipient's email domain differs from the sender's (e.g. cxontology.com → gmail.com)
    outside_domain: bool
    owner_key: str | None
    created_at: datetime
    last_viewed_at: datetime | None
    emailed: bool = False


class UpdateShareLimitsRequest(RequestModel):
    expires_at: datetime
    max_views: Annotated[int, Field(strict=True, ge=1, le=100)] | None = None


class PublicShareInfo(ApiModel):
    status: ShareStatus
    sender_name: str
    has_code: bool
    # not secret: the guest needs it to derive the code verifier before opening
    code_salt: str | None
    expires_at: datetime
    views_left: int | None


class OpenShareRequest(RequestModel):
    code_verifier: Base64Hash | None = None


class OpenShareResponse(ApiModel):
    encrypted_data: str
    code_salt: str | None
    views_left: int | None
