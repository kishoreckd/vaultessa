# 03 — Security Model

**Goal:** a full compromise of the server (database dump, malicious operator) must not reveal any
secret, folder name, or master password. The server only ever stores ciphertext and public keys.

## 1. Key hierarchy

```
master password ──PBKDF2-SHA256(600k, salt=kdfSalt)──▶ masterKey (256-bit, never leaves client)
                                                         │
                       ┌──── HKDF-SHA256 info="passvault-auth" ────▶ authHash ──▶ sent to server
                       │                                                         server stores
                       │                                                         scrypt(authHash)
                       └──── HKDF-SHA256 info="passvault-enc"  ────▶ KEK (AES-256-GCM)
                                                                     │ wraps
                                                                     ▼
                                                   vaultKey (random AES-256) ──▶ stored as protectedVaultKey
                                                     │ wraps                     
                       ┌─────────────────────────────┼──────────────────────────┐
                       ▼                             ▼                          ▼
           RSA-OAEP-3072 privateKey        secretKey (random AES-256,     folder names
           (stored as protectedPrivateKey)  one per secret)
                       │                             │ encrypts
                       │ unwraps shares              ▼
                       ▼                      secret payload (JSON)
           secretKey wrapped with my publicKey
           (from another user's share)
```

| Value | Where it lives | Form |
| --- | --- | --- |
| Master password | User's head | Never stored, never sent |
| `masterKey`, `KEK` | Client memory during unlock only | Discarded after unwrapping |
| `authHash` | Sent at login/register | Server stores `scrypt(authHash)` with per-user salt |
| `vaultKey` | Client memory while unlocked | Server: `protectedVaultKey = AES-GCM(KEK, vaultKey)` |
| RSA private key | Client memory while unlocked | Server: `protectedPrivateKey = AES-GCM(vaultKey, pkcs8)` |
| RSA public key | Server, plaintext (SPKI) | Used by others to share to you |
| `secretKey` | Client memory transiently | Server: `SecretAccess.wrappedKey` per user |
| Secret payload | — | Server: `Secret.encryptedData = AES-GCM(secretKey, JSON)` |

### Why a key per secret?
Sharing one secret must not expose anything else. Each secret gets its own random key; sharing means
wrapping that key for the recipient. The owner wraps it with their symmetric `vaultKey` (fast to
decrypt thousands); recipients get it wrapped with their RSA public key and can **accept** the share,
which re-wraps it with their own `vaultKey` (`keyWrap: VAULT`) for speed.

### Why HKDF split?
The value sent to the server (`authHash`) and the value that unlocks data (`KEK`) are derived from
the same master key through independent HKDF branches, so knowing `authHash` reveals nothing about
`KEK`. The server additionally scrypt-hashes `authHash` so a DB leak can't be replayed as a login.

## 2. Primitives & formats

| Purpose | Algorithm | Notes |
| --- | --- | --- |
| Password KDF | PBKDF2-HMAC-SHA256, 600,000 iterations, 16-byte random salt | OWASP 2023. `kdfIterations` stored per user so we can raise it. Argon2id (WASM) planned. |
| Key separation | HKDF-SHA256 | info strings `passvault-auth`, `passvault-enc` |
| Symmetric encryption | AES-256-GCM, 96-bit random IV per message | Never reuse a key+IV |
| Asymmetric wrap | RSA-OAEP-3072 with SHA-256 | X25519 + HPKE considered for P3 |
| Server hash | scrypt (N=2^15, r=8, p=1), 16-byte salt | Format `scrypt$N$r$p$salt$hash` |
| Random | `crypto.getRandomValues` / Node `randomBytes` | Never `Math.random` |

**EncString** (ciphertext wire format): `v1.<base64 iv>.<base64 ciphertext+tag>`. The version prefix
lets us migrate algorithms without ambiguity.

## 3. Authentication flow

1. `POST /auth/prelogin {email}` → `{kdf, kdfIterations, kdfSalt}`. For unknown emails the server
   returns a deterministic fake salt (`HMAC(PRELOGIN_SECRET, email)`) so the endpoint does not reveal
   which emails are registered.
2. Client derives `masterKey` → `authHash`; `POST /auth/login {email, authHash}`.
3. Server verifies `scrypt(authHash)` in constant time → creates `Session` → returns a 15-min JWT
   access token and sets a 30-day opaque refresh token cookie (`httpOnly`, `SameSite=Strict`,
   `Secure` in prod, path `/api/auth`). Only `sha256(refreshToken)` is stored.
4. Refresh rotates the token (old one invalidated). Logout deletes the session.
5. Client unwraps `protectedVaultKey` with `KEK`. AES-GCM authentication failure = wrong password.

## 4. Client hardening rules

- Keys are imported as **non-extractable** `CryptoKey`s wherever possible (vault key, private key).
- Decrypted data lives only in memory (React state / query cache), never in `localStorage`,
  `sessionStorage`, IndexedDB, URLs, or logs.
- Auto-lock after inactivity (default 15 min) and on reload; lock wipes keys + query cache.
- Clipboard is cleared 30 s after copying a secret (best effort).
- Strict CSP, no third-party scripts, no analytics on vault pages, SRI for any static asset.

## 5. Server hardening rules

- Never log request bodies on auth or secret routes; validation errors never echo submitted input.
- Settings have no defaults for `JWT_ACCESS_SECRET` / `PRELOGIN_SECRET` — the API refuses to start
  without them (fail closed), and there is no "auth disabled" development mode.
- Request models reject unknown fields, so a buggy client sending e.g. a plaintext `masterPassword`
  gets a 400 instead of the field being silently accepted.
- Rate limits: global 300 req/min/IP; auth endpoints 10 req/min/IP (in-process; P1: Redis-backed,
  plus per-account lockout with exponential backoff).
- Security headers on every response: `nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`,
  `default-src 'none'` CSP, HSTS in production.
- Every secret read/write checks `SecretAccess` for the caller — no "admin can read everything".
- Optimistic concurrency (`revision`) on secret updates to prevent lost writes.
- Audit log on: register, login (success/failure), logout, secret create/update/delete,
  share grant/change/revoke.

## 6. Threat model (STRIDE summary)

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| DB dump | Only ciphertext + scrypt(authHash); offline attack requires PBKDF2 600k + scrypt per guess | Weak master passwords → enforce strength (P1) |
| Malicious server serving altered JS | CSP, SRI, signed extension/mobile builds; web vault inherently trusts the server's JS | Inherent to all web-based password managers; extensions/mobile mitigate |
| Server swaps ciphertexts between secrets | P1: AES-GCM AAD = secret id | Currently possible to confuse items (not to read them) |
| Malicious server substitutes a public key during sharing | P2: show key fingerprints; org-signed public keys | Users must verify fingerprints out of band for high-value shares |
| Revoked user kept a cached secret key | P2: key rotation on revoke (new secretKey, re-wrap for remaining users) | Revocation is not retroactive — user may have copied the password anyway; recommend rotating the password itself |
| Email enumeration | Fake prelogin salts, generic login errors | Timing differences on register (P1: uniform responses) |
| Public-key lookup enumeration | P2: restrict lookup to members of the same organisation | Phase 0 allows lookup by exact email for any authenticated user |
| XSS → key theft | CSP, React escaping, no `dangerouslySetInnerHTML`, non-extractable keys | XSS can still decrypt while the vault is unlocked |
| Brute-force login | Rate limits, P1 lockout + MFA | — |
| Session theft | httpOnly SameSite=Strict refresh cookie, short access tokens, session revocation | — |

## 7. Master password changes & recovery

- **Change master password (P1):** client derives new `KEK`, re-wraps the same `vaultKey`, sends new
  `authHash` + `protectedVaultKey` atomically; all other sessions are revoked.
- **Forgot master password:** data is unrecoverable by design. Options: emergency access (P4) or an
  opt-in organisation recovery key (P4). Communicate this clearly at sign-up.
