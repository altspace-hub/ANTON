/**
 * default-model-store.test.ts — unit tests for the server-side default
 * model persistence (plan 2.12, the cheap-model-spine keystone).
 *
 * Uses an in-memory fake DatabaseAdapter (same pattern as
 * env-keys-store.test.ts) so no Postgres is needed. Covers:
 *   • persisted Settings choice round-trip + sync cache update
 *   • precedence: persisted > env DEFAULT_MODEL > undefined
 *   • clearing falls back to env DEFAULT_MODEL
 *   • the provider-router resolvers actually follow the persisted choice
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  initDefaultModelStore,
  getPersistedDefaultModelSync,
  getEffectiveDefaultModel,
  setPersistedDefaultModel,
  resetDefaultModelStoreForTests,
} from '../../server/services/default-model-store.js';
import { mapModelToProvider, resolveModel } from '../../server/services/provider-router.js';

// ── In-memory fake adapter (app_settings only) ─────────────────────────────

function makeFakeDb(): { db: DatabaseAdapter; rows: Map<string, string> } {
  const rows = new Map<string, string>();
  const db: DatabaseAdapter = {
    dialect: 'sqlite' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM app_settings')) {
        const value = rows.get(String(params[0]));
        return value === undefined ? undefined : ({ value } as T);
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
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

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  resetDefaultModelStoreForTests();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  resetDefaultModelStoreForTests();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('default-model-store', () => {
  it('persists the choice and updates the sync cache immediately', async () => {
    const { db, rows } = makeFakeDb();
    await setPersistedDefaultModel(db, 'mistral-medium-latest');
    expect(rows.get('default_model')).toBe('mistral-medium-latest');
    expect(getPersistedDefaultModelSync()).toBe('mistral-medium-latest');
  });

  it('restores the persisted choice at boot via initDefaultModelStore', async () => {
    const { db, rows } = makeFakeDb();
    rows.set('default_model', 'ollama:qwen2.5');
    initDefaultModelStore(db);
    // initial load is async — wait a tick for the cache to fill
    await new Promise((r) => setTimeout(r, 0));
    expect(getPersistedDefaultModelSync()).toBe('ollama:qwen2.5');
  });

  it('precedence: persisted Settings choice beats env DEFAULT_MODEL', async () => {
    process.env.DEFAULT_MODEL = 'claude-opus-4-8';
    const { db } = makeFakeDb();
    await setPersistedDefaultModel(db, 'mistral-large-latest');
    expect(getEffectiveDefaultModel()).toBe('mistral-large-latest');
  });

  it('precedence: env DEFAULT_MODEL applies when nothing is persisted', async () => {
    process.env.DEFAULT_MODEL = 'gemini-2.5-flash';
    const { db } = makeFakeDb();
    initDefaultModelStore(db);
    await new Promise((r) => setTimeout(r, 0));
    expect(getEffectiveDefaultModel()).toBe('gemini-2.5-flash');
  });

  it('clearing the persisted choice falls back to env DEFAULT_MODEL', async () => {
    process.env.DEFAULT_MODEL = 'claude-sonnet-4-6';
    const { db, rows } = makeFakeDb();
    await setPersistedDefaultModel(db, 'mistral-small-latest');
    expect(getEffectiveDefaultModel()).toBe('mistral-small-latest');
    await setPersistedDefaultModel(db, null);
    expect(rows.has('default_model')).toBe(false);
    expect(getEffectiveDefaultModel()).toBe('claude-sonnet-4-6');
  });

  it('returns undefined when neither Settings nor env define a default', async () => {
    const { db } = makeFakeDb();
    initDefaultModelStore(db);
    await new Promise((r) => setTimeout(r, 0));
    expect(getEffectiveDefaultModel()).toBeUndefined();
  });
});

describe('provider-router follows the persisted default model (2.12)', () => {
  it('routes specialty calls to Mistral when the Settings choice is mistral-*, even with an Anthropic key', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    process.env.MISTRAL_API_KEY = 'k';
    const { db } = makeFakeDb();
    await setPersistedDefaultModel(db, 'mistral-large-latest');
    expect(mapModelToProvider('claude-sonnet-4-6')).toBe('mistral-medium-latest'); // medium tier
    expect(resolveModel('large')).toBe('mistral-large-latest');
  });

  it('uses the persisted local model id for every tier (ollama:*)', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    const { db } = makeFakeDb();
    await setPersistedDefaultModel(db, 'ollama:qwen2.5');
    expect(mapModelToProvider('claude-opus-4-8')).toBe('ollama:qwen2.5');
    expect(resolveModel('small')).toBe('ollama:qwen2.5');
  });

  it('persisted Settings choice overrides a conflicting env DEFAULT_MODEL', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    process.env.MISTRAL_API_KEY = 'k';
    process.env.DEFAULT_MODEL = 'claude-opus-4-8';
    const { db } = makeFakeDb();
    await setPersistedDefaultModel(db, 'compat:openrouter:qwen/qwen-2.5-72b');
    expect(mapModelToProvider('claude-haiku-4-5-20251001')).toBe('compat:openrouter:qwen/qwen-2.5-72b');
  });

  it('a persisted claude-* choice leaves Claude behaviour unchanged', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    process.env.MISTRAL_API_KEY = 'k';
    const { db } = makeFakeDb();
    await setPersistedDefaultModel(db, 'claude-opus-4-8');
    expect(mapModelToProvider('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(resolveModel('large')).toBe('claude-opus-4-8');
  });
});
