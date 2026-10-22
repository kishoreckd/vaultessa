from datetime import UTC, datetime, timedelta

from app.services import email_jobs
from app.services.email_service import EmailDeliveryResult

from .helpers import create_secret, register


def test_expiry_stages_are_deduplicated_and_owner_only(api, monkeypatch):
    owner = register(api, "owner")
    now = datetime.now(UTC)
    create_secret(api, owner, expiresAt=(now + timedelta(days=6)).isoformat())
    sent = []
    monkeypatch.setattr(email_jobs, "email_enabled", lambda: True)

    def accept(to, subject, text, html):
        sent.append((to, subject, text))
        return EmailDeliveryResult("accepted", "Accepted")

    monkeypatch.setattr(email_jobs, "send_email", accept)
    assert email_jobs.run_once(now)["accepted"] == 1
    assert email_jobs.run_once(now)["accepted"] == 0
    assert email_jobs.run_once(now + timedelta(days=5, hours=1))["accepted"] == 1
    assert email_jobs.run_once(now + timedelta(days=7))["accepted"] == 1
    assert email_jobs.run_once(now + timedelta(days=8))["accepted"] == 0
    assert all(to == owner.email and "ciphertext" not in text for to, _, text in sent)


def test_failed_expiry_mail_retries_and_opt_out_prevents_sending(api, monkeypatch):
    owner = register(api, "owner")
    now = datetime.now(UTC)
    create_secret(api, owner, expiresAt=now.isoformat())
    monkeypatch.setattr(email_jobs, "email_enabled", lambda: True)
    monkeypatch.setattr(email_jobs, "send_email", lambda *args: EmailDeliveryResult("failed", "Failed"))
    assert email_jobs.run_once(now)["failed"] == 1
    assert email_jobs.run_once(now)["failed"] == 1
    response = api.put(
        "/api/account/notifications",
        json={"sharing": True, "links": True, "expiry": False},
        headers=owner.headers,
    )
    assert response.status_code == 200
    assert email_jobs.run_once(now) == {"accepted": 0, "failed": 0}
