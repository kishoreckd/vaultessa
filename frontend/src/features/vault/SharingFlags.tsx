import { Link } from 'react-router';
import { Eye, Link2, ShieldAlert, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { LinkInsight } from '../shares/hooks';
import { relativeTime, type DecryptedItem } from './vaultTypes';

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

function Flag({ tip, children, className }: { tip: string; children: React.ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={className} aria-label={tip}>
          {children}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

/** Compact flags for a vault list row. Each has an icon + text/tooltip, never colour alone. */
export function SharingFlags({ item, links }: { item: DecryptedItem; links?: LinkInsight }) {
  const recentlyOpened = links?.lastViewedAt && Date.now() - Date.parse(links.lastViewedAt) < RECENT_MS;
  if (!item.sharedWith && !links?.active && !recentlyOpened) return null;
  return (
    <span className="hidden shrink-0 items-center gap-1 sm:flex">
      {links?.outsideActive && (
        <Flag tip="An active link goes to someone outside your organisation" className="border-warning/50 text-warning">
          <ShieldAlert /> Outside org
        </Flag>
      )}
      {!!links?.active && (
        <Flag
          tip={`${links.active} active share link${links.active === 1 ? '' : 's'} · expires ${relativeTime(links.nextExpiry!)}`}
          className="border-primary/40 text-primary"
        >
          <Link2 /> {links.active === 1 ? 'Link' : links.active}
        </Flag>
      )}
      {recentlyOpened && (
        <Flag tip={`Share link opened ${relativeTime(links!.lastViewedAt!)}`} className="border-success/50 text-success">
          <Eye /> Opened
        </Flag>
      )}
      {item.sharedWith > 0 && (
        <Flag tip={`Shared with ${people(item.sharedWith)} in Vaultessa`}>
          <Users /> {item.sharedWith}
        </Flag>
      )}
    </span>
  );
}

/** Sharing summary in the item's detail panel. */
export function SharingSummary({ item, links }: { item: DecryptedItem; links?: LinkInsight }) {
  if (!item.sharedWith && !links) return null;
  return (
    <div className="grid gap-1.5 border-b px-6 py-3 text-sm">
      {item.sharedWith > 0 && (
        <p className="flex items-center gap-2">
          <Users className="size-4 shrink-0 text-muted-foreground" />
          Shared with {people(item.sharedWith)} in Vaultessa
        </p>
      )}
      {links && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link2 className="size-4 shrink-0 text-muted-foreground" />
          <span>
            {links.active ? `${links.active} active link${links.active === 1 ? '' : 's'}` : 'No active links'}
            {links.active > 0 && links.nextExpiry && ` · expires ${relativeTime(links.nextExpiry)}`}
            {` · opened ${links.views} ${links.views === 1 ? 'time' : 'times'}`}
            {links.lastViewedAt && `, last ${relativeTime(links.lastViewedAt)}`}
          </span>
          {links.outsideActive && (
            <Badge variant="outline" className="border-warning/50 text-warning">
              <ShieldAlert /> Outside org
            </Badge>
          )}
          <Link to="/links" className="text-primary underline-offset-4 hover:underline">
            Manage links
          </Link>
        </p>
      )}
    </div>
  );
}
