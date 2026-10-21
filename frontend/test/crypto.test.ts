import { describe, expect, it } from 'vitest';
import {
  CryptoError,
  decryptBytes,
  decryptJson,
  deriveAuthHash,
  deriveKek,
  deriveMasterKey,
  encryptBytes,
  encryptJson,
  generateAesKeyBytes,
  generateKdfSalt,
  generateRsaKeyPair,
  importAesKey,
  importPrivateKey,
  publicKeyFingerprint,
  rsaUnwrap,
  rsaWrap,
} from '../src/lib/crypto';

// Low iteration count keeps tests fast; production uses DEFAULT_KDF_ITERATIONS.
const ITER = 1_000;

describe('key derivation', () => {
  it('is deterministic for the same password + salt', async () => {
    const salt = generateKdfSalt();
    const a = await deriveAuthHash(await deriveMasterKey('correct horse', salt, ITER));
    const b = await deriveAuthHash(await deriveMasterKey('correct horse', salt, ITER));
    expect(a).toEqual(b);
  });

  it('differs for different salts and passwords', async () => {
    const salt = generateKdfSalt();
    const base = await deriveAuthHash(await deriveMasterKey('pw', salt, ITER));
    expect(await deriveAuthHash(await deriveMasterKey('pw', generateKdfSalt(), ITER))).not.toEqual(base);
    expect(await deriveAuthHash(await deriveMasterKey('pw2', salt, ITER))).not.toEqual(base);
  });

  it('the KEK from the right password unwraps the vault key; the wrong one fails', async () => {
    const salt = generateKdfSalt();
    const kek = await deriveKek(await deriveMasterKey('right', salt, ITER));
    const vaultKey = generateAesKeyBytes();
    const protectedVaultKey = await encryptBytes(kek, vaultKey);

    expect(await decryptBytes(kek, protectedVaultKey)).toEqual(vaultKey);
    const wrongKek = await deriveKek(await deriveMasterKey('wrong', salt, ITER));
    await expect(decryptBytes(wrongKek, protectedVaultKey)).rejects.toBeInstanceOf(CryptoError);
  });
});

describe('symmetric encryption', () => {
  it('round-trips JSON and uses a fresh IV each time', async () => {
    const key = await importAesKey(generateAesKeyBytes());
    const payload = { name: 'GitHub', password: 'hunter2', notes: 'ünïcødé ✓' };
    const a = await encryptJson(key, payload);
    const b = await encryptJson(key, payload);
    expect(a).toMatch(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    expect(a).not.toEqual(b);
    expect(await decryptJson(key, a)).toEqual(payload);
  });

  it('rejects tampered ciphertext', async () => {
    const key = await importAesKey(generateAesKeyBytes());
    const enc = await encryptJson(key, { x: 1 });
    const [v, iv, ct] = enc.split('.');
    const flipped = (ct!.startsWith('A') ? 'B' : 'A') + ct!.slice(1);
    await expect(decryptJson(key, `${v}.${iv}.${flipped}`)).rejects.toBeInstanceOf(CryptoError);
  });

  it('rejects unknown formats', async () => {
    const key = await importAesKey(generateAesKeyBytes());
    await expect(decryptJson(key, 'v9.abc.def')).rejects.toBeInstanceOf(CryptoError);
  });
});

describe('sharing (RSA-OAEP)', () => {
  it('wraps a secret key for a recipient who can unwrap it', async () => {
    const recipient = await generateRsaKeyPair();
    const privateKey = await importPrivateKey(recipient.privateKeyPkcs8);
    const secretKey = generateAesKeyBytes();

    const wrapped = await rsaWrap(secretKey, recipient.publicKey);
    expect(await rsaUnwrap(wrapped, privateKey)).toEqual(secretKey);

    const other = await generateRsaKeyPair();
    await expect(rsaUnwrap(wrapped, await importPrivateKey(other.privateKeyPkcs8))).rejects.toBeInstanceOf(
      CryptoError,
    );
  });

  it('produces a stable, readable fingerprint', async () => {
    const { publicKey } = await generateRsaKeyPair();
    const fp = await publicKeyFingerprint(publicKey);
    expect(fp).toMatch(/^([0-9a-f]{4} ){7}[0-9a-f]{4}$/);
    expect(await publicKeyFingerprint(publicKey)).toEqual(fp);
  });
});
