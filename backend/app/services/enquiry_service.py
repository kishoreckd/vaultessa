import hashlib
import hmac
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.models.enquiry_model import Enquiry
from app.schemas.enquiries import EnquiryRequest


def save_enquiry(db: Session, body: EnquiryRequest, client_ip: str) -> None:
    # Bots receive the same acknowledgement, but their honeypot submissions are discarded.
    if body.website:
        return
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
