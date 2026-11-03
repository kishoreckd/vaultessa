"""Folder snapshots reuse the item-link lifecycle; live grants expire independently."""

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

from app.db.models.external_share_model import ExternalShare
from app.db.models.folder_share_model import FolderShare
from app.db.session import SessionLocal
from app.services.email_service import EmailDeliveryResult

from .helpers import ENC, ENC_2, RSA_WRAPPED, b64, create_secret, register, response_data, share
from .test_folder_sharing import items, setup_folder


def expires(hours=24):
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


def create_link(api, owner, folder, item_ids, **overrides):
    return api.post(
        "/api/external-shares",
        headers=owner.headers,
        json={
            "folderId": folder["id"],
            "secretIds": item_ids,
            "encryptedData": ENC,
            "expiresAt": expires(),
            "ownerKey": ENC_2,
            **overrides,
        },
    )


def test_membership_expiry_is_enforced_everywhere_and_direct_share_survives(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    folder, item, base = setup_folder(api, alice, bob, "MODIFY")
    assert share(api, alice, item["id"], bob, "VIEW").status_code == 201
    url = base + f"/members/{bob.id}"
    assert api.patch(url, headers=bob.headers, json={"expiresAt": expires()}).status_code == 404
    assert api.patch(url, headers=alice.headers, json={"expiresAt": expires(-1)}).status_code == 400
    assert api.patch(url, headers=alice.headers, json={"expiresAt": "2026-11-03T10:00:00"}).status_code == 400
    assert api.patch(url, headers=alice.headers, json={}).status_code == 400
    assert api.patch(url, headers=alice.headers, json={"expiresAt": expires()}).status_code == 204
    members = response_data(api.get(base + "/members", headers=alice.headers))
    assert members[0]["expiresAt"] is not None and members[0]["active"] is True
    with SessionLocal() as db:
        db.get(FolderShare, (uuid.UUID(folder["id"]), uuid.UUID(bob.id))).expires_at = datetime.now(
            UTC
        ) - timedelta(seconds=1)
        db.commit()
    assert response_data(api.get("/api/folders", headers=bob.headers)) == []
    received = items(api, bob)[0]
    assert received["permission"] == "VIEW" and received["keyWrap"] == "RSA"
    assert (
        api.put(
            f"/api/secrets/{item['id']}", headers=bob.headers, json={"encryptedData": ENC_2, "revision": 0}
        ).status_code
        == 403
    )
    assert response_data(api.get(base + "/members", headers=alice.headers))[0]["active"] is False
    assert response_data(api.get("/api/folders", headers=alice.headers))[0]["memberCount"] == 0
    assert api.patch(url, headers=alice.headers, json={"expiresAt": None}).status_code == 204
    assert items(api, bob)[0]["permission"] == "MODIFY"


def test_grant_with_expiry_and_expired_only_access(api):
    alice, bob, eve = register(api, "alice"), register(api, "bob"), register(api, "eve")
    folder, item, base = setup_folder(api, alice, bob)
    payload = {"userId": eve.id, "wrappedKey": RSA_WRAPPED, "permission": "VIEW", "expiresAt": expires(-1)}
    assert api.post(base + "/members", headers=alice.headers, json=payload).status_code == 400
    assert (
        api.post(
            base + "/members", headers=alice.headers, json={**payload, "expiresAt": expires()}
        ).status_code
        == 201
    )
    with SessionLocal() as db:
        db.get(FolderShare, (uuid.UUID(folder["id"]), uuid.UUID(eve.id))).expires_at = datetime.now(
            UTC
        ) - timedelta(seconds=1)
        db.commit()
    assert items(api, eve) == []
    assert api.get(f"/api/secrets/{item['id']}/history", headers=eve.headers).status_code == 404


def test_folder_snapshot_lifecycle_and_filtering(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    folder, first, _ = setup_folder(api, alice, bob)
    second = create_secret(api, alice, folderId=folder["id"], folderWrappedKey=ENC)
    link = response_data(create_link(api, alice, folder, [first["id"], second["id"]], maxViews=2))
    assert link["kind"] == "folder" and link["folderId"] == folder["id"] and link["secretId"] is None
    assert (
        len(
            response_data(
                api.get("/api/external-shares", params={"folderId": folder["id"]}, headers=alice.headers)
            )
        )
        == 1
    )
    assert (
        response_data(
            api.get("/api/external-shares", params={"secretId": first["id"]}, headers=alice.headers)
        )
        == []
    )
    assert response_data(api.get("/api/external-shares", headers=bob.headers)) == []
    assert (
        api.put(
            f"/api/secrets/{first['id']}", headers=alice.headers, json={"encryptedData": ENC_2, "revision": 0}
        ).status_code
        == 200
    )
    create_secret(api, alice, folderId=folder["id"], folderWrappedKey=ENC)
    assert (
        api.post(
            "/api/secrets/move", headers=alice.headers, json={"ids": [first["id"]], "folderId": None}
        ).status_code
        == 200
    )
    public = f"/api/public/shares/{link['id']}/open"
    assert response_data(api.post(public, json={}))["encryptedData"] == ENC
    assert (
        api.patch(
            f"/api/external-shares/{link['id']}/limits",
            headers=alice.headers,
            json={"expiresAt": expires(48), "maxViews": 3},
        ).status_code
        == 200
    )
    assert api.delete(f"/api/external-shares/{link['id']}", headers=alice.headers).status_code == 204
    assert api.post(public, json={}).status_code == 410
    assert (
        api.post(
            f"/api/external-shares/{link['id']}/reopen",
            headers=alice.headers,
            json={"encryptedData": ENC, "expiresAt": expires(), "maxViews": 1},
        ).status_code
        == 200
    )
    assert api.post(public, json={}).status_code == 200
    assert api.post(public, json={}).status_code == 410


def test_folder_link_codes_expiry_and_atomic_one_time_views(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    folder, item, _ = setup_folder(api, alice, bob)
    salt, verifier = b64("sixteen-byte-slt"), b64("code-verifier")
    link = response_data(
        create_link(api, alice, folder, [item["id"]], maxViews=1, codeSalt=salt, codeVerifier=verifier)
    )
    public = f"/api/public/shares/{link['id']}/open"
    assert api.post(public, json={}).status_code == 401
    with ThreadPoolExecutor(max_workers=4) as pool:
        statuses = list(
            pool.map(lambda _: api.post(public, json={"codeVerifier": verifier}).status_code, range(4))
        )
    assert sorted(statuses) == [200, 410, 410, 410]
    expiring = response_data(create_link(api, alice, folder, [item["id"]]))
    with SessionLocal() as db:
        db.get(ExternalShare, uuid.UUID(expiring["id"])).expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    assert api.post(f"/api/public/shares/{expiring['id']}/open", json={}).status_code == 410
    assert create_link(api, alice, folder, [item["id"]], expiresAt=expires(-1)).status_code == 400
    assert create_link(api, alice, folder, [item["id"]], codeSalt=salt).status_code == 400


def test_folder_links_validate_owner_scope_and_target_shape(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    folder, item, _ = setup_folder(api, alice, bob)
    outside = create_secret(api, alice)
    other = create_secret(api, bob)
    assert create_link(api, bob, folder, [item["id"]]).status_code == 404
    for ids in [[], [outside["id"]], [other["id"]], [item["id"], item["id"]]]:
        assert create_link(api, alice, folder, ids).status_code in [400, 409]
    assert create_link(api, alice, folder, [item["id"]], secretId=item["id"]).status_code == 400
    link = response_data(create_link(api, alice, folder, [item["id"]]))
    assert (
        api.patch(
            f"/api/external-shares/{link['id']}/limits", headers=bob.headers, json={"expiresAt": expires()}
        ).status_code
        == 404
    )
    assert (
        api.post(
            f"/api/external-shares/{link['id']}/reopen",
            headers=bob.headers,
            json={"encryptedData": ENC, "expiresAt": expires()},
        ).status_code
        == 404
    )


def test_source_trash_revokes_snapshot_and_restore_does_not_reopen(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    folder, item, _ = setup_folder(api, alice, bob)
    link = response_data(create_link(api, alice, folder, [item["id"]]))
    assert api.delete(f"/api/secrets/{item['id']}", headers=alice.headers).status_code == 204
    assert api.post(f"/api/public/shares/{link['id']}/open", json={}).status_code == 410
    assert api.post(f"/api/secrets/{item['id']}/restore", headers=alice.headers).status_code == 204
    assert (
        api.post(
            f"/api/external-shares/{link['id']}/reopen",
            headers=alice.headers,
            json={"encryptedData": ENC, "expiresAt": expires()},
        ).status_code
        == 400
    )
    with SessionLocal() as db:
        saved = db.get(ExternalShare, uuid.UUID(link["id"]))
        assert saved.encrypted_data is None and saved.owner_key_enc is None


def test_folder_delete_revokes_snapshot_payload_and_preserves_items(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    folder, item, base = setup_folder(api, alice, bob)
    link = response_data(create_link(api, alice, folder, [item["id"]]))
    assert api.delete(base, headers=alice.headers).status_code == 204
    assert api.post(f"/api/public/shares/{link['id']}/open", json={}).status_code == 410
    saved = response_data(api.get("/api/external-shares", headers=alice.headers))[0]
    assert saved["kind"] == "folder" and saved["folderId"] is None and saved["ownerKey"] is None
    assert len(items(api, alice)) == 1


def test_folder_link_email_uses_existing_delivery_and_validates_url(api, monkeypatch):
    from app.api import external_shares as endpoint

    alice, bob = register(api, "alice"), register(api, "bob")
    folder, item, _ = setup_folder(api, alice, bob)
    link = response_data(
        create_link(
            api,
            alice,
            folder,
            [item["id"]],
            recipientEmail="guest@example.com",
            codeSalt=b64("sixteen-byte-slt"),
            codeVerifier=b64("code-verifier"),
        )
    )
    delivered = []
    monkeypatch.setattr(endpoint, "email_enabled", lambda: True)

    def send(recipient, subject, text, html):
        delivered.append((recipient, subject, text, html))
        return EmailDeliveryResult(status="accepted", message="Accepted")

    monkeypatch.setattr(endpoint, "send_email", send)
    path = f"/api/external-shares/{link['id']}/email"
    assert (
        api.post(
            path, headers=bob.headers, json={"link": f"http://127.0.0.1:5173/s/{link['id']}#key"}
        ).status_code
        == 404
    )
    assert (
        api.post(path, headers=alice.headers, json={"link": "https://evil.example/s/other#key"}).status_code
        == 400
    )
    result = api.post(path, headers=alice.headers, json={"link": f"http://127.0.0.1:5173/s/{link['id']}#key"})
    assert result.status_code == 200, result.text
    assert response_data(result)["emailed"] is True
    assert delivered[0][0] == "guest@example.com"
    assert "folder snapshot" in delivered[0][1]
    assert "separately" in delivered[0][2]


def test_private_folder_can_create_snapshot_without_live_sharing(api):
    alice = register(api, "alice")
    folder = response_data(
        api.post(
            "/api/folders", headers=alice.headers, json={"encryptedName": ENC, "nameFingerprint": "a" * 64}
        )
    )
    item = create_secret(api, alice, folderId=folder["id"])
    result = create_link(api, alice, folder, [item["id"]])
    assert result.status_code == 201, result.text
    assert response_data(api.get("/api/folders", headers=alice.headers))[0]["wrappedKey"] is None
