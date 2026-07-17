import { describe, it, expect, vi } from 'vitest';
import { InMemoryStorageBackend } from '../../src/main/storage.js';
import { EncryptedKeyStorage, parseKeyEncryptionKey } from '../../src/main/encrypted-storage.js';

const KEY_HEX = 'ab'.repeat(32); // 64 hex chars
const IDENTITY_KEY = 'identity.agreement.v1';
const SECRET_KEY = 'relay.pairsecret.v1';
const IDENTITY_JSON = JSON.stringify({ privHex: '11'.repeat(32), pubHex: '22'.repeat(32) });

describe('parseKeyEncryptionKey', () => {
  it('returns null when unset and a 32-byte buffer for 64 hex chars', () => {
    expect(parseKeyEncryptionKey(undefined)).toBeNull();
    expect(parseKeyEncryptionKey('')).toBeNull();
    expect(parseKeyEncryptionKey(KEY_HEX)?.length).toBe(32);
  });
  it('throws loudly on a malformed key instead of silently storing plaintext', () => {
    expect(() => parseKeyEncryptionKey('too-short')).toThrow(/64 hex/);
  });
});

describe('EncryptedKeyStorage', () => {
  it('round-trips a protected key encrypted on disk, plaintext to callers', async () => {
    const inner = new InMemoryStorageBackend();
    const store = new EncryptedKeyStorage(inner, parseKeyEncryptionKey(KEY_HEX), () => {});
    await store.set(IDENTITY_KEY, IDENTITY_JSON);

    const onDisk = await inner.get(IDENTITY_KEY);
    expect(onDisk).not.toBeNull();
    expect(onDisk).not.toContain('privHex');
    expect(JSON.parse(onDisk!)).toMatchObject({ enc: 'aes-256-gcm', v: 1 });

    expect(await store.get(IDENTITY_KEY)).toBe(IDENTITY_JSON);
  });

  it('migrates a legacy plaintext row to encrypted on first read', async () => {
    const inner = new InMemoryStorageBackend();
    await inner.set(IDENTITY_KEY, IDENTITY_JSON); // legacy plaintext
    const log = vi.fn();
    const store = new EncryptedKeyStorage(inner, parseKeyEncryptionKey(KEY_HEX), log);

    expect(await store.get(IDENTITY_KEY)).toBe(IDENTITY_JSON);
    const onDisk = await inner.get(IDENTITY_KEY);
    expect(onDisk).not.toContain('privHex');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('migrated'));
    // Still readable after migration.
    expect(await store.get(IDENTITY_KEY)).toBe(IDENTITY_JSON);
  });

  it('warns once (and stays plaintext) when no key is configured', async () => {
    const inner = new InMemoryStorageBackend();
    await inner.set(IDENTITY_KEY, IDENTITY_JSON);
    const log = vi.fn();
    const store = new EncryptedKeyStorage(inner, null, log);
    expect(await store.get(IDENTITY_KEY)).toBe(IDENTITY_JSON);
    expect(await store.get(IDENTITY_KEY)).toBe(IDENTITY_JSON);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('PLAINTEXT');
  });

  it('refuses to serve an encrypted row without the key (no silent lockout-bypass)', async () => {
    const inner = new InMemoryStorageBackend();
    const withKey = new EncryptedKeyStorage(inner, parseKeyEncryptionKey(KEY_HEX), () => {});
    await withKey.set(SECRET_KEY, 'deadbeef'.repeat(4));

    const withoutKey = new EncryptedKeyStorage(inner, null, () => {});
    await expect(withoutKey.get(SECRET_KEY)).rejects.toThrow(/ANTON_COLLAB_KEY_ENCRYPTION_KEY/);
  });

  it('fails on a wrong key (GCM tag mismatch) instead of returning garbage', async () => {
    const inner = new InMemoryStorageBackend();
    const a = new EncryptedKeyStorage(inner, parseKeyEncryptionKey(KEY_HEX), () => {});
    await a.set(IDENTITY_KEY, IDENTITY_JSON);
    const b = new EncryptedKeyStorage(inner, parseKeyEncryptionKey('cd'.repeat(32)), () => {});
    await expect(b.get(IDENTITY_KEY)).rejects.toThrow();
  });

  it('passes unprotected keys through untouched', async () => {
    const inner = new InMemoryStorageBackend();
    const store = new EncryptedKeyStorage(inner, parseKeyEncryptionKey(KEY_HEX), () => {});
    await store.set('agreement.rows.v1', '[{"id":"a1"}]');
    expect(await inner.get('agreement.rows.v1')).toBe('[{"id":"a1"}]');
    expect(await store.get('agreement.rows.v1')).toBe('[{"id":"a1"}]');
  });
});
