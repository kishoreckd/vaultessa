---
name: zero-knowledge-crypto
description: Rules and recipes for any Vaultessa change that encrypts, decrypts, derives, wraps or shares keys or user data (vault items, folders, attachments, sharing, master password, KDF). Use before touching frontend/src/lib/crypto, auth flows, sharing, or adding a new field that stores user content.
---

# Zero-knowledge crypto in Vaultessa

Reference: `docs/03-security-model.md` (key hierarchy and threat model).

## Golden rules
1. Plaintext user content never leaves the client. Server fields for user content are EncStrings
   (`v1.<iv>.<ct>`) or wrapped keys.
2. Use only helpers in `frontend/src/lib/crypto/`:
   - `kdf.ts` — `deriveMasterKey`, `deriveAuthHash`, `deriveKek`
   - `symmetric.ts` — `generateAesKeyBytes`, `importAesKey`, `encryptBytes/decryptBytes`,
     `encryptString/decryptString`, `encryptJson/decryptJson`
   - `asymmetric.ts` — `generateRsaKeyPair`, `rsaWrap`, `rsaUnwrap`, `importPublicKey`, `importPrivateKey`
   - `generator.ts`, `strength.ts`
3. Fresh random 96-bit IV for every AES-GCM encryption (the helpers do this — don't pass your own).
4. Import long-lived keys as non-extractable. Only `secretKey` raw bytes are handled transiently
   (needed to re-wrap for sharing); drop references after use.
5. New algorithm or format → bump the EncString version (`v2.`) and keep decrypt support for `v1.`.
6. No `Math.random`, no custom crypto primitives, no ECB/CBC, no unauthenticated encryption.

## Recipes

**New encrypted field on an existing entity**
1. Model: `encrypted_<thing>: Mapped[str] = mapped_column(Text)` (see `database-migration` skill).
2. Client: encrypt with the key that matches the entity's sharing scope (vault key for per-user
   data, the secret key for secret-scoped data, folder key for shared-folder data in P2).
3. Server: type the request field as `EncString` / `EncKey` / `EncName` from
   `backend/app/core/schema.py` so non-ciphertext is rejected; store as-is, never inspect.

**Sharing to a user**
1. `GET /users/lookup?email=` → recipient `publicKey`.
2. Unwrap the secretKey with your own key (`VAULT` → vaultKey, `RSA` → privateKey).
3. `rsaWrap(secretKeyBytes, recipientPublicKey)` → `POST /secrets/:id/shares`.

**Rotating a secret key (P2 revoke)**
New `secretKey` → re-encrypt payload + all history → re-wrap for every remaining access row → send
in one request so the server swaps atomically.

## Required tests
- Round-trip encrypt/decrypt.
- Wrong key / tampered ciphertext must throw.
- KDF deterministic for same inputs, different for different salts.
Put them in `frontend/test/crypto.test.ts` (or a sibling file).
