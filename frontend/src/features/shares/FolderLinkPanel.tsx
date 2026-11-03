import { useMemo, useState, type SubmitEvent } from 'react';
import { Link2, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { generateAccessCode } from '@/lib/crypto';
import { emailError } from '@/lib/validation';
import { useSession } from '@/stores/session';
import { useVaultItems } from '../vault/hooks';
import type { DecryptedFolder } from '../vault/vaultTypes';
import { CreatedView, type Created } from './ShareLinkDrawer';
import { DEFAULT_TIMING, LinkTimingFields, type LinkTimingValue } from './LinkTimingFields';
import { emailDomain, timingFor, useCreateFolderShareLink, useExternalShares } from './hooks';
import { LinkRow } from './LinkRow';

export function FolderLinkPanel({
  folder,
  initialRecipient,
}: {
  folder: DecryptedFolder;
  initialRecipient?: string;
}) {
  const account = useSession((state) => state.account);
  const vault = useVaultItems();
  const links = useExternalShares(undefined, folder.id);
  const create = useCreateFolderShareLink();
  const [created, setCreated] = useState<Created | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [timing, setTiming] = useState<LinkTimingValue>(DEFAULT_TIMING);
  const [recipient, setRecipient] = useState(initialRecipient ?? '');
  const [useCode, setUseCode] = useState(true);
  const [code, setCode] = useState(generateAccessCode);
  const [outsideAck, setOutsideAck] = useState(false);
  const [error, setError] = useState('');
  const items = useMemo(
    () => (vault.data ?? []).filter((item) => item.folderId === folder.id),
    [vault.data, folder.id],
  );
  const eligible = items.filter((item) => item.isOwner && !item.decryptFailed);
  const selected = eligible.filter((item) => !excluded.has(item.id));
  const theirDomain = emailDomain(recipient.trim());
  const myDomain = emailDomain(account?.email);
  const outside = !!theirDomain && !!myDomain && theirDomain !== myDomain;
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    setError('');
    const invalid = emailError(recipient, { optional: true });
    if (invalid) return setError(invalid);
    if (useCode && code.replace(/[\s-]/g, '').length < 6)
      return setError('Use an access code of at least 6 characters.');
    if (!selected.length || selected.length > 1000) return setError('Choose between 1 and 1,000 items.');
    if (outside && !outsideAck) return setError('Confirm sharing outside your organisation.');
    try {
      const result = await create.mutateAsync({
        folder,
        items: selected,
        sharedBy: account?.name ?? 'A Vaultessa user',
        timing: timingFor(timing.mode, timing.duration, timing.viewLimit),
        recipientEmail: recipient.trim() || undefined,
        accessCode: useCode ? code : undefined,
      });
      setCreated({ ...result, code: useCode ? code : undefined, recipient: recipient.trim() || undefined });
      toast.success('Folder snapshot link created');
    } catch {
      /* Global mutation feedback keeps the form available for retry. */
    }
  }
  return (
    <div className="grid min-w-0 gap-5">
      {created ? (
        <>
          <CreatedView key={created.share.id} created={created} />
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setCreated(null);
              setCode(generateAccessCode());
            }}
          >
            Create another link
          </Button>
        </>
      ) : (
        <form onSubmit={submit} className="grid min-w-0 gap-5" aria-busy={create.isPending}>
          <p className="rounded-lg border bg-muted/40 p-3 text-sm">
            Shares a snapshot of the selected items and all their fields. Future additions and edits are not
            included. Anyone holding the link and access code can open it without an account.
          </p>
          <fieldset disabled={create.isPending} className="grid min-w-0 gap-5">
            <div className="grid gap-2">
              <Label htmlFor="folder-link-recipient">Recipient email (optional)</Label>
              <Input
                id="folder-link-recipient"
                type="email"
                autoComplete="email"
                className="h-11"
                value={recipient}
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setOutsideAck(false);
                }}
              />
            </div>
            {outside && (
              <label className="flex min-h-11 items-start gap-3 rounded-lg border p-3 text-sm">
                <Checkbox checked={outsideAck} onCheckedChange={(value) => setOutsideAck(value === true)} />I
                want to share this snapshot outside {myDomain} with {theirDomain}.
              </label>
            )}
            <LinkTimingFields value={timing} onChange={setTiming} />
            <div className="grid gap-3 rounded-lg border p-3">
              <div className="flex min-h-11 items-center justify-between gap-3">
                <Label htmlFor="folder-link-code-toggle">Require an access code</Label>
                <Switch id="folder-link-code-toggle" checked={useCode} onCheckedChange={setUseCode} />
              </div>
              {useCode && (
                <>
                  <Label htmlFor="folder-link-code">Access code</Label>
                  <Input
                    id="folder-link-code"
                    className="h-11 font-mono"
                    value={code}
                    maxLength={32}
                    onChange={(event) => setCode(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setCode(generateAccessCode())}
                  >
                    Generate new code
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Send the code separately from the link. It is never included in the invitation email.
                  </p>
                </>
              )}
            </div>
            <section className="grid gap-3" aria-label="Snapshot items">
              <h3 className="font-medium">Include items ({selected.length})</h3>
              {vault.isPending && <p role="status">Loading folder items…</p>}
              {vault.isError && (
                <Button type="button" variant="outline" onClick={() => void vault.refetch()}>
                  Could not load items. Retry
                </Button>
              )}
              {vault.isSuccess && !items.length && (
                <p className="text-sm text-muted-foreground">
                  Add an item to this folder before creating a link.
                </p>
              )}
              {items.length !== eligible.length && (
                <p className="text-sm text-muted-foreground">
                  Items owned by someone else or that cannot be decrypted cannot be included.
                </p>
              )}
              <div className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border p-2">
                {eligible.map((item) => (
                  <label key={item.id} className="flex min-h-11 min-w-0 items-center gap-3 p-2 text-sm">
                    <Checkbox
                      checked={!excluded.has(item.id)}
                      onCheckedChange={(value) =>
                        setExcluded((previous) => {
                          const next = new Set(previous);
                          if (value === true) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        })
                      }
                    />
                    <span className="break-words [overflow-wrap:anywhere]">{item.data.name}</span>
                  </label>
                ))}
              </div>
            </section>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            className="min-h-11 w-full"
            disabled={create.isPending || !vault.isSuccess || !selected.length}
          >
            {create.isPending ? <LoaderCircle className="animate-spin" /> : <Link2 />}
            {create.isPending ? 'Encrypting snapshot…' : 'Create snapshot link'}
          </Button>
        </form>
      )}
      <section className="grid gap-3" aria-label="Folder snapshot links">
        <h3 className="font-medium">Links for this folder</h3>
        <p className="text-xs text-muted-foreground">
          Opening a link counts as one view of the entire snapshot. Moving items does not change a snapshot;
          trashing any included item or deleting this folder disables its links.
        </p>
        {links.isPending && <p role="status">Loading links…</p>}
        {links.isError && (
          <Button variant="outline" onClick={() => void links.refetch()}>
            Could not load links. Retry
          </Button>
        )}
        {links.data?.length === 0 && <p className="text-sm text-muted-foreground">No snapshot links yet.</p>}
        <ul className="grid gap-2">
          {links.data?.map((link) => (
            <LinkRow key={link.id} link={link} folder={folder} />
          ))}
        </ul>
      </section>
    </div>
  );
}
