import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VaultessaClient, tokenKeys } from './index.mjs';

const fixture = JSON.parse(await readFile(new URL('../test-vectors.json', import.meta.url), 'utf8'));

test('derives independent auth proof compatible with Python and browser', async () => {
  assert.equal((await tokenKeys(fixture.token)).credential, fixture.credential);
  assert.notEqual(fixture.token, fixture.credential);
});

test('decrypts a granted item and sends only the derived credential', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://vault.example/api/machine/secrets');
    assert.equal(options.headers.Authorization, `Bearer ${fixture.credential}`);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify([fixture.row]));
  });
  const client = new VaultessaClient({ url: 'https://vault.example', token: fixture.token });
  assert.deepEqual((await client.get(fixture.row.id)).data, fixture.payload);
  await assert.rejects(() => client.get('missing'), /not found/);
});

test('rejects tampered ciphertext', async (t) => {
  const row = { ...fixture.row, encryptedData: fixture.row.encryptedData.slice(0, -5) + 'AAAA=' };
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify([row])));
  await assert.rejects(() => new VaultessaClient({ url: 'https://vault.example', token: fixture.token }).list());
});

test('rejects remote plaintext HTTP', () => {
  assert.throws(() => new VaultessaClient({ url: 'http://vault.example', token: fixture.token }), /HTTPS/);
});
