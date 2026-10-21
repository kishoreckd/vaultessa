import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { TextField } from '@/components/common/form-field';
import { PasswordInput } from '@/components/common/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import { AuthCard } from './AuthCard';
import { login } from './authFlows';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/', { replace: true });
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

  return (
    <AuthCard title="Sign in to your vault" subtitle="Your vault is decrypted on this device only.">
      <form onSubmit={onSubmit} className="grid gap-4">
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
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordInput
          label="Master password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          {busy ? 'Unlocking your vault…' : 'Sign in'}
        </Button>
        {busy && (
          <p className="text-center text-xs text-muted-foreground" role="status">
            Deriving your encryption key on this device. It takes a second on purpose — it makes guessing very slow.
          </p>
        )}
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Vaultessa?{' '}
        <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
          Create a free account
        </Link>
      </p>
    </AuthCard>
  );
}
