import { apiFetch } from '../client';
import type {
  AccountChangePasswordRequest,
  SecurityOverview,
  AccountSetupTotpResponse,
  AccountEnableTotpResponse,
  AccountRecoveryCodesResponse,
  DeviceSession,
  AccountRevokeOthersResponse,
  NotificationPrefs,
} from './types';
import type { Account } from '../auth/types';

export const accountApi = {
  changePassword: (body: AccountChangePasswordRequest) =>
    apiFetch<Account>('/account/password', { method: 'POST', body }),
  security: () => apiFetch<SecurityOverview>('/account/security'),
  setupTotp: () => apiFetch<AccountSetupTotpResponse>('/account/mfa/totp/setup', { method: 'POST' }),
  enableTotp: (code: string) =>
    apiFetch<AccountEnableTotpResponse>('/account/mfa/totp/enable', {
      method: 'POST',
      body: { code },
    }),
  disableMfa: (method: 'totp', authHash: string) =>
    apiFetch<void>('/account/mfa/disable', {
      method: 'POST',
      body: { method, authHash },
    }),
  recoveryCodes: (authHash: string) =>
    apiFetch<AccountRecoveryCodesResponse>('/account/mfa/recovery-codes', {
      method: 'POST',
      body: { authHash },
    }),
  sessions: () => apiFetch<DeviceSession[]>('/account/sessions'),
  revokeSession: (id: string) => apiFetch<void>(`/account/sessions/${id}`, { method: 'DELETE' }),
  revokeOthers: () =>
    apiFetch<AccountRevokeOthersResponse>('/account/sessions/revoke-others', {
      method: 'POST',
    }),
  notifications: () => apiFetch<NotificationPrefs>('/account/notifications'),
  setNotifications: (body: NotificationPrefs) =>
    apiFetch<NotificationPrefs>('/account/notifications', {
      method: 'PUT',
      body,
    }),
};
