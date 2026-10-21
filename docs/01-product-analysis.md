# 01 — Product Analysis: Zoho Vault

Zoho Vault is Zoho's password manager for individuals and businesses. Its defining traits are
**zero-knowledge client-side encryption**, **fine-grained password sharing inside an organisation**,
and **admin control / auditability** for IT teams. This doc breaks the product down into feature
areas, notes how each works, and maps it to our build phases (see [06-roadmap.md](06-roadmap.md)).

## 1. Editions (for positioning)

| Edition | Audience | Key differentiators |
| --- | --- | --- |
| Free | Single user | Unlimited passwords, notes, browser extensions, mobile apps |
| Standard | Small teams | Sharing with users/groups, admin console, basic audit |
| Professional | Mid-size | User groups, access reports, folder sharing, policies, AD/LDAP sync |
| Enterprise | Large orgs | SSO/SAML, access-request workflow, password reset automation, SIEM, API |

## 2. Feature inventory

Legend for **Phase**: P0 foundation (done), P1 personal MVP, P2 teams, P3 clients, P4 enterprise.

### 2.1 Vault & secrets

| Feature | How Zoho does it | Our approach | Phase |
| --- | --- | --- | --- |
| Store passwords ("secrets") | Secret = typed record (Web Account, Server, Bank…) with fields | `Secret` with `type` + one encrypted JSON payload | P0 |
| Secret types / templates | Built-in + admin-defined custom types with custom fields | Built-in enum now; `SecretTemplate` table in P2 | P0 / P2 |
| Secure notes | Note-only secret type | `SECURE_NOTE` type | P0 |
| File attachments | Encrypted files attached to a secret | Client-encrypted blobs in S3-compatible storage | P1 |
| Folders | Hierarchical, shareable folders | Per-user folders now; shared folders with folder keys in P2 | P0 / P2 |
| Favourites, tags, search | Client-side search over decrypted data | Same — search after decrypt | P0 (fav, search) / P1 (tags) |
| Password history | Previous versions kept per secret | `SecretHistory` with encrypted snapshots | P0 |
| Trash / restore | Deleted secrets recoverable | Soft-delete with `deletedAt` | P1 |
| TOTP (2FA codes) | Store TOTP seed, show rolling code | `totp` field in payload + RFC 6238 client generator | P1 |
| Import / export | CSV + competitor formats; encrypted export | CSV/Bitwarden/1Password/LastPass/Chrome importers | P1 |

### 2.2 Password tooling

| Feature | Our approach | Phase |
| --- | --- | --- |
| Password generator (chars / passphrase) | Unbiased CSPRNG generator, char classes; passphrase (EFF wordlist) in P1 | P0 / P1 |
| Strength meter | Entropy estimate now; zxcvbn-ts in P1 | P0 / P1 |
| Security dashboard (weak / reused / old) | Computed client-side from decrypted vault | P1 |
| Breach monitoring | HIBP Pwned Passwords k-anonymity (SHA-1 prefix) from client | P4 |
| Password policies | Admin-defined length/complexity/expiry rules, enforced on save | P2 |

### 2.3 Sharing & access control

| Feature | How Zoho does it | Our approach | Phase |
| --- | --- | --- | --- |
| Share secret with a user | Public-key encryption of the secret's key | Per-secret key wrapped with recipient's RSA-OAEP public key | P0 |
| Permission levels | Login only / View / Modify / Manage | `LOGIN_ONLY`, `VIEW`, `MODIFY`, `MANAGE` | P0 |
| Share with user groups | Groups managed by admins | Fan-out wrap per member; re-wrap on join | P2 |
| Share folders | All secrets in folder inherit share | Folder key → secret keys wrapped by folder key | P2 |
| Ownership transfer | Admin can transfer when user leaves | Owner re-assignment + key re-wrap | P2 |
| Access request workflow | Request → approve → time-limited checkout | `AccessRequest` with expiry + auto-revoke job | P4 |
| One-time share to outsiders | Expiring link | Link with key in URL fragment (never sent to server) | P4 |
| Emergency access | Designated contacts / break-glass | Time-delayed key escrow to trustee's public key | P4 |

> **Honesty note on "Login only":** in a zero-knowledge system a client that can autofill a password
> necessarily holds the plaintext. `LOGIN_ONLY` is enforced by our clients (UI hides the value),
> not cryptographically. Zoho Vault has the same property. Document this for customers.

### 2.4 Organisation & administration

| Feature | Our approach | Phase |
| --- | --- | --- |
| Organisation, invitations | `Organization`, `OrgMember`, email invites | P2 |
| Roles: Super Admin / Admin / User | `OrgRole` enum + policy checks | P2 |
| User groups | `Group`, `GroupMember` | P2 |
| Admin console (users, policies, reports) | Separate admin area in the web app | P2 |
| Enterprise policies (master-password strength, auto-lock, clipboard clear, offline access, IP allow-list) | `OrgPolicy` JSON, enforced server + client | P2 / P4 |
| Admin recovery of user access | Org recovery key (opt-in, admin-held) | P4 |
| AD / LDAP / Okta / Entra ID provisioning | SCIM 2.0 endpoint | P4 |
| SSO (SAML / OIDC) | SSO for authentication; master password still unlocks | P4 |

### 2.5 Security & compliance

| Feature | Our approach | Phase |
| --- | --- | --- |
| Zero-knowledge encryption (AES-256) | AES-256-GCM, PBKDF2-SHA256 600k → HKDF split | P0 |
| MFA for account login | TOTP + WebAuthn/passkeys | P1 / P3 |
| Audit trail | `AuditLog` on every sensitive action | P0 |
| Reports (access, sharing, compliance) | Admin reports over `AuditLog` | P2 |
| SIEM integration | Webhook / syslog export | P4 |
| Session management | Refresh-token sessions, list/revoke devices | P0 (sessions) / P1 (UI) |

### 2.6 Clients

| Client | Our approach | Phase |
| --- | --- | --- |
| Web vault | React SPA (this repo `frontend/`) | P0 |
| Browser extension (autofill, auto-save, one-click login) | Manifest V3, shared crypto package | P3 |
| Mobile (biometric unlock, offline, autofill service) | React Native / Expo, OS autofill APIs | P3 |
| CLI / public API | Token-scoped API + Node CLI | P4 |

### 2.7 Password reset automation (Enterprise)
Zoho Vault can rotate passwords on remote systems (Windows, Linux, databases). This requires an
on-prem agent and conflicts with pure zero-knowledge (the agent must see the new password).
**Deferred** — revisit after P4 as an optional "privileged access" add-on.

## 3. Personas & core user journeys

1. **Individual** — register → set master password → add logins → autofill via extension → check
   security dashboard.
2. **Team member** — accept invite → unlock vault → see secrets shared by team → request access to a
   secret they don't have.
3. **Admin** — create org → invite users/groups → set policies → share folders → review audit reports →
   offboard a user (transfer ownership, revoke sessions).

## 4. Non-functional requirements

- **Security:** zero-knowledge; OWASP ASVS L2 as the baseline; no plaintext secrets in logs.
- **Performance:** vault of 5,000 secrets decrypts in < 2 s on a mid-range laptop.
- **Availability:** stateless API, horizontally scalable; Postgres as the single source of truth.
- **Privacy:** minimal metadata in plaintext (type, timestamps, ownership). Names/URLs are encrypted.
- **Accessibility:** WCAG 2.1 AA for the web vault.
