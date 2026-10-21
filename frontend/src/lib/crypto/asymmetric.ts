import { CryptoError, fromBase64, toBase64, type Bytes } from './encoding';

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 3072,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};
const IMPORT_PARAMS: RsaHashedImportParams = { name: 'RSA-OAEP', hash: 'SHA-256' };

/** Generates the user's sharing key pair. The private key bytes must be encrypted before leaving memory. */
export async function generateRsaKeyPair(): Promise<{ publicKey: string; privateKeyPkcs8: Bytes }> {
  const pair = await crypto.subtle.generateKey(RSA_PARAMS, true, ['encrypt', 'decrypt']);
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return { publicKey: toBase64(new Uint8Array(spki)), privateKeyPkcs8: new Uint8Array(pkcs8) };
}

export function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', fromBase64(spkiB64), IMPORT_PARAMS, false, ['encrypt']);
}

export function importPrivateKey(pkcs8: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pkcs8, IMPORT_PARAMS, false, ['decrypt']);
}

/** Wraps a (small) key for a recipient. Returns base64. */
export async function rsaWrap(data: Bytes, recipientPublicKeyB64: string): Promise<string> {
  const key = await importPublicKey(recipientPublicKeyB64);
  const ciphertext = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, data);
  return toBase64(new Uint8Array(ciphertext));
}

export async function rsaUnwrap(wrappedB64: string, privateKey: CryptoKey): Promise<Bytes> {
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, fromBase64(wrappedB64)));
  } catch {
    throw new CryptoError('Could not unwrap shared key');
  }
}

/** Human-comparable fingerprint of a public key (first 16 bytes of SHA-256, hex groups). */
export async function publicKeyFingerprint(spkiB64: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', fromBase64(spkiB64)));
  const hex = Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.match(/.{4}/g)!.join(' ');
}
