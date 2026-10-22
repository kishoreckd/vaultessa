import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import select

from app.core.deps import Auth, DbSession
from app.core.errors import AppError
from app.core.rate_limit import auth_limit
from app.db.models.organization_domain_model import OrganizationDomain
from app.db.models.organization_invitation_model import OrganizationInvitation
from app.db.models.user_model import User
from app.schemas.organizations import (
    AddDomain,
    ChangeRole,
    CreateOrganization,
    DiscoverableOrganization,
    DomainOut,
    InvitationOut,
    InviteMember,
    MemberOut,
    OrganizationOut,
    TransferOwnership,
    UpdateOrganization,
)
from app.services import organizations_service as service
from app.services.audit_service import AuditAction, record
from app.services.email_service import email_enabled, send_email
from app.services.email_templates import organization_invitation, render, team_membership_changed

router = APIRouter(prefix="/organizations", tags=["organizations"])


def audit(db, request, auth, org_id, action=AuditAction.ORGANIZATION_UPDATE):
    record(db, request, action, user_id=auth.user_id, target_type="Organization", target_id=org_id)


def queue_membership(background, db, target_id, org_name, message):
    user = db.get(User, target_id)
    if user and email_enabled():
        background.add_task(
            send_email, user.email, *render(team_membership_changed(user.name, org_name, message))
        )


@router.get("", response_model=list[OrganizationOut])
def list_organizations(auth: Auth, db: DbSession):
    return service.list_organizations(db, auth.user_id)


@router.post("", response_model=OrganizationOut, status_code=201, dependencies=[Depends(auth_limit)])
def create(body: CreateOrganization, request: Request, auth: Auth, db: DbSession):
    result = service.create(db, auth.user_id, body.name)
    audit(db, request, auth, result.id, AuditAction.ORGANIZATION_CREATE)
    db.commit()
    return result


@router.get("/invitations", response_model=list[InvitationOut])
def pending_invitations(auth: Auth, db: DbSession):
    return service.pending_invitations(db, auth.user_id)


@router.post("/invitations/{invitation_id}/accept", response_model=OrganizationOut)
def accept(invitation_id: uuid.UUID, request: Request, auth: Auth, db: DbSession):
    result = service.accept(db, auth.user_id, invitation_id)
    audit(db, request, auth, result.id, AuditAction.ORGANIZATION_JOIN)
    db.commit()
    return result


@router.get("/discover", response_model=list[DiscoverableOrganization])
def discover(auth: Auth, db: DbSession):
    return service.discover(db, auth.user_id)


@router.post("/{org_id}/join", response_model=OrganizationOut)
def join(org_id: uuid.UUID, request: Request, auth: Auth, db: DbSession):
    result = service.join_domain(db, auth.user_id, org_id)
    audit(db, request, auth, org_id, AuditAction.ORGANIZATION_JOIN)
    db.commit()
    return result


@router.patch("/{org_id}", response_model=OrganizationOut)
def update(org_id: uuid.UUID, body: UpdateOrganization, request: Request, auth: Auth, db: DbSession):
    org, member = service.require_member(db, auth.user_id, org_id, owner=True)
    if body.allow_domain_join and not db.scalar(
        select(OrganizationDomain.id).where(
            OrganizationDomain.organization_id == org_id,
            OrganizationDomain.verified_until > datetime.now(UTC),
        )
    ):
        raise AppError.bad_request("Verify a company domain before enabling domain joining")
    org.name, org.allow_domain_join = body.name, body.allow_domain_join
    audit(db, request, auth, org_id)
    result = service.organization_out(db, org, member.role)
    db.commit()
    return result


@router.get("/{org_id}/members", response_model=list[MemberOut])
def members(org_id: uuid.UUID, auth: Auth, db: DbSession):
    return service.members(db, auth.user_id, org_id)


@router.patch("/{org_id}/members/{user_id}", status_code=204)
def change_role(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    body: ChangeRole,
    request: Request,
    background: BackgroundTasks,
    auth: Auth,
    db: DbSession,
):
    service.change_role(db, auth.user_id, org_id, user_id, body.role)
    org, _ = service.require_member(db, auth.user_id, org_id)
    audit(db, request, auth, org_id, AuditAction.ORGANIZATION_MEMBER_UPDATE)
    db.commit()
    queue_membership(background, db, user_id, org.name, f"Your role is now {body.role.lower()}.")
    return Response(status_code=204)


@router.delete("/{org_id}/members/{user_id}", status_code=204)
def remove_member(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    request: Request,
    background: BackgroundTasks,
    auth: Auth,
    db: DbSession,
):
    org, _ = service.require_member(db, auth.user_id, org_id)
    service.suspend(db, auth.user_id, org_id, user_id)
    audit(db, request, auth, org_id, AuditAction.ORGANIZATION_MEMBER_UPDATE)
    db.commit()
    queue_membership(
        background,
        db,
        user_id,
        org.name,
        "Your membership has been deactivated. Contact the owner if you need to rejoin.",
    )
    return Response(status_code=204)


@router.post("/{org_id}/transfer", status_code=204, dependencies=[Depends(auth_limit)])
def transfer(
    org_id: uuid.UUID,
    body: TransferOwnership,
    request: Request,
    background: BackgroundTasks,
    auth: Auth,
    db: DbSession,
):
    service.transfer(db, auth.user_id, org_id, body.user_id, body.auth_hash)
    org, _ = service.require_member(db, auth.user_id, org_id)
    audit(db, request, auth, org_id, AuditAction.ORGANIZATION_TRANSFER)
    db.commit()
    queue_membership(background, db, body.user_id, org.name, "You are now the organisation owner.")
    queue_membership(
        background, db, auth.user_id, org.name, "You transferred ownership and are now an admin."
    )
    return Response(status_code=204)


@router.get("/{org_id}/invitations", response_model=list[InvitationOut])
def list_invites(org_id: uuid.UUID, auth: Auth, db: DbSession):
    return service.pending_invitations(db, auth.user_id, org_id)


@router.post(
    "/{org_id}/invitations", response_model=InvitationOut, status_code=201, dependencies=[Depends(auth_limit)]
)
def invite(
    org_id: uuid.UUID,
    body: InviteMember,
    request: Request,
    background: BackgroundTasks,
    auth: Auth,
    db: DbSession,
):
    invitation, org, actor = service.invite(db, auth.user_id, org_id, body.email, body.role)
    result = service.invitation_out(db, invitation)
    audit(db, request, auth, org_id, AuditAction.ORGANIZATION_INVITE)
    db.commit()
    if email_enabled():
        background.add_task(
            send_email,
            invitation.email,
            *render(
                organization_invitation(
                    actor.name,
                    org.name,
                    invitation.email,
                    invitation.role,
                    invitation.expires_at,
                    str(invitation.id),
                )
            ),
        )
    return result


@router.delete("/{org_id}/invitations/{invitation_id}", status_code=204)
def revoke_invite(org_id: uuid.UUID, invitation_id: uuid.UUID, request: Request, auth: Auth, db: DbSession):
    _, member = service.require_member(db, auth.user_id, org_id, manage=True)
    invitation = db.get(OrganizationInvitation, invitation_id)
    if not invitation or invitation.organization_id != org_id:
        raise AppError.not_found("Invitation not found")
    if invitation.role == "ADMIN" and member.role != "OWNER":
        raise AppError.forbidden("Only the owner can revoke an admin invitation")
    invitation.revoked_at = datetime.now(UTC)
    audit(db, request, auth, org_id, AuditAction.ORGANIZATION_INVITE)
    db.commit()
    return Response(status_code=204)


@router.get("/{org_id}/domains", response_model=list[DomainOut])
def domains(org_id: uuid.UUID, auth: Auth, db: DbSession):
    service.require_member(db, auth.user_id, org_id, owner=True)
    return [
        service.domain_out(d)
        for d in db.scalars(select(OrganizationDomain).where(OrganizationDomain.organization_id == org_id))
    ]


@router.post("/{org_id}/domains", response_model=DomainOut, status_code=201)
def add_domain(org_id: uuid.UUID, body: AddDomain, request: Request, auth: Auth, db: DbSession):
    result = service.add_domain(db, auth.user_id, org_id, body.domain)
    audit(db, request, auth, org_id, AuditAction.ORGANIZATION_DOMAIN_UPDATE)
    db.commit()
    return result


@router.post(
    "/{org_id}/domains/{domain_id}/verify", response_model=DomainOut, dependencies=[Depends(auth_limit)]
)
def verify_domain(org_id: uuid.UUID, domain_id: uuid.UUID, request: Request, auth: Auth, db: DbSession):
    result = service.verify_domain(db, auth.user_id, org_id, domain_id)
    audit(db, request, auth, org_id, AuditAction.ORGANIZATION_DOMAIN_UPDATE)
    db.commit()
    return result


@router.delete("/{org_id}/domains/{domain_id}", status_code=204)
def remove_domain(org_id: uuid.UUID, domain_id: uuid.UUID, request: Request, auth: Auth, db: DbSession):
    org, _ = service.require_member(db, auth.user_id, org_id, owner=True)
    domain = db.get(OrganizationDomain, domain_id)
    if not domain or domain.organization_id != org_id:
        raise AppError.not_found("Domain not found")
    db.delete(domain)
    org.allow_domain_join = False
    audit(db, request, auth, org_id, AuditAction.ORGANIZATION_DOMAIN_UPDATE)
    db.commit()
    return Response(status_code=204)
