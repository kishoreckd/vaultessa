import { afterEach, expect, it, vi } from 'vitest';
import {
  generateAesKeyBytes,
  generateKdfSalt,
  importAesKey,
  encryptJson,
  decryptJson,
  generateVaultRecoveryKey,
  deriveRecoveryKeys,
  wrapVaultForRecovery,
  unwrapVaultForRecovery,
  deriveMasterKey,
  deriveKek,
  deriveAuthHash,
  decryptBytes,
  fromBase64,
} from '../src/lib/crypto';
import { recoveryApi } from '../src/api/recovery/api';
import { recoverVault } from '../src/features/auth/authFlows';

afterEach(() => vi.restoreAllMocks());

it('recovers the same vault key and existing item with a new master password', async () => {
  const raw = generateAesKeyBytes();
  const vaultKey = await importAesKey(raw);
  const encryptedItem = await encryptJson(vaultKey, { password: 'fixture-existing-secret' });
  const recoveryKey = generateVaultRecoveryKey();
  const wrapped = await wrapVaultForRecovery(raw, recoveryKey);
  const oldSalt = generateKdfSalt();
  vi.spyOn(recoveryApi, 'inspect').mockResolvedValue({
    wrappedVaultKey: wrapped.wrappedVaultKey,
    kdfSalt: oldSalt,
    kdfIterations: 600000,
  });
  const reset = vi.spyOn(recoveryApi, 'reset').mockImplementation(async (body) => {
    expect(body.recoveryAuth).toBe(wrapped.recoveryAuth);
    expect(body.currentKdfAuthHash).toBe(
      await deriveAuthHash(await deriveMasterKey('new-master-password', oldSalt, 600000)),
    );
    expect(body.kdfSalt).not.toBe(oldSalt);
    expect(JSON.stringify(body)).not.toContain(recoveryKey);
    expect(JSON.stringify(body)).not.toContain('fixture-existing-secret');
    expect(JSON.stringify(body)).not.toContain('new-master-password');
    const master = await deriveMasterKey('new-master-password', body.kdfSalt, body.kdfIterations);
    expect(body.newAuthHash).toBe(await deriveAuthHash(master));
    const restoredRaw = await decryptBytes(await deriveKek(master), body.protectedVaultKey);
    expect(restoredRaw).toEqual(raw);
    expect(await decryptJson(await importAesKey(restoredRaw), encryptedItem)).toEqual({
      password: 'fixture-existing-secret',
    });
    restoredRaw.fill(0);
    return { message: 'Recovered' };
  });
  await recoverVault('A'.repeat(43), recoveryKey, 'new-master-password');
  expect(reset).toHaveBeenCalledOnce();
  raw.fill(0);
});

it('a wrong recovery key cannot unlock the vault or submit a reset', async () => {
  const raw = generateAesKeyBytes();
  const wrapped = await wrapVaultForRecovery(raw, generateVaultRecoveryKey());
  vi.spyOn(recoveryApi, 'inspect').mockResolvedValue({
    wrappedVaultKey: wrapped.wrappedVaultKey,
    kdfSalt: generateKdfSalt(),
    kdfIterations: 600000,
  });
  const reset = vi.spyOn(recoveryApi, 'reset');
  await expect(
    recoverVault('A'.repeat(43), generateVaultRecoveryKey(), 'new-master-password'),
  ).rejects.toThrow();
  expect(reset).not.toHaveBeenCalled();
  raw.fill(0);
});

it('server recovery proof cannot decrypt the recovery envelope', async () => {
  const raw = generateAesKeyBytes();
  const key = generateVaultRecoveryKey();
  const wrapped = await wrapVaultForRecovery(raw, key);
  expect(wrapped.recoveryAuth).not.toBe(key.slice(4));
  await expect(
    decryptBytes(await importAesKey(fromBase64(wrapped.recoveryAuth)), wrapped.wrappedVaultKey),
  ).rejects.toThrow();
  const recovered = await unwrapVaultForRecovery(wrapped.wrappedVaultKey, key);
  expect(recovered.raw).toEqual(raw);
  recovered.raw.fill(0);
  raw.fill(0);
});

it('rejects malformed recovery keys', async () => {
  await expect(deriveRecoveryKeys('ordinary-password')).rejects.toThrow();
  await expect(deriveRecoveryKeys('vrk.short')).rejects.toThrow();
});
