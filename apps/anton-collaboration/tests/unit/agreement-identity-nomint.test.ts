/**
 * agreement-identity-nomint.test.ts — an unreadable identity must NEVER be
 * replaced by a fresh one.
 *
 * loadOrCreate() used to do `await this.storage.get(KEY).catch(() => null)` and
 * treat the null as "no identity yet". But EncryptedKeyStorage.get() THROWS by
 * design when a row is sealed and ANTON_COLLAB_KEY_ENCRYPTION_KEY is absent or
 * wrong — there is a test for that named "refuses to serve an encrypted row
 * without the key (no silent lockout-bypass)". Swallowing it fell through to
 * generate() + set(), and with no key held, set() writes PLAINTEXT OVER THE
 * CIPHERTEXT.
 *
 * So a single boot from the wrong shell, a roamed profile, or a key file that
 * had not synced would: destroy the signing identity beyond recovery, orphan
 * every already-signed agreement (proposerPubkey / acceptorPubkey stop
 * matching), change the agent's contactHash so the paired phone can never reach
 * it, and silently downgrade the store to plaintext.
 *
 * A human can fix an env var or restore a backup. Nobody can recover a key that
 * was overwritten — so the only safe response to "cannot read" is to refuse.
 */
import { describe, it, expect } from 'vitest';
import { AgreementIdentity } from '../../src/main/agreement-identity.js';
import type { StorageBackend } from '../../src/main/storage.js';

function backend(opts: {
  get: () => Promise<string | null>;
  onSet?: (k: string, v: string) => void;
}): StorageBackend {
  return {
    get: opts.get,
    set: async (k: string, v: string) => { opts.onSet?.(k, v); },
    remove: async () => { /* noop */ },
  };
}

describe('AgreementIdentity refuses to mint over an unreadable identity', () => {
  it('propagates a storage/decrypt error instead of generating a new key', async () => {
    let wrote = false;
    const id = new AgreementIdentity(backend({
      get: async () => { throw new Error('row is encrypted at rest but ANTON_COLLAB_KEY_ENCRYPTION_KEY is not set'); },
      onSet: () => { wrote = true; },
    }));

    await expect(id.pubkey()).rejects.toThrow(/refusing to mint a new one/i);
    expect(wrote, 'must not overwrite the stored identity').toBe(false);
  });

  it('names the env var so the operator can actually fix it', async () => {
    const id = new AgreementIdentity(backend({
      get: async () => { throw new Error('sealed'); },
    }));
    await expect(id.pubkey()).rejects.toThrow(/ANTON_COLLAB_KEY_ENCRYPTION_KEY/);
  });

  it('refuses on a present-but-unparseable row rather than overwriting it', async () => {
    let wrote = false;
    const id = new AgreementIdentity(backend({
      get: async () => 'not json at all',
      onSet: () => { wrote = true; },
    }));
    await expect(id.pubkey()).rejects.toThrow(/unparseable|malformed/i);
    expect(wrote).toBe(false);
  });

  it('refuses on a row whose privHex is malformed rather than overwriting it', async () => {
    let wrote = false;
    const id = new AgreementIdentity(backend({
      get: async () => JSON.stringify({ privHex: 'nothex', pubHex: 'x' }),
      onSet: () => { wrote = true; },
    }));
    await expect(id.pubkey()).rejects.toThrow(/malformed/i);
    expect(wrote).toBe(false);
  });

  it('still mints on a genuinely ABSENT row — first run must work', async () => {
    const writes: Array<{ k: string; v: string }> = [];
    const id = new AgreementIdentity(backend({
      get: async () => null,
      onSet: (k, v) => writes.push({ k, v }),
    }));
    const pub = await id.pubkey();
    expect(pub).toMatch(/^[0-9a-f]{64}$/);
    expect(writes).toHaveLength(1);
  });

  it('loads an existing valid identity without writing anything', async () => {
    // Round-trip: mint once, then reload from the persisted value.
    let stored: string | null = null;
    const first = new AgreementIdentity(backend({
      get: async () => null,
      onSet: (_k, v) => { stored = v; },
    }));
    const pub1 = await first.pubkey();

    let wrote = false;
    const second = new AgreementIdentity(backend({
      get: async () => stored,
      onSet: () => { wrote = true; },
    }));
    expect(await second.pubkey()).toBe(pub1);
    expect(wrote, 'loading must not rewrite the row').toBe(false);
  });
});
