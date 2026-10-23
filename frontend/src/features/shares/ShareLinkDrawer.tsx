import { useId, useMemo, useState, type FormEvent } from 'react';
import { Check, CircleAlert, CircleCheck, Copy, KeyRound, Link2, LoaderCircle, Mail, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer } from '@/components/common/drawer';
import { TextareaField, TextField } from '@/components/common/form-field';
import { IconAction } from '@/components/common/icon-action';
import { Loading } from '@/components/common/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useClipboard } from '@/hooks/useClipboard';
import { useFormErrors } from '@/hooks/useFormErrors';
import { type ExternalShare } from '@/api/sharing/types';
import { generateAccessCode } from '@/lib/crypto';
import { cn } from '@/lib/utils';
import { emailError } from '@/lib/validation';
import { useSession } from '@/stores/session';
import { relativeTime, type DecryptedItem } from '../vault/vaultTypes';
import {
  DURATIONS,
  emailDomain,
  shareableFields,
  timingFor,
  useCreateShareLink,
  useEmailShareLink,
  useExternalShares,
  useShareConfig,
} from './hooks';
import { LinkRow } from './LinkRow';
import { DEFAULT_TIMING, LinkTimingFields, type LinkTimingValue } from './LinkTimingFields';

type Created = { share: ExternalShare; link: string; code?: string; recipient?: string };

export function ShareLinkDrawer({
  item,
  open,
  onOpenChange,
  initialRecipient,
}: {
  item: DecryptedItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** prefill the recipient (e.g. coming from "Share" when the person has no account) */
  initialRecipient?: string;
}) {
  const [created, setCreated] = useState<Created | null>(null);
  const [formKey, setFormKey] = useState(0);
  const formId = useId();
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setCreated(null);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={close}
      size="xl"
      title={created ? 'Link ready to share' : `Share “${item.data.name}” with anyone`}
      description={
        created
          ? 'Send the link and the access code through different channels.'
          : 'Create a secure link for people outside your vault — no Vaultessa account needed.'
      }
      footer={
        created ? (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setFormKey((k) => k + 1);
              }}
            >
              Create another
            </Button>
            <Button onClick={() => close(false)}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId}>
              <Link2 /> Create link
            </Button>
          </>
        )
      }
    >
      {open &&
        (created ? (
          <CreatedView created={created} />
        ) : (
          <ShareLinkForm
            key={`${formKey}-${initialRecipient ?? ''}`}
            formId={formId}
            item={item}
            initialRecipient={initialRecipient}
            onCreated={setCreated}
          />
        ))}
      {open && !created && <ExistingLinks item={item} />}
    </Drawer>
  );
}

function ShareLinkForm({
  formId,
  item,
  initialRecipient,
  onCreated,
}: {
  formId: string;
  item: DecryptedItem;
  initialRecipient?: string;
  onCreated: (c: Created) => void;
}) {
  const account = useSession((s) => s.account);
  const createLink = useCreateShareLink();
  const fields = useMemo(() => shareableFields(item), [item]);
  const ackId = useId();
  const codeId = useId();

  const [recipient, setRecipient] = useState(initialRecipient ?? '');
  const [timing, setTiming] = useState<LinkTimingValue>(DEFAULT_TIMING);
  const [useCode, setUseCode] = useState(true);
  const [code, setCode] = useState(generateAccessCode);
  const [include, setInclude] = useState<Record<string, boolean>>(() => Object.fromEntries(fields.map((f) => [f.key, true])));
  const [message, setMessage] = useState('');
  const [outsideAck, setOutsideAck] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { formRef, errors, validate, clear } = useFormErrors<'recipient' | 'code'>();

  const myDomain = emailDomain(account?.email);
  const theirDomain = emailDomain(recipient.trim());
  const outside = !!theirDomain && !!myDomain && theirDomain !== myDomain;
  const fieldKeys = fields.filter((f) => include[f.key]).map((f) => f.key);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const ok = validate({
      recipient: emailError(recipient, { optional: true }),
      code: useCode && code.replace(/[\s-]/g, '').length < 6 ? 'Use an access code of at least 6 characters.' : null,
    });
    if (!ok) return;
    if (outside && !outsideAck) return setFormError('Confirm that you want to share outside your organisation.');
    if (fieldKeys.length === 0) return setFormError('Choose at least one field to share.');

    const result = await createLink.mutateAsync({
      item,
      fieldKeys,
      sharedBy: account?.name ?? 'A Vaultessa user',
      message: message.trim() || undefined,
      timing: timingFor(timing.mode, timing.duration, timing.viewLimit),
      accessCode: useCode ? code : undefined,
      recipientEmail: recipient.trim() || undefined,
    });
    toast.success('Secure link created', {
      description:
        timing.mode === 'once'
          ? 'It can be opened once.'
          : `It works for ${DURATIONS.find((d) => d.value === timing.duration)!.label}.`,
    });
    onCreated({ ...result, code: useCode ? code : undefined, recipient: recipient.trim() || undefined });
  }

  return (
    <form id={formId} ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-6">
      {formError && (
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3">
        <TextField
          label="Recipient email (optional)"
          type="email"
          placeholder="name@company.com"
          hint="Used to label the link and, if you choose, to email it."
          value={recipient}
          error={errors.recipient}
          onChange={(e) => {
            setRecipient(e.target.value);
            setOutsideAck(false);
            clear('recipient');
          }}
        />
        {outside && (
          <Alert className="border-warning/40 bg-warning/10">
            <ShieldAlert className="text-warning" />
            <AlertTitle>Outside your organisation</AlertTitle>
            <AlertDescription>
              <span>
                <strong>{theirDomain}</strong> isn’t <strong>{myDomain}</strong>. Make sure you trust this recipient — the share
                will be flagged in your activity.
              </span>
              <span className="mt-2 flex items-center gap-2">
                <Checkbox id={ackId} checked={outsideAck} onCheckedChange={(v) => setOutsideAck(v === true)} />
                <Label htmlFor={ackId} className="text-sm font-normal text-foreground">
                  I want to share this outside {myDomain}
                </Label>
              </span>
            </AlertDescription>
          </Alert>
        )}
      </section>

      <LinkTimingFields value={timing} onChange={setTiming} />

      <section className="grid gap-3 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-0.5">
            <Label htmlFor={codeId} className="flex items-center gap-1.5">
              <KeyRound className="size-4" /> Require an access code
            </Label>
            <p className="text-xs text-muted-foreground">
              The guest types this code to open the link. Send it separately — by phone or SMS — never in the same email.
            </p>
          </div>
          <Switch id={codeId} checked={useCode} onCheckedChange={setUseCode} />
        </div>
        {useCode && (
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Access code"
                aria-invalid={errors.code ? true : undefined}
                aria-describedby={errors.code ? `${codeId}-error` : undefined}
                className="font-mono tracking-widest uppercase"
                value={code}
                maxLength={32}
                onChange={(e) => {
                  setCode(e.target.value);
                  clear('code');
                }}
              />
              <IconAction
                label="New random code"
                variant="outline"
                size="icon"
                onClick={() => {
                  setCode(generateAccessCode());
                  clear('code');
                }}
              >
                <RefreshCw />
              </IconAction>
            </div>
            {errors.code && (
              <p id={`${codeId}-error`} className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                <CircleAlert className="size-3.5" />
                {errors.code}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <Label className="text-sm font-medium">What to include</Label>
        <div className="grid gap-2 rounded-lg border p-3">
          {fields.length === 0 && <p className="text-sm text-muted-foreground">This item has no details to share yet.</p>}
          {fields.map((f) => (
            <label key={f.key} className="flex items-center gap-3 text-sm">
              <Checkbox checked={include[f.key] ?? false} onCheckedChange={(v) => setInclude((s) => ({ ...s, [f.key]: v === true }))} />
              <span className="flex-1">{f.label}</span>
              {f.secret && <Badge variant="secondary">Sensitive</Badge>}
            </label>
          ))}
        </div>
      </section>

      <TextareaField
        label="Message (optional)"
        rows={2}
        maxLength={500}
        placeholder="e.g. Use this to log in to the staging server today."
        hint="Encrypted along with the details."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      {createLink.isPending && <Loading label="Encrypting on this device…" />}
    </form>
  );
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const copy = useClipboard();
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className={cn(mono && 'font-mono tracking-widest')} onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="outline"
          onClick={async () => {
            await copy(value, label);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

function CreatedView({ created }: { created: Created }) {
  const config = useShareConfig();
  const emailLink = useEmailShareLink();
  const copy = useClipboard();
  const [emailed, setEmailed] = useState(false);
  const { share, link, code, recipient } = created;
  const once = share.maxViews === 1;
  const expiry = new Date(share.expiresAt).toLocaleString();

  const invitation = [
    'I’ve shared a password with you using Vaultessa.',
    '',
    `Open it here: ${link}`,
    once ? `It can be opened once, before ${expiry}.` : `It works until ${expiry}.`,
    code ? 'I’ll send you the access code separately.' : '',
  ]
    .filter(Boolean)
    .join('\n');
  const mailto = `mailto:${encodeURIComponent(recipient ?? '')}?subject=${encodeURIComponent('A password shared with you')}&body=${encodeURIComponent(invitation)}`;

  return (
    <div className="grid gap-5">
      <Alert className="border-success/40 bg-success/10">
        <CircleCheck className="text-success" />
        <AlertTitle>Secure link created</AlertTitle>
        <AlertDescription>
          {once ? 'It can be opened once' : 'It can be opened until it expires'} · expires {relativeTime(share.expiresAt)}
          {share.outsideDomain && ' · flagged as outside your organisation'}
        </AlertDescription>
      </Alert>

      <CopyRow label="Link" value={link} />
      {code && <CopyRow label="Access code" value={code} mono />}
      {code && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Share the code through a different channel than the link (call, SMS, chat). Vaultessa never emails it.
        </p>
      )}

      <Separator />

      <div className="grid gap-2">
        <Label>Send it</Label>
        <div className="flex flex-wrap gap-2">
          {recipient && config.data?.emailEnabled && (
            <Button
              disabled={emailLink.isPending || emailed}
              onClick={async () => {
                await emailLink.mutateAsync({ id: share.id, link });
                setEmailed(true);
                toast.success(`Email accepted for ${recipient}`, {
                  description: code ? 'Send the access code separately. Inbox delivery is not yet confirmed.' : 'The mail server accepted it. Inbox delivery is not yet confirmed.',
                });
              }}
            >
              {emailLink.isPending ? <LoaderCircle className="animate-spin" /> : emailed ? <Check /> : <Mail />}
              {emailed ? 'Accepted by mail server' : `Email link to ${recipient}`}
            </Button>
          )}
          <Button variant="outline" asChild>
            <a href={mailto}>
              <Mail /> Open in my email app
            </a>
          </Button>
          <Button variant="outline" onClick={() => copy(invitation, 'Message')}>
            <Copy /> Copy message
          </Button>
        </div>
        {recipient && config.data?.emailEnabled && (
          <p className="text-xs text-muted-foreground">
            When Vaultessa emails the link, our server handles it briefly while sending. For the strictest privacy, use your
            own email app.
          </p>
        )}
      </div>
    </div>
  );
}

function ExistingLinks({ item }: { item: DecryptedItem }) {
  const links = useExternalShares(item.id);
  const items = links.data ?? [];
  if (!items.length) return null;

  return (
    <section className="mt-8 grid gap-3" aria-label="Existing links">
      <Separator />
      <h3 className="text-sm font-medium">Links for this item</h3>
      <ul className="grid gap-2">
        {items.map((link) => (
          <LinkRow key={link.id} link={link} item={item} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Used-up or expired links can be re-opened — the recipient keeps using the link they already have.
      </p>
    </section>
  );
}
