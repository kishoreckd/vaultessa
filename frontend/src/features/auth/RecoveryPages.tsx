import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/common/form-field';
import { EmailCodeField } from '@/components/common/email-code-field';
import { PasswordInput } from '@/components/common/password-input';
import { authApi, recoveryApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { authDestination } from '@/lib/auth-destination';
import { emailError } from '@/lib/validation';
import { useSession } from '@/stores/session';
import { useFormErrors } from '@/hooks/useFormErrors';
import { AuthCard } from './AuthCard';
import { AuthIllustration } from './AuthIllustration';
import { useEmailCooldown } from './useEmailCooldown';
import { logout, recoverVault } from './authFlows';

function useEmailToken() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') ?? '');
  useEffect(() => {
    if (location.hash) {
      setToken(new URLSearchParams(location.hash.slice(1)).get('token') ?? '');
      navigate(location.pathname, { replace: true, state: location.state });
    }
  }, [location.hash, location.pathname, location.state, navigate]);
  return token;
}

/** Shared email -> code interaction; recovery only reveals the password form after verification. */
function EmailCodePage({ recovery = false }: { recovery?: boolean }) {
  const legacyToken = useEmailToken();
  const location = useLocation();
  const navigate = useNavigate();
  const account = useSession((s) => s.account);
  const { formRef, errors, validate, clear } = useFormErrors<'email' | 'code'>();
  const [email, setEmail] = useState(recovery ? '' : (account?.email ?? ''));
  const [code, setCode] = useState('');
  const [policy, setPolicy] = useState<{ resendAfterSeconds: number; codeTtlMinutes: number } | null>(null);
  const [policyError, setPolicyError] = useState(false);
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(!recovery);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const { remaining, start } = useEmailCooldown(
    recovery ? 'recovery' : 'verification',
    !recovery && account ? account.email : email,
  );
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The backend is the only source of the resend/expiry policy. Retry briefly (e.g. while the
    // server restarts); sending stays disabled until it answers.
    setPolicyError(false);
    const load = (attempt: number) => {
      void recoveryApi
        .policy()
        .then((value) => {
          if (active) setPolicy(value);
        })
        .catch(() => {
          if (!active) return;
          if (attempt < 3) timer = setTimeout(() => load(attempt + 1), 1500 * (attempt + 1));
          else setPolicyError(true);
        });
    };
    load(0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [policyAttempt]);
  useEffect(() => {
    if (recovery || !account) return;
    let active = true;
    setEmail(account.email);
    void recoveryApi
      .verificationStatus()
      .then((status) => {
        if (active && status.resendAfterSeconds > 0) start(status.resendAfterSeconds);
      })
      .catch(() => {
        /* Resend endpoint still enforces the server timer. */
      });
    return () => {
      active = false;
    };
  }, [account?.id, account?.email, recovery, start]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Please try again.';
      setError(detail);
      toast.error('Could not complete verification', { description: detail });
    } finally {
      setBusy(false);
    }
  };
  const finishVerification = async () => {
    setDone(true);
    toast.success('Email verified');
    if (useSession.getState().account) {
      const fresh = await authApi.me();
      useSession.setState((state) => (state.account?.id === fresh.id ? { account: fresh } : {}));
      if (fresh.emailVerified) navigate(authDestination(location.state), { replace: true });
    }
  };
  const sendCode = () => {
    if (busy || remaining || !policy || !validate({ email: emailError(email) })) return;
    void run(async () => {
      const result = await (recovery
        ? recoveryApi.requestReset(email.trim())
        : recoveryApi.requestVerification(email.trim()));
      start(result.resendAfterSeconds);
      setSent(true);
      setCode('');
      setMessage(result.message);
      toast.success('Request received', { description: result.message });
    });
  };
  if (resetToken) return <RecoveryForm token={resetToken} />;
  return (
    <AuthCard
      illustration={<AuthIllustration recovery={recovery} />}
      title={done ? 'Email verified' : recovery ? 'Recover your vault' : 'Check your inbox'}
      subtitle={
        recovery
          ? 'Verify your email, then choose a new master password.'
          : 'One small step to secure your account.'
      }
    >
      <div className="grid gap-5">
        {done ? (
          <Button asChild>
            <Link to="/login">Continue to sign in</Link>
          </Button>
        ) : (
          <>
            <p className="text-center text-sm leading-relaxed text-muted-foreground">
              {recovery ? (
                'Use the email address for your account. Your saved vault recovery key is also required to restore your encrypted items.'
              ) : (
                <>
                  Enter the six-digit code sent to{' '}
                  {account ? (
                    <strong className="break-all font-medium text-foreground">{account.email}</strong>
                  ) : (
                    'your email address'
                  )}
                  .
                </>
              )}
            </p>
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="text-sm text-muted-foreground">
                {message}
              </p>
            )}
            <form
              ref={formRef}
              noValidate
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!sent) {
                  sendCode();
                  return;
                }
                if (
                  busy ||
                  !validate({
                    email: emailError(email),
                    code: /^\d{6}$/.test(code) ? null : 'Enter the six-digit code from your email.',
                  })
                )
                  return;
                void run(async () => {
                  if (recovery) {
                    setResetToken((await recoveryApi.verifyResetCode(email.trim(), code)).token);
                    toast.success('Email confirmed', {
                      description: 'You can now set a new master password.',
                    });
                  } else {
                    await recoveryApi.verifyCode(email.trim(), code);
                    await finishVerification();
                  }
                });
              }}
            >
              {(!account || recovery) && (
                <TextField
                  label="Email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  error={errors.email}
                  readOnly={sent && recovery}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clear('email');
                    setError('');
                  }}
                />
              )}
              {sent && (
                <EmailCodeField
                  value={code}
                  error={errors.code}
                  remaining={remaining}
                  disabled={busy}
                  resendDisabled={busy || !policy || remaining > 0}
                  onResend={sendCode}
                  hint={
                    policy
                      ? `Code expires after ${policy.codeTtlMinutes} minutes. Check spam if it hasn't arrived.`
                      : 'Check your inbox and spam folder.'
                  }
                  onChange={(value) => {
                    setCode(value);
                    clear('code');
                    setError('');
                  }}
                />
              )}
              <Button disabled={busy || (!sent && (!policy || remaining > 0))} type="submit">
                {busy
                  ? 'Please wait…'
                  : sent
                    ? recovery
                      ? 'Verify code and continue'
                      : 'Verify email'
                    : remaining
                      ? `Send code in ${remaining}s`
                      : recovery
                        ? 'Send recovery code'
                        : 'Send verification code'}
              </Button>
            </form>
            {policyError && (
              <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                <span>Couldn’t reach the server to load the email code settings.</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setPolicyAttempt((n) => n + 1)}>
                  Try again
                </Button>
              </div>
            )}
            {legacyToken && !recovery && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await recoveryApi.verify(legacyToken);
                    await finishVerification();
                  })
                }
              >
                Verify using my email link
              </Button>
            )}
            {recovery && sent && (
              <Button
                variant="link"
                disabled={busy}
                onClick={() => {
                  setSent(false);
                  setCode('');
                  setMessage('');
                }}
              >
                Use a different email
              </Button>
            )}
            {account && !recovery ? (
              <Button
                variant="link"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await logout();
                    navigate('/login', { replace: true });
                  })
                }
              >
                Use a different account
              </Button>
            ) : (
              <Link className="text-center text-sm text-primary underline underline-offset-4" to="/login">
                Back to sign in
              </Link>
            )}
          </>
        )}
      </div>
    </AuthCard>
  );
}

export function EmailVerificationPage() {
  return <EmailCodePage />;
}
export function ForgotPasswordPage() {
  return <EmailCodePage recovery />;
}
export function RecoverVaultPage() {
  return <RecoveryForm token={useEmailToken()} />;
}

function RecoveryForm({ token }: { token: string }) {
  const { formRef, errors, validate, clear } = useFormErrors<'key' | 'password' | 'confirm'>();
  const [key, setKey] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  return (
    <AuthCard
      illustration={<AuthIllustration recovery />}
      title={done ? 'Master password reset' : 'Recover your vault'}
      subtitle={
        done
          ? 'Your encrypted items are preserved.'
          : 'Your saved recovery key unlocks the vault on this device.'
      }
    >
      {done ? (
        <div className="grid gap-4">
          <p className="text-sm">
            Existing sessions were signed out and developer tokens revoked. MFA stays enabled. After signing
            in, create a new vault recovery key in Settings.
          </p>
          <Button asChild>
            <Link to="/login">Sign in with new password</Link>
          </Button>
        </div>
      ) : !token ? (
        <div className="grid gap-4">
          <p className="text-sm">
            Open the recovery link from your email. If you refreshed this page, request a new link.
          </p>
          <Button asChild>
            <Link to="/forgot-password">Request recovery link</Link>
          </Button>
        </div>
      ) : (
        <form
          ref={formRef}
          noValidate
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            if (
              !validate({
                key: key.trim() ? null : 'Enter your saved vault recovery key.',
                password: password.normalize('NFKC').length >= 12 ? null : 'Use at least 12 characters.',
                confirm: password === confirm ? null : 'The passwords do not match.',
              })
            )
              return;
            setBusy(true);
            try {
              await recoverVault(token, key, password);
              setKey('');
              setPassword('');
              setConfirm('');
              setDone(true);
              toast.success('Master password reset', { description: 'Sign in with your new password.' });
            } catch (err) {
              if (err instanceof ApiError && err.code === 'PASSWORD_REUSED')
                validate({ password: err.message });
              toast.error('Could not reset your password', {
                description: err instanceof Error ? err.message : 'Please try again.',
              });
              setError(
                err instanceof Error && err.message === 'Decryption failed'
                  ? 'This recovery key could not unlock the vault. Check the key you saved.'
                  : err instanceof Error
                    ? err.message
                    : 'Could not recover your vault.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <PasswordInput
            label="Vault recovery key"
            required
            value={key}
            error={errors.key}
            onChange={(e) => {
              setKey(e.target.value);
              clear('key');
            }}
            autoComplete="off"
            placeholder="vrk.…"
            hint="This is not an MFA recovery code. Never send this key by email."
          />
          <PasswordInput
            label="New master password"
            required
            value={password}
            error={errors.password}
            onChange={(e) => {
              setPassword(e.target.value);
              clear('password');
            }}
            autoComplete="new-password"
          />
          <PasswordInput
            label="Confirm new master password"
            required
            value={confirm}
            error={errors.confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              clear('confirm');
            }}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">
            Recovery consumes this key, signs out all devices, and revokes developer tokens. Your items stay
            encrypted and MFA remains enabled.
          </p>
          <Button type="submit" disabled={busy}>
            {busy ? 'Recovering…' : 'Set new master password'}
          </Button>
          <Link className="text-sm text-primary underline" to="/forgot-password">
            Request another link
          </Link>
        </form>
      )}
    </AuthCard>
  );
}
