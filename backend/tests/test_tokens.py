import uuid
from datetime import UTC, datetime, timedelta

from app.db.models.user_model import User
from app.db.session import SessionLocal

from .helpers import ENC, ENC_2, b64, create_secret, register, response_data, share

AUTH_KEY = b64("thirty-two-byte-derived-auth-key")


def _create_token(api, user, secret_ids, **overrides):
    body = {
        "name": "GitHub Actions",
        "authKey": AUTH_KEY,
        "ownerKey": ENC,
        "grants": [{"secretId": sid, "wrappedKey": ENC_2} for sid in secret_ids],
        **overrides,
    }
    return api.post("/api/tokens", json=body, headers=user.headers)


def _machine(api, token_id, auth_key=AUTH_KEY):
    return api.get("/api/machine/secrets", headers={"Authorization": f"Bearer pvm.{token_id}.{auth_key}"})


def test_token_reads_only_granted_items(api):
    alice = register(api, "alice")
    granted, other = create_secret(api, alice), create_secret(api, alice)
    created = _create_token(api, alice, [granted["id"]])
    assert created.status_code == 201, created.text
    token = response_data(created)
    assert token["status"] == "active" and token["itemIds"] == [granted["id"]]

    secrets = _machine(api, token["id"])
    assert secrets.status_code == 200
    assert [s["id"] for s in response_data(secrets)] == [granted["id"]]
    assert response_data(secrets)[0]["wrappedKey"] == ENC_2 and other["id"] not in secrets.text

    listed = response_data(api.get("/api/tokens", headers=alice.headers))[0]
    assert listed["lastUsedAt"] is not None
    actions = [e["action"] for e in response_data(api.get("/api/audit", headers=alice.headers))["items"]]
    assert "MACHINE_READ" in actions and "TOKEN_CREATE" in actions


def test_machine_token_cannot_bypass_email_verification(api):
    alice = register(api, "alice")
    item = create_secret(api, alice)
    token = response_data(_create_token(api, alice, [item["id"]]))
    with SessionLocal() as db:
        db.get(User, uuid.UUID(alice.id)).email_verified = False
        db.commit()
    blocked = _machine(api, token["id"])
    assert blocked.status_code == 403
    assert response_data(blocked)["error"]["code"] == "EMAIL_NOT_VERIFIED"


def test_bad_credentials_and_revocation(api):
    alice = register(api, "alice")
    item = create_secret(api, alice)
    token = response_data(_create_token(api, alice, [item["id"]]))
    assert _machine(api, token["id"], b64("wrong-key")).status_code == 401
    assert api.get("/api/machine/secrets").status_code == 401
    assert (
        api.get("/api/machine/secrets", headers={"Authorization": f"Bearer {alice.token}"}).status_code == 401
    )

    assert api.delete(f"/api/tokens/{token['id']}", headers=alice.headers).status_code == 204
    assert _machine(api, token["id"]).status_code == 401


def test_expired_token_is_rejected(api):
    alice = register(api, "alice")
    item = create_secret(api, alice)
    past = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
    assert _create_token(api, alice, [item["id"]], expiresAt=past).status_code == 400


def test_grants_follow_the_creators_access(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    item = create_secret(api, alice)
    share(api, alice, item["id"], bob, "VIEW")
    token = response_data(_create_token(api, bob, [item["id"]]))
    assert len(response_data(_machine(api, token["id"]))) == 1
    # alice removes bob's access → bob's token loses the item immediately
    api.delete(f"/api/secrets/{item['id']}/shares/{bob.id}", headers=alice.headers)
    assert response_data(_machine(api, token["id"])) == []


def test_cannot_grant_login_only_or_foreign_items(api):
    alice, bob, mallory = register(api, "alice"), register(api, "bob"), register(api, "mallory")
    item = create_secret(api, alice)
    share(api, alice, item["id"], bob, "LOGIN_ONLY")
    assert _create_token(api, bob, [item["id"]]).status_code == 403
    assert _create_token(api, mallory, [item["id"]]).status_code == 404


def test_update_grants(api):
    alice = register(api, "alice")
    first, second = create_secret(api, alice), create_secret(api, alice)
    token = response_data(_create_token(api, alice, [first["id"]]))
    updated = api.put(
        f"/api/tokens/{token['id']}/grants",
        json={"grants": [{"secretId": second["id"], "wrappedKey": ENC_2}]},
        headers=alice.headers,
    )
    assert response_data(updated)["itemIds"] == [second["id"]]
    assert [s["id"] for s in response_data(_machine(api, token["id"]))] == [second["id"]]
