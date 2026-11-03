"""Local regression budgets for real PostgreSQL, using synthetic encrypted fixtures."""

import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from statistics import median

from sqlalchemy import event

from app.constants.vault import KeyWrap, Permission, SecretType
from app.db.models.folder_model import Folder
from app.db.models.folder_share_model import FolderItemKey, FolderShare
from app.db.models.secret_access_model import SecretAccess
from app.db.models.secret_model import Secret
from app.db.session import SessionLocal, engine
from app.services.folder_sharing_service import visible_folders
from app.services.secrets_service import list_vault, move_secrets

from .helpers import ENC, RSA_WRAPPED, register


def test_large_folder_query_budget(api):
    owner, recipient = register(api, "owner"), register(api, "recipient")
    owner_id, recipient_id = uuid.UUID(owner.id), uuid.UUID(recipient.id)
    with SessionLocal() as db:
        folder = Folder(user_id=owner_id, encrypted_name=ENC, wrapped_key=ENC, shared_name=ENC)
        db.add(folder)
        db.flush()
        folder_id = folder.id
        db.add(
            FolderShare(folder_id=folder_id, user_id=recipient_id, wrapped_key=RSA_WRAPPED, permission="VIEW")
        )
        ids = [uuid.uuid4() for _ in range(1000)]
        db.add_all([Secret(id=i, owner_id=owner_id, type=SecretType.LOGIN, encrypted_data=ENC) for i in ids])
        db.flush()
        db.add_all(
            [
                SecretAccess(
                    secret_id=i,
                    user_id=owner_id,
                    permission=Permission.MANAGE,
                    key_wrap=KeyWrap.VAULT,
                    wrapped_key=ENC,
                    folder_id=folder_id,
                )
                for i in ids
            ]
        )
        db.add_all([FolderItemKey(secret_id=i, folder_id=folder_id, wrapped_key=ENC) for i in ids])
        db.commit()

    measurements = {}
    statements = []

    def capture(_conn, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture)
    try:
        for label, action in [
            ("list_1000", lambda db: list_vault(db, recipient_id)),
            ("folders", lambda db: visible_folders(db, recipient_id)),
            ("move_out_1000", lambda db: move_secrets(db, owner_id, ids, None)),
            ("move_in_1000", lambda db: move_secrets(db, owner_id, ids, folder_id, dict.fromkeys(ids, ENC))),
        ]:
            statements.clear()
            start = time.perf_counter()
            with SessionLocal() as db:
                result = action(db)
                db.commit()
            measurements[label] = {
                "queries": len(statements),
                "ms": round((time.perf_counter() - start) * 1000, 1),
            }
            if label == "list_1000":
                assert len(result) == 1000
            if label.startswith("move"):
                assert len(result["moved"]) == 1000
                assert result["failed"] == []
    finally:
        event.remove(engine, "before_cursor_execute", capture)
    print("\nFOLDER_PERFORMANCE " + json.dumps(measurements, sort_keys=True))
    assert all(value["queries"] <= 8 for value in measurements.values()), measurements

    def read_vault(_):
        start = time.perf_counter()
        response = api.get("/api/secrets", headers=recipient.headers)
        assert response.status_code == 200
        assert len(response.json()["data"]) == 1000
        return (time.perf_counter() - start) * 1000

    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=4) as pool:
        latencies = sorted(pool.map(read_vault, range(16)))
    print(
        "FOLDER_LOCAL_LOAD "
        + json.dumps(
            {
                "requests": 16,
                "concurrency": 4,
                "median_ms": round(median(latencies), 1),
                "p95_ms": round(latencies[-1], 1),
                "requests_per_second": round(16 / (time.perf_counter() - start), 1),
            }
        )
    )
