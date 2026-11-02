import uuid
from concurrent.futures import ThreadPoolExecutor

from app.db.models.external_share_model import ExternalShare
from app.db.models.folder_model import Folder
from app.db.models.secret_model import Secret
from app.db.session import SessionLocal

from .helpers import ENC, ENC_2, create_secret, register, response_data, share


def folder(api, user, fingerprint="a" * 64):
    return api.post(
        "/api/folders", headers=user.headers, json={"encryptedName": ENC, "nameFingerprint": fingerprint}
    )


def test_folder_unique_constraint_and_rename(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    first = response_data(folder(api, alice))
    assert folder(api, alice).status_code == 409
    assert folder(api, bob).status_code == 201
    second = response_data(folder(api, alice, "b" * 64))
    rename = api.put(
        f"/api/folders/{second['id']}",
        headers=alice.headers,
        json={"encryptedName": ENC_2, "nameFingerprint": "a" * 64},
    )
    assert rename.status_code == 409
    assert (
        api.put(
            f"/api/folders/{first['id']}",
            headers=bob.headers,
            json={"encryptedName": ENC_2, "nameFingerprint": "c" * 64},
        ).status_code
        == 404
    )
    assert (
        api.put(
            f"/api/folders/{second['id']}",
            headers=alice.headers,
            json={"encryptedName": ENC_2, "nameFingerprint": "c" * 64},
        ).status_code
        == 200
    )
    assert folder(api, alice, "b" * 64).status_code == 201


def test_concurrent_folder_creation_has_one_winner(api):
    alice = register(api, "alice")
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda _: folder(api, alice).status_code, range(2)))
    assert sorted(statuses) == [201, 409]
    assert len(response_data(api.get("/api/folders", headers=alice.headers))) == 1


def test_legacy_duplicates_are_preserved_and_backfilled_privately(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    with SessionLocal() as db:
        entries = [Folder(user_id=uuid.UUID(alice.id), encrypted_name=ENC) for _ in range(2)]
        db.add_all(entries)
        db.commit()
        ids = [str(entry.id) for entry in entries]
    payload = {"folders": [{"id": item, "nameFingerprint": "d" * 64} for item in ids]}
    assert api.post("/api/folders/fingerprints", headers=bob.headers, json=payload).status_code == 404
    assert api.post("/api/folders/fingerprints", headers=alice.headers, json=payload).status_code == 204
    rows = response_data(api.get("/api/folders", headers=alice.headers))
    assert len(rows) == 2
    assert sum(row["nameFingerprint"] is not None for row in rows) == 1
    assert folder(api, alice, "d" * 64).status_code == 409


def test_batch_move_checks_ownership_and_destination(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    one, two = create_secret(api, alice), create_secret(api, alice)
    other = create_secret(api, bob)
    dest = response_data(folder(api, alice))
    result = api.post(
        "/api/secrets/move",
        headers=alice.headers,
        json={"ids": [one["id"], other["id"], two["id"], one["id"]], "folderId": dest["id"]},
    )
    assert response_data(result) == {"moved": [one["id"], two["id"]], "failed": [other["id"]]}
    assert all(
        item["folderId"] == dest["id"]
        for item in response_data(api.get("/api/secrets", headers=alice.headers))
    )
    assert (
        api.post(
            "/api/secrets/move", headers=bob.headers, json={"ids": [other["id"]], "folderId": dest["id"]}
        ).status_code
        == 404
    )
    assert api.post("/api/secrets/move", headers=alice.headers, json={"ids": []}).status_code == 400


def test_trash_restore_purge_and_revoked_access(api):
    alice, bob = register(api, "alice"), register(api, "bob")
    item = create_secret(api, alice)
    assert share(api, alice, item["id"], bob, "VIEW").status_code == 201
    with SessionLocal() as db:
        from datetime import UTC, datetime, timedelta

        link = ExternalShare(
            owner_id=uuid.UUID(alice.id),
            secret_id=uuid.UUID(item["id"]),
            encrypted_data=ENC,
            owner_key_enc=ENC,
            expires_at=datetime.now(UTC) + timedelta(days=1),
        )
        db.add(link)
        db.commit()
        link_id = link.id
    assert api.delete(f"/api/secrets/{item['id']}", headers=alice.headers).status_code == 204
    assert response_data(api.get("/api/secrets", headers=alice.headers)) == []
    assert response_data(api.get("/api/secrets", headers=bob.headers)) == []
    assert len(response_data(api.get("/api/secrets/trash", headers=alice.headers))) == 1
    assert response_data(api.get("/api/secrets/trash", headers=bob.headers)) == []
    assert api.post(f"/api/secrets/{item['id']}/restore", headers=bob.headers).status_code == 404
    assert api.get(f"/api/secrets/{item['id']}/history", headers=alice.headers).status_code == 404
    with SessionLocal() as db:
        link = db.get(ExternalShare, link_id)
        assert link.revoked_at and link.encrypted_data is None and link.owner_key_enc is None
    assert api.post(f"/api/secrets/{item['id']}/restore", headers=alice.headers).status_code == 204
    restored = response_data(api.get("/api/secrets", headers=alice.headers))[0]
    assert restored["encryptedData"] == item["encryptedData"] and restored["sharedWith"] == 0
    assert response_data(api.get("/api/secrets", headers=bob.headers)) == []
    assert api.delete(f"/api/secrets/{item['id']}/permanent", headers=alice.headers).status_code == 404
    assert api.delete(f"/api/secrets/{item['id']}", headers=alice.headers).status_code == 204
    assert api.delete(f"/api/secrets/{item['id']}/permanent", headers=alice.headers).status_code == 204
    assert response_data(api.get("/api/secrets/trash", headers=alice.headers)) == []
    with SessionLocal() as db:
        assert db.get(Secret, uuid.UUID(item["id"])) is None
