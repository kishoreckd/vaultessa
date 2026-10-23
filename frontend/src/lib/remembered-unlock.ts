import type { Account } from "@/api/auth/types";
import type { VaultKeys } from "@/stores/session";

export const REMEMBER_UNLOCK_MS = 6 * 60 * 60 * 1000;
const databaseName = "vaultessa-unlock";
const storeName = "keys";
type Entry = {
  accountId: string;
  protectedVaultKey: string;
  protectedPrivateKey: string;
  keys: VaultKeys;
  expiresAt: number;
};
let operations = Promise.resolve();

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Browser key storage is unavailable"));
      return;
    }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Browser key storage is blocked"));
    request.onsuccess = () => resolve(request.result);
  });
}
async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
function enqueue(action: () => Promise<unknown>) {
  operations = operations.then(action, action).then(
    () => undefined,
    () => undefined,
  );
  return operations;
}
export function forgetUnlock() {
  return enqueue(() => transact("readwrite", (store) => store.clear()));
}
export function rememberUnlock(
  account: Account,
  keys: VaultKeys,
  expiresAt: number,
) {
  return enqueue(async () => {
    // Persist only non-extractable CryptoKey objects, never raw keys or the master password.
    if (
      !account.emailVerified ||
      keys.vaultKey.extractable ||
      keys.privateKey.extractable ||
      expiresAt <= Date.now()
    ) {
      await transact("readwrite", (store) => store.clear());
      return;
    }
    const entry: Entry = {
      accountId: account.id,
      protectedVaultKey: account.protectedVaultKey,
      protectedPrivateKey: account.protectedPrivateKey,
      keys,
      expiresAt,
    };
    await transact("readwrite", (store) => store.put(entry, "current"));
  });
}
export async function restoreUnlock(account: Account): Promise<Entry | null> {
  await operations;
  try {
    const entry = await transact<Entry | undefined>("readonly", (store) =>
      store.get("current"),
    );
    const valid =
      entry &&
      account.emailVerified &&
      entry.accountId === account.id &&
      entry.protectedVaultKey === account.protectedVaultKey &&
      entry.protectedPrivateKey === account.protectedPrivateKey &&
      Number.isFinite(entry.expiresAt) &&
      entry.expiresAt > Date.now() &&
      entry.expiresAt <= Date.now() + REMEMBER_UNLOCK_MS &&
      !entry.keys.vaultKey.extractable &&
      !entry.keys.privateKey.extractable &&
      entry.keys.vaultKey.type === "secret" &&
      entry.keys.vaultKey.algorithm.name === "AES-GCM" &&
      entry.keys.privateKey.type === "private" &&
      entry.keys.privateKey.algorithm.name === "RSA-OAEP";
    if (!valid) {
      await forgetUnlock();
      return null;
    }
    return entry;
  } catch {
    await forgetUnlock();
    return null;
  }
}
