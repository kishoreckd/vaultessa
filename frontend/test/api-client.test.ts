import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch, ApiError, refreshAccessToken, setAccessToken } from '../src/lib/api/client';

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

it('unwraps domain objects and arrays from success envelopes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValueOnce(reply({ status: 'success', message: 'Success', data: [{ id: 'item' }] })),
  );
  expect(await apiFetch('/secrets')).toEqual([{ id: 'item' }]);
});

it('preserves action messages alongside response data for toast feedback', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        reply({ status: 'success', message: 'Check your inbox.', data: { resendAfterSeconds: 45 } }, 202),
      ),
  );
  expect(await apiFetch('/auth/email/request', { auth: false })).toEqual({
    message: 'Check your inbox.',
    resendAfterSeconds: 45,
  });
});

it('handles message-only and bodyless responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(reply({ status: 'success', message: 'Email verified.', data: null }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })),
  );
  expect(await apiFetch('/auth/email/verify-code', { auth: false })).toEqual({ message: 'Email verified.' });
  expect(await apiFetch('/auth/logout', { method: 'POST', auth: false })).toBeUndefined();
});

it('retains the server error code and message used by form errors and toasts', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        reply(
          { status: 'error', message: 'Choose a different password.', data: { code: 'PASSWORD_REUSED' } },
          400,
        ),
      ),
  );
  const failure = await apiFetch('/auth/recovery/reset', { auth: false }).catch((err: unknown) => err);
  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).toMatchObject({
    status: 400,
    code: 'PASSWORD_REUSED',
    message: 'Choose a different password.',
  });
});

it('refreshes access tokens through the same envelope and retries authenticated requests', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      reply({ status: 'error', message: 'Expired.', data: { code: 'UNAUTHORIZED' } }, 401),
    )
    .mockResolvedValueOnce(
      reply({ status: 'success', message: 'Success', data: { accessToken: 'fixture-refreshed' } }),
    )
    .mockResolvedValueOnce(reply({ status: 'success', message: 'Success', data: { id: 'account' } }));
  vi.stubGlobal('fetch', fetch);
  expect(await apiFetch('/auth/me')).toEqual({ id: 'account' });
  expect(fetch.mock.calls[2]?.[1].headers.Authorization).toBe('Bearer fixture-refreshed');
});

it('rejects invalid responses and failed refreshes', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(reply({ data: 'invalid' }))
      .mockResolvedValueOnce(
        reply({ status: 'error', message: 'Expired.', data: { code: 'UNAUTHORIZED' } }, 401),
      ),
  );
  await expect(apiFetch('/auth/email/policy', { auth: false })).rejects.toThrow('Invalid API response');
  expect(await refreshAccessToken()).toBeNull();
});
