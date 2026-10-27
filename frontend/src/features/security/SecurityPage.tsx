import { useStrengthEstimator } from '@/hooks/useStrengthEstimator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { checkBreaches, type BreachResult } from './breachCheck';
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
  { issue: 'breached', title: 'Exposed passwords' },
  { issue: 'reused', title: 'Reused passwords' },
  { issue: 'weak', title: 'Weak passwords' },
  { issue: 'old', title: 'Older items · informational' },
];

export function SecurityPage() {
  const estimator = useStrengthEstimator();
  const items = useVaultItems();
  const folders = useFolders();
  const [editing, setEditing] = useState<DecryptedItem | null>(null);
  const [breaches, setBreaches] = useState(new Map<string, BreachResult>());
  const [scan, setScan] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const report = useMemo(() => analyzeHealth(estimator.data ? items.data ?? [] : [], Date.now(), breaches), [items.data, estimator.data, breaches]);
  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    setBreaches(new Map());
    setScan('idle');
    return () => { controller.current?.abort(); };
  }, [items.data]);

  async function runBreachCheck() {
    if (scan === 'running') return;
    const current = new AbortController();
    controller.current = current;
    setProgress(0);
    setScan('running');
    try {
      const results = await checkBreaches(
        [...report.byId.values()].map(({ item }) => ({ id: item.id, password: item.data.password! })),
        current.signal, setProgress,
      );
      if (!current.signal.aborted) { setBreaches(results); setScan('done'); }
    } catch {
      if (!current.signal.aborted) setScan('failed');
    }
  }

  if (estimator.isError) return <div role="alert" className="grid gap-3 p-6"><p>Could not load local password checks.</p><Button onClick={() => void estimator.refetch()}>Retry</Button></div>;
  if (estimator.isPending || items.isLoading) return <Loading label="Checking your passwords on this device…" />;
  if (items.error) {
    return (
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertDescription>Could not load your vault.</AlertDescription>
      </Alert>
    );
  }

  const status = statusFor(report.score);
  const nextFix = report.attention.find((entry) => can(entry.item, 'MODIFY'));
  const lists: Record<HealthIssue, ItemHealth[]> = { breached: report.breached, reused: report.reused, weak: report.weak, old: report.old };
  const tiles = [
    { label: 'Passwords checked', value: report.checked },
    { label: 'Reused', value: report.reused.length },
    { label: 'Weak', value: report.weak.length },
    { label: 'Need attention', value: report.attention.length },
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
            <CardDescription>Passwords passing our checks</CardDescription>
            <div className="flex items-end gap-2">
              <span className="font-heading text-5xl font-semibold tabular-nums">{report.checked ? `${report.score}%` : '—'}</span>
              <span className="pb-1.5 text-sm text-muted-foreground">{report.checked ? 'passed the checks performed' : 'Add passwords to calculate health'}</span>
            </div>
          </div>
          {report.checked > 0 && <Badge variant="outline" className={cn('h-7 gap-1.5 px-3 text-sm', status.chip)}>
            <status.icon className="size-4!" /> {status.label}
          </Badge>}
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            {report.checked > 0 && <div
              className={cn('h-2.5 w-full overflow-hidden rounded-full', status.track)}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={report.score}
              aria-label="Password health score"
            >
              <div className={cn('h-full rounded-full transition-all', status.fill)} style={{ width: `${report.score}%` }} />
            </div>}
            <p className="text-xs text-muted-foreground">
              {report.checked
                ? `${report.checked - report.attention.length} of ${report.checked} passwords passed. ${report.attention.length} ${report.attention.length === 1 ? 'needs' : 'need'} attention. This percentage counts passwords that pass, not the strength of an individual password.`
                : 'No passwords have been checked yet.'}
              {' '}Strength and reuse are checked locally. Known exposure affects the score after an optional breach check.
              Item age and expiry do not reduce it. This is not a percentage of how secure you are.
            </p>
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

      <Card>
        <CardHeader>
          <CardTitle>Known breach check · optional</CardTitle>
          <CardDescription>
            Check saved passwords against Have I Been Pwned’s Pwned Passwords database.
            Only the first five characters of each password’s SHA-1 hash leave your device, never the
            password, full hash, account email or item name. The service receives your IP address.
            Results stay in memory for this view and reset when vault data changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm" role="status">
            {scan === 'running' ? `Checking ${progress} of ${report.checked} passwords…`
              : scan === 'done' ? `${report.breachChecked} of ${report.checked} checked for exposure; ${report.breached.length} found in breach data.${report.breachChecked < report.checked ? ' Some lookups failed. Unchecked passwords are not confirmed clear; retry the check.' : ' No match does not guarantee safety.'}`
              : scan === 'failed' ? 'Breach check failed. No clear result can be assumed. Retry when connected.'
              : 'Not checked for breaches. No requests are made until you choose to check.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" disabled={!report.checked || scan === 'running'} onClick={() => void runBreachCheck()}>
              {scan === 'done' || scan === 'failed' ? 'Run breach check again' : 'Check with Have I Been Pwned'}
            </Button>
            {scan === 'running' && <Button variant="outline" onClick={() => {
              controller.current?.abort(); setScan('idle');
            }}>Cancel</Button>}
            <a className="self-center text-sm underline" href="https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange" target="_blank" rel="noreferrer">How this lookup works</a>
          </div>
        </CardContent>
      </Card>

      {report.attention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{report.attention.length} password{report.attention.length === 1 ? ' needs' : 's need'} attention</CardTitle>
            <CardDescription>
              Replace exposed passwords first, then passwords that are both weak and reused, followed by other reused or weak passwords.
              Update the password on its website and save the replacement in Vaultessa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {nextFix ? (
              <Button onClick={() => setEditing(nextFix.item)}>Fix next: {nextFix.item.data.name}</Button>
            ) : <p className="text-sm">Ask the owners of these shared items to update their passwords.</p>}
          </CardContent>
        </Card>
      )}

      {report.checked === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="Nothing to check yet" description="Add some logins and their health will show up here." />
      ) : report.score === 100 ? (
        <EmptyState icon={<ShieldCheck />} title="No issues detected by these checks" description={report.breachChecked === report.checked ? 'No weak, reused or known exposed passwords detected. No match is not a guarantee of safety.' : 'No weak or reused passwords detected. Breach checking is incomplete or has not been run.'} />
      ) : null}
      {report.checked > 0 && (
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
                        {issue === 'breached' && 'Password found in known breach data'}
                        {issue === 'old' && `Item last updated ${relativeTime(h.item.updatedAt)}`}
                        {' · '}
                        {TEMPLATES[h.item.type].subtitle(h.item.data) ?? TEMPLATES[h.item.type].label}
                      </span>
                    </div>
                    {can(h.item, 'MODIFY') ? (
                      <Button variant="outline" onClick={() => setEditing(h.item)}>
                        {issue === 'old' ? 'Review' : 'Fix'}
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
