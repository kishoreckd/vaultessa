import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

export async function tokenKeys(token) {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'pvm' || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(parts[1])) throw new Error('Invalid Vaultessa token');
  const raw = Buffer.from(parts[2], 'base64');
  if (raw.length !== 32) throw new Error('Invalid Vaultessa token');
  const root = await subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits', 'deriveKey']);
  raw.fill(0);
  const params = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(info) });
  const auth = await subtle.deriveBits(params('passvault-token-auth'), root, 256);
  const key = await subtle.deriveKey(params('passvault-token-enc'), root, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return { credential: `pvm.${parts[1]}.${Buffer.from(auth).toString('base64')}`, key };
}

async function decrypt(key, value) {
  const [version, iv, ciphertext, extra] = value.split('.');
  if (version !== 'v1' || !iv || !ciphertext || extra !== undefined) throw new Error('Unsupported ciphertext');
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(iv, 'base64') }, key, Buffer.from(ciphertext, 'base64')));
}

export class VaultessaClient {
  constructor({ url, token }) {
    const base = new URL(url);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error('Use HTTPS for Vaultessa');
    if (base.username || base.password || base.search || base.hash) throw new Error('Invalid Vaultessa URL');
    this.url = `${base.origin}${base.pathname.replace(/\/$/, '')}`;
    this.keys = tokenKeys(token);
  }

  async list() {
    const { credential, key } = await this.keys;
    const response = await fetch(`${this.url}/api/machine/secrets`, { headers: { Authorization: `Bearer ${credential}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Vaultessa request failed (${response.status})`);
    const envelope = await response.json();
    if (envelope.status !== 'success' || !Array.isArray(envelope.data)) throw new Error(envelope.message || 'Invalid Vaultessa response');
    const rows = envelope.data;
    return Promise.all(rows.map(async (row) => {
      const raw = await decrypt(key, row.wrappedKey);
      try {
        const itemKey = await subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
        const bytes = await decrypt(itemKey, row.encryptedData);
        try { return { id: row.id, type: row.type, revision: row.revision, data: JSON.parse(decoder.decode(bytes)) }; }
        finally { bytes.fill(0); }
      } finally { raw.fill(0); }
    }));
  }

  async get(id) {
    const item = (await this.list()).find((row) => row.id === id);
    if (!item) throw new Error('Item not found or access was revoked');
    return item;
  }
}
