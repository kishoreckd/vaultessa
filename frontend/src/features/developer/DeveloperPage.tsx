import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page';
import { Drawer } from '@/components/common/drawer';
import { TextField } from '@/components/common/form-field';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useClipboard } from '@/hooks/useClipboard';
import { tokensApi } from '@/lib/api/endpoints';
import { generateTokenSecret, deriveTokenKeys, encryptBytes, encryptJson, decryptJson } from '@/lib/crypto';
import { requireKeys } from '@/stores/session';
import { useVaultItems } from '../vault/hooks';
import { withSecretKey } from '../vault/vaultCrypto';
import type { AccessToken } from '@/lib/api/types';

export function DeveloperPage() {
  const qc = useQueryClient();
  const tokens = useQuery({ queryKey: ['tokens'], queryFn: tokensApi.list });
  const vault = useVaultItems();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccessToken>();
  const [name, setName] = useState('');
  const [days, setDays] = useState('90');
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState('');
  const copy = useClipboard();
  const eligible = (vault.data ?? []).filter((i) => i.permission !== 'LOGIN_ONLY' && !i.decryptFailed);
  const create = useMutation({
    meta: { errorTitle: 'Could not save access token' },
    mutationFn: async () => {
      const secret = editing
        ? (await decryptJson<{ secret: string }>(requireKeys().vaultKey, editing.ownerKey)).secret
        : generateTokenSecret();
      const { authKey, encryptionKey } = await deriveTokenKeys(secret);
      const grants = await Promise.all(
        selected.map(async (id) => {
          const item = eligible.find((i) => i.id === id);
          if (!item) throw new Error('A selected item is no longer available.');
          return {
            secretId: id,
            wrappedKey: await withSecretKey(item, (_key, raw) => encryptBytes(encryptionKey, raw)),
          };
        }),
      );
      if (editing) {
        await tokensApi.grants(editing.id, grants);
        return '';
      }
      const token = await tokensApi.create({
        name: name.trim(),
        authKey,
        ownerKey: await encryptJson(requireKeys().vaultKey, { secret }),
        expiresAt: new Date(Date.now() + Number(days) * 86400000).toISOString(),
        grants,
      });
      // Client token root is never sent to the machine API; the SDK derives its bearer credential.
      return `pvm.${token.id}.${secret}`;
    },
    onSuccess: async (value) => {
      setCreated(value);
      setOpen(false);
      setEditing(undefined);
      await qc.invalidateQueries({ queryKey: ['tokens'] });
      toast.success('Access token saved');
    },
  });
  const revoke = useMutation({
    mutationFn: tokensApi.revoke,
    meta: { errorTitle: 'Could not revoke token' },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['tokens'] });
      toast.success('Token revoked');
    },
  });
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader
        title="Developer access"
        description="Give pipelines read-only access to selected items. Revoking your access also cuts off these tokens."
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setName('');
              setSelected([]);
              setOpen(true);
            }}
          >
            Create token
          </Button>
        }
      />
      {tokens.isError && (
        <Button variant="outline" onClick={() => void tokens.refetch()}>
          Retry tokens
        </Button>
      )}
      {tokens.isPending && <p role="status">Loading tokens…</p>}
      {tokens.data?.length === 0 && <p>No access tokens yet.</p>}
      <ul className="grid gap-3">
        {tokens.data?.map((token) => (
          <li
            key={token.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          >
            <div>
              <p className="font-medium">
                {token.name} <Badge variant="secondary">{token.status}</Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                {token.itemIds.length} items · Expires{' '}
                {token.expiresAt ? new Date(token.expiresAt).toLocaleString() : 'never'} · Last used{' '}
                {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : 'never'}
              </p>
            </div>
            {token.status === 'active' && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(token);
                    setSelected(token.itemIds.filter((id) => eligible.some((item) => item.id === id)));
                    setOpen(true);
                  }}
                >
                  Edit items
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={async () => {
                    if (
                      await confirmAction({
                        title: `Revoke ${token.name}?`,
                        description: 'Pipelines using this token will lose access immediately.',
                        confirmLabel: 'Revoke token',
                        destructive: true,
                      })
                    )
                      revoke.mutate(token.id);
                  }}
                >
                  Revoke
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Edit token items' : 'Create access token'}
        description="Only selected items can be read. Login-only items are excluded."
      >
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (
              !editing &&
              (!name.trim() || !Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > 730)
            ) {
              toast.error('Enter a name and an expiry from 1 to 730 days.');
              return;
            }
            if (!selected.length) {
              toast.error('Select at least one item.');
              return;
            }
            create.mutate();
          }}
        >
          {!editing && (
            <>
              <TextField
                label="Token name"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label="Expires after (days)"
                required
                type="number"
                min={1}
                max={730}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </>
          )}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Allowed items</legend>
            {eligible.map((item) => (
              <label key={item.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.data.name}
              </label>
            ))}
          </fieldset>
          <Button disabled={create.isPending || vault.isPending} type="submit">
            {create.isPending ? 'Saving…' : 'Save token'}
          </Button>
        </form>
      </Drawer>
      <Drawer
        open={!!created}
        onOpenChange={(value) => {
          if (!value) setCreated('');
        }}
        title="Save your access token"
        description="Copy this token into your pipeline secret store. It is shown only once."
      >
        <div className="grid gap-4">
          <code className="break-all rounded border p-3">{created}</code>
          <Button onClick={() => void copy(created, 'Access token')}>Copy token</Button>
          <Button variant="outline" onClick={() => setCreated('')}>
            Done
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
