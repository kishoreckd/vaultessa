import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Non-sensitive UI preferences only. Never put keys or decrypted data here — this is localStorage.

export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60, 360] as const; // minutes
export const CLIPBOARD_OPTIONS = [10, 30, 60, 0] as const; // seconds, 0 = never clear

type Prefs = {
  autoLockMinutes: number;
  clipboardClearSeconds: number;
  set: (patch: Partial<Omit<Prefs, 'set'>>) => void;
};

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      autoLockMinutes: 360,
      clipboardClearSeconds: 30,
      set: (patch) => set(patch),
    }),
    {
      name: 'pv-prefs', storage: createJSONStorage(() => localStorage), version: 2,
      migrate: (saved) => ({ ...(saved as object), autoLockMinutes: 360 }) as Prefs,
    },
  ),
);
