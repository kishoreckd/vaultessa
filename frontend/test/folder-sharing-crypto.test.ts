import { expect, it, vi } from 'vitest';
import {
  decryptJson,
  encryptBytes,
  encryptJson,
  generateAesKeyBytes,
  generateRsaKeyPair,
  importAesKey,
  importPrivateKey,
  rsaWrap,
} from '../src/lib/crypto';
import { decryptItem, decryptItems, withSecretKey } from '../src/features/vault/vaultCrypto';
import type { VaultItem } from '../src/api/vault/types';

const session = vi.hoisted(() => ({ keys: {} as { vaultKey: CryptoKey; privateKey: CryptoKey } }));
vi.mock('../src/stores/session', () => ({ requireKeys: () => session.keys }));

it('decrypts inherited items using the recipient key and folder key without the owner vault key', async () => {
  const recipient = await generateRsaKeyPair();
  session.keys = {
    vaultKey: await importAesKey(generateAesKeyBytes()),
    privateKey: await importPrivateKey(recipient.privateKeyPkcs8),
  };
  const folderRaw = generateAesKeyBytes();
  const folderKey = await importAesKey(folderRaw);
  const itemRaw = generateAesKeyBytes();
  const encryptedData = await encryptJson(await importAesKey(itemRaw), { password: 'shared secret' });
  const wrappedKey = JSON.stringify({
    folderKey: await rsaWrap(folderRaw, recipient.publicKey),
    itemKey: await encryptBytes(folderKey, itemRaw),
  });
  expect(
    await withSecretKey({ keyWrap: 'FOLDER', wrappedKey }, (key) => decryptJson(key, encryptedData)),
  ).toEqual({ password: 'shared secret' });
  const stranger = await generateRsaKeyPair();
  session.keys.privateKey = await importPrivateKey(stranger.privateKeyPkcs8);
  await expect(
    withSecretKey({ keyWrap: 'FOLDER', wrappedKey }, (key) => decryptJson(key, encryptedData)),
  ).rejects.toThrow();
});

it('erases unwrapped item key bytes even if the consuming operation fails', async () => {
  session.keys.vaultKey = await importAesKey(generateAesKeyBytes());
  const wrappedKey = await encryptBytes(session.keys.vaultKey, generateAesKeyBytes());
  let captured: Uint8Array | undefined;
  await expect(
    withSecretKey({ keyWrap: 'VAULT', wrappedKey }, async (_key, raw) => {
      captured = raw;
      throw new Error('cancelled');
    }),
  ).rejects.toThrow('cancelled');
  expect(captured?.every((byte) => byte === 0)).toBe(true);
});

it('unwraps each folder once per load, isolates bad items, and releases the cache between loads', async () => {
  const recipient = await generateRsaKeyPair();
  session.keys = {
    vaultKey: await importAesKey(generateAesKeyBytes()),
    privateKey: await importPrivateKey(recipient.privateKeyPkcs8),
  };
  const raw = generateAesKeyBytes();
  const folderKey = await importAesKey(raw);
  const wrappedFolderKey = await rsaWrap(raw, recipient.publicKey);
  const items: VaultItem[] = await Promise.all(
    Array.from({ length: 100 }, async (_, index) => {
      const itemRaw = generateAesKeyBytes();
      return {
        id: String(index),
        type: 'LOGIN',
        encryptedData: await encryptJson(await importAesKey(itemRaw), { name: `Item ${index}` }),
        wrappedKey: JSON.stringify({
          folderKey: wrappedFolderKey,
          itemKey: await encryptBytes(folderKey, itemRaw),
        }),
        keyWrap: 'FOLDER',
        permission: 'VIEW',
        folderId: 'folder',
        inheritedFolderId: 'folder',
        sharedFolderIds: ['folder'],
        revision: 0,
        ownerId: 'owner',
        owner: { id: 'owner', name: 'Owner', email: 'owner@example.com' },
        isOwner: false,
        favorite: false,
        sharedWith: 1,
        organizationId: null,
        expiresAt: null,
        createdAt: '2026-11-03T00:00:00Z',
        updatedAt: '2026-11-03T00:00:00Z',
      };
    }),
  );
  const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
  const rsaCount = () =>
    decrypt.mock.calls.filter(([algorithm]) => typeof algorithm === 'object' && algorithm.name === 'RSA-OAEP')
      .length;
  try {
    const start = performance.now();
    const baseline = await Promise.all(items.map((item) => decryptItem(item)));
    const baselineMs = performance.now() - start;
    expect(baseline.every((item) => !item.decryptFailed)).toBe(true);
    expect(rsaCount()).toBe(100);
    decrypt.mockClear();
    const optimizedStart = performance.now();
    const result = await decryptItems(items);
    const optimizedMs = performance.now() - optimizedStart;
    expect(rsaCount()).toBe(1);
    expect(result.map((item) => item.data.name)).toEqual(items.map((_, index) => `Item ${index}`));
    const first = items[0];
    if (!first) throw new Error('Missing fixture');
    const mixed = await decryptItems([{ ...first, wrappedKey: 'corrupt' }, ...items.slice(1)]);
    expect(rsaCount()).toBe(2);
    expect(mixed[0]?.decryptFailed).toBe(true);
    expect(mixed.slice(1).every((item) => !item.decryptFailed)).toBe(true);
    console.info(
      `FOLDER_CRYPTO 100 items: baseline=${baselineMs.toFixed(1)}ms optimized=${optimizedMs.toFixed(1)}ms RSA=100->1`,
    );
  } finally {
    decrypt.mockRestore();
  }
});
