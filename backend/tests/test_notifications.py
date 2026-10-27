import pytest

from app.services import notifications_service as notify
from app.services.email_service import EmailDeliveryResult

from .helpers import create_secret, register, response_data, share


@pytest.fixture
def outbox(monkeypatch):
    sent: list[dict] = []
    monkeypatch.setattr(notify, "email_enabled", lambda: True)
    monkeypatch.setattr(
        notify,
        "send_email",
        lambda to, subject, text, html=None: sent.append({"to": to, "subject": subject, "text": text})
        or EmailDeliveryResult("accepted", "Accepted by test sender"),
    )
    return sent


def test_new_device_sign_in_alert(api, outbox):
    alice = register(api, "alice")
    assert outbox[-1]["subject"] == "Verify your Vaultessa email"
    outbox.clear()
    # same browser that registered → no alert
    api.post("/api/auth/login", json={"email": alice.email, "authHash": alice.auth_hash})
    assert outbox == []
    api.post(
        "/api/auth/login",
        json={"email": alice.email, "authHash": alice.auth_hash},
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0"},
    )
    assert [m["subject"] for m in outbox] == ["New sign-in to your Vaultessa account"]
    assert "Chrome on Windows" in outbox[0]["text"]


def test_lockout_alert(api, outbox):
    alice = register(api, "alice")
    for _ in range(5):
        api.post("/api/auth/login", json={"email": alice.email, "authHash": "d3Jvbmc="})
    assert any(m["subject"].startswith("Your Vaultessa account was temporarily locked") for m in outbox)


def test_sharing_emails_and_opt_out(api, outbox):
    alice, bob = register(api, "alice"), register(api, "bob")
    item = create_secret(api, alice)
    share(api, alice, item["id"], bob, "VIEW")
    assert outbox[-1]["to"] == bob.email and outbox[-1]["subject"] == "Alice shared an item with you"
    # item names are encrypted, so emails never contain them
    assert "ciphertext" not in outbox[-1]["text"]

    # bob turns sharing emails off; the next change is silent
    prefs = api.put("/api/account/notifications", json={"sharing": False, "links": True}, headers=bob.headers)
    assert response_data(prefs) == {"sharing": False, "links": True, "expiry": True}
    before = len(outbox)
    api.patch(
        f"/api/secrets/{item['id']}/shares/{bob.id}", json={"permission": "MODIFY"}, headers=alice.headers
    )
    assert len(outbox) == before

    # security alerts can't be turned off
    api.post(
        "/api/auth/login",
        json={"email": bob.email, "authHash": bob.auth_hash},
        headers={"User-Agent": "Mozilla/5.0 (Macintosh; Mac OS X) Safari/605.1"},
    )
    assert outbox[-1]["to"] == bob.email and "New sign-in" in outbox[-1]["subject"]


def test_recovery_code_use_emails_codes_left_and_asks_to_replace_when_low(api, outbox):
    from .test_mfa import _enable_totp, _login

    alice = register(api, "alice")
    _, codes, _ = _enable_totp(api, alice)
    for used, code in enumerate(codes[:5], start=1):
        token = response_data(_login(api, alice))["mfaToken"]
        outbox.clear()
        signed_in = api.post(
            "/api/auth/login/mfa", json={"mfaToken": token, "method": "recovery", "code": code}
        )
        assert signed_in.status_code == 200
        left = 10 - used
        mail = next(m for m in outbox if m["subject"].startswith("A recovery code was used"))
        assert mail["to"] == alice.email and f"{left} recovery codes left" in mail["subject"]
        # From 5 left onwards the email asks to replace the codes.
        assert ("running low" in mail["text"]) == (left <= 5)
