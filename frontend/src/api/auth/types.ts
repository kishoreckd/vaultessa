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
  totpEnabled: boolean;
  mfaPhone: string | null;
};

export type LoginResponse = { accessToken: string; account: Account };

export type MfaChallenge = {
  mfaRequired: true;
  mfaToken: string;
  methods: Array<'totp' | 'recovery'>;
};

export type Prelogin = {
  kdf: 'PBKDF2_SHA256';
  kdfIterations: number;
  kdfSalt: string;
};

export type AuthRegisterRequest = {
  email: string;
  name: string;
  authHash: string;
  kdfIterations: number;
  kdfSalt: string;
  protectedVaultKey: string;
  publicKey: string;
  protectedPrivateKey: string;
};

export type AuthLoginRequest = { email: string; authHash: string };

export type AuthMfaRequest = {
  mfaToken: string;
  method: 'totp' | 'recovery';
  code?: string;
  /** skip the two-step code on this browser for 30 days (master password still required) */
  rememberDevice?: boolean;
};
