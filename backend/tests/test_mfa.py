import time

import pytest

from app.core import firebase, totp
from app.core.config import get_settings

from .helpers import b64, register, response_data

PERIOD = get_settings().totp_period_seconds


def _code(secret: str, offset: int = 0) -> str:
    return totp.code_at(secret, int(time.time() // PERIOD) + offset)


def _login(api, user):
    return api.post("/api/auth/login", json={"email": user.email, "authHash": user.auth_hash})


def _enable_totp(api, user) -> tuple[str, list[str], int]:
    """Returns (secret, recovery codes, the time-step counter used to enrol)."""
    setup = api.post("/api/account/mfa/totp/setup", headers=user.headers)
    assert setup.status_code == 200
    secret = response_data(setup)["secret"]
    assert response_data(setup)["otpauthUri"].startswith("otpauth://totp/Vaultessa")
    counter = int(time.time() // PERIOD)
    enabled = api.post(
        "/api/account/mfa/totp/enable", json={"code": totp.code_at(secret, counter)}, headers=user.headers
    )
    assert enabled.status_code == 200, enabled.text
    codes = response_data(enabled)["recoveryCodes"]
    assert len(codes) == 10
    return secret, codes, counter


def test_totp_enrolment_and_login(api):
    alice = register(api, "alice")
    secret, _, enrol_counter = _enable_totp(api, alice)

    challenge = _login(api, alice)
    assert challenge.status_code == 200
    body = response_data(challenge)
    assert body["mfaRequired"] is True and "totp" in body["methods"] and "recovery" in body["methods"]
    assert "accessToken" not in body  # no session before the second step

    wrong = api.post(
        "/api/auth/login/mfa", json={"mfaToken": body["mfaToken"], "method": "totp", "code": "000000"}
    )
    assert wrong.status_code == 401

    # The exact code used to enrol can't be replayed; the next time step is accepted.
    replay_code = totp.code_at(secret, enrol_counter)
    replay = api.post(
        "/api/auth/login/mfa", json={"mfaToken": body["mfaToken"], "method": "totp", "code": replay_code}
    )
    assert replay.status_code == 401
    next_code = totp.code_at(secret, enrol_counter + 1)
    ok = api.post(
        "/api/auth/login/mfa", json={"mfaToken": body["mfaToken"], "method": "totp", "code": next_code}
    )
    assert ok.status_code == 200 and response_data(ok)["account"]["totpEnabled"] is True


def test_password_change_invalidates_pending_mfa_challenge(api):
    from .helpers import ENC_2

    alice = register(api, "alice")
    _, codes, _ = _enable_totp(api, alice)
    challenge = response_data(_login(api, alice))
    changed = api.post(
        "/api/account/password",
        headers=alice.headers,
        json={
            "authHash": alice.auth_hash,
            "newAuthHash": b64("new-client-proof"),
            "kdfSalt": b64("new-sixteen-salt"),
            "kdfIterations": 600000,
            "protectedVaultKey": ENC_2,
        },
    )
    assert changed.status_code == 200, changed.text
    assert (
        api.post(
            "/api/auth/login/mfa",
            json={"mfaToken": challenge["mfaToken"], "method": "recovery", "code": codes[0]},
        ).status_code
        == 401
    )


def test_concurrent_recovery_code_cannot_be_reused(api):
    from concurrent.futures import ThreadPoolExecutor

    alice = register(api, "alice")
    _, codes, _ = _enable_totp(api, alice)
    challenge = response_data(_login(api, alice))
    body = {"mfaToken": challenge["mfaToken"], "method": "recovery", "code": codes[0]}
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: api.post("/api/auth/login/mfa", json=body), range(2)))
    assert sorted(response.status_code for response in responses) == [200, 401]


def test_recovery_code_works_once(api):
    alice = register(api, "alice")
    _, codes, _ = _enable_totp(api, alice)
    token = response_data(_login(api, alice))["mfaToken"]
    used = api.post(
        "/api/auth/login/mfa", json={"mfaToken": token, "method": "recovery", "code": codes[0].upper()}
    )
    assert used.status_code == 200
    again = api.post("/api/auth/login/mfa", json={"mfaToken": token, "method": "recovery", "code": codes[0]})
    assert again.status_code == 401
    overview = response_data(api.get("/api/account/security", headers=alice.headers))
    assert overview["recoveryCodesLeft"] == 9


def test_mfa_token_cannot_be_used_as_access_token(api):
    alice = register(api, "alice")
    _enable_totp(api, alice)
    token = response_data(_login(api, alice))["mfaToken"]
    assert api.get("/api/secrets", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_sms_via_firebase(api, monkeypatch):
    monkeypatch.setattr(firebase, "verify_phone_token", lambda token: "+919876543210")
    alice = register(api, "alice")
    enabled = api.post(
        "/api/account/mfa/sms/enable", json={"firebaseIdToken": "signed-token"}, headers=alice.headers
    )
    assert enabled.status_code == 200 and len(response_data(enabled)["recoveryCodes"]) == 10

    challenge = response_data(_login(api, alice))
    assert challenge["methods"] == ["sms", "recovery"] and challenge["phone"] == "+919876543210"
    ok = api.post(
        "/api/auth/login/mfa",
        json={"mfaToken": challenge["mfaToken"], "method": "sms", "firebaseIdToken": "signed-token"},
    )
    assert ok.status_code == 200

    # a verified token for a different phone number is rejected
    monkeypatch.setattr(firebase, "verify_phone_token", lambda token: "+15550000000")
    challenge = response_data(_login(api, alice))
    bad = api.post(
        "/api/auth/login/mfa",
        json={"mfaToken": challenge["mfaToken"], "method": "sms", "firebaseIdToken": "x"},
    )
    assert bad.status_code == 401


def test_disabling_requires_master_password(api):
    alice = register(api, "alice")
    _enable_totp(api, alice)
    wrong = api.post(
        "/api/account/mfa/disable", json={"method": "totp", "authHash": b64("wrong")}, headers=alice.headers
    )
    assert wrong.status_code == 401
    ok = api.post(
        "/api/account/mfa/disable",
        json={"method": "totp", "authHash": alice.auth_hash},
        headers=alice.headers,
    )
    assert ok.status_code == 204
    assert response_data(_login(api, alice)).get("accessToken")  # back to single-step login


def test_lockout_after_repeated_failures(api):
    alice = register(api, "alice")
    for _ in range(5):
        assert (
            api.post("/api/auth/login", json={"email": alice.email, "authHash": b64("nope")}).status_code
            == 401
        )
    locked = _login(api, alice)  # even the right password is refused while locked
    assert locked.status_code == 429 and response_data(locked)["error"]["code"] == "ACCOUNT_LOCKED"


@pytest.mark.parametrize("method", ["totp", "recovery"])
def test_wrong_second_step_counts_towards_lockout(api, method):
    alice = register(api, "alice")
    _enable_totp(api, alice)
    for _ in range(5):
        token = response_data(_login(api, alice))["mfaToken"]
        api.post("/api/auth/login/mfa", json={"mfaToken": token, "method": method, "code": "badbad"})
    assert _login(api, alice).status_code == 429


def test_sessions_list_and_revoke(api):
    alice = register(api, "alice")
    second = response_data(_login(api, alice))["accessToken"]
    sessions = response_data(api.get("/api/account/sessions", headers=alice.headers))
    assert len(sessions) == 2 and sum(s["current"] for s in sessions) == 1
    other = next(s for s in sessions if not s["current"])
    assert api.delete(f"/api/account/sessions/{other['id']}", headers=alice.headers).status_code == 204
    assert api.get("/api/secrets", headers={"Authorization": f"Bearer {second}"}).status_code == 401
    current = next(s for s in sessions if s["current"])
    assert api.delete(f"/api/account/sessions/{current['id']}", headers=alice.headers).status_code == 400
