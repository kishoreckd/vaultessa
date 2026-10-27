/** Explicit, user-initiated Pwned Passwords checks. Never persist or log inputs/results. */
export type BreachResult = { password: string; count: number | null };

export function parseRange(text: string): Map<string, number> {
  const entries = new Map<string, number>();
  for (const line of text.trim().split(/\r?\n/)) {
    const match = /^([A-F0-9]{35}):(\d+)$/i.exec(line);
    if (!match) throw new Error('Invalid breach response');
    const count = Number(match[2]);
    if (!Number.isSafeInteger(count)) throw new Error('Invalid breach response');
    if (count > 0) entries.set(match[1]!.toUpperCase(), count);
  }
  return entries;
}

export async function checkBreaches(
  items: { id: string; password: string }[],
  signal: AbortSignal,
  onProgress: (checked: number) => void = () => {},
): Promise<Map<string, BreachResult>> {
  const ranges = new Map<string, Map<string, number> | null>();
  const passwords = new Map<string, number | null>();
  const results = new Map<string, BreachResult>();
  for (const item of items) {
    signal.throwIfAborted();
    let count = passwords.get(item.password);
    if (!passwords.has(item.password)) {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest(
        'SHA-1', new TextEncoder().encode(item.password),
      )), (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
      signal.throwIfAborted();
      const prefix = hash.slice(0, 5);
      if (!ranges.has(prefix)) {
        try {
          const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
            headers: { 'Add-Padding': 'true' },
            credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
            signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
          });
          if (!response.ok) throw new Error('Breach lookup unavailable');
          ranges.set(prefix, parseRange(await response.text()));
        } catch {
          signal.throwIfAborted();
          ranges.set(prefix, null);
        }
      }
      const range = ranges.get(prefix);
      count = range ? range.get(hash.slice(5)) ?? 0 : null;
      passwords.set(item.password, count);
    }
    signal.throwIfAborted();
    results.set(item.id, { password: item.password, count: count ?? null });
    onProgress(results.size);
  }
  return results;
}
