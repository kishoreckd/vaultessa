import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { PasswordInput } from '@/components/common/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CryptoError } from '@/lib/crypto';
import { usePrefs } from '@/lib/prefs';
import { useSession, type LockReason } from '@/stores/session';
import { AuthCard } from './AuthCard';
import { logout, unlock } from './authFlows';

function reasonText(reason: LockReason | null, minutes: number) {
  switch (reason) {
    case 'idle':
      return `Locked after ${minutes} minute${minutes === 1 ? '' : 's'} of inactivity to keep it safe.`;
    case 'reload':
      return 'Your vault locks whenever the page reloads.';
    default:
      return 'Your vault is locked.';
  }
}

export function UnlockPage() {
  const navigate = useNavigate();
  const account = useSession((s) => s.account);
  const lockReason = useSession((s) => s.lockReason);
  const minutes = usePrefs((s) => s.autoLockMinutes);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlock(password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof CryptoError
          ? 'That master password isn’t right. Check Caps Lock and try again.'
          : 'Could not unlock your vault.',
      );
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={`Welcome back${account ? `, ${account.name.split(' ')[0]}` : ''}`}
      subtitle={
        <>
          <span className="block">{account?.email}</span>
          <span className="mt-1 block">{reasonText(lockReason, minutes)}</span>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <PasswordInput
          label="Master password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          {busy ? 'Unlocking…' : 'Unlock'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Not you?{' '}
        <Button
          variant="link"
          className="h-auto p-0"
          onClick={async () => {
            await logout();
            navigate('/login', { replace: true });
          }}
        >
          Sign out
        </Button>
      </p>
    </AuthCard>
  );
}
