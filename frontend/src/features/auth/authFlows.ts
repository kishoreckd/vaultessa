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
} from '../../lib/crypto';
import { refreshAccessToken, setAccessToken } from '../../lib/api/client';
import { authApi } from '../../lib/api/endpoints';
import type { Account } from '../../lib/api/types';
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

export async function login(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const prelogin = await authApi.prelogin(email);
  const masterKey = await deriveMasterKey(password, prelogin.kdfSalt, prelogin.kdfIterations);
  const res = await authApi.login({ email, authHash: await deriveAuthHash(masterKey) });
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

let booted = false;
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
