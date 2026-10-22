import { apiFetch } from './client';
import type {
  Account,
  AccessToken,
  AuditEntry,
  ExternalShare,
  Folder,
  HistoryEntry,
  LoginResponse,
  MfaChallenge,
  SecurityOverview,
  DeviceSession,
  NotificationPrefs,
  Permission,
  Prelogin,
  PublicShareInfo,
  SecretType,
  Share,
  UserLookup,
  VaultItem,
} from './types';

export const authApi = {
  prelogin: (email: string) =>
    apiFetch<Prelogin>('/auth/prelogin', { method: 'POST', body: { email }, auth: false }),
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
    apiFetch<LoginResponse | MfaChallenge>('/auth/login', { method: 'POST', body, auth: false }),
  mfa: (body: {
    mfaToken: string;
    method: 'totp' | 'sms' | 'recovery';
    code?: string;
    firebaseIdToken?: string;
  }) => apiFetch<LoginResponse>('/auth/login/mfa', { method: 'POST', body, auth: false }),
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST', auth: false }),
  me: () => apiFetch<Account>('/auth/me'),
};

export const accountApi = {
  changePassword: (body: {
    authHash: string;
    newAuthHash: string;
    kdfSalt: string;
    kdfIterations: number;
    protectedVaultKey: string;
  }) => apiFetch<Account>('/account/password', { method: 'POST', body }),
  security: () => apiFetch<SecurityOverview>('/account/security'),
  setupTotp: () =>
    apiFetch<{ secret: string; otpauthUri: string }>('/account/mfa/totp/setup', { method: 'POST' }),
  enableTotp: (code: string) =>
    apiFetch<{ recoveryCodes: string[] | null }>('/account/mfa/totp/enable', {
      method: 'POST',
      body: { code },
    }),
  disableMfa: (method: 'totp' | 'sms', authHash: string) =>
    apiFetch<void>('/account/mfa/disable', { method: 'POST', body: { method, authHash } }),
  recoveryCodes: (authHash: string) =>
    apiFetch<{ recoveryCodes: string[] | null }>('/account/mfa/recovery-codes', {
      method: 'POST',
      body: { authHash },
    }),
  sessions: () => apiFetch<DeviceSession[]>('/account/sessions'),
  revokeSession: (id: string) => apiFetch<void>(`/account/sessions/${id}`, { method: 'DELETE' }),
  revokeOthers: () => apiFetch<{ revoked: number }>('/account/sessions/revoke-others', { method: 'POST' }),
  notifications: () => apiFetch<NotificationPrefs>('/account/notifications'),
  setNotifications: (body: NotificationPrefs) =>
    apiFetch<NotificationPrefs>('/account/notifications', { method: 'PUT', body }),
};

export const recoveryApi = {
  status: () =>
    apiFetch<{ emailVerified: boolean; recoveryEnabled: boolean; emailAvailable: boolean }>(
      '/account/recovery',
    ),
  requestVerification: (email: string) =>
    apiFetch<{ message: string }>('/auth/email/request', { method: 'POST', body: { email }, auth: false }),
  verify: (token: string) =>
    apiFetch<{ message: string }>('/auth/email/verify', { method: 'POST', body: { token }, auth: false }),
  enable: (body: { authHash: string; recoveryAuth: string; wrappedVaultKey: string }) =>
    apiFetch<void>('/account/recovery', { method: 'PUT', body }),
  disable: (authHash: string) =>
    apiFetch<void>('/account/recovery/disable', { method: 'POST', body: { authHash } }),
  requestReset: (email: string) =>
    apiFetch<{ message: string }>('/auth/recovery/request', { method: 'POST', body: { email }, auth: false }),
  inspect: (token: string) =>
    apiFetch<{ wrappedVaultKey: string }>('/auth/recovery/inspect', {
      method: 'POST',
      body: { token },
      auth: false,
    }),
  reset: (body: {
    token: string;
    recoveryAuth: string;
    newAuthHash: string;
    kdfSalt: string;
    kdfIterations: number;
    protectedVaultKey: string;
  }) => apiFetch<{ message: string }>('/auth/recovery/reset', { method: 'POST', body, auth: false }),
};

export const tokensApi = {
  list: () => apiFetch<AccessToken[]>('/tokens'),
  create: (body: {
    name: string;
    authKey: string;
    ownerKey: string;
    expiresAt: string | null;
    grants: Array<{ secretId: string; wrappedKey: string }>;
  }) => apiFetch<AccessToken>('/tokens', { method: 'POST', body }),
  revoke: (id: string) => apiFetch<void>(`/tokens/${id}`, { method: 'DELETE' }),
  grants: (id: string, grants: Array<{ secretId: string; wrappedKey: string }>) =>
    apiFetch<AccessToken>(`/tokens/${id}/grants`, { method: 'PUT', body: { grants } }),
};

export const secretsApi = {
  list: () => apiFetch<VaultItem[]>('/secrets'),
  create: (body: {
    type: SecretType;
    expiresAt?: string | null;
    encryptedData: string;
    wrappedKey: string;
    folderId?: string | null;
    favorite?: boolean;
  }) => apiFetch<VaultItem>('/secrets', { method: 'POST', body }),
  update: (id: string, body: { encryptedData: string; revision: number; expiresAt?: string | null }) =>
    apiFetch<VaultItem>(`/secrets/${id}`, { method: 'PUT', body }),
  updateAccess: (id: string, body: { folderId?: string | null; favorite?: boolean; wrappedKey?: string }) =>
    apiFetch<VaultItem>(`/secrets/${id}/access`, { method: 'PATCH', body }),
  remove: (id: string) => apiFetch<void>(`/secrets/${id}`, { method: 'DELETE' }),
  history: (id: string) => apiFetch<HistoryEntry[]>(`/secrets/${id}/history`),
};

export const foldersApi = {
  list: () => apiFetch<Folder[]>('/folders'),
  create: (encryptedName: string) =>
    apiFetch<Folder>('/folders', { method: 'POST', body: { encryptedName } }),
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
    apiFetch<{ ok: true }>(`/secrets/${secretId}/shares/${userId}`, {
      method: 'PATCH',
      body: { permission },
    }),
  revoke: (secretId: string, userId: string) =>
    apiFetch<void>(`/secrets/${secretId}/shares/${userId}`, { method: 'DELETE' }),
};

export const externalSharesApi = {
  updateLimits: (id: string, body: { expiresAt: string; maxViews: number | null }) =>
    apiFetch<ExternalShare>(`/external-shares/${id}/limits`, { method: 'PATCH', body }),
  config: () => apiFetch<{ emailEnabled: boolean }>('/external-shares/config'),
  list: (secretId?: string) =>
    apiFetch<ExternalShare[]>(
      `/external-shares${secretId ? `?secretId=${encodeURIComponent(secretId)}` : ''}`,
    ),
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
    body: {
      encryptedData: string;
      expiresAt: string;
      maxViews?: number | null;
      codeSalt?: string;
      codeVerifier?: string;
    },
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
  list: (cursor?: string, linkId?: string) =>
    apiFetch<{ items: AuditEntry[]; nextCursor: string | null }>(
      `/audit?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${linkId ? `&linkId=${encodeURIComponent(linkId)}` : ''}`,
    ),
};
