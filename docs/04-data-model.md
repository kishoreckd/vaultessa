# 04 — Data Model

Source of truth: [backend/app/db/models/](../backend/app/db/models/) (SQLAlchemy) and the Alembic
migrations in [backend/migrations/versions](../backend/migrations/versions).
Field names below are as seen on the API (camelCase); database columns and tables are snake_case
(`kdfIterations` → `kdf_iterations`, `SecretAccess` → `secret_accesses`, `Session` → `sessions`).
🔒 = ciphertext (EncString) or wrapped key — the server cannot read it.

## Phase 0 (implemented)

```
User 1───* Session
User 1───* Folder
User 1───* Secret (owner)
User 1───* SecretAccess *───1 Secret
Folder 1───* SecretAccess          (each user files secrets into their own folders)
Secret 1───* SecretHistory
User 1───* AuditLog
```

### User
| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| email | string, unique | lower-cased |
| name | string | |
| authHash | string | `scrypt$…` of client auth hash |
| kdf / kdfIterations / kdfSalt | enum / int / string | client KDF params |
| protectedVaultKey | string 🔒 | vaultKey under KEK |
| publicKey | string | RSA SPKI, base64 |
| protectedPrivateKey | string 🔒 | pkcs8 under vaultKey |
| createdAt / updatedAt | timestamp | |

### Session
`id, userId, tokenHash (sha256 of refresh token, unique), userAgent, ip, expiresAt, lastUsedAt, createdAt`

### Folder
`id, userId, encryptedName 🔒, createdAt, updatedAt`

### Secret
| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| ownerId | uuid → User | |
| type | `SecretType` | LOGIN, SECURE_NOTE, CARD, IDENTITY, BANK_ACCOUNT, SSH_KEY, API_KEY, WIFI, SERVER |
| encryptedData | text 🔒 | JSON payload under secretKey |
| revision | int | optimistic concurrency |
| createdAt / updatedAt | timestamp | |

### SecretAccess (the access-control list *and* the key store)
| Field | Type | Notes |
| --- | --- | --- |
| secretId + userId | composite PK | |
| wrappedKey | text 🔒 | secretKey wrapped for this user |
| keyWrap | `KeyWrap` | `VAULT` (AES-GCM under user's vaultKey) or `RSA` (RSA-OAEP under user's public key) |
| permission | `Permission` | LOGIN_ONLY < VIEW < MODIFY < MANAGE |
| folderId | uuid? | the *user's* folder for this secret |
| favorite | bool | per user |
| grantedById | uuid? | who shared it |

### SecretHistory
`id, secretId, encryptedData 🔒, changedById, createdAt` — snapshot of the previous version on every update.
Encrypted under the same secretKey (P2 key rotation must re-encrypt history too).

### AuditLog
`id, userId?, action, targetType?, targetId?, ip?, userAgent?, metadata (jsonb, never secrets), createdAt`

## Personal + organisation model (decided 2026-10-21 — keep the schema wide enough for this)

The same app serves **individuals** (e.g. `@gmail.com`) and **organisations** (e.g. `@cxontology.com`).
One user account can have a personal vault and belong to an organisation.

**Identity — how someone proves who they are (many per user):**
| Entity | Purpose |
| --- | --- |
| UserIdentity | `provider` (PASSWORD, GOOGLE, OIDC, …), `subject` (provider's stable user id), `email`, `email_verified`, `hosted_domain` (Google Workspace `hd` claim — empty for personal `@gmail.com`), linked `user_id`. Unique (`provider`, `subject`). |
| EmailVerification | one-time codes proving the user owns their email address |

> Signing in with Google/OIDC proves *identity*; the **master password still unlocks the vault** (zero-knowledge).
> A Google account with an `hd` claim is a Google Workspace (organisation) account; `@gmail.com` has none.

**Organisations — tenancy:**
| Entity | Purpose |
| --- | --- |
| Organization | tenant: name, plan, settings, created_by |
| OrganizationDomain | `domain`, `verification_token`, `method` (DNS_TXT), `verified_at`. A domain is claimed by **one** organisation, only after its DNS TXT record is verified. Users signing up with a verified domain are offered/required to join. Works whether the company uses Google Workspace, Microsoft 365 or anything else. |
| OrgMember | user ↔ org: `role` (OWNER, ADMIN, MANAGER, MEMBER), `status` (INVITED, ACTIVE, SUSPENDED, REMOVED), `wrapped_org_key` (org key under the member's public key) |
| Invitation | email, role, token hash, expiry, invited_by |
| Group / GroupMember | bulk access management |
| Collection (shared folder) / CollectionAccess | collection key wrapped by the org key; per-user/group permission |
| OrgPolicy | 2FA required, master-password rules, max auto-lock, external sharing (allow / warn / allowed domains / block), max share-link duration, personal-vault allowed, export allowed |
| SsoConfig (P4) | per-org Google / OIDC settings; SCIM token |

**Ownership:** `Secret` gains `organization_id` + `collection_id` (nullable). Personal items: `organization_id IS NULL`, owned by the user and leave with them. Org items belong to the organisation and stay when a member leaves. Every org-scoped table carries `organization_id`, so tenant isolation can also be enforced with Postgres row-level security.

## Other planned entities

| Entity | Purpose |
| --- | --- |
| SecretTemplate | admin-defined custom secret types and fields |
| AccessRequest | request → approve → time-boxed access |
| EmergencyContact | trustee + wait period |
| Attachment | encrypted file blob pointer |
| WebAuthnCredential | passkeys / security keys for login |

## Indexing notes
- `SecretAccess(userId)` — vault list query.
- `AuditLog(userId, createdAt desc)` — audit page pagination.
- `Session(tokenHash)` unique — refresh lookup.


## Email verification and optional vault recovery (22 October 2026)

Migration `01176535d83b` adds to `users`: `email_verified` (false for existing rows),
`email_verification_hash` (indexed), expiry/sent timestamps, `recovery_auth_hash`
(scrypt of client-derived proof), `recovery_wrapped_vault_key` (client ciphertext),
`password_reset_hash` (indexed), expiry/sent timestamps and attempt counter.
Raw email tokens, recovery keys, unwrapped vault keys and master passwords are not
stored. Successful recovery clears its key/envelope and reset token, deletes all
sessions and revokes API tokens/grants without changing item ciphertext or MFA.

## Organisation membership

`organizations`, `organization_members`, `organization_invitations` and `organization_domains` store operational team metadata. `secret_accesses.organization_id` is nullable and marks team-scoped grants. Existing grants remain personal. See [teams](17-organisations-and-teams.md) for roles, concurrency, expiry and removal rules.
