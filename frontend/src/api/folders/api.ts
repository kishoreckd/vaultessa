import { apiFetch } from '../client';
import type { Folder } from './types';

export const foldersApi = {
  list: () => apiFetch<Folder[]>('/folders'),
  create: (encryptedName: string, nameFingerprint: string) =>
    apiFetch<Folder>('/folders', { method: 'POST', body: { encryptedName, nameFingerprint } }),
  rename: (id: string, encryptedName: string, nameFingerprint: string) =>
    apiFetch<Folder>(`/folders/${id}`, {
      method: 'PUT',
      body: { encryptedName, nameFingerprint },
    }),
  registerFingerprints: (folders: { id: string; nameFingerprint: string }[]) =>
    apiFetch<void>('/folders/fingerprints', { method: 'POST', body: { folders } }),
  remove: (id: string) => apiFetch<void>(`/folders/${id}`, { method: 'DELETE' }),
};
