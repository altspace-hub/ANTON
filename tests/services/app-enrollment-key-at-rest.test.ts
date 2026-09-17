/**
 * app-enrollment-key-at-rest.test.ts — INSTANCE_KEY_ENCRYPTION_KEY must have
 * three distinct states, not two.
 *
 * Launch audit 2026-09-06 (HIGH): getEncryptionKey() returned null both when
 * the env var was ABSENT and when it was PRESENT BUT MALFORMED. Because
 * Buffer.from(x, 'hex') truncates at the first non-hex character instead of
 * throwing, a typo, a `0x` prefix, a truncated paste or a trailing newline all
 * decoded to a short buffer -> null -> the INSERT wrote the instance's Ed25519
 * pkcs8 private key into the PLAINTEXT `instance_identity.privkey` column. The
 * only signal was one console.warn per process, worded identically to the
 * genuinely-unset case, so an operator with a typo got a deployment that looked
 * and behaved exactly like an encrypted one — while anyone able to read that
 * single Postgres row could mint device certificates and impersonate the
 * instance to every paired phone.
 *
 * These tests pin, in order:
 *   - unset            -> documented degraded mode (plaintext + it still works)
 *   - set and valid    -> encrypted, plaintext column NULL, round-trips
 *   - set but unusable -> throws, and writes NOTHING (the fail-closed control)
 *   - key changed after the row was written -> read fails loudly and never
 *     hands ciphertext back as if it were the privkey
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAppEnrollmentService } from '../../server/services/app-enrollment-service.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

interface IdentityRow {
  pubkey: string;
  privkey: string | null;
  privkey_encrypted: Buffer | null;
  privkey_iv: Buffer | null;
  cert_fingerprint: string | null;
  display_name: string | null;
  contact_hash: string | null;
}

/** In-memory stand-in for the `instance_identity` singleton row. Records every
 *  statement so a test can assert that NOTHING was written. */
function identityDb(seed?: Partial<IdentityRow>) {
  let row: IdentityRow | null = seed
    ? {
        pubkey: 'pub', privkey: null, privkey_encrypted: null, privkey_iv: null,
        cert_fingerprint: null, display_name: 'ANTON', contact_hash: 'ANTON-TEST',
        ...seed,
      }
    : null;
  const runs: Array<{ sql: string; args: unknown[] }> = [];

  const db = {
    dialect: 'postgresql',
    get: async (sql: string) =>
      (/FROM\s+instance_identity/i.test(sql) ? (row ?? undefined) : undefined),
    all: async () => [],
    run: async (sql: string, ...args: unknown[]) => {
      runs.push({ sql, args });
      if (/INSERT\s+INTO\s+instance_identity/i.test(sql)) {
        row = {
          pubkey: args[0] as string,
          privkey: args[1] as string | null,
          privkey_encrypted: args[2] as Buffer | null,
          privkey_iv: args[3] as Buffer | null,
          cert_fingerprint: null,
          display_name: args[4] as string | null,
          contact_hash: args[5] as string | null,
        };
      } else if (/UPDATE\s+instance_identity\s+SET\s+privkey_encrypted/i.test(sql) && row) {
        row.privkey_encrypted = args[0] as Buffer;
        row.privkey_iv = args[1] as Buffer;
        row.privkey = null;
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    exec: async () => {},
    transaction: async <T>(fn: (d: DatabaseAdapter) => Promise<T>) => fn(db),
    close: async () => {},
  } as unknown as DatabaseAdapter;

  return { db, runs, current: () => row };
}

let saved: string | undefined;
beforeEach(() => { saved = process.env.INSTANCE_KEY_ENCRYPTION_KEY; });
afterEach(() => {
  if (saved === undefined) delete process.env.INSTANCE_KEY_ENCRYPTION_KEY;
  else process.env.INSTANCE_KEY_ENCRYPTION_KEY = saved;
});

describe('INSTANCE_KEY_ENCRYPTION_KEY — unset is degraded mode, malformed is an error', () => {
  it('unset: stores plaintext and keeps working (the documented dev fallback)', async () => {
    delete process.env.INSTANCE_KEY_ENCRYPTION_KEY;
    const h = identityDb();
    const id = await createAppEnrollmentService(h.db).getOrCreateInstanceIdentity();

    expect(h.current()?.privkey).toBe(id.privkey);
    expect(h.current()?.privkey_encrypted).toBeNull();
  });

  it('valid 64-hex key: encrypts, leaves the plaintext column NULL, round-trips', async () => {
    process.env.INSTANCE_KEY_ENCRYPTION_KEY = KEY_A;
    const h = identityDb();
    const svc = createAppEnrollmentService(h.db);
    const id = await svc.getOrCreateInstanceIdentity();

    expect(h.current()?.privkey).toBeNull();
    expect(h.current()?.privkey_encrypted).toBeInstanceOf(Buffer);
    expect(h.current()?.privkey_iv).toBeInstanceOf(Buffer);
    // The stored blob is not the privkey in disguise.
    expect(h.current()?.privkey_encrypted?.toString('hex')).not.toContain(id.privkey);
    // Second read decrypts back to the same key material.
    expect((await svc.getOrCreateInstanceIdentity()).privkey).toBe(id.privkey);
  });

  // ── The finding proper ────────────────────────────────────────────────
  // Each of these used to be indistinguishable from "unset" and therefore
  // produced a plaintext private key in Postgres.
  const malformed: Array<[string, string]> = [
    ['too short (truncated paste)',      'deadbeef'],
    ['too long',                         KEY_A + 'ab'],
    ['0x prefix',                        '0x' + KEY_A.slice(2)],
    ['non-hex typo in the middle',       KEY_A.slice(0, 30) + 'g' + KEY_A.slice(31)],
    ['trailing newline from a heredoc',  KEY_A + '\n'],
    ['surrounding quotes',               `"${KEY_A}"`],
    ['whitespace padding',               ` ${KEY_A} `],
    ['a 32-character (not 32-byte) key', 'a'.repeat(32)],
  ];

  for (const [label, value] of malformed) {
    it(`malformed key — ${label} — refuses and writes nothing`, async () => {
      process.env.INSTANCE_KEY_ENCRYPTION_KEY = value;
      const h = identityDb();

      await expect(
        createAppEnrollmentService(h.db).getOrCreateInstanceIdentity(),
      ).rejects.toThrow(/INSTANCE_KEY_ENCRYPTION_KEY is set but unusable/);

      // The control is that no key material reached the database at all —
      // not merely that a warning was logged.
      expect(h.runs, 'a malformed key must not write the identity row').toEqual([]);
      expect(h.current()).toBeNull();
    });
  }

  it('malformed key: a legacy plaintext row is not silently left plaintext either', async () => {
    // The opportunistic-migration branch used to call warnPlaintextOnce() and
    // hand the caller the plaintext key when encryption "wasn't available".
    // With a broken key that is a downgrade dressed as a fallback.
    const legacy = crypto.randomBytes(48).toString('hex');
    process.env.INSTANCE_KEY_ENCRYPTION_KEY = 'nothex';
    const h = identityDb({ privkey: legacy });

    await expect(
      createAppEnrollmentService(h.db).getOrCreateInstanceIdentity(),
    ).rejects.toThrow(/INSTANCE_KEY_ENCRYPTION_KEY is set but unusable/);
    expect(h.current()?.privkey).toBe(legacy); // untouched, still encryptable later
  });

  it('key changed after the row was written: read fails loudly, no ciphertext-as-plaintext', async () => {
    process.env.INSTANCE_KEY_ENCRYPTION_KEY = KEY_A;
    const h = identityDb();
    const id = await createAppEnrollmentService(h.db).getOrCreateInstanceIdentity();

    process.env.INSTANCE_KEY_ENCRYPTION_KEY = KEY_B;
    const svc = createAppEnrollmentService(h.db);
    await expect(svc.getOrCreateInstanceIdentity())
      .rejects.toThrow(/does not match the key this row was written with/);

    // Restoring the original key restores access — the row was never mangled.
    process.env.INSTANCE_KEY_ENCRYPTION_KEY = KEY_A;
    expect((await svc.getOrCreateInstanceIdentity()).privkey).toBe(id.privkey);
  });
});

/**
 * The same three-state collapse existed a second time, in
 * server/services/evidence-pack/signer.ts, and the duplication is why.
 *
 * That file carried its own `encKey()` under a comment reading "mirror of
 * app-enrollment-service.ts so we don't have to expose those private helpers;
 * both write into the same table". When this service learned to tell "absent"
 * from "set but unusable", the mirror did not — so a malformed key still fell
 * through to writing the Ed25519 private key in plaintext, into the very same
 * instance_identity row this service was refusing to touch. Its guard was
 * `hex.length !== 64` with no charset check, so a 64-character string with one
 * typo'd digit decoded short and read as "not configured".
 *
 * The fix is to share the resolver rather than mirror it, so these assert on
 * that structure. A behavioural test would need the signer's whole DB fixture;
 * what actually needs pinning is that the second copy is gone and cannot come
 * back unnoticed.
 */
describe('evidence-pack signer shares this resolver', () => {
  const signerRaw = readFileSync(
    join(process.cwd(), 'server/services/evidence-pack/signer.ts'), 'utf8',
  );
  // Strip comments before matching. The comment left in place of the deleted
  // helper NAMES the old code it replaced — including `hex.length !== 64` — so a
  // raw substring search finds the description and reports the bug as still
  // present. Assert on the code, never on the prose about the code.
  const signer = signerRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('imports the resolver instead of keeping its own', () => {
    expect(signer).toContain("import { getEncryptionKey } from '../app-enrollment-service.js'");
  });

  it('has no private key-resolution helper left', () => {
    // The exact shape of the old copy, and any revival of it.
    expect(signer).not.toMatch(/function\s+encKey\s*\(/);
    expect(signer).not.toMatch(/hex\.length\s*!==\s*64/);
  });

  it('reads the env var nowhere but through the shared resolver', () => {
    // A second reader of INSTANCE_KEY_ENCRYPTION_KEY in this file would be a
    // second place for the two behaviours to diverge again. The startup warning
    // is allowed to mention the name in its message text, so match the read.
    expect(signer).not.toMatch(/process\.env\.INSTANCE_KEY_ENCRYPTION_KEY/);
  });

  it('is exported from here on purpose', () => {
    const svc = readFileSync(
      join(process.cwd(), 'server/services/app-enrollment-service.ts'), 'utf8',
    );
    expect(svc).toMatch(/export function getEncryptionKey\(\)/);
  });
});
