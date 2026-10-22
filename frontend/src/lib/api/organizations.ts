import { apiFetch } from './client';

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type Organization = {
  id: string;
  name: string;
  role: OrganizationRole;
  memberCount: number;
  allowDomainJoin: boolean;
};
export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  isActive: boolean;
  joinedAt: string;
};
export type TeamInvitation = {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: string;
  expiresAt: string;
};
export type TeamDomain = {
  id: string;
  domain: string;
  txtName: string;
  txtValue: string;
  verifiedUntil: string | null;
};
export type DiscoveredTeam = { id: string; name: string; domain: string };

export const organizationsApi = {
  list: () => apiFetch<Organization[]>('/organizations'),
  create: (name: string) =>
    apiFetch<Organization>('/organizations', {
      method: 'POST',
      body: { name },
    }),
  update: (id: string, name: string, allowDomainJoin: boolean) =>
    apiFetch<Organization>(`/organizations/${id}`, {
      method: 'PATCH',
      body: { name, allowDomainJoin },
    }),
  members: (id: string) => apiFetch<TeamMember[]>(`/organizations/${id}/members`),
  role: (id: string, userId: string, role: 'ADMIN' | 'MEMBER') =>
    apiFetch<void>(`/organizations/${id}/members/${userId}`, {
      method: 'PATCH',
      body: { role },
    }),
  remove: (id: string, userId: string) =>
    apiFetch<void>(`/organizations/${id}/members/${userId}`, {
      method: 'DELETE',
    }),
  transfer: (id: string, userId: string, authHash: string) =>
    apiFetch<void>(`/organizations/${id}/transfer`, {
      method: 'POST',
      body: { userId, authHash },
    }),
  pending: () => apiFetch<TeamInvitation[]>('/organizations/invitations'),
  accept: (id: string) =>
    apiFetch<Organization>(`/organizations/invitations/${id}/accept`, {
      method: 'POST',
    }),
  invitations: (id: string) => apiFetch<TeamInvitation[]>(`/organizations/${id}/invitations`),
  invite: (id: string, email: string, role: 'ADMIN' | 'MEMBER') =>
    apiFetch<TeamInvitation>(`/organizations/${id}/invitations`, {
      method: 'POST',
      body: { email, role },
    }),
  revoke: (id: string, invitation: string) =>
    apiFetch<void>(`/organizations/${id}/invitations/${invitation}`, {
      method: 'DELETE',
    }),
  discover: () => apiFetch<DiscoveredTeam[]>('/organizations/discover'),
  join: (id: string) => apiFetch<Organization>(`/organizations/${id}/join`, { method: 'POST' }),
  domains: (id: string) => apiFetch<TeamDomain[]>(`/organizations/${id}/domains`),
  addDomain: (id: string, domain: string) =>
    apiFetch<TeamDomain>(`/organizations/${id}/domains`, {
      method: 'POST',
      body: { domain },
    }),
  verifyDomain: (id: string, domainId: string) =>
    apiFetch<TeamDomain>(`/organizations/${id}/domains/${domainId}/verify`, {
      method: 'POST',
    }),
  removeDomain: (id: string, domainId: string) =>
    apiFetch<void>(`/organizations/${id}/domains/${domainId}`, {
      method: 'DELETE',
    }),
};
