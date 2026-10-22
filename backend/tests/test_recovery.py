import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import get_settings
from app.db.models.user_model import User
from app.db.session import SessionLocal
from app.services import notifications_service as notify

from .helpers import ENC, ENC_2, b64, create_secret, register


@pytest.fixture
def mail(monkeypatch):
    messages = []
    monkeypatch.setattr(notify, "email_enabled", lambda: True)
    monkeypatch.setattr(
        notify,
        "send_email",
        lambda to, subject, text, html=None: messages.append(
            {"to": to, "subject": subject, "text": text, "html": html}
        ),
    )
    return messages


def _token(messages, subject, email):
    message = next(
        message for message in reversed(messages) if message["subject"] == subject and message["to"] == email
    )
    return re.search(r"#token=([A-Za-z0-9_-]{43})", message["text"]).group(1)


def _verified(api, mail, name="alice"):
    user = register(api, name)
    token = _token(mail, "Verify your Vaultessa email", user.email)
    result = api.post("/api/auth/email/verify", json={"token": token})
    assert result.status_code == 200, result.text
    return user


def _enabled(api, mail):
    user = _verified(api, mail)
    response = api.put(
        "/api/account/recovery",
        headers=user.headers,
        json={
            "authHash": user.auth_hash,
            "recoveryAuth": b64("independent-recovery-proof"),
            "wrappedVaultKey": ENC,
        },
    )
    assert response.status_code == 204, response.text
    return user


def _request_reset(api, user, mail):
    assert api.post("/api/auth/recovery/request", json={"email": user.email}).status_code == 202
    return _token(mail, "Recover your Vaultessa account", user.email)


def _reset_body(token):
    return {
        "token": token,
        "recoveryAuth": b64("independent-recovery-proof"),
        "newAuthHash": b64("new-auth-proof"),
        "kdfSalt": b64("fresh-client-salt"),
        "kdfIterations": 600000,
        "protectedVaultKey": ENC_2,
    }


def test_signup_verification_and_welcome_are_single_use(api, mail):
    user = register(api, "alice")
    assert api.get("/api/auth/me", headers=user.headers).json()["emailVerified"] is False
    token = _token(mail, "Verify your Vaultessa email", user.email)
    assert api.post("/api/auth/email/verify", json={"token": token}).status_code == 200
    assert api.get("/api/auth/me", headers=user.headers).json()["emailVerified"] is True
    assert api.post("/api/auth/email/verify", json={"token": token}).status_code == 400
    assert sum(message["subject"] == "Welcome to Vaultessa" for message in mail) == 1
    with SessionLocal() as db:
        user_row = db.get(User, uuid.UUID(user.id))
        assert user_row.email_verification_hash is None


def test_requests_do_not_disclose_account_and_resends_are_throttled(api, mail):
    user = register(api, "alice")
    expected = api.post("/api/auth/email/request", json={"email": "unknown@example.com"})
    count = len(mail)
    actual = api.post("/api/auth/email/request", json={"email": user.email})
    assert actual.status_code == expected.status_code == 202 and actual.json() == expected.json()
    assert len(mail) == count  # signup just sent a verification link
    eligible = api.post("/api/auth/recovery/request", json={"email": user.email})
    unknown = api.post("/api/auth/recovery/request", json={"email": "unknown@example.com"})
    assert eligible.status_code == unknown.status_code == 202 and eligible.json() == unknown.json()
    assert len(mail) == count  # unverified and no vault recovery key


def test_expired_verification_and_new_link_invalidates_old(api, mail):
    user = register(api, "alice")
    old = _token(mail, "Verify your Vaultessa email", user.email)
    with SessionLocal() as db:
        row = db.get(User, uuid.UUID(user.id))
        row.email_verification_expires_at = datetime.now(UTC) - timedelta(seconds=1)
        row.email_verification_sent_at = datetime.now(UTC) - timedelta(minutes=2)
        db.commit()
    assert api.post("/api/auth/email/verify", json={"token": old}).status_code == 400
    api.post("/api/auth/email/request", json={"email": user.email})
    new = _token(mail, "Verify your Vaultessa email", user.email)
    assert new != old
    assert api.post("/api/auth/email/verify", json={"token": old}).status_code == 400
    assert api.post("/api/auth/email/verify", json={"token": new}).status_code == 200


def test_recovery_setup_requires_verified_email_and_password(api, mail):
    user = register(api, "alice")
    body = {"authHash": user.auth_hash, "recoveryAuth": b64("proof"), "wrappedVaultKey": ENC}
    assert api.put("/api/account/recovery", json=body).status_code == 401
    assert api.put("/api/account/recovery", json=body, headers=user.headers).status_code == 400
    token = _token(mail, "Verify your Vaultessa email", user.email)
    api.post("/api/auth/email/verify", json={"token": token})
    assert (
        api.put(
            "/api/account/recovery", json={**body, "authHash": b64("wrong")}, headers=user.headers
        ).status_code
        == 401
    )
    assert api.put("/api/account/recovery", json=body, headers=user.headers).status_code == 204
    assert api.get("/api/account/recovery", headers=user.headers).json()["recoveryEnabled"] is True
    assert (
        api.post(
            "/api/account/recovery/disable", json={"authHash": b64("wrong")}, headers=user.headers
        ).status_code
        == 401
    )
    assert (
        api.post(
            "/api/account/recovery/disable", json={"authHash": user.auth_hash}, headers=user.headers
        ).status_code
        == 204
    )
    assert api.get("/api/account/recovery", headers=user.headers).json()["recoveryEnabled"] is False


def test_recovery_preserves_items_revokes_sessions_tokens_and_consumes_key(api, mail):
    user = _enabled(api, mail)
    item = create_secret(api, user)
    token_metadata = api.post(
        "/api/tokens",
        headers=user.headers,
        json={
            "name": "CI",
            "authKey": b64("machine-proof"),
            "ownerKey": ENC,
            "grants": [{"secretId": item["id"], "wrappedKey": ENC}],
        },
    ).json()
    link_token = _request_reset(api, user, mail)
    inspect = api.post("/api/auth/recovery/inspect", json={"token": link_token})
    assert inspect.json() == {"wrappedVaultKey": ENC}
    assert (
        api.post(
            "/api/auth/recovery/reset", json={**_reset_body(link_token), "masterPassword": "must-be-rejected"}
        ).status_code
        == 400
    )
    response = api.post("/api/auth/recovery/reset", json=_reset_body(link_token))
    assert response.status_code == 200, response.text
    assert "accessToken" not in response.json()
    assert api.get("/api/secrets", headers=user.headers).status_code == 401
    assert api.post("/api/auth/recovery/reset", json=_reset_body(link_token)).status_code == 400
    assert (
        api.post("/api/auth/login", json={"email": user.email, "authHash": user.auth_hash}).status_code == 401
    )
    login = api.post("/api/auth/login", json={"email": user.email, "authHash": b64("new-auth-proof")})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    assert api.get("/api/secrets", headers=headers).json()[0]["encryptedData"] == item["encryptedData"]
    assert api.get("/api/account/recovery", headers=headers).json()["recoveryEnabled"] is False
    assert (
        next(
            row for row in api.get("/api/tokens", headers=headers).json() if row["id"] == token_metadata["id"]
        )["status"]
        == "revoked"
    )
    assert any(message["subject"] == "Your Vaultessa account was recovered" for message in mail)


def test_expiry_wrong_proof_attempt_limit_and_disable_invalidate_links(api, mail):
    user = _enabled(api, mail)
    token = _request_reset(api, user, mail)
    for _ in range(5):
        assert (
            api.post(
                "/api/auth/recovery/reset", json={**_reset_body(token), "recoveryAuth": b64("wrong")}
            ).status_code
            == 400
        )
    assert api.post("/api/auth/recovery/inspect", json={"token": token}).status_code == 400
    with SessionLocal() as db:
        row = db.get(User, uuid.UUID(user.id))
        row.password_reset_sent_at = datetime.now(UTC) - timedelta(minutes=2)
        db.commit()
    token = _request_reset(api, user, mail)
    with SessionLocal() as db:
        row = db.get(User, uuid.UUID(user.id))
        row.password_reset_expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    assert api.post("/api/auth/recovery/reset", json=_reset_body(token)).status_code == 400
    api.post("/api/account/recovery/disable", json={"authHash": user.auth_hash}, headers=user.headers)
    assert api.post("/api/auth/recovery/inspect", json={"token": token}).status_code == 400


def test_recovery_link_is_single_use_under_concurrent_requests(api, mail):
    user = _enabled(api, mail)
    body = _reset_body(_request_reset(api, user, mail))
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: api.post("/api/auth/recovery/reset", json=body), range(2)))
    assert sorted(response.status_code for response in responses) == [200, 400]


def test_recovery_preserves_mfa_and_invalidates_old_challenges(api, mail):
    import time

    from app.core import totp

    user = _enabled(api, mail)
    setup = api.post("/api/account/mfa/totp/setup", headers=user.headers).json()
    enabled = api.post(
        "/api/account/mfa/totp/enable",
        headers=user.headers,
        json={"code": totp.code_at(setup["secret"], int(time.time() // get_settings().totp_period_seconds))},
    )
    assert enabled.status_code == 200
    code = enabled.json()["recoveryCodes"][0]
    old_challenge = api.post("/api/auth/login", json={"email": user.email, "authHash": user.auth_hash}).json()
    token = _request_reset(api, user, mail)
    assert api.post("/api/auth/recovery/reset", json=_reset_body(token)).status_code == 200
    assert (
        api.post(
            "/api/auth/login/mfa",
            json={"mfaToken": old_challenge["mfaToken"], "method": "recovery", "code": code},
        ).status_code
        == 401
    )
    login = api.post("/api/auth/login", json={"email": user.email, "authHash": b64("new-auth-proof")}).json()
    assert login["mfaRequired"] is True and "accessToken" not in login
    assert (
        api.post(
            "/api/auth/login/mfa", json={"mfaToken": login["mfaToken"], "method": "recovery", "code": code}
        ).status_code
        == 200
    )


def test_password_change_and_recovery_key_replacement_cancel_pending_links(api, mail):
    user = _enabled(api, mail)
    token = _request_reset(api, user, mail)
    assert (
        api.put(
            "/api/account/recovery",
            headers=user.headers,
            json={
                "authHash": user.auth_hash,
                "recoveryAuth": b64("new-recovery-proof"),
                "wrappedVaultKey": ENC_2,
            },
        ).status_code
        == 204
    )
    assert api.post("/api/auth/recovery/inspect", json={"token": token}).status_code == 400
    with SessionLocal() as db:
        row = db.get(User, uuid.UUID(user.id))
        row.password_reset_sent_at = datetime.now(UTC) - timedelta(minutes=2)
        db.commit()
    token = _request_reset(api, user, mail)
    changed = api.post(
        "/api/account/password",
        headers=user.headers,
        json={
            "authHash": user.auth_hash,
            "newAuthHash": b64("ordinary-password-change"),
            "kdfSalt": b64("new-client-salt"),
            "kdfIterations": 600000,
            "protectedVaultKey": ENC_2,
        },
    )
    assert changed.status_code == 200
    assert api.post("/api/auth/recovery/inspect", json={"token": token}).status_code == 400


def test_verification_is_single_use_under_concurrent_requests(api, mail):
    user = register(api, "alice")
    token = _token(mail, "Verify your Vaultessa email", user.email)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(lambda _: api.post("/api/auth/email/verify", json={"token": token}), range(2))
        )
    assert sorted(response.status_code for response in responses) == [200, 400]
    assert sum(message["subject"] == "Welcome to Vaultessa" for message in mail) == 1
