import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { recoveryApi } from '@/api/recovery/api';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/common/password-input';
import { AuthCard } from './AuthCard';
import { enableVaultRecovery } from './authFlows';
import { RecoveryKeyCard } from './RecoveryKeyCard';

export function RecoverySetup({ onDone }: { onDone: () => void }) {
  const status = useQuery({ queryKey: ['vault-recovery-status'], queryFn: recoveryApi.status });
  const [password, setPassword] = useState('');
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <AuthCard title={key ? 'Save your recovery key' : 'Protect your way back in'} subtitle="Recover your vault if you forget your master password.">
    <div className="grid gap-4">
      {key ? <>
        <RecoveryKeyCard recoveryKey={key} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I saved this key somewhere safe outside Vaultessa.</label>
        <Button disabled={!saved} onClick={onDone}>Continue to my vault</Button>
        <p className="text-xs text-muted-foreground">This key is shown only now. Recovery also requires your verified email.</p>
      </> : status.isPending ? <p role="status">Checking recovery settings…</p> : status.isError ? <>
        <p role="alert">Could not load recovery settings.</p><Button onClick={() => void status.refetch()}>Retry</Button>
      </> : status.data.recoveryEnabled ? <>
        <p>Recovery is already enabled. Keep your previously saved key safe. You can replace it in Settings if needed.</p><Button onClick={onDone}>Continue to my vault</Button>
      </> : <>
        <p className="text-sm text-muted-foreground">Create a private recovery key, then save its QR image or copy the key. Email alone cannot restore your encrypted vault.</p>
        <form className="grid gap-4" onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true); setError('');
          void enableVaultRecovery(password).then((value) => { setKey(value); setPassword(''); })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not enable recovery.'))
            .finally(() => setBusy(false));
        }}>
          <PasswordInput label="Confirm master password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy} type="submit">{busy ? 'Creating recovery key…' : 'Create recovery key'}</Button>
        </form>
        <Button variant="ghost" disabled={busy} onClick={onDone}>Set up later in Settings</Button>
      </>}
    </div>
  </AuthCard>;
}
