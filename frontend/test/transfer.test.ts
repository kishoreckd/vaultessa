import { describe, expect, it } from 'vitest';
import { csvItems, parseCsv, validateImport } from '../src/features/settings/transfer';
import { encryptBackup, decryptBackup } from '../src/lib/crypto/backup';

describe('vault transfer', () => {
  it('parses quoted commas, quotes, multiline notes and BOM', () => {
    const text =
      '\uFEFFname,url,username,password,notes\r\n"Mail, work",https://example.com,user,secret,"line one\nline ""two"""\r\n';
    expect(csvItems(text)[0]?.data).toEqual({
      name: 'Mail, work',
      url: 'https://example.com',
      username: 'user',
      password: 'secret',
      notes: 'line one\nline "two"',
    });
    expect(() => parseCsv('name,password\n"unfinished,x')).toThrow();
  });
  it('rejects malformed imports before creating any items', () => {
    expect(() => validateImport([{ type: 'LOGIN', data: { name: 'Bad', password: 123 } }])).toThrow();
    expect(() => validateImport([{ type: 'UNKNOWN', data: { name: 'Bad' } }])).toThrow();
  });
  it('restores encrypted backups and rejects a wrong password', async () => {
    const items = [{ type: 'LOGIN', data: { name: 'Mail', password: 'fixture-password' } }];
    const backup = await encryptBackup(items, 'long-backup-password');
    expect(JSON.stringify(backup)).not.toContain('fixture-password');
    expect(await decryptBackup(backup, 'long-backup-password')).toEqual(items);
    await expect(decryptBackup(backup, 'wrong-password')).rejects.toThrow();
  });
});
