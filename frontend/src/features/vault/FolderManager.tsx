import { useRef, useState, type SubmitEvent } from 'react';
import { FolderPlus, LoaderCircle, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconAction } from '@/components/common/icon-action';
import { confirmAction } from '@/components/common/confirm-dialog';
import { useCreateFolder, useDeleteFolder, useFolders, useRenameFolder } from './hooks';

export function FolderManager({ onSelect, onDeleted, counts, selectedId }: {
  onSelect: (id: string) => void; onDeleted: (id: string) => void;
  counts: Record<string, number>; selectedId?: string;
}) {
  const folders = useFolders();
  const create = useCreateFolder();
  const rename = useRenameFolder();
  const remove = useDeleteFolder();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [renamed, setRenamed] = useState('');
  const guard = useRef(false);
  const busy = create.isPending || rename.isPending || remove.isPending;
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = (editing ? renamed : name).trim();
    if (!value || guard.current) return;
    guard.current = true;
    try {
      if (editing) { await rename.mutateAsync({ id: editing, name: value }); setEditing(null); toast.success('Folder renamed'); }
      else { await create.mutateAsync(value); setName(''); toast.success('Folder created'); }
    } catch { /* Mutation displays the error; keep input for retry. */ }
    finally { guard.current = false; }
  }
  async function deleteFolder(id: string, label: string) {
    if (guard.current) return;
    guard.current = true;
    try {
      if (!await confirmAction({ title: 'Delete folder "' + label + '"?', description: 'Items are kept in All items.', confirmLabel: 'Delete folder', destructive: true })) return;
      await remove.mutateAsync(id);
      if (editing === id) setEditing(null);
      onDeleted(id);
      toast.success('Folder deleted', { icon: <Trash2 className="size-4 text-destructive" /> });
    } catch { /* Mutation displays the error. */ }
    finally { guard.current = false; }
  }
  return <div className="grid min-w-0 gap-2" aria-busy={busy}>
    {folders.isPending && <p role="status" className="text-sm text-muted-foreground">Loading folders...</p>}
    {folders.isError && <Button variant="outline" onClick={() => void folders.refetch()}>Could not load folders. Retry</Button>}
    {folders.data?.map(folder => <div key={folder.id} className="flex min-w-0 items-center gap-1">
      <Button variant={selectedId === folder.id ? 'secondary' : 'ghost'} className="min-h-11 min-w-0 flex-1 justify-start" onClick={() => onSelect(folder.id)}>
        <span className="flex-1 truncate text-left">{folder.name}</span><span className="text-xs text-muted-foreground">{counts[folder.id] ?? 0}</span>
      </Button>
      <IconAction label={'Rename folder ' + folder.name} className="size-11 shrink-0" disabled={busy} onClick={() => { setEditing(folder.id); setRenamed(folder.name); }}><Pencil /></IconAction>
      <IconAction label={'Delete folder ' + folder.name} variant="destructive" className="size-11 shrink-0" disabled={busy} onClick={() => void deleteFolder(folder.id, folder.name)}>
        {remove.isPending && remove.variables === folder.id ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
      </IconAction>
    </div>)}
    <form onSubmit={save} className="flex min-w-0 gap-1">
      <Input autoFocus={!!editing} aria-label={editing ? 'Rename folder' : 'New folder name'} placeholder={editing ? 'Folder name' : 'New folder'} maxLength={200} className="h-11 min-w-0 flex-1" disabled={busy || !folders.isSuccess} value={editing ? renamed : name} onChange={event => editing ? setRenamed(event.target.value) : setName(event.target.value)} />
      <IconAction type="submit" variant="outline" label={editing ? 'Save folder name' : 'Create folder'} className="size-11 shrink-0" disabled={busy || !folders.isSuccess || !(editing ? renamed : name).trim()}>
        {busy ? <LoaderCircle className="animate-spin" /> : editing ? <Pencil /> : <FolderPlus />}
      </IconAction>
      {editing && <IconAction label="Cancel rename" className="size-11" disabled={busy} onClick={() => setEditing(null)}><X /></IconAction>}
    </form>
    {busy && <p role="status" className="text-xs text-muted-foreground">{create.isPending ? 'Creating folder...' : rename.isPending ? 'Renaming folder...' : 'Deleting folder...'}</p>}
  </div>;
}
