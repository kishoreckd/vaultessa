import { useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  Link2,
  Lock,
  Pencil,
  Star,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { IconAction } from '@/components/common/icon-action';
import { Loading } from '@/components/common/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useClipboard } from '@/hooks/useClipboard';
import { cn } from '@/lib/utils';
import { useSession } from '@/stores/session';
import { ISSUE_COPY, type ItemHealth } from '../security/passwordHealth';
import type { LinkInsight } from '../shares/hooks';
import { ShareLinkDrawer } from '../shares/ShareLinkDrawer';
import { SharingSummary } from './SharingFlags';
import { useDeleteSecret, useHistory, useLeaveShare, useToggleFavorite } from './hooks';
import { ItemAvatar } from './ItemAvatar';
import { ShareUsersDrawer } from './ShareDialog';
import { getField, TEMPLATES, type FieldDef } from './secretTemplates';
import { can, PERMISSION_DESCRIPTIONS, PERMISSION_LABELS, relativeTime, safeHref, type DecryptedItem } from './vaultTypes';

type Props = {
  item: DecryptedItem;
  folderName: string | null;
  health?: ItemHealth;
  links?: LinkInsight;
  onEdit: () => void;
  onClosed: () => void;
  onBack: () => void;
};

export function SecretDetail({ item, folderName, health, links, onEdit, onClosed, onBack }: Props) {
  const userId = useSession((s) => s.account?.id);
  const copy = useClipboard();
  const [sharing, setSharing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkRecipient, setLinkRecipient] = useState<string | undefined>();
  const [showHistory, setShowHistory] = useState(false);
  const toggleFavorite = useToggleFavorite();
  const remove = useDeleteSecret();
  const leave = useLeaveShare();
  const template = TEMPLATES[item.type];
  const canSeeSecrets = can(item, 'VIEW');
  const canManage = can(item, 'MANAGE') && !item.decryptFailed;
  const { data } = item;
  const filled = template.fields.filter((f) => getField(data, f.key));

  async function onDelete() {
    const ok = await confirmAction({
      title: `Delete “${data.name}”?`,
      description: 'It will be removed from your vault and for everyone it is shared with. This cannot be undone.',
      confirmLabel: 'Delete item',
      destructive: true,
    });
    if (!ok) return;
    await remove.mutateAsync(item.id);
    toast.success(`Deleted “${data.name}”`);
    onClosed();
  }

  async function onLeave() {
    if (!userId) return;
    const ok = await confirmAction({
      title: `Remove “${data.name}” from your vault?`,
      description: `You’ll lose access. ${item.owner.name} can share it with you again.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    await leave.mutateAsync({ secretId: item.id, userId });
    toast.success(`Removed “${data.name}”`);
    onClosed();
  }

  return (
    <Card className="gap-0 py-0" aria-label={data.name}>
      <CardHeader className="flex flex-row items-start gap-3 border-b py-4">
        <IconAction label="Back to list" onClick={onBack} className="-ml-2 lg:hidden">
          <ArrowLeft />
        </IconAction>
        <ItemAvatar type={item.type} name={data.name} size="lg" />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="truncate font-heading text-lg font-semibold">{data.name}</h2>
          <p className="text-xs text-muted-foreground">
            {template.label}
            {folderName && ` · ${folderName}`} · Updated {relativeTime(item.updatedAt)}
          </p>
        </div>
        <IconAction
          label={item.favorite ? 'Remove from favourites' : 'Add to favourites'}
          aria-pressed={item.favorite}
          onClick={() => toggleFavorite.mutate(item)}
        >
          <Star className={cn(item.favorite && 'fill-amber-400 text-amber-400')} />
        </IconAction>
      </CardHeader>

      {!item.isOwner && (
        <div className="flex items-start gap-2 border-b bg-sky-500/5 px-6 py-3 text-sm">
          <Users className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <p>
            Shared by <strong>{item.owner.name}</strong> ({item.owner.email}). You have{' '}
            <strong>{PERMISSION_LABELS[item.permission]}</strong> access — {PERMISSION_DESCRIPTIONS[item.permission].toLowerCase()}
          </p>
        </div>
      )}

      {item.isOwner && <SharingSummary item={item} links={links} />}
      {item.expiresAt && <p className="border-b px-6 py-3 text-sm"><strong>{Date.parse(item.expiresAt) <= Date.now() ? 'Expired' : 'Expires'}</strong> {new Date(item.expiresAt).toLocaleString()}. {item.isOwner ? 'Expiry reminders follow your email preferences.' : 'The owner manages expiry reminders.'}</p>}

      {health && health.issues.length > 0 && (
        <ul className="grid gap-1 border-b bg-warning/10 px-6 py-3 text-sm">
          {health.issues.map((issue) => (
            <li key={issue} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                <strong>{issue === 'reused' ? `Used in ${health.reusedCount} items.` : `${ISSUE_COPY[issue].label}.`}</strong>{' '}
                {ISSUE_COPY[issue].advice}
              </span>
            </li>
          ))}
        </ul>
      )}

      <CardContent className="py-4">
        {item.decryptFailed ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>This item couldn’t be decrypted with your keys. Ask the owner to share it again.</AlertDescription>
          </Alert>
        ) : (
          <dl className="grid gap-1">
            {filled.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                value={getField(data, field.key)!}
                hidden={field.secret === true && !canSeeSecrets}
                onCopy={() => copy(getField(data, field.key)!, field.label)}
              />
            ))}
            {data.notes && (
              <Row label={template.notesLabel}>
                <p className="whitespace-pre-wrap break-words text-sm">{data.notes}</p>
              </Row>
            )}
            {filled.length === 0 && !data.notes && <p className="text-sm text-muted-foreground">No details saved yet.</p>}
          </dl>
        )}
        {showHistory && <HistoryList item={item} />}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2 border-t py-4">
        {can(item, 'MODIFY') && !item.decryptFailed && (
          <Button onClick={onEdit}>
            <Pencil /> Edit
          </Button>
        )}
        {canManage && (
          <>
            <Button variant="outline" onClick={() => setSharing(true)}>
              <Users /> Share
            </Button>
            <Button variant="outline" onClick={() => setLinking(true)}>
              <Link2 /> Share link
            </Button>
          </>
        )}
        {canSeeSecrets && (
          <Button variant="ghost" aria-expanded={showHistory} onClick={() => setShowHistory((s) => !s)}>
            <History /> History
          </Button>
        )}
        <Button variant="destructive" className="ml-auto" disabled={remove.isPending} onClick={item.isOwner ? onDelete : onLeave}>
          <Trash2 /> {item.isOwner ? 'Delete' : 'Remove'}
        </Button>
      </CardFooter>

      {canManage && (
        <>
          <ShareUsersDrawer
            item={item}
            open={sharing}
            onOpenChange={setSharing}
            onUseLink={(email) => {
              setSharing(false);
              setLinkRecipient(email);
              setLinking(true);
            }}
          />
          <ShareLinkDrawer
            item={item}
            open={linking}
            initialRecipient={linkRecipient}
            onOpenChange={(open) => {
              setLinking(open);
              if (!open) setLinkRecipient(undefined);
            }}
          />
        </>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="-mx-2 rounded-lg px-2 py-2 hover:bg-muted/50">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function FieldRow({ field, value, hidden, onCopy }: { field: FieldDef; value: string; hidden: boolean; onCopy: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const href = field.link ? safeHref(value) : null;
  const masked = field.secret && !revealed;

  if (hidden) {
    return (
      <Row label={field.label}>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="size-3.5" /> Hidden — login-only access
        </span>
      </Row>
    );
  }

  return (
    <Row label={field.label}>
      <div className="flex items-start gap-1">
        <div className={cn('min-w-0 flex-1 pt-1 text-sm', field.mono && 'font-mono')}>
          {masked ? (
            <span aria-label={`${field.label} hidden`}>••••••••••••</span>
          ) : href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
              {value}
            </a>
          ) : (
            <span className={field.multiline ? 'block max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs' : 'break-all'}>
              {value}
            </span>
          )}
        </div>
        {field.secret && (
          <IconAction label={revealed ? `Hide ${field.label}` : `Reveal ${field.label}`} onClick={() => setRevealed((r) => !r)}>
            {revealed ? <EyeOff /> : <Eye />}
          </IconAction>
        )}
        {href && (
          <IconAction label={`Open ${field.label}`} asChild>
            <a href={href} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
            </a>
          </IconAction>
        )}
        <IconAction label={`Copy ${field.label}`} onClick={onCopy}>
          <Copy />
        </IconAction>
      </div>
    </Row>
  );
}

function HistoryList({ item }: { item: DecryptedItem }) {
  const history = useHistory(item, true);
  const copy = useClipboard();

  return (
    <section className="mt-4 grid gap-2" aria-label="Earlier versions">
      <Separator />
      <h3 className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Earlier versions</h3>
      {history.isLoading ? (
        <Loading />
      ) : !history.data?.length ? (
        <p className="text-sm text-muted-foreground">No earlier versions yet. Edits will appear here.</p>
      ) : (
        <ul className="grid gap-2">
          {history.data.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <div className="grid min-w-0 flex-1">
                <span className="truncate">{entry.data?.name ?? 'Could not decrypt this version'}</span>
                <span className="text-xs text-muted-foreground">
                  Replaced {relativeTime(entry.createdAt)}
                  {entry.changedBy && ` by ${entry.changedBy.name}`}
                </span>
              </div>
              {entry.data?.password && (
                <IconAction label="Copy old password" onClick={() => copy(entry.data!.password!, 'Old password')}>
                  <Copy />
                </IconAction>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
