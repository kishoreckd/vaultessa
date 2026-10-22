import { SECRET_TYPES, type SecretType } from '@/lib/api/types';
import type { SecretPayload } from '../vault/vaultTypes';

export type ImportItem = { type: SecretType; data: SecretPayload; expiresAt?: string | null };

/** RFC 4180-style parser: quoted commas, escaped quotes and multiline values. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted || value === '') quoted = !quoted;
      else throw new Error('Invalid quote in CSV');
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(value);
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  if (quoted) throw new Error('Unclosed quote in CSV');
  row.push(value);
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

export function csvItems(text: string): ImportItem[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error('The CSV is empty');
  const columns = header.map((name) => name.trim().toLowerCase());
  if (!columns.some((name) => ['password', 'login_password'].includes(name)))
    throw new Error('CSV needs a password column');
  const get = (row: string[], names: string[]) => {
    const index = columns.findIndex((name) => names.includes(name));
    return index < 0 ? '' : (row[index] ?? '');
  };
  return validateImport(
    rows.map((row) => ({
      type: 'LOGIN',
      data: {
        name: get(row, ['name', 'title']) || get(row, ['url', 'website', 'login_uri']) || 'Imported login',
        username: get(row, ['username', 'login_username', 'email']),
        password: get(row, ['password', 'login_password']),
        url: get(row, ['url', 'website', 'login_uri']),
        notes: get(row, ['notes', 'note']),
      },
    })),
  );
}

export function validateImport(value: unknown): ImportItem[] {
  if (!Array.isArray(value) || value.length > 500)
    throw new Error('Choose a file containing up to 500 items');
  return value.map((item) => {
    if (
      !item ||
      !SECRET_TYPES.includes(item.type) ||
      !item.data ||
      typeof item.data !== 'object' ||
      typeof item.data.name !== 'string' ||
      !item.data.name.trim()
    )
      throw new Error('An imported item has an invalid type or name');
    const data: SecretPayload = { name: item.data.name };
    for (const field of ['username', 'password', 'url', 'notes'] as const) {
      if (item.data[field] !== undefined) {
        if (typeof item.data[field] !== 'string' || item.data[field].length > 100000)
          throw new Error('Invalid imported field');
        data[field] = item.data[field];
      }
    }
    if (item.data.fields !== undefined) {
      if (!item.data.fields || Array.isArray(item.data.fields) || typeof item.data.fields !== 'object')
        throw new Error('Invalid custom fields');
      const entries = Object.entries(item.data.fields);
      if (
        entries.length > 100 ||
        entries.some(([key, val]) => key.length > 100 || typeof val !== 'string' || val.length > 100000)
      )
        throw new Error('Invalid custom fields');
      data.fields = Object.fromEntries(entries) as Record<string, string>;
    }
    const expiresAt = item.expiresAt;
    if (expiresAt !== undefined && expiresAt !== null && (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)))) throw new Error('Invalid item expiry');
    return { type: item.type, data, ...(expiresAt !== undefined ? { expiresAt } : {}) };
  });
}
