// Mirrors docs/05-api-spec.md

export type Account = {
  id: string;
  email: string;
  name: string;
  kdf: 'PBKDF2_SHA256';
  kdfIterations: number;
  kdfSalt: string;
  protectedVaultKey: string;
  publicKey: string;
  protectedPrivateKey: string;
  emailVerified: boolean;
};

export type LoginResponse = { accessToken: string; account: Account };
export type MfaChallenge = {
  mfaRequired: true;
  mfaToken: string;
  methods: Array<'totp' | 'sms' | 'recovery'>;
  phone: string | null;
};
export type SecurityOverview = {
  totpEnabled: boolean;
  phone: string | null;
  recoveryCodesLeft: number;
  smsAvailable: boolean;
  emailAvailable: boolean;
};
export type DeviceSession = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
};
export type NotificationPrefs = {
  sharing: boolean;
  links: boolean;
  expiry: boolean;
};
export type AccessToken = {
  id: string;
  name: string;
  status: 'active' | 'expired' | 'revoked';
  itemIds: string[];
  ownerKey: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
};

export type Prelogin = {
  kdf: 'PBKDF2_SHA256';
  kdfIterations: number;
  kdfSalt: string;
};

export const SECRET_TYPES = [
  'LOGIN',
  'SECURE_NOTE',
  'CARD',
  'IDENTITY',
  'BANK_ACCOUNT',
  'SSH_KEY',
  'API_KEY',
  'WIFI',
  'SERVER',
] as const;
export type SecretType = (typeof SECRET_TYPES)[number];

export const PERMISSIONS = ['LOGIN_ONLY', 'VIEW', 'MODIFY', 'MANAGE'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type VaultItem = {
  organizationId?: string | null;
  id: string;
  type: SecretType;
  encryptedData: string;
  revision: number;
  ownerId: string;
  owner: { id: string; name: string; email: string };
  isOwner: boolean;
  wrappedKey: string;
  keyWrap: 'VAULT' | 'RSA';
  permission: Permission;
  folderId: string | null;
  favorite: boolean;
  /** people besides the owner with access */
  sharedWith: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
};

export type Folder = {
  id: string;
  encryptedName: string;
  createdAt: string;
  updatedAt: string;
};

export type HistoryEntry = {
  id: string;
  encryptedData: string;
  changedBy: { id: string; name: string; email: string } | null;
  createdAt: string;
};

export type UserLookup = {
  id: string;
  email: string;
  name: string;
  publicKey: string;
};

export type Share = {
  organizationId?: string | null;
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

export type AuditEntry = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};
