import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { PageHeader, Loading } from '@/components/common/page';
import { Drawer } from '@/components/common/drawer';
import { TextField } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { auditApi, externalSharesApi, sharingApi } from '@/lib/api/endpoints';
import type { ExternalShare } from '@/lib/api/types';
import { useVaultItems } from '../vault/hooks';
import { useExternalShares, linkKeys, STATUS_LABEL } from './hooks';
import { LinkRow } from './LinkRow';

export function SharedLinksPage() {
  const links = useExternalShares();
  const vault = useVaultItems();
  const [tab, setTab] = useState('links');
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<string>();
  const rows = (links.data ?? []).filter((l) => all || l.status === 'active');
  const link = links.data?.find((l) => l.id === selected);
  const owned = (vault.data ?? []).filter((item) => item.isOwner && item.sharedWith > 0);
  const people = useQuery({
    queryKey: ['shared-people', owned.map((i) => i.id).join(',')],
    enabled: tab === 'people',
    queryFn: async () =>
      (
        await Promise.all(owned.map(async (item) => ({ item, shares: await sharingApi.list(item.id) })))
      ).flatMap(({ item, shares }) => shares.filter((s) => !s.isOwner).map((share) => ({ item, share }))),
  });
  return (
    <div className="grid gap-6">
      <PageHeader title="Shared" description="Review links and people with access to your items." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="links">Links</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'links' ? (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include
            inactive links
          </label>
          {links.isPending || vault.isPending ? (
            <Loading />
          ) : links.isError || vault.isError ? (
            <Button
              variant="outline"
              onClick={() => {
                void links.refetch();
                void vault.refetch();
              }}
            >
              Retry shared items
            </Button>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {['Item', 'Recipient', 'Type', 'Views', 'Expires', 'Status', 'Access code', 'Actions'].map(
                    (title) => (
                      <TableHead key={title}>{title}</TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>No links to show. Open an item to create a share link.</TableCell>
                  </TableRow>
                )}
                {rows.map((row) => {
                  const item = vault.data?.find((i) => i.id === row.secretId);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        {item ? (
                          <Link className="font-medium hover:underline" to={`/?item=${item.id}`}>
                            {item.data.name}
                          </Link>
                        ) : (
                          'Deleted item'
                        )}
                      </TableCell>
                      <TableCell>
                        {row.recipientEmail || 'Anyone with the link'}
                        {row.outsideDomain && (
                          <Badge variant="outline" className="ml-2">
                            Outside domain
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{row.maxViews === 1 ? 'One-time' : 'Time period'}</TableCell>
                      <TableCell>
                        <Button
                          variant="link"
                          onClick={() => setSelected(row.id)}
                          aria-label={`View details: ${row.viewCount} views used`}
                        >
                          {row.viewCount} / {row.maxViews ?? 'Unlimited'}
                        </Button>
                      </TableCell>
                      <TableCell>{new Date(row.expiresAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === 'active' ? 'default' : 'secondary'}>
                          {STATUS_LABEL[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.hasCode ? 'Required' : 'None'}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setSelected(row.id)}>
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </>
      ) : people.isPending ? (
        <Loading />
      ) : people.isError ? (
        <Button variant="outline" onClick={() => void people.refetch()}>
          Retry shared people
        </Button>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {['Item', 'Person', 'Permission', 'Actions'].map((t) => (
                <TableHead key={t}>{t}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>No items shared with people yet.</TableCell>
              </TableRow>
            )}
            {people.data?.map(({ item, share }) => (
              <TableRow key={`${item.id}-${share.userId}`}>
                <TableCell>
                  <Link to={`/?item=${item.id}`}>{item.data.name}</Link>
                </TableCell>
                <TableCell>
                  {share.name}
                  <p className="text-xs text-muted-foreground">{share.email}</p>
                </TableCell>
                <TableCell>{share.permission.replace('_', ' ').toLowerCase()}</TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/?item=${item.id}`}>Open item</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Drawer
        open={!!link}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
        title="Share link details"
        description="Review usage, adjust active limits, or re-open an inactive link."
      >
        {link && (
          <LinkDetails key={link.id} link={link} item={vault.data?.find((i) => i.id === link.secretId)} />
        )}
      </Drawer>
    </div>
  );
}

function LinkDetails({ link, item }: { link: ExternalShare; item?: Parameters<typeof LinkRow>[0]['item'] }) {
  const qc = useQueryClient();
  const events = useInfiniteQuery({
    queryKey: ['link-events', link.id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => auditApi.list(pageParam, link.id),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const [limit, setLimit] = useState(link.maxViews?.toString() ?? '');
  const [expiry, setExpiry] = useState(() => {
    const date = new Date(link.expiresAt);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const save = useMutation({
    mutationFn: () =>
      externalSharesApi.updateLimits(link.id, {
        maxViews: limit ? Number(limit) : null,
        expiresAt: new Date(expiry).toISOString(),
      }),
    meta: { errorTitle: 'Could not update link limits' },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: linkKeys.all });
      toast.success('Link limits updated');
    },
  });
  return (
    <div className="grid gap-5">
      <dl className="grid gap-2 text-sm">
        <dt>Views used / allowed</dt>
        <dd className="font-medium">
          {link.viewCount} / {link.maxViews ?? 'Unlimited'}
        </dd>
        <dt>Last opened</dt>
        <dd>{link.lastViewedAt ? new Date(link.lastViewedAt).toLocaleString() : 'Not opened yet'}</dd>
      </dl>
      {link.status === 'active' && (
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const count = Number(limit);
            if (limit && (!Number.isInteger(count) || count <= link.viewCount || count > 100)) {
              toast.error('Choose a whole-number limit above views used, up to 100.');
              return;
            }
            if (!expiry || !Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()) {
              toast.error('Choose a future expiry.');
              return;
            }
            save.mutate();
          }}
        >
          <TextField
            label="Total view limit"
            type="number"
            min={link.viewCount + 1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            hint="Leave empty for unlimited views. Existing views are preserved."
          />
          <TextField
            label="Expires at (your local time)"
            type="datetime-local"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            required
          />
          <Button disabled={save.isPending}>Save limits</Button>
        </form>
      )}
      <ul>
        <LinkRow link={link} item={item} showItem />
      </ul>
      <section className="grid gap-3">
        <h3 className="font-medium">Link activity</h3>
        {events.isPending && <p role="status">Loading activity…</p>}
        {events.isError && (
          <Button variant="outline" onClick={() => void events.refetch()}>
            Retry activity
          </Button>
        )}
        <ul className="grid gap-2 text-sm">
          {events.data?.pages
            .flatMap((page) => page.items)
            .map((event) => (
              <li key={event.id} className="rounded border p-2">
                <p>{event.action.replaceAll('_', ' ').toLowerCase()}</p>
                <p className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</p>
              </li>
            ))}
        </ul>
        {events.hasNextPage && (
          <Button
            variant="outline"
            disabled={events.isFetchingNextPage}
            onClick={() => void events.fetchNextPage()}
          >
            Load earlier activity
          </Button>
        )}
      </section>
    </div>
  );
}
