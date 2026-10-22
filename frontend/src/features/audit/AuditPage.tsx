import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Activity,
  Ban,
  Eye,
  FolderOpen,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState, Loading, PageHeader } from '@/components/common/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { auditApi } from '@/lib/api/endpoints';
import type { AuditEntry } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useVaultItems } from '../vault/hooks';

type Group = 'access' | 'changes' | 'sharing';

const EVENTS: Record<string, { text: string; icon: LucideIcon; group: Group; danger?: boolean }> = {
  USER_REGISTER: { text: 'Created your account', icon: ShieldCheck, group: 'access' },
  USER_LOGIN: { text: 'Signed in', icon: Lock, group: 'access' },
  USER_LOGIN_FAILED: { text: 'Failed sign-in attempt', icon: TriangleAlert, group: 'access', danger: true },
  USER_LOGOUT: { text: 'Signed out', icon: LogOut, group: 'access' },
  USER_LOCKED: { text: 'Account temporarily locked after failed sign-ins', icon: ShieldAlert, group: 'access', danger: true },
  MFA_ENABLE: { text: 'Turned on two-step verification', icon: ShieldCheck, group: 'access' },
  MFA_DISABLE: { text: 'Turned off two-step verification', icon: ShieldAlert, group: 'access', danger: true },
  MASTER_PASSWORD_CHANGE: { text: 'Changed master password', icon: KeyRound, group: 'access' },
  SESSION_REVOKE: { text: 'Signed out a device', icon: LogOut, group: 'access' },
  SECRET_CREATE: { text: 'Added', icon: Plus, group: 'changes' },
  SECRET_UPDATE: { text: 'Edited', icon: Pencil, group: 'changes' },
  SECRET_DELETE: { text: 'Deleted', icon: Trash2, group: 'changes' },
  FOLDER_CREATE: { text: 'Created a folder', icon: FolderOpen, group: 'changes' },
  FOLDER_UPDATE: { text: 'Renamed a folder', icon: FolderOpen, group: 'changes' },
  FOLDER_DELETE: { text: 'Deleted a folder', icon: FolderOpen, group: 'changes' },
  SHARE_GRANT: { text: 'Shared', icon: Users, group: 'sharing' },
  SHARE_UPDATE: { text: "Changed someone's access to", icon: Users, group: 'sharing' },
  SHARE_REVOKE: { text: "Removed someone's access to", icon: Users, group: 'sharing' },
  SHARE_ACCEPT: { text: 'Received', icon: Users, group: 'sharing' },
  EXTERNAL_SHARE_CREATE: { text: 'Created a share link for', icon: Link2, group: 'sharing' },
  EXTERNAL_SHARE_EMAIL: { text: 'Emailed a share link for', icon: Mail, group: 'sharing' },
  EXTERNAL_SHARE_VIEW: { text: 'Your share link was opened for', icon: Eye, group: 'sharing' },
  EXTERNAL_SHARE_REVOKE: { text: 'Revoked a share link for', icon: Ban, group: 'sharing' },
  EXTERNAL_SHARE_REOPEN: { text: 'Re-opened a share link for', icon: Link2, group: 'sharing' },
  EXTERNAL_SHARE_LIMITS_UPDATE: { text: 'Updated share link limits for', icon: Link2, group: 'sharing' },
  EXTERNAL_SHARE_LOCKED: { text: 'Share link locked after wrong access codes for', icon: ShieldAlert, group: 'sharing', danger: true },
};

function device(ua: string | null) {
  if (!ua) return null;
  const browser = /(Edg|Chrome|Firefox|Safari)\//.exec(ua)?.[1];
  const os = /(Windows|Mac OS X|Android|iPhone|Linux)/.exec(ua)?.[1];
  return [browser === 'Edg' ? 'Edge' : browser, os === 'Mac OS X' ? 'macOS' : os].filter(Boolean).join(' on ') || null;
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) return 'Today';
  if (date.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function AuditPage() {
  const [filter, setFilter] = useState<Group | 'all'>('all');
  const vault = useVaultItems();
  const audit = useInfiniteQuery({
    queryKey: ['audit'],
    queryFn: ({ pageParam }) => auditApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  // Item names are resolved locally from the decrypted vault — the audit log only stores ids.
  const names = useMemo(() => new Map((vault.data ?? []).map((i) => [i.id, i.data.name])), [vault.data]);
  const entries = (audit.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (e) => filter === 'all' || EVENTS[e.action]?.group === filter,
  );
  const grouped = entries.reduce<Array<{ day: string; items: AuditEntry[] }>>((acc, entry) => {
    const day = dayLabel(entry.createdAt);
    const last = acc.at(-1);
    if (last?.day === day) last.items.push(entry);
    else acc.push({ day, items: [entry] });
    return acc;
  }, []);

  const describe = (e: AuditEntry) => {
    const event = EVENTS[e.action];
    if (!event) return e.action;
    if (e.targetType !== 'Secret') return event.text;
    const name = e.targetId ? names.get(e.targetId) : undefined;
    return name ? `${event.text} “${name}”` : `${event.text} an item`;
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader
        title="Activity"
        description="Sign-ins, changes and sharing. Spot anything you don’t recognise."
        actions={
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="access">Sign-ins</TabsTrigger>
              <TabsTrigger value="changes">Changes</TabsTrigger>
              <TabsTrigger value="sharing">Sharing</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {audit.isLoading ? (
        <Loading />
      ) : audit.error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>Could not load activity.</AlertDescription>
        </Alert>
      ) : grouped.length === 0 ? (
        <EmptyState icon={<Activity />} title="No activity to show" />
      ) : (
        <div className="grid gap-6">
          {grouped.map((group) => (
            <section key={group.day} aria-label={group.day} className="grid gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.day}</h2>
              <Card className="py-0">
                <CardContent className="p-0">
                  <ol className="divide-y">
                    {group.items.map((e) => {
                      const event = EVENTS[e.action];
                      const Icon = event?.icon ?? Activity;
                      const meta = [device(e.userAgent), e.ip].filter(Boolean).join(' · ');
                      const outside = e.metadata?.outsideDomain === true;
                      const recipient = typeof e.metadata?.recipient === 'string' ? e.metadata.recipient : null;
                      return (
                        <li key={e.id} className={cn('flex items-start gap-3 px-4 py-3', event?.danger && 'bg-destructive/5')}>
                          <span
                            className={cn(
                              'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                              event?.danger ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            <Icon className="size-4" />
                          </span>
                          <div className="grid min-w-0 flex-1 gap-0.5">
                            <p className={cn('text-sm', event?.danger && 'font-medium text-destructive')}>
                              {describe(e)}
                              {recipient && <span className="text-muted-foreground"> → {recipient}</span>}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {outside && (
                                <Badge variant="outline" className="border-warning/50 text-warning">
                                  <ShieldAlert /> Outside your organisation
                                </Badge>
                              )}
                              {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
                            </div>
                          </div>
                          <time dateTime={e.createdAt} className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {new Date(e.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </time>
                        </li>
                      );
                    })}
                  </ol>
                </CardContent>
              </Card>
            </section>
          ))}
          {audit.hasNextPage && (
            <Button variant="outline" className="justify-self-start" disabled={audit.isFetchingNextPage} onClick={() => audit.fetchNextPage()}>
              {audit.isFetchingNextPage ? 'Loading…' : 'Show older activity'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
