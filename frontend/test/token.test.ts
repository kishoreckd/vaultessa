import { describe, it, expect } from 'vitest';
import fixture from '../../packages/test-vectors.json';
import {
  deriveTokenKeys,
  decryptBytes,
  decryptJson,
  importAesKey,
  generatePassphrase,
  generatePassword,
  DEFAULT_GENERATOR_OPTIONS,
} from '../src/lib/crypto';

describe('machine token compatibility', () => {
  it('matches Python and Node derivation and decrypts a grant', async () => {
    const { authKey, encryptionKey } = await deriveTokenKeys(fixture.token.split('.')[2]!);
    expect(`pvm.${fixture.row.id}.${authKey}`).toBe(fixture.credential);
    const raw = await decryptBytes(encryptionKey, fixture.row.wrappedKey);
    expect(await decryptJson(await importAesKey(raw), fixture.row.encryptedData)).toEqual(fixture.payload);
    raw.fill(0);
  });
});

describe('expanded generator', () => {
  it('keeps emoji code points intact and honors selected groups', () => {
    const password = generatePassword({
      ...DEFAULT_GENERATOR_OPTIONS,
      length: 24,
      characterGroups: ['🚀😀'],
    });
    expect(Array.from(password)).toHaveLength(24);
    expect(Array.from(password).every((char) => ['🚀', '😀'].includes(char))).toBe(true);
  });
  it('generates the requested word count and rejects unsafe sizes', () => {
    expect(generatePassphrase(8).split('-')).toHaveLength(8);
    expect(generatePassphrase(10, '.').split('.')).toHaveLength(10);
    expect(() => generatePassphrase(0)).toThrow();
    expect(() => generatePassword({ ...DEFAULT_GENERATOR_OPTIONS, length: Infinity })).toThrow();
  });
});
