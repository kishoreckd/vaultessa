import { fromBase64, randomBytes, toBase64, utf8, type Bytes } from './encoding';
import { decryptJson, encryptJson, type EncString } from './symmetric';

// Share links ("send to anyone"). The link key travels only in the URL #fragment, which browsers
// never send to servers. An optional access code is stretched with PBKDF2 and mixed into the key,
// so the link alone is useless; a separate HKDF branch of the code is the server-side verifier.

const CODE_ITERATIONS = 300_000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const EMPTY = new Uint8Array(0);

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Bytes {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

/** 8 characters (~39 bits), shown as XXXX-XXXX. Unbiased: 256 % 31 handled by rejection. */
export function generateAccessCode(): string {
  const chars: string[] = [];
  while (chars.length < 8) {
    const byte = randomBytes(1)[0]!;
    if (byte < 248) chars.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]!);
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function normalizeAccessCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

async function codeBits(code: string, saltB64: string): Promise<Bytes> {
  const base = await crypto.subtle.importKey('raw', utf8(normalizeAccessCode(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(saltB64), iterations: CODE_ITERATIONS },
    base,
    256,
  );
  return new Uint8Array(bits);
}

async function hkdfKey(ikm: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits', 'deriveKey']);
}

/** What the guest sends to prove they know the code (cannot be turned back into the decryption key). */
export async function accessCodeVerifier(code: string, saltB64: string): Promise<string> {
  const ikm = await hkdfKey(await codeBits(code, saltB64));
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: EMPTY, info: utf8('passvault-send-verifier') },
    ikm,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

async function sendKey(linkKey: Bytes, code?: string, saltB64?: string): Promise<CryptoKey> {
  let ikm = linkKey;
  if (code && saltB64) {
    const mixed = new Uint8Array(linkKey.length + 32);
    mixed.set(linkKey);
    mixed.set(await codeBits(code, saltB64), linkKey.length);
    ikm = mixed;
  }
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: EMPTY, info: utf8('passvault-send-key') },
    await hkdfKey(ikm),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export type SealedSend = {
  /** goes after `#` in the link — never sent to the server */
  linkKey: string;
  encryptedData: EncString;
  codeSalt?: string;
  codeVerifier?: string;
};

/** Pass `existingLinkKey` to re-seal for the same link URL (re-opening a used/expired link). */
export async function sealSend(payload: unknown, accessCode?: string, existingLinkKey?: string): Promise<SealedSend> {
  const linkKey = existingLinkKey ? fromBase64Url(existingLinkKey) : randomBytes(32);
  const codeSalt = accessCode ? toBase64(randomBytes(16)) : undefined;
  const key = await sendKey(linkKey, accessCode, codeSalt);
  return {
    linkKey: toBase64Url(linkKey),
    encryptedData: await encryptJson(key, payload),
    codeSalt,
    codeVerifier: accessCode && codeSalt ? await accessCodeVerifier(accessCode, codeSalt) : undefined,
  };
}

export async function openSend<T>(
  encryptedData: EncString,
  linkKey: string,
  accessCode?: string,
  codeSalt?: string | null,
): Promise<T> {
  const key = await sendKey(fromBase64Url(linkKey), accessCode, codeSalt ?? undefined);
  return decryptJson<T>(key, encryptedData);
}
