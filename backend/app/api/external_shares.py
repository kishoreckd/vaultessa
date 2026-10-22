import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response, status

from app.core.config import get_settings
from app.core.deps import Auth, DbSession
from app.core.errors import AppError, error_response
from app.core.rate_limit import RateLimiter
from app.core.schema import ApiModel, RequestModel
from app.db.models.external_share_model import ExternalShare
from app.schemas.external_shares import (
    CreateExternalShareRequest,
    ExternalShareOut,
    OpenShareRequest,
    OpenShareResponse,
    PublicShareInfo,
    ReopenExternalShareRequest,
    UpdateShareLimitsRequest,
)
from app.services import external_shares_service as service
from app.services import notifications_service as notify
from app.services.audit_service import AuditAction, record
from app.services.email_service import email_enabled, send_email
from app.services.email_templates import share_invitation

router = APIRouter(prefix="/external-shares", tags=["external shares"])
public_router = APIRouter(prefix="/public/shares", tags=["public"])
public_limit = RateLimiter("rate_limit_public_share_requests", "public-share")


@router.patch("/{share_id}/limits", response_model=ExternalShareOut)
def update_limits(
    share_id: uuid.UUID, body: UpdateShareLimitsRequest, request: Request, auth: Auth, db: DbSession
):
    share = service.update_limits(db, auth.user_id, share_id, body)
    record(
        db,
        request,
        AuditAction.EXTERNAL_SHARE_LIMITS_UPDATE,
        user_id=auth.user_id,
        target_type="Secret",
        target_id=share.secret_id,
        details={
            "linkId": str(share.id),
            "maxViews": share.max_views,
            "expiresAt": share.expires_at.isoformat(),
        },
    )
    db.commit()
    return service.to_out(share)


class ShareConfig(ApiModel):
    email_enabled: bool


class EmailShareRequest(RequestModel):
    link: str


@router.get("/config", response_model=ShareConfig)
def config(auth: Auth):
    return ShareConfig(email_enabled=email_enabled())


@router.get("", response_model=list[ExternalShareOut])
def list_shares(
    auth: Auth, db: DbSession, secret_id: uuid.UUID | None = Query(default=None, alias="secretId")
):
    return [service.to_out(s) for s in service.list_shares(db, auth.user_id, secret_id)]


@router.post("", response_model=ExternalShareOut, status_code=status.HTTP_201_CREATED)
def create_share(body: CreateExternalShareRequest, request: Request, auth: Auth, db: DbSession):
    share = service.create_share(db, auth.user_id, body)
    record(
        db,
        request,
        AuditAction.EXTERNAL_SHARE_CREATE,
        user_id=auth.user_id,
        target_type="Secret",
        target_id=body.secret_id,
        details={
            "linkId": str(share.id),
            "recipient": body.recipient_email,
            "maxViews": body.max_views,
            "expiresAt": share.expires_at.isoformat(),
            "accessCode": share.code_hash is not None,
            "outsideDomain": service.is_outside_domain(share.owner.email, body.recipient_email),
        },
    )
    db.commit()
    return service.to_out(share)


def _valid_link(link: str, share: ExternalShare) -> bool:
    origins = {o.rstrip("/") for o in [get_settings().app_base_url, *get_settings().cors_origins]}
    return any(link.startswith(f"{origin}/s/{share.id}#") for origin in origins) and len(link) < 2048


@router.post("/{share_id}/email", response_model=ExternalShareOut)
def email_share(
    share_id: uuid.UUID,
    body: EmailShareRequest,
    request: Request,
    background: BackgroundTasks,
    auth: Auth,
    db: DbSession,
):
    """Emails the link (never the access code). The server sees this link only while sending it."""
    share = db.get(ExternalShare, share_id)
    if share is None or share.owner_id != auth.user_id:
        raise AppError.not_found("Link not found")
    if not email_enabled():
        raise AppError.bad_request("Email isn't set up on this server. Copy the link instead.")
    if not share.recipient_email:
        raise AppError.bad_request("This link has no recipient email")
    if service.status_of(share) != "active":
        raise AppError.bad_request("This link is no longer active")
    if not _valid_link(body.link, share):
        raise AppError.bad_request("Invalid link")

    subject, text, html = share_invitation(share, body.link)
    delivery = send_email(share.recipient_email, subject, text, html)
    if delivery.status != "accepted":
        raise AppError(503, "EMAIL_DELIVERY_FAILED", delivery.message)
    record(
        db,
        request,
        AuditAction.EXTERNAL_SHARE_EMAIL,
        user_id=auth.user_id,
        target_type="Secret",
        target_id=share.secret_id,
        details={"linkId": str(share.id), "recipient": share.recipient_email},
    )
    db.commit()
    return service.to_out(share, emailed=True)


@router.post("/{share_id}/reopen", response_model=ExternalShareOut)
def reopen_share(
    share_id: uuid.UUID, body: ReopenExternalShareRequest, request: Request, auth: Auth, db: DbSession
):
    share = service.reopen_share(db, auth.user_id, share_id, body)
    record(
        db,
        request,
        AuditAction.EXTERNAL_SHARE_REOPEN,
        user_id=auth.user_id,
        target_type="Secret",
        target_id=share.secret_id,
        details={
            "linkId": str(share.id),
            "recipient": share.recipient_email,
            "maxViews": share.max_views,
            "expiresAt": share.expires_at.isoformat(),
            "outsideDomain": service.is_outside_domain(share.owner.email, share.recipient_email),
        },
    )
    db.commit()
    return service.to_out(share)


@router.delete("/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_share(share_id: uuid.UUID, request: Request, auth: Auth, db: DbSession) -> Response:
    share = service.revoke_share(db, auth.user_id, share_id)
    record(
        db,
        request,
        AuditAction.EXTERNAL_SHARE_REVOKE,
        user_id=auth.user_id,
        target_type="Secret",
        target_id=share.secret_id,
        details={"linkId": str(share.id)},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Public (no account needed) ────────────────────────────────────────────────


@public_router.get("/{share_id}", response_model=PublicShareInfo, dependencies=[Depends(public_limit)])
def public_info(share_id: uuid.UUID, db: DbSession):
    info = service.public_info(db, share_id)
    db.commit()
    return info


@public_router.post(
    "/{share_id}/open", response_model=OpenShareResponse, dependencies=[Depends(public_limit)]
)
def open_share(
    share_id: uuid.UUID, body: OpenShareRequest, request: Request, background: BackgroundTasks, db: DbSession
):
    share, ciphertext, code_ok = service.open_share(db, share_id, body.code_verifier)
    if not code_ok:
        left = max(get_settings().external_share_max_code_attempts - share.failed_attempts, 0)
        if left == 0:
            record(
                db,
                request,
                AuditAction.EXTERNAL_SHARE_LOCKED,
                user_id=share.owner_id,
                target_type="Secret",
                target_id=share.secret_id,
                details={"linkId": str(share.id)},
            )
        db.commit()
        if left == 0:
            notify.link_locked(background, share.owner, share.recipient_email)
            return error_response(
                AppError(410, "GONE", "Too many wrong codes. This link has been disabled."), background
            )
        raise AppError(401, "INVALID_CODE", f"That access code isn't right. {left} attempts left.")

    record(
        db,
        request,
        AuditAction.EXTERNAL_SHARE_VIEW,
        user_id=share.owner_id,  # shows up in the sender's activity
        target_type="Secret",
        target_id=share.secret_id,
        details={"linkId": str(share.id), "viewedAt": datetime.now(UTC).isoformat()},
    )
    db.commit()
    notify.link_opened(background, share.owner, share.recipient_email, one_time=share.max_views == 1)
    return OpenShareResponse(
        encrypted_data=ciphertext,
        code_salt=share.code_salt,
        views_left=None if share.max_views is None else max(share.max_views - share.view_count, 0),
    )
