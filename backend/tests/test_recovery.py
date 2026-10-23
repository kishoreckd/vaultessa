import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import get_settings
from app.db.models.user_model import User
from app.db.session import SessionLocal
from app.services import notifications_service as notify
from app.services.email_service import EmailDeliveryResult

from .helpers import ENC, ENC_2, b64, create_secret, register, response_data


@pytest.fixture
def mail(monkeypatch):
    messages = []
    # Retain issued legacy capabilities solely for compatibility endpoint tests.
    # New emails contain codes and a plain page URL, never a reset capability.
    issued = {}
    original_verify, original_reset = notify.verify_email, notify.forgot_password

    def verification(background, user, token, code=""):
        issued[user.email, "Verify your Vaultessa email"] = token
        original_verify(background, user, token, code)

    def recovery(background, user, token, code=""):
        issued[user.email, "Recover your Vaultessa account"] = token
        original_reset(background, user, token, code)

    monkeypatch.setattr(notify, "verify_email", verification)
    monkeypatch.setattr(notify, "forgot_password", recovery)
    monkeypatch.setattr(notify, "email_enabled", lambda: True)
    monkeypatch.setattr(
        notify,
        "send_email",
        lambda to, subject, text, html=None: messages.append(
            {
                "to": to,
                "subject": subject,
                "text": text,
                "html": html,
                "legacy_token": issued.get((to, subject)),
            }
        )
        or EmailDeliveryResult("accepted", "Accepted by test sender"),
    )
    return messages


def _token(messages, subject, email):
    message = next(
        message for message in reversed(messages) if message["subject"] == subject and message["to"] == email
    )
    return message["legacy_token"]


def _verified(api, mail, name="alice"):
    user = register(api, name, verified=False)
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
        "currentKdfAuthHash": b64("new-auth-under-old-kdf"),
        "kdfSalt": b64("fresh-client-salt"),
        "kdfIterations": 600000,
        "protectedVaultKey": ENC_2,
    }


def _code(messages, email):
    message = next(m for m in reversed(messages) if m["to"] == email and "Code: " in m["text"])
    return re.search(r"Code: ([0-9]{6})", message["text"]).group(1)


def test_verification_code_is_bound_to_email_hashed_and_single_use(api, mail, monkeypatch):
    values = iter([123456, 654321])
    monkeypatch.setattr("app.services.recovery_service.secrets.randbelow", lambda _: next(values))
    alice = register(api, "alice", verified=False)
    code = _code(mail, alice.email)
    bob = register(api, "bob", verified=False)
    with SessionLocal() as db:
        row = db.get(User, uuid.UUID(alice.id))
        assert row.email_verification_code_hash != code
        assert len(row.email_verification_code_hash) == 64
    assert api.post("/api/auth/email/verify-code", json={"email": bob.email, "code": code}).status_code == 400
    assert (
        api.post("/api/auth/recovery/verify-code", json={"email": alice.email, "code": code}).status_code
        == 400
    )
    body = {"email": alice.email, "code": code}
    assert api.post("/api/auth/email/verify-code", json=body).status_code == 200
    assert api.post("/api/auth/email/verify-code", json=body).status_code == 400
    assert api.get("/api/secrets", headers=alice.headers).status_code == 200
    with SessionLocal() as db:
        row = db.get(User, uuid.UUID(alice.id))
        assert row.email_verification_code_hash is None and row.email_verification_hash is None


@pytest.mark.parametrize("expired", [True, False])
def test_verification_expired_code_and_attempt_limit(api, mail, expired):
    user = register(api, "alice", verified=False)
    code = _code(mail, user.email)
    if expired:
        with SessionLocal() as db:
            db.get(User, uuid.UUID(user.id)).email_verification_code_expires_at = datetime.now(
                UTC
            ) - timedelta(seconds=1)
            db.commit()
    else:
        wrong = "000000" if code != "000000" else "111111"
        limit = get_settings().email_code_max_attempts
        for attempt in range(1, limit + 1):
            # The last allowed wrong code starts the lockout (429).
            assert api.post(
                "/api/auth/email/verify-code", json={"email": user.email, "code": wrong}
            ).status_code == (429 if attempt == limit else 400)
    assert api.post("/api/auth/email/verify-code", json={"email": user.email, "code": code}).status_code == (
        400 if expired else 429
    )
    assert response_data(api.get("/api/auth/me", headers=user.headers))["emailVerified"] is False


def test_resend_waits_45_seconds_and_invalidates_previous_code(api, mail):
    user = register(api, "alice", verified=False)
    old = _code(mail, user.email)
    count = len(mail)
    assert response_data(api.get("/api/auth/email/policy"))["resendAfterSeconds"] == 45
    assert response_data(api.get("/api/auth/email/status", headers=user.headers))["resendAfterSeconds"] > 0
    with SessionLocal() as db:
        db.get(User, uuid.UUID(user.id)).email_verification_sent_at = datetime.now(UTC) - timedelta(
            seconds=44
        )
        db.commit()
    assert api.post("/api/auth/email/request", json={"email": user.email}).status_code == 202
    assert len(mail) == count
    with SessionLocal() as db:
        db.get(User, uuid.UUID(user.id)).email_verification_sent_at = datetime.now(UTC) - timedelta(
            seconds=46
        )
        db.commit()
    assert api.post("/api/auth/email/request", json={"email": user.email}).status_code == 202
    assert len(mail) == count + 1
    new = _code(mail, user.email)
    if old != new:
        assert (
            api.post("/api/auth/email/verify-code", json={"email": user.email, "code": old}).status_code
            == 400
        )
    assert api.post("/api/auth/email/verify-code", json={"email": user.email, "code": new}).status_code == 200


def test_recovery_code_exchange_reuse_rejection_and_retry(api, mail):
    user = _enabled(api, mail)
    old_link = _request_reset(api, user, mail)
    code = _code(mail, user.email)
    message = next(m for m in reversed(mail) if "Code: " in m["text"])
    assert "#token=" not in message["text"] and "#token=" not in message["html"]
    assert "/forgot-password" in message["html"]
    body = {"email": user.email, "code": code}
    response = api.post("/api/auth/recovery/verify-code", json=body)
    assert response.status_code == 200
    token = response_data(response)["token"]
    assert token != old_link
    assert api.post("/api/auth/recovery/inspect", json={"token": old_link}).status_code == 400
    assert api.post("/api/auth/recovery/verify-code", json=body).status_code == 400
    same = api.post(
        "/api/auth/recovery/reset", json={**_reset_body(token), "currentKdfAuthHash": user.auth_hash}
    )
    assert same.status_code == 400 and response_data(same)["error"]["code"] == "PASSWORD_REUSED"
    assert api.post("/api/auth/recovery/inspect", json={"token": token}).status_code == 200
    wrong_key = api.post(
        "/api/auth/recovery/reset", json={**_reset_body(token), "recoveryAuth": b64("wrong-key")}
    )
    assert wrong_key.status_code == 400
    assert api.post("/api/auth/recovery/reset", json=_reset_body(token)).status_code == 200


@pytest.mark.parametrize("expired", [True, False])
def test_recovery_code_expiry_and_attempt_limit(api, mail, expired):
    user = _enabled(api, mail)
    token = _request_reset(api, user, mail)
    code = _code(mail, user.email)
    if expired:
        with SessionLocal() as db:
            db.get(User, uuid.UUID(user.id)).password_reset_code_expires_at = datetime.now(UTC) - timedelta(
                seconds=1
            )
            db.commit()
    else:
        wrong = "000000" if code != "000000" else "111111"
        limit = get_settings().email_code_max_attempts
        for attempt in range(1, limit + 1):
            # The last allowed wrong code starts the lockout (429).
            assert api.post(
                "/api/auth/recovery/verify-code", json={"email": user.email, "code": wrong}
            ).status_code == (429 if attempt == limit else 400)
        assert api.post("/api/auth/recovery/inspect", json={"token": token}).status_code == 400
    assert api.post(
        "/api/auth/recovery/verify-code", json={"email": user.email, "code": code}
    ).status_code == (400 if expired else 429)


def test_password_change_invalidates_pending_recovery_code(api, mail):
    user = _enabled(api, mail)
    _request_reset(api, user, mail)
    code = _code(mail, user.email)
    body = _reset_body("A" * 43)
    for field in ("token", "recoveryAuth", "currentKdfAuthHash"):
        body.pop(field)
    result = api.post(
        "/api/account/password", headers=user.headers, json={**body, "authHash": user.auth_hash}
    )
    assert result.status_code == 200, result.text
    assert (
        api.post("/api/auth/recovery/verify-code", json={"email": user.email, "code": code}).status_code
        == 400
    )


def test_codes_are_single_use_under_concurrent_requests(api, mail):
    user = register(api, "alice", verified=False)
    body = {"email": user.email, "code": _code(mail, user.email)}
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: api.post("/api/auth/email/verify-code", json=body), range(2)))
    assert sorted(response.status_code for response in responses) == [200, 400]


def test_signup_verification_and_welcome_are_single_use(api, mail):
    user = register(api, "alice", verified=False)
    assert response_data(api.get("/api/auth/me", headers=user.headers))["emailVerified"] is False
    blocked = api.get("/api/secrets", headers=user.headers)
    assert blocked.status_code == 403
    assert response_data(blocked)["error"]["code"] == "EMAIL_NOT_VERIFIED"
    assert (
        api.post(
            "/api/secrets",
            json={"type": "LOGIN", "encryptedData": ENC, "wrappedKey": ENC},
            headers=user.headers,
        ).status_code
        == 403
    )
    token = _token(mail, "Verify your Vaultessa email", user.email)
    assert api.post("/api/auth/email/verify", json={"token": token}).status_code == 200
    assert response_data(api.get("/api/auth/me", headers=user.headers))["emailVerified"] is True
    assert api.get("/api/secrets", headers=user.headers).status_code == 200
    assert api.post("/api/auth/email/verify", json={"token": token}).status_code == 400
    assert sum(message["subject"] == "Welcome to Vaultessa" for message in mail) == 1
    with SessionLocal() as db:
        user_row = db.get(User, uuid.UUID(user.id))
        assert user_row.email_verification_hash is None


def test_unverified_login_remains_restricted_and_can_resend_after_cooldown(api, mail):
    user = register(api, "alice", verified=False)
    with SessionLocal() as db:
        row = db.get(User, uuid.UUID(user.id))
        row.email_verification_sent_at = datetime.now(UTC) - timedelta(minutes=2)
        db.commit()
    before = len(mail)
    response = api.post("/api/auth/login", json={"email": user.email, "authHash": user.auth_hash})
    assert response.status_code == 200
    assert response_data(response)["account"]["emailVerified"] is False
    assert len(mail) == before + 1
    headers = {"Authorization": "Bearer " + response_data(response)["accessToken"]}
    for path in [
        "/api/secrets",
        "/api/folders",
        "/api/account/security",
        "/api/tokens",
        "/api/organizations",
    ]:
        assert api.get(path, headers=headers).status_code == 403
    assert api.get("/api/auth/me", headers=headers).status_code == 200
    response = api.post("/api/auth/email/request", json={"email": user.email})
    assert response.status_code == 202


def test_requests_do_not_disclose_account_and_resends_are_throttled(api, mail):
    user = register(api, "alice", verified=False)
    expected = api.post("/api/auth/email/request", json={"email": "unknown@example.com"})
    count = len(mail)
    actual = api.post("/api/auth/email/request", json={"email": user.email})
    assert actual.status_code == expected.status_code == 202 and response_data(actual) == response_data(
        expected
    )
    assert len(mail) == count  # signup just sent a verification link
    eligible = api.post("/api/auth/recovery/request", json={"email": user.email})
    unknown = api.post("/api/auth/recovery/request", json={"email": "unknown@example.com"})
    assert eligible.status_code == unknown.status_code == 202 and response_data(eligible) == response_data(
        unknown
    )
    assert len(mail) == count  # unverified and no vault recovery key


def test_expired_verification_and_new_link_invalidates_old(api, mail):
    user = register(api, "alice", verified=False)
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
    user = register(api, "alice", verified=False)
    body = {"authHash": user.auth_hash, "recoveryAuth": b64("proof"), "wrappedVaultKey": ENC}
    assert api.put("/api/account/recovery", json=body).status_code == 401
    assert api.put("/api/account/recovery", json=body, headers=user.headers).status_code == 403
    token = _token(mail, "Verify your Vaultessa email", user.email)
    api.post("/api/auth/email/verify", json={"token": token})
    assert (
        api.put(
            "/api/account/recovery", json={**body, "authHash": b64("wrong")}, headers=user.headers
        ).status_code
        == 401
    )
    assert api.put("/api/account/recovery", json=body, headers=user.headers).status_code == 204
    assert response_data(api.get("/api/account/recovery", headers=user.headers))["recoveryEnabled"] is True
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
    assert response_data(api.get("/api/account/recovery", headers=user.headers))["recoveryEnabled"] is False


def test_recovery_preserves_items_revokes_sessions_tokens_and_consumes_key(api, mail):
    user = _enabled(api, mail)
    item = create_secret(api, user)
    token_metadata = response_data(
        api.post(
            "/api/tokens",
            headers=user.headers,
            json={
                "name": "CI",
                "authKey": b64("machine-proof"),
                "ownerKey": ENC,
                "grants": [{"secretId": item["id"], "wrappedKey": ENC}],
            },
        )
    )
    link_token = _request_reset(api, user, mail)
    inspect = api.post("/api/auth/recovery/inspect", json={"token": link_token})
    assert response_data(inspect) == {
        "wrappedVaultKey": ENC,
        "kdfSalt": b64("sixteen-byte-slt"),
        "kdfIterations": 600000,
    }
    assert (
        api.post(
            "/api/auth/recovery/reset", json={**_reset_body(link_token), "masterPassword": "must-be-rejected"}
        ).status_code
        == 400
    )
    response = api.post("/api/auth/recovery/reset", json=_reset_body(link_token))
    assert response.status_code == 200, response.text
    assert "accessToken" not in response_data(response)
    assert api.get("/api/secrets", headers=user.headers).status_code == 401
    assert api.post("/api/auth/recovery/reset", json=_reset_body(link_token)).status_code == 400
    assert (
        api.post("/api/auth/login", json={"email": user.email, "authHash": user.auth_hash}).status_code == 401
    )
    login = api.post("/api/auth/login", json={"email": user.email, "authHash": b64("new-auth-proof")})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {response_data(login)['accessToken']}"}
    assert (
        response_data(api.get("/api/secrets", headers=headers))[0]["encryptedData"] == item["encryptedData"]
    )
    assert response_data(api.get("/api/account/recovery", headers=headers))["recoveryEnabled"] is False
    assert (
        next(
            row
            for row in response_data(api.get("/api/tokens", headers=headers))
            if row["id"] == token_metadata["id"]
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
    setup = response_data(api.post("/api/account/mfa/totp/setup", headers=user.headers))
    enabled = api.post(
        "/api/account/mfa/totp/enable",
        headers=user.headers,
        json={"code": totp.code_at(setup["secret"], int(time.time() // get_settings().totp_period_seconds))},
    )
    assert enabled.status_code == 200
    code = response_data(enabled)["recoveryCodes"][0]
    old_challenge = response_data(
        api.post("/api/auth/login", json={"email": user.email, "authHash": user.auth_hash})
    )
    token = _request_reset(api, user, mail)
    assert api.post("/api/auth/recovery/reset", json=_reset_body(token)).status_code == 200
    assert (
        api.post(
            "/api/auth/login/mfa",
            json={"mfaToken": old_challenge["mfaToken"], "method": "recovery", "code": code},
        ).status_code
        == 401
    )
    login = response_data(
        api.post("/api/auth/login", json={"email": user.email, "authHash": b64("new-auth-proof")})
    )
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
    user = register(api, "alice", verified=False)
    token = _token(mail, "Verify your Vaultessa email", user.email)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(lambda _: api.post("/api/auth/email/verify", json={"token": token}), range(2))
        )
    assert sorted(response.status_code for response in responses) == [200, 400]
    assert sum(message["subject"] == "Welcome to Vaultessa" for message in mail) == 1
