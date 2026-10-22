import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import StringConstraints, field_validator

from app.constants.organization import OrganizationRole
from app.core.schema import ApiModel, Email, RequestModel

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class CreateOrganization(RequestModel):
    name: Name


class UpdateOrganization(RequestModel):
    name: Name
    allow_domain_join: bool


class OrganizationOut(ApiModel):
    id: uuid.UUID
    name: str
    role: OrganizationRole
    allow_domain_join: bool
    member_count: int


class MemberOut(ApiModel):
    user_id: uuid.UUID
    name: str
    email: str
    role: OrganizationRole
    is_active: bool
    joined_at: datetime


class InviteMember(RequestModel):
    email: Email
    role: Literal["ADMIN", "MEMBER"] = "MEMBER"


class ChangeRole(RequestModel):
    role: Literal["ADMIN", "MEMBER"]


class TransferOwnership(RequestModel):
    user_id: uuid.UUID
    auth_hash: Annotated[str, StringConstraints(min_length=1, max_length=512)]


class InvitationOut(ApiModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str
    email: str
    role: str
    expires_at: datetime


class AddDomain(RequestModel):
    domain: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=253)]

    @field_validator("domain")
    @classmethod
    def normalize_domain(cls, value: str) -> str:
        import re

        value = value.lower().rstrip(".").encode("idna").decode("ascii")
        if not re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", value):
            raise ValueError("Enter a domain such as company.com, without a URL or email address")
        return value


class DomainOut(ApiModel):
    id: uuid.UUID
    domain: str
    txt_name: str
    txt_value: str
    verified_until: datetime | None


class DiscoverableOrganization(ApiModel):
    id: uuid.UUID
    name: str
    domain: str
