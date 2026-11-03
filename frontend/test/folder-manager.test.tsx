import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TooltipProvider } from '../src/components/ui/tooltip';
import { FolderManager } from '../src/features/vault/FolderManager';
const state = vi.hoisted(() => ({ pending: false, error: false, creating: false, recipient: false }));
vi.mock('../src/features/vault/hooks', () => ({
  useFolders: () => ({ data: [{ id: 'folder', name: 'Social', isOwner: !state.recipient, memberCount: 2 }], isPending: state.pending, isError: state.error, isSuccess: !state.pending && !state.error }),
  useCreateFolder: () => ({ isPending: state.creating }),
  useRenameFolder: () => ({ isPending: false }),
  useDeleteFolder: () => ({ isPending: false }),
}));
beforeEach(() => { state.pending = false; state.error = false; state.creating = false; state.recipient = false; });
const render = () => renderToStaticMarkup(<TooltipProvider><FolderManager onSelect={() => {}} onDeleted={() => {}} counts={{ folder: 3 }} /></TooltipProvider>);
it('exposes named rename and delete actions with touch targets', () => {
  const html = render();
  expect(html).toContain('Rename folder Social');
  expect(html).toContain('Delete folder Social');
  expect(html).toContain('size-11');
  expect(html).toContain('New folder name');
});
it('shows loading feedback and disables folder submission until loaded', () => {
  state.pending = true;
  const html = render();
  expect(html).toContain('Loading folders...');
  expect(html).toMatch(/aria-label="Create folder"[^>]*disabled/);
});
it('shows an actionable load failure', () => {
  state.error = true;
  expect(render()).toContain('Could not load folders. Retry');
});
it('announces creation and disables conflicting actions', () => {
  state.creating = true;
  const html = render();
  expect(html).toContain('Creating folder...');
  expect(html).toContain('aria-busy="true"');
  expect(html).toMatch(/aria-label="Delete folder Social"[^>]*disabled/);
});
it('makes folder sharing and membership visible without hover', () => {
  const html = render();
  expect(html).toContain('Share folder Social');
  expect(html).toContain('Shared with 2');
});
it('offers recipients a touch-sized leave action while keeping management owner-only', () => {
  state.recipient = true;
  const html = render();
  expect(html).toContain('Shared with you');
  expect(html).toContain('Leave folder Social');
  expect(html).not.toContain('Rename folder Social');
  expect(html).not.toContain('Delete folder Social');
  expect(html).not.toContain('Share folder Social');
});
