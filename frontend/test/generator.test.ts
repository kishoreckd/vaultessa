import { loadStrengthEstimator } from '../src/lib/crypto/strength';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_GENERATOR_OPTIONS, estimateStrength, generatePassword, randomInt } from '../src/lib/crypto';
import { safeHref } from '../src/features/vault/vaultTypes';

beforeAll(() => loadStrengthEstimator());

describe('password generator', () => {
  it('respects length and includes every selected character class', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword({ ...DEFAULT_GENERATOR_OPTIONS, length: 16 });
      expect(pw).toHaveLength(16);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/\d/);
      expect(pw).toMatch(/[^a-zA-Z0-9]/);
    }
  });

  it('only uses selected sets and can avoid ambiguous characters', () => {
    const pw = generatePassword({
      length: 200,
      lowercase: false,
      uppercase: true,
      digits: true,
      symbols: false,
      avoidAmbiguous: true,
    });
    expect(pw).toMatch(/^[A-Z2-9]+$/);
    expect(pw).not.toMatch(/[IO01]/);
  });

  it('throws when no character set is selected', () => {
    expect(() =>
      generatePassword({ ...DEFAULT_GENERATOR_OPTIONS, lowercase: false, uppercase: false, digits: false, symbols: false }),
    ).toThrow();
  });

  it('randomInt stays in range and covers it', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const n = randomInt(10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
      seen.add(n);
    }
    expect(seen.size).toBe(10);
  });
});

describe('strength estimate', () => {
  it('orders obvious cases', () => {
    expect(estimateStrength('password1').score).toBeLessThanOrEqual(1);
    expect(estimateStrength(generatePassword(DEFAULT_GENERATOR_OPTIONS)).score).toBe(4);
  });
});

describe('safeHref', () => {
  it('allows http(s) and bare hosts, blocks script URLs', () => {
    expect(safeHref('example.com')).toBe('https://example.com/');
    expect(safeHref('http://intranet.local/login')).toBe('http://intranet.local/login');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,hi')).toBeNull();
  });
});
