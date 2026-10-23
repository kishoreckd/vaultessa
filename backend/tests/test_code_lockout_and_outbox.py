import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.core.config import get_settings
from app.db.models.email_outbox_model import EmailOutbox
from app.db.models.user_model import User
from app.db.session import SessionLocal
from app.services import email_outbox_service as outbox
from app.services import notifications_service as notify
from app.services.email_service import EmailDeliveryResult

from .helpers import register


@pytest.fixture
def mail(monkeypatch):
    messages = []
    monkeypatch.setattr(notify, "email_enabled", lambda: True)
    monkeypatch.setattr(
        notify,
        "send_email",
        lambda to, subject, text, html=None: (
            messages.append({"to": to, "subject": subject, "text": text})
            or EmailDeliveryResult("accepted", "Accepted by test sender")
        ),
    )
    return messages


def _code(messages, email):
    text = next(m["text"] for m in reversed(messages) if m["to"] == email)
    return re.search(r"\b(\d{6})\b", text).group(1)


def _wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


def test_too_many_wrong_codes_blocks_codes_for_the_lockout_period(api, mail):
    user = register(api, "alice", verified=False)
    code = _code(mail, user.email)
    attempts = get_settings().email_code_max_attempts

    for _ in range(attempts - 1):
        wrong = api.post("/api/auth/email/verify-code", json={"email": user.email, "code": _wrong(code)})
        assert wrong.status_code == 400
    blocked = api.post("/api/auth/email/verify-code", json={"email": user.email, "code": _wrong(code)})
    assert blocked.status_code == 429
    assert "blocked for 2 hours" in blocked.json()["message"]

    # Even the right code and a new code are refused while blocked.
    assert (
        api.post("/api/auth/email/verify-code", json={"email": user.email, "code": code}).status_code == 429
    )
    assert api.post("/api/auth/email/request", json={"email": user.email}).status_code == 429

    # Once the block has passed, a new code can be requested and used.
    with SessionLocal() as db:
        db.execute(
            update(User)
            .where(User.email == user.email)
            .values(
                email_verification_locked_until=datetime.now(UTC) - timedelta(seconds=1),
                email_verification_sent_at=None,
            )
        )
        db.commit()
    assert api.post("/api/auth/email/request", json={"email": user.email}).status_code == 202
    fresh = _code(mail, user.email)
    assert (
        api.post("/api/auth/email/verify-code", json={"email": user.email, "code": fresh}).status_code == 200
    )


def test_failed_email_is_kept_and_retried_until_sent(api):
    outbox_id = outbox.enqueue("bob@example.com", "Hello", "Body", None, "security")
    failed = lambda *args: EmailDeliveryResult("failed", "SMTP down")  # noqa: E731

    assert outbox.deliver(outbox_id, failed) == "pending"
    sent: list[str] = []
    later = datetime.now(UTC) + timedelta(hours=1)
    counts = outbox.run_once(
        later, lambda to, *args: sent.append(to) or EmailDeliveryResult("accepted", "Accepted by test sender")
    )

    assert counts == {"sent": 1} and sent == ["bob@example.com"]
    with SessionLocal() as db:
        row = db.scalar(select(EmailOutbox).where(EmailOutbox.id == outbox_id))
        assert row.status == "sent" and row.attempts == 2
        assert row.payload_enc is None  # content wiped once delivered


def test_missing_delivery_result_is_retried_then_fails_at_the_attempt_limit(api):
    outbox_id = outbox.enqueue("bob@example.com", "Hello", "Body", None, "security")
    now = datetime.now(UTC)
    missing_result = lambda *args: None  # noqa: E731
    assert outbox.deliver(outbox_id, missing_result, now) == "pending"
    with SessionLocal() as db:
        row = db.get(EmailOutbox, outbox_id)
        assert row.sent_at is None
        assert row.payload_enc is not None
        assert row.attempts == 1
        assert row.next_attempt_at == now + timedelta(minutes=1)
        assert "did not confirm SMTP acceptance" in row.last_error
        row.attempts = get_settings().email_outbox_max_attempts - 1
        db.commit()
    assert outbox.deliver(outbox_id, missing_result, now + timedelta(minutes=1)) == "failed"
    with SessionLocal() as db:
        row = db.get(EmailOutbox, outbox_id)
        assert row.sent_at is None
        assert row.payload_enc is None
        assert row.attempts == get_settings().email_outbox_max_attempts


def test_stale_code_email_is_not_sent_late(api):
    outbox_id = outbox.enqueue(
        "bob@example.com", "Your code", "123456", None, "security", timedelta(minutes=10)
    )
    sent: list[str] = []
    outbox.run_once(datetime.now(UTC) + timedelta(minutes=11), lambda to, *args: sent.append(to))

    assert sent == []
    with SessionLocal() as db:
        row = db.scalar(select(EmailOutbox).where(EmailOutbox.id == outbox_id))
        assert row.status == "expired" and row.payload_enc is None


def test_emails_from_requests_are_recorded_in_the_outbox(api, mail):
    user = register(api, "carol", verified=False)
    with SessionLocal() as db:
        rows = db.scalars(select(EmailOutbox).where(EmailOutbox.to_address == user.email)).all()
    assert [r.status for r in rows] == ["sent"]
    assert mail[-1]["to"] == user.email
