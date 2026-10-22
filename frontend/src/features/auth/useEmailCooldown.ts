import { useCallback, useEffect, useState } from 'react';

export function remainingSeconds(until: number, now = Date.now()) {
  return Math.max(0, Math.ceil((until - now) / 1000));
}

function savedUntil(key: string) {
  try {
    return Number(sessionStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

/** Persist only a timer, never a code or recovery capability. Backend remains authoritative. */
export function useEmailCooldown(purpose: string, email: string) {
  const key = `email-cooldown:${purpose}:${email.trim().toLowerCase()}`;
  const [until, setUntil] = useState(() => savedUntil(key));
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setUntil(savedUntil(key));
    setNow(Date.now());
  }, [key]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const start = useCallback(
    (seconds: number) => {
      const next = Date.now() + seconds * 1000;
      setUntil(next);
      setNow(Date.now());
      try {
        sessionStorage.setItem(key, String(next));
      } catch {
        /* Timer works in memory if storage is unavailable. */
      }
    },
    [key],
  );
  return { remaining: remainingSeconds(until, now), start };
}
