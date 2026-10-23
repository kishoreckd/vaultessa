import "fake-indexeddb/auto";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  forgetUnlock,
  rememberUnlock,
  restoreUnlock,
  REMEMBER_UNLOCK_MS,
} from "../src/lib/remembered-unlock";
import { requireKeys, useSession, type VaultKeys } from "../src/stores/session";
import type { Account } from "../src/api/auth/types";

const account = {
  id: "alice",
  emailVerified: true,
  protectedVaultKey: "wrapped-key-v1",
  protectedPrivateKey: "wrapped-private-v1",
} as Account;
let keys: VaultKeys;
beforeAll(async () => {
  const vaultKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 1024,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    false,
    ["encrypt", "decrypt"],
  );
  keys = { vaultKey, privateKey: pair.privateKey };
});
afterEach(async () => {
  vi.restoreAllMocks();
  useSession.getState().clear();
  await forgetUnlock();
});

it("restores usable non-extractable keys across a simulated reload without extending expiry", async () => {
  const expiresAt = Date.now() + REMEMBER_UNLOCK_MS;
  await rememberUnlock(account, keys, expiresAt);
  const restored = await restoreUnlock(account);
  expect(restored?.expiresAt).toBe(expiresAt);
  expect(restored?.keys.vaultKey.extractable).toBe(false);
  expect(restored?.keys.privateKey.extractable).toBe(false);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode("test-only plaintext");
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keys.vaultKey,
    plain,
  );
  expect(
    new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        restored!.keys.vaultKey,
        cipher,
      ),
    ),
  ).toEqual(plain);
  await expect(
    crypto.subtle.exportKey("raw", restored!.keys.vaultKey),
  ).rejects.toThrow();
});

it("rejects and clears an expired six-hour unlock", async () => {
  const now = Date.now();
  await rememberUnlock(account, keys, now + REMEMBER_UNLOCK_MS);
  vi.spyOn(Date, "now").mockReturnValue(now + REMEMBER_UNLOCK_MS);
  expect(await restoreUnlock(account)).toBeNull();
});

it('does not persist extractable key material', async () => {
  const extractable = await crypto.subtle.generateKey({ name:'AES-GCM', length:256 }, true, ['encrypt','decrypt']);
  await rememberUnlock(account, {...keys,vaultKey:extractable}, Date.now()+REMEMBER_UNLOCK_MS);
  expect(await restoreUnlock(account)).toBeNull();
});

it("rejects another account, changed protected keys, and unverified accounts", async () => {
  for (const changed of [
    { ...account, id: "bob" },
    { ...account, protectedVaultKey: "rotated" },
    { ...account, protectedPrivateKey: "rotated" },
    { ...account, emailVerified: false },
  ]) {
    await rememberUnlock(account, keys, Date.now() + REMEMBER_UNLOCK_MS);
    expect(await restoreUnlock(changed)).toBeNull();
  }
});

it("manual lock and sign-out clear persisted keys even when a save is pending", async () => {
  useSession.getState().unlock(account, keys);
  useSession.getState().lock("manual");
  expect(await restoreUnlock(account)).toBeNull();
  useSession.getState().unlock(account, keys);
  useSession.getState().clear();
  expect(await restoreUnlock(account)).toBeNull();
});

it("refuses key access when an open tab crosses the expiry deadline", () => {
  const now = Date.now();
  useSession.getState().unlock(account, keys, now + 1000);
  vi.spyOn(Date, "now").mockReturnValue(now + 1000);
  expect(() => requireKeys()).toThrow("Vault is locked");
  expect(useSession.getState().lockReason).toBe("expired");
});
