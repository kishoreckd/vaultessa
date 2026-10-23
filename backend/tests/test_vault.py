from .helpers import ENC, ENC_2, RSA_WRAPPED, create_secret, register, response_data, share


def test_create_list_update_with_history(api):
    alice = register(api, "alice")
    item = create_secret(api, alice, favorite=True)
    assert item["isOwner"] and item["permission"] == "MANAGE" and item["keyWrap"] == "VAULT"
    assert item["revision"] == 0 and item["favorite"] is True

    updated = api.put(
        f"/api/secrets/{item['id']}", json={"encryptedData": ENC_2, "revision": 0}, headers=alice.headers
    )
    assert updated.status_code == 200 and response_data(updated)["revision"] == 1

    stale = api.put(
        f"/api/secrets/{item['id']}", json={"encryptedData": ENC, "revision": 0}, headers=alice.headers
    )
    assert stale.status_code == 409

    history = response_data(api.get(f"/api/secrets/{item['id']}/history", headers=alice.headers))
    assert [h["encryptedData"] for h in history] == [ENC]
    assert history[0]["changedBy"]["email"] == "alice@example.com"

    vault = response_data(api.get("/api/secrets", headers=alice.headers))
    assert [v["encryptedData"] for v in vault] == [ENC_2]


def test_server_refuses_plaintext_payloads(api):
    alice = register(api, "alice")
    response = api.post(
        "/api/secrets",
        json={"type": "LOGIN", "encryptedData": "hunter2", "wrappedKey": ENC},
        headers=alice.headers,
    )
    assert response.status_code == 400


def test_other_users_get_404_not_403(api):
    alice, mallory = register(api, "alice"), register(api, "mallory")
    item = create_secret(api, alice)
    for method, url, body in [
        ("GET", f"/api/secrets/{item['id']}/history", None),
        ("PUT", f"/api/secrets/{item['id']}", {"encryptedData": ENC, "revision": 0}),
        ("DELETE", f"/api/secrets/{item['id']}", None),
        ("GET", f"/api/secrets/{item['id']}/shares", None),
    ]:
        response = api.request(method, url, json=body, headers=mallory.headers)
        assert response.status_code == 404, (method, url)
    assert response_data(api.get("/api/secrets", headers=mallory.headers)) == []


def test_folders_are_private_and_deleting_keeps_secrets(api):
    alice, mallory = register(api, "alice"), register(api, "mallory")
    folder = response_data(api.post("/api/folders", json={"encryptedName": ENC}, headers=alice.headers))
    item = create_secret(api, alice, folderId=folder["id"])
    assert item["folderId"] == folder["id"]

    # mallory can't file into or see alice's folder
    other = api.post(
        "/api/secrets",
        json={"type": "LOGIN", "encryptedData": ENC, "wrappedKey": ENC, "folderId": folder["id"]},
        headers=mallory.headers,
    )
    assert other.status_code == 404
    assert response_data(api.get("/api/folders", headers=mallory.headers)) == []

    assert api.delete(f"/api/folders/{folder['id']}", headers=alice.headers).status_code == 204
    vault = response_data(api.get("/api/secrets", headers=alice.headers))
    assert vault[0]["id"] == item["id"] and vault[0]["folderId"] is None


def test_access_patch_only_changes_given_fields(api):
    alice = register(api, "alice")
    folder = response_data(api.post("/api/folders", json={"encryptedName": ENC}, headers=alice.headers))
    item = create_secret(api, alice, folderId=folder["id"])
    fav = response_data(
        api.patch(f"/api/secrets/{item['id']}/access", json={"favorite": True}, headers=alice.headers)
    )
    assert fav["favorite"] is True and fav["folderId"] == folder["id"]
    moved = response_data(
        api.patch(f"/api/secrets/{item['id']}/access", json={"folderId": None}, headers=alice.headers)
    )
    assert moved["folderId"] is None and moved["favorite"] is True


def test_sharing_permissions_accept_and_revoke(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    item = create_secret(api, alice)

    lookup = api.get("/api/users/lookup", params={"email": "BOB@example.com"}, headers=alice.headers)
    assert lookup.status_code == 200 and response_data(lookup)["id"] == bob.id
    assert share(api, alice, item["id"], bob, "VIEW").status_code == 201
    assert share(api, alice, item["id"], bob, "VIEW").status_code == 409

    received = response_data(api.get("/api/secrets", headers=bob.headers))[0]
    assert received["owner"] == {"id": alice.id, "name": "Alice", "email": "alice@example.com"}
    assert received["keyWrap"] == "RSA" and received["wrappedKey"] == RSA_WRAPPED and not received["isOwner"]

    # VIEW can read history but cannot modify, delete or manage shares
    assert api.get(f"/api/secrets/{item['id']}/history", headers=bob.headers).status_code == 200
    edit = api.put(
        f"/api/secrets/{item['id']}", json={"encryptedData": ENC_2, "revision": 0}, headers=bob.headers
    )
    assert edit.status_code == 403
    assert api.delete(f"/api/secrets/{item['id']}", headers=bob.headers).status_code == 403
    assert api.get(f"/api/secrets/{item['id']}/shares", headers=bob.headers).status_code == 403

    accepted = api.patch(f"/api/secrets/{item['id']}/access", json={"wrappedKey": ENC_2}, headers=bob.headers)
    assert accepted.status_code == 200 and response_data(accepted)["keyWrap"] == "VAULT"
    again = api.patch(f"/api/secrets/{item['id']}/access", json={"wrappedKey": ENC_2}, headers=bob.headers)
    assert again.status_code == 400

    # upgrade to MODIFY → bob can now edit
    upgraded = api.patch(
        f"/api/secrets/{item['id']}/shares/{bob.id}", json={"permission": "MODIFY"}, headers=alice.headers
    )
    assert upgraded.status_code == 200
    edit = api.put(
        f"/api/secrets/{item['id']}", json={"encryptedData": ENC_2, "revision": 0}, headers=bob.headers
    )
    assert edit.status_code == 200

    shares = response_data(api.get(f"/api/secrets/{item['id']}/shares", headers=alice.headers))
    assert {(s["email"], s["isOwner"], s["accepted"]) for s in shares} == {
        ("alice@example.com", True, True),
        ("bob@example.com", False, True),
    }

    # the owner can't be removed; bob can be
    owner_removal = api.delete(f"/api/secrets/{item['id']}/shares/{alice.id}", headers=alice.headers)
    assert owner_removal.status_code == 403
    assert api.delete(f"/api/secrets/{item['id']}/shares/{bob.id}", headers=alice.headers).status_code == 204
    assert response_data(api.get("/api/secrets", headers=bob.headers)) == []


def test_recipient_can_leave_a_share(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    item = create_secret(api, alice)
    share(api, alice, item["id"], bob, "LOGIN_ONLY")
    assert api.delete(f"/api/secrets/{item['id']}/shares/{bob.id}", headers=bob.headers).status_code == 204
    assert response_data(api.get("/api/secrets", headers=alice.headers))[0]["id"] == item["id"]


def test_owner_delete_removes_for_everyone(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    item = create_secret(api, alice)
    share(api, alice, item["id"], bob, "MANAGE")
    # a MANAGE recipient still can't delete — only the owner can
    assert api.delete(f"/api/secrets/{item['id']}", headers=bob.headers).status_code == 403
    assert api.delete(f"/api/secrets/{item['id']}", headers=alice.headers).status_code == 204
    assert response_data(api.get("/api/secrets", headers=bob.headers)) == []


def test_audit_log_pagination(api):
    alice = register(api, "alice")
    for _ in range(3):
        create_secret(api, alice)
    first = response_data(api.get("/api/audit", params={"limit": 2}, headers=alice.headers))
    assert len(first["items"]) == 2 and first["nextCursor"]
    second = response_data(
        api.get("/api/audit", params={"limit": 2, "cursor": first["nextCursor"]}, headers=alice.headers)
    )
    actions = [e["action"] for e in first["items"] + second["items"]]
    assert actions == ["SECRET_CREATE", "SECRET_CREATE", "SECRET_CREATE", "USER_REGISTER"]
    assert second["nextCursor"] is None


def test_health(api):
    data = response_data(api.get("/api/health"))
    assert data["status"] == "ok" and data["db"] == "ok"
    assert data["schema"] == "ready" and data["migrations"] == "up_to_date"
    assert data["databaseLatencyMs"] >= 0
    assert data["email"]["delivery"] == "not_tested"


def test_shared_with_count_changes_with_grants(api):
    alice, bob, carol = register(api, "alice"), register(api, "bob"), register(api, "carol")
    item = create_secret(api, alice)
    assert response_data(api.get("/api/secrets", headers=alice.headers))[0]["sharedWith"] == 0
    share(api, alice, item["id"], bob, "VIEW")
    share(api, alice, item["id"], carol, "MANAGE")
    assert response_data(api.get("/api/secrets", headers=alice.headers))[0]["sharedWith"] == 2
    api.delete(f"/api/secrets/{item['id']}/shares/{bob.id}", headers=alice.headers)
    assert response_data(api.get("/api/secrets", headers=alice.headers))[0]["sharedWith"] == 1
