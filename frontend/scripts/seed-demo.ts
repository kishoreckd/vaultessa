/**
 * Seeds a demo account so every persona flow can be tried immediately (dev only).
 * Uses the real client crypto, so the server only ever receives ciphertext.
 *
 *   npm run seed:demo                       # API at http://127.0.0.1:8010/api
 *   API_URL=http://host:port/api npm run seed:demo
 *
 * Demo logins (DEV ONLY — never use these anywhere real):
 *   demo@vaultessa.dev  / Demo-Vault-2026!
 *   meera@vaultessa.dev / Demo-Vault-2026!
 */
import {
  decryptBytes,
  deriveAuthHash,
  deriveKek,
  deriveMasterKey,
  encryptBytes,
  encryptJson,
  encryptString,
  generateAesKeyBytes,
  generateKdfSalt,
  generateRsaKeyPair,
  importAesKey,
  rsaWrap,
} from '../src/lib/crypto';
import { responseData, type ApiEnvelope } from '../src/lib/api/client';
import type { SecretPayload } from '../src/features/vault/vaultTypes';

// This script runs in Node (via tsx); the app's tsconfig is browser-only, so declare what we use.
declare const process: { env: Record<string, string | undefined>; exit(code?: number): never };

const API = process.env.API_URL ?? 'http://127.0.0.1:8010/api';
const PASSWORD = 'Demo-Vault-2026!';
const ITERATIONS = 600_000;

type Session = { token: string; vaultKey: CryptoKey; userId: string };

async function call<T>(
  path: string,
  body?: unknown,
  token?: string,
  method?: string,
): Promise<{ status: number; json: T }> {
  const res = await fetch(API + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const envelope = text ? JSON.parse(text) : null;
  const json = envelope?.status === 'success' ? responseData(envelope as ApiEnvelope<T>) : envelope;
  return { status: res.status, json: json as T };
}

async function registerOrLogin(name: string, email: string): Promise<Session & { created: boolean }> {
  const kdfSalt = generateKdfSalt();
  const masterKey = await deriveMasterKey(PASSWORD, kdfSalt, ITERATIONS);
  const vaultKeyBytes = generateAesKeyBytes();
  const vaultKey = await importAesKey(vaultKeyBytes);
  const rsa = await generateRsaKeyPair();
  const reg = await call<{ accessToken: string; account: { id: string } }>('/auth/register', {
    email,
    name,
    kdfSalt,
    kdfIterations: ITERATIONS,
    authHash: await deriveAuthHash(masterKey),
    protectedVaultKey: await encryptBytes(await deriveKek(masterKey), vaultKeyBytes),
    publicKey: rsa.publicKey,
    protectedPrivateKey: await encryptBytes(vaultKey, rsa.privateKeyPkcs8),
  });
  if (reg.status === 201)
    return { token: reg.json.accessToken, vaultKey, userId: reg.json.account.id, created: true };
  if (reg.status !== 409)
    throw new Error(`register ${email} failed: ${reg.status} ${JSON.stringify(reg.json)}`);

  const pre = await call<{ kdfSalt: string; kdfIterations: number }>('/auth/prelogin', { email });
  const mk = await deriveMasterKey(PASSWORD, pre.json.kdfSalt, pre.json.kdfIterations);
  const login = await call<{ accessToken: string; account: { id: string; protectedVaultKey: string } }>(
    '/auth/login',
    {
      email,
      authHash: await deriveAuthHash(mk),
    },
  );
  if (login.status !== 200) throw new Error(`login ${email} failed: ${login.status}`);
  const key = await importAesKey(
    await decryptBytes(await deriveKek(mk), login.json.account.protectedVaultKey),
  );
  return { token: login.json.accessToken, vaultKey: key, userId: login.json.account.id, created: false };
}

async function addItem(
  s: Session,
  type: string,
  data: SecretPayload,
  extra: { folderId?: string; favorite?: boolean } = {},
): Promise<{ id: string; keyBytes: Uint8Array<ArrayBuffer> }> {
  const keyBytes = generateAesKeyBytes();
  const res = await call<{ id: string }>(
    '/secrets',
    {
      type,
      encryptedData: await encryptJson(await importAesKey(keyBytes), data),
      wrappedKey: await encryptBytes(s.vaultKey, keyBytes),
      ...extra,
    },
    s.token,
  );
  if (res.status !== 201)
    throw new Error(`create ${data.name} failed: ${res.status} ${JSON.stringify(res.json)}`);
  return { id: res.json.id, keyBytes };
}

async function folder(s: Session, name: string) {
  const res = await call<{ id: string }>(
    '/folders',
    { encryptedName: await encryptString(s.vaultKey, name) },
    s.token,
  );
  return res.json.id;
}

const demo = await registerOrLogin('Priya Sharma', 'demo@vaultessa.dev');
const existing = await call<unknown[]>('/secrets', undefined, demo.token);
if (existing.json.length > 0) {
  console.log(`Demo vault already has ${existing.json.length} items — nothing to do.`);
  process.exit(0);
}

const personal = await folder(demo, 'Personal');
const work = await folder(demo, 'Work');
const reused = 'Summer2024!Shared';

await addItem(
  demo,
  'LOGIN',
  { name: 'GitHub', username: 'priya-dev', password: 'q7#Vt9!mRw2$Lp4@Xz8n', url: 'https://github.com' },
  { folderId: work, favorite: true },
);
await addItem(
  demo,
  'LOGIN',
  { name: 'Gmail', username: 'priya.sharma@gmail.com', password: reused, url: 'https://mail.google.com' },
  { folderId: personal, favorite: true },
);
await addItem(
  demo,
  'LOGIN',
  { name: 'Netflix', username: 'priya.sharma@gmail.com', password: reused, url: 'https://netflix.com' },
  { folderId: personal },
);
await addItem(
  demo,
  'LOGIN',
  {
    name: 'Old photography forum',
    username: 'priya84',
    password: 'password1',
    url: 'http://forum.example.com',
  },
  { folderId: personal },
);
await addItem(
  demo,
  'CARD',
  {
    name: 'HDFC Visa',
    notes: 'Primary card for online shopping',
    fields: { cardholder: 'PRIYA SHARMA', number: '4111 1111 1111 4242', expiry: '09/29', cvv: '123' },
  },
  { folderId: personal },
);
await addItem(
  demo,
  'SECURE_NOTE',
  { name: 'Google recovery codes', notes: '8431-2290\n1176-5532\n9902-4418\n3345-0071' },
  { folderId: personal },
);
await addItem(
  demo,
  'WIFI',
  {
    name: 'Home Wi-Fi',
    password: 'tidy-orbit-lantern-cactus',
    fields: { ssid: 'Sharma-5G', security: 'WPA3' },
  },
  { folderId: personal },
);
await addItem(
  demo,
  'SERVER',
  {
    name: 'Staging database',
    url: 'staging-db.internal',
    username: 'app_rw',
    password: 'vR8$kq2!Lm5#Tz9w',
    fields: { port: '5432' },
  },
  { folderId: work },
);
await addItem(
  demo,
  'SSH_KEY',
  {
    name: 'Deploy key',
    url: 'git@github.com',
    username: 'git',
    fields: {
      privateKey:
        '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n(demo data — not a real key)\n-----END OPENSSH PRIVATE KEY-----',
      publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoOnlyNotARealKey priya@laptop',
    },
  },
  { folderId: work },
);
await addItem(
  demo,
  'API_KEY',
  {
    name: 'Stripe test key',
    url: 'https://api.stripe.com',
    username: 'acct_demo123',
    password: 'sk_test_demo_51HxNotReal',
    fields: { expires: '2027-06-30' },
  },
  { folderId: work },
);

// A teammate shares two items: one View, one Login only.
const meera = await registerOrLogin('Meera Iyer', 'meera@vaultessa.dev');
const lookup = await call<{ id: string; publicKey: string }>(
  `/users/lookup?email=${encodeURIComponent('demo@vaultessa.dev')}`,
  undefined,
  meera.token,
);
for (const [data, permission] of [
  [
    {
      name: 'Jira (team admin)',
      username: 'support-team@acme.io',
      password: 'J!ra-Adm1n-7Qx#2026',
      url: 'https://acme.atlassian.net',
    },
    'VIEW',
  ],
  [
    {
      name: 'AWS console (break-glass)',
      username: 'root@acme.io',
      password: 'Aws#Root-9vL$2mQ!8z',
      url: 'https://console.aws.amazon.com',
    },
    'LOGIN_ONLY',
  ],
] as const) {
  const item = await addItem(meera, 'LOGIN', data);
  await call(
    `/secrets/${item.id}/shares`,
    { userId: lookup.json.id, permission, wrappedKey: await rsaWrap(item.keyBytes, lookup.json.publicKey) },
    meera.token,
  );
}

console.log('Demo data ready.');
console.log('  Sign in at http://127.0.0.1:5173 with demo@vaultessa.dev / Demo-Vault-2026!');
