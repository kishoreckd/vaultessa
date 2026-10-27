import { estimateStrength, type Strength } from '../../lib/crypto';
import { can, type DecryptedItem } from '../vault/vaultTypes';
import type { BreachResult } from './breachCheck';

// Computed entirely client-side from decrypted data — nothing about password quality reaches the server.

export type HealthIssue = 'breached' | 'weak' | 'reused' | 'old';

export type ItemHealth = {
  item: DecryptedItem;
  strength: Strength;
  issues: HealthIssue[];
  /** how many items (including this one) share the same password */
  reusedCount: number;
  breachCount: number | null;
};

export type HealthReport = {
  /** 0–100: share of checked items with no issues */
  score: number;
  checked: number;
  weak: ItemHealth[];
  reused: ItemHealth[];
  old: ItemHealth[];
  attention: ItemHealth[];
  breached: ItemHealth[];
  breachChecked: number;
  byId: Map<string, ItemHealth>;
};

export const OLD_AFTER_DAYS = 365;
const DAY_MS = 86_400_000;

export function analyzeHealth(
  items: DecryptedItem[], now = Date.now(), breaches: Map<string, BreachResult> = new Map(),
): HealthReport {
  // Login-only shares are excluded: their passwords are intentionally hidden from the recipient.
  const candidates = items.filter((i) => !i.decryptFailed && i.data.password && can(i, 'VIEW'));

  const counts = new Map<string, number>();
  for (const item of candidates) counts.set(item.data.password!, (counts.get(item.data.password!) ?? 0) + 1);

  const byId = new Map<string, ItemHealth>();
  const strengthByPassword = new Map<string, Strength>();
  for (const item of candidates) {
    const password = item.data.password!;
    const strength = strengthByPassword.get(password) ?? estimateStrength(password);
    strengthByPassword.set(password, strength);
    const reusedCount = counts.get(item.data.password!) ?? 1;
    const issues: HealthIssue[] = [];
    const found = breaches.get(item.id);
    const breachCount = found?.password === password ? found.count : null;
    if (breachCount !== null && breachCount > 0) issues.push('breached');
    if (strength.score < 2) issues.push('weak');
    if (reusedCount > 1) issues.push('reused');
    byId.set(item.id, { item, strength, issues, reusedCount, breachCount });
  }

  const all = [...byId.values()];
  const healthy = all.filter((h) => h.issues.length === 0).length;
  return {
    score: all.length ? Math.round((healthy / all.length) * 100) : 100,
    checked: all.length,
    breached: all.filter((h) => h.issues.includes('breached')),
    breachChecked: all.filter((h) => h.breachCount !== null).length,
    weak: all.filter((h) => h.issues.includes('weak')),
    reused: all.filter((h) => h.issues.includes('reused')).sort((a, b) => b.reusedCount - a.reusedCount),
    // Item age is informational: it is not a password-change timestamp or a risk finding.
    old: all.filter((h) => now - new Date(h.item.updatedAt).getTime() > OLD_AFTER_DAYS * DAY_MS),
    attention: all.filter((h) => h.issues.length > 0).sort((a, b) =>
      Number(b.issues.includes('breached')) - Number(a.issues.includes('breached')) ||
      b.issues.length - a.issues.length || b.reusedCount - a.reusedCount || a.strength.score - b.strength.score),
    byId,
  };
}

export const ISSUE_COPY: Record<HealthIssue, { label: string; advice: string }> = {
  breached: { label: 'Exposed password', advice: 'This password appears in known breach data. Replace it on its website and anywhere else you reused it. This does not prove this particular account was breached.' },
  weak: { label: 'Weak password', advice: 'Easy to guess. Replace it with a generated password.' },
  reused: { label: 'Reused password', advice: 'If one site leaks, every site using it is exposed.' },
  old: { label: 'Item not updated in over a year', advice: 'For your information only. Item age does not affect the score and does not tell us when its password changed. Change passwords when weak, reused or exposed, rather than solely because of age.' },
};
