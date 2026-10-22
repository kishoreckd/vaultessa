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

- Groups, organisation-owned shared collections, corporate asset transfer, enforced domain policies and admin reporting.
  Organisation creation, email-bound invitations, owner/admin/member roles, DNS-verified domain joining,
  membership deactivation, organisation ownership transfer and team-scoped item grants are now implemented.
  See [17-organisations-and-teams.md](17-organisations-and-teams.md).
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

Earlier personal-vault baseline: 70 backend tests passed against Docker PostgreSQL (no skips), 34 frontend
tests passed, 4 Node SDK tests passed, 3 Python SDK tests passed. TypeScript project
checking, production build and backend Ruff checks passed. Vite still reports a large
main bundle; optional Settings/Developer/Activity/Generator pages are loaded lazily.

## Welcome and recovery follow-up

Welcome/verification emails, resend/confirmation pages, opt-in vault recovery setup
and forgotten-master-password recovery are implemented. Recovery preserves MFA and
requires a key saved in advance. See [13-email-verification-and-recovery.md](13-email-verification-and-recovery.md).

## Teams and email completion follow-up

Teams UI/API and migrations are implemented. Email now has 21 examples with 42 light/dark previews.
Local Mailpit integration verified all 21 multipart messages and inline PNG assets. Firebase SMS remains deferred.
A browser surface is not connected, so real inbox rendering and browser click-through remain unverified.

Latest team/email checks: **105 backend tests passed**, **51 frontend tests passed**, typecheck/build passed, Ruff passed, migration roundtrip/RLS checks passed, and Alembic reports no pending model changes. Local Mailpit verified **21** fictional multipart emails with embedded assets. Both additive migrations are applied locally.

Mandatory email verification is now enforced for ordinary vault access, including existing sessions and machine tokens. New and existing unverified accounts stay at the verification screen until a single-use email link is confirmed; keys stay locked until verification and master-password unlock.

## Email-code verification update (22 October 2026)

Signup verification and forgotten-password recovery now use six-digit email codes.
Resend waits 45 seconds on both client and server, with refresh-persistent UI timers.
Codes expire after 10 minutes and permit five incorrect attempts. Recovery exchanges
the code for a single-use capability before showing the new-password form and still
requires the saved vault recovery key. Current-password reuse is rejected without
consuming the key. The screens use logo-free contextual artwork, accessible code
inputs, inline errors and success/error toasts. Policy remains in `.env`/Settings.
Previously delivered verification/recovery links continue to work explicitly.

## Unified JSON responses and segmented OTP input

All JSON APIs now use `{ status, message, data }` through
`app/utils/validation/json_validator.py`. The default serializer wraps validated
response DTOs; exception handlers use the same helper. Cookies, status codes,
background tasks, protected DTO filtering and bodyless 204 responses are preserved.
Swagger/OpenAPI describes envelopes but the OpenAPI document itself is unchanged
in format. Frontend refresh/retry/error handling, both SDKs and the demo seeder
consume the new envelope. Upgrade frontend, backend and external SDK consumers
together; this changes the previous flat wire contract.

The email verification and recovery code field uses one underlying accessible
input with six connected visual slots, no separator, digit-only paste/autofill,
inline field errors and resend beside the label. The existing 45-second cooldown
still applies. This supports Priya's clear signup flow, Arjun's paste-and-submit
workflow and Lakshmi's single labeled keyboard/screen-reader input.

The copied `utils/validation/auth.py` is not part of the active authentication
path: it references chatbot company/admin configuration absent from Vaultessa.
Vaultessa continues using the session/JWT dependencies in `core/deps.py`.
`utils/validation/password.py` was intentionally left untouched.
