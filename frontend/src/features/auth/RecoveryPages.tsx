import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/common/form-field';
import { PasswordInput } from '@/components/common/password-input';
import { recoveryApi } from '@/lib/api/endpoints';
import { emailError } from '@/lib/validation';
import { useSession } from '@/stores/session';
import { AuthCard } from './AuthCard';
import { recoverVault } from './authFlows';
import { useFormErrors } from '@/hooks/useFormErrors';

function useEmailToken() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') ?? '');
  useEffect(() => {
    if (location.hash) {
      setToken(new URLSearchParams(location.hash.slice(1)).get('token') ?? '');
      navigate(location.pathname, { replace: true });
    }
  }, [location.hash, location.pathname, navigate]);
  return token;
}

export function EmailVerificationPage() {
  const token = useEmailToken();
  const account = useSession((s) => s.account);
  const [email, setEmail] = useState(account?.email ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify email.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Verify your email" subtitle="Confirm the address for your Vaultessa account.">
      <div className="grid gap-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        {token && !done && (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await recoveryApi.verify(token);
                setMessage(result.message);
                setDone(true);
              })
            }
          >
            {busy ? 'Verifying…' : 'Verify my email'}
          </Button>
        )}
        {!done && (
          <form
            noValidate
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const issue = emailError(email);
              if (issue) {
                setError(issue);
                return;
              }
              void run(async () => {
                setMessage((await recoveryApi.requestVerification(email.trim())).message);
              });
            }}
          >
            <TextField
              label="Email"
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button variant="outline" disabled={busy} type="submit">
              Send a new verification link
            </Button>
          </form>
        )}
        <Link className="text-sm text-primary underline" to={account ? '/settings' : '/login'}>
          {account ? 'Go to Settings' : 'Back to sign in'}
        </Link>
      </div>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const { formRef, errors, validate, clear } = useFormErrors<'email'>();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <AuthCard
      title="Forgot your master password?"
      subtitle="Recover with your verified email and saved vault recovery key."
    >
      <form
        ref={formRef}
        noValidate
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!validate({ email: emailError(email) })) return;
          setBusy(true);
          setError('');
          try {
            setMessage((await recoveryApi.requestReset(email.trim())).message);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not request recovery.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-muted-foreground">
          You must have enabled vault recovery and saved a key starting with vrk. before forgetting your
          password. Without it, Vaultessa cannot restore access to your existing vault.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        <TextField
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          error={errors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            clear('email');
          }}
        />
        <Button disabled={busy} type="submit">
          {busy ? 'Requesting…' : 'Email recovery link'}
        </Button>
        <Link className="text-sm text-primary underline" to="/login">
          Back to sign in
        </Link>
      </form>
    </AuthCard>
  );
}

export function RecoverVaultPage() {
  const { formRef, errors, validate, clear } = useFormErrors<'key' | 'password' | 'confirm'>();
  const token = useEmailToken();
  const [key, setKey] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  return (
    <AuthCard
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
            } catch (err) {
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
