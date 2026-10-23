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

export type TokensCreateRequest = {
  name: string;
  authKey: string;
  ownerKey: string;
  expiresAt: string | null;
  grants: Array<{ secretId: string; wrappedKey: string }>;
};
