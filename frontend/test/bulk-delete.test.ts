import { beforeEach, expect, it, vi } from 'vitest';
import { useDeleteSecrets } from '../src/features/vault/hooks';

const mocks = vi.hoisted(() => ({ remove: vi.fn(), invalidate: vi.fn(), options: {} as {
  mutationFn: (ids: string[]) => Promise<{ deleted: string[]; failed: string[] }>;
  onSuccess: () => unknown;
} }));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useMutation: (options: typeof mocks.options) => { mocks.options = options; return {}; },
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock('../src/api/vault/api', () => ({ secretsApi: { remove: mocks.remove } }));

beforeEach(() => { mocks.remove.mockReset(); mocks.invalidate.mockReset(); useDeleteSecrets(); });

it('continues after individual failures and identifies exactly which items need retry', async () => {
  mocks.remove.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('forbidden')).mockResolvedValueOnce(undefined);
  expect(await mocks.options.mutationFn(['one', 'two', 'three'])).toEqual({ deleted: ['one', 'three'], failed: ['two'] });
  expect(mocks.remove.mock.calls).toEqual([['one'], ['two'], ['three']]);
  mocks.options.onSuccess();
  expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: ['vault', 'items'] });
});

it('reports all failures without claiming any successful deletions', async () => {
  mocks.remove.mockRejectedValue(new Error('offline'));
  expect(await mocks.options.mutationFn(['one', 'two'])).toEqual({ deleted: [], failed: ['one', 'two'] });
});

it('does not issue requests for an empty selection', async () => {
  expect(await mocks.options.mutationFn([])).toEqual({ deleted: [], failed: [] });
  expect(mocks.remove).not.toHaveBeenCalled();
});
