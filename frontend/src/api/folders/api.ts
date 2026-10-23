import { apiFetch } from '../client';
import type { Folder } from './types';

export const foldersApi = {
  list: () => apiFetch<Folder[]>('/folders'),
  create: (encryptedName: string) =>
    apiFetch<Folder>('/folders', { method: 'POST', body: { encryptedName } }),
  rename: (id: string, encryptedName: string) =>
    apiFetch<Folder>(`/folders/${id}`, {
      method: 'PUT',
      body: { encryptedName },
    }),
  remove: (id: string) => apiFetch<void>(`/folders/${id}`, { method: 'DELETE' }),
};
