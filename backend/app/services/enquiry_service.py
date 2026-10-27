import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from fastapi import BackgroundTasks
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.models.enquiry_model import Enquiry
from app.schemas.enquiries import EnquiryRequest
from app.services import email_outbox_service
from app.services.email_service import email_enabled, send_email
from app.services.email_templates import EmailContent, render


def save_enquiry(db: Session, body: EnquiryRequest, client_ip: str) -> bool:
    """Stores the enquiry. Returns False for discarded (honeypot) submissions."""
    # Bots receive the same acknowledgement, but their honeypot submissions are discarded.
    if body.website:
        return False
    settings = get_settings()
    client_hash = hmac.new(
        settings.jwt_access_secret.encode(), f"enquiry:{client_ip}".encode(), hashlib.sha256
    ).hexdigest()
    # Transaction-scoped lock + database counts enforce the limit across serverless instances.
    lock_key = int.from_bytes(bytes.fromhex(client_hash)[:8], "big", signed=True)
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.enquiry_rate_limit_window_seconds)
    recent = (
        db.scalar(
            select(func.count())
            .select_from(Enquiry)
            .where(Enquiry.client_hash == client_hash, Enquiry.created_at >= cutoff)
        )
        or 0
    )
    if recent >= settings.enquiry_rate_limit_requests:
        raise AppError(429, "RATE_LIMITED", "Too many enquiries. Please try again later.")
    db.add(
        Enquiry(
            name=body.name,
            email=body.email,
            category=body.category,
            message=body.message,
            client_hash=client_hash,
        )
    )
    db.commit()
    return True


CATEGORY_LABELS = {
    "general": "General question",
    "teams": "Vaultessa for teams",
    "feedback": "Feedback or an idea",
}


def notify_team(background: BackgroundTasks, body: EnquiryRequest) -> None:
    """Emails the configured team inbox through the retrying outbox (no-op when not configured)."""
    to = get_settings().enquiry_notify_email
    if not to or not email_enabled():
        return
    topic = CATEGORY_LABELS.get(body.category, body.category)
    reply = "mailto:" + quote(body.email, safe="@") + "?subject=" + quote("Re: Your Vaultessa enquiry")
    subject, text, html = render(
        EmailContent(
            subject=f"New enquiry: {topic} — {body.name}",
            heading="New enquiry from the website",
            preheader=f"{body.name} ({body.email}) sent a message.",
            paragraphs=[f"{body.name} sent a message through the Vaultessa contact form:", body.message],
            details=[("Name", body.name), ("Email", body.email), ("Topic", topic)],
            button=(f"Reply to {body.name}", reply),
            footnote="You're receiving this because this inbox handles Vaultessa website enquiries.",
        )
    )
    try:
        outbox_id = email_outbox_service.enqueue(to, subject, text, html, "enquiry")
    except Exception:
        background.add_task(send_email, to, subject, text, html)
        return
    background.add_task(email_outbox_service.deliver, outbox_id, send_email)
