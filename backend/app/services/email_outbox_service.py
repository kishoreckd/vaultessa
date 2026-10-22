"""Durable email outbox: record → send → mark sent; retry with backoff after failures or restarts.

Flow: `enqueue` stores the sealed message (own transaction) and the request schedules `deliver` as a
background task. If that never runs (server stopped, SMTP down), `run_loop` picks the row up on the
next poll — including right after the server starts again — until it's sent, expires or gives up.
Rows are locked with SKIP LOCKED, so several app instances never send the same email twice.
"""

import asyncio
import json
import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select

from app.core.config import get_settings
from app.core.security import seal, unseal
from app.db.models.email_outbox_model import EmailOutbox
from app.db.session import SessionLocal
from app.services.email_service import EmailDeliveryResult, send_email

logger = logging.getLogger("vaultessa.email_outbox")
Sender = Callable[..., EmailDeliveryResult | None]


def _backoff(attempts: int) -> timedelta:
    # 1, 2, 4, 8, 16, 32, 60, 60… minutes
    return timedelta(minutes=min(2 ** max(attempts - 1, 0), 60))


def enqueue(
    to: str, subject: str, text: str, html: str | None, category: str, ttl: timedelta | None = None
) -> uuid.UUID:
    now = datetime.now(UTC)
    ttl = ttl or timedelta(hours=get_settings().email_outbox_default_ttl_hours)
    row = EmailOutbox(
        to_address=to,
        category=category,
        payload_enc=seal(json.dumps({"subject": subject, "text": text, "html": html})),
        next_attempt_at=now,
        expires_at=now + ttl,
    )
    with SessionLocal() as db:
        db.add(row)
        db.commit()
    return row.id


def _finish(row: EmailOutbox, status: str, error: str | None = None) -> None:
    row.status = status
    row.payload_enc = None  # never keep codes/links after the outcome is final
    row.last_error = error


def deliver(outbox_id: uuid.UUID, sender: Sender = send_email, now: datetime | None = None) -> str:
    """Attempts one delivery. Returns the row's resulting status ('busy' if another worker holds it)."""
    now = now or datetime.now(UTC)
    with SessionLocal() as db:
        row = db.scalar(
            select(EmailOutbox).where(EmailOutbox.id == outbox_id).with_for_update(skip_locked=True)
        )
        if row is None:
            return "busy"
        if row.status != "pending":
            return row.status
        if row.expires_at <= now:
            _finish(row, "expired", "Not sent before it expired")
        else:
            payload = json.loads(unseal(row.payload_enc or ""))
            result = sender(row.to_address, payload["subject"], payload["text"], payload["html"])
            row.attempts += 1
            # Test doubles may return None; treat that as accepted.
            if result is None or result.status == "accepted":
                row.sent_at = now
                _finish(row, "sent")
            elif row.attempts >= get_settings().email_outbox_max_attempts:
                _finish(row, "failed", result.message[:200])
            else:
                row.last_error = result.message[:200]
                row.next_attempt_at = now + _backoff(row.attempts)
        db.commit()
        return row.status


def run_once(now: datetime | None = None, sender: Sender = send_email) -> dict[str, int]:
    """Retries every due email and prunes old ledger rows."""
    settings = get_settings()
    now = now or datetime.now(UTC)
    with SessionLocal() as db:
        due = db.scalars(
            select(EmailOutbox.id)
            .where(EmailOutbox.status == "pending", EmailOutbox.next_attempt_at <= now)
            .order_by(EmailOutbox.next_attempt_at)
            .limit(50)
        ).all()
        db.execute(
            delete(EmailOutbox).where(
                EmailOutbox.status != "pending",
                EmailOutbox.created_at < now - timedelta(days=settings.email_outbox_retention_days),
            )
        )
        db.commit()
    counts: dict[str, int] = {}
    for outbox_id in due:
        status = deliver(outbox_id, sender, now)
        counts[status] = counts.get(status, 0) + 1
    return counts


async def run_loop(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await asyncio.to_thread(run_once)
        except Exception:
            # No exception payload: it may include connection details or addresses.
            logger.warning("Email outbox retry failed; it will retry at the next interval")
        try:
            await asyncio.wait_for(stop.wait(), timeout=get_settings().email_outbox_poll_seconds)
        except TimeoutError:
            pass
