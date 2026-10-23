import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { Ban, CircleAlert, Clock, Copy, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { VaultessaLogo } from '@/components/common/brand';
import { IconAction } from '@/components/common/icon-action';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { Loading } from '@/components/common/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFormErrors } from '@/hooks/useFormErrors';
import { ApiError } from '@/api/client';
import { publicSharesApi } from '@/api/sharing/api';
import { type PublicShareInfo } from '@/api/sharing/types';
import { accessCodeVerifier, openSend } from '@/lib/crypto';
import { cn } from '@/lib/utils';
import { relativeTime } from '../vault/vaultTypes';
import type { SharedSnapshot } from './hooks';

const GONE_COPY: Record<Exclude<PublicShareInfo['status'], 'active'>, { title: string; body: string }> = {
  expired: { title: 'This link has expired', body: 'Ask the sender to share it again.' },
  used: { title: 'This link was already opened', body: 'It could only be viewed once and has been deleted.' },
  revoked: { title: 'This link was revoked', body: 'The sender turned it off.' },
  locked: { title: 'This link is locked', body: 'Too many wrong access codes were tried. Ask the sender for a new link.' },
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-12">
      <ThemeToggle className="absolute right-4 top-4" />
      <VaultessaLogo variant="unlock" className="text-xl" />
      <main className="w-full max-w-lg">{children}</main>
      <p className="flex max-w-md items-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" />
        End-to-end encrypted. The key is in your link and never reaches our servers.
      </p>
    </div>
  );
}

export function GuestSharePage() {
  const { id = '' } = useParams();
  const linkKey = window.location.hash.slice(1);
  const [info, setInfo] = useState<PublicShareInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SharedSnapshot | null>(null);
  const [viewsLeft, setViewsLeft] = useState<number | null>(null);
  const { formRef, errors, validate, clear } = useFormErrors<'code'>();

  useEffect(() => {
    document.title = 'Shared with you · Vaultessa';
    publicSharesApi
      .info(id)
      .then(setInfo)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Could not load this link.'));
  }, [id]);

  async function onOpen(event: FormEvent) {
    event.preventDefault();
    if (!info) return;
    setOpenError(null);
    if (info.hasCode && !validate({ code: code.trim() ? null : `Enter the access code ${info.senderName} sent you.` })) return;
    setOpening(true);
    try {
      const verifier = info.hasCode && info.codeSalt ? await accessCodeVerifier(code, info.codeSalt) : undefined;
      const result = await publicSharesApi.open(id, verifier);
      setSnapshot(await openSend<SharedSnapshot>(result.encryptedData, linkKey, info.hasCode ? code : undefined, result.codeSalt));
      setViewsLeft(result.viewsLeft);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setInfo({ ...info, status: err.message.includes('wrong codes') ? 'locked' : 'used' });
      } else if (err instanceof ApiError) {
        setOpenError(err.message);
      } else {
        setOpenError('This link looks incomplete or damaged. Ask the sender to copy it again.');
      }
    } finally {
      setOpening(false);
    }
  }

  if (!linkKey) {
    return (
      <Shell>
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>This link is incomplete</AlertTitle>
          <AlertDescription>The part after “#” is missing. Ask the sender to copy the full link again.</AlertDescription>
        </Alert>
      </Shell>
    );
  }
  if (loadError) {
    return (
      <Shell>
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Link not found</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </Shell>
    );
  }
  if (!info) {
    return (
      <Shell>
        <Loading className="justify-center" />
      </Shell>
    );
  }

  if (snapshot) return <Revealed snapshot={snapshot} viewsLeft={viewsLeft} expiresAt={info.expiresAt} />;

  if (info.status !== 'active') {
    const copy = GONE_COPY[info.status];
    return (
      <Shell>
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Ban className="size-5" />
            </div>
            <CardTitle>{copy.title}</CardTitle>
            <CardDescription>{copy.body}</CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  const oneTime = info.viewsLeft === 1;
  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{info.senderName} shared a password with you</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" /> Expires {relativeTime(info.expiresAt)}
            </span>
            {oneTime && (
              <span className="flex items-center gap-1 font-medium text-warning">
                <Eye className="size-3.5" /> Can be viewed only once
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <form ref={formRef} onSubmit={onOpen} noValidate>
          <CardContent className="grid gap-4">
            {openError && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{openError}</AlertDescription>
              </Alert>
            )}
            {info.hasCode && (
              <div className="grid gap-1.5">
                <Label htmlFor="access-code" className="flex items-center gap-1.5">
                  <KeyRound className="size-4" /> Access code
                </Label>
                <Input
                  id="access-code"
                  autoFocus
                  required
                  autoComplete="off"
                  placeholder="XXXX-XXXX"
                  className="font-mono tracking-widest uppercase"
                  aria-invalid={errors.code ? true : undefined}
                  aria-describedby={errors.code ? 'access-code-error' : 'access-code-hint'}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    clear('code');
                  }}
                />
                {errors.code ? (
                  <p id="access-code-error" className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <CircleAlert className="size-3.5" />
                    {errors.code}
                  </p>
                ) : (
                  <p id="access-code-hint" className="text-xs text-muted-foreground">
                    {info.senderName} sent you this code separately.
                  </p>
                )}
              </div>
            )}
            {oneTime && (
              <p className="text-sm text-muted-foreground">
                Make sure you’re ready to save it — after you open it, this link is deleted for good.
              </p>
            )}
          </CardContent>
          <CardFooter className="mt-4">
            <Button type="submit" size="lg" className="w-full" disabled={opening}>
              {opening ? <LoaderCircle className="animate-spin" /> : <Eye />}
              {opening ? 'Decrypting…' : 'View password'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </Shell>
  );
}

function Revealed({ snapshot, viewsLeft, expiresAt }: { snapshot: SharedSnapshot; viewsLeft: number | null; expiresAt: string }) {
  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{snapshot.name}</CardTitle>
          <CardDescription>
            {snapshot.typeLabel} · shared by {snapshot.sharedBy}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {viewsLeft === 0 ? (
            <Alert className="border-warning/40 bg-warning/10">
              <Eye className="text-warning" />
              <AlertTitle>This was a one-time view</AlertTitle>
              <AlertDescription>The link is now deleted. Copy what you need before closing this page.</AlertDescription>
            </Alert>
          ) : (
            <p className="text-xs text-muted-foreground">You can reopen this link until it expires {relativeTime(expiresAt)}.</p>
          )}
          {snapshot.message && (
            <blockquote className="rounded-lg border-l-4 border-primary bg-muted/50 px-3 py-2 text-sm">{snapshot.message}</blockquote>
          )}
          <dl className="grid gap-3">
            {snapshot.fields.map((field) => (
              <GuestField key={field.label} {...field} />
            ))}
          </dl>
        </CardContent>
      </Card>
    </Shell>
  );
}

function GuestField({ label, value, secret, mono, multiline }: SharedSnapshot['fields'][number]) {
  const [revealed, setRevealed] = useState(!secret);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  }
  return (
    <div className="grid gap-1 rounded-lg border p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex items-start gap-1">
        <span className={cn('min-w-0 flex-1 break-all pt-1 text-sm', mono && 'font-mono', multiline && 'whitespace-pre-wrap text-xs')}>
          {revealed ? value : '••••••••••••'}
        </span>
        {secret && (
          <IconAction label={revealed ? `Hide ${label}` : `Reveal ${label}`} onClick={() => setRevealed((r) => !r)}>
            {revealed ? <EyeOff /> : <Eye />}
          </IconAction>
        )}
        <IconAction label={`Copy ${label}`} onClick={copy}>
          <Copy />
        </IconAction>
      </dd>
    </div>
  );
}
