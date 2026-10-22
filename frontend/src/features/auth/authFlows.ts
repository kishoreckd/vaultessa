import {
  DEFAULT_KDF_ITERATIONS,
  decryptBytes,
  deriveAuthHash,
  deriveKek,
  deriveMasterKey,
  encryptBytes,
  generateAesKeyBytes,
  generateKdfSalt,
  generateRsaKeyPair,
  importAesKey,
  importPrivateKey,
  generateVaultRecoveryKey,
  wrapVaultForRecovery,
  unwrapVaultForRecovery,
} from '../../lib/crypto';
import { refreshAccessToken, setAccessToken } from '../../lib/api/client';
import { authApi, accountApi, recoveryApi } from '../../lib/api/endpoints';
import type { Account, MfaChallenge } from '../../lib/api/types';
import { useSession, type VaultKeys } from '../../stores/session';

// Orchestrates the key hierarchy from docs/03-security-model.md. Pages call these; they never touch keys.

const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function unwrapAccountKeys(masterKey: CryptoKey, account: Account): Promise<VaultKeys> {
  const kek = await deriveKek(masterKey);
  const vaultKeyBytes = await decryptBytes(kek, account.protectedVaultKey); // throws on wrong password
  const vaultKey = await importAesKey(vaultKeyBytes);
  vaultKeyBytes.fill(0);
  const pkcs8 = await decryptBytes(vaultKey, account.protectedPrivateKey);
  const privateKey = await importPrivateKey(pkcs8);
  pkcs8.fill(0);
  return { vaultKey, privateKey };
}

export async function register(input: { name: string; email: string; password: string }) {
  const kdfSalt = generateKdfSalt();
  const kdfIterations = DEFAULT_KDF_ITERATIONS;
  const masterKey = await deriveMasterKey(input.password, kdfSalt, kdfIterations);
  const [authHash, kek] = await Promise.all([deriveAuthHash(masterKey), deriveKek(masterKey)]);

  const vaultKeyBytes = generateAesKeyBytes();
  const protectedVaultKey = await encryptBytes(kek, vaultKeyBytes);
  const vaultKey = await importAesKey(vaultKeyBytes);
  vaultKeyBytes.fill(0);

  const { publicKey, privateKeyPkcs8 } = await generateRsaKeyPair();
  const protectedPrivateKey = await encryptBytes(vaultKey, privateKeyPkcs8);
  const privateKey = await importPrivateKey(privateKeyPkcs8);
  privateKeyPkcs8.fill(0);

  const res = await authApi.register({
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    authHash,
    kdfIterations,
    kdfSalt,
    protectedVaultKey,
    publicKey,
    protectedPrivateKey,
  });
  setAccessToken(res.accessToken);
  useSession.getState().unlock(res.account, { vaultKey, privateKey });
}

export type PendingMfa = {
  challenge: MfaChallenge;
  complete: (method: 'totp' | 'recovery', code: string) => Promise<void>;
};

export async function login(emailInput: string, password: string): Promise<PendingMfa | undefined> {
  const email = normalizeEmail(emailInput);
  const prelogin = await authApi.prelogin(email);
  const masterKey = await deriveMasterKey(password, prelogin.kdfSalt, prelogin.kdfIterations);
  const res = await authApi.login({ email, authHash: await deriveAuthHash(masterKey) });
  if ('mfaRequired' in res) {
    return {
      challenge: res,
      complete: async (method, code) => {
        const result = await authApi.mfa({ mfaToken: res.mfaToken, method, code });
        const keys = await unwrapAccountKeys(masterKey, result.account);
        setAccessToken(result.accessToken);
        useSession.getState().unlock(result.account, keys);
      },
    };
  }
  setAccessToken(res.accessToken);
  useSession.getState().unlock(res.account, await unwrapAccountKeys(masterKey, res.account));
}

/** Unlock with an existing session. Throws CryptoError if the master password is wrong. */
export async function unlock(password: string) {
  const { account } = useSession.getState();
  if (!account) throw new Error('No session');
  const masterKey = await deriveMasterKey(password, account.kdfSalt, account.kdfIterations);
  useSession.getState().unlock(account, await unwrapAccountKeys(masterKey, account));
}

export async function changeMasterPassword(currentPassword: string, newPassword: string) {
  const { account, keys } = useSession.getState();
  if (!account || !keys) throw new Error('Unlock your vault first');
  const oldMaster = await deriveMasterKey(currentPassword, account.kdfSalt, account.kdfIterations);
  const raw = await decryptBytes(await deriveKek(oldMaster), account.protectedVaultKey);
  try {
    const kdfSalt = generateKdfSalt();
    const kdfIterations = Math.max(DEFAULT_KDF_ITERATIONS, account.kdfIterations);
    const master = await deriveMasterKey(newPassword, kdfSalt, kdfIterations);
    const updated = await accountApi.changePassword({
      authHash: await deriveAuthHash(oldMaster),
      newAuthHash: await deriveAuthHash(master),
      kdfSalt,
      kdfIterations,
      protectedVaultKey: await encryptBytes(await deriveKek(master), raw),
    });
    if (useSession.getState().status === 'unlocked') useSession.getState().unlock(updated, keys);
    else useSession.getState().setLocked(updated);
  } finally {
    raw.fill(0);
  }
}

let booted = false;

export async function enableVaultRecovery(password: string): Promise<string> {
  const { account } = useSession.getState();
  if (!account) throw new Error('Unlock your vault first');
  const master = await deriveMasterKey(password, account.kdfSalt, account.kdfIterations);
  const raw = await decryptBytes(await deriveKek(master), account.protectedVaultKey);
  try {
    const key = generateVaultRecoveryKey();
    const wrapped = await wrapVaultForRecovery(raw, key);
    await recoveryApi.enable({ authHash: await deriveAuthHash(master), ...wrapped });
    return key;
  } finally {
    raw.fill(0);
  }
}

export async function recoverVault(token: string, recoveryKey: string, newPassword: string) {
  const info = await recoveryApi.inspect(token);
  const { raw, recoveryAuth } = await unwrapVaultForRecovery(info.wrappedVaultKey, recoveryKey);
  try {
    const kdfSalt = generateKdfSalt();
    const kdfIterations = DEFAULT_KDF_ITERATIONS;
    const master = await deriveMasterKey(newPassword, kdfSalt, kdfIterations);
    await recoveryApi.reset({
      token,
      recoveryAuth,
      newAuthHash: await deriveAuthHash(master),
      kdfSalt,
      kdfIterations,
      protectedVaultKey: await encryptBytes(await deriveKek(master), raw),
    });
    setAccessToken(null);
    useSession.getState().clear();
  } finally {
    raw.fill(0);
  }
}

/** On page load: resume a session via the refresh cookie (vault stays locked until unlock). */
export async function bootstrapSession() {
  if (booted) return;
  booted = true;
  const token = await refreshAccessToken();
  if (!token) {
    useSession.getState().clear();
    return;
  }
  try {
    useSession.getState().setLocked(await authApi.me());
  } catch {
    useSession.getState().clear();
  }
}

export async function logout() {
  try {
    await authApi.logout();
  } finally {
    setAccessToken(null);
    useSession.getState().clear();
  }
}
