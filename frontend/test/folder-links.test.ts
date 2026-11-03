import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  buildFolderSnapshot,
  useCreateFolderShareLink,
  useReopenShareLink,
  type SharedSnapshot,
} from '../src/features/shares/hooks';
import { decryptJson, generateAesKeyBytes, importAesKey, openSend } from '../src/lib/crypto';
import type { DecryptedItem, DecryptedFolder } from '../src/features/vault/vaultTypes';
import type {
  ExternalShare,
  ExternalSharesCreateRequest,
  ExternalSharesReopenRequest,
} from '../src/api/sharing/types';
import { memberExpiry } from '../src/features/vault/FolderExpirySelect';

const state = vi.hoisted(() => ({
  vaultKey: undefined as CryptoKey | undefined,
  create: vi.fn(),
  reopen: vi.fn(),
  options: {} as { mutationFn: (input: never) => Promise<unknown> },
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useMutation: (options: typeof state.options) => {
    state.options = options;
    return {};
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('../src/stores/session', () => ({ requireKeys: () => ({ vaultKey: state.vaultKey }) }));
vi.mock('../src/api/sharing/api', () => ({
  externalSharesApi: { create: state.create, reopen: state.reopen },
}));
const folder: DecryptedFolder = { id: 'folder', name: 'Work', isOwner: true };
function item(id: string): DecryptedItem {
  return {
    id,
    type: 'LOGIN',
    encryptedData: '',
    revision: 0,
    ownerId: 'owner',
    owner: { id: 'owner', name: 'Owner', email: 'owner@example.com' },
    isOwner: true,
    wrappedKey: '',
    keyWrap: 'VAULT',
    permission: 'MANAGE',
    folderId: 'folder',
    favorite: false,
    inheritedFolderId: null,
    sharedFolderIds: [],
    sharedWith: 0,
    organizationId: null,
    expiresAt: null,
    createdAt: '2026-11-03T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
    data: { name: `Account ${id}`, username: `${id}@example.com`, password: `private-secret-${id}` },
    decryptFailed: false,
  };
}
const share: ExternalShare = {
  id: 'link',
  folderId: 'folder',
  kind: 'folder',
  secretId: null,
  status: 'active',
  hasCode: true,
  maxViews: 1,
  viewCount: 0,
  expiresAt: '2026-11-04T00:00:00Z',
  recipientEmail: null,
  outsideDomain: false,
  ownerKey: null,
  createdAt: '2026-11-03T00:00:00Z',
  lastViewedAt: null,
  emailed: false,
};
beforeEach(async () => {
  vi.clearAllMocks();
  state.vaultKey = await importAesKey(generateAesKeyBytes());
  vi.stubGlobal('window', { location: { origin: 'https://vaultessa.test' } });
});
afterEach(() => vi.unstubAllGlobals());

it('builds a frozen snapshot with all fields from the selected owned items', () => {
  const first = item('one');
  const snapshot = buildFolderSnapshot(folder, [first, item('two')], 'Owner');
  first.data.password = 'changed later';
  expect(snapshot.items).toHaveLength(2);
  expect(snapshot.items?.[0]?.fields.some((field) => field.value === 'private-secret-one')).toBe(true);
  expect(snapshot.fields).toEqual([]);
  expect(() => buildFolderSnapshot(folder, [{ ...first, isOwner: false }], 'Owner')).toThrow('you own');
  expect(() => buildFolderSnapshot(folder, [{ ...first, decryptFailed: true }], 'Owner')).toThrow();
  expect(() => buildFolderSnapshot(folder, [{ ...first, folderId: 'other' }], 'Owner')).toThrow();
  expect(() => buildFolderSnapshot(folder, [], 'Owner')).toThrow();
  expect(() =>
    buildFolderSnapshot(folder, [{ ...first, data: { name: 'Huge', notes: 'x'.repeat(650_001) } }], 'Owner'),
  ).toThrow('too large');
});

it('encrypts folder links and reopens the same token with the original snapshot', async () => {
  let createdBody: ExternalSharesCreateRequest | undefined;
  state.create.mockImplementation(async (body) => {
    createdBody = body;
    return { ...share, ownerKey: body.ownerKey };
  });
  useCreateFolderShareLink();
  // Hook capture preserves the actual crypto/API implementation; only transport and React lifecycle are mocked.
  const input = {
    folder,
    items: [item('one')],
    sharedBy: 'Owner',
    accessCode: 'ABCD-EFGH',
    timing: { expiresAt: new Date(Date.now() + 86_400_000), maxViews: 1 },
  };
  const result = await (
    state.options.mutationFn as unknown as (
      value: typeof input,
    ) => Promise<{ share: ExternalShare; link: string }>
  )(input);
  if (!createdBody?.ownerKey) throw new Error('No encrypted owner material');
  expect(createdBody.folderId).toBe('folder');
  expect(createdBody.secretIds).toEqual(['one']);
  expect(createdBody.secretId).toBeUndefined();
  expect(JSON.stringify(createdBody)).not.toContain('private-secret-one');
  const owner = await decryptJson<{ linkKey: string; snapshot: SharedSnapshot }>(
    state.vaultKey!,
    createdBody.ownerKey,
  );
  const opened = await openSend<SharedSnapshot>(
    createdBody.encryptedData,
    owner.linkKey,
    'ABCD-EFGH',
    createdBody.codeSalt,
  );
  expect(opened).toEqual(owner.snapshot);
  await expect(
    openSend(createdBody.encryptedData, owner.linkKey, 'WRONG-CODE', createdBody.codeSalt),
  ).rejects.toThrow();
  let reopenBody: ExternalSharesReopenRequest | undefined;
  state.reopen.mockImplementation(async (_id, body) => {
    reopenBody = body;
    return share;
  });
  useReopenShareLink();
  const reopenInput = {
    link: { ...result.share, status: 'revoked' as const },
    sharedBy: 'Owner',
    timing: input.timing,
  };
  const reopened = await (
    state.options.mutationFn as unknown as (value: typeof reopenInput) => Promise<{ link: string }>
  )(reopenInput);
  expect(reopened.link).toBe(result.link);
  if (!reopenBody) throw new Error('Missing reopen payload');
  expect(await openSend(reopenBody.encryptedData, owner.linkKey, 'ABCD-EFGH', reopenBody.codeSalt)).toEqual(
    opened,
  );
});

it('calculates membership expiry at the moment access is granted', () => {
  const now = Date.now();
  expect(memberExpiry('none')).toBeNull();
  const expiry = Date.parse(memberExpiry('24h')!);
  expect(expiry).toBeGreaterThanOrEqual(now + 86_400_000);
  expect(expiry).toBeLessThan(now + 86_401_000);
});
