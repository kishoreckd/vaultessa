export type RecoveryPolicyResponse = { resendAfterSeconds: number; codeTtlMinutes: number };

export type RecoveryVerificationStatusResponse = { resendAfterSeconds: number };

export type RecoveryVerifyCodeResponse = { message: string };

export type RecoveryVerifyResetCodeResponse = { token: string };

export type RecoveryStatusResponse = {
  emailVerified: boolean;
  recoveryEnabled: boolean;
  emailAvailable: boolean;
};

export type RecoveryRequestVerificationResponse = { message: string; resendAfterSeconds: number };

export type RecoveryVerifyResponse = { message: string };

export type RecoveryEnableRequest = { authHash: string; recoveryAuth: string; wrappedVaultKey: string };

export type RecoveryRequestResetResponse = { message: string; resendAfterSeconds: number };

export type RecoveryInspectResponse = { wrappedVaultKey: string; kdfSalt: string; kdfIterations: number };

export type RecoveryResetRequest = {
  token: string;
  recoveryAuth: string;
  newAuthHash: string;
  currentKdfAuthHash: string;
  kdfSalt: string;
  kdfIterations: number;
  protectedVaultKey: string;
};

export type RecoveryResetResponse = { message: string };
