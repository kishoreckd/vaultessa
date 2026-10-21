import { Kbd } from '@/components/common/page';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const SHORTCUTS: Array<{ keys: string[]; action: string }> = [
  { keys: ['/'], action: 'Search the vault' },
  { keys: ['↑', '↓'], action: 'Move through items (also j / k)' },
  { keys: ['c'], action: 'Copy password of the selected item' },
  { keys: ['u'], action: 'Copy username of the selected item' },
  { keys: ['e'], action: 'Edit the selected item' },
  { keys: ['n'], action: 'New item' },
  { keys: ['Esc'], action: 'Clear search / close item' },
  { keys: ['l'], action: 'Lock the vault now' },
  { keys: ['?'], action: 'Show keyboard shortcuts' },
];

export function ShortcutsList() {
  return (
    <dl className="divide-y">
      {SHORTCUTS.map((s) => (
        <div key={s.action} className="flex items-center justify-between gap-4 py-2 text-sm">
          <dt>{s.action}</dt>
          <dd className="flex shrink-0 gap-1">
            {s.keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work faster without the mouse.</DialogDescription>
        </DialogHeader>
        <ShortcutsList />
      </DialogContent>
    </Dialog>
  );
}
