import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Loading, EmptyState } from '@/components/common/page';
import { Drawer } from '@/components/common/drawer';
import { TextField } from '@/components/common/form-field';
import { PasswordInput } from '@/components/common/password-input';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClipboard } from '@/hooks/useClipboard';
import { organizationsApi as api } from '@/api/organizations/api';
import { type Organization, type TeamMember } from '@/api/organizations/types';
import { deriveAuthHash, deriveMasterKey } from '@/lib/crypto';
import { emailError } from '@/lib/validation';
import { recoveryApi } from '@/api/recovery/api';
import { useSession } from '@/stores/session';

type Operation = {
  task: () => Promise<unknown>;
  message: string;
  done?: () => void;
};

export function TeamsPage() {
  const account = useSession((s) => s.account);
  const verification = useQuery({ queryKey: ['teams', 'email-status'], queryFn: recoveryApi.status });
  const verified = account?.emailVerified === true || verification.data?.emailVerified === true;
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const highlighted = params.get('invitation');
  const [selected, setSelected] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const teams = useQuery({ queryKey: ['teams', 'list'], queryFn: api.list });
  const invitations = useQuery({
    queryKey: ['teams', 'pending'],
    queryFn: api.pending,
    enabled: verified,
  });
  const discovered = useQuery({
    queryKey: ['teams', 'discover'],
    queryFn: api.discover,
    enabled: verified,
  });
  const operation = useMutation({
    meta: { errorTitle: 'Could not update team' },
    mutationFn: (op: Operation) => op.task(),
    onSuccess: async (_, op) => {
      await qc.invalidateQueries();
      toast.success(op.message);
      op.done?.();
    },
  });
  const run = (op: Operation) => operation.mutate(op);
  const org = teams.data?.find((o) => o.id === selected) ?? teams.data?.[0];
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Teams"
        description="Create an organisation, invite people and manage membership."
        actions={
          <Button disabled={!verified} onClick={() => setCreating(true)}>
            <Plus /> Create team
          </Button>
        }
      />
      <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Personal vaults stay private. Team membership does not share passwords automatically. Use an item's
        Share action to grant encrypted access.
      </p>
      {!verified && (
        <p role="status" className="rounded-lg border p-4 text-sm">
          Verify your email address before creating or joining a team.{' '}
          <Link className="text-primary underline" to="/vault/settings#account-security">
            Open account settings
          </Link>
        </p>
      )}
      {invitations.isError && (
        <Button variant="outline" onClick={() => void invitations.refetch()}>
          Retry invitations
        </Button>
      )}
      {!!invitations.data?.length && (
        <Card>
          <CardHeader>
            <CardTitle>Invitations for you</CardTitle>
            <CardDescription>Signed in as {account?.email}. Accept only teams you recognise.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {invitations.data.map((invite) => (
              <div
                key={invite.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${highlighted === invite.id ? 'border-primary' : ''}`}
              >
                <div>
                  <p className="font-medium">{invite.organizationName}</p>
                  <p className="text-xs text-muted-foreground">
                    {invite.role.toLowerCase()} · Expires {new Date(invite.expiresAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  disabled={operation.isPending}
                  onClick={() =>
                    run({
                      task: () => api.accept(invite.id),
                      message: 'Invitation accepted',
                      done: () => setSelected(invite.organizationId),
                    })
                  }
                >
                  Accept invitation
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {highlighted &&
        verified &&
        invitations.isSuccess &&
        !invitations.data.some((i) => i.id === highlighted) && (
          <p role="status" className="text-sm text-muted-foreground">
            This invitation is not pending for {account?.email}. It may have expired, been accepted or
            revoked, or belong to a different email address.
          </p>
        )}
      {!!discovered.data?.length && (
        <Card>
          <CardHeader>
            <CardTitle>Teams for your email domain</CardTitle>
            <CardDescription>
              These organisations verified your email domain and enabled joining.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {discovered.data.map((team) => (
              <div key={team.id} className="flex items-center justify-between gap-3">
                <div>
                  {team.name}
                  <p className="text-xs text-muted-foreground">{team.domain}</p>
                </div>
                <Button
                  variant="outline"
                  disabled={operation.isPending}
                  onClick={() =>
                    run({
                      task: () => api.join(team.id),
                      message: 'Team joined',
                      done: () => setSelected(team.id),
                    })
                  }
                >
                  Join team
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {teams.isPending ? (
        <Loading />
      ) : teams.isError ? (
        <Button variant="outline" onClick={() => void teams.refetch()}>
          Retry teams
        </Button>
      ) : !org ? (
        <EmptyState
          icon={<Building2 />}
          title="Your teams will appear here"
          description="Create a team or accept an invitation. You can belong to more than one organisation."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {teams.data.map((team) => (
              <Button
                key={team.id}
                variant={org.id === team.id ? 'default' : 'outline'}
                onClick={() => setSelected(team.id)}
              >
                <Building2 />
                {team.name}
                <Badge variant="secondary">{team.memberCount}</Badge>
              </Button>
            ))}
          </div>
          <TeamDetails key={org.id} org={org} run={run} busy={operation.isPending} />
        </>
      )}
      <Drawer
        open={creating}
        onOpenChange={(v) => {
          if (!operation.isPending) {
            setCreating(v);
            setError('');
            if (!v) setName('');
          }
        }}
        title="Create a team"
        description="You will be the owner. Invite colleagues after creating the organisation."
      >
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              setError('Enter a team name.');
              return;
            }
            run({
              task: () =>
                api.create(name.trim()).then((o) => {
                  setSelected(o.id);
                }),
              message: 'Team created',
              done: () => {
                setCreating(false);
                setName('');
              },
            });
          }}
        >
          <TextField
            label="Team name"
            value={name}
            maxLength={100}
            error={error}
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
          />
          <Button disabled={operation.isPending} type="submit">
            {operation.isPending ? 'Creating…' : 'Create team'}
          </Button>
        </form>
      </Drawer>
    </div>
  );
}

function TeamDetails({ org, run, busy }: { org: Organization; run: (op: Operation) => void; busy: boolean }) {
  const account = useSession((s) => s.account);
  const owner = org.role === 'OWNER';
  const manage = owner || org.role === 'ADMIN';
  const [tab, setTab] = useState('members');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<TeamMember>();
  const [password, setPassword] = useState('');
  const [transferError, setTransferError] = useState('');
  const [name, setName] = useState(org.name);
  const [domainJoin, setDomainJoin] = useState(org.allowDomainJoin);
  useEffect(() => {
    setName(org.name);
    setDomainJoin(org.allowDomainJoin);
  }, [org.name, org.allowDomainJoin]);
  const [domain, setDomain] = useState('');
  const copy = useClipboard();
  const members = useQuery({
    queryKey: ['teams', org.id, 'members'],
    queryFn: () => api.members(org.id),
  });
  const invites = useQuery({
    queryKey: ['teams', org.id, 'invitations'],
    queryFn: () => api.invitations(org.id),
    enabled: manage,
  });
  const domains = useQuery({
    queryKey: ['teams', org.id, 'domains'],
    queryFn: () => api.domains(org.id),
    enabled: owner,
  });
  const deactivate = async (member: TeamMember) => {
    if (
      await confirmAction({
        title: `Deactivate ${member.name}'s membership?`,
        description:
          'This removes team membership. Separately shared vault items are unchanged; review their access from Shared → People.',
        confirmLabel: 'Deactivate membership',
        destructive: true,
      })
    )
      run({
        task: () => api.remove(org.id, member.userId),
        message: 'Membership deactivated',
      });
  };
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{org.name}</CardTitle>
            <CardDescription>Your role: {org.role.toLowerCase()}</CardDescription>
          </div>
          {manage && (
            <Button onClick={() => setInviteOpen(true)}>
              <Users /> Invite people
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            {manage && <TabsTrigger value="invitations">Invitations</TabsTrigger>}
            {owner && <TabsTrigger value="domains">Domains</TabsTrigger>}
            {owner && <TabsTrigger value="settings">Settings</TabsTrigger>}
          </TabsList>
        </Tabs>
        {tab === 'members' &&
          (members.isPending ? (
            <Loading />
          ) : members.isError ? (
            <Button onClick={() => void members.refetch()}>Retry members</Button>
          ) : (
            <ul className="divide-y">
              {members.data.map((member) => (
                <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium">
                      {member.name} {member.userId === account?.id && '(you)'}
                    </p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                    <Badge variant="outline">
                      {member.isActive ? member.role.toLowerCase() : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {member.isActive && owner && member.role !== 'OWNER' && (
                      <>
                        <Select
                          value={member.role}
                          onValueChange={(v) =>
                            run({
                              task: () => api.role(org.id, member.userId, v as 'ADMIN' | 'MEMBER'),
                              message: 'Role updated',
                            })
                          }
                          disabled={busy}
                        >
                          <SelectTrigger aria-label={`Role for ${member.name}`} className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MEMBER">Member</SelectItem>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" disabled={busy} onClick={() => setTransfer(member)}>
                          Make owner
                        </Button>
                      </>
                    )}
                    {member.isActive &&
                      member.role !== 'OWNER' &&
                      (member.userId === account?.id ||
                        owner ||
                        (org.role === 'ADMIN' && member.role === 'MEMBER')) && (
                        <Button variant="outline" disabled={busy} onClick={() => void deactivate(member)}>
                          {member.userId === account?.id ? 'Leave team' : 'Deactivate'}
                        </Button>
                      )}
                    {!member.isActive && manage && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEmail(member.email);
                          setInviteOpen(true);
                        }}
                      >
                        Invite again
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ))}
        {tab === 'invitations' &&
          manage &&
          (invites.isPending ? (
            <Loading />
          ) : invites.isError ? (
            <Button onClick={() => void invites.refetch()}>Retry invitations</Button>
          ) : !invites.data.length ? (
            <p className="text-sm text-muted-foreground">No pending invitations.</p>
          ) : (
            invites.data.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b py-3"
              >
                <div>
                  {invite.email}
                  <p className="text-xs text-muted-foreground">
                    {invite.role.toLowerCase()} · Expires {new Date(invite.expiresAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      void copy(`${window.location.origin}/vault/teams?invitation=${invite.id}`, 'Invitation link')
                    }
                  >
                    Copy invitation
                  </Button>
                  {(owner || invite.role === 'MEMBER') && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await confirmAction({
                            title: `Revoke invitation for ${invite.email}?`,
                            description: 'They will no longer be able to accept this invitation.',
                            confirmLabel: 'Revoke invitation',
                            destructive: true,
                          })
                        )
                          run({
                            task: () => api.revoke(org.id, invite.id),
                            message: 'Invitation revoked',
                          });
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))
          ))}
        {tab === 'domains' && owner && (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Verify ownership with a DNS TXT record. Verification expires and can be renewed. Matching email
              addresses only join when you enable domain joining in Settings.
            </p>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!domain.trim()) return;
                run({
                  task: () => api.addDomain(org.id, domain.trim()),
                  message: 'DNS challenge created',
                  done: () => setDomain(''),
                });
              }}
            >
              <TextField
                label="Company domain"
                placeholder="company.com"
                value={domain}
                maxLength={253}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
              <Button disabled={busy} type="submit">
                Add domain
              </Button>
            </form>
            {domains.isPending ? (
              <Loading />
            ) : domains.isError ? (
              <Button onClick={() => void domains.refetch()}>Retry domains</Button>
            ) : (
              domains.data.map((d) => (
                <div key={d.id} className="grid gap-2 rounded-lg border p-4">
                  <p className="font-medium">{d.domain}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.verifiedUntil && new Date(d.verifiedUntil).getTime() > Date.now()
                      ? `Verified until ${new Date(d.verifiedUntil).toLocaleString()}`
                      : 'Awaiting verification'}
                  </p>
                  <p className="break-all font-mono text-xs">
                    TXT name: {d.txtName}
                    <br />
                    TXT value: {d.txtValue}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void copy(d.txtValue, 'TXT value')}>
                      Copy TXT value
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run({
                          task: () => api.verifyDomain(org.id, d.id),
                          message: 'Domain verified',
                        })
                      }
                    >
                      Verify DNS
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await confirmAction({
                            title: `Remove ${d.domain}?`,
                            description: 'Domain joining will be disabled. Existing members are unchanged.',
                            confirmLabel: 'Remove domain',
                            destructive: true,
                          })
                        )
                          run({
                            task: () => api.removeDomain(org.id, d.id),
                            message: 'Domain removed',
                          });
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {tab === 'settings' && owner && (
          <form
            className="grid max-w-lg gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim())
                run({
                  task: () => api.update(org.id, name.trim(), domainJoin),
                  message: 'Team settings saved',
                });
            }}
          >
            <TextField
              label="Team name"
              value={name}
              maxLength={100}
              required
              onChange={(e) => setName(e.target.value)}
            />
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={domainJoin}
                onChange={(e) => setDomainJoin(e.target.checked)}
              />
              <span>
                Allow verified domain members to join
                <p className="mt-1 text-xs text-muted-foreground">
                  Off by default. Requires current DNS verification and a verified matching email. Deactivated
                  members need a new invitation.
                </p>
              </span>
            </label>
            <Button disabled={busy} className="justify-self-start" type="submit">
              Save team settings
            </Button>
          </form>
        )}
        <Drawer
          open={inviteOpen && manage}
          onOpenChange={(v) => {
            if (!busy) {
              setInviteOpen(v);
              setInviteError(null);
              if (!v) {
                setEmail('');
                setRole('MEMBER');
              }
            }
          }}
          title={`Invite to ${org.name}`}
          description="Invite any email domain. Acceptance requires that person's verified email account."
        >
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const validation = emailError(email);
              setInviteError(validation);
              if (validation) return;
              run({
                task: () => api.invite(org.id, email.trim().toLowerCase(), role),
                message: 'Invitation created. Email is sent when SMTP is configured.',
                done: () => {
                  setInviteOpen(false);
                  setEmail('');
                  setRole('MEMBER');
                },
              });
            }}
          >
            <TextField
              label="Email address"
              type="email"
              autoComplete="email"
              value={email}
              error={inviteError}
              onChange={(e) => {
                setEmail(e.target.value);
                setInviteError(null);
              }}
            />
            <Select value={role} onValueChange={(v) => setRole(v as 'ADMIN' | 'MEMBER')}>
              <SelectTrigger aria-label="Invitation role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                {owner && <SelectItem value="ADMIN">Admin</SelectItem>}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Members can view the team directory. Admins can invite and deactivate members. Only the owner
              can change roles, domains or ownership.
            </p>
            <Button type="submit" disabled={busy}>
              Create invitation
            </Button>
          </form>
        </Drawer>
        <Drawer
          open={!!transfer}
          onOpenChange={(v) => {
            if (!v && !busy) {
              setTransfer(undefined);
              setPassword('');
              setTransferError('');
            }
          }}
          title="Transfer team ownership"
          description={`Make ${transfer?.name ?? ''} the owner. You will become an admin. Personal vault ownership is unchanged.`}
        >
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!password || !account || !transfer) {
                setTransferError('Enter your current master password.');
                return;
              }
              const target = transfer;
              run({
                task: async () => {
                  const master = await deriveMasterKey(password, account.kdfSalt, account.kdfIterations);
                  const proof = await deriveAuthHash(master);
                  await api.transfer(org.id, target.userId, proof);
                },
                message: 'Ownership transferred',
                done: () => {
                  setTransfer(undefined);
                  setPassword('');
                  setTransferError('');
                },
              });
            }}
          >
            <PasswordInput
              label="Current master password"
              autoComplete="current-password"
              value={password}
              error={transferError}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" disabled={busy}>
              Transfer ownership
            </Button>
          </form>
        </Drawer>
      </CardContent>
    </Card>
  );
}
