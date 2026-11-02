import { expect, it } from 'vitest';
import { deriveFolderNameKey, folderNameFingerprint, generateAesKeyBytes } from '../src/lib/crypto';
it('uses stable normalized identities and a non-extractable key', async () => {
  const raw = generateAesKeyBytes();
  const key = await deriveFolderNameKey(raw);
  const secondKey = await deriveFolderNameKey(raw);
  expect(key.extractable).toBe(false);
  const fingerprint = await folderNameFingerprint(key, '  Social  ');
  expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(await folderNameFingerprint(secondKey, 'social')).toBe(fingerprint);
  expect(await folderNameFingerprint(key, '\uff33\uff4f\uff43\uff49\uff41\uff4c')).toBe(fingerprint);
  expect(await folderNameFingerprint(key, 'Work')).not.toBe(fingerprint);
});
it('produces different identities for different vaults', async () => {
  const one = await deriveFolderNameKey(generateAesKeyBytes());
  const two = await deriveFolderNameKey(generateAesKeyBytes());
  expect(await folderNameFingerprint(one, 'Social')).not.toBe(await folderNameFingerprint(two, 'Social'));
});
