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
import { type VaultItem } from '@/api/vault/types';
import { requireKeys } from '../../stores/session';
import type { DecryptedItem, SecretPayload } from './vaultTypes';
import { mapConcurrent } from '@/lib/async';

type WrappedKeyRef = Pick<VaultItem, 'wrappedKey' | 'keyWrap'>;
type FolderKeyCache = Map<string, Promise<CryptoKey>>;

async function unwrapFolderKey(wrappedKey: string, privateKey: CryptoKey): Promise<CryptoKey> {
  const raw = await rsaUnwrap(wrappedKey, privateKey);
  try {
    return await importAesKey(raw);
  } finally {
    raw.fill(0);
  }
}

async function unwrapSecretKeyBytes(item: WrappedKeyRef, folderKeys?: FolderKeyCache): Promise<Bytes> {
  const { vaultKey, privateKey } = requireKeys();
  if (item.keyWrap === 'FOLDER') {
    const envelope = JSON.parse(item.wrappedKey) as { folderKey: string; itemKey: string };
    let key = folderKeys?.get(envelope.folderKey);
    if (!key) {
      key = unwrapFolderKey(envelope.folderKey, privateKey);
      folderKeys?.set(envelope.folderKey, key);
    }
    return decryptBytes(await key, envelope.itemKey);
  }
  return item.keyWrap === 'VAULT'
    ? decryptBytes(vaultKey, item.wrappedKey)
    : rsaUnwrap(item.wrappedKey, privateKey);
}

/** Runs fn with the item's secret key; raw key bytes are zeroed afterwards. */
export async function withSecretKey<T>(
  item: WrappedKeyRef,
  fn: (key: CryptoKey, raw: Bytes) => Promise<T>,
  folderKeys?: FolderKeyCache,
) {
  const raw = await unwrapSecretKeyBytes(item, folderKeys);
  try {
    return await fn(await importAesKey(raw), raw);
  } finally {
    raw.fill(0);
  }
}

export async function decryptItem(item: VaultItem, folderKeys?: FolderKeyCache): Promise<DecryptedItem> {
  try {
    const data = await withSecretKey(
      item,
      (key) => decryptJson<SecretPayload>(key, item.encryptedData),
      folderKeys,
    );
    return { ...item, data, decryptFailed: false };
  } catch {
    return { ...item, data: { name: 'Unable to decrypt' }, decryptFailed: true };
  }
}

/** Reuse keys only within one load; no global or persisted key cache. */
export function decryptItems(items: VaultItem[]): Promise<DecryptedItem[]> {
  const folderKeys: FolderKeyCache = new Map();
  return mapConcurrent(items, (item) => decryptItem(item, folderKeys));
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
