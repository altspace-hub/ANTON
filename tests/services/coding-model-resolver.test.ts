/**
 * coding-model-resolver.test.ts — ANTON Studio P0.
 *
 * Locks the ROLE-based coding-model mapping + the resolution precedence:
 *   explicit override > stored coding_model_strategy > role default
 * with the role default routed through mapModelToProvider (so a Claude user
 * gets the mapped Claude equivalent). Also asserts the four role-default
 * models exist in MODEL_REGISTRY and documents the devstral non-thinking gate.
 *
 * Env handling mirrors tests/services/mission-model-resolver.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CODING_ROLE_MODELS,
  resolveCodingModel,
  providerForCodingModel,
  missingCodingRoleModels,
  codingRoleSupportsThinking,
  isCodingRole,
  setCodingModelStrategy,
  resetCodingModelStrategyForTests,
  getCodingModelStrategySync,
  type CodingRole,
} from '../../server/services/coding-model-resolver.js';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let saved: Record<string, string | undefined>;

function onlyProvider(provider: 'anthropic' | 'mistral' | 'openai' | 'google'): void {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env[`${provider.toUpperCase()}_API_KEY`] = 'test-key';
}

// In-memory fake adapter (app_settings only) — mirrors default-model-store.test.ts.
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
    async all<T>(): Promise<T[]> { return [] as T[]; },
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

beforeEach(() => {
  saved = {}; for (const k of ENV_KEYS) saved[k] = process.env[k]; for (const k of ENV_KEYS) delete process.env[k];
  resetCodingModelStrategyForTests();
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  resetCodingModelStrategyForTests();
});

describe('CODING_ROLE_MODELS — the locked mapping', () => {
  it('maps each role to the user-specified Mistral tier', () => {
    expect(CODING_ROLE_MODELS).toEqual({
      orchestrator: 'mistral-large-latest',
      expert: 'mistral-medium-latest',
      codegen: 'devstral-medium-latest',
      utility: 'mistral-small-latest',
    });
  });

  it('every role default exists in MODEL_REGISTRY', () => {
    expect(missingCodingRoleModels()).toEqual([]);
  });

  it('isCodingRole guards the four roles', () => {
    for (const r of ['orchestrator', 'expert', 'codegen', 'utility']) expect(isCodingRole(r)).toBe(true);
    expect(isCodingRole('manager')).toBe(false);
    expect(isCodingRole(undefined)).toBe(false);
  });

  it('codegen is gated to non-thinking (devstral caveat); reasoning roles support thinking', () => {
    expect(codingRoleSupportsThinking('codegen')).toBe(false);
    expect(codingRoleSupportsThinking('orchestrator')).toBe(true);
    expect(codingRoleSupportsThinking('expert')).toBe(true);
    expect(codingRoleSupportsThinking('utility')).toBe(true);
  });
});

describe('resolveCodingModel — role defaults', () => {
  it('returns the Mistral role default when on Mistral, no override/strategy', () => {
    onlyProvider('mistral');
    expect(resolveCodingModel('orchestrator')).toBe('mistral-large-latest');
    expect(resolveCodingModel('expert')).toBe('mistral-medium-latest');
    expect(resolveCodingModel('codegen')).toBe('devstral-medium-latest');
    expect(resolveCodingModel('utility')).toBe('mistral-small-latest');
  });

  it('remaps the role default to the configured provider (Claude user)', () => {
    onlyProvider('anthropic');
    // Large→Opus, Medium→Sonnet, Small→Haiku. devstral isn't a Claude id, so
    // mapModelToProvider routes it via its (medium) tier → Sonnet.
    expect(resolveCodingModel('orchestrator')).toBe('claude-opus-4-8');
    expect(resolveCodingModel('expert')).toBe('claude-sonnet-4-6');
    expect(resolveCodingModel('utility')).toBe('claude-haiku-4-5-20251001');
    expect(resolveCodingModel('codegen')).toBe('claude-sonnet-4-6');
  });
});

describe('resolveCodingModel — precedence', () => {
  it('explicit override beats strategy and role default (when resolvable)', () => {
    onlyProvider('mistral');
    const strategy = { orchestrator: 'mistral-medium-latest' };
    expect(resolveCodingModel('orchestrator', { override: 'codestral-latest', strategy }))
      .toBe('codestral-latest');
  });

  it("ignores an 'auto' / unknown override and falls through", () => {
    onlyProvider('mistral');
    expect(resolveCodingModel('orchestrator', { override: 'auto' })).toBe('mistral-large-latest');
    expect(resolveCodingModel('orchestrator', { override: 'gpt-99-ultra' })).toBe('mistral-large-latest');
  });

  it('stored strategy beats the role default', () => {
    onlyProvider('mistral');
    const strategy = { codegen: 'codestral-latest' };
    expect(resolveCodingModel('codegen', { strategy })).toBe('codestral-latest');
  });

  it('accepts dynamic ollama:/compat: ids in the strategy', () => {
    onlyProvider('anthropic');
    expect(resolveCodingModel('expert', { strategy: { expert: 'ollama:qwen3:8b' } })).toBe('ollama:qwen3:8b');
    expect(resolveCodingModel('codegen', { strategy: { codegen: 'compat:groq:llama-3.3-70b' } }))
      .toBe('compat:groq:llama-3.3-70b');
  });

  it('a typo in the strategy falls back to the role default', () => {
    onlyProvider('mistral');
    expect(resolveCodingModel('utility', { strategy: { utility: 'mistral-bananas' } }))
      .toBe('mistral-small-latest');
  });
});

describe('resolveCodingModel — persisted strategy via the in-memory store', () => {
  it('reads the stored coding_model_strategy when no explicit strategy is passed', async () => {
    onlyProvider('mistral');
    const { db } = makeFakeDb();
    await setCodingModelStrategy(db, { codegen: 'codestral-latest', orchestrator: 'mistral-medium-latest' });
    // strategy omitted in opts → consults the cache
    expect(resolveCodingModel('codegen')).toBe('codestral-latest');
    expect(resolveCodingModel('orchestrator')).toBe('mistral-medium-latest');
    // role not in the stored map → role default
    expect(resolveCodingModel('utility')).toBe('mistral-small-latest');
  });

  it('clearing the strategy reverts to role defaults', async () => {
    onlyProvider('mistral');
    const { db, rows } = makeFakeDb();
    await setCodingModelStrategy(db, { codegen: 'codestral-latest' });
    expect(getCodingModelStrategySync()).toEqual({ codegen: 'codestral-latest' });
    await setCodingModelStrategy(db, null);
    expect(rows.has('coding_model_strategy')).toBe(false);
    expect(resolveCodingModel('codegen')).toBe('devstral-medium-latest');
  });

  it('an explicit strategy arg bypasses the cache', async () => {
    onlyProvider('mistral');
    const { db } = makeFakeDb();
    await setCodingModelStrategy(db, { codegen: 'codestral-latest' });
    // explicit null strategy → ignore the cached value, use role default
    expect(resolveCodingModel('codegen', { strategy: null })).toBe('devstral-medium-latest');
  });
});

describe('providerForCodingModel', () => {
  it('records the real provider for the activity log', () => {
    expect(providerForCodingModel('mistral-large-latest')).toBe('mistral');
    expect(providerForCodingModel('devstral-medium-latest')).toBe('mistral');
    expect(providerForCodingModel('ollama:qwen3:8b')).toBe('ollama');
    expect(providerForCodingModel('compat:groq:llama-3.3-70b')).toBe('openai_compatible');
  });

  it('falls back to anthropic for unclassifiable ids', () => {
    expect(providerForCodingModel('mystery-model')).toBe('anthropic');
  });
});

// Exhaustiveness guard: every CodingRole has a default model.
describe('role coverage', () => {
  it('CODING_ROLE_MODELS covers every CodingRole', () => {
    const roles: CodingRole[] = ['orchestrator', 'expert', 'codegen', 'utility'];
    for (const r of roles) expect(typeof CODING_ROLE_MODELS[r]).toBe('string');
  });
});
