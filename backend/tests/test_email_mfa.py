import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.db.models.user_model import User
from app.db.session import SessionLocal
from app.services import notifications_service as notify

from .helpers import b64, register, response_data


@pytest.fixture
def codes(monkeypatch):
    sent: list[str] = []
    monkeypatch.setattr(notify, "sign_in_code", lambda background, user, code: sent.append(code))
    return sent


def _login(api, user):
    return api.post("/api/auth/login", json={"email": user.email, "authHash": user.auth_hash})


def _enable(api, user) -> list[str]:
    enabled = api.post("/api/account/mfa/email/enable", headers=user.headers)
    assert enabled.status_code == 200, enabled.text
    return response_data(enabled)["recoveryCodes"]


def _rewind_cooldown(user):
    with SessionLocal() as db:
        db.get(User, uuid.UUID(user.id)).mfa_email_code_sent_at = datetime.now(UTC) - timedelta(minutes=5)
        db.commit()


def test_email_codes_need_a_verified_email(api):
    user = register(api, "unverified", verified=False)
    refused = api.post("/api/account/mfa/email/enable", headers=user.headers)
    assert refused.status_code == 400


def test_email_code_sign_in_is_single_use(api, codes):
    alice = register(api, "alice")
    recovery = _enable(api, alice)
    assert len(recovery) == 10
    overview = response_data(api.get("/api/account/security", headers=alice.headers))
    assert overview["emailMfaEnabled"] is True and overview["totpEnabled"] is False

    challenge = response_data(_login(api, alice))
    assert challenge["methods"] == ["email", "recovery"] and challenge["emailCodeSent"] is True
    assert "accessToken" not in challenge and len(codes) == 1
    body = {"mfaToken": challenge["mfaToken"], "method": "email", "code": codes[0]}
    assert api.post("/api/auth/login/mfa", json={**body, "code": "000000"}).status_code == 401
    assert api.post("/api/auth/login/mfa", json=body).status_code == 200
    assert api.post("/api/auth/login/mfa", json=body).status_code == 401  # used


def test_resend_is_throttled_and_replaces_the_code(api, codes):
    alice = register(api, "alice")
    _enable(api, alice)
    token = response_data(_login(api, alice))["mfaToken"]
    assert api.post("/api/auth/login/mfa/email", json={"mfaToken": token}).status_code == 429
    _rewind_cooldown(alice)
    assert api.post("/api/auth/login/mfa/email", json={"mfaToken": token}).status_code == 202
    first, latest = codes
    old = api.post("/api/auth/login/mfa", json={"mfaToken": token, "method": "email", "code": first})
    assert old.status_code == 401 or first == latest
    ok = api.post("/api/auth/login/mfa", json={"mfaToken": token, "method": "email", "code": latest})
    assert ok.status_code == 200


def test_expired_code_and_disable(api, codes):
    alice = register(api, "alice")
    _enable(api, alice)
    token = response_data(_login(api, alice))["mfaToken"]
    with SessionLocal() as db:
        db.get(User, uuid.UUID(alice.id)).mfa_email_code_expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    expired = api.post("/api/auth/login/mfa", json={"mfaToken": token, "method": "email", "code": codes[0]})
    assert expired.status_code == 401

    wrong = api.post(
        "/api/account/mfa/disable", json={"method": "email", "authHash": b64("wrong")}, headers=alice.headers
    )
    assert wrong.status_code == 401
    ok = api.post(
        "/api/account/mfa/disable",
        json={"method": "email", "authHash": alice.auth_hash},
        headers=alice.headers,
    )
    assert ok.status_code == 204
    assert "accessToken" in response_data(_login(api, alice))


def test_authenticator_users_request_email_codes_only_when_both_are_on(api, codes):
    alice = register(api, "alice")
    from app.core import totp

    secret = response_data(api.post("/api/account/mfa/totp/setup", headers=alice.headers))["secret"]
    import time

    from app.core.config import get_settings

    counter = int(time.time() // get_settings().totp_period_seconds)
    api.post(
        "/api/account/mfa/totp/enable", json={"code": totp.code_at(secret, counter)}, headers=alice.headers
    )
    _enable(api, alice)
    challenge = response_data(_login(api, alice))
    assert challenge["methods"] == ["totp", "email", "recovery"] and challenge["emailCodeSent"] is False
    assert codes == []
