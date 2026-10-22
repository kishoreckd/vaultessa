# Welcome, email verification and forgotten master passwords

## User flow

1. Signup emails a six-digit code. Enter it on `/verify-email`; the code expires after
   10 minutes and works once. Verification sends a separate welcome email.
2. Resend is available after 45 seconds. The server enforces the timer, while the
   UI displays a countdown that survives refresh. Only the latest code works.
3. In Settings, enable vault recovery with the current master password and save
   the `vrk.` recovery key outside Vaultessa.
4. Forgot password: enter the account email, enter the emailed code on the page,
   then enter the saved recovery key and a new master password. Reusing the current
   password shows an error without consuming the recovery key or reset capability.
5. Successful recovery preserves encrypted items, signs out all sessions, revokes
   developer tokens and consumes the recovery key. Sign in and generate a new key.
   MFA remains enabled. Previously delivered links remain supported explicitly.

Existing accounts are not automatically verified or given recovery keys. They
must verify their email and enable recovery while they can still unlock their vault.
Without a previously saved vault recovery key, this flow cannot restore encrypted
data. It never deletes an old vault or pretends that an email-only reset can decrypt it.
Email verification is mandatory before ordinary vault access as well as recovery setup.

## Security and storage

- Email tokens are generated on the backend with 256 bits of randomness. Only
  SHA-256 hashes and expiries are stored. Tokens appear in email URL fragments,
  are removed from the address bar on page load, and are submitted in POST bodies.
  Opening a URL alone changes no account state.
- Resend endpoints return the same HTTP 202/message for unknown, unverified,
  already verified, recovery-disabled and throttled accounts as appropriate.
  Each account has a 45-second resend cooldown; public endpoints also use the
  existing IP rate limiter. Resending replaces the prior token.
- Vault recovery keys are generated in the browser with 256 random bits. HKDF-SHA256
  uses independent `passvault-recovery-auth` and `passvault-recovery-enc` branches.
  The server stores a scrypt hash of the derived proof and an AES-256-GCM envelope
  of the vault key. Neither the recovery key nor an unwrapped vault key is sent.
- Email link possession reveals only the recovery envelope. Recovery also requires
  the independent proof. Five wrong proof attempts disable the link. Requests
  cannot change the email, turn off MFA, or create a session.
- The browser unwraps the original vault key and wraps it under a fresh password
  KDF/KEK. Items, folders, private sharing keys and history retain their encryption
  keys. No bulk plaintext upload or server-side decryption occurs.
- All changes are committed atomically, single-use links are locked in PostgreSQL,
  and verification/recovery setup/disable/completion are audited without tokens or keys.
- Ordinary master-password changes, recovery-key replacement and disabling recovery
  invalidate pending reset links. Password resets invalidate pending MFA challenges.

## API

| Method | Path | Body / response |
| --- | --- | --- |
| POST | `/auth/email/request` | `{ email }` → generic 202 |
| GET | `/auth/email/policy` | public resend/code expiry policy |
| GET | `/auth/email/status` | restricted session: remaining resend seconds |
| POST | `/auth/email/verify-code` | `{ email, code }` -> confirmation, queues welcome |
| POST | `/auth/recovery/verify-code` | `{ email, code }` -> single-use reset capability |
| POST | `/auth/email/verify` | `{ token }` → confirmation, queues welcome email |
| GET | `/account/recovery` | bearer → `{ emailVerified, recoveryEnabled, emailAvailable }` |
| PUT | `/account/recovery` | bearer + `{ authHash, recoveryAuth, wrappedVaultKey }` → 204 |
| POST | `/account/recovery/disable` | bearer + `{ authHash }` → 204 |
| POST | `/auth/recovery/request` | `{ email }` → generic 202 |
| POST | `/auth/recovery/inspect` | `{ token }` → `{ wrappedVaultKey, kdfSalt, kdfIterations }` |
| POST | `/auth/recovery/reset` | `{ token, recoveryAuth, newAuthHash, currentKdfAuthHash, kdfSalt, kdfIterations, protectedVaultKey }` → confirmation, no session |

Paths above are relative to `/api`. Tokens have exactly 43 base64url characters.
All models reject unknown fields; `masterPassword` and raw `recoveryKey` are never
valid request fields. `Account` now includes `emailVerified`.

## Templates and local previews

All new content is in `backend/app/services/email_templates.py`, with delivery orchestrated
by Python services. Generate HTML/plain-text samples with:

```powershell
cd backend
.\.venv\Scripts\python.exe scripts/preview_emails.py
```

Samples: `app/email_previews/verify-email.html`, `welcome.html`, `forgot-password.html`,
`recovery-completed.html`, `recovery-enabled.html`, and `recovery-disabled.html`.
These contain fictional data and do not send emails.

Local delivery uses Mailpit (`http://127.0.0.1:8026`). Production requires the Brevo
sender/domain and SMTP configuration in [11-email-delivery.md](11-email-delivery.md).
Sending remains an in-process background task; durable retries and delivery-status
webhooks are separate outstanding work. Email providers see opaque email tokens,
but never a vault recovery key. Browser visual QA requires a connected browser.

## Migration

Revision `01176535d83b` adds only nullable recovery/verification fields and defaulted
status/attempt columns to `users`. No existing ciphertext or key formats change.
Alembic's environment explicitly imports the models so standalone autogeneration
registers the full metadata. Review generated migrations before applying them.

## Mandatory verification gate

New users are stored with `email_verified=false`. Registration sends the configured verification email;
first password login can resend it after the configured cooldown. Registration or password/MFA login
may establish a restricted session, but `/auth/me`, refresh and sign-out are the only authenticated
session operations available until verification. Public resend/verify/recovery and guest-link routes
keep their own validation. Protected vault, folders, settings, sharing, teams, audit and token APIs
return `403 EMAIL_NOT_VERIFIED`. Machine tokens also check the owner's database verification flag.

The browser keeps unverified accounts locked without loading vault keys and sends them to `/verify-email`.
The page provides a six-digit code input, a resend countdown, contextual logo-free artwork,
inline errors, action toasts and account switching. After email verification, a locked session still needs the master password to
unlock. Email verification alone never logs somebody into another account or decrypts a vault.

Only the hash of an expiring random token is stored. A valid verification sets `email_verified=true`,
clears that token/expiry, and records the audit event. The check reads the database on protected requests,
so an old session cannot bypass it. Existing unverified accounts must also verify; no records are
silently marked verified. Verification is required once, not at every later login.

SMTP sender and delivery settings remain in `.env`/Settings. Development Mailpit captures mail locally;
production delivery uses the deployed SMTP configuration. No schema change was needed for this gate.

## Code storage and password checks

Migration `c815a34e9012` adds nullable code digests/expiries and a verification attempt
counter. Six-digit codes use a purpose- and user-bound HMAC-SHA256 digest keyed with
`PRELOGIN_SECRET`; plaintext codes are never stored in the database. Five incorrect
attempts invalidate the challenge. Successful verification consumes both code and
legacy token. Recovery-code verification exchanges the code for a fresh capability
kept only in browser memory. A refresh starts recovery again. Ordinary password
changes and recovery-key replacement/disable invalidate pending codes too.

The browser derives the candidate new password under the existing KDF parameters
and submits `currentKdfAuthHash`; the server compares it to the stored auth verifier.
The new vault wrapper still uses a fresh salt. This rejects current-password reuse
by the application without sending plaintext passwords. As with the existing
client-derived authentication protocol, the server cannot prove that two arbitrary
client-supplied KDF proofs came from the same plaintext password.

Policy is maintained in `.env` and Settings: `EMAIL_RESEND_COOLDOWN_SECONDS=45`,
`EMAIL_CODE_TTL_MINUTES=10`, `EMAIL_CODE_MAX_ATTEMPTS=5`. New emails show the code
prominently and link to the code-entry page. Existing link endpoints remain for
backward compatibility. Delivery remains an in-process SMTP background task.
