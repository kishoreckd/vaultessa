"""Exercise folder inheritance independently of direct grants through the HTTP API."""

from .helpers import ENC, ENC_2, RSA_WRAPPED, create_secret, register, response_data, share


def setup_folder(api, owner, recipient, permission="VIEW"):
    folder = response_data(
        api.post(
            "/api/folders", headers=owner.headers, json={"encryptedName": ENC, "nameFingerprint": "a" * 64}
        )
    )
    item = create_secret(api, owner, folderId=folder["id"])
    base = f"/api/folders/{folder['id']}"
    enabled = api.post(
        base + "/sharing",
        headers=owner.headers,
        json={
            "wrappedKey": ENC,
            "sharedName": ENC_2,
            "items": [{"secretId": item["id"], "wrappedKey": ENC_2}],
        },
    )
    assert enabled.status_code == 204, enabled.text
    granted = api.post(
        base + "/members",
        headers=owner.headers,
        json={"userId": recipient.id, "wrappedKey": RSA_WRAPPED, "permission": permission},
    )
    assert granted.status_code == 201, granted.text
    return folder, item, base


def items(api, user):
    return response_data(api.get("/api/secrets", headers=user.headers))


def test_existing_and_future_items_are_inherited(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    folder, item, _ = setup_folder(api, alice, bob)
    received = items(api, bob)
    assert len(received) == 1
    assert received[0]["keyWrap"] == "FOLDER"
    assert received[0]["permission"] == "VIEW"
    assert received[0]["inheritedFolderId"] == folder["id"]
    assert items(api, alice)[0]["sharedWith"] == 1
    folders = response_data(api.get("/api/folders", headers=bob.headers))
    assert folders[0]["isOwner"] is False
    assert folders[0]["encryptedName"] == ENC_2
    assert folders[0]["wrappedKey"] == RSA_WRAPPED
    future = create_secret(api, alice, folderId=folder["id"], folderWrappedKey=ENC)
    assert {i["id"] for i in items(api, bob)} == {item["id"], future["id"]}
    missing_key = api.post(
        "/api/secrets",
        headers=alice.headers,
        json={"type": "LOGIN", "encryptedData": ENC, "wrappedKey": ENC, "folderId": folder["id"]},
    )
    assert missing_key.status_code == 409


def test_permissions_and_owner_only_membership(api):
    alice, bob, eve = register(api, "alice"), register(api, "bob"), register(api, "eve")
    folder, item, base = setup_folder(api, alice, bob)
    path = f"/api/secrets/{item['id']}"
    assert api.put(path, headers=bob.headers, json={"encryptedData": ENC_2, "revision": 0}).status_code == 403
    assert api.get(base + "/members", headers=bob.headers).status_code == 404
    assert (
        api.post(
            base + "/members",
            headers=bob.headers,
            json={"userId": eve.id, "wrappedKey": RSA_WRAPPED, "permission": "VIEW"},
        ).status_code
        == 404
    )
    assert (
        api.patch(
            base + f"/members/{bob.id}", headers=alice.headers, json={"permission": "MODIFY"}
        ).status_code
        == 204
    )
    changed = api.put(path, headers=bob.headers, json={"encryptedData": ENC_2, "revision": 0})
    assert changed.status_code == 200, changed.text
    assert items(api, alice)[0]["encryptedData"] == ENC_2
    assert api.delete(path, headers=bob.headers).status_code == 403
    assert (
        api.post(
            "/api/secrets",
            headers=bob.headers,
            json={
                "type": "LOGIN",
                "encryptedData": ENC,
                "wrappedKey": ENC,
                "folderId": folder["id"],
                "folderWrappedKey": ENC,
            },
        ).status_code
        == 404
    )
    assert api.get(path + "/history", headers=eve.headers).status_code == 404
    assert (
        api.patch(
            base + f"/members/{bob.id}", headers=alice.headers, json={"permission": "MANAGE"}
        ).status_code
        == 400
    )


def test_move_revoke_and_direct_access_are_independent(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    folder, item, base = setup_folder(api, alice, bob, "MODIFY")
    assert share(api, alice, item["id"], bob, "VIEW").status_code == 201
    assert items(api, bob)[0]["permission"] == "MODIFY"
    moved = api.post("/api/secrets/move", headers=alice.headers, json={"ids": [item["id"]], "folderId": None})
    assert moved.status_code == 200
    assert items(api, bob)[0]["keyWrap"] == "RSA"
    assert items(api, bob)[0]["permission"] == "VIEW"
    assert (
        api.post(
            "/api/secrets/move",
            headers=alice.headers,
            json={"ids": [item["id"]], "folderId": folder["id"], "folderWrappedKeys": {item["id"]: ENC}},
        ).status_code
        == 200
    )
    assert items(api, bob)[0]["permission"] == "MODIFY"
    assert api.delete(base + f"/members/{bob.id}", headers=alice.headers).status_code == 204
    assert items(api, bob)[0]["permission"] == "VIEW"
    assert response_data(api.get("/api/folders", headers=bob.headers)) == []


def test_trash_restore_and_folder_deletion_do_not_regrant(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    folder, item, base = setup_folder(api, alice, bob)
    assert api.delete(f"/api/secrets/{item['id']}", headers=alice.headers).status_code == 204
    assert items(api, bob) == []
    assert api.post(f"/api/secrets/{item['id']}/restore", headers=alice.headers).status_code == 204
    assert items(api, bob) == []
    assert items(api, alice)[0]["folderId"] is None
    create_secret(api, alice, folderId=folder["id"], folderWrappedKey=ENC)
    assert len(items(api, bob)) == 1
    assert api.delete(base, headers=alice.headers).status_code == 204
    assert items(api, bob) == []
    assert len(items(api, alice)) == 2


def test_recipient_private_moves_cannot_remove_shared_contents(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    _, item, base = setup_folder(api, alice, bob)
    assert share(api, alice, item["id"], bob, "VIEW").status_code == 201
    private = response_data(
        api.post(
            "/api/folders", headers=bob.headers, json={"encryptedName": ENC, "nameFingerprint": "b" * 64}
        )
    )
    assert (
        api.patch(
            f"/api/secrets/{item['id']}/access", headers=bob.headers, json={"folderId": private["id"]}
        ).status_code
        == 200
    )
    assert items(api, alice)[0]["sharedWith"] == 1
    assert api.delete(f"/api/secrets/{item['id']}/shares/{bob.id}", headers=alice.headers).status_code == 204
    assert items(api, bob)[0]["keyWrap"] == "FOLDER"
    assert api.delete(base + f"/members/{bob.id}", headers=bob.headers).status_code == 204
    assert items(api, bob) == []


def test_enable_requires_exact_current_contents_and_ownership(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    folder = response_data(
        api.post(
            "/api/folders", headers=alice.headers, json={"encryptedName": ENC, "nameFingerprint": "a" * 64}
        )
    )
    create_secret(api, alice, folderId=folder["id"])
    base = f"/api/folders/{folder['id']}/sharing"
    payload = {"wrappedKey": ENC, "sharedName": ENC, "items": []}
    assert api.post(base, headers=bob.headers, json=payload).status_code == 404
    assert api.post(base, headers=alice.headers, json=payload).status_code == 409


def test_restoring_item_trashed_before_sharing_does_not_rejoin_shared_folder(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    folder = response_data(
        api.post(
            "/api/folders", headers=alice.headers, json={"encryptedName": ENC, "nameFingerprint": "a" * 64}
        )
    )
    item = create_secret(api, alice, folderId=folder["id"])
    assert api.delete(f"/api/secrets/{item['id']}", headers=alice.headers).status_code == 204
    base = f"/api/folders/{folder['id']}"
    assert (
        api.post(
            base + "/sharing", headers=alice.headers, json={"wrappedKey": ENC, "sharedName": ENC, "items": []}
        ).status_code
        == 204
    )
    assert (
        api.post(
            base + "/members",
            headers=alice.headers,
            json={"userId": bob.id, "wrappedKey": RSA_WRAPPED, "permission": "VIEW"},
        ).status_code
        == 201
    )
    assert api.post(f"/api/secrets/{item['id']}/restore", headers=alice.headers).status_code == 204
    assert items(api, alice)[0]["folderId"] is None
    assert items(api, bob) == []
