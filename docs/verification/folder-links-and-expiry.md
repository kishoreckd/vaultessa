# Folder links and membership expiry — 3 November 2026

This update follows the [original folder-sharing review](folder-sharing-review.md). It adds the share-link and timing features missing from the first version; it does not remediate the previously recorded backend dependency advisories or implement encryption-key rotation.

## Delivered behaviour

- The folder sharing drawer has People and Share link tabs. A person without an account can be redirected to the link flow with their email preserved.
- Live View/Edit membership supports no expiry or a duration of 1 hour, 24 hours, 7 days, or 30 days. Owners can change or clear an existing expiry and renew expired membership. The API accepts a future timezone-aware timestamp and filters expired membership from access checks, folder/item listing, and active member counts.
- Folder snapshot links use the existing secure-link tokens and lifecycle: one-time access or a period, expiry, optional view limits, optional access codes, copy link/code/message, email invitation, revoke, reopen the same URL, and usage/limit management from Shared links.
- Link creators choose owned, decryptable items from the folder. A snapshot includes all selected items' fields. Later edits, additions and moves are excluded. Reopening the same link restores the original snapshot, rather than silently changing its contents.
- A guest without an account can view grouped items and reveal/copy individual secret fields. One guest opening counts as one view of the whole snapshot. Wrong codes are attempt-limited; view counters remain serialized for concurrent opens.
- Trashing any included item revokes its containing snapshots and erases guest ciphertext and owner recovery material. Restoring the item does not restore old snapshots. Deleting the folder revokes its snapshots and preserves the items.
- Folder links appear alongside item links in Shared links. Narrow layouts use cards; timing, copy, revoke and expiry controls have touch-sized targets. Server email uses a folder-specific subject and omits the access code. Actual email delivery was mocked in tests; no messages were sent to real recipients.

## Verification

- Full backend suite: **203 passed**, including nine new folder-link/expiry tests. One existing Starlette/AnyIO deprecation warning remains.
- Frontend suite: **192 passed**, including actual snapshot encryption/decryption, wrong-code rejection, frozen values and reopening the same token. Strict TypeScript passes.
- Browser API contracts: **89 operations, 96 request/response assertions passed**.
- Backend Ruff lint and affected Python formatting pass; reviewed frontend files pass pinned Prettier 3.6.2 checks.
- Production build and artifact budgets pass. The vault route is approximately **20.1 KiB gzip**, below its **30 KiB** budget. Existing auth import and large chunk build warnings remain.
- The backend test database is created through the actual Alembic migration chain, including the new schema.
- Browser/device visual verification, real-user performance, and a live deployment smoke test remain unverified. The browser automation host was unavailable in the earlier verification run; static review and automated tests do not establish real-device usability.

## Rollout

Deploy the frontend and backend together. From `backend`, apply:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Migration `d46ea2f33acc` follows `c35d91e229bb`. It adds membership expiry, link kind/folder metadata and an RLS-enabled snapshot-source table. Existing item links remain item links, and existing folder memberships retain no expiry.

Expiry and revocation stop future server access; they cannot erase previously copied plaintext or keys. Member access and snapshot links are independent grants with separate lifetimes. Snapshot payloads are limited to 1,000 selected items and 650,000 plaintext UTF-8 bytes before encryption. Previously documented security findings remain open.
