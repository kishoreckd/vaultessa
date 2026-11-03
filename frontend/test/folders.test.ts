import { beforeEach, expect, it, vi } from 'vitest';
import { useCreateFolder, useDeleteFolder, useRenameFolder } from '../src/features/vault/hooks';

const mocks = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn(), invalidate: vi.fn(),
  decrypt: vi.fn(), encrypt: vi.fn(), fingerprint: vi.fn(), register: vi.fn(),
  options: {} as { mutationFn: (value: string | { id: string; name: string }) => Promise<unknown>; onSuccess: () => Promise<unknown> },
}));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useMutation: (options: typeof mocks.options) => { mocks.options = options; return {}; },
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock('../src/api/folders/api', () => ({ foldersApi: { list: mocks.list, create: mocks.create, rename: mocks.rename, remove: mocks.remove, registerFingerprints: mocks.register } }));
vi.mock('../src/stores/session', () => ({ requireKeys: () => ({ vaultKey: 'key', folderNameKey: 'name-key' }) }));
vi.mock('../src/lib/crypto', () => ({ decryptString: mocks.decrypt, encryptString: mocks.encrypt, folderNameFingerprint: mocks.fingerprint, normalizeFolderName: (name: string) => name.trim().toLowerCase() }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue([]);
  mocks.encrypt.mockResolvedValue('encrypted');
  mocks.fingerprint.mockResolvedValue('fingerprint');
  useCreateFolder();
});

it('blocks matching decrypted names despite case and surrounding spaces', async () => {
  mocks.list.mockResolvedValue([{ id: 'existing', encryptedName: 'ciphertext' }]);
  mocks.decrypt.mockResolvedValue(' Social ');
  await expect(mocks.options.mutationFn('social')).rejects.toThrow('already exists');
  expect(mocks.create).not.toHaveBeenCalled();
});

it('encrypts the trimmed name and creates a distinct folder', async () => {
  await mocks.options.mutationFn(' Work ');
  expect(mocks.encrypt).toHaveBeenCalledWith('key', 'Work');
  expect(mocks.create).toHaveBeenCalledWith('encrypted', 'fingerprint');
});

it('does not create a folder when validation cannot reach the server', async () => {
  mocks.list.mockRejectedValue(new Error('offline'));
  await expect(mocks.options.mutationFn('Work')).rejects.toThrow('offline');
  expect(mocks.create).not.toHaveBeenCalled();
});

it('rejects empty folder names before making requests', async () => {
  await expect(mocks.options.mutationFn('   ')).rejects.toThrow('Enter a folder name');
  expect(mocks.list).not.toHaveBeenCalled();
});

it('keeps deletion pending until folders and item locations are refreshed', async () => {
  useDeleteFolder();
  await mocks.options.mutationFn('duplicate-id');
  expect(mocks.remove).toHaveBeenCalledWith('duplicate-id');
  let release!: () => void;
  // Both invalidations must participate in the returned promise.
  const pending = new Promise<void>(resolve => { release = resolve; });
  mocks.invalidate.mockReturnValue(pending);
  const refreshed = vi.fn();
  const completion = mocks.options.onSuccess().then(refreshed);
  await Promise.resolve();
  expect(refreshed).not.toHaveBeenCalled();
  expect(mocks.invalidate.mock.calls).toEqual([[{ queryKey: ['vault', 'folders'] }], [{ queryKey: ['vault', 'items'] }]]);
  release();
  await completion;
  expect(refreshed).toHaveBeenCalledOnce();
});


it('allows keeping the same name when renaming the current folder', async () => {
  mocks.list.mockResolvedValue([{ id: 'existing', encryptedName: 'ciphertext', nameFingerprint: 'fingerprint' }]);
  mocks.decrypt.mockResolvedValue('Social');
  useRenameFolder();
  await mocks.options.mutationFn({ id: 'existing', name: ' Social ' });
  expect(mocks.rename).toHaveBeenCalledWith('existing', 'encrypted', 'fingerprint');
});

it('blocks renaming into another folder name', async () => {
  mocks.list.mockResolvedValue([{ id: 'other', encryptedName: 'ciphertext', nameFingerprint: 'fingerprint' }]);
  mocks.decrypt.mockResolvedValue('Social');
  useRenameFolder();
  await expect(mocks.options.mutationFn({ id: 'existing', name: 'social' })).rejects.toThrow('already exists');
  expect(mocks.rename).not.toHaveBeenCalled();
});

it('allows a private folder to use the same name as an incoming shared folder', async () => {
  mocks.list.mockResolvedValue([{ id: 'shared', encryptedName: 'ciphertext', wrappedKey: null, isOwner: false }]);
  // An unreadable incoming folder also must not reserve a name in the personal vault.
  await mocks.options.mutationFn('Unreadable folder');
  expect(mocks.create).toHaveBeenCalled();
});
