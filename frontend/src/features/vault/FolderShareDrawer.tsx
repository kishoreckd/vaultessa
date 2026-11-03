import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { foldersApi } from '@/api/folders/api';
import { sharingApi } from '@/api/sharing/api';
import type { UserLookup } from '@/api/sharing/types';
import { ApiError } from '@/api/client';
import { Drawer } from '@/components/common/drawer';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { shareFolder } from './folderCrypto';
import type { DecryptedFolder } from './vaultTypes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FolderLinkPanel } from '../shares/FolderLinkPanel';
import { FolderExpirySelect, memberExpiry, type MemberDuration } from './FolderExpirySelect';

export function FolderShareDrawer({ folder, onClose }: { folder: DecryptedFolder; onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [candidate, setCandidate] = useState<UserLookup | null>(null);
  const [permission, setPermission] = useState<'VIEW' | 'MODIFY'>('VIEW');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('people');
  const [duration, setDuration] = useState<MemberDuration>('none');
  const members = useQuery({
    queryKey: ['vault', 'folder-members', folder.id],
    queryFn: () => foldersApi.members(folder.id),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['vault'] });
  const lookup = useMutation({
    meta: { silentError: true },
    mutationFn: () => sharingApi.lookup(email.trim().toLowerCase()),
    onSuccess: (user) => {
      setCandidate(user);
      setError('');
    },
    onError: (error) =>
      setError(
        error instanceof ApiError && error.status === 404
          ? 'No Vaultessa account was found. Check the email or create a secure share link instead.'
          : 'Could not look up this person. Check your connection and try again.',
      ),
  });
  const grant = useMutation({
    mutationFn: async () => {
      if (!candidate) return;
      await shareFolder(
        folder.id,
        folder.name,
        candidate.id,
        candidate.publicKey,
        permission,
        memberExpiry(duration),
      );
    },
    onSuccess: async () => {
      setCandidate(null);
      setEmail('');
      toast.success('Folder shared');
      await refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ userId, value }: { userId: string; value: 'VIEW' | 'MODIFY' }) =>
      foldersApi.permission(folder.id, userId, value),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (userId: string) => foldersApi.revoke(folder.id, userId),
    onSuccess: refresh,
  });
  const expiry = useMutation({
    mutationFn: ({ userId, value }: { userId: string; value: MemberDuration }) =>
      foldersApi.expiry(folder.id, userId, memberExpiry(value)),
    onSuccess: refresh,
  });
  const busy =
    lookup.isPending || grant.isPending || update.isPending || revoke.isPending || expiry.isPending;
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    lookup.mutate();
  }
  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={<span className="break-words [overflow-wrap:anywhere]">Share “{folder.name}”</span>}
      description={
        tab === 'people'
          ? 'Share the live folder with a person. Current and future items are included until access expires or is removed.'
          : 'Create a secure snapshot link. Choose expiry, view limits and an optional access code. No account needed.'
      }
      footer={
        <Button className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={onClose}>
          Done
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="grid w-full grid-cols-2 gap-1 group-data-horizontal/tabs:h-[50px]">
          <TabsTrigger className="h-11 min-w-0" value="people">
            People
          </TabsTrigger>
          <TabsTrigger className="h-11 min-w-0" value="link">
            Share link
          </TabsTrigger>
        </TabsList>
        <TabsContent value="people">
          <div className="grid min-w-0 gap-5" aria-busy={busy}>
            <form onSubmit={submit} className="grid gap-3">
              <Label htmlFor="folder-recipient">Recipient email</Label>
              <Input
                id="folder-recipient"
                type="email"
                autoComplete="email"
                required
                className="h-11"
                value={email}
                aria-invalid={!!error}
                aria-describedby={error ? 'folder-recipient-error' : undefined}
                disabled={busy}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setCandidate(null);
                  setError('');
                }}
              />
              <Button type="submit" variant="outline" className="min-h-11" disabled={busy || !email.trim()}>
                {lookup.isPending ? <LoaderCircle className="animate-spin" /> : <UserPlus />} Find person
              </Button>
              {error && (
                <div className="grid gap-2">
                  <p id="folder-recipient-error" role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                  <Button type="button" variant="outline" className="min-h-11" onClick={() => setTab('link')}>
                    Create a share link instead
                  </Button>
                </div>
              )}
            </form>
            {candidate && (
              <div className="grid gap-3 rounded-lg border p-4">
                <p className="break-words text-sm">
                  Share all items with <strong>{candidate.name}</strong>
                  <br />
                  {candidate.email}
                </p>
                <Label htmlFor="folder-permission">Access</Label>
                <Select
                  value={permission}
                  onValueChange={(value) => setPermission(value as 'VIEW' | 'MODIFY')}
                  disabled={busy}
                >
                  <SelectTrigger id="folder-permission" className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIEW">View — see and copy items</SelectItem>
                    <SelectItem value="MODIFY">Edit — view and update items</SelectItem>
                  </SelectContent>
                </Select>
                <Label>Access expires</Label>
                <FolderExpirySelect
                  value={duration}
                  onChange={setDuration}
                  label="New member access expiry"
                  disabled={busy}
                />
                <Button className="min-h-11" disabled={busy} onClick={() => grant.mutate()}>
                  {grant.isPending && <LoaderCircle className="animate-spin" />}Share folder
                </Button>
              </div>
            )}
            <section className="grid gap-3" aria-label="Folder members">
              <h3 className="font-medium">People with folder access</h3>
              {members.isPending && <p role="status">Loading members…</p>}
              {members.isError && (
                <Button variant="outline" onClick={() => void members.refetch()}>
                  Could not load members. Retry
                </Button>
              )}
              {members.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">Only you have access through this folder.</p>
              )}
              {members.data?.map((member) => (
                <div key={member.userId} className="grid min-w-0 gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{member.name}</p>
                    <p className="break-all text-sm text-muted-foreground">{member.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {!member.active
                        ? 'Expired'
                        : member.expiresAt
                          ? `Access ends ${new Date(member.expiresAt).toLocaleString()}`
                          : 'No expiry'}
                    </p>
                  </div>
                  <FolderExpirySelect
                    value="keep"
                    keep={
                      member.expiresAt
                        ? `Expiry: ${new Date(member.expiresAt).toLocaleString()}`
                        : 'Current: no expiry'
                    }
                    label={`Change access expiry for ${member.name}`}
                    disabled={busy}
                    onChange={(value) => expiry.mutate({ userId: member.userId, value })}
                  />
                  <div className="flex gap-2">
                    <Select
                      value={member.permission}
                      disabled={busy}
                      onValueChange={(value) =>
                        update.mutate({ userId: member.userId, value: value as 'VIEW' | 'MODIFY' })
                      }
                    >
                      <SelectTrigger
                        aria-label={`Access for ${member.name}`}
                        className="min-h-11 min-w-0 flex-1"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VIEW">View</SelectItem>
                        <SelectItem value="MODIFY">Edit</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={busy}
                      aria-label={`Remove ${member.name}`}
                      onClick={async () => {
                        if (
                          await confirmAction({
                            title: `Remove ${member.name}?`,
                            description:
                              'Access through this folder ends. Separate item shares remain. Previously copied secrets cannot be erased.',
                            confirmLabel: 'Remove',
                            destructive: true,
                          })
                        )
                          revoke.mutate(member.userId);
                      }}
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </section>
            <p className="text-xs text-muted-foreground">
              Expiry, removal, or moving an item out ends live folder access. Separate item shares and
              snapshot links follow their own limits. Copied secrets cannot be erased.
            </p>
          </div>
        </TabsContent>
        <TabsContent value="link">
          <FolderLinkPanel folder={folder} initialRecipient={email.trim()} />
        </TabsContent>
      </Tabs>
    </Drawer>
  );
}
