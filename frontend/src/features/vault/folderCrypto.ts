import { foldersApi } from '@/api/folders/api';
import type { Folder } from '@/api/folders/types';
import { secretsApi } from '@/api/vault/api';
import {
  decryptBytes,
  encryptBytes,
  encryptString,
  generateAesKeyBytes,
  importAesKey,
  rsaWrap,
} from '@/lib/crypto';
import { requireKeys } from '@/stores/session';
import { withSecretKey } from './vaultCrypto';
import { mapConcurrent } from '@/lib/async';

export async function ownerFolderKey(folder: Folder): Promise<CryptoKey> {
  if (!folder.wrappedKey || folder.isOwner === false)
    throw new Error('Only the owner can change folder contents');
  const raw = await decryptBytes(requireKeys().vaultKey, folder.wrappedKey);
  try {
    return await importAesKey(raw);
  } finally {
    raw.fill(0);
  }
}

export async function destinationKey(folderId: string | null) {
  if (!folderId) return undefined;
  const folder = (await foldersApi.list()).find((f) => f.id === folderId);
  if (folder?.isOwner === false) throw new Error('Only the owner can add or move items in a shared folder');
  return folder?.wrappedKey ? ownerFolderKey(folder) : undefined;
}

export async function prepareFolderSharing(folderId: string, name: string) {
  let folder = (await foldersApi.list()).find((f) => f.id === folderId);
  if (!folder || folder.isOwner === false) throw new Error('Folder not found');
  if (!folder.wrappedKey) {
    const raw = generateAesKeyBytes();
    try {
      const key = await importAesKey(raw);
      const contents = (await secretsApi.list()).filter((i) => i.folderId === folderId);
      if (contents.some((i) => !i.isOwner))
        throw new Error('Move items owned by other people out before sharing this folder');
      await foldersApi.enableSharing(folderId, {
        wrappedKey: await encryptBytes(requireKeys().vaultKey, raw),
        sharedName: await encryptString(key, name),
        items: await mapConcurrent(contents, (item) =>
          withSecretKey(item, async (_key, bytes) => ({
            secretId: item.id,
            wrappedKey: await encryptBytes(key, bytes),
          })),
        ),
      });
    } finally {
      raw.fill(0);
    }
    folder = (await foldersApi.list()).find((f) => f.id === folderId);
    if (!folder?.wrappedKey) throw new Error('Folder changed. Reload your vault and try again.');
  }
  return folder;
}

export async function shareFolder(
  folderId: string,
  name: string,
  userId: string,
  publicKey: string,
  permission: 'VIEW' | 'MODIFY',
) {
  const folder = await prepareFolderSharing(folderId, name);
  if (!folder.wrappedKey) throw new Error('Folder sharing is not ready. Please try again.');
  const raw = await decryptBytes(requireKeys().vaultKey, folder.wrappedKey);
  try {
    await foldersApi.grant(folderId, { userId, permission, wrappedKey: await rsaWrap(raw, publicKey) });
  } finally {
    raw.fill(0);
  }
}
