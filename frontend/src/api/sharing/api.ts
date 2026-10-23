import { apiFetch } from '../client';
import type {
  UserLookup,
  Share,
  SharingGrantRequest,
  SharingGrantResponse,
  Permission,
  SharingUpdateResponse,
  ExternalSharesUpdateLimitsRequest,
  ExternalShare,
  ExternalSharesConfigResponse,
  ExternalSharesCreateRequest,
  ExternalSharesReopenRequest,
  PublicShareInfo,
  PublicSharesOpenResponse,
} from './types';

export const sharingApi = {
  lookup: (email: string) => apiFetch<UserLookup>(`/users/lookup?email=${encodeURIComponent(email)}`),
  list: (secretId: string) => apiFetch<Share[]>(`/secrets/${secretId}/shares`),
  grant: (secretId: string, body: SharingGrantRequest) =>
    apiFetch<SharingGrantResponse>(`/secrets/${secretId}/shares`, {
      method: 'POST',
      body,
    }),
  update: (secretId: string, userId: string, permission: Permission) =>
    apiFetch<SharingUpdateResponse>(`/secrets/${secretId}/shares/${userId}`, {
      method: 'PATCH',
      body: { permission },
    }),
  revoke: (secretId: string, userId: string) =>
    apiFetch<void>(`/secrets/${secretId}/shares/${userId}`, {
      method: 'DELETE',
    }),
};

export const externalSharesApi = {
  updateLimits: (id: string, body: ExternalSharesUpdateLimitsRequest) =>
    apiFetch<ExternalShare>(`/external-shares/${id}/limits`, {
      method: 'PATCH',
      body,
    }),
  config: () => apiFetch<ExternalSharesConfigResponse>('/external-shares/config'),
  list: (secretId?: string) =>
    apiFetch<ExternalShare[]>(
      `/external-shares${secretId ? `?secretId=${encodeURIComponent(secretId)}` : ''}`,
    ),
  create: (body: ExternalSharesCreateRequest) =>
    apiFetch<ExternalShare>('/external-shares', { method: 'POST', body }),
  reopen: (id: string, body: ExternalSharesReopenRequest) =>
    apiFetch<ExternalShare>(`/external-shares/${id}/reopen`, {
      method: 'POST',
      body,
    }),
  email: (id: string, link: string) =>
    apiFetch<ExternalShare>(`/external-shares/${id}/email`, {
      method: 'POST',
      body: { link },
    }),
  revoke: (id: string) => apiFetch<void>(`/external-shares/${id}`, { method: 'DELETE' }),
};

export const publicSharesApi = {
  info: (id: string) => apiFetch<PublicShareInfo>(`/public/shares/${id}`, { auth: false }),
  open: (id: string, codeVerifier?: string) =>
    apiFetch<PublicSharesOpenResponse>(`/public/shares/${id}/open`, {
      method: 'POST',
      body: codeVerifier ? { codeVerifier } : {},
      auth: false,
    }),
};
