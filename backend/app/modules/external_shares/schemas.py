import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field

from ...core.schema import ApiModel, Base64Hash, Base64Salt, Email, EncString, RequestModel

ShareStatus = Literal["active", "expired", "used", "revoked", "locked"]


class CreateExternalShareRequest(RequestModel):
    secret_id: uuid.UUID
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
