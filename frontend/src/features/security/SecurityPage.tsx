import { useMemo, useState } from 'react';
import { Lock, ShieldAlert, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { EmptyState, Loading, PageHeader } from '@/components/common/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ItemAvatar } from '../vault/ItemAvatar';
import { SecretEditorDrawer } from '../vault/SecretEditor';
import { useFolders, useVaultItems } from '../vault/hooks';
import { TEMPLATES } from '../vault/secretTemplates';
import { can, relativeTime, type DecryptedItem } from '../vault/vaultTypes';
import { analyzeHealth, ISSUE_COPY, type HealthIssue, type ItemHealth } from './passwordHealth';

// Status colours are reserved for state and always paired with an icon + label.
const STATUS: Record<'good' | 'warning' | 'critical', { label: string; icon: LucideIcon; chip: string; fill: string; track: string }> = {
  good: { label: 'Good', icon: ShieldCheck, chip: 'border-success/40 text-success', fill: 'bg-success', track: 'bg-success/15' },
  warning: { label: 'Needs attention', icon: TriangleAlert, chip: 'border-warning/50 text-warning', fill: 'bg-warning', track: 'bg-warning/15' },
  critical: { label: 'At risk', icon: ShieldAlert, chip: 'border-destructive/40 text-destructive', fill: 'bg-destructive', track: 'bg-destructive/15' },
};

const statusFor = (score: number) => (score >= 80 ? STATUS.good : score >= 50 ? STATUS.warning : STATUS.critical);

const SECTIONS: Array<{ issue: HealthIssue; title: string }> = [
  { issue: 'reused', title: 'Reused passwords' },
  { issue: 'weak', title: 'Weak passwords' },
  { issue: 'old', title: 'Old passwords' },
];

export function SecurityPage() {
  const items = useVaultItems();
  const folders = useFolders();
  const [editing, setEditing] = useState<DecryptedItem | null>(null);
  const report = useMemo(() => analyzeHealth(items.data ?? []), [items.data]);

  if (items.isLoading) return <Loading label="Checking your passwords on this device…" />;
  if (items.error) {
    return (
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertDescription>Could not load your vault.</AlertDescription>
      </Alert>
    );
  }

  const status = statusFor(report.score);
  const lists: Record<HealthIssue, ItemHealth[]> = { reused: report.reused, weak: report.weak, old: report.old };
  const tiles = [
    { label: 'Passwords checked', value: report.checked },
    { label: 'Reused', value: report.reused.length },
    { label: 'Weak', value: report.weak.length },
    { label: 'Not changed in a year', value: report.old.length },
  ];

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader
        title="Password health"
        description={
          <span className="flex items-center gap-1.5">
            <Lock className="size-3.5" /> Checked on this device. Your passwords never leave it.
          </span>
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="grid gap-1">
            <CardDescription>Health score</CardDescription>
            <div className="flex items-end gap-2">
              <span className="font-heading text-5xl font-semibold tabular-nums">{report.score}</span>
              <span className="pb-1.5 text-sm text-muted-foreground">out of 100</span>
            </div>
          </div>
          <Badge variant="outline" className={cn('h-7 gap-1.5 px-3 text-sm', status.chip)}>
            <status.icon className="size-4!" /> {status.label}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <div
              className={cn('h-2.5 w-full overflow-hidden rounded-full', status.track)}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={report.score}
              aria-label="Password health score"
            >
              <div className={cn('h-full rounded-full transition-all', status.fill)} style={{ width: `${report.score}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">Share of your passwords with no known issues. Fix the items below to raise it.</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-lg border bg-muted/30 p-4">
                <dt className="text-xs text-muted-foreground">{tile.label}</dt>
                <dd className="mt-1 font-heading text-2xl font-semibold tabular-nums">{tile.value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {report.checked === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="Nothing to check yet" description="Add some logins and their health will show up here." />
      ) : report.score === 100 ? (
        <EmptyState icon={<ShieldCheck />} title="All good" description="No weak, reused or old passwords. Nice work." />
      ) : (
        SECTIONS.map(({ issue, title }) =>
          lists[issue].length === 0 ? null : (
            <Card key={issue} className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle className="text-base">
                  {title} <span className="font-normal text-muted-foreground">· {lists[issue].length}</span>
                </CardTitle>
                <CardDescription>{ISSUE_COPY[issue].advice}</CardDescription>
              </CardHeader>
              <ul className="divide-y">
                {lists[issue].map((h) => (
                  <li key={h.item.id} className="flex items-center gap-3 px-6 py-3">
                    <ItemAvatar type={h.item.type} name={h.item.data.name} />
                    <div className="grid min-w-0 flex-1">
                      <span className="truncate text-sm font-medium">{h.item.data.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {issue === 'reused' && `Same password as ${h.reusedCount - 1} other item${h.reusedCount > 2 ? 's' : ''}`}
                        {issue === 'weak' && `Strength: ${h.strength.label}`}
                        {issue === 'old' && `Last changed ${relativeTime(h.item.updatedAt)}`}
                        {' · '}
                        {TEMPLATES[h.item.type].subtitle(h.item.data) ?? TEMPLATES[h.item.type].label}
                      </span>
                    </div>
                    {can(h.item, 'MODIFY') ? (
                      <Button variant="outline" onClick={() => setEditing(h.item)}>
                        Fix
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Ask {h.item.owner.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ),
        )
      )}

      <SecretEditorDrawer
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        existing={editing ?? undefined}
        folders={folders.data ?? []}
        defaultFolderId={editing?.folderId ?? null}
      />
    </div>
  );
}
