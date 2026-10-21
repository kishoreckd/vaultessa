import { useCallback } from 'react';
import { toast } from 'sonner';
import { usePrefs } from '@/lib/prefs';

/**
 * Copies a value, confirms with a toast, and clears the clipboard after the user's chosen delay
 * (best effort — browsers may refuse to write the clipboard when the tab isn't focused).
 */
export function useClipboard() {
  const clearSeconds = usePrefs((s) => s.clipboardClearSeconds);

  return useCallback(
    async (value: string, label: string) => {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        toast.error("Couldn't access the clipboard", { description: 'Your browser blocked it. Try again.' });
        return;
      }
      toast.success(`${label} copied`, {
        description: clearSeconds ? `Clipboard clears in ${clearSeconds} seconds.` : undefined,
      });
      if (clearSeconds) {
        // Intentionally not cancelled on unmount: the clipboard should still be cleared.
        window.setTimeout(() => {
          navigator.clipboard.writeText('').catch(() => {});
        }, clearSeconds * 1000);
      }
    },
    [clearSeconds],
  );
}
