# Folder management and Trash

The vault supports create, rename, select and delete folder actions on desktop and in the mobile Manage folders dialog. Deleting a folder preserves its items, which become unfiled.

## Folder identity

Folder names remain AES-GCM encrypted. The client derives a separate, non-exportable HMAC-SHA256 key from the existing vault key with HKDF-SHA256 (salt `Vaultessa/folders/v1`, info `name-fingerprint`). A fingerprint signs the NFKC-normalized, trimmed, lowercase name. Only the resulting 64-character hex fingerprint is sent to the backend, revealing equality within one vault but not readable names or equality across different vaults.

Create and rename require `nameFingerprint`. PostgreSQL enforces `(user_id, name_fingerprint)` uniqueness. A per-user row lock serializes these writes and legacy fingerprint registration. Concurrent requests for the same identity return one success and one HTTP 409. An untrusted client can mislabel a fingerprint; the server cannot independently verify encrypted names.

On unlock, the key is derived before raw vault-key bytes are erased. It is retained with the other non-exportable keys for the existing remembered-unlock lease. Old remembered sessions without this key require one fresh unlock. Password changes preserve the vault key and therefore folder identities.

Legacy folders are backfilled after client-side decryption via `POST /api/folders/fingerprints`. Existing duplicate folders and unreadable folders are not deleted or merged. One readable duplicate claims the fingerprint; the others remain manageable. The client checks every readable name before creating or renaming. A null fingerprint is reserved for legacy folders, not new writes.

## Batch moves

`POST /api/secrets/move` accepts `ids` (1?1000 UUIDs) and a nullable `folderId`. The server validates the user's destination, deduplicates IDs, updates owned active items in one transaction, and returns `moved` and `failed` IDs without revealing another user's data. Failed selections remain selected for retry. Each moved item has an audit event.

## Recoverable deletion

`DELETE /api/secrets/{id}` now moves an owner's item to Trash, keeping its encrypted data, wrapped key and history. Trashed items are hidden from the active vault and ordinary access APIs. Recipient access rows and API-token grants are removed; external links are revoked and their payloads and owner material cleared. Expiry reminders omit trashed items.

`GET /api/secrets/trash` lists only the owner's trashed items. `POST /api/secrets/{id}/restore` restores the item without reinstating sharing or token grants. `DELETE /api/secrets/{id}/permanent` requires an already-trashed item and irreversibly removes it and its history. The UI requires confirmation for permanent deletion. Trash has no automatic expiry; items remain until restored or permanently deleted. Each action is audited.

## Local rollout and verification

Apply `backend/.venv/Scripts/python.exe -m alembic upgrade head` from `backend` before starting the updated backend. Migration `b24c90d118aa` adds the nullable legacy fingerprint, its unique constraint, and the secret deletion timestamp. It preserves existing data. Refresh the web client and unlock once if the prior session lacks the fingerprint key.

Automated tests cover normalization and vault separation, simultaneous duplicate creation, legacy backfill, private folder ownership, batch partial results, restore/purge permissions, and revoked sharing. Visual verification of mobile/light/dark layouts requires an available browser automation connection.
