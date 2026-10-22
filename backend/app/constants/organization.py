"""Organisation membership roles, separate from vault-item permissions."""

from enum import StrEnum


class OrganizationRole(StrEnum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MEMBER = "MEMBER"
