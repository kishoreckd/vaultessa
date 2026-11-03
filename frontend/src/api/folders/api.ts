import { apiFetch } from '../client';
import type { Folder, FolderMember } from './types';

export const foldersApi = {
  enableSharing: (
    id: string,
    body: { wrappedKey: string; sharedName: string; items: { secretId: string; wrappedKey: string }[] },
  ) => apiFetch<void>(`/folders/${id}/sharing`, { method: 'POST', body }),
  members: (id: string) => apiFetch<FolderMember[]>(`/folders/${id}/members`),
  grant: (
    id: string,
    body: { userId: string; permission: 'VIEW' | 'MODIFY'; wrappedKey: string; expiresAt?: string | null },
  ) => apiFetch<void>(`/folders/${id}/members`, { method: 'POST', body }),
  permission: (id: string, userId: string, permission: 'VIEW' | 'MODIFY') =>
    apiFetch<void>(`/folders/${id}/members/${userId}`, { method: 'PATCH', body: { permission } }),
  expiry: (id: string, userId: string, expiresAt: string | null) =>
    apiFetch<void>(`/folders/${id}/members/${userId}`, { method: 'PATCH', body: { expiresAt } }),
  revoke: (id: string, userId: string) =>
    apiFetch<void>(`/folders/${id}/members/${userId}`, { method: 'DELETE' }),
  list: () => apiFetch<Folder[]>('/folders'),
  create: (encryptedName: string, nameFingerprint: string) =>
    apiFetch<Folder>('/folders', { method: 'POST', body: { encryptedName, nameFingerprint } }),
  rename: (id: string, encryptedName: string, nameFingerprint: string, sharedName?: string) =>
    apiFetch<Folder>(`/folders/${id}`, {
      method: 'PUT',
      body: { encryptedName, nameFingerprint, sharedName },
    }),
  registerFingerprints: (folders: { id: string; nameFingerprint: string }[]) =>
    apiFetch<void>('/folders/fingerprints', { method: 'POST', body: { folders } }),
  remove: (id: string) => apiFetch<void>(`/folders/${id}`, { method: 'DELETE' }),
};
