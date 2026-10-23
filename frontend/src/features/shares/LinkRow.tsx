import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Copy, FileX2, KeyRound, LoaderCircle, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { IconAction } from '@/components/common/icon-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useClipboard } from '@/hooks/useClipboard';
import { type ExternalShare } from '@/api/sharing/types';
import { useSession } from '@/stores/session';
import { ItemAvatar } from '../vault/ItemAvatar';
import { can, relativeTime, type DecryptedItem } from '../vault/vaultTypes';
import { buildLink, readOwnerSecret, STATUS_LABEL, timingFor, useReopenShareLink, useRevokeShareLink } from './hooks';
import { DEFAULT_TIMING, LinkTimingFields, type LinkTimingValue } from './LinkTimingFields';

/** Human status line: "expires in 2 days", "opened 5 minutes ago", "expired yesterday"… */
export function linkStatusText(link: ExternalShare) {
  switch (link.status) {
    case 'active':
      return `expires ${relativeTime(link.expiresAt)}`;
    case 'used':
      return link.lastViewedAt ? `opened ${relativeTime(link.lastViewedAt)}` : 'used up';
    case 'expired':
      return `expired ${relativeTime(link.expiresAt)}`;
    case 'revoked':
      return 'revoked by you';
    case 'locked':
      return 'locked after too many wrong codes';
  }
}

function accessText(link: ExternalShare) {
  const kind = link.maxViews === 1 ? 'One-time' : link.maxViews ? `Up to ${link.maxViews} views` : 'Unlimited views';
  return `${kind} · ${link.viewCount} ${link.viewCount === 1 ? 'view' : 'views'}`;
}

export function LinkRow({
  link,
  item,
  showItem,
  onShareAgain,
}: {
  link: ExternalShare;
  /** current item (needed to re-open with fresh values); undefined if deleted or not loaded */
  item?: DecryptedItem;
  /** show which item the link shares, linking to it (on the "Shared links" page) */
  showItem?: boolean;
  /** for links that can't be re-opened (created before re-open existed) */
  onShareAgain?: () => void;
}) {
  const copy = useClipboard();
  const revoke = useRevokeShareLink();
  const [reopening, setReopening] = useState(false);
  const active = link.status === 'active';
  const canManage = !!item && can(item, 'MANAGE') && !item.decryptFailed;

  async function copyLink() {
    const owner = await readOwnerSecret(link);
    await copy(buildLink(link.id, owner.linkKey), 'Link');
  }

  async function copyCode() {
    const owner = await readOwnerSecret(link);
    if (owner.accessCode) await copy(owner.accessCode, 'Access code');
  }

  async function onRevoke() {
    const ok = await confirmAction({
      title: 'Revoke this link?',
      description: `${link.recipientEmail ?? 'Anyone with the link'} will no longer be able to open it. You can re-open it later.`,
      confirmLabel: 'Revoke link',
      destructive: true,
    });
    if (!ok) return;
    await revoke.mutateAsync(link.id);
    toast.success('Link revoked');
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
      {showItem &&
        (item ? (
          <ItemAvatar type={item.type} name={item.data.name} />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FileX2 className="size-4" />
          </span>
        ))}
      <div className="grid min-w-0 flex-1 gap-1">
        {showItem &&
          (item ? (
            <Link
              to={`/?item=${item.id}`}
              className="flex w-fit max-w-full items-center gap-1 truncate font-medium underline-offset-4 hover:text-primary hover:underline"
            >
              <span className="truncate">{item.data.name}</span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="sr-only">(open item)</span>
            </Link>
          ) : (
            <span className="truncate font-medium text-muted-foreground" title="The item was deleted. The link record is kept for your history.">
              Deleted item
            </span>
          ))}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={showItem ? 'truncate text-muted-foreground' : 'truncate font-medium'}>
            {link.recipientEmail ?? 'Anyone with the link'}
          </span>
          {link.outsideDomain && (
            <Badge variant="outline" className="border-warning/50 text-warning">
              <ShieldAlert /> Outside org
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {accessText(link)} · {linkStatusText(link)}
          {link.hasCode && ' · code required'}
        </p>
      </div>

      <Badge variant={active ? 'default' : 'secondary'}>{STATUS_LABEL[link.status]}</Badge>

      <div className="flex items-center">
        {link.ownerKey && (
          <IconAction label="Copy link" onClick={copyLink}>
            <Copy />
          </IconAction>
        )}
        {link.ownerKey && link.hasCode && (
          <IconAction label="Copy access code" onClick={copyCode}>
            <KeyRound />
          </IconAction>
        )}
        {!active && link.ownerKey && canManage && (
          <Button variant="outline" size="sm" onClick={() => setReopening(true)}>
            <RotateCcw /> Re-open
          </Button>
        )}
        {!active && !link.ownerKey && onShareAgain && canManage && (
          <Button variant="outline" size="sm" onClick={onShareAgain}>
            <RotateCcw /> Share again
          </Button>
        )}
        {active && (
          <IconAction label="Revoke link" className="text-destructive" onClick={onRevoke}>
            <Trash2 />
          </IconAction>
        )}
      </div>

      {item && <ReopenDialog link={link} item={item} open={reopening} onOpenChange={setReopening} />}
    </li>
  );
}

function ReopenDialog({
  link,
  item,
  open,
  onOpenChange,
}: {
  link: ExternalShare;
  item: DecryptedItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const account = useSession((s) => s.account);
  const reopen = useReopenShareLink();
  const copy = useClipboard();
  const [timing, setTiming] = useState<LinkTimingValue>({
    ...DEFAULT_TIMING,
    mode: link.maxViews === 1 ? 'once' : 'period',
  });

  async function onConfirm() {
    const result = await reopen.mutateAsync({
      link,
      item,
      sharedBy: account?.name ?? 'A Vaultessa user',
      timing: timingFor(timing.mode, timing.duration, timing.viewLimit),
    });
    onOpenChange(false);
    toast.success('Link re-opened', {
      description: `${link.recipientEmail ?? 'The recipient'} can use the same link again${result.accessCode ? ' with the same access code' : ''}.`,
      action: { label: 'Copy link', onClick: () => void copy(result.link, 'Link') },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Re-open this link?</DialogTitle>
          <DialogDescription>
            {link.recipientEmail ?? 'The recipient'} can use the link you already sent. It will show the item’s current details
            {link.hasCode ? ', and the same access code still applies' : ''}.
          </DialogDescription>
        </DialogHeader>
        <LinkTimingFields value={timing} onChange={setTiming} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={reopen.isPending}>
            {reopen.isPending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />} Re-open link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
