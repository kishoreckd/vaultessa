import { useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import { EmptyState, Loading, PageHeader } from '@/components/common/page';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVaultItems } from '../vault/hooks';
import { useExternalShares } from './hooks';
import { LinkRow } from './LinkRow';

export function SharedLinksPage() {
  const links = useExternalShares();
  const vault = useVaultItems();
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const items = useMemo(() => new Map((vault.data ?? []).map((i) => [i.id, i])), [vault.data]);
  const rows = (links.data ?? []).filter((l) => tab === 'all' || l.status === 'active');

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader
        title="Shared links"
        description="Links you’ve created for people outside your vault. Copy, re-open or revoke any of them."
        actions={
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {links.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Link2 />}
          title={tab === 'active' ? 'No active links' : 'No links yet'}
          description="Open an item and choose “Share link” to send it to someone without a Vaultessa account."
        />
      ) : (
        <ul className="grid gap-2">
          {rows.map((link) => {
            const item = link.secretId ? items.get(link.secretId) : undefined;
            return <LinkRow key={link.id} link={link} item={item} itemName={item?.data.name ?? 'Deleted item'} />;
          })}
        </ul>
      )}
    </div>
  );
}
