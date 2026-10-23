import { type Permission } from '@/api/sharing/types';
import { type VaultItem } from '@/api/vault/types';

/**
 * The plaintext inside Secret.encryptedData. Common fields are top-level (stable across types);
 * type-specific fields from secretTemplates.ts live in `fields`. Old items may lack any field.
 */
export type SecretPayload = {
  name: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  fields?: Record<string, string>;
};

export type DecryptedItem = VaultItem & { data: SecretPayload; decryptFailed: boolean };

export type DecryptedFolder = { id: string; name: string };

export const PERMISSION_LABELS: Record<Permission, string> = {
  LOGIN_ONLY: 'Login only',
  VIEW: 'View',
  MODIFY: 'Edit',
  MANAGE: 'Manage',
};

/** Plain-language explanations shown when sharing (Meera/Arjun need to know exactly what they grant). */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  LOGIN_ONLY: 'Can use it to sign in, but the password stays hidden in Vaultessa.',
  VIEW: 'Can see and copy every field.',
  MODIFY: 'Can view and update the item.',
  MANAGE: 'Can edit it and decide who else has access.',
};

const RANK: Record<Permission, number> = { LOGIN_ONLY: 0, VIEW: 1, MODIFY: 2, MANAGE: 3 };

export function can(item: Pick<VaultItem, 'permission'>, required: Permission) {
  return RANK[item.permission] >= RANK[required];
}

/** Only http(s) links are rendered as clickable — blocks javascript: and data: URLs. */
export function safeHref(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.includes('://') ? url : `https://${url}`);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** "Updated 3 days ago" style relative time. */
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(-Math.round(seconds / size), unit);
  }
  return 'just now';
}
