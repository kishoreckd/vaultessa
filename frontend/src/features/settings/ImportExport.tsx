import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordInput } from '@/components/common/password-input';
import { encryptBackup, decryptBackup } from '@/lib/crypto/backup';
import { secretsApi } from '@/api/vault/api';
import { useVaultItems, vaultKeys } from '../vault/hooks';
import { encryptNewSecret } from '../vault/vaultCrypto';
import { csvItems, validateImport, type ImportItem } from './transfer';
import { useSession } from '@/stores/session';

export function ImportExport() {
  const vault = useVaultItems();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File>();
  const [items, setItems] = useState<ImportItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(0);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import and encrypted export</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Exports include readable item contents. Folder placement, sharing permissions, links, and history
          are not included. Imports create new personal items.
        </p>
        <PasswordInput
          label="Backup password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Use a separate password of at least 12 characters for exports. Enter the original backup password when restoring."
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          className="w-fit"
          variant="outline"
          disabled={busy || !vault.data}
          onClick={() =>
            void run(async () => {
              if (password.length < 12) throw new Error('Use at least 12 characters for the backup password');
              const data = (vault.data ?? [])
                .filter((item) => !item.decryptFailed && item.permission !== 'LOGIN_ONLY')
                .map(({ type, data, expiresAt }) => ({ type, data, expiresAt: expiresAt ?? null }));
              if (data.length > 500) throw new Error('Backup currently supports up to 500 readable items.');
              const encrypted = await encryptBackup(data, password);
              if (useSession.getState().status !== 'unlocked')
                throw new Error('Vault was locked. Unlock and try again.');
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(encrypted)], { type: 'application/json' }),
              );
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = `vaultessa-backup-${new Date().toISOString().slice(0, 10)}.json`;
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setPassword('');
              toast.success('Encrypted backup downloaded');
            })
          }
        >
          Download encrypted backup
        </Button>
        <label className="grid gap-2 text-sm">
          Import file (.csv or Vaultessa backup)
          <input
            type="file"
            accept=".csv,.json"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0]);
              setItems([]);
              setDone(0);
              setError('');
            }}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          CSV supports Chrome-style columns: name, url, username, password, notes. Files are read locally and
          encrypted before upload. Maximum 5 MB / 500 items.
        </p>
        <Button
          className="w-fit"
          variant="outline"
          disabled={busy || !file}
          onClick={() =>
            void run(async () => {
              if (!file || file.size > 5 * 1024 * 1024) throw new Error('Choose a file smaller than 5 MB');
              const content = await file.text();
              const imported = file.name.toLowerCase().endsWith('.csv')
                ? csvItems(content)
                : validateImport(await decryptBackup(JSON.parse(content), password));
              if (useSession.getState().status !== 'unlocked') throw new Error('Unlock your vault first');
              setItems(imported);
              setDone(0);
              setPassword('');
            })
          }
        >
          Review import
        </Button>
        {items.length > 0 && (
          <div className="grid gap-3">
            <p className="text-sm" role="status">
              {items.length - done} items ready. {done} imported.
            </p>
            <ul className="max-h-40 overflow-auto text-sm">
              {items.slice(done, done + 20).map((item, i) => (
                <li key={i}>{item.data.name}</li>
              ))}
            </ul>
            <Button
              disabled={busy || done === items.length}
              onClick={() =>
                void run(async () => {
                  for (let index = done; index < items.length; index++) {
                    if (useSession.getState().status !== 'unlocked')
                      throw new Error('Vault locked; unlock to continue');
                    const item = items[index]!;
                    await secretsApi.create({ type: item.type, expiresAt: item.expiresAt, ...(await encryptNewSecret(item.data)) });
                    setDone(index + 1);
                  }
                  await qc.invalidateQueries({ queryKey: vaultKeys.items });
                  setItems([]);
                  setFile(undefined);
                  toast.success('Import completed');
                })
              }
            >
              {busy ? 'Importing…' : 'Import remaining items'}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setItems([]);
                setFile(undefined);
              }}
            >
              Discard import
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
