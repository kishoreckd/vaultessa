import { apiFetch } from '../client';
import type {
  Prelogin,
  AuthRegisterRequest,
  LoginResponse,
  AuthLoginRequest,
  MfaChallenge,
  AuthMfaRequest,
  Account,
} from './types';

export const authApi = {
  prelogin: (email: string) =>
    apiFetch<Prelogin>('/auth/prelogin', {
      method: 'POST',
      body: { email },
      auth: false,
    }),
  register: (body: AuthRegisterRequest) =>
    apiFetch<LoginResponse>('/auth/register', {
      method: 'POST',
      body,
      auth: false,
    }),
  login: (body: AuthLoginRequest) =>
    apiFetch<LoginResponse | MfaChallenge>('/auth/login', {
      method: 'POST',
      body,
      auth: false,
    }),
  mfa: (body: AuthMfaRequest) =>
    apiFetch<LoginResponse>('/auth/login/mfa', {
      method: 'POST',
      body,
      auth: false,
    }),
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST', auth: false }),
  me: () => apiFetch<Account>('/auth/me'),
};
