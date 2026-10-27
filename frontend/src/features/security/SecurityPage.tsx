import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Info, Lock, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useStrengthEstimator } from '@/hooks/useStrengthEstimator';
import { Loading, PageHeader } from '@/components/common/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ItemAvatar } from '../vault/ItemAvatar';
import { SecretEditorDrawer } from '../vault/SecretEditor';
import { useFolders, useVaultItems } from '../vault/hooks';
import { can, relativeTime, type DecryptedItem } from '../vault/vaultTypes';
import { analyzeHealth, ISSUE_COPY } from './passwordHealth';
import { checkBreaches, type BreachResult } from './breachCheck';

type Filter = 'attention' | 'all' | 'reused' | 'weak' | 'breached';

export function SecurityPage() {
  const estimator = useStrengthEstimator();
  const items = useVaultItems();
  const folders = useFolders();
  const [editing, setEditing] = useState<DecryptedItem | null>(null);
  const [filter, setFilter] = useState<Filter>('attention');
  const [showOlder, setShowOlder] = useState(false);
  const resultsHeading = useRef<HTMLDivElement>(null);
  function chooseFilter(next: Filter) {
    setFilter(next);
    requestAnimationFrame(() => {
      resultsHeading.current?.focus({ preventScroll: true });
      resultsHeading.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'nearest',
      });
    });
  }
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

  if (estimator.isError) return (
    <div role="alert" className="grid gap-3 p-6">
      <p>Could not load local password checks.</p>
      <Button onClick={() => void estimator.refetch()}>Retry</Button>
    </div>
  );
  if (estimator.isPending || items.isLoading) return <Loading label="Checking your passwords on this device..." />;
  if (items.error) return <Alert variant="destructive"><TriangleAlert /><AlertDescription>Could not load your vault.</AlertDescription></Alert>;

  const filtered = filter === 'all' ? [...report.byId.values()] : report[filter];
  const nextFix = filtered.find((entry) => entry.issues.length > 0 && can(entry.item, 'MODIFY'));
  const complete = report.checked > 0 && report.breachChecked === report.checked;
  const exposed = report.breached.length > 0;
  const tiles = [
    { key: 'all', label: 'Checked', count: report.checked },
    { key: 'attention', label: 'Need attention', count: report.attention.length },
    { key: 'weak', label: 'Weak', count: report.weak.length },
    { key: 'reused', label: 'Reused', count: report.reused.length },
    { key: 'breached', label: 'Exposed', count: report.breachChecked ? report.breached.length : null },
  ] as const;
  const titles: Record<Filter, string> = {
    all: 'All checked passwords', attention: 'Passwords to update', weak: 'Weak passwords',
    reused: 'Reused passwords', breached: 'Exposed passwords',
  };
  const leakStatus = scan === 'running' ? `Checking ${progress} of ${report.checked}...`
    : scan === 'failed' ? 'Check unavailable. Try again.'
    : scan === 'done' && !complete ? `${report.breachChecked} of ${report.checked} checked. Some lookups failed.`
    : scan === 'done' && exposed ? `${report.breached.length} found in known leaks.`
    : scan === 'done' ? 'No matches found in known leaks.' : 'Not checked yet';
  const emptyTitle = !report.checked ? 'Add your first login'
    : filter === 'breached' && !complete ? 'Leak check not complete'
    : filter === 'all' ? 'No passwords to show'
    : filter === 'attention' ? 'No issues detected by these checks'
    : filter === 'weak' ? 'No weak passwords detected'
    : filter === 'reused' ? 'No reused passwords detected' : 'No known exposure found';

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <PageHeader title="Password health" description="Know what needs attention and what to update next."
        actions={<span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" />Passwords stay on this device</span>} />

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-5">
          <div className="flex items-start justify-between gap-6">
            <div className="grid gap-2">
              <CardDescription>Vault overview</CardDescription>
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                {report.attention.length ? <ShieldAlert className="size-6 shrink-0 text-warning" /> : <ShieldCheck className="size-6 shrink-0 text-muted-foreground" />}
                {!report.checked ? 'Ready when you are' : report.attention.length
                  ? `${report.attention.length} password${report.attention.length === 1 ? ' needs' : 's need'} attention`
                  : 'Your saved passwords, reviewed'}
              </CardTitle>
              <p className="max-w-lg text-sm text-muted-foreground">
                {!report.checked ? 'Save a login to see its strength and check for reuse.'
                  : `${report.checked} checked for strength and reuse. ${exposed ? 'Update exposed passwords first.' : 'Choose a category below to review your results.'}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-heading text-3xl font-semibold tabular-nums sm:text-4xl">{report.checked ? `${report.score}%` : '—'}</div>
              <p className="mt-1 text-xs text-muted-foreground">passing checks</p>
            </div>
          </div>
          {report.checked > 0 && <div role="meter" aria-label="Passwords passing performed checks" aria-valuemin={0} aria-valuemax={100} aria-valuenow={report.score}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full transition-all motion-reduce:transition-none', report.attention.length ? 'bg-warning' : 'bg-success')}
              style={{ width: `${report.score}%` }} />
          </div>}
        </CardHeader>
        <CardContent className="grid gap-4 pb-5">
          <div className="flex min-h-8 items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">Filter passwords</p>
            {filter !== 'attention' && <Button variant="ghost" size="sm" onClick={() => setFilter('attention')}>Reset filter</Button>}
          </div>
          <div role="group" aria-label="Filter password health results" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {tiles.map((tile) => <Button key={tile.key} type="button" variant="outline" aria-pressed={filter === tile.key}
              aria-controls="password-health-results" onClick={() => chooseFilter(tile.key)}
              className={cn('relative h-auto min-w-0 flex-col items-start gap-2 whitespace-normal rounded-lg p-3 text-left',
                filter === tile.key ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-muted/20')}>
              <span className="text-xs text-muted-foreground">{tile.label}</span>
              <span className="font-heading text-2xl font-semibold tabular-nums">{tile.count ?? '—'}</span>
            </Button>)}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {report.checked ? `${report.checked - report.attention.length} of ${report.checked} passwords passed the checks performed. ` : ''}
            This is not a safety guarantee. Age and expiry do not lower the score.
          </p>
        </CardContent>
        <div className="border-t bg-muted/20 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Known leaks <span className="ml-1 text-xs font-normal text-muted-foreground">Optional</span></p>
                <p role="status" className="mt-0.5 text-xs text-muted-foreground">{leakStatus}</p>
                {scan === 'idle' && <p className="mt-1 text-xs text-muted-foreground">HIBP receives only hash prefixes and your IP, never your passwords.</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!report.checked || scan === 'running'} onClick={() => void runBreachCheck()}>
                {scan === 'running' ? 'Checking...' : scan === 'idle' ? 'Check for leaks' : 'Check again'}
              </Button>
              {scan === 'running' && <Button size="sm" variant="ghost" onClick={() => { controller.current?.abort(); setScan('idle'); }}>Cancel</Button>}
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="About the leak check"><Info className="size-4" /></Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>About the leak check</DialogTitle>
                    <DialogDescription>An optional check against Have I Been Pwned's database of exposed passwords.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                    <div>
                      <h3 className="mb-1 font-medium text-foreground">What is shared?</h3>
                      <p>Only the first five characters of each password's SHA-1 hash and your IP address. Your passwords, full hashes, email and item names are never sent.</p>
                    </div>
                    <div>
                      <h3 className="mb-1 font-medium text-foreground">What does the result mean?</h3>
                      <p>A match means the password appears in known leaks, not that this account was breached. No match does not guarantee safety. Failed lookups remain unchecked.</p>
                    </div>
                    <p>Checks run only when you choose. Results stay in memory for this view and reset when vault data changes.</p>
                    <a href="https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange" target="_blank" rel="noreferrer" className="underline">Read about the lookup</a>
                  </div>
                  <DialogFooter><DialogClose asChild><Button>Got it</Button></DialogClose></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

        </div>
      </Card>

      <Card id="password-health-results" className="gap-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <CardTitle ref={resultsHeading} tabIndex={-1} className="scroll-mt-28 outline-none">{titles[filter]} <span className="ml-1 font-normal text-muted-foreground">{filtered.length}</span></CardTitle>
            <CardDescription>{filter === 'all' ? 'Strength, reuse and any leak checks you have run.' : filter === 'attention' ? 'Known exposure first, then weakness and reuse. Each password appears once.' : filter === 'breached' ? `${report.breachChecked} of ${report.checked} checked for known exposure.` : ISSUE_COPY[filter].advice}</CardDescription>
          </div>
          {nextFix && <Button size="sm" onClick={() => setEditing(nextFix.item)}>Fix next</Button>}
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? <div className="flex flex-col items-center gap-2 px-3 py-10 text-center" role="status">
            <ShieldCheck className="mb-1 size-7 text-muted-foreground" />
            <h2 className="text-sm font-medium">{emptyTitle}</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {!report.checked ? 'Passwords in your accessible logins will appear here.'
                : filter === 'breached' && !complete ? 'Use Check for leaks above to complete this optional check.'
                : !complete ? 'Local checks found no matches in this category. Known leaks have not been fully checked.'
                : 'No matches in this category. These checks cannot guarantee safety.'}
            </p>
            {filter !== 'all' && report.checked > 0 && <Button variant="link" size="sm" onClick={() => chooseFilter('all')}>View all passwords</Button>}
          </div> : <ul className="divide-y">
            {filtered.map((entry) => <li key={entry.item.id} className="flex items-center gap-3 py-4">
              <ItemAvatar type={entry.item.type} name={entry.item.data.name} />
              <div className="grid min-w-0 flex-1 gap-1.5">
                <span className="truncate text-sm font-medium">{entry.item.data.name}</span>
                <div className="flex flex-wrap gap-1.5">
                  {entry.issues.length ? entry.issues.map((issue) => <Badge key={issue} variant="outline" className={cn('text-xs', issue === 'breached' ? 'border-destructive/30 text-destructive' : 'border-warning/40 text-warning')}>{ISSUE_COPY[issue].label}</Badge>)
                    : <span className="text-xs text-muted-foreground">Passed performed checks</span>}
                </div>
                <span className="text-xs text-muted-foreground">{entry.breachCount === null ? 'Leak check not completed' : entry.breachCount > 0 ? 'Found in known leak data' : 'No known exposure found'}</span>
              </div>
              {can(entry.item, 'MODIFY') ? <Button variant="outline" size="sm" onClick={() => setEditing(entry.item)}>{entry.issues.length ? 'Update' : 'Review'}</Button>
                : <span className="max-w-24 text-xs text-muted-foreground">Ask {entry.item.owner.name}</span>}
            </li>)}
          </ul>}
          {filtered.length > 0 && <p className="border-t pt-3 text-xs text-muted-foreground">Change the password on its website first, then save the replacement here.</p>}
        </CardContent>
      </Card>

      {report.old.length > 0 && <div>
        <Button variant="ghost" size="sm" aria-expanded={showOlder} aria-controls="older-password-items" onClick={() => setShowOlder((value) => !value)}>
          {showOlder ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {report.old.length} older item{report.old.length === 1 ? '' : 's'} <span className="text-muted-foreground">Informational only</span>
        </Button>
        {showOlder && <Card id="older-password-items" className="mt-2"><CardContent className="pt-4">
          <p className="mb-3 text-xs text-muted-foreground">Item age does not tell us when a password changed and does not lower the score.</p>
          <ul className="divide-y">{report.old.map(({ item }) => <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="truncate">{item.data.name}</span><span className="shrink-0 text-xs text-muted-foreground">Updated {relativeTime(item.updatedAt)}</span>
          </li>)}</ul>
        </CardContent></Card>}
      </div>}
      <SecretEditorDrawer open={!!editing} onOpenChange={(open) => !open && setEditing(null)} existing={editing ?? undefined}
        folders={folders.data ?? []} defaultFolderId={editing?.folderId ?? null} />
    </div>
  );
}
