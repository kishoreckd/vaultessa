#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { VaultessaClient } from './index.mjs';

function mask(value) {
  if (process.env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!['list', 'get', 'run'].includes(command)) {
    console.log('Set VAULTESSA_URL (origin) and VAULTESSA_TOKEN.\nCommands: list | get <item-id> [field.path] | run --map ENV=item-id:field.path [--map ...] -- command [args]');
    return;
  }
  if (!process.env.VAULTESSA_URL || !process.env.VAULTESSA_TOKEN) throw new Error('Set VAULTESSA_URL and VAULTESSA_TOKEN');
  const client = new VaultessaClient({ url: process.env.VAULTESSA_URL, token: process.env.VAULTESSA_TOKEN });
  const items = await client.list();
  const field = (id, path) => {
    const item = items.find((row) => row.id === id);
    if (!item) throw new Error('Item not found or access was revoked');
    const value = path ? path.split('.').reduce((obj, key) => Object.hasOwn(obj ?? {}, key) ? obj[key] : undefined, item.data) : item.data;
    if (value === undefined) throw new Error('Field not found');
    return value;
  };
  if (command === 'list') { console.log(JSON.stringify(items.map(({ id, type, data }) => ({ id, type, name: data.name })), null, 2)); return; }
  if (command === 'get') {
    const value = field(args[0], args[1]);
    const rendered = typeof value === 'string' ? value : JSON.stringify(value);
    mask(rendered); console.log(rendered); return;
  }
  const boundary = args.indexOf('--');
  if (boundary < 0 || !args[boundary + 1]) throw new Error('Provide mappings followed by -- and a command');
  const env = { ...process.env };
  delete env.VAULTESSA_TOKEN;
  for (let i = 0; i < boundary; i += 2) {
    if (args[i] !== '--map') throw new Error('Expected --map ENV=item-id:field.path');
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=([^:]+):(.+)$/.exec(args[i + 1] ?? '');
    if (!match) throw new Error('Invalid environment mapping');
    const value = field(match[2], match[3]);
    if (typeof value !== 'string') throw new Error('Mapped fields must be strings');
    mask(value); env[match[1]] = value;
  }
  const child = spawn(args[boundary + 1], args.slice(boundary + 2), { env, shell: false, stdio: 'inherit' });
  child.on('error', () => { console.error('Could not start command'); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
