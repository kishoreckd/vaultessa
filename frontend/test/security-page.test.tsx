import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadStrengthEstimator } from '../src/lib/crypto/strength';
import type { DecryptedItem } from '../src/features/vault/vaultTypes';

const state = vi.hoisted(() => ({ items: [] as DecryptedItem[] }));
vi.mock('../src/hooks/useStrengthEstimator', () => ({ useStrengthEstimator: () => ({ data: true }) }));
vi.mock('../src/features/vault/hooks', () => ({
  useVaultItems: () => ({ data: state.items }),
  useFolders: () => ({ data: [] }),
}));
vi.mock('../src/features/vault/SecretEditor', () => ({ SecretEditorDrawer: () => null }));
import { SecurityPage } from '../src/features/security/SecurityPage';

beforeAll(() => loadStrengthEstimator());
beforeEach(() => { state.items = []; });

function entry(password: string): DecryptedItem {
  return {
    id: 'one', type: 'LOGIN', data: { name: 'Example account', password },
    permission: 'MANAGE', isOwner: true, decryptFailed: false,
    updatedAt: new Date().toISOString(), owner: { name: 'Owner' },
  } as DecryptedItem;
}

describe('consolidated password health view', () => {
  it('does not show a perfect score for an empty vault', () => {
    const html = renderToStaticMarkup(<SecurityPage />);
    expect(html).toContain('Add your first login');
    expect(html).not.toContain('100%');
    expect(html).not.toContain('role="meter"');
  });

  it('shows one empty result and one optional leak control without sending passwords', () => {
    const password = 'Xk9#mQ2$vL7@pR4!wN8z';
    state.items = [entry(password)];
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    try {
      const html = renderToStaticMarkup(<SecurityPage />);
      expect(html.match(/No issues detected by these checks/g)).toHaveLength(1);
      expect(html.match(/Check for leaks/g)).toHaveLength(1);
      expect(html).toContain('Not checked yet');
      expect(html).not.toContain(password);
      expect(html).not.toContain('Known breach check');
      expect(fetcher).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it('shows an actionable weak password once, without a contradictory all-clear', () => {
    state.items = [entry('main@123')];
    const html = renderToStaticMarkup(<SecurityPage />);
    expect(html.match(/Example account/g)).toHaveLength(1);
    expect(html).toContain('Weak password');
    expect(html).toContain('Fix next');
    expect(html).not.toContain('No issues detected');
    expect(html).not.toContain('main@123');
  });
});
