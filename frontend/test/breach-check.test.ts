import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkBreaches, parseRange } from '../src/features/security/breachCheck';

// Public SHA-1 test fixture for the literal "password"; no real vault data.
const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';
afterEach(() => vi.unstubAllGlobals());

describe('opt-in breach lookup', () => {
  it('sends only a five-character prefix with padding and no credentials or referrer', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(`${SUFFIX}:42\r\n${'0'.repeat(35)}:0`));
    vi.stubGlobal('fetch', fetcher);
    const results = await checkBreaches([
      { id: 'one', password: 'password' }, { id: 'two', password: 'password' },
    ], new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      headers: { 'Add-Padding': 'true' }, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain(SUFFIX);
    expect(results.get('one')?.count).toBe(42);
    expect(results.get('two')?.count).toBe(42);
  });

  it('ignores padded zero-count rows and reports no match only after a valid response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`${SUFFIX}:0`)));
    expect((await checkBreaches([{ id: 'one', password: 'password' }], new AbortController().signal)).get('one')?.count).toBe(0);
    expect(parseRange(`${SUFFIX}:0`).size).toBe(0);
  });

  it.each([new Response('Unavailable', { status: 503 }), new Response('malformed')])(
    'marks unavailable or invalid responses unknown, not clear', async (response) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      const result = await checkBreaches([{ id: 'one', password: 'password' }], new AbortController().signal);
      expect(result.get('one')?.count).toBeNull();
    },
  );

  it('makes no request after cancellation', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    controller.abort();
    await expect(checkBreaches([{ id: 'one', password: 'password' }], controller.signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
