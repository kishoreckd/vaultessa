"""Register all database mappings; import models from their named modules."""

from app.db.models.api_token_grant_model import ApiTokenGrant
from app.db.models.api_token_model import ApiToken
from app.db.models.audit_log_model import AuditLog
from app.db.models.email_outbox_model import EmailOutbox
from app.db.models.expiry_notification_model import ExpiryNotification
from app.db.models.external_share_model import ExternalShare
from app.db.models.folder_model import Folder
from app.db.models.organization_domain_model import OrganizationDomain
from app.db.models.organization_invitation_model import OrganizationInvitation
from app.db.models.organization_member_model import OrganizationMember
from app.db.models.organization_model import Organization
from app.db.models.secret_access_model import SecretAccess
from app.db.models.secret_history_model import SecretHistory
from app.db.models.secret_model import Secret
from app.db.models.session_model import UserSession
from app.db.models.user_model import User

__all__ = [
    "OrganizationDomain",
    "OrganizationInvitation",
    "OrganizationMember",
    "Organization",
    "User",
    "UserSession",
    "Folder",
    "Secret",
    "SecretAccess",
    "ExternalShare",
    "ExpiryNotification",
    "EmailOutbox",
    "ApiToken",
    "ApiTokenGrant",
    "SecretHistory",
    "AuditLog",
]
