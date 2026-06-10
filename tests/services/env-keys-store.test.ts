/**
 * env-keys-store.test.ts — unit tests for the Settings provider-key
 * persistence layer (Wave-1 item 1.4 / cluster D1).
 *
 * Uses an in-memory fake DatabaseAdapter so no Postgres is needed. Covers:
 *   • plaintext round-trip when INSTANCE_KEY_ENCRYPTION_KEY is unset
 *   • encrypted round-trip when the key is set
 *   • clearing deletes the persisted row
 *   • allowlist enforcement on persist AND on restore (stray rows ignored)
 *   • decrypt failure (key removed/rotated) skips the row instead of throwing
 *
 * SECURITY: assertions check that values land in process.env only — the
 * module never logs values (verified by reading the source; not asserted).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  PERSISTABLE_ENV_KEYS,
  persistEnvKey,
  loadPersistedEnvKeys,
} from '../../server/services/env-keys-store.js';

// ── In-memory fake adapter (app_settings only) ─────────────────────────────

function makeFakeDb(): { db: DatabaseAdapter; rows: Map<string, string> } {
  const rows = new Map<string, string>();
  const db: DatabaseAdapter = {
    dialect: 'sqlite' as DatabaseAdapter['dialect'],
    async get() { return undefined; },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('LIKE')) {
        const prefix = String(params[0]).replace(/%$/, '');
        return [...rows.entries()]
          .filter(([k]) => k.startsWith(prefix))
          .map(([key, value]) => ({ key, value })) as T[];
      }
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.startsWith('DELETE')) {
        rows.delete(String(params[0]));
      } else if (sql.startsWith('INSERT')) {
        rows.set(String(params[0]), String(params[1]));
      }
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, rows };
}

const TEST_KEY = 'MISTRAL_API_KEY'; // real allowlisted key, not used by tests elsewhere
const TEST_VALUE = 'test-key-value-not-a-real-secret';

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv.INSTANCE_KEY_ENCRYPTION_KEY = process.env.INSTANCE_KEY_ENCRYPTION_KEY;
  savedEnv[TEST_KEY] = process.env[TEST_KEY];
  delete process.env.INSTANCE_KEY_ENCRYPTION_KEY;
  delete process.env[TEST_KEY];
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('env-keys-store', () => {
  it('includes ANTHROPIC_API_KEY in the allowlist (the first-run blocker)', () => {
    expect(PERSISTABLE_ENV_KEYS.has('ANTHROPIC_API_KEY')).toBe(true);
  });

  it('round-trips a key in plaintext mode (no INSTANCE_KEY_ENCRYPTION_KEY)', async () => {
    const { db, rows } = makeFakeDb();
    await persistEnvKey(db, TEST_KEY, TEST_VALUE);
    expect(rows.size).toBe(1);
    const stored = JSON.parse([...rows.values()][0]) as { plain?: string; enc?: string };
    expect(stored.plain).toBe(TEST_VALUE);
    expect(stored.enc).toBeUndefined();

    const restored = await loadPersistedEnvKeys(db);
    expect(restored).toEqual([TEST_KEY]);
    expect(process.env[TEST_KEY]).toBe(TEST_VALUE);
  });

  it('round-trips encrypted when INSTANCE_KEY_ENCRYPTION_KEY is set', async () => {
    process.env.INSTANCE_KEY_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    const { db, rows } = makeFakeDb();
    await persistEnvKey(db, TEST_KEY, TEST_VALUE);
    const stored = JSON.parse([...rows.values()][0]) as { plain?: string; enc?: string; iv?: string };
    expect(stored.plain).toBeUndefined();
    expect(stored.enc).toBeTruthy();
    expect(stored.iv).toBeTruthy();
    // The raw value must not appear anywhere in the persisted row
    expect([...rows.values()][0]).not.toContain(TEST_VALUE);

    const restored = await loadPersistedEnvKeys(db);
    expect(restored).toEqual([TEST_KEY]);
    expect(process.env[TEST_KEY]).toBe(TEST_VALUE);
  });

  it('clearing (null / empty) deletes the persisted row', async () => {
    const { db, rows } = makeFakeDb();
    await persistEnvKey(db, TEST_KEY, TEST_VALUE);
    expect(rows.size).toBe(1);
    await persistEnvKey(db, TEST_KEY, null);
    expect(rows.size).toBe(0);
    await persistEnvKey(db, TEST_KEY, TEST_VALUE);
    await persistEnvKey(db, TEST_KEY, '');
    expect(rows.size).toBe(0);
  });

  it('rejects non-allowlisted keys on persist', async () => {
    const { db } = makeFakeDb();
    await expect(persistEnvKey(db, 'PATH', 'evil')).rejects.toThrow(/not a persistable/);
  });

  it('ignores stray non-allowlisted rows on restore (no env injection)', async () => {
    const { db, rows } = makeFakeDb();
    rows.set('env_key:PATH', JSON.stringify({ v: 1, plain: 'evil' }));
    const before = process.env.PATH;
    const restored = await loadPersistedEnvKeys(db);
    expect(restored).toEqual([]);
    expect(process.env.PATH).toBe(before);
  });

  it('skips (does not throw on) rows it can no longer decrypt', async () => {
    process.env.INSTANCE_KEY_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    const { db } = makeFakeDb();
    await persistEnvKey(db, TEST_KEY, TEST_VALUE);
    // Simulate key rotation/removal between persist and boot
    delete process.env.INSTANCE_KEY_ENCRYPTION_KEY;
    const restored = await loadPersistedEnvKeys(db);
    expect(restored).toEqual([]);
    expect(process.env[TEST_KEY]).toBeUndefined();
  });
});
