import { fromBase64, randomBytes, toBase64, utf8, type Bytes } from './encoding';
import { decryptBytes, encryptBytes } from './symmetric';

export function generateVaultRecoveryKey(): string {
  const raw = randomBytes(32);
  try {
    return 'vrk.' + toBase64(raw).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  } finally {
    raw.fill(0);
  }
}

export async function deriveRecoveryKeys(input: string) {
  const value = input.trim().replace(/\s/g, '');
  if (!/^vrk\.[A-Za-z0-9_-]{43}$/.test(value))
    throw new Error('Enter your saved vault recovery key, starting with vrk.');
  const raw = fromBase64(value.slice(4).replaceAll('-', '+').replaceAll('_', '/') + '=');
  if (raw.length !== 32) throw new Error('Invalid recovery key');
  try {
    const root = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits', 'deriveKey']);
    const params = (info: string) => ({
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: utf8(info),
    });
    const proof = await crypto.subtle.deriveBits(params('passvault-recovery-auth'), root, 256);
    const encryptionKey = await crypto.subtle.deriveKey(
      params('passvault-recovery-enc'),
      root,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    return { recoveryAuth: toBase64(new Uint8Array(proof)), encryptionKey };
  } finally {
    raw.fill(0);
  }
}

export async function wrapVaultForRecovery(raw: Bytes, recoveryKey: string) {
  if (raw.length !== 32) throw new Error('Invalid vault key');
  const { recoveryAuth, encryptionKey } = await deriveRecoveryKeys(recoveryKey);
  return { recoveryAuth, wrappedVaultKey: await encryptBytes(encryptionKey, raw) };
}

export async function unwrapVaultForRecovery(wrapped: string, recoveryKey: string) {
  const { recoveryAuth, encryptionKey } = await deriveRecoveryKeys(recoveryKey);
  const raw = await decryptBytes(encryptionKey, wrapped);
  if (raw.length !== 32) {
    raw.fill(0);
    throw new Error('Invalid recovery envelope');
  }
  return { recoveryAuth, raw };
}
