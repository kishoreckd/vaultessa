import type { Permission } from '../sharing/types';

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

export type VaultItem = {
  organizationId: string | null;
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
  expiresAt: string | null;
};

export type HistoryEntry = {
  id: string;
  encryptedData: string;
  changedBy: { id: string; name: string; email: string } | null;
  createdAt: string;
};

export type SecretsCreateRequest = {
  type: SecretType;
  expiresAt?: string | null;
  encryptedData: string;
  wrappedKey: string;
  folderId?: string | null;
  favorite?: boolean;
};

export type SecretsUpdateRequest = {
  encryptedData: string;
  revision: number;
  expiresAt?: string | null;
};

export type SecretsUpdateAccessRequest = {
  folderId?: string | null;
  favorite?: boolean;
  wrappedKey?: string;
};
