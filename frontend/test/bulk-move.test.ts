import { beforeEach, expect, it, vi } from 'vitest';
import { useMoveSecrets } from '../src/features/vault/hooks';
const mocks = vi.hoisted(() => ({ update: vi.fn(), invalidate: vi.fn(), options: {} as {
  mutationFn: (input: { ids: string[]; folderId: string | null }) => Promise<{ moved: string[]; failed: string[] }>;
  onSuccess: () => unknown;
} }));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useMutation: (options: typeof mocks.options) => { mocks.options = options; return {}; },
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock('../src/api/vault/api', () => ({ secretsApi: { move: mocks.update } }));
beforeEach(() => { vi.resetAllMocks(); useMoveSecrets(); });
it('sends the selected items in one batch request', async () => {
  mocks.update.mockResolvedValue({ moved: ['one', 'two'], failed: [] });
  expect(await mocks.options.mutationFn({ ids: ['one', 'two'], folderId: 'folder' })).toEqual({ moved: ['one', 'two'], failed: [] });
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(['one', 'two'], 'folder');
  mocks.options.onSuccess();
  expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: ['vault', 'items'] });
});
it('preserves partial failures returned by the backend', async () => {
  mocks.update.mockResolvedValue({ moved: ['one', 'three'], failed: ['two'] });
  expect(await mocks.options.mutationFn({ ids: ['one', 'two', 'three'], folderId: 'folder' })).toEqual({ moved: ['one', 'three'], failed: ['two'] });
});
it('supports removing items from their folders', async () => {
  mocks.update.mockResolvedValue({ moved: ['one'], failed: [] });
  await mocks.options.mutationFn({ ids: ['one'], folderId: null });
  expect(mocks.update).toHaveBeenCalledWith(['one'], null);
});
it('propagates transport failures instead of claiming a successful move', async () => {
  mocks.update.mockRejectedValue(new Error('offline'));
  await expect(mocks.options.mutationFn({ ids: ['one', 'two'], folderId: 'folder' })).rejects.toThrow('offline');
});
