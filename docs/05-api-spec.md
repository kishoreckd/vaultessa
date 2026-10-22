# 05 — API Specification (v1, Phase 0)

Base URL: `/api`. JSON in/out. Auth: `Authorization: Bearer <accessToken>` unless marked *public*.
Live OpenAPI docs (non-production): `/api/docs`, schema at `/api/openapi.json`.
Request bodies reject unknown fields.
All 🔒 fields are EncStrings / wrapped keys produced by the client.

**Response envelope** (all JSON endpoints, including machine access):
```json
{ "status": "success", "message": "Success", "data": {} }
```
The response types in the tables below describe `data`. A message-only response
has `data: null`; message plus additional fields places those fields in `data`.
HTTP 201/202 codes, cookies, headers and background tasks are preserved. HTTP 204
has no body. OpenAPI/Swagger documents keep their standard format.

**Error shape** (non-2xx JSON):
```json
{ "status": "error", "message": "Human readable", "data": { "code": "VALIDATION_ERROR", "details": [] } }
```
Validation errors never echo submitted values. `data.code` remains machine readable
so UI actions, toasts and SDK callers can distinguish errors.

Codes: `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404,
`CONFLICT` 409, `RATE_LIMITED` 429, `INTERNAL` 500.

## Health
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | *public* → `{ status: "ok", db: "ok" }` |

## Auth
| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/auth/prelogin` *public* | `{ email }` | `{ kdf, kdfIterations, kdfSalt }` |
| POST | `/auth/register` *public* | `{ email, name, authHash, kdfIterations, kdfSalt, protectedVaultKey🔒, publicKey, protectedPrivateKey🔒 }` | `201 LoginResponse` + refresh cookie |
| POST | `/auth/login` *public* | `{ email, authHash }` | `LoginResponse` + refresh cookie, or `MfaChallenge` |
| POST | `/auth/refresh` *cookie* | — | `{ accessToken }` + rotated cookie |
| POST | `/auth/logout` *cookie* | — | `204`, cookie cleared |
| GET | `/auth/me` | — | `Account` |

```ts
type Account = {
  id: string; email: string; name: string;
  kdf: "PBKDF2_SHA256"; kdfIterations: number; kdfSalt: string;
  protectedVaultKey: string; publicKey: string; protectedPrivateKey: string;
};
type LoginResponse = { accessToken: string; account: Account };
```

## Folders
| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/folders` | — | `Folder[]` |
| POST | `/folders` | `{ encryptedName🔒 }` | `201 Folder` |
| PUT | `/folders/:id` | `{ encryptedName🔒 }` | `Folder` |
| DELETE | `/folders/:id` | — | `204` (secrets move to "no folder") |

`Folder = { id, encryptedName, createdAt, updatedAt }`

## Secrets
| Method | Path | Body | Response | Permission |
| --- | --- | --- | --- | --- |
| GET | `/secrets` | — | `VaultItem[]` | any access |
| POST | `/secrets` | `{ type, encryptedData🔒, wrappedKey🔒, folderId?, favorite? }` | `201 VaultItem` | — (caller becomes owner) |
| PUT | `/secrets/:id` | `{ encryptedData🔒, revision }` | `VaultItem` (409 if revision stale) | MODIFY |
| PATCH | `/secrets/:id/access` | `{ folderId?, favorite?, wrappedKey?🔒 }` | `VaultItem` | any (own row only); `wrappedKey` only to accept an RSA share as VAULT |
| DELETE | `/secrets/:id` | — | `204` | owner |
| GET | `/secrets/:id/history` | — | `{ id, encryptedData, changedBy, createdAt }[]` | VIEW |

```ts
type VaultItem = {
  id: string; type: SecretType; encryptedData: string; revision: number;
  ownerId: string; isOwner: boolean;
  owner: { id: string; name: string; email: string };   // shown as "Shared by …" to recipients
  wrappedKey: string; keyWrap: "VAULT" | "RSA"; permission: Permission;
  folderId: string | null; favorite: boolean;
  createdAt: string; updatedAt: string;
};
```

## Sharing
| Method | Path | Body | Response | Permission |
| --- | --- | --- | --- | --- |
| GET | `/users/lookup?email=` | — | `{ id, email, name, publicKey }` | authenticated |
| GET | `/secrets/:id/shares` | — | `{ userId, email, name, permission, isOwner }[]` | MANAGE |
| POST | `/secrets/:id/shares` | `{ userId, wrappedKey🔒 (RSA), permission }` | `201` | MANAGE |
| PATCH | `/secrets/:id/shares/:userId` | `{ permission }` | `200` | MANAGE |
| DELETE | `/secrets/:id/shares/:userId` | — | `204` | MANAGE (cannot remove owner) |

## Audit
| Method | Path | Query | Response |
| --- | --- | --- | --- |
| GET | `/audit` | `limit` (≤100), `cursor` | `{ items: AuditEntry[], nextCursor: string \| null }` |

## Versioning
Breaking changes go to `/api/v2`. EncString version prefix (`v1.`) versions the crypto independently.


## Account security and notifications (22 October 2026)

All account routes require the current bearer session. Secrets below are client-derived
proofs or ciphertext; master passwords never reach the server.

| Method | Path | Body / response |
| --- | --- | --- |
| POST | `/auth/login/mfa` (public) | `{ mfaToken, method: "totp" / "sms" / "recovery", code?, firebaseIdToken? }` ? LoginResponse |
| GET | `/account/security` | `{ totpEnabled, phone, recoveryCodesLeft, smsAvailable, emailAvailable }` |
| POST | `/account/mfa/totp/setup` | `{ secret, otpauthUri }`; pending seed sealed at rest |
| POST | `/account/mfa/totp/enable` | `{ code }` ? `{ recoveryCodes }`, shown once |
| POST | `/account/mfa/sms/enable` | `{ firebaseIdToken }` ? `{ recoveryCodes }` |
| POST | `/account/mfa/disable` | `{ method, authHash }` ? 204 |
| POST | `/account/mfa/recovery-codes` | `{ authHash }` ? `{ recoveryCodes }`; invalidates old codes |
| POST | `/account/password` | `{ authHash, newAuthHash, kdfSalt, kdfIterations, protectedVaultKey }` ? Account; revokes other sessions |
| GET | `/account/sessions` | `[{ id, ip, userAgent, createdAt, lastUsedAt, current }]` |
| DELETE | `/account/sessions/:id` | 204; own sessions only, current session excluded |
| POST | `/account/sessions/revoke-others` | `{ revoked }` |
| GET / PUT | `/account/notifications` | `{ sharing, links }`; security alerts always enabled |

`MfaChallenge = { mfaRequired: true, mfaToken, methods, phone }` creates no session.
Challenge expires after five minutes and is invalidated by a master-password change.
Account also includes `totpEnabled` and `mfaPhone`.

## Sharing insights and link limits

Vault-item responses include `sharedWith`, the count of people other than the owner
with access. `GET /external-shares` provides `secretId`, `status`, `viewCount`,
`maxViews`, `lastViewedAt`, `expiresAt`, `recipientEmail`, `outsideDomain`, `hasCode`
and the owner's encrypted `ownerKey` (plus creation/email metadata).

`PATCH /external-shares/:id/limits { expiresAt, maxViews }` changes an active link
without resetting usage. Owner plus current MANAGE access required. Limit is null
(unlimited) or 1?100 and must exceed views already used. Expiry is future, at most
90 days away. Used/revoked/expired/locked links must use the existing re-open flow.

`GET /audit?linkId=<uuid>&limit=50&cursor=<uuid>` filters the caller's own audit rows
by link ID. It preserves cursor pagination and never exposes another user's log.

## Developer tokens

| Method | Path | Body / response |
| --- | --- | --- |
| GET | `/tokens` | Own token metadata, item IDs and encrypted ownerKey |
| POST | `/tokens` | `{ name, authKey, ownerKey, expiresAt?, grants: [{ secretId, wrappedKey }] }` ? 201 token |
| PUT | `/tokens/:id/grants` | `{ grants }` replaces active token grants |
| DELETE | `/tokens/:id` | 204, immediately revokes token |
| GET | `/machine/secrets` | Machine bearer ? `[{ id, type, encryptedData, wrappedKey, revision, updatedAt }]` |

The UI-issued token is `pvm.<id>.<base64 root>`. SDKs derive independent HKDF auth
and encryption keys. The machine bearer substitutes the derived auth key for the
root. The server stores only SHA-256 of that auth key, rechecks creator access on
every read, and excludes LOGIN_ONLY grants. See `packages/README.md`.


## Welcome, verification and vault recovery

Email-code verification and recovery include a 45-second server-enforced resend cooldown,
single-use six-digit codes, and a current-password reuse check during reset.
Implemented endpoints, requests, expiry/replay semantics and the `Account.emailVerified`
field are documented in [13-email-verification-and-recovery.md](13-email-verification-and-recovery.md).

## Organisations and teams

All routes below require a session. Team creation and invitation/domain joining require a verified email.

| Method | Path (under `/api`) | Access |
| --- | --- | --- |
| GET / POST | `/organizations` | List memberships / create as owner |
| GET | `/organizations/invitations` | Own verified-email invitations |
| POST | `/organizations/invitations/{id}/accept` | Exact invited verified email |
| GET | `/organizations/discover` | Discover opt-in teams for verified email domain |
| POST | `/organizations/{id}/join` | Matching verified domain, active claim, opt-in policy |
| PATCH | `/organizations/{id}` | Owner: name/domain-join policy |
| GET | `/organizations/{id}/members` | Active member directory |
| PATCH | `/organizations/{id}/members/{userId}` | Owner: admin/member role |
| DELETE | `/organizations/{id}/members/{userId}` | Deactivate member or leave, with role checks |
| POST | `/organizations/{id}/transfer` | Owner plus authHash reauthentication |
| GET / POST | `/organizations/{id}/invitations` | Owner/admin; admin invitations owner-only |
| DELETE | `/organizations/{id}/invitations/{invitationId}` | Revoke with role checks |
| GET / POST | `/organizations/{id}/domains` | Owner: DNS challenges |
| POST | `/organizations/{id}/domains/{domainId}/verify` | Owner: verify TXT |
| DELETE | `/organizations/{id}/domains/{domainId}` | Owner: remove domain and disable domain joining |

Share creation accepts optional `organizationId`. Both sender and recipient must be active members;
delegated team access stays in that team. Share and vault DTOs expose nullable `organizationId`.
See [teams](17-organisations-and-teams.md) for semantics and limitations.

## Verified-email access gate

Registration/login responses can return an account with `emailVerified=false` and a restricted session. Such sessions can fetch `/auth/me`, refresh or sign out, but protected APIs reject them with `403 EMAIL_NOT_VERIFIED` until the email token is confirmed. The frontend routes these accounts to `/verify-email` and keeps vault keys locked. This check also covers existing machine tokens. See [verification and recovery](13-email-verification-and-recovery.md).
