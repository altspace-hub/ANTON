/**
 * context-budget.test.ts — unit tests for capability-aware context
 * budgeting (plan 2.15).
 *
 * Covers:
 *   • registry-known models (Claude 1M, Mistral 128k, Haiku 200k)
 *   • the 800k long-context budget for 1M models (historical behaviour)
 *   • env MAX_CONTEXT_TOKENS as a global cap
 *   • ollama:* fallback to 32k when Ollama is unreachable
 *   • compat:* per-endpoint context_window (migration 215) + 32k default
 *   • num_ctx clamping (model window vs 32k/OLLAMA_NUM_CTX)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  resolveContextWindow,
  resolveContextBudget,
  resolveOllamaNumCtx,
  resetOllamaWindowCacheForTests,
} from '../../server/services/context-budget.js';
import { invalidateCustomEndpointCache } from '../../server/services/custom-endpoint-resolver.js';

const ENV_KEYS = ['MAX_CONTEXT_TOKENS', 'OLLAMA_BASE_URL', 'OLLAMA_NUM_CTX', 'OLLAMA_AUTH_TOKEN'] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  // Unroutable port — forces the Ollama probe down the unreachable path fast.
  process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';
  resetOllamaWindowCacheForTests();
  invalidateCustomEndpointCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  resetOllamaWindowCacheForTests();
  invalidateCustomEndpointCache();
});

/** Fake adapter exposing one enabled custom_model_endpoints row. */
function makeEndpointDb(contextWindow: number | null): DatabaseAdapter {
  const row = {
    id: 1,
    slug: 'testep',
    display_name: 'Test EP',
    base_url: 'http://localhost:9999/v1',
    api_key_encrypted: null,
    default_model: 'test-model',
    available_models: [],
    context_window: contextWindow,
    extra_headers: {},
    enabled: true,
    notes: null,
    created_at: '',
    updated_at: '',
  };
  return {
    dialect: 'sqlite' as DatabaseAdapter['dialect'],
    async get() { return undefined; },
    async all<T>(sql: string): Promise<T[]> {
      if (sql.includes('custom_model_endpoints')) return [row as T];
      return [];
    },
    async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 } as RunResult; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  } as DatabaseAdapter;
}

describe('resolveContextWindow', () => {
  it('reads registry-known models from MODEL_CAPABILITIES', async () => {
    expect(await resolveContextWindow('claude-opus-4-8')).toBe(1_000_000);
    expect(await resolveContextWindow('claude-haiku-4-5-20251001')).toBe(200_000);
    expect(await resolveContextWindow('mistral-large-latest')).toBe(256_000);
  });

  it('falls back to 32k for ollama:* when Ollama is unreachable', async () => {
    expect(await resolveContextWindow('ollama:qwen2.5')).toBe(32_768);
  });

  it('uses the per-endpoint context_window for compat:* models', async () => {
    expect(await resolveContextWindow('compat:testep:test-model', makeEndpointDb(131_072))).toBe(131_072);
  });

  it('defaults compat:* to 32k when the endpoint has no context_window', async () => {
    expect(await resolveContextWindow('compat:testep:test-model', makeEndpointDb(null))).toBe(32_768);
  });

  it('defaults unknown ids to 32k (never the old 900k)', async () => {
    expect(await resolveContextWindow('totally-unknown-model')).toBe(32_768);
  });
});

describe('resolveContextBudget', () => {
  it('keeps the historical 800k budget for 1M-context models', async () => {
    expect(await resolveContextBudget('claude-opus-4-8')).toBe(800_000);
  });

  it('derives a window-minus-reserve budget for mid-size models', async () => {
    // Haiku: 200k − min(64k, 16,384) − 8k system reserve
    const haiku = await resolveContextBudget('claude-haiku-4-5-20251001');
    expect(haiku).toBeLessThan(200_000);
    expect(haiku).toBeGreaterThan(150_000);
    // Mistral Large: 256k window − 16,384 output reserve − 8k system reserve
    const mistral = await resolveContextBudget('mistral-large-latest');
    expect(mistral).toBe(256_000 - 16_384 - 8_000);
  });

  it('gives small local models a small budget (the 2.15 headline fix)', async () => {
    const budget = await resolveContextBudget('ollama:qwen2.5');
    expect(budget).toBeLessThanOrEqual(32_768);
    expect(budget).toBeGreaterThanOrEqual(4_096);
  });

  it('honours env MAX_CONTEXT_TOKENS as a global cap', async () => {
    process.env.MAX_CONTEXT_TOKENS = '50000';
    expect(await resolveContextBudget('claude-opus-4-8')).toBe(50_000);
    expect(await resolveContextBudget('mistral-large-latest')).toBeLessThanOrEqual(50_000);
  });
});

describe('resolveOllamaNumCtx', () => {
  it('caps at 32k by default (unreachable Ollama → 32k window)', async () => {
    expect(await resolveOllamaNumCtx('ollama:qwen2.5')).toBe(32_768);
  });

  it('honours the OLLAMA_NUM_CTX env override as the cap', async () => {
    process.env.OLLAMA_NUM_CTX = '8192';
    expect(await resolveOllamaNumCtx('ollama:qwen2.5')).toBe(8_192);
  });
});
