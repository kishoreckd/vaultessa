import { utf8, type Bytes } from './encoding';

/** Separate, non-exportable HMAC key; never send raw vault key material to the API. */
export async function deriveFolderNameKey(rawVaultKey: Bytes): Promise<CryptoKey> {
  const root = await crypto.subtle.importKey('raw', rawVaultKey, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256',
    salt: utf8('Vaultessa/folders/v1'), info: utf8('name-fingerprint') }, root,
    { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
}

export const normalizeFolderName = (name: string) => name.normalize('NFKC').trim().toLowerCase();

export async function folderNameFingerprint(key: CryptoKey, name: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', key, utf8(normalizeFolderName(name)));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}
