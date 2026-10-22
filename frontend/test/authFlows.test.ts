import { afterEach, expect, it, vi } from 'vitest';
import { authApi, accountApi } from '../src/lib/api/endpoints';
import { login, changeMasterPassword } from '../src/features/auth/authFlows';
import { useSession } from '../src/stores/session';
import {
  deriveMasterKey,
  deriveKek,
  encryptBytes,
  generateKdfSalt,
  generateAesKeyBytes,
  importAesKey,
  generateRsaKeyPair,
  decryptBytes,
  deriveAuthHash,
} from '../src/lib/crypto';

afterEach(() => {
  vi.restoreAllMocks();
  useSession.getState().clear();
});

it('keeps the vault locked until the MFA challenge succeeds', async () => {
  useSession.getState().clear();
  const kdfSalt = generateKdfSalt();
  const master = await deriveMasterKey('fixture-password', kdfSalt, 1000);
  const raw = generateAesKeyBytes();
  const vaultKey = await importAesKey(raw);
  const pair = await generateRsaKeyPair();
  const account = {
    id: 'fixture',
    emailVerified: false,
    name: 'Fixture',
    email: 'fixture@example.com',
    kdf: 'PBKDF2_SHA256' as const,
    kdfSalt,
    kdfIterations: 1000,
    publicKey: pair.publicKey,
    protectedVaultKey: await encryptBytes(await deriveKek(master), raw),
    protectedPrivateKey: await encryptBytes(vaultKey, pair.privateKeyPkcs8),
  };
  raw.fill(0);
  pair.privateKeyPkcs8.fill(0);
  vi.spyOn(authApi, 'prelogin').mockResolvedValue(account);
  vi.spyOn(authApi, 'login').mockResolvedValue({
    mfaRequired: true,
    mfaToken: 'challenge',
    methods: ['totp', 'recovery'],
    phone: null,
  });
  const mfa = vi
    .spyOn(authApi, 'mfa')
    .mockRejectedValueOnce(new Error('Wrong code'))
    .mockResolvedValueOnce({ account, accessToken: 'fixture-access' });
  const pending = await login('fixture@example.com', 'fixture-password');
  expect(pending).toBeDefined();
  expect(useSession.getState().keys).toBeNull();
  await expect(pending!.complete('totp', '000000')).rejects.toThrow('Wrong code');
  expect(useSession.getState().keys).toBeNull();
  await pending!.complete('recovery', 'fixture-code');
  expect(mfa).toHaveBeenLastCalledWith({ mfaToken: 'challenge', method: 'recovery', code: 'fixture-code' });
  expect(useSession.getState().status).toBe('unlocked');
});

it('rewraps the same vault key when changing the master password', async () => {
  const kdfSalt = generateKdfSalt();
  const master = await deriveMasterKey('current-password', kdfSalt, 1000);
  const raw = generateAesKeyBytes();
  const vaultKey = await importAesKey(raw);
  const pair = await generateRsaKeyPair();
  const account = {
    id: 'fixture',
    emailVerified: false,
    name: 'Fixture',
    email: 'fixture@example.com',
    kdf: 'PBKDF2_SHA256' as const,
    kdfSalt,
    kdfIterations: 1000,
    publicKey: pair.publicKey,
    protectedVaultKey: await encryptBytes(await deriveKek(master), raw),
    protectedPrivateKey: 'unused',
  };
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pair.privateKeyPkcs8,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  );
  useSession.getState().unlock(account, { vaultKey, privateKey });
  const update = vi.spyOn(accountApi, 'changePassword').mockImplementation(async (body) => {
    const next = await deriveMasterKey('new-master-password', body.kdfSalt, body.kdfIterations);
    expect(body.authHash).toBe(await deriveAuthHash(master));
    expect(body.newAuthHash).toBe(await deriveAuthHash(next));
    expect(await decryptBytes(await deriveKek(next), body.protectedVaultKey)).toEqual(raw);
    return { ...account, ...body };
  });
  await changeMasterPassword('current-password', 'new-master-password');
  expect(update).toHaveBeenCalledOnce();
  expect(useSession.getState().keys?.vaultKey).toBe(vaultKey);
  raw.fill(0);
  pair.privateKeyPkcs8.fill(0);
});
