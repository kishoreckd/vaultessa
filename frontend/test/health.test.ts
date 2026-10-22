import { describe, expect, it } from 'vitest';
import type { Permission } from '../src/lib/api/types';
import { analyzeHealth } from '../src/features/security/passwordHealth';
import { cleanPayload, getField, setField, TEMPLATES } from '../src/features/vault/secretTemplates';
import type { DecryptedItem } from '../src/features/vault/vaultTypes';

const NOW = Date.parse('2026-10-20T00:00:00Z');

function item(id: string, password: string | undefined, opts: { updatedAt?: string; permission?: Permission } = {}) {
  return {
    id,
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
    expect(report.score).toBe(20); // only "strong" is healthy
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
