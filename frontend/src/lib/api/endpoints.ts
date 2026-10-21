import { apiFetch } from './client';
import type {
  Account,
  AuditEntry,
  ExternalShare,
  Folder,
  HistoryEntry,
  LoginResponse,
  Permission,
  Prelogin,
  PublicShareInfo,
  SecretType,
  Share,
  UserLookup,
  VaultItem,
} from './types';

export const authApi = {
  prelogin: (email: string) => apiFetch<Prelogin>('/auth/prelogin', { method: 'POST', body: { email }, auth: false }),
  register: (body: {
    email: string;
    name: string;
    authHash: string;
    kdfIterations: number;
    kdfSalt: string;
    protectedVaultKey: string;
    publicKey: string;
    protectedPrivateKey: string;
  }) => apiFetch<LoginResponse>('/auth/register', { method: 'POST', body, auth: false }),
  login: (body: { email: string; authHash: string }) =>
    apiFetch<LoginResponse>('/auth/login', { method: 'POST', body, auth: false }),
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST', auth: false }),
  me: () => apiFetch<Account>('/auth/me'),
};

export const secretsApi = {
  list: () => apiFetch<VaultItem[]>('/secrets'),
  create: (body: {
    type: SecretType;
    encryptedData: string;
    wrappedKey: string;
    folderId?: string | null;
    favorite?: boolean;
  }) => apiFetch<VaultItem>('/secrets', { method: 'POST', body }),
  update: (id: string, body: { encryptedData: string; revision: number }) =>
    apiFetch<VaultItem>(`/secrets/${id}`, { method: 'PUT', body }),
  updateAccess: (id: string, body: { folderId?: string | null; favorite?: boolean; wrappedKey?: string }) =>
    apiFetch<VaultItem>(`/secrets/${id}/access`, { method: 'PATCH', body }),
  remove: (id: string) => apiFetch<void>(`/secrets/${id}`, { method: 'DELETE' }),
  history: (id: string) => apiFetch<HistoryEntry[]>(`/secrets/${id}/history`),
};

export const foldersApi = {
  list: () => apiFetch<Folder[]>('/folders'),
  create: (encryptedName: string) => apiFetch<Folder>('/folders', { method: 'POST', body: { encryptedName } }),
  rename: (id: string, encryptedName: string) =>
    apiFetch<Folder>(`/folders/${id}`, { method: 'PUT', body: { encryptedName } }),
  remove: (id: string) => apiFetch<void>(`/folders/${id}`, { method: 'DELETE' }),
};

export const sharingApi = {
  lookup: (email: string) => apiFetch<UserLookup>(`/users/lookup?email=${encodeURIComponent(email)}`),
  list: (secretId: string) => apiFetch<Share[]>(`/secrets/${secretId}/shares`),
  grant: (secretId: string, body: { userId: string; wrappedKey: string; permission: Permission }) =>
    apiFetch<{ ok: true }>(`/secrets/${secretId}/shares`, { method: 'POST', body }),
  update: (secretId: string, userId: string, permission: Permission) =>
    apiFetch<{ ok: true }>(`/secrets/${secretId}/shares/${userId}`, { method: 'PATCH', body: { permission } }),
  revoke: (secretId: string, userId: string) =>
    apiFetch<void>(`/secrets/${secretId}/shares/${userId}`, { method: 'DELETE' }),
};

export const externalSharesApi = {
  config: () => apiFetch<{ emailEnabled: boolean }>('/external-shares/config'),
  list: (secretId?: string) =>
    apiFetch<ExternalShare[]>(`/external-shares${secretId ? `?secretId=${encodeURIComponent(secretId)}` : ''}`),
  create: (body: {
    secretId: string;
    encryptedData: string;
    expiresAt: string;
    maxViews?: number | null;
    codeSalt?: string;
    codeVerifier?: string;
    recipientEmail?: string;
    ownerKey?: string;
  }) => apiFetch<ExternalShare>('/external-shares', { method: 'POST', body }),
  reopen: (
    id: string,
    body: { encryptedData: string; expiresAt: string; maxViews?: number | null; codeSalt?: string; codeVerifier?: string },
  ) => apiFetch<ExternalShare>(`/external-shares/${id}/reopen`, { method: 'POST', body }),
  email: (id: string, link: string) =>
    apiFetch<ExternalShare>(`/external-shares/${id}/email`, { method: 'POST', body: { link } }),
  revoke: (id: string) => apiFetch<void>(`/external-shares/${id}`, { method: 'DELETE' }),
};

/** No account needed — used by the guest page. */
export const publicSharesApi = {
  info: (id: string) => apiFetch<PublicShareInfo>(`/public/shares/${id}`, { auth: false }),
  open: (id: string, codeVerifier?: string) =>
    apiFetch<{ encryptedData: string; codeSalt: string | null; viewsLeft: number | null }>(
      `/public/shares/${id}/open`,
      { method: 'POST', body: codeVerifier ? { codeVerifier } : {}, auth: false },
    ),
};

export const auditApi = {
  list: (cursor?: string) =>
    apiFetch<{ items: AuditEntry[]; nextCursor: string | null }>(
      `/audit?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
};
