import { CodeXml, CreditCard, IdCard, KeyRound, Landmark, Server, SquareTerminal, StickyNote, Wifi, type LucideIcon } from 'lucide-react';
import { type SecretType } from '@/api/vault/types';
import { dateError, emailError, portError } from '../../lib/validation';
import type { SecretPayload } from './vaultTypes';

// The single place that defines what each secret type looks like (docs/08-personas-and-ux.md §6).
// Field keys "username", "password", "url" map to top-level payload fields; anything else goes in
// payload.fields so adding a type never needs a backend change.

export type FieldDef = {
  key: string;
  label: string;
  /** masked by default, revealed/copied explicitly */
  secret?: boolean;
  multiline?: boolean;
  /** monospace — keys, numbers, hosts */
  mono?: boolean;
  placeholder?: string;
  /** offer the password generator */
  generate?: boolean;
  /** render as a link in the detail view; also validated (and https:// added) as a web address */
  link?: boolean;
  /** extra check for optional fields with a format; returns an error message or null */
  validate?: (value: string) => string | null;
};

const cardExpiryError = (value: string) =>
  !value.trim() || /^(0[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})$/.test(value.trim()) ? null : 'Use the format MM/YY.';
const optionalEmailError = (value: string) => emailError(value, { optional: true });

export type Template = {
  label: string;
  description: string;
  icon: LucideIcon;
  /** literal Tailwind classes so the compiler keeps them */
  tint: string;
  fields: FieldDef[];
  notesLabel: string;
  subtitle: (data: SecretPayload) => string | undefined;
};

const CORE_KEYS = new Set(['username', 'password', 'url']);
type CoreKey = 'username' | 'password' | 'url';

export function getField(data: SecretPayload, key: string): string | undefined {
  return CORE_KEYS.has(key) ? data[key as CoreKey] : data.fields?.[key];
}

export function setField(data: SecretPayload, key: string, value: string): SecretPayload {
  if (CORE_KEYS.has(key)) return { ...data, [key]: value };
  return { ...data, fields: { ...data.fields, [key]: value } };
}

/** Drops empty values so payloads stay small and change detection is stable. */
export function cleanPayload(data: SecretPayload): SecretPayload {
  const out: SecretPayload = { name: data.name.trim() };
  for (const key of ['username', 'password', 'url', 'notes'] as const) {
    if (data[key]) out[key] = data[key];
  }
  const fields = Object.fromEntries(Object.entries(data.fields ?? {}).filter(([, v]) => v !== ''));
  if (Object.keys(fields).length) out.fields = fields;
  return out;
}

const masked = (value?: string) => (value ? `•••• ${value.replace(/\s/g, '').slice(-4)}` : undefined);
const hostOf = (url?: string) => url?.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

export const TEMPLATES: Record<SecretType, Template> = {
  LOGIN: {
    label: 'Login',
    description: 'Website or app sign-in',
    icon: KeyRound,
    tint: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    notesLabel: 'Notes',
    fields: [
      { key: 'username', label: 'Username or email' },
      { key: 'password', label: 'Password', secret: true, generate: true, mono: true },
      { key: 'url', label: 'Website', placeholder: 'https://example.com', link: true },
    ],
    subtitle: (d) => d.username || hostOf(d.url),
  },
  SECURE_NOTE: {
    label: 'Secure note',
    description: 'Private text: recovery codes, PINs, instructions',
    icon: StickyNote,
    tint: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    notesLabel: 'Note',
    fields: [],
    subtitle: (d) => d.notes?.split('\n')[0]?.slice(0, 60),
  },
  CARD: {
    label: 'Payment card',
    description: 'Credit or debit card',
    icon: CreditCard,
    tint: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    notesLabel: 'Notes',
    fields: [
      { key: 'cardholder', label: 'Name on card' },
      { key: 'number', label: 'Card number', secret: true, mono: true, placeholder: '1234 5678 9012 3456' },
      { key: 'expiry', label: 'Expiry', mono: true, placeholder: 'MM/YY', validate: cardExpiryError },
      { key: 'cvv', label: 'Security code (CVV)', secret: true, mono: true },
      { key: 'pin', label: 'PIN', secret: true, mono: true },
    ],
    subtitle: (d) => masked(d.fields?.number) ?? d.fields?.cardholder,
  },
  IDENTITY: {
    label: 'Identity',
    description: 'Personal details, passport or ID numbers',
    icon: IdCard,
    tint: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    notesLabel: 'Notes',
    fields: [
      { key: 'fullName', label: 'Full name' },
      { key: 'email', label: 'Email', validate: optionalEmailError },
      { key: 'phone', label: 'Phone', mono: true },
      { key: 'address', label: 'Address', multiline: true },
      { key: 'dateOfBirth', label: 'Date of birth', placeholder: 'YYYY-MM-DD', validate: dateError },
      { key: 'idNumber', label: 'Passport / ID number', secret: true, mono: true },
    ],
    subtitle: (d) => d.fields?.fullName ?? d.fields?.email,
  },
  BANK_ACCOUNT: {
    label: 'Bank account',
    description: 'Account numbers and online banking',
    icon: Landmark,
    tint: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
    notesLabel: 'Notes',
    fields: [
      { key: 'bankName', label: 'Bank' },
      { key: 'accountHolder', label: 'Account holder' },
      { key: 'accountNumber', label: 'Account number', secret: true, mono: true },
      { key: 'routing', label: 'IFSC / routing / sort code', mono: true },
      { key: 'swift', label: 'SWIFT / BIC', mono: true },
      { key: 'username', label: 'Online banking user ID' },
      { key: 'password', label: 'Online banking password', secret: true, generate: true, mono: true },
      { key: 'url', label: 'Online banking URL', link: true },
    ],
    subtitle: (d) => [d.fields?.bankName, masked(d.fields?.accountNumber)].filter(Boolean).join(' · ') || undefined,
  },
  SSH_KEY: {
    label: 'SSH key',
    description: 'Key pair for servers and Git hosts',
    icon: SquareTerminal,
    tint: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
    notesLabel: 'Notes',
    fields: [
      { key: 'url', label: 'Host', mono: true, placeholder: 'git@github.com or 10.0.0.12' },
      { key: 'username', label: 'Username', mono: true },
      { key: 'privateKey', label: 'Private key', secret: true, multiline: true, mono: true },
      { key: 'publicKey', label: 'Public key', multiline: true, mono: true },
      { key: 'password', label: 'Key passphrase', secret: true, mono: true },
    ],
    subtitle: (d) => [d.username, d.url].filter(Boolean).join('@') || undefined,
  },
  API_KEY: {
    label: 'API key',
    description: 'Tokens and client secrets for services',
    icon: CodeXml,
    tint: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    notesLabel: 'Notes',
    fields: [
      { key: 'url', label: 'Service / endpoint', placeholder: 'https://api.example.com', link: true },
      { key: 'username', label: 'Key ID / client ID', mono: true },
      { key: 'password', label: 'Secret / token', secret: true, mono: true },
      { key: 'expires', label: 'Expires', placeholder: 'YYYY-MM-DD', validate: dateError },
    ],
    subtitle: (d) => hostOf(d.url) ?? d.username,
  },
  WIFI: {
    label: 'Wi-Fi',
    description: 'Network name and password',
    icon: Wifi,
    tint: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
    notesLabel: 'Notes',
    fields: [
      { key: 'ssid', label: 'Network name (SSID)' },
      { key: 'password', label: 'Password', secret: true, generate: true, mono: true },
      { key: 'security', label: 'Security', placeholder: 'WPA2 / WPA3' },
    ],
    subtitle: (d) => d.fields?.ssid,
  },
  SERVER: {
    label: 'Server',
    description: 'Host, database or admin console',
    icon: Server,
    tint: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    notesLabel: 'Notes',
    fields: [
      { key: 'url', label: 'Host / IP', mono: true, placeholder: 'db.internal or 10.0.0.12' },
      { key: 'port', label: 'Port', mono: true, placeholder: '22', validate: portError },
      { key: 'username', label: 'Username', mono: true },
      { key: 'password', label: 'Password', secret: true, generate: true, mono: true },
    ],
    subtitle: (d) => [d.username, [d.url, d.fields?.port].filter(Boolean).join(':')].filter(Boolean).join('@') || undefined,
  },
};
