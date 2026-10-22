"""Email-verified team membership. Membership never grants personal vault access."""

import json
import secrets
import shlex
import uuid
from datetime import UTC, datetime, timedelta
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.orm import Session

from app.constants.organization import OrganizationRole as Role
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.models.organization_domain_model import OrganizationDomain as Domain
from app.db.models.organization_invitation_model import OrganizationInvitation as Invitation
from app.db.models.organization_member_model import OrganizationMember as Member
from app.db.models.organization_model import Organization
from app.db.models.secret_access_model import SecretAccess
from app.db.models.user_model import User
from app.schemas.organizations import DomainOut, InvitationOut, MemberOut, OrganizationOut
from app.services.account_service import require_master_password


def verified_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if not user or not user.email_verified:
        raise AppError.forbidden("Verify your email address in Settings before managing or joining a team")
    return user


def require_member(
    db: Session, user_id: uuid.UUID, org_id: uuid.UUID, *, manage: bool = False, owner: bool = False
):
    # All membership changes lock the organisation first, serializing invitations, role changes and ownership.
    org = db.scalar(select(Organization).where(Organization.id == org_id).with_for_update())
    member = db.get(Member, (org_id, user_id))
    if not org or not member or not member.is_active:
        raise AppError.not_found("Organisation not found")
    if owner and member.role != Role.OWNER:
        raise AppError.forbidden("Only the owner can do this")
    if manage and member.role not in {Role.OWNER, Role.ADMIN}:
        raise AppError.forbidden("Only an owner or admin can do this")
    return org, member


def organization_out(db: Session, org: Organization, role: str) -> OrganizationOut:
    count = db.scalar(
        select(func.count()).select_from(Member).where(Member.organization_id == org.id, Member.is_active)
    )
    return OrganizationOut(
        id=org.id, name=org.name, role=role, allow_domain_join=org.allow_domain_join, member_count=count
    )


def list_organizations(db: Session, user_id: uuid.UUID) -> list[OrganizationOut]:
    rows = db.execute(
        select(Organization, Member.role)
        .join(Member)
        .where(Member.user_id == user_id, Member.is_active)
        .order_by(Organization.name)
    )
    return [organization_out(db, org, role) for org, role in rows]


def create(db: Session, user_id: uuid.UUID, name: str) -> OrganizationOut:
    verified_user(db, user_id)
    org = Organization(name=name)
    db.add(org)
    db.flush()
    db.add(Member(organization_id=org.id, user_id=user_id, role=Role.OWNER))
    db.flush()
    return organization_out(db, org, Role.OWNER)


def members(db: Session, user_id: uuid.UUID, org_id: uuid.UUID) -> list[MemberOut]:
    require_member(db, user_id, org_id)
    rows = db.execute(
        select(Member, User).join(User).where(Member.organization_id == org_id).order_by(User.name)
    )
    return [
        MemberOut(
            user_id=u.id,
            name=u.name,
            email=u.email,
            role=m.role,
            is_active=m.is_active,
            joined_at=m.joined_at,
        )
        for m, u in rows
    ]


def invitation_out(db: Session, invite: Invitation) -> InvitationOut:
    return InvitationOut(
        id=invite.id,
        organization_id=invite.organization_id,
        organization_name=db.get(Organization, invite.organization_id).name,
        email=invite.email,
        role=invite.role,
        expires_at=invite.expires_at,
    )


def pending_invitations(db: Session, user_id: uuid.UUID, org_id: uuid.UUID | None = None):
    if org_id:
        require_member(db, user_id, org_id, manage=True)
        query = select(Invitation).where(Invitation.organization_id == org_id)
    else:
        user = verified_user(db, user_id)
        query = select(Invitation).where(Invitation.email == user.email)
    query = query.where(
        Invitation.accepted_at.is_(None),
        Invitation.revoked_at.is_(None),
        Invitation.expires_at > datetime.now(UTC),
    )
    return [invitation_out(db, i) for i in db.scalars(query.order_by(Invitation.created_at))]


def invite(db: Session, user_id: uuid.UUID, org_id: uuid.UUID, email: str, role: str):
    actor = verified_user(db, user_id)
    org, member = require_member(db, user_id, org_id, manage=True)
    if role == Role.ADMIN and member.role != Role.OWNER:
        raise AppError.forbidden("Only the owner can invite admins")
    target = db.scalar(select(User).where(User.email == email))
    existing = db.get(Member, (org_id, target.id)) if target else None
    if existing and existing.is_active:
        raise AppError.conflict("This person is already a member")
    now = datetime.now(UTC)
    invitation = db.scalar(
        select(Invitation).where(Invitation.organization_id == org_id, Invitation.email == email)
    )
    if (
        invitation
        and (now - invitation.created_at).total_seconds()
        < get_settings().organization_invitation_cooldown_seconds
    ):
        raise AppError.rate_limited()
    if not invitation:
        invitation = Invitation(organization_id=org_id, email=email)
        db.add(invitation)
    invitation.role = role
    invitation.invited_by_id = user_id
    invitation.created_at = now
    invitation.expires_at = now + timedelta(days=get_settings().organization_invitation_ttl_days)
    invitation.accepted_at = invitation.revoked_at = None
    db.flush()
    return invitation, org, actor


def ensure_capacity(db: Session, org_id: uuid.UUID):
    count = db.scalar(
        select(func.count()).select_from(Member).where(Member.organization_id == org_id, Member.is_active)
    )
    if count >= get_settings().organization_max_members:
        raise AppError.conflict("This organisation has reached its member limit")


def accept(db: Session, user_id: uuid.UUID, invitation_id: uuid.UUID) -> OrganizationOut:
    user = verified_user(db, user_id)
    invitation = db.get(Invitation, invitation_id)
    if not invitation or invitation.email != user.email:
        raise AppError.not_found("Invitation not found")
    org = db.scalar(
        select(Organization).where(Organization.id == invitation.organization_id).with_for_update()
    )
    db.refresh(invitation)
    if invitation.accepted_at or invitation.revoked_at or invitation.expires_at <= datetime.now(UTC):
        raise AppError.bad_request("This invitation expired or was already used. Ask for a new invitation")
    member = db.get(Member, (org.id, user_id))
    if member and member.is_active:
        raise AppError.conflict("You are already a member")
    ensure_capacity(db, org.id)
    # An invitation from a former admin must not remain usable after their removal.
    inviter = db.get(Member, (org.id, invitation.invited_by_id)) if invitation.invited_by_id else None
    if (
        not inviter
        or not inviter.is_active
        or inviter.role not in {Role.OWNER, Role.ADMIN}
        or (invitation.role == Role.ADMIN and inviter.role != Role.OWNER)
    ):
        raise AppError.bad_request("The inviter no longer has permission. Ask the owner for a new invitation")
    if member:
        member.is_active, member.role = True, invitation.role
    else:
        db.add(Member(organization_id=org.id, user_id=user_id, role=invitation.role))
    invitation.accepted_at = datetime.now(UTC)
    db.flush()
    return organization_out(db, org, invitation.role)


def change_role(db: Session, user_id: uuid.UUID, org_id: uuid.UUID, target_id: uuid.UUID, role: str):
    require_member(db, user_id, org_id, owner=True)
    target = db.get(Member, (org_id, target_id))
    if not target or not target.is_active:
        raise AppError.not_found("Member not found")
    if target.role == Role.OWNER:
        raise AppError.bad_request("Transfer ownership before changing the owner's role")
    target.role = role


def suspend(db: Session, user_id: uuid.UUID, org_id: uuid.UUID, target_id: uuid.UUID):
    _, actor = require_member(db, user_id, org_id)
    target = db.get(Member, (org_id, target_id))
    if not target or not target.is_active:
        raise AppError.not_found("Member not found")
    if target.role == Role.OWNER:
        raise AppError.bad_request("Transfer ownership before leaving the organisation")
    if target_id != user_id and (
        actor.role == Role.MEMBER or (actor.role == Role.ADMIN and target.role != Role.MEMBER)
    ):
        raise AppError.forbidden("You cannot remove this member")
    target.is_active = False
    # Only explicitly team-scoped grants are removed. Personal shares and owned items are preserved.
    db.execute(
        delete(SecretAccess).where(
            SecretAccess.organization_id == org_id,
            or_(SecretAccess.user_id == target_id, SecretAccess.granted_by_id == target_id),
        )
    )
    # Keep an inactive membership to prevent silent rejoining through a verified domain.
    for invitation in db.scalars(
        select(Invitation).where(
            Invitation.organization_id == org_id,
            Invitation.invited_by_id == target_id,
            Invitation.accepted_at.is_(None),
        )
    ):
        invitation.revoked_at = datetime.now(UTC)


def transfer(db: Session, user_id: uuid.UUID, org_id: uuid.UUID, target_id: uuid.UUID, auth_hash: str):
    user = verified_user(db, user_id)
    require_master_password(user, auth_hash)
    _, owner = require_member(db, user_id, org_id, owner=True)
    target = db.get(Member, (org_id, target_id))
    if not target or not target.is_active or target_id == user_id:
        raise AppError.bad_request("Choose another active member")
    owner.role, target.role = Role.ADMIN, Role.OWNER


def domain_out(domain: Domain) -> DomainOut:
    return DomainOut(
        id=domain.id,
        domain=domain.domain,
        txt_name="_vaultessa-verification." + domain.domain,
        txt_value=domain.verification_code,
        verified_until=domain.verified_until,
    )


def add_domain(db: Session, user_id: uuid.UUID, org_id: uuid.UUID, domain: str):
    require_member(db, user_id, org_id, owner=True)
    existing = db.scalar(select(Domain).where(Domain.organization_id == org_id, Domain.domain == domain))
    if existing:
        return domain_out(existing)
    row = Domain(
        organization_id=org_id,
        domain=domain,
        verification_code="vaultessa-verification=" + secrets.token_urlsafe(32),
    )
    db.add(row)
    db.flush()
    return domain_out(row)


def resolve_txt(name: str) -> list[str]:
    settings = get_settings()
    url = settings.organization_dns_resolver_url + "?" + urlencode({"name": name, "type": "TXT"})
    request = Request(url, headers={"Accept": "application/dns-json"})  # noqa: S310 -- HTTPS resolver from Settings
    try:
        with urlopen(request, timeout=settings.organization_dns_timeout_seconds) as response:  # noqa: S310 -- configured HTTPS resolver, query values encoded
            payload = json.loads(response.read(65536))
        if payload.get("Status") != 0 or payload.get("TC"):
            return []
        return [
            "".join(shlex.split(row["data"])) for row in payload.get("Answer", []) if row.get("type") == 16
        ]
    except (URLError, OSError, ValueError, KeyError, TypeError, AttributeError):
        raise AppError(
            503, "DNS_LOOKUP_FAILED", "DNS verification is unavailable. Please try again"
        ) from None


def verify_domain(db: Session, user_id: uuid.UUID, org_id: uuid.UUID, domain_id: uuid.UUID):
    require_member(db, user_id, org_id, owner=True)
    domain = db.get(Domain, domain_id)
    if not domain or domain.organization_id != org_id:
        raise AppError.not_found("Domain not found")
    if domain.verification_code not in resolve_txt("_vaultessa-verification." + domain.domain):
        raise AppError.bad_request(
            "The DNS TXT record does not match yet. Check the record and allow time for DNS updates"
        )
    # Cross-organisation claims of the same domain are serialized without blocking unrelated domains.
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:domain))"), {"domain": domain.domain})
    now = datetime.now(UTC)
    other = db.scalar(
        select(Domain).where(
            Domain.domain == domain.domain, Domain.organization_id != org_id, Domain.verified_until > now
        )
    )
    if other:
        raise AppError.conflict("This domain is already verified by another organisation")
    domain.verified_at = now
    domain.verified_until = now + timedelta(days=get_settings().organization_domain_verification_days)
    return domain_out(domain)


def discover(db: Session, user_id: uuid.UUID):
    user = verified_user(db, user_id)
    domain = user.email.rsplit("@", 1)[-1].lower()
    rows = db.execute(
        select(Organization, Domain)
        .join(Domain)
        .where(
            Organization.allow_domain_join, Domain.domain == domain, Domain.verified_until > datetime.now(UTC)
        )
    )
    return [
        {"id": o.id, "name": o.name, "domain": d.domain}
        for o, d in rows
        if db.get(Member, (o.id, user_id)) is None
    ]


def join_domain(db: Session, user_id: uuid.UUID, org_id: uuid.UUID):
    user = verified_user(db, user_id)
    org = db.scalar(select(Organization).where(Organization.id == org_id).with_for_update())
    domain = db.scalar(
        select(Domain).where(
            Domain.organization_id == org_id,
            Domain.domain == user.email.rsplit("@", 1)[-1],
            Domain.verified_until > datetime.now(UTC),
        )
    )
    if not org or not org.allow_domain_join or not domain:
        raise AppError.not_found("No organisation available for your verified email domain")
    if db.get(Member, (org_id, user_id)):
        raise AppError.conflict("You already have a membership record. Ask an admin for an invitation")
    ensure_capacity(db, org_id)
    db.add(Member(organization_id=org_id, user_id=user_id, role=Role.MEMBER))
    db.flush()
    return organization_out(db, org, Role.MEMBER)
