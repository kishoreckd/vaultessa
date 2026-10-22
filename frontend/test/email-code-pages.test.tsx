import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../src/components/ui/tooltip';
import {
  EmailVerificationPage,
  ForgotPasswordPage,
  RecoverVaultPage,
} from '../src/features/auth/RecoveryPages';
import { remainingSeconds } from '../src/features/auth/useEmailCooldown';
import { useSession } from '../src/stores/session';
import type { Account } from '../src/lib/api/types';

afterEach(() => vi.restoreAllMocks());
vi.mock('../src/stores/session', () => ({ useSession: vi.fn(() => null) }));
beforeEach(() => vi.mocked(useSession).mockReturnValue(null));

it('keeps resend disabled until the full cooldown, including fractional seconds', () => {
  expect(remainingSeconds(45000, 0)).toBe(45);
  expect(remainingSeconds(45000, 44001)).toBe(1);
  expect(remainingSeconds(45000, 45000)).toBe(0);
  expect(remainingSeconds(45000, 46000)).toBe(0);
});

it('renders an accessible six-digit verification field with logo-free artwork', () => {
  vi.mocked(useSession).mockReturnValue({
    id: 'account',
    email: 'mira@example.com',
    emailVerified: false,
  } as Account);
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EmailVerificationPage)));
  expect(html).toContain('Verification code');
  expect(html).toContain('autoComplete="one-time-code"');
  expect(html).toContain('inputMode="numeric"');
  expect(html).toContain('maxLength="6"');
  expect(html).toContain('Resend code');
  expect(html.match(/data-slot="input-otp-slot"/g)).toHaveLength(6);
  expect(html.match(/data-slot="input-otp-group"/g)).toHaveLength(1);
  expect(html).not.toContain('input-otp-separator');
  expect(html).toContain('mira@example.com');
  expect(html).not.toContain('Send a new verification link');
  expect(html).not.toContain('Vaultessa logo');
});

it('requests email proof before presenting new password inputs', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ForgotPasswordPage)));
  expect(html).toContain('Send recovery code');
  expect(html).toContain('saved vault recovery key');
  expect(html).not.toContain('autoComplete="new-password"');
});

it('keeps the saved recovery-key requirement on existing recovery links', () => {
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/recover#token=' + 'A'.repeat(43)] },
      createElement(TooltipProvider, null, createElement(RecoverVaultPage)),
    ),
  );
  expect(html).toContain('Vault recovery key');
  expect(html).toContain('New master password');
  expect(html).toContain('Confirm new master password');
});
