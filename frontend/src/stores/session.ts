import { create } from 'zustand';
import { type Account } from '@/api/auth/types';
import { queryClient } from '../lib/queryClient';

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
export type SessionStatus = 'booting' | 'loggedOut' | 'locked' | 'unlocked';

/** Why the vault is locked — shown on the unlock screen so an auto-lock isn't a surprise. */
export type LockReason = 'manual' | 'idle' | 'reload';

type SessionState = {
  status: SessionStatus;
  account: Account | null;
  keys: VaultKeys | null;
  lockReason: LockReason | null;
  setLocked: (account: Account) => void;
  unlock: (account: Account, keys: VaultKeys) => void;
  lock: (reason?: LockReason) => void;
  clear: () => void;
};

// Deliberately NOT persisted: keys and decrypted data must never reach storage.
export const useSession = create<SessionState>((set) => ({
  status: 'booting',
  account: null,
  keys: null,
  lockReason: null,
  setLocked: (account) => set({ status: 'locked', account, keys: null, lockReason: 'reload' }),
  unlock: (account, keys) => set({ status: 'unlocked', account, keys, lockReason: null }),
  lock: (reason = 'manual') => {
    queryClient.clear();
    set((s) => ({ status: s.account ? 'locked' : 'loggedOut', keys: null, lockReason: reason }));
  },
  clear: () => {
    queryClient.clear();
    set({ status: 'loggedOut', account: null, keys: null, lockReason: null });
  },
}));

export function requireKeys(): VaultKeys {
  const keys = useSession.getState().keys;
  if (!keys) throw new Error('Vault is locked');
  return keys;
}
