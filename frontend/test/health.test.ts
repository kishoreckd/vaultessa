import { loadStrengthEstimator } from '../src/lib/crypto/strength';
import { estimateStrength } from '../src/lib/crypto/strength';
import { beforeAll, describe, expect, it } from 'vitest';
import { type Permission } from '../src/api/sharing/types';
import { analyzeHealth } from '../src/features/security/passwordHealth';
import { cleanPayload, getField, setField, TEMPLATES } from '../src/features/vault/secretTemplates';
import type { DecryptedItem } from '../src/features/vault/vaultTypes';

beforeAll(() => loadStrengthEstimator());

const NOW = Date.parse('2026-10-20T00:00:00Z');

function item(
  id: string,
  password: string | undefined,
  opts: { updatedAt?: string; permission?: Permission } = {},
) {
  return {
    id,
    organizationId: null,
    expiresAt: null,
    type: 'LOGIN',
    encryptedData: '',
    revision: 0,
    ownerId: 'o',
    owner: { id: 'o', name: 'Owner', email: 'o@example.com' },
    isOwner: true,
    sharedWith: 0,
    wrappedKey: '',
    keyWrap: 'VAULT',
    permission: opts.permission ?? 'MANAGE',
    folderId: null,
    favorite: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: opts.updatedAt ?? '2026-10-01T00:00:00Z',
    data: { name: id, password },
    decryptFailed: false,
  } satisfies DecryptedItem;
}

describe('password health', () => {
  it('prioritizes known exposure and rejects breach results for changed passwords', () => {
    const strong = 'Xk9#mQ2$vL7@pR4!wN8z';
    const entries = [item('exposed', strong), item('weak', 'main@123')];
    const results = new Map([['exposed', { password: strong, count: 42 }]]);
    const report = analyzeHealth(entries, NOW, results);
    expect(report.breached).toHaveLength(1);
    expect(report.breachChecked).toBe(1);
    expect(report.attention[0]!.item.id).toBe('exposed');
    expect(report.score).toBe(0);
    const updated = analyzeHealth([item('exposed', 'Zt5^bH1*eY6&uJ3(kD0q')], NOW, results);
    expect(updated.breached).toHaveLength(0);
    expect(updated.breachChecked).toBe(0);
    expect(updated.score).toBe(100);
  });

  it('does not treat failed breach checks as a completed clear result', () => {
    const password = 'Xk9#mQ2$vL7@pR4!wN8z';
    const report = analyzeHealth([item('one', password)], NOW, new Map([['one', { password, count: null }]]));
    expect(report.breachChecked).toBe(0);
    expect(report.breached).toHaveLength(0);
  });
  it.each(['qwertyuiop', 'p@ssw0rd!', 'aaaaaaaaaaaa', '1234567890'])(
    'recognizes dictionary and predictable patterns: %s',
    (password) => expect(estimateStrength(password).score).toBeLessThan(2),
  );
  it.each(['welcome@123', 'main@123', 'kishore@994079', 'Kishore@994079!', '994079@Kishore']) (
    'flags a predictable word/name and number pattern: %s',
    (password) => {
      const report = analyzeHealth([item('predictable', password)], NOW);
      expect(report.weak).toHaveLength(1);
      expect(report.byId.get('predictable')!.strength.score).toBeLessThan(2);
      expect(report.score).toBe(0);
    },
  );

  it('flags weak, reused and old passwords and scores the rest', () => {
    const report = analyzeHealth(
      [
        item('strong', 'Xk9#mQ2$vL7@pR4!wN8z'),
        item('weak', 'password1'),
        item('reuse-a', 'Shared-Passw0rd-2026!'),
        item('reuse-b', 'Shared-Passw0rd-2026!'),
        item('old', 'Zt5^bH1*eY6&uJ3(kD0q', { updatedAt: '2024-01-01T00:00:00Z' }),
        item('no-password', undefined),
      ],
      NOW,
    );
    expect(report.checked).toBe(5);
    expect(report.weak.map((h) => h.item.id)).toEqual(['weak']);
    expect(report.reused.map((h) => h.item.id).sort()).toEqual(['reuse-a', 'reuse-b']);
    expect(report.reused[0]!.reusedCount).toBe(2);
    expect(report.old.map((h) => h.item.id)).toEqual(['old']);
    expect(report.score).toBe(40); // strong and old-but-strong both pass
    expect(report.attention).toHaveLength(3);
    expect(report.byId.get('old')!.issues).toEqual([]);
  });

  it('does not penalize a strong unique password for item age or expiry', () => {
    const entry = item('old', 'Zt5^bH1*eY6&uJ3(kD0q', { updatedAt: '2024-01-01T00:00:00Z' });
    const report = analyzeHealth([{ ...entry, expiresAt: '2025-01-01T00:00:00Z' }], NOW);
    expect(report.score).toBe(100);
    expect(report.attention).toHaveLength(0);
    expect(report.old).toHaveLength(1);
  });

  it('counts overlapping weaknesses once and prioritizes weak reused passwords', () => {
    const report = analyzeHealth([
      item('good', 'Xk9#mQ2$vL7@pR4!wN8z'), item('weak-a', 'password1'), item('weak-b', 'password1'),
    ], NOW);
    expect(report.score).toBe(33);
    expect(report.attention).toHaveLength(2);
    expect(report.attention[0]!.issues).toEqual(['weak', 'reused']);
  });

  it('ignores login-only shares and is 100 when nothing to check', () => {
    expect(analyzeHealth([item('hidden', 'password1', { permission: 'LOGIN_ONLY' })], NOW)).toMatchObject({
      checked: 0,
      score: 100,
    });
  });
});

describe('secret templates', () => {
  it('maps core and custom fields and cleans empties', () => {
    let data = setField({ name: ' Visa ' }, 'number', '4111 1111 1111 1234');
    data = setField(data, 'username', '');
    data = setField(data, 'cvv', '');
    expect(getField(data, 'number')).toBe('4111 1111 1111 1234');
    expect(cleanPayload(data)).toEqual({ name: 'Visa', fields: { number: '4111 1111 1111 1234' } });
    expect(TEMPLATES.CARD.subtitle(cleanPayload(data))).toBe('•••• 1234');
  });

  it('every template field key is unique within its type', () => {
    for (const template of Object.values(TEMPLATES)) {
      const keys = template.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
