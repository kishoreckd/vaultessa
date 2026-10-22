import { randomBytes, toBase64, fromBase64, utf8 } from './encoding';

/** Only the derived auth key reaches the server; the token root also derives an independent encryption key. */
export async function deriveTokenKeys(secret: string) {
  const root = await crypto.subtle.importKey('raw', fromBase64(secret), 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ]);
  const params = (info: string) => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(0),
    info: utf8(info),
  });
  const auth = await crypto.subtle.deriveBits(params('passvault-token-auth'), root, 256);
  const encryptionKey = await crypto.subtle.deriveKey(
    params('passvault-token-enc'),
    root,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { authKey: toBase64(new Uint8Array(auth)), encryptionKey };
}

export function generateTokenSecret() {
  return toBase64(randomBytes(32));
}
