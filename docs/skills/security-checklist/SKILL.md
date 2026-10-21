---
name: security-checklist
description: Review gate to run before finishing any Vaultessa feature or PR — checks zero-knowledge guarantees, authorization, logging, input validation, and client-side secret handling.
---

# Security checklist (run before calling a feature done)

## Zero-knowledge
- [ ] No new request body carries plaintext user content, master password, or unwrapped keys.
- [ ] New ciphertext fields are validated as EncStrings server-side and produced via `lib/crypto`.
- [ ] No new key is persisted outside memory on the client.

## Authorization
- [ ] Every new protected route takes the `auth: Auth` dependency (`app/core/deps.py`).
- [ ] Resource access is checked against the caller (`SecretAccess`, ownership) in the service.
- [ ] Other users' resources return 404, not 403, when the caller has no access at all.
- [ ] Permission ordering respected: LOGIN_ONLY < VIEW < MODIFY < MANAGE.

## Input & output
- [ ] Request models extend `RequestModel` (unknown fields rejected) with bounded lengths/ranges.
- [ ] Mutations audit and commit in the router, in one transaction.
- [ ] DTOs never include `authHash`, `tokenHash`, or other users' wrapped keys.
- [ ] Errors don't reveal whether an email/account exists.

## Logging & audit
- [ ] Mutations write an `AuditLog` entry with non-sensitive metadata only.
- [ ] No `console.log` / `request.log` of bodies, tokens, keys or decrypted values.

## Client
- [ ] No `dangerouslySetInnerHTML`; user content rendered as text.
- [ ] Sensitive fields: masked by default, `autoComplete` off, copy via `useClipboard`.
- [ ] Lock (`useSession.getState().lock()`) still wipes any new state you added (query cache, stores).

## Tests
- [ ] Crypto round-trip + wrong-key tests for crypto changes.
- [ ] Route tests for 401 and cross-user access.

Then run the built-in `/security-review` on the diff.
