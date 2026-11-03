import { expect, it, vi } from 'vitest';
import { decryptJson, encryptBytes, encryptJson, generateAesKeyBytes, generateRsaKeyPair, importAesKey, importPrivateKey, rsaWrap } from '../src/lib/crypto';
import { withSecretKey } from '../src/features/vault/vaultCrypto';

const session = vi.hoisted(() => ({ keys: {} as { vaultKey: CryptoKey; privateKey: CryptoKey } }));
vi.mock('../src/stores/session', () => ({ requireKeys: () => session.keys }));

it('decrypts inherited items using the recipient key and folder key without the owner vault key', async () => {
  const recipient = await generateRsaKeyPair();
  session.keys = { vaultKey: await importAesKey(generateAesKeyBytes()), privateKey: await importPrivateKey(recipient.privateKeyPkcs8) };
  const folderRaw = generateAesKeyBytes();
  const folderKey = await importAesKey(folderRaw);
  const itemRaw = generateAesKeyBytes();
  const encryptedData = await encryptJson(await importAesKey(itemRaw), { password: 'shared secret' });
  const wrappedKey = JSON.stringify({ folderKey: await rsaWrap(folderRaw, recipient.publicKey), itemKey: await encryptBytes(folderKey, itemRaw) });
  expect(await withSecretKey({ keyWrap: 'FOLDER', wrappedKey }, key => decryptJson(key, encryptedData))).toEqual({ password: 'shared secret' });
  const stranger = await generateRsaKeyPair();
  session.keys.privateKey = await importPrivateKey(stranger.privateKeyPkcs8);
  await expect(withSecretKey({ keyWrap: 'FOLDER', wrappedKey }, key => decryptJson(key, encryptedData))).rejects.toThrow();
});

it('erases unwrapped item key bytes even if the consuming operation fails', async () => {
  session.keys.vaultKey = await importAesKey(generateAesKeyBytes());
  const wrappedKey = await encryptBytes(session.keys.vaultKey, generateAesKeyBytes());
  let captured: Uint8Array | undefined;
  await expect(withSecretKey({ keyWrap: 'VAULT', wrappedKey }, async (_key, raw) => {
    captured = raw;
    throw new Error('cancelled');
  })).rejects.toThrow('cancelled');
  expect(captured?.every(byte => byte === 0)).toBe(true);
});
