import {
  decryptBytes,
  decryptJson,
  encryptBytes,
  encryptJson,
  generateAesKeyBytes,
  importAesKey,
  rsaUnwrap,
  rsaWrap,
  type Bytes,
} from '../../lib/crypto';
import type { VaultItem } from '../../lib/api/types';
import { requireKeys } from '../../stores/session';
import type { DecryptedItem, SecretPayload } from './vaultTypes';

type WrappedKeyRef = Pick<VaultItem, 'wrappedKey' | 'keyWrap'>;

function unwrapSecretKeyBytes(item: WrappedKeyRef): Promise<Bytes> {
  const { vaultKey, privateKey } = requireKeys();
  return item.keyWrap === 'VAULT' ? decryptBytes(vaultKey, item.wrappedKey) : rsaUnwrap(item.wrappedKey, privateKey);
}

/** Runs fn with the item's secret key; raw key bytes are zeroed afterwards. */
export async function withSecretKey<T>(item: WrappedKeyRef, fn: (key: CryptoKey, raw: Bytes) => Promise<T>) {
  const raw = await unwrapSecretKeyBytes(item);
  try {
    return await fn(await importAesKey(raw), raw);
  } finally {
    raw.fill(0);
  }
}

export async function decryptItem(item: VaultItem): Promise<DecryptedItem> {
  try {
    const data = await withSecretKey(item, (key) => decryptJson<SecretPayload>(key, item.encryptedData));
    return { ...item, data, decryptFailed: false };
  } catch {
    return { ...item, data: { name: 'Unable to decrypt' }, decryptFailed: true };
  }
}

/** New secret: fresh random key encrypts the payload, and is wrapped with the vault key for the owner. */
export async function encryptNewSecret(data: SecretPayload) {
  const raw = generateAesKeyBytes();
  try {
    const key = await importAesKey(raw);
    const encryptedData = await encryptJson(key, data);
    const wrappedKey = await encryptBytes(requireKeys().vaultKey, raw);
    return { encryptedData, wrappedKey };
  } finally {
    raw.fill(0);
  }
}

export function encryptExisting(item: WrappedKeyRef, data: SecretPayload) {
  return withSecretKey(item, (key) => encryptJson(key, data));
}

/** Re-wraps a received (RSA) share with our own vault key so future loads are fast. */
export function rewrapForVault(item: WrappedKeyRef) {
  return withSecretKey(item, (_key, raw) => encryptBytes(requireKeys().vaultKey, raw));
}

export function wrapForRecipient(item: WrappedKeyRef, recipientPublicKey: string) {
  return withSecretKey(item, (_key, raw) => rsaWrap(raw, recipientPublicKey));
}
