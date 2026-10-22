# Welcome, email verification and forgotten master passwords

## User flow

1. Signup sends **Verify your Vaultessa email**. The email link works for 24 hours.
2. Open the link and press **Verify my email**. Verification is explicit so email
   link scanners do not consume it. Verification sends the separate **Welcome to
   Vaultessa** email. A link can be used once.
3. In **Settings → Email verification and vault recovery**, enable vault recovery
   with the current master password. Copy the `vrk.` recovery key somewhere safe
   outside Vaultessa and confirm it has been saved. Replacing the key invalidates
   the previous key and any pending recovery link.
4. If the master password is forgotten, choose **Forgot master password?** on the
   sign-in or unlock screen. Request an email, open its link, enter the saved vault
   recovery key, and choose a new master password.
5. The recovery email expires in 15 minutes. Successful recovery signs out all
   sessions, revokes developer tokens and consumes the recovery key. Sign in again
   and generate a new recovery key. MFA is preserved, including unused MFA recovery
   codes; vault recovery does not bypass the second factor.

Existing accounts are not automatically verified or given recovery keys. They
must verify their email and enable recovery while they can still unlock their vault.
Without a previously saved vault recovery key, this flow cannot restore encrypted
data. It never deletes an old vault or pretends that an email-only reset can decrypt it.
Email verification currently gates recovery setup, not ordinary vault login.

## Security and storage

- Email tokens are generated on the backend with 256 bits of randomness. Only
  SHA-256 hashes and expiries are stored. Tokens appear in email URL fragments,
  are removed from the address bar on page load, and are submitted in POST bodies.
  Opening a URL alone changes no account state.
- Resend endpoints return the same HTTP 202/message for unknown, unverified,
  already verified, recovery-disabled and throttled accounts as appropriate.
  Each account has a 60-second resend cooldown; public endpoints also use the
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
| POST | `/auth/email/verify` | `{ token }` → confirmation, queues welcome email |
| GET | `/account/recovery` | bearer → `{ emailVerified, recoveryEnabled, emailAvailable }` |
| PUT | `/account/recovery` | bearer + `{ authHash, recoveryAuth, wrappedVaultKey }` → 204 |
| POST | `/account/recovery/disable` | bearer + `{ authHash }` → 204 |
| POST | `/auth/recovery/request` | `{ email }` → generic 202 |
| POST | `/auth/recovery/inspect` | `{ token }` → `{ wrappedVaultKey }` |
| POST | `/auth/recovery/reset` | `{ token, recoveryAuth, newAuthHash, kdfSalt, kdfIterations, protectedVaultKey }` → confirmation, no session |

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
