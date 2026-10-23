import { apiFetch } from '../client';
import type { AuditListResponse } from './types';

export const auditApi = {
  list: (cursor?: string, linkId?: string) =>
    apiFetch<AuditListResponse>(
      `/audit?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${linkId ? `&linkId=${encodeURIComponent(linkId)}` : ''}`,
    ),
};
