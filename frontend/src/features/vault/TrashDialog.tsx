import { useRef } from 'react';
import { LoaderCircle, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { confirmAction } from '@/components/common/confirm-dialog';
import { useTrashAction, useTrashItems } from './hooks';

function TrashContents() {
  const items = useTrashItems();
  const action = useTrashAction();
  const guard = useRef(false);
  async function apply(id: string, permanent: boolean) {
    if (guard.current) return;
    guard.current = true;
    try {
      if (permanent && !await confirmAction({ title: 'Permanently delete this item?', description: 'Its encrypted contents and history will be deleted. This cannot be undone.', confirmLabel: 'Delete permanently', destructive: true })) return;
      await action.mutateAsync({ id, permanent });
      toast.success(permanent ? 'Item permanently deleted' : 'Item restored. Previous sharing remains revoked.', permanent ? { icon: <Trash2 className="size-4 text-destructive" /> } : undefined);
    } catch { /* Global mutation feedback displays the error. */ }
    finally { guard.current = false; }
  }
  return <div className="grid gap-3" aria-busy={action.isPending}>
    {items.isPending && <p role="status">Loading Trash...</p>}
    {items.isError && <Button variant="outline" onClick={() => void items.refetch()}>Could not load Trash. Retry</Button>}
    {items.isSuccess && !items.data.length && <p className="text-muted-foreground">Trash is empty.</p>}
    {items.data?.map(item => <div key={item.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border p-3">
      <p className="w-full truncate font-medium sm:w-auto sm:min-w-0 sm:flex-1">{item.data.name}</p>
      <Button className="min-h-11" variant="outline" disabled={action.isPending} onClick={() => void apply(item.id, false)}><RotateCcw />Restore<span className="sr-only"> {item.data.name}</span></Button>
      <Button className="min-h-11" variant="destructive" disabled={action.isPending} onClick={() => void apply(item.id, true)}><Trash2 />Delete forever<span className="sr-only"> {item.data.name}</span></Button>
    </div>)}
    {action.isPending && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" />{action.variables?.permanent ? 'Deleting permanently...' : 'Restoring item...'}</p>}
  </div>;
}

export function TrashDialog() {
  return <Dialog><DialogTrigger asChild><Button variant="outline" className="min-h-11"><Trash2 />Trash</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Trash</DialogTitle><DialogDescription>Restore items or delete them permanently. Items stay here until you delete them. Sharing is revoked when an item moves to Trash.</DialogDescription></DialogHeader><TrashContents /></DialogContent>
  </Dialog>;
}
