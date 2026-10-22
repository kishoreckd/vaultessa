# Vaultessa status — 22 October 2026

## Implemented in this continuation

- Spendova-style Python layers: `api`, `services`, `schemas`, `core`, `db`.
- Python email layout and SMTP delivery; local previews under `app/email_previews`.
- Shared navigation and Links/People tables, linked item names and sharing flags.
- Link-details drawer: views used/allowed, last opened, paginated activity.
- Active-link expiry/view-limit updates preserve existing usage. Inactive links use
  the existing re-open flow. Public opens are serialized to enforce view limits.
- Reusable password/passphrase generator, character groups including emoji, range
  and number controls, collapsible options under generated password fields.
- Login MFA challenge handling (authenticator/recovery), local QR authenticator
  setup, one-time recovery-code display, regeneration and disable with reauthentication.
- Sessions/devices and revocation; notification preferences with mandatory security alerts.
- Master-password change: browser rewraps the same vault key, server verifies old
  login proof, updates KDF/protected key atomically, revokes other sessions, sends
  a security notification, invalidates older MFA challenges.
- Developer tokens: create with expiry, select/edit item grants, revoke, one-time
  token display; CLI list/get/run and local Node/Python SDKs. See `packages/README.md`.
- Encrypted backup export/restore and Chrome-style CSV import with local preview,
  validation, progress and retry of remaining rows. Current limits: 500 items and
  5 MB import file. Copies item contents; does not restore shares, folders or history.
- Fixed typecheck/build scripts to traverse referenced TypeScript projects (`tsc -b`).

## Still needs implementation

These are future product phases, not completed by the current personal-vault work:

- Organisations, DNS-verified domains, invitations, roles, groups, shared collections,
  suspension, offboarding/ownership transfer, enforced domain policies and admin reporting.
- Google/OIDC SSO, SCIM/directory sync, opt-in recovery and enterprise log export.
- Browser extension with origin matching/autofill, mobile and desktop applications.
- Passkey/Windows Hello unlock, item TOTP codes, trash/restore, tags/custom-field UI,
  attachments, other manager import formats, EFF dictionary, dictionary-aware strength.
- Versioned AAD binding and key rotation when revoking shares.
- Durable email delivery/retries and authenticated delivery webhooks.
- Redis-backed distributed rate limiting, uniform registration responses, production
  ongoing dependency monitoring, automated browser tests, external security/crypto review,
  backup/restore drills, billing and launch checks.

## Configuration and release dependencies

- Firebase web/server configuration and SMS flow integration. Authenticator and
  recovery-code login work independently; SMS is not claimed complete.
- Brevo verified sender/domain and dedicated SMTP key in backend/Railway secrets.
- Railway backend URL and Vercel rewrite, Supabase production connection and deploy checks.
- Browser visual QA: no browser surface was connected during this continuation.
- Dependency audit remediation completed: Vitest upgraded to 4.1.12 and the shadcn CLI
  dependency removed. Its existing CSS is vendored with the MIT license under
  `frontend/src/styles` and `frontend/licenses`. npm audit reports zero vulnerabilities.

## Verification

Run backend pytest against local Docker PostgreSQL; tests otherwise skip database coverage.
Frontend: `npm run typecheck`, `npm test`, `npm run build`. SDK checks are documented
in `packages/README.md`. No production email, deployment, commit or package publication
was performed during this continuation.

Final checks: 70 backend tests passed against Docker PostgreSQL (no skips), 34 frontend
tests passed, 4 Node SDK tests passed, 3 Python SDK tests passed. TypeScript project
checking, production build and backend Ruff checks passed. Vite still reports a large
main bundle; optional Settings/Developer/Activity/Generator pages are loaded lazily.

## Welcome and recovery follow-up

Welcome/verification emails, resend/confirmation pages, opt-in vault recovery setup
and forgotten-master-password recovery are implemented. Recovery preserves MFA and
requires a key saved in advance. See [13-email-verification-and-recovery.md](13-email-verification-and-recovery.md).
