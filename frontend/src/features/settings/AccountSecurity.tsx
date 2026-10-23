import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Drawer } from '@/components/common/drawer';
import { PasswordInput } from '@/components/common/password-input';
import { TextField } from '@/components/common/form-field';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { accountApi } from '@/api/account/api';
import { deriveAuthHash, deriveMasterKey } from '@/lib/crypto';
import { useSession } from '@/stores/session';
import { useClipboard } from '@/hooks/useClipboard';

export function AccountSecurity() {
  const queryClient = useQueryClient();
  const account = useSession((s) => s.account);
  const security = useQuery({ queryKey: ['account-security'], queryFn: accountApi.security });
  const sessions = useQuery({ queryKey: ['account-sessions'], queryFn: accountApi.sessions });
  const prefs = useQuery({ queryKey: ['account-notifications'], queryFn: accountApi.notifications });
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string }>();
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [reauth, setReauth] = useState<'totp' | 'recovery'>();
  const [password, setPassword] = useState('');
  const copy = useClipboard();
  useEffect(() => {
    let current = true;
    setQr('');
    if (setup)
      void QRCode.toDataURL(setup.otpauthUri, { width: 240, margin: 2 })
        .then((url) => {
          if (current) setQr(url);
        })
        .catch(() => toast.error('Use the setup key below; the QR code could not load.'));
    return () => {
      current = false;
    };
  }, [setup]);
  const action = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    meta: { errorTitle: 'Could not update account settings' },
    onSuccess: async () => {
      await Promise.all(
        ['account-security', 'account-sessions', 'account-notifications'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  const busy = action.isPending;
  const data = security.data;
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Two-step verification</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {security.isPending ? (
            <p role="status">Loading security settings…</p>
          ) : security.isError ? (
            <Button variant="outline" onClick={() => void security.refetch()}>
              Retry security settings
            </Button>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {data?.totpEnabled
                  ? 'Authenticator verification is on.'
                  : 'Require an authenticator code when you sign in.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {!data?.totpEnabled ? (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      action.mutate(async () => {
                        setSetup(await accountApi.setupTotp());
                        setCode('');
                      })
                    }
                  >
                    Set up authenticator
                  </Button>
                ) : (
                  <Button variant="outline" disabled={busy} onClick={() => setReauth('totp')}>
                    Disable authenticator
                  </Button>
                )}
                {data?.totpEnabled && (
                  <Button variant="outline" disabled={busy} onClick={() => setReauth('recovery')}>
                    Replace recovery codes
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {data?.recoveryCodesLeft ?? 0} recovery codes remaining. Each code works once.
              </p>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Devices and sessions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Button
            variant="outline"
            className="w-fit"
            disabled={busy || !sessions.data?.some((s) => !s.current)}
            onClick={async () => {
              if (
                await confirmAction({
                  title: 'Sign out other devices?',
                  description: 'This device stays signed in. Other devices will need to sign in again.',
                  confirmLabel: 'Sign out other devices',
                  destructive: true,
                })
              )
                action.mutate(async () => {
                  await accountApi.revokeOthers();
                  toast.success('Other devices signed out');
                });
            }}
          >
            Sign out other devices
          </Button>
          {sessions.isError && (
            <Button variant="outline" onClick={() => void sessions.refetch()}>
              Retry sessions
            </Button>
          )}
          {sessions.isPending && <p role="status">Loading sessions…</p>}
          <ul className="divide-y">
            {sessions.data?.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="break-all">
                    {session.userAgent || 'Unknown device'}{' '}
                    {session.current && <strong> · This device</strong>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {session.ip || 'Unknown IP'} · Last active {new Date(session.lastUsedAt).toLocaleString()}
                  </p>
                </div>
                {!session.current && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await confirmAction({
                          title: 'Sign out this device?',
                          description: 'It will need to sign in again.',
                          confirmLabel: 'Sign out device',
                          destructive: true,
                        })
                      )
                        action.mutate(async () => {
                          await accountApi.revokeSession(session.id);
                          toast.success('Device signed out');
                        });
                    }}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Email notifications</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">Security alerts are always enabled.</p>
          {prefs.isError && (
            <Button variant="outline" onClick={() => void prefs.refetch()}>
              Retry preferences
            </Button>
          )}
          {(['sharing', 'links', 'expiry'] as const).map((key) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm">
              {key === 'sharing'
                ? 'Items shared with you and access changes'
                : key === 'links' ? 'Activity on your share links' : 'Upcoming and expired vault items'}
              <Switch
                checked={prefs.data?.[key] ?? true}
                disabled={busy || !prefs.data}
                onCheckedChange={(checked) =>
                  action.mutate(async () => {
                    await accountApi.setNotifications({ ...prefs.data!, [key]: checked });
                    toast.success('Notification preference saved');
                  })
                }
              />
            </label>
          ))}
        </CardContent>
      </Card>
      <Drawer
        open={!!setup}
        onOpenChange={(open) => {
          if (!open) {
            setSetup(undefined);
            setCode('');
          }
        }}
        title="Set up authenticator"
        description="Scan with your authenticator app, then enter its six-digit code."
      >
        {setup && (
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!/^\d{6}$/.test(code.trim())) {
                toast.error('Enter the six-digit authenticator code.');
                return;
              }
              action.mutate(async () => {
                const result = await accountApi.enableTotp(code.trim());
                setCodes(result.recoveryCodes);
                setSetup(undefined);
                setCode('');
                toast.success('Authenticator verification enabled');
              });
            }}
          >
            {qr && <img src={qr} width={240} height={240} alt="Authenticator setup QR code" />}
            <p className="text-sm">Or enter this setup key:</p>
            <code className="break-all rounded border p-3">{setup.secret}</code>
            <TextField
              label="Authenticator code"
              autoComplete="one-time-code"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <Button type="submit" disabled={busy}>
              Verify and enable
            </Button>
          </form>
        )}
      </Drawer>
      <Drawer
        open={!!codes}
        onOpenChange={(open) => {
          if (!open) setCodes(null);
        }}
        title="Save your recovery codes"
        description="Keep these outside Vaultessa. They are shown only once. Replacing codes invalidates the old set."
      >
        <div className="grid gap-4">
          <pre className="rounded border p-4">{codes?.join('\n')}</pre>
          <Button onClick={() => void copy(codes?.join('\n') ?? '', 'Recovery codes')}>
            Copy recovery codes
          </Button>
          <Button variant="outline" onClick={() => setCodes(null)}>
            I saved my codes
          </Button>
        </div>
      </Drawer>
      <Drawer
        open={!!reauth}
        onOpenChange={(open) => {
          if (!open) {
            setReauth(undefined);
            setPassword('');
          }
        }}
        title={reauth === 'recovery' ? 'Replace recovery codes' : 'Disable verification'}
        description="Confirm your master password to continue."
      >
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!password || !account) return;
            action.mutate(async () => {
              const authHash = await deriveAuthHash(
                await deriveMasterKey(password, account.kdfSalt, account.kdfIterations),
              );
              if (reauth === 'recovery') setCodes((await accountApi.recoveryCodes(authHash)).recoveryCodes);
              else if (reauth) await accountApi.disableMfa(reauth, authHash);
              setReauth(undefined);
              setPassword('');
              toast.success('Security settings updated');
            });
          }}
        >
          <PasswordInput
            label="Master password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button disabled={busy || !password} type="submit">
            Confirm
          </Button>
        </form>
      </Drawer>
    </div>
  );
}
