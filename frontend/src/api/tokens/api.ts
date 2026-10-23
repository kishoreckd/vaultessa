import { apiFetch } from '../client';
import type { AccessToken, TokensCreateRequest } from './types';

export const tokensApi = {
  list: () => apiFetch<AccessToken[]>('/tokens'),
  create: (body: TokensCreateRequest) => apiFetch<AccessToken>('/tokens', { method: 'POST', body }),
  revoke: (id: string) => apiFetch<void>(`/tokens/${id}`, { method: 'DELETE' }),
  grants: (id: string, grants: Array<{ secretId: string; wrappedKey: string }>) =>
    apiFetch<AccessToken>(`/tokens/${id}/grants`, {
      method: 'PUT',
      body: { grants },
    }),
};
