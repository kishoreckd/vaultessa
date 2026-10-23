import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { foldersApi } from '@/api/folders/api';
import { secretsApi } from '@/api/vault/api';
import { sharingApi } from '@/api/sharing/api';
import { type Permission } from '@/api/sharing/types';
import { type SecretType } from '@/api/vault/types';
import { decryptJson, decryptString, encryptString } from '../../lib/crypto';
import { requireKeys } from '../../stores/session';
import {
  decryptItem,
  encryptExisting,
  encryptNewSecret,
  rewrapForVault,
  withSecretKey,
  wrapForRecipient,
} from './vaultCrypto';
import type { DecryptedFolder, DecryptedItem, SecretPayload } from './vaultTypes';

export const vaultKeys = {
  items: ['vault', 'items'] as const,
  folders: ['vault', 'folders'] as const,
  shares: (id: string) => ['vault', 'shares', id] as const,
  history: (id: string) => ['vault', 'history', id] as const,
};

export function useVaultItems() {
  return useQuery({
    queryKey: vaultKeys.items,
    queryFn: async () => Promise.all((await secretsApi.list()).map(decryptItem)),
  });
}

export function useFolders() {
  return useQuery({
    queryKey: vaultKeys.folders,
    queryFn: async (): Promise<DecryptedFolder[]> => {
      const { vaultKey } = requireKeys();
      const folders = await foldersApi.list();
      return Promise.all(
        folders.map(async (f) => ({
          id: f.id,
          name: await decryptString(vaultKey, f.encryptedName).catch(() => 'Unreadable folder'),
        })),
      );
    },
  });
}

type SaveInput = {
  existing?: DecryptedItem;
  type: SecretType;
  data: SecretPayload;
  folderId: string | null;
  expiresAt?: string | null;
};

export function useSaveSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ existing, type, data, folderId, expiresAt }: SaveInput) => {
      if (!existing) {
        return secretsApi.create({
          type,
          folderId,
          expiresAt,
          ...(await encryptNewSecret(data)),
        });
      }
      let item = existing as DecryptedItem | Awaited<ReturnType<typeof secretsApi.update>>;
      if (
        JSON.stringify(existing.data) !== JSON.stringify(data) ||
        (expiresAt !== undefined && expiresAt !== (existing.expiresAt ?? null))
      ) {
        const encryptedData = await encryptExisting(existing, data);
        item = await secretsApi.update(existing.id, {
          encryptedData,
          revision: existing.revision,
          expiresAt,
        });
      }
      if (folderId !== existing.folderId) item = await secretsApi.updateAccess(existing.id, { folderId });
      return item;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: vaultKeys.items }),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: DecryptedItem) => secretsApi.updateAccess(item.id, { favorite: !item.favorite }),
    onSuccess: () => qc.invalidateQueries({ queryKey: vaultKeys.items }),
  });
}

export function useDeleteSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => secretsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: vaultKeys.items }),
  });
}

/** Recipient removes a secret someone shared with them. */
export function useLeaveShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ secretId, userId }: { secretId: string; userId: string }) =>
      sharingApi.revoke(secretId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: vaultKeys.items }),
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => foldersApi.create(await encryptString(requireKeys().vaultKey, name)),
    onSuccess: () => qc.invalidateQueries({ queryKey: vaultKeys.folders }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => foldersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vaultKeys.folders });
      qc.invalidateQueries({ queryKey: vaultKeys.items });
    },
  });
}

/** Silently accepts incoming RSA shares by re-wrapping them with the vault key. */
export function useAcceptPendingShares(items: DecryptedItem[] | undefined) {
  const qc = useQueryClient();
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    const pending = (items ?? []).filter(
      (i) => i.keyWrap === 'RSA' && !i.decryptFailed && !attempted.current.has(i.id),
    );
    if (pending.length === 0) return;
    pending.forEach((i) => attempted.current.add(i.id));
    void Promise.allSettled(
      pending.map(async (i) => secretsApi.updateAccess(i.id, { wrappedKey: await rewrapForVault(i) })),
    ).then(() => qc.invalidateQueries({ queryKey: vaultKeys.items }));
  }, [items, qc]);
}

export function useHistory(item: DecryptedItem, enabled: boolean) {
  return useQuery({
    queryKey: vaultKeys.history(item.id),
    enabled,
    queryFn: async () => {
      const entries = await secretsApi.history(item.id);
      return withSecretKey(item, (key) =>
        Promise.all(
          entries.map(async (e) => ({
            ...e,
            data: await decryptJson<SecretPayload>(key, e.encryptedData).catch(() => null),
          })),
        ),
      );
    },
  });
}

export function useShares(itemId: string) {
  return useQuery({
    queryKey: vaultKeys.shares(itemId),
    queryFn: () => sharingApi.list(itemId),
  });
}

export function useShareMutations(item: DecryptedItem) {
  const qc = useQueryClient();
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: vaultKeys.shares(item.id) }),
      // the list shows "Shared with N"
      qc.invalidateQueries({ queryKey: vaultKeys.items }),
    ]);

  return {
    grant: useMutation({
      mutationFn: async (input: {
        userId: string;
        publicKey: string;
        permission: Permission;
        organizationId?: string | null;
      }) =>
        sharingApi.grant(item.id, {
          userId: input.userId,
          organizationId: input.organizationId,
          permission: input.permission,
          wrappedKey: await wrapForRecipient(item, input.publicKey),
        }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input: { userId: string; permission: Permission }) =>
        sharingApi.update(item.id, input.userId, input.permission),
      onSuccess: invalidate,
    }),
    revoke: useMutation({
      mutationFn: (userId: string) => sharingApi.revoke(item.id, userId),
      onSuccess: invalidate,
    }),
  };
}
