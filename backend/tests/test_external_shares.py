from datetime import UTC, datetime, timedelta

from .helpers import ENC, b64, create_secret, register, response_data, share

CODE_SALT = b64("sixteen-byte-slt")
VERIFIER = b64("client-derived-code-verifier")


def _expires(hours: float = 24) -> str:
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


def _create(api, user, secret_id, **overrides):
    body = {"secretId": secret_id, "encryptedData": ENC, "expiresAt": _expires(), **overrides}
    return api.post("/api/external-shares", json=body, headers=user.headers)


def test_update_link_limits_preserves_usage_and_checks_ownership(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    item = create_secret(api, alice)
    link = response_data(_create(api, alice, item["id"], maxViews=5))
    url = f"/api/external-shares/{link['id']}/limits"
    body = {"expiresAt": _expires(48), "maxViews": 10}
    assert api.patch(url, json=body).status_code == 401
    assert api.patch(url, json=body, headers=bob.headers).status_code == 404
    assert api.post(f"/api/public/shares/{link['id']}/open", json={}).status_code == 200
    changed = api.patch(url, json=body, headers=alice.headers)
    assert changed.status_code == 200, changed.text
    assert response_data(changed)["viewCount"] == 1 and response_data(changed)["maxViews"] == 10
    events = response_data(api.get("/api/audit", params={"linkId": link["id"]}, headers=alice.headers))[
        "items"
    ]
    assert any(event["action"] == "EXTERNAL_SHARE_VIEW" for event in events)
    assert all(event["metadata"]["linkId"] == link["id"] for event in events)
    assert (
        response_data(api.get("/api/audit", params={"linkId": link["id"]}, headers=bob.headers))["items"]
        == []
    )
    assert api.patch(url, json={**body, "maxViews": 1}, headers=alice.headers).status_code == 400
    assert api.patch(url, json={**body, "maxViews": 101}, headers=alice.headers).status_code == 400
    api.delete(f"/api/external-shares/{link['id']}", headers=alice.headers)
    assert api.patch(url, json=body, headers=alice.headers).status_code == 400


def test_one_time_link_cannot_be_opened_concurrently(api):
    from concurrent.futures import ThreadPoolExecutor

    alice = register(api, "alice")
    item = create_secret(api, alice)
    link = response_data(_create(api, alice, item["id"], maxViews=1))
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(
            pool.map(lambda _: api.post(f"/api/public/shares/{link['id']}/open", json={}), range(4))
        )
    assert sorted(response.status_code for response in responses) == [200, 410, 410, 410]


def test_one_time_link_is_deleted_after_first_view(api):
    alice = register(api, "alice")
    item = create_secret(api, alice)
    created = _create(api, alice, item["id"], maxViews=1, recipientEmail="Guest@Example.com")
    assert created.status_code == 201, created.text
    link = response_data(created)
    assert link["status"] == "active" and link["recipientEmail"] == "guest@example.com"
    assert link["outsideDomain"] is False  # alice@example.com → guest@example.com: same domain
    other = response_data(_create(api, alice, item["id"], recipientEmail="someone@gmail.com"))
    assert other["outsideDomain"] is True

    info = response_data(api.get(f"/api/public/shares/{link['id']}"))
    assert info == {
        "status": "active",
        "senderName": "Alice",
        "hasCode": False,
        "codeSalt": None,
        "expiresAt": info["expiresAt"],
        "viewsLeft": 1,
    }

    opened = api.post(f"/api/public/shares/{link['id']}/open", json={})
    assert opened.status_code == 200 and response_data(opened)["encryptedData"] == ENC
    assert response_data(opened)["viewsLeft"] == 0

    again = api.post(f"/api/public/shares/{link['id']}/open", json={})
    assert again.status_code == 410
    assert response_data(api.get(f"/api/public/shares/{link['id']}"))["status"] == "used"

    # the sender sees it was opened
    actions = [e["action"] for e in response_data(api.get("/api/audit", headers=alice.headers))["items"]]
    assert "EXTERNAL_SHARE_VIEW" in actions


def test_access_code_is_required_and_attempt_limited(api):
    alice = register(api, "alice")
    item = create_secret(api, alice)
    link = response_data(_create(api, alice, item["id"], codeSalt=CODE_SALT, codeVerifier=VERIFIER))
    assert link["hasCode"] is True

    assert api.post(f"/api/public/shares/{link['id']}/open", json={}).status_code == 401
    wrong = api.post(f"/api/public/shares/{link['id']}/open", json={"codeVerifier": b64("nope")})
    assert wrong.status_code == 401 and "3 attempts left" in response_data(wrong)["error"]["message"]

    ok = api.post(f"/api/public/shares/{link['id']}/open", json={"codeVerifier": VERIFIER})
    assert ok.status_code == 200 and response_data(ok)["codeSalt"] == CODE_SALT

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
    link = response_data(_create(api, alice, item["id"]))
    for _ in range(3):
        assert api.post(f"/api/public/shares/{link['id']}/open", json={}).status_code == 200
    listed = response_data(
        api.get("/api/external-shares", params={"secretId": item["id"]}, headers=alice.headers)
    )
    assert listed[0]["viewCount"] == 3

    assert api.delete(f"/api/external-shares/{link['id']}", headers=alice.headers).status_code == 204
    assert api.post(f"/api/public/shares/{link['id']}/open", json={}).status_code == 410
    assert response_data(api.get(f"/api/public/shares/{link['id']}"))["status"] == "revoked"


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
    link = response_data(_create(api, alice, item["id"], recipientEmail="guest@example.com"))
    bad = api.post(
        f"/api/external-shares/{link['id']}/email",
        json={"link": "https://evil.example/phish"},
        headers=alice.headers,
    )
    assert bad.status_code == 400


def test_reopen_reactivates_the_same_link(api):
    alice = register(api, "alice")
    item = create_secret(api, alice)
    link = response_data(
        _create(api, alice, item["id"], maxViews=1, ownerKey=ENC, codeSalt=CODE_SALT, codeVerifier=VERIFIER)
    )
    assert link["ownerKey"] == ENC
    assert (
        api.post(f"/api/public/shares/{link['id']}/open", json={"codeVerifier": VERIFIER}).status_code == 200
    )
    assert response_data(api.get(f"/api/public/shares/{link['id']}"))["status"] == "used"

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
    assert response_data(reopened)["status"] == "active" and response_data(reopened)["viewCount"] == 0
    # same URL works again, with the (re-derived) code
    opened = api.post(f"/api/public/shares/{link['id']}/open", json={"codeVerifier": new_verifier})
    assert opened.status_code == 200


def test_reopen_rules(api):
    alice, mallory = register(api, "alice"), register(api, "mallory")
    item = create_secret(api, alice)
    legacy = response_data(_create(api, alice, item["id"]))  # no ownerKey
    body = {"encryptedData": ENC, "expiresAt": _expires()}
    assert (
        api.post(f"/api/external-shares/{legacy['id']}/reopen", json=body, headers=alice.headers).status_code
        == 400
    )
    owned = response_data(_create(api, alice, item["id"], ownerKey=ENC))
    assert (
        api.post(f"/api/external-shares/{owned['id']}/reopen", json=body, headers=mallory.headers).status_code
        == 404
    )


def test_unknown_link(api):
    missing = "00000000-0000-0000-0000-000000000000"
    assert api.get(f"/api/public/shares/{missing}").status_code == 404
