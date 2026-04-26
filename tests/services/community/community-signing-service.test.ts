/**
 * community-signing-service.test.ts — Ed25519 sign/verify + sha256
 * primitive tests for the community signing service.
 *
 * Uses a mock DB; we exercise the pure-crypto pieces (sha256,
 * ed25519Sign, ed25519Verify) and the keypair generation flow.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSigningService } from '../../../server/services/community-signing-service.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

interface IdentityRow {
  id: string;
  contact_hash: string;
  public_key: string;
  private_key_encrypted: string | null;
}

function makeMockDb(initial: { identity?: IdentityRow }): DatabaseAdapter & {
  calls: SqlCall[]; storage: { identity: IdentityRow | null };
} {
  const calls: SqlCall[] = [];
  const storage = { identity: initial.identity ?? null };
  return {
    get: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes('community_identity')) return storage.identity ?? undefined;
      return undefined;
    },
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return []; },
    run: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes('UPDATE community_identity SET public_key')) {
        if (storage.identity) {
          storage.identity.public_key = String(args[0]);
          storage.identity.private_key_encrypted = String(args[1]);
        }
      }
    },
    exec: async () => { /* no-op */ },
    calls,
    storage,
  } as unknown as DatabaseAdapter & { calls: SqlCall[]; storage: { identity: IdentityRow | null } };
}

let mockDb: ReturnType<typeof makeMockDb>;

beforeEach(() => {
  mockDb = makeMockDb({
    identity: { id: 'id_1', contact_hash: 'ANTON-AAAA-AAAA-AAAA-AAAA', public_key: '', private_key_encrypted: null },
  });
});

describe('sha256', () => {
  it('produces a 64-char hex digest', async () => {
    const svc = await createSigningService(mockDb);
    const h = svc.sha256('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const svc = await createSigningService(mockDb);
    expect(svc.sha256('x')).toBe(svc.sha256('x'));
  });

  it('handles empty string + multibyte unicode', async () => {
    const svc = await createSigningService(mockDb);
    expect(svc.sha256('').length).toBe(64);
    expect(svc.sha256('🌍 こんにちは').length).toBe(64);
  });
});

describe('ed25519Sign — fallback path', () => {
  it('returns sha256-based unsigned tag when no private key available', async () => {
    const svc = await createSigningService(mockDb);
    const tag = svc.ed25519Sign('payload', null);
    expect(tag.startsWith('unsigned:')).toBe(true);
    expect(tag.slice('unsigned:'.length)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fallback is deterministic for same input', async () => {
    const svc = await createSigningService(mockDb);
    expect(svc.ed25519Sign('x', null)).toBe(svc.ed25519Sign('x', null));
  });
});

describe('generateAndStoreKeypair → sign / verify round-trip', () => {
  it('generates a keypair, signs, and verifies', async () => {
    const svc = await createSigningService(mockDb);
    const pubHex = await svc.generateAndStoreKeypair('id_1');
    expect(pubHex).toMatch(/^[0-9a-f]+$/);
    expect(mockDb.storage.identity!.public_key).toBe(pubHex);
    expect(mockDb.storage.identity!.private_key_encrypted).not.toBeNull();

    const sig = svc.ed25519Sign('important data', mockDb.storage.identity!.private_key_encrypted);
    expect(sig).not.toMatch(/^unsigned:/);

    const ok = svc.ed25519Verify('important data', sig, pubHex);
    expect(ok).toBe(true);
  });

  it('verification fails for tampered data', async () => {
    const svc = await createSigningService(mockDb);
    const pubHex = await svc.generateAndStoreKeypair('id_1');
    const sig = svc.ed25519Sign('original', mockDb.storage.identity!.private_key_encrypted);
    const ok = svc.ed25519Verify('tampered', sig, pubHex);
    expect(ok).toBe(false);
  });

  it('verification fails for wrong pubkey', async () => {
    const svc = await createSigningService(mockDb);
    const pubA = await svc.generateAndStoreKeypair('id_1');
    const sig = svc.ed25519Sign('data', mockDb.storage.identity!.private_key_encrypted);

    // Make a second keypair on a fresh id row for an unrelated pubkey
    const mockDb2 = makeMockDb({
      identity: { id: 'id_2', contact_hash: 'ANTON-BBBB-BBBB-BBBB-BBBB', public_key: '', private_key_encrypted: null },
    });
    const svc2 = await createSigningService(mockDb2);
    const pubB = await svc2.generateAndStoreKeypair('id_2');

    expect(pubA).not.toBe(pubB);
    expect(svc.ed25519Verify('data', sig, pubB)).toBe(false);
  });

  it('verification of fallback "unsigned:" tag returns false', async () => {
    const svc = await createSigningService(mockDb);
    const pubHex = await svc.generateAndStoreKeypair('id_1');
    const fallbackTag = svc.ed25519Sign('data', null);
    expect(svc.ed25519Verify('data', fallbackTag, pubHex)).toBe(false);
  });
});
