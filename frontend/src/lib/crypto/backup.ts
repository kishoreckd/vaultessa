import { deriveMasterKey, deriveKek, generateKdfSalt, DEFAULT_KDF_ITERATIONS } from './kdf';
import { encryptJson, decryptJson } from './symmetric';

export async function encryptBackup(value: unknown, password: string) {
  const salt = generateKdfSalt();
  const iterations = DEFAULT_KDF_ITERATIONS;
  const key = await deriveKek(await deriveMasterKey(password, salt, iterations));
  return { format: 'vaultessa-backup-v1', salt, iterations, ciphertext: await encryptJson(key, value) };
}

export async function decryptBackup(value: unknown, password: string): Promise<unknown> {
  if (!value || typeof value !== 'object') throw new Error('Invalid backup');
  const backup = value as Record<string, unknown>;
  if (
    backup.format !== 'vaultessa-backup-v1' ||
    typeof backup.salt !== 'string' ||
    backup.salt.length > 64 ||
    typeof backup.ciphertext !== 'string' ||
    typeof backup.iterations !== 'number' ||
    !Number.isInteger(backup.iterations) ||
    backup.iterations < 600000 ||
    backup.iterations > 10000000
  )
    throw new Error('Unsupported backup format');
  const key = await deriveKek(await deriveMasterKey(password, backup.salt, backup.iterations));
  return decryptJson(key, backup.ciphertext);
}
