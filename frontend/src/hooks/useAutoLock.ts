import { useEffect } from "react";
import { usePrefs } from "../lib/prefs";
import { useSession } from "../stores/session";

// TODO(P2): org policy can cap the timeout.
const ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "pointerdown",
  "scroll",
  "touchstart",
] as const;

/** Locks the vault (wipes keys from memory) after the user's chosen idle time. */
export function useAutoLock() {
  const status = useSession((s) => s.status);
  const lock = useSession((s) => s.lock);
  const minutes = usePrefs((s) => s.autoLockMinutes);

  useEffect(() => {
    if (status !== "unlocked") return;
    const idleMs = minutes * 60 * 1000;
    const lockForIdle = () => lock("idle");
    let timer = window.setTimeout(lockForIdle, idleMs);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lockForIdle, idleMs);
    };
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, reset, { passive: true }),
    );
    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, reset),
      );
    };
  }, [status, lock, minutes]);
}

/** Absolute expiry applies even when navigating away from authenticated app screens. */
export function useUnlockExpiry() {
  const status = useSession((s) => s.status);
  const lock = useSession((s) => s.lock);
  const expiresAt = useSession((s) => s.unlockExpiresAt);

  useEffect(() => {
    if (status !== "unlocked" || expiresAt === null) return;
    const checkExpiry = () => {
      if (Date.now() >= expiresAt) lock("expired");
    };
    const timer = window.setTimeout(
      checkExpiry,
      Math.max(0, expiresAt - Date.now()),
    );
    window.addEventListener("focus", checkExpiry);
    document.addEventListener("visibilitychange", checkExpiry);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkExpiry);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [status, expiresAt, lock]);
}
