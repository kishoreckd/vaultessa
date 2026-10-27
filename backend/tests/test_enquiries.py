from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.db.models.enquiry_model import Enquiry
from app.db.session import engine


def payload(**changes):
    return {
        "name": "Demo Visitor",
        "email": "visitor@example.com",
        "category": "teams",
        "message": "I would like to learn about team sharing.",
        "contactConsent": True,
        **changes,
    }


def test_enquiry_is_private_and_returns_only_acknowledgement(api):
    response = api.post("/api/enquiries", json=payload())
    assert response.status_code == 202
    assert response.json()["status"] == "success"
    assert "visitor@example.com" not in response.text
    with Session(engine) as db:
        enquiry = db.scalar(select(Enquiry))
        assert enquiry.name == "Demo Visitor" and enquiry.category == "teams"
        assert len(enquiry.client_hash) == 64 and "testclient" not in enquiry.client_hash
        assert db.scalar(text("SELECT relrowsecurity FROM pg_class WHERE oid='enquiries'::regclass"))
    assert api.get("/api/enquiries").status_code == 405


def test_invalid_enquiry_and_missing_consent_are_rejected(api):
    for changes in [
        {"email": "bad"},
        {"message": "short"},
        {"contactConsent": False},
        {"category": "unknown"},
        {"name": " "},
        {"message": "x" * 4001},
    ]:
        assert api.post("/api/enquiries", json=payload(**changes)).status_code == 400
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Enquiry)) == 0


def test_honeypot_acknowledges_without_storing(api):
    assert api.post("/api/enquiries", json=payload(website="bot.example")).status_code == 202
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Enquiry)) == 0


def test_enquiries_have_database_backed_rate_limit(api):
    for _ in range(3):
        assert api.post("/api/enquiries", json=payload()).status_code == 202
    blocked = api.post("/api/enquiries", json=payload(), headers={"X-Forwarded-For": "another-client"})
    assert blocked.status_code == 429
    assert blocked.json()["data"]["code"] == "RATE_LIMITED"


def test_removed_sms_api_cannot_be_enabled(client):
    assert client.post("/api/account/mfa/sms/enable", json={}).status_code == 404


def test_new_enquiry_emails_the_team_inbox_but_honeypots_do_not(api, monkeypatch):
    from app.services import enquiry_service

    sent = []
    settings = enquiry_service.get_settings().model_copy(update={"enquiry_notify_email": "team@example.com"})
    monkeypatch.setattr(enquiry_service, "get_settings", lambda: settings)
    monkeypatch.setattr(enquiry_service, "email_enabled", lambda: True)
    monkeypatch.setattr(
        enquiry_service, "send_email", lambda to, subject, text, html=None: sent.append((to, subject, text))
    )

    assert api.post("/api/enquiries", json=payload()).status_code == 202
    assert len(sent) == 1
    to, subject, text = sent[0]
    assert to == "team@example.com" and subject.startswith("New enquiry:")
    assert payload()["email"] in text and payload()["message"] in text

    sent.clear()
    assert api.post("/api/enquiries", json=payload(website="bot.example")).status_code == 202
    assert sent == []
