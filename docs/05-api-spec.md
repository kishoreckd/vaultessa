# 05 — API Specification (v1, Phase 0)

Base URL: `/api`. JSON in/out. Auth: `Authorization: Bearer <accessToken>` unless marked *public*.
Live OpenAPI docs (non-production): `/api/docs`, schema at `/api/openapi.json`.
Request bodies reject unknown fields.
All 🔒 fields are EncStrings / wrapped keys produced by the client.

**Error shape** (every non-2xx):
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "details": [] } }
```
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
| POST | `/auth/login` *public* | `{ email, authHash }` | `LoginResponse` + refresh cookie |
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
