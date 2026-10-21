import { fromBase64, randomBytes, toBase64, utf8 } from './encoding';

// See docs/03-security-model.md §1 for the key hierarchy.

export const DEFAULT_KDF_ITERATIONS = 600_000;
const AUTH_INFO = utf8('passvault-auth');
const ENC_INFO = utf8('passvault-enc');
const NO_SALT = new Uint8Array(0);

export function generateKdfSalt(): string {
  return toBase64(randomBytes(16));
}

/** PBKDF2-SHA256(master password) → masterKey, usable only as HKDF input. */
export async function deriveMasterKey(password: string, saltB64: string, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', utf8(password.normalize('NFKC')), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(saltB64), iterations },
    base,
    256,
  );
  return crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveBits', 'deriveKey']);
}

/** The value sent to the server to prove knowledge of the master password. */
export async function deriveAuthHash(masterKey: CryptoKey): Promise<string> {
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: NO_SALT, info: AUTH_INFO },
    masterKey,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

/** Key-encryption key that protects the vault key. Never leaves the client. */
export function deriveKek(masterKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: NO_SALT, info: ENC_INFO },
    masterKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
