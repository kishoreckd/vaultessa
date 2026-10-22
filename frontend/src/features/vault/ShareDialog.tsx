import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '@/lib/api/organizations';
import { CircleAlert, Fingerprint, Info, Link2, LoaderCircle, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Drawer } from '@/components/common/drawer';
import { TextField } from '@/components/common/form-field';
import { IconAction } from '@/components/common/icon-action';
import { Loading } from '@/components/common/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useFormErrors } from '@/hooks/useFormErrors';
import { ApiError } from '@/lib/api/client';
import { sharingApi } from '@/lib/api/endpoints';
import { PERMISSIONS, type Permission, type UserLookup } from '@/lib/api/types';
import { publicKeyFingerprint } from '@/lib/crypto';
import { cn } from '@/lib/utils';
import { emailError } from '@/lib/validation';
import { useSession } from '@/stores/session';
import { emailDomain } from '../shares/hooks';
import { useShareMutations, useShares } from './hooks';
import { PERMISSION_DESCRIPTIONS, PERMISSION_LABELS, type DecryptedItem } from './vaultTypes';

type Candidate = { user: UserLookup; fingerprint: string };

/** Share with other Vaultessa users (end-to-end: the item key is wrapped with their public key). */
export function ShareUsersDrawer({
  item,
  open,
  onOpenChange,
  onUseLink,
}: {
  item: DecryptedItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** switch to "Share link" for someone without an account, prefilled with their email */
  onUseLink?: (email: string) => void;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Share “${item.data.name}”`}
      description="Give people in Vaultessa access. They'll see it in their vault under “Shared with me”."
      footer={<Button onClick={() => onOpenChange(false)}>Done</Button>}
    >
      {open && <ShareUsersBody item={item} onUseLink={onUseLink} />}
    </Drawer>
  );
}

function ShareUsersBody({ item, onUseLink }: { item: DecryptedItem; onUseLink?: (email: string) => void }) {
  const account = useSession((s) => s.account);
  const shares = useShares(item.id);
  const { grant, update, revoke } = useShareMutations(item);
  const [email, setEmail] = useState('');
  const [organizationId, setOrganizationId] = useState(item.organizationId ?? 'personal');
  const teams = useQuery({
    queryKey: ['teams', 'list'],
    queryFn: organizationsApi.list,
  });
  const [permission, setPermission] = useState<Permission>('VIEW');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const { formRef, errors, validate, clear } = useFormErrors<'email'>();

  async function onLookup(event: FormEvent) {
    event.preventDefault();
    setLookupError(null);
    setNoAccount(null);
    if (!validate({ email: emailError(email) })) return;
    setLooking(true);
    const wanted = email.trim().toLowerCase();
    try {
      const user = await sharingApi.lookup(wanted);
      setCandidate({
        user,
        fingerprint: await publicKeyFingerprint(user.publicKey),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNoAccount(wanted);
      else setLookupError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLooking(false);
    }
  }

  async function onConfirm() {
    if (!candidate) return;
    await grant.mutateAsync({
      userId: candidate.user.id,
      publicKey: candidate.user.publicKey,
      permission,
      organizationId: organizationId === 'personal' ? null : organizationId,
    });
    toast.success(`Shared with ${candidate.user.name}`, {
      description: `${PERMISSION_LABELS[permission]} access`,
    });
    setCandidate(null);
    setEmail('');
  }

  async function onRemove(userId: string, name: string) {
    const ok = await confirmAction({
      title: `Remove ${name}'s access?`,
      description: `${name} will no longer see “${item.data.name}”. If they may have copied the password, change it as well.`,
      confirmLabel: 'Remove access',
      destructive: true,
    });
    if (!ok) return;
    await revoke.mutateAsync(userId);
    toast.success(`Removed ${name}'s access`);
  }

  const outside =
    candidate && emailDomain(candidate.user.email) !== emailDomain(account?.email)
      ? emailDomain(candidate.user.email)
      : null;

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h3 className="text-sm font-medium">People with access</h3>
        {shares.isLoading ? (
          <Loading />
        ) : (
          <ul className="divide-y rounded-lg border">
            {shares.data?.map((share) => (
              <li key={share.userId} className="flex items-center gap-3 p-3 text-sm">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs font-semibold uppercase">
                    {share.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{share.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {share.email}
                    {share.organizationId && ' | Team share'}
                    {!share.accepted && ' · not opened yet'}
                  </span>
                </div>
                {share.isOwner ? (
                  <Badge variant="secondary">Owner</Badge>
                ) : (
                  <>
                    <Select
                      value={share.permission}
                      onValueChange={async (value) => {
                        await update.mutateAsync({
                          userId: share.userId,
                          permission: value as Permission,
                        });
                        toast.success(
                          `${share.name} now has ${PERMISSION_LABELS[value as Permission]} access`,
                        );
                      }}
                    >
                      <SelectTrigger size="sm" aria-label={`Access for ${share.name}`} className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PERMISSIONS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {PERMISSION_LABELS[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <IconAction
                      label={`Remove ${share.name}`}
                      className="text-destructive"
                      onClick={() => onRemove(share.userId, share.name)}
                    >
                      <Trash2 />
                    </IconAction>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section className="grid gap-4">
        <h3 className="text-sm font-medium">Add people</h3>
        {!!teams.data?.length && (
          <div className="grid gap-2">
            <Select value={organizationId} onValueChange={setOrganizationId} disabled={!!item.organizationId}>
              <SelectTrigger aria-label="Sharing scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal share</SelectItem>
                {teams.data.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Team shares require both people to be active members. The grant is removed if either person
              leaves the team.
            </p>
          </div>
        )}
        {lookupError && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{lookupError}</AlertDescription>
          </Alert>
        )}
        {noAccount && (
          <Alert>
            <Info />
            <AlertTitle>{noAccount} doesn’t have a Vaultessa account</AlertTitle>
            <AlertDescription>
              <span>
                Send them a secure share link instead. They can open it in their browser without signing up.
              </span>
              {onUseLink && (
                <Button size="sm" className="mt-2" onClick={() => onUseLink(noAccount)}>
                  <Link2 /> Create a share link for them
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {!candidate ? (
          <form ref={formRef} onSubmit={onLookup} noValidate className="grid gap-4">
            <TextField
              label="Their Vaultessa email"
              type="email"
              required
              placeholder="colleague@company.com"
              value={email}
              error={errors.email}
              onChange={(e) => {
                setEmail(e.target.value);
                setNoAccount(null);
                clear('email');
              }}
            />
            <div className="grid gap-2">
              <Label>What can they do?</Label>
              <RadioGroup
                value={permission}
                onValueChange={(v) => setPermission(v as Permission)}
                className="grid gap-2 sm:grid-cols-2"
              >
                {PERMISSIONS.map((p) => (
                  <Label
                    key={p}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors',
                      permission === p ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                    )}
                  >
                    <RadioGroupItem value={p} className="mt-0.5" />
                    <span className="grid gap-0.5">
                      <span className="font-medium">{PERMISSION_LABELS[p]}</span>
                      <span className="text-xs text-muted-foreground">{PERMISSION_DESCRIPTIONS[p]}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </div>
            <Button type="submit" className="justify-self-end" disabled={looking}>
              {looking ? <LoaderCircle className="animate-spin" /> : <UserPlus />} Continue
            </Button>
          </form>
        ) : (
          <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 text-sm">
            <p>
              Share <strong>{item.data.name}</strong> with <strong>{candidate.user.name}</strong> (
              {candidate.user.email}) with <strong>{PERMISSION_LABELS[permission]}</strong> access?
            </p>
            {outside && (
              <Alert className="border-warning/40 bg-warning/10">
                <CircleAlert className="text-warning" />
                <AlertTitle>Different email domain</AlertTitle>
                <AlertDescription>
                  {candidate.user.email} uses {outside}, not {emailDomain(account?.email)}.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Fingerprint className="mt-0.5 size-4 shrink-0" />
              <span>
                Encrypted for their key{' '}
                <code className="font-mono text-foreground">{candidate.fingerprint}</code>. For very sensitive
                items, check it matches the fingerprint in their Settings.
              </span>
            </div>
            {permission === 'LOGIN_ONLY' && (
              <div className="flex items-start gap-2 text-xs text-warning">
                <Info className="mt-0.5 size-4 shrink-0" />
                “Login only” hides the password in Vaultessa apps, but their device can still decrypt it.
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCandidate(null)}>
                Back
              </Button>
              <Button onClick={onConfirm} disabled={grant.isPending}>
                {grant.isPending && <LoaderCircle className="animate-spin" />} Share
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
