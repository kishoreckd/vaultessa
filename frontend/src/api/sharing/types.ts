export const PERMISSIONS = ['LOGIN_ONLY', 'VIEW', 'MODIFY', 'MANAGE'] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type UserLookup = {
  id: string;
  email: string;
  name: string;
  publicKey: string;
};

export type Share = {
  organizationId: string | null;
  userId: string;
  email: string;
  name: string;
  permission: Permission;
  isOwner: boolean;
  accepted: boolean;
};

export type ExternalShareStatus = 'active' | 'expired' | 'used' | 'revoked' | 'locked';

export type ExternalShare = {
  id: string;
  secretId: string | null;
  status: ExternalShareStatus;
  hasCode: boolean;
  maxViews: number | null;
  viewCount: number;
  expiresAt: string;
  recipientEmail: string | null;
  outsideDomain: boolean;
  /** EncString under the owner's vault key: { linkKey, accessCode?, fieldKeys, message? } */
  ownerKey: string | null;
  createdAt: string;
  lastViewedAt: string | null;
  emailed: boolean;
};

export type PublicShareInfo = {
  status: ExternalShareStatus;
  senderName: string;
  hasCode: boolean;
  codeSalt: string | null;
  expiresAt: string;
  viewsLeft: number | null;
};

export type SharingGrantRequest = {
  userId: string;
  wrappedKey: string;
  permission: Permission;
  organizationId?: string | null;
};

export type SharingGrantResponse = { ok: boolean };

export type SharingUpdateResponse = { ok: boolean };

export type ExternalSharesUpdateLimitsRequest = { expiresAt: string; maxViews: number | null };

export type ExternalSharesConfigResponse = { emailEnabled: boolean };

export type ExternalSharesCreateRequest = {
  secretId: string;
  encryptedData: string;
  expiresAt: string;
  maxViews?: number | null;
  codeSalt?: string;
  codeVerifier?: string;
  recipientEmail?: string;
  ownerKey?: string;
};

export type ExternalSharesReopenRequest = {
  encryptedData: string;
  expiresAt: string;
  maxViews?: number | null;
  codeSalt?: string;
  codeVerifier?: string;
};

export type PublicSharesOpenResponse = {
  encryptedData: string;
  codeSalt: string | null;
  viewsLeft: number | null;
};
