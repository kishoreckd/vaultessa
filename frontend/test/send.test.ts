import { describe, expect, it } from 'vitest';
import {
  accessCodeVerifier,
  CryptoError,
  fromBase64Url,
  generateAccessCode,
  openSend,
  sealSend,
  toBase64Url,
} from '../src/lib/crypto';

const payload = { name: 'Jira', fields: [{ label: 'Password', value: 'hunter2' }] };

describe('share links', () => {
  it('round-trips without an access code', async () => {
    const sealed = await sealSend(payload);
    expect(sealed.codeSalt).toBeUndefined();
    expect(sealed.linkKey).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, URL-safe, no padding
    expect(await openSend(sealed.encryptedData, sealed.linkKey)).toEqual(payload);
  });

  it('needs both the link key and the right access code', async () => {
    const code = generateAccessCode();
    const sealed = await sealSend(payload, code);
    expect(sealed.codeVerifier).toBe(await accessCodeVerifier(code, sealed.codeSalt!));

    // code is case/format-insensitive for the guest
    const typed = code.toLowerCase().replace('-', ' ');
    expect(await openSend(sealed.encryptedData, sealed.linkKey, typed, sealed.codeSalt)).toEqual(payload);

    await expect(openSend(sealed.encryptedData, sealed.linkKey, 'WRONG-CODE', sealed.codeSalt)).rejects.toBeInstanceOf(
      CryptoError,
    );
    await expect(openSend(sealed.encryptedData, sealed.linkKey)).rejects.toBeInstanceOf(CryptoError);
    const otherKey = (await sealSend(payload)).linkKey;
    await expect(openSend(sealed.encryptedData, otherKey, code, sealed.codeSalt)).rejects.toBeInstanceOf(CryptoError);
  });

  it('generates readable unambiguous access codes', () => {
    for (let i = 0; i < 50; i++) expect(generateAccessCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it('base64url round-trips', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });
});
