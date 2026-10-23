import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/common/drawer';
import { PasswordInput } from '@/components/common/password-input';
import { recoveryApi } from '@/api/recovery/api';
import { deriveMasterKey, deriveAuthHash } from '@/lib/crypto';
import { enableVaultRecovery } from '../auth/authFlows';
import { useSession } from '@/stores/session';
import { RecoveryKeyCard } from '../auth/RecoveryKeyCard';

export function VaultRecovery() {
  const account = useSession((s) => s.account);
  const status = useQuery({ queryKey: ['vault-recovery-status'], queryFn: recoveryApi.status });
  const [mode, setMode] = useState<'enable' | 'disable'>();
  const [password, setPassword] = useState('');
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await status.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update recovery settings.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email verification and vault recovery</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          A saved vault recovery key plus an email link lets you set a new master password without losing your
          items. Enable it before you forget your password.
        </p>
        {status.isPending && <p role="status">Loading recovery settings…</p>}
        {status.isError && (
          <Button variant="outline" onClick={() => void status.refetch()}>
            Retry recovery settings
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {status.data && (
          <>
            <p className="text-sm">
              Email: <strong>{status.data.emailVerified ? 'Verified' : 'Not verified'}</strong> · Vault
              recovery: <strong>{status.data.recoveryEnabled ? 'Enabled' : 'Not enabled'}</strong>
            </p>
            {!status.data.emailVerified && (
              <Button
                className="w-fit"
                variant="outline"
                disabled={busy || !status.data.emailAvailable}
                onClick={() =>
                  void run(async () => {
                    if (account) {
                      const result = await recoveryApi.requestVerification(account.email);
                      toast.success(result.message);
                    }
                  })
                }
              >
                Send verification email
              </Button>
            )}
            {!status.data.emailAvailable && (
              <p className="text-xs text-muted-foreground">
                Email delivery must be configured to send verification and recovery links.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !status.data.emailVerified}
                onClick={() => {
                  setMode('enable');
                  setPassword('');
                  setError('');
                }}
              >
                {status.data.recoveryEnabled ? 'Replace vault recovery key' : 'Enable vault recovery'}
              </Button>
              {status.data.recoveryEnabled && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setMode('disable');
                    setPassword('');
                    setError('');
                  }}
                >
                  Disable vault recovery
                </Button>
              )}
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          This key is separate from MFA recovery codes. Email alone cannot unlock your vault. Keep your key
          outside Vaultessa and never send it by email.
        </p>
        <Drawer
          open={!!mode}
          onOpenChange={(open) => {
            if (!busy && !open) {
              setMode(undefined);
              setPassword('');
              setError('');
            }
          }}
          title={mode === 'disable' ? 'Disable vault recovery' : 'Create vault recovery key'}
          description={
            mode === 'disable'
              ? 'Your saved recovery key will stop working. Confirm your master password.'
              : 'This replaces any previous vault recovery key. Confirm your master password, then save the new key.'
          }
        >
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!password || !account) {
                setError('Enter your master password.');
                return;
              }
              void run(async () => {
                if (mode === 'enable') {
                  const result = await enableVaultRecovery(password);
                  if (useSession.getState().status === 'unlocked') {
                    setKey(result);
                    setSaved(false);
                  }
                } else {
                  const master = await deriveMasterKey(password, account.kdfSalt, account.kdfIterations);
                  await recoveryApi.disable(await deriveAuthHash(master));
                  toast.success('Vault recovery disabled');
                }
                setPassword('');
                setMode(undefined);
              });
            }}
          >
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <PasswordInput
              label="Master password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : mode === 'disable' ? 'Disable recovery' : 'Create recovery key'}
            </Button>
          </form>
        </Drawer>
        <Drawer
          open={!!key}
          onOpenChange={(open) => {
            if (!open && saved) setKey('');
          }}
          title="Save your vault recovery key"
          description="Shown only now. Store it somewhere secure outside Vaultessa. Recovery also requires access to your verified email."
        >
          <div className="grid gap-4">
            <RecoveryKeyCard recoveryKey={key} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I saved
              this key outside Vaultessa
            </label>
            <Button
              variant="outline"
              disabled={!saved}
              onClick={() => {
                setKey('');
                toast.success('Vault recovery enabled');
              }}
            >
              Done
            </Button>
          </div>
        </Drawer>
      </CardContent>
    </Card>
  );
}
