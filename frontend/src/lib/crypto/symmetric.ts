import { CryptoError, fromBase64, fromUtf8, randomBytes, toBase64, utf8, type Bytes } from './encoding';

/** Wire format for ciphertext: v1.<base64 iv>.<base64 ciphertext+tag> (AES-256-GCM). */
export type EncString = string;

const VERSION = 'v1';
const IV_BYTES = 12;

export function generateAesKeyBytes(): Bytes {
  return randomBytes(32);
}

export function importAesKey(raw: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptBytes(key: CryptoKey, data: Bytes): Promise<EncString> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return `${VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptBytes(key: CryptoKey, value: EncString): Promise<Bytes> {
  const [version, ivB64, ctB64] = value.split('.');
  if (version !== VERSION || !ivB64 || !ctB64) throw new CryptoError('Unsupported ciphertext format');
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivB64) }, key, fromBase64(ctB64));
    return new Uint8Array(plaintext);
  } catch {
    throw new CryptoError('Decryption failed');
  }
}

export function encryptString(key: CryptoKey, value: string): Promise<EncString> {
  return encryptBytes(key, utf8(value));
}

export async function decryptString(key: CryptoKey, value: EncString): Promise<string> {
  return fromUtf8(await decryptBytes(key, value));
}

export function encryptJson(key: CryptoKey, value: unknown): Promise<EncString> {
  return encryptString(key, JSON.stringify(value));
}

export async function decryptJson<T>(key: CryptoKey, value: EncString): Promise<T> {
  return JSON.parse(await decryptString(key, value)) as T;
}
