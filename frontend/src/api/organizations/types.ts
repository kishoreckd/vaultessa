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
