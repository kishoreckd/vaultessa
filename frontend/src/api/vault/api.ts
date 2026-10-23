import { apiFetch } from '../client';
import type {
  VaultItem,
  SecretsCreateRequest,
  SecretsUpdateRequest,
  SecretsUpdateAccessRequest,
  HistoryEntry,
} from './types';

export const secretsApi = {
  list: () => apiFetch<VaultItem[]>('/secrets'),
  create: (body: SecretsCreateRequest) => apiFetch<VaultItem>('/secrets', { method: 'POST', body }),
  update: (id: string, body: SecretsUpdateRequest) =>
    apiFetch<VaultItem>(`/secrets/${id}`, { method: 'PUT', body }),
  updateAccess: (id: string, body: SecretsUpdateAccessRequest) =>
    apiFetch<VaultItem>(`/secrets/${id}/access`, { method: 'PATCH', body }),
  remove: (id: string) => apiFetch<void>(`/secrets/${id}`, { method: 'DELETE' }),
  history: (id: string) => apiFetch<HistoryEntry[]>(`/secrets/${id}/history`),
};
