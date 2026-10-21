from datetime import UTC, datetime, timedelta

from .helpers import ENC, b64, create_secret, register, share

CODE_SALT = b64("sixteen-byte-slt")
VERIFIER = b64("client-derived-code-verifier")


def _expires(hours: float = 24) -> str:
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


def _create(api, user, secret_id, **overrides):
    body = {"secretId": secret_id, "encryptedData": ENC, "expiresAt": _expires(), **overrides}
    return api.post("/api/external-shares", json=body, headers=user.headers)


def test_one_time_link_is_deleted_after_first_view(api):
    alice = register(api, "alice")
    item = create_secret(api, alice)
    created = _create(api, alice, item["id"], maxViews=1, recipientEmail="Guest@Example.com")
    assert created.status_code == 201, created.text
    link = created.json()
    assert link["status"] == "active" and link["recipientEmail"] == "guest@example.com"
    assert link["outsideDomain"] is False  # alice@example.com → guest@example.com: same domain
    other = _create(api, alice, item["id"], recipientEmail="someone@gmail.com").json()
    assert other["outsideDomain"] is True

    info = api.get(f"/api/public/shares/{link['id']}").json()
    assert info == {
        "status": "active",
        "senderName": "Alice",
        "hasCode": False,
        "codeSalt": None,
        "expiresAt": info["expiresAt"],
        "viewsLeft": 1,
    }

    opened = api.post(f"/api/public/shares/{link['id']}/open", json={})
    assert opened.status_code == 200 and opened.json()["encryptedData"] == ENC
    assert opened.json()["viewsLeft"] == 0

    again = api.post(f"/api/public/shares/{link['id']}/open", json={})
    assert again.status_code == 410
    assert api.get(f"/api/public/shares/{link['id']}").json()["status"] == "used"

    # the sender sees it was opened
    actions = [e["action"] for e in api.get("/api/audit", headers=alice.headers).json()["items"]]
    assert "EXTERNAL_SHARE_VIEW" in actions


def test_access_code_is_required_and_attempt_limited(api):
    alice = register(api, "alice")
    item = create_secret(api, alice)
    link = _create(api, alice, item["id"], codeSalt=CODE_SALT, codeVerifier=VERIFIER).json()
    assert link["hasCode"] is True

    assert api.post(f"/api/public/shares/{link['id']}/open", json={}).status_code == 401
    wrong = api.post(f"/api/public/shares/{link['id']}/open", json={"codeVerifier": b64("nope")})
    assert wrong.status_code == 401 and "3 attempts left" in wrong.json()["error"]["message"]

    ok = api.post(f"/api/public/shares/{link['id']}/open", json={"codeVerifier": VERIFIER})
    assert ok.status_code == 200 and ok.json()["codeSalt"] == CODE_SALT

    for _ in range(2):
        api.post(f"/api/public/shares/{link['id']}/open", json={"codeVerifier": b64("nope")})
    locked = api.post(f"/api/public/shares/{link['id']}/open", json={"codeVerifier": b64("nope")})
    assert locked.status_code == 410
    # even the right code no longer works once locked
    assert (
        api.post(f"/api/public/shares/{link['id']}/open", json={"codeVerifier": VERIFIER}).status_code == 410
    )


def test_time_limited_link_allows_multiple_views_until_revoked(api):
    alice = register(api, "alice")
    item = create_secret(api, alice)
    link = _create(api, alice, item["id"]).json()
    for _ in range(3):
        assert api.post(f"/api/public/shares/{link['id']}/open", json={}).status_code == 200
    listed = api.get("/api/external-shares", params={"secretId": item["id"]}, headers=alice.headers).json()
    assert listed[0]["viewCount"] == 3

    assert api.delete(f"/api/external-shares/{link['id']}", headers=alice.headers).status_code == 204
    assert api.post(f"/api/public/shares/{link['id']}/open", json={}).status_code == 410
    assert api.get(f"/api/public/shares/{link['id']}").json()["status"] == "revoked"


def test_creation_rules(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    item = create_secret(api, alice)
    assert _create(api, alice, item["id"], expiresAt=_expires(-1)).status_code == 400
    assert _create(api, alice, item["id"], expiresAt=_expires(24 * 120)).status_code == 400
    assert _create(api, alice, item["id"], codeSalt=CODE_SALT).status_code == 400  # verifier missing
    assert _create(api, alice, item["id"], encryptedData="plaintext").status_code == 400
    # someone with only VIEW access can't create outside links
    share(api, alice, item["id"], bob, "VIEW")
    assert _create(api, bob, item["id"]).status_code == 403
    # and a stranger can't even see the item
    mallory = register(api, "mallory")
    assert _create(api, mallory, item["id"]).status_code == 404


def test_email_requires_matching_link(api):
    alice = register(api, "alice")
    item = create_secret(api, alice)
    link = _create(api, alice, item["id"], recipientEmail="guest@example.com").json()
    bad = api.post(
        f"/api/external-shares/{link['id']}/email",
        json={"link": "https://evil.example/phish"},
        headers=alice.headers,
    )
    assert bad.status_code == 400


def test_reopen_reactivates_the_same_link(api):
    alice = register(api, "alice")
    item = create_secret(api, alice)
    link = _create(
        api, alice, item["id"], maxViews=1, ownerKey=ENC, codeSalt=CODE_SALT, codeVerifier=VERIFIER
    ).json()
    assert link["ownerKey"] == ENC
    assert (
        api.post(f"/api/public/shares/{link['id']}/open", json={"codeVerifier": VERIFIER}).status_code == 200
    )
    assert api.get(f"/api/public/shares/{link['id']}").json()["status"] == "used"

    new_verifier = b64("new-verifier")
    reopened = api.post(
        f"/api/external-shares/{link['id']}/reopen",
        json={
            "encryptedData": ENC,
            "expiresAt": _expires(48),
            "maxViews": 1,
            "codeSalt": CODE_SALT,
            "codeVerifier": new_verifier,
        },
        headers=alice.headers,
    )
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["status"] == "active" and reopened.json()["viewCount"] == 0
    # same URL works again, with the (re-derived) code
    opened = api.post(f"/api/public/shares/{link['id']}/open", json={"codeVerifier": new_verifier})
    assert opened.status_code == 200


def test_reopen_rules(api):
    alice, mallory = register(api, "alice"), register(api, "mallory")
    item = create_secret(api, alice)
    legacy = _create(api, alice, item["id"]).json()  # no ownerKey
    body = {"encryptedData": ENC, "expiresAt": _expires()}
    assert (
        api.post(f"/api/external-shares/{legacy['id']}/reopen", json=body, headers=alice.headers).status_code
        == 400
    )
    owned = _create(api, alice, item["id"], ownerKey=ENC).json()
    assert (
        api.post(f"/api/external-shares/{owned['id']}/reopen", json=body, headers=mallory.headers).status_code
        == 404
    )


def test_unknown_link(api):
    missing = "00000000-0000-0000-0000-000000000000"
    assert api.get(f"/api/public/shares/{missing}").status_code == 404
