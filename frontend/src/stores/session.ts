import { create } from "zustand";
import { type Account } from "@/api/auth/types";
import { queryClient } from "../lib/queryClient";
import {
  forgetUnlock,
  rememberUnlock,
  REMEMBER_UNLOCK_MS,
} from "../lib/remembered-unlock";

let lockChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    lockChannel = new BroadcastChannel('vaultessa-unlock-lock');
  }
} catch { /* Restricted browser contexts fall back to locking this tab. */ }

export type VaultKeys = {
  /** AES-GCM, non-extractable — wraps secret keys and folder names */
  vaultKey: CryptoKey;
  /** RSA-OAEP, non-extractable — unwraps keys shared with this user */
  privateKey: CryptoKey;
};

/**
 * booting   – checking for an existing session
 * loggedOut – no session
 * locked    – session exists, keys not in memory (needs master password)
 * unlocked  – keys in memory
 */
export type SessionStatus = "booting" | "loggedOut" | "locked" | "unlocked";

/** Why the vault is locked — shown on the unlock screen so an auto-lock isn't a surprise. */
export type LockReason = "manual" | "idle" | "reload" | "expired";

type SessionState = {
  status: SessionStatus;
  account: Account | null;
  keys: VaultKeys | null;
  lockReason: LockReason | null;
  unlockExpiresAt: number | null;
  setLocked: (account: Account) => void;
  unlock: (account: Account, keys: VaultKeys, expiresAt?: number) => void;
  lock: (reason?: LockReason) => void;
  clear: () => void;
};

// Decrypted content stays in memory. Non-extractable keys have a six-hour IndexedDB lease.
export const useSession = create<SessionState>((set) => ({
  status: "booting",
  account: null,
  keys: null,
  lockReason: null,
  unlockExpiresAt: null,
  setLocked: (account) =>
    set({
      status: "locked",
      account,
      keys: null,
      lockReason: "reload",
      unlockExpiresAt: null,
    }),
  unlock: (account, keys, expiresAt = Date.now() + REMEMBER_UNLOCK_MS) => {
    if (!account.emailVerified || expiresAt <= Date.now()) return;
    set({
      status: "unlocked",
      account,
      keys,
      lockReason: null,
      unlockExpiresAt: expiresAt,
    });
    void rememberUnlock(account, keys, expiresAt);
  },
  lock: (reason = "manual") => {
    lockChannel?.postMessage("lock");
    queryClient.clear();
    void forgetUnlock();
    set((s) => ({
      status: s.account ? "locked" : "loggedOut",
      keys: null,
      lockReason: reason,
      unlockExpiresAt: null,
    }));
  },
  clear: () => {
    lockChannel?.postMessage("lock");
    queryClient.clear();
    void forgetUnlock();
    set({
      status: "loggedOut",
      account: null,
      keys: null,
      lockReason: null,
      unlockExpiresAt: null,
    });
  },
}));

if (lockChannel)
  lockChannel.onmessage = (event) => {
    if (event.data === "lock" && useSession.getState().keys)
      useSession.getState().lock("manual");
  };

export function requireKeys(): VaultKeys {
  const expiresAt = useSession.getState().unlockExpiresAt;
  if (expiresAt !== null && expiresAt <= Date.now())
    useSession.getState().lock("expired");
  const keys = useSession.getState().keys;
  if (!keys) throw new Error("Vault is locked");
  return keys;
}
