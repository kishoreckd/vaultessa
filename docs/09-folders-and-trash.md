# Folder management and Trash

## Shared folders

Owners can share a folder with registered Vaultessa users using View or Edit access. The folder and its current and future items appear in the recipient's folder list, marked “Shared with you”. Owners manage membership, rename folders, and add or move items; editors can update existing items. Public folder links, delegated management, nested folders, and machine-token access through folder membership are not included.

The browser creates a random AES folder key when sharing is first enabled. It encrypts a separate shared folder name and wraps every current item key under this folder key. The owner stores the folder key encrypted under their vault key; each member receives an RSA-OAEP encrypted copy. New items and moves into an enabled folder must include their client-generated encrypted item key. Enabling sharing validates the exact current contents atomically; stale clients cannot silently omit items. Folders containing items owned by other people cannot be enabled for sharing.

`folder_shares` holds membership and View/Edit permissions; `folder_item_keys` holds owner-controlled contents and encrypted item keys. Folder grants are never converted into independent direct item grants. Effective access uses the highest permission from the direct share and folder membership. Moving out, deleting the folder, leaving, or removing a member ends inherited access while preserving independent direct shares. Trash removes the folder key wrapper and unfiles the item; restoration never restores inherited access. A recipient's private organisation of a directly shared item cannot change the owner's folder contents.

The API exposes `POST /folders/{id}/sharing`, `GET/POST /folders/{id}/members`, and `PATCH/DELETE /folders/{id}/members/{userId}`. Recipients can delete only their own membership. Folder listing returns recipient-specific wrapped folder keys; vault responses use a `FOLDER` key envelope for inherited-only access. Folder names, item payloads, and raw encryption keys remain encrypted on the server. Both new tables enable PostgreSQL RLS, matching the existing backend-only database access model.

The sharing drawer occupies the mobile screen width, has a scrolling body and fixed footer, and stacks member details above touch-sized permission/removal controls. Folder actions are visible without hover. Item creation and moves show sharing scope and ask for confirmation when folder access changes. Recipients leave from Manage folders.

Revocation removes future server access. As with existing direct shares, encryption keys are not rotated in this version. A removed member may retain previously retrieved keys or content, and previously copied secrets cannot be erased. Clients refresh on normal query refetch; there is no real-time remote wipe of already-open content. Sharing with a new folder member includes existing item history because versions use the item's existing key.

Apply migration `c35d91e229bb` before serving the updated API: from `backend`, run `.venv/Scripts/python.exe -m alembic upgrade head`. Deploy the frontend and backend together; older clients cannot add items to enabled folders without the required key wrappers.

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
