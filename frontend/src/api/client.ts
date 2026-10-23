export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Public build-time setting only. Keep API requests on the app origin for refresh cookies.
const apiBasePath = (import.meta.env?.VITE_API_BASE_PATH || '/api').replace(/\/+$/, '');
if (!/^\/(?!\/)[A-Za-z0-9/_-]+$/.test(apiBasePath)) {
  throw new Error('VITE_API_BASE_PATH must be a same-origin path such as /api');
}

export type ApiEnvelope<T> =
  | { status: 'success'; message: string; data: T }
  | { status: 'error'; message: string; data: { code: string; details?: unknown[] } };

/** Keep transport envelopes in the API layer; forms receive data and actionable messages. */
export function responseData<T>(body: ApiEnvelope<T>): T {
  if (body.status !== 'success') throw new Error(body.message);
  if (body.data === null) return { message: body.message } as T;
  if (body.message !== 'Success' && typeof body.data === 'object' && !Array.isArray(body.data)) {
    return { ...body.data, message: body.message };
  }
  return body.data;
}

// The access token lives only in memory. The refresh token is an httpOnly cookie the JS can't read.
let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** Called when the session can't be refreshed (e.g. revoked) so the app can return to login. */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${apiBasePath}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) return null;
      const data = responseData((await res.json()) as ApiEnvelope<{ accessToken: string }>);
      accessToken = data.accessToken;
      return accessToken;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** set false for public endpoints */
  auth?: boolean;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${apiBasePath}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });

  if (res.status === 401 && auth && !retried) {
    if (await refreshAccessToken()) return apiFetch<T>(path, options, true);
    onUnauthorized?.();
  }
  if (res.status === 204) return undefined as T;

  const envelope = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || envelope?.status === 'error') {
    throw new ApiError(
      res.status,
      envelope?.status === 'error' ? (envelope.data?.code ?? 'INTERNAL') : 'INTERNAL',
      envelope?.message ?? (res.status >= 500
        ? 'The service is temporarily unavailable. Please try again shortly.'
        : res.statusText),
    );
  }
  if (!envelope || envelope.status !== 'success')
    throw new ApiError(res.status, 'INTERNAL', 'Invalid API response');
  return responseData(envelope);
}
