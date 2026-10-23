import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { TeamsPage } from '../src/features/teams/TeamsPage';
import { useSession } from '../src/stores/session';
import { type Account } from '../src/api/auth/types';

function page(role: 'OWNER' | 'MEMBER', verified: boolean, refreshedVerification = verified) {
  const account = {
    id: 'user-id',
    name: 'Mira',
    email: 'mira@company.example',
    emailVerified: verified,
  } as Account;
  useSession.setState({ account, status: 'unlocked' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['teams', 'email-status'], { emailVerified: refreshedVerification });
  client.setQueryData(
    ['teams', 'list'],
    [{ id: 'team-id', name: 'Design team', role, memberCount: 1, allowDomainJoin: false }],
  );
  client.setQueryData(['teams', 'pending'], []);
  client.setQueryData(['teams', 'discover'], []);
  client.setQueryData(
    ['teams', 'team-id', 'members'],
    [
      {
        userId: 'user-id',
        name: 'Mira',
        email: account.email,
        role,
        isActive: true,
        joinedAt: '2026-10-22T00:00:00Z',
      },
    ],
  );
  client.setQueryData(['teams', 'team-id', 'invitations'], []);
  client.setQueryData(['teams', 'team-id', 'domains'], []);
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries: ['/teams'] }, createElement(TeamsPage)),
    ),
  );
}

afterEach(() => useSession.setState({ account: null, status: 'loggedOut' }));

describe('team role and verification UI', () => {
  it('shows owner controls and real member information', () => {
    const html = page('OWNER', true);
    expect(html).toContain('Invite people');
    expect(html).toContain('Domains');
    expect(html).toContain('mira@company.example');
    expect(html).toContain('Team membership does not share passwords automatically');
  });
  it('does not show admin controls to a member', () => {
    const html = page('MEMBER', true);
    expect(html).not.toContain('Invite people');
    expect(html).not.toContain('>Domains<');
  });
  it('explains verification requirements', () => {
    expect(page('MEMBER', false)).toContain('Verify your email address before creating or joining a team');
  });
  it('picks up verification completed in another tab', () => {
    expect(page('OWNER', false, true)).not.toContain(
      'Verify your email address before creating or joining a team',
    );
  });
});
