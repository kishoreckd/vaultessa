export type SecurityOverview = {
  totpEnabled: boolean;
  recoveryCodesLeft: number;
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

export type EmailSettings = {
  recipient: string;
  configured: boolean;
  delivery: 'not_tested';
  preferences: NotificationPrefs;
  categories: {
    key: 'security' | keyof NotificationPrefs;
    title: string;
    description: string;
    events: string[];
    required: boolean;
  }[];
};

export type AccountChangePasswordRequest = {
  authHash: string;
  newAuthHash: string;
  kdfSalt: string;
  kdfIterations: number;
  protectedVaultKey: string;
};

export type AccountSetupTotpResponse = { secret: string; otpauthUri: string };

export type AccountEnableTotpResponse = { recoveryCodes: string[] | null };


export type AccountRecoveryCodesResponse = { recoveryCodes: string[] | null };

export type AccountRevokeOthersResponse = { revoked: number };
