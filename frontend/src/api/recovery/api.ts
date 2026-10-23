import { apiFetch } from '../client';
import type {
  RecoveryPolicyResponse,
  RecoveryVerificationStatusResponse,
  RecoveryVerifyCodeResponse,
  RecoveryVerifyResetCodeResponse,
  RecoveryStatusResponse,
  RecoveryRequestVerificationResponse,
  RecoveryVerifyResponse,
  RecoveryEnableRequest,
  RecoveryRequestResetResponse,
  RecoveryInspectResponse,
  RecoveryResetRequest,
  RecoveryResetResponse,
} from './types';

export const recoveryApi = {
  policy: () => apiFetch<RecoveryPolicyResponse>('/auth/email/policy', { auth: false }),
  verificationStatus: () => apiFetch<RecoveryVerificationStatusResponse>('/auth/email/status'),
  verifyCode: (email: string, code: string) =>
    apiFetch<RecoveryVerifyCodeResponse>('/auth/email/verify-code', {
      method: 'POST',
      body: { email, code },
      auth: false,
    }),
  verifyResetCode: (email: string, code: string) =>
    apiFetch<RecoveryVerifyResetCodeResponse>('/auth/recovery/verify-code', {
      method: 'POST',
      body: { email, code },
      auth: false,
    }),
  status: () => apiFetch<RecoveryStatusResponse>('/account/recovery'),
  requestVerification: (email: string) =>
    apiFetch<RecoveryRequestVerificationResponse>('/auth/email/request', {
      method: 'POST',
      body: { email },
      auth: false,
    }),
  verify: (token: string) =>
    apiFetch<RecoveryVerifyResponse>('/auth/email/verify', {
      method: 'POST',
      body: { token },
      auth: false,
    }),
  enable: (body: RecoveryEnableRequest) => apiFetch<void>('/account/recovery', { method: 'PUT', body }),
  disable: (authHash: string) =>
    apiFetch<void>('/account/recovery/disable', {
      method: 'POST',
      body: { authHash },
    }),
  requestReset: (email: string) =>
    apiFetch<RecoveryRequestResetResponse>('/auth/recovery/request', {
      method: 'POST',
      body: { email },
      auth: false,
    }),
  inspect: (token: string) =>
    apiFetch<RecoveryInspectResponse>('/auth/recovery/inspect', {
      method: 'POST',
      body: { token },
      auth: false,
    }),
  reset: (body: RecoveryResetRequest) =>
    apiFetch<RecoveryResetResponse>('/auth/recovery/reset', {
      method: 'POST',
      body,
      auth: false,
    }),
};
