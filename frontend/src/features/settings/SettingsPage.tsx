import { useEffect, useId, useState, type ReactNode } from 'react';
import { Lock, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { FormField } from '@/components/common/form-field';
import { PageHeader } from '@/components/common/page';
import { ShortcutsList } from '@/components/layout/shortcuts-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { publicKeyFingerprint } from '@/lib/crypto';
import { AUTO_LOCK_OPTIONS, CLIPBOARD_OPTIONS, usePrefs } from '@/lib/prefs';
import { useSession } from '@/stores/session';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ComingSoon({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="grid flex-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{body}</span>
      </div>
      <Badge variant="secondary">Coming soon</Badge>
    </li>
  );
}

export function SettingsPage() {
  const account = useSession((s) => s.account);
  const lock = useSession((s) => s.lock);
  const prefs = usePrefs();
  const { theme, setTheme } = useTheme();
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const lockId = useId();
  const clipId = useId();

  useEffect(() => {
    if (account) void publicKeyFingerprint(account.publicKey).then(setFingerprint);
  }, [account]);

  if (!account) return null;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader title="Settings" description="Preferences for this device and details about your account." />

      <Section title="Appearance">
        <Tabs value={theme ?? 'system'} onValueChange={setTheme}>
          <TabsList>
            <TabsTrigger value="light">
              <Sun /> Light
            </TabsTrigger>
            <TabsTrigger value="dark">
              <Moon /> Dark
            </TabsTrigger>
            <TabsTrigger value="system">
              <Monitor /> System
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </Section>

      <Section title="Locking & clipboard" description="Balance convenience and safety for how you work.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={lockId} label="Lock the vault after" hint="Of no activity. Reloading the page always locks.">
            <Select
              value={String(prefs.autoLockMinutes)}
              onValueChange={(v) => {
                prefs.set({ autoLockMinutes: Number(v) });
                toast.success('Auto-lock updated');
              }}
            >
              <SelectTrigger id={lockId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_LOCK_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m === 60 ? '1 hour' : `${m} minute${m === 1 ? '' : 's'}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id={clipId} label="Clear copied passwords after" hint="Best effort: the browser may block it when unfocused.">
            <Select
              value={String(prefs.clipboardClearSeconds)}
              onValueChange={(v) => {
                prefs.set({ clipboardClearSeconds: Number(v) });
                toast.success('Clipboard setting updated');
              }}
            >
              <SelectTrigger id={clipId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIPBOARD_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s === 0 ? 'Never' : `${s} seconds`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <Button variant="outline" className="mt-4" onClick={() => lock('manual')}>
          <Lock /> Lock now
        </Button>
      </Section>

      <Section title="Account">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="grid">
            <dt className="text-xs text-muted-foreground">Name</dt>
            <dd>{account.name}</dd>
          </div>
          <div className="grid">
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd>{account.email}</dd>
          </div>
        </dl>
        <ul className="mt-4 divide-y border-t">
          <ComingSoon title="Change master password" body="Re-encrypts your vault key and signs out other devices." />
          <ComingSoon title="Two-step verification" body="Require an authenticator code when signing in." />
          <ComingSoon title="Devices & sessions" body="See where you’re signed in and sign out remotely." />
          <ComingSoon title="Import & export" body="Bring passwords from your browser or another manager." />
        </ul>
      </Section>

      <Section title="Encryption" description="Exactly how your data is protected. All of this happens on your device.">
        <dl className="divide-y text-sm">
          {[
            ['Key derivation', `PBKDF2-HMAC-SHA256, ${account.kdfIterations.toLocaleString()} iterations, 128-bit salt`],
            ['Key separation', 'HKDF-SHA256 (login proof and encryption key are independent)'],
            ['Vault & item encryption', 'AES-256-GCM, a separate random key per item'],
            ['Sharing', 'RSA-OAEP 3072-bit with SHA-256'],
            ['Share links', 'Key in the link fragment (never sent to servers) + optional access code'],
            ['What the server stores', 'Ciphertext, public keys and a scrypt hash of your login proof — never your master password'],
          ].map(([label, value]) => (
            <div key={label} className="grid gap-1 py-2.5 sm:grid-cols-[12rem_1fr]">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div className="grid gap-1 py-2.5 sm:grid-cols-[12rem_1fr]">
            <dt className="text-muted-foreground">Your key fingerprint</dt>
            <dd>
              <code className="font-mono">{fingerprint ?? '…'}</code>
              <p className="text-xs text-muted-foreground">People sharing sensitive items with you can compare this.</p>
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Keyboard shortcuts">
        <ShortcutsList />
      </Section>
    </div>
  );
}
