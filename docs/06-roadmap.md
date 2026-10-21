# 06 — Roadmap

Each phase ends with: green tests, a security review of the diff (`/security-review`), and updated docs.

## Phase 0 — Foundation ✅ (this scaffold)
- [x] Monorepo layout, docs, project skills, Docker Compose
- [x] Backend: FastAPI app, settings validation (fails closed), error model, SQLAlchemy models, Alembic migration
- [x] Auth: prelogin (anti-enumeration), register, login, refresh rotation, logout, me
- [x] Secrets CRUD with per-secret keys, optimistic concurrency, password history
- [x] Folders (encrypted names), favourites
- [x] Sharing a secret with another user (RSA-OAEP), permission levels, accept share
- [x] Audit log + API
- [x] Web: register / login / unlock, vault list + search + editor, generator, share dialog, audit page
- [x] Auto-lock on inactivity, clipboard auto-clear

## Phase 1 — Personal vault MVP (≈ 4–6 weeks)
- [ ] Account MFA (TOTP) + recovery codes
- [ ] Email verification + Mailpit in dev; new-device login emails
- [ ] Change master password (re-wrap), revoke other sessions
- [ ] Sessions/devices page
- [ ] Trash (soft delete, restore, purge after 30 days)
- [ ] TOTP field + live code display (RFC 6238)
- [ ] Type-specific editors (card, identity, bank, SSH key, Wi-Fi, server)
- [ ] Tags, custom fields UI, password reveal history
- [ ] Import (CSV, Bitwarden JSON, 1Password, LastPass, Chrome) / encrypted export
- [ ] Security dashboard: weak / reused / old passwords; zxcvbn-ts strength
- [ ] Passphrase generator (EFF wordlist)
- [ ] File attachments (client-encrypted, S3/MinIO)
- [ ] AES-GCM AAD binding (secret id) — EncString `v2`
- [ ] Per-account login lockout (Redis), uniform register responses
- [ ] E2E tests (Playwright)

## Phase 2 — Teams & organisations (≈ 6–8 weeks)
- [ ] Organisation, invitations, roles (Super Admin / Admin / User)
- [ ] User groups; share to group (fan-out wrap, re-wrap on join)
- [ ] Shared folders with folder keys
- [ ] Key rotation on revoke (new secretKey, re-encrypt payload + history)
- [ ] Public-key fingerprints; restrict user lookup to the same org
- [ ] Ownership transfer on offboarding
- [ ] Admin console: users, groups, policies, reports
- [ ] Policies: password policy, master-password policy, auto-lock, clipboard timeout
- [ ] Custom secret templates
- [ ] Reports: user access, secret access, sharing; CSV export
- [ ] OpenTelemetry tracing + metrics

## Phase 3 — Clients (≈ 8 weeks, parallelisable)
- [ ] Extract `packages/crypto` + `packages/api-client` (npm workspaces)
- [ ] Browser extension (MV3): unlock, autofill, auto-save, generator, URL matching rules
- [ ] Mobile (Expo/React Native): biometric unlock, offline encrypted cache, OS autofill
- [ ] Passkeys / WebAuthn for account login
- [ ] Argon2id KDF option (WASM), KDF upgrade flow

## Phase 4 — Enterprise (≈ 8–12 weeks)
- [ ] SSO (SAML 2.0 / OIDC) + SCIM provisioning (Entra ID, Okta, Google)
- [ ] Access-request workflow with time-limited checkout & auto-revoke
- [ ] Emergency access (trustees, wait period)
- [ ] One-time external share links (key in URL fragment)
- [ ] Breach monitoring (HIBP k-anonymity)
- [ ] IP allow-lists, offline-access policy
- [ ] SIEM export (webhook / syslog), public API tokens + CLI
- [ ] Org recovery key (opt-in)

## Phase 5 — Hardening & launch
- [ ] External penetration test & crypto review
- [ ] OWASP ASVS L2 checklist sign-off
- [ ] Backups/restore drills, disaster-recovery runbook
- [ ] Bug bounty, security.txt, responsible-disclosure policy
- [ ] Billing (Stripe) & plan limits

## Known gaps in Phase 0 (tracked)
1. Public-key lookup works for any registered email (enumeration) → Phase 2.
2. Share revocation doesn't rotate the secret key → Phase 2.
3. No AAD binding of ciphertext to secret id → Phase 1.
4. No email verification / MFA → Phase 1.
