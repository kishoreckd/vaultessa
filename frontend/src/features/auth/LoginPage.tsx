import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { TextField } from '@/components/common/form-field';
import { PasswordInput } from '@/components/common/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFormErrors } from '@/hooks/useFormErrors';
import { ApiError } from '@/api/client';
import { emailError } from '@/lib/validation';
import { authDestination } from '@/lib/auth-destination';
import { AuthCard } from './AuthCard';
import { login, type PendingMfa } from './authFlows';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const destination = authDestination(location.state);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingMfa>();
  const [method, setMethod] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const { formRef, errors, validate, clear } = useFormErrors<'email' | 'password'>();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!validate({ email: emailError(email), password: password ? null : 'Enter your master password.' }))
      return;
    setBusy(true);
    setError(null);
    try {
      const next = await login(email, password);
      setPassword('');
      if (next) {
        setPending(next);
        setMethod(next.challenge.methods.includes('totp') ? 'totp' : 'recovery');
        return;
      }
      navigate(destination, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'That email and master password don’t match. Check Caps Lock and try again.'
          : err instanceof ApiError
            ? err.message
            : 'Could not sign in. Check your connection and try again.',
      );
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  if (pending)
    return (
      <AuthCard title="Two-step verification" subtitle="Enter a code to finish signing in.">
        <form
          className="grid gap-4"
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            if (!code.trim()) {
              setError('Enter your verification code.');
              return;
            }
            if (method === 'totp' && !/^\d{6}$/.test(code)) {
              setError('Enter the six-digit code from your authenticator app.');
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await pending.complete(method, code.trim());
              setPending(undefined);
              navigate(destination, { replace: true });
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not verify the code.');
              setCode('');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Tabs
            value={method}
            onValueChange={(value) => {
              setMethod(value as typeof method);
              setCode('');
              setError(null);
            }}
          >
            <TabsList>
              {pending.challenge.methods.includes('totp') && (
                <TabsTrigger value="totp">Authenticator</TabsTrigger>
              )}
              <TabsTrigger value="recovery">Recovery code</TabsTrigger>
            </TabsList>
          </Tabs>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {method === 'totp' ? (
            <div className="grid gap-2">
              <Label htmlFor="login-authenticator-code">Authenticator code</Label>
              <InputOTP
                id="login-authenticator-code"
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                value={code}
                onChange={setCode}
                disabled={busy}
                pasteTransformer={(text) => text.replace(/\D/g, '')}
                aria-describedby="authenticator-code-hint"
              >
                <InputOTPGroup>
                  {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}
                </InputOTPGroup>
              </InputOTP>
              <p id="authenticator-code-hint" className="text-xs text-muted-foreground">
                Use your authenticator app. Codes refresh every 30 seconds and are not sent by email.
                If a code fails, wait for the next one and check that your device time is set automatically.
              </p>
            </div>
          ) : <TextField
            label="Recovery code"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
            inputMode="text"
          />}
          <Button disabled={busy} type="submit">
            {busy ? 'Verifying…' : 'Verify and unlock'}
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            type="button"
            onClick={() => {
              setPending(undefined);
              setCode('');
              setError(null);
            }}
          >
            Back to sign in
          </Button>
        </form>
      </AuthCard>
    );

  return (
    <AuthCard title="Sign in to your vault" subtitle="Your vault is decrypted on this device only.">
      <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          error={errors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            clear('email');
          }}
        />
        <PasswordInput
          label="Master password"
          autoComplete="current-password"
          required
          value={password}
          error={errors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            clear('password');
          }}
        />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          {busy ? 'Unlocking your vault…' : 'Sign in'}
        </Button>
        <Link to="/forgot-password" className="text-center text-sm text-primary underline">
          Forgot master password?
        </Link>
        {busy && (
          <p className="text-center text-xs text-muted-foreground" role="status">
            Deriving your encryption key on this device. It takes a second on purpose — it makes guessing very
            slow.
          </p>
        )}
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Vaultessa?{' '}
        <Link state={{ from: destination }} to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
          Create a free account
        </Link>
      </p>
    </AuthCard>
  );
}
