import { estimateStrength, type Strength } from '../../lib/crypto';
import { can, type DecryptedItem } from '../vault/vaultTypes';

// Computed entirely client-side from decrypted data — nothing about password quality reaches the server.

export type HealthIssue = 'weak' | 'reused' | 'old';

export type ItemHealth = {
  item: DecryptedItem;
  strength: Strength;
  issues: HealthIssue[];
  /** how many items (including this one) share the same password */
  reusedCount: number;
};

export type HealthReport = {
  /** 0–100: share of checked items with no issues */
  score: number;
  checked: number;
  weak: ItemHealth[];
  reused: ItemHealth[];
  old: ItemHealth[];
  byId: Map<string, ItemHealth>;
};

export const OLD_AFTER_DAYS = 365;
const DAY_MS = 86_400_000;

export function analyzeHealth(items: DecryptedItem[], now = Date.now()): HealthReport {
  // Login-only shares are excluded: their passwords are intentionally hidden from the recipient.
  const candidates = items.filter((i) => !i.decryptFailed && i.data.password && can(i, 'VIEW'));

  const counts = new Map<string, number>();
  for (const item of candidates) counts.set(item.data.password!, (counts.get(item.data.password!) ?? 0) + 1);

  const byId = new Map<string, ItemHealth>();
  for (const item of candidates) {
    const strength = estimateStrength(item.data.password!);
    const reusedCount = counts.get(item.data.password!) ?? 1;
    const issues: HealthIssue[] = [];
    if (strength.score < 2) issues.push('weak');
    if (reusedCount > 1) issues.push('reused');
    // Approximation: we track when the item last changed, not the password specifically.
    if (now - new Date(item.updatedAt).getTime() > OLD_AFTER_DAYS * DAY_MS) issues.push('old');
    byId.set(item.id, { item, strength, issues, reusedCount });
  }

  const all = [...byId.values()];
  const healthy = all.filter((h) => h.issues.length === 0).length;
  return {
    score: all.length ? Math.round((healthy / all.length) * 100) : 100,
    checked: all.length,
    weak: all.filter((h) => h.issues.includes('weak')),
    reused: all.filter((h) => h.issues.includes('reused')).sort((a, b) => b.reusedCount - a.reusedCount),
    old: all.filter((h) => h.issues.includes('old')),
    byId,
  };
}

export const ISSUE_COPY: Record<HealthIssue, { label: string; advice: string }> = {
  weak: { label: 'Weak password', advice: 'Easy to guess. Replace it with a generated password.' },
  reused: { label: 'Reused password', advice: 'If one site leaks, every site using it is exposed.' },
  old: { label: 'Not changed in over a year', advice: 'Consider rotating important passwords.' },
};
