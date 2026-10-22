"""Periodic owner-only expiry reminders, with a per-date/stage SMTP acceptance ledger."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, exists, func, select

from app.core.config import get_settings
from app.db.models.expiry_notification_model import ExpiryNotification
from app.db.models.secret_model import Secret
from app.db.models.user_model import User
from app.db.session import SessionLocal
from app.services.email_service import email_enabled, send_email
from app.services.email_templates import expiry_reminder, render

logger = logging.getLogger("vaultessa.email_jobs")


def run_once(now: datetime | None = None) -> dict[str, int]:
    counts = {"accepted": 0, "failed": 0}
    if not email_enabled():
        return counts
    now = now or datetime.now(UTC)
    stage = case(
        (Secret.expires_at <= now, "expired"),
        (Secret.expires_at <= now + timedelta(days=1), "1_day"),
        else_="7_days",
    )
    already_sent = exists(
        select(ExpiryNotification.id).where(
            ExpiryNotification.secret_id == Secret.id,
            ExpiryNotification.expires_at == Secret.expires_at,
            ExpiryNotification.stage == stage,
        )
    )
    with SessionLocal() as db:
        rows = db.execute(
            select(Secret, User, stage.label("stage"))
            .join(User, User.id == Secret.owner_id)
            .where(
                Secret.expires_at.is_not(None),
                Secret.expires_at <= now + timedelta(days=7),
                func.coalesce(User.notification_prefs["expiry"].as_boolean(), True).is_(True),
                ~already_sent,
            )
            .order_by(Secret.expires_at)
            .limit(get_settings().expiry_reminder_batch_size)
            .with_for_update(of=Secret, skip_locked=True)
        )
        for secret, owner, current_stage in rows:
            content = expiry_reminder(
                secret.expires_at,
                current_stage,
                get_settings().app_base_url.rstrip("/") + f"/?item={secret.id}",
            )
            subject, text, html = render(content)
            result = send_email(owner.email, subject, text, html)
            if result.status == "accepted":
                db.add(
                    ExpiryNotification(
                        secret_id=secret.id,
                        user_id=owner.id,
                        expires_at=secret.expires_at,
                        stage=current_stage,
                    )
                )
                counts["accepted"] += 1
            else:
                counts["failed"] += 1
        db.commit()
    return counts


async def run_loop(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await asyncio.to_thread(run_once)
        except Exception:
            # No exception payload: it may include connection details.
            logger.warning("Expiry reminder scan failed; it will retry at the next interval")
        try:
            await asyncio.wait_for(stop.wait(), timeout=get_settings().expiry_reminder_poll_seconds)
        except TimeoutError:
            pass
