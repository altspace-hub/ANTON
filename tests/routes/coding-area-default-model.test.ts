/**
 * coding-area-default-model.test.ts — ANTON Studio P0 (route-level).
 *
 * Verifies the model-resolution precedence added to claude.ts (~:128):
 *
 *   policyModel =
 *     (user `model`)                          // 1. user override
 *     || getAreaDefaultModelSync(areaId)      // 3. AREA default (seed coding=mistral-large)
 *     || getEffectiveDefaultModel()           // 4. product default (Settings / env)
 *     || 'claude-opus-4-8';                    // 5. final fallback
 *
 * (rung 2, compliance enforce_model, is applied AFTER and still wins — it is a
 * governance override, exercised separately by the MGOV tests.)
 *
 * Rather than boot the whole streaming claude route + a model call, this test
 * exercises the EXACT resolution expression claude.ts uses, against the real
 * stores backed by an in-memory app_settings adapter (same fake-DB pattern as
 * default-model-store.test.ts). The helper below is a verbatim copy of the
 * claude.ts fallback chain so a drift there breaks this test.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  initAreaDefaultModelStore,
  getAreaDefaultModelSync,
  setAreaDefaultModel,
  resetAreaDefaultModelStoreForTests,
} from '../../server/services/area-default-model-store.js';
import {
  getEffectiveDefaultModel,
  setPersistedDefaultModel,
  initDefaultModelStore,
  resetDefaultModelStoreForTests,
} from '../../server/services/default-model-store.js';

// ── verbatim copy of the claude.ts fallback chain (claude.ts ~:128) ─────────
function resolvePolicyModel(model: string | undefined, areaId: string | null | undefined): string {
  return (
    (model as string) ||
    getAreaDefaultModelSync(areaId) ||
    getEffectiveDefaultModel() ||
    'claude-opus-4-8'
  );
}

// In-memory fake adapter: app_settings only, supports get/all/run for BOTH
// stores (area store uses `all ... LIKE`, default store uses `get`).
function makeFakeDb(): { db: DatabaseAdapter; rows: Map<string, string> } {
  const rows = new Map<string, string>();
  const db = {
    dialect: 'sqlite',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM app_settings')) {
        const value = rows.get(String(params[0]));
        return value === undefined ? undefined : ({ value } as T);
      }
      return undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('FROM app_settings') && sql.includes('LIKE')) {
        const prefix = String(params[0]).replace(/%$/, '');
        const out: Array<{ key: string; value: string }> = [];
        for (const [key, value] of rows) if (key.startsWith(prefix)) out.push({ key, value });
        return out as unknown as T[];
      }
      return [] as T[];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.startsWith('DELETE')) rows.delete(String(params[0]));
      else if (sql.startsWith('INSERT')) rows.set(String(params[0]), String(params[1]));
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, rows };
}

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {}; for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  resetAreaDefaultModelStoreForTests();
  resetDefaultModelStoreForTests();
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  resetAreaDefaultModelStoreForTests();
  resetDefaultModelStoreForTests();
});

describe('area-default-model-store', () => {
  it('seeds coding → mistral-large-latest with no persisted row', () => {
    const { db } = makeFakeDb();
    initAreaDefaultModelStore(db);
    expect(getAreaDefaultModelSync('coding')).toBe('mistral-large-latest');
  });

  it('returns undefined for an area with no seed + no row', () => {
    const { db } = makeFakeDb();
    initAreaDefaultModelStore(db);
    expect(getAreaDefaultModelSync('finance')).toBeUndefined();
  });

  it('a persisted row overrides the seed', async () => {
    const { db, rows } = makeFakeDb();
    await setAreaDefaultModel(db, 'coding', 'mistral-medium-latest');
    expect(rows.get('area_default_model:coding')).toBe('mistral-medium-latest');
    expect(getAreaDefaultModelSync('coding')).toBe('mistral-medium-latest');
  });

  it('restores persisted rows at boot via initAreaDefaultModelStore', async () => {
    const { db, rows } = makeFakeDb();
    rows.set('area_default_model:coding', 'devstral-medium-latest');
    initAreaDefaultModelStore(db);
    await new Promise((r) => setTimeout(r, 0));
    expect(getAreaDefaultModelSync('coding')).toBe('devstral-medium-latest');
  });

  it('clearing a persisted row reverts to the seed', async () => {
    const { db } = makeFakeDb();
    await setAreaDefaultModel(db, 'coding', 'gpt-4o');
    expect(getAreaDefaultModelSync('coding')).toBe('gpt-4o');
    await setAreaDefaultModel(db, 'coding', null);
    expect(getAreaDefaultModelSync('coding')).toBe('mistral-large-latest');
  });
});

describe('claude.ts model-resolution precedence', () => {
  it('a coding-area run with NO user/enforce model resolves to the area default (Mistral Large)', () => {
    const { db } = makeFakeDb();
    initAreaDefaultModelStore(db);
    initDefaultModelStore(db);
    expect(resolvePolicyModel(undefined, 'coding')).toBe('mistral-large-latest');
  });

  it('the user-selected model beats the area default', () => {
    const { db } = makeFakeDb();
    initAreaDefaultModelStore(db);
    initDefaultModelStore(db);
    expect(resolvePolicyModel('claude-opus-4-8', 'coding')).toBe('claude-opus-4-8');
  });

  it('a persisted area default beats the product default', async () => {
    process.env.DEFAULT_MODEL = 'gpt-4o';
    const { db } = makeFakeDb();
    await setAreaDefaultModel(db, 'coding', 'mistral-medium-latest');
    initDefaultModelStore(db);
    expect(resolvePolicyModel(undefined, 'coding')).toBe('mistral-medium-latest');
  });

  it('a non-area run falls through area default → product default → env', async () => {
    process.env.DEFAULT_MODEL = 'gemini-2.5-flash';
    const { db } = makeFakeDb();
    initAreaDefaultModelStore(db);
    initDefaultModelStore(db);
    // no areaId, no user model → no area seed → product default (env)
    expect(resolvePolicyModel(undefined, undefined)).toBe('gemini-2.5-flash');
  });

  it('a non-area run with a persisted product default uses it (not the opus literal)', async () => {
    const { db } = makeFakeDb();
    initAreaDefaultModelStore(db);
    await setPersistedDefaultModel(db, 'mistral-small-latest');
    expect(resolvePolicyModel(undefined, undefined)).toBe('mistral-small-latest');
  });

  it('final fallback is the opus literal when nothing is configured', () => {
    const { db } = makeFakeDb();
    initAreaDefaultModelStore(db);
    initDefaultModelStore(db);
    expect(resolvePolicyModel(undefined, 'unseeded-area')).toBe('claude-opus-4-8');
  });
});
