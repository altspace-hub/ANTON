/**
 * tabular-review-executor-routing.test.ts — tabular review cells run through
 * the router on the Settings tiers (Wave 6, track I).
 *
 * The executor used to hand the playbook's literal Haiku id to callSync, the
 * API-bound helper: with ANTHROPIC_API_KEY present every cell of every grid
 * billed the key, whatever the Settings default; without one every cell
 * failed. Tier resolution here is real (env pinned); callChat is faked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { StreamChatConfig, ChatResult } from '../../server/services/provider-router.js';

const state = vi.hoisted(() => ({
  calls: [] as StreamChatConfig[],
  reply: async (_cfg: StreamChatConfig): Promise<ChatResult> => ({
    text: '{"status":"covered","evidence":"We screen customers daily.","rationale":"Explicit."}',
    thinking: '', inputTokens: 1, outputTokens: 1,
  }),
}));

vi.mock('../../server/services/provider-router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/provider-router.js')>();
  return {
    ...actual,
    callChat: vi.fn(async (cfg: StreamChatConfig) => { state.calls.push(cfg); return state.reply(cfg); }),
  };
});

import { startRun, resolveCellModel } from '../../server/services/tabular-review-executor.js';
import { AMLR_OBLIGATION_MAPPING } from '../../server/services/tabular-review-playbooks.js';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  state.calls.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

function fakeDb(): DatabaseAdapter & { runs: Array<{ sql: string; params: unknown[] }> } {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  return {
    dialect: 'postgresql',
    runs,
    async get() { return undefined; },
    async all() { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> { runs.push({ sql, params }); return { changes: 1, lastInsertRowid: 0 }; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter & { runs: Array<{ sql: string; params: unknown[] }> };
}

const playbook = { ...AMLR_OBLIGATION_MAPPING, columns: AMLR_OBLIGATION_MAPPING.columns.slice(0, 2) };
const documents = [{ docId: 'doc-1', fileName: 'policy.docx', text: 'We screen customers daily against sanctions lists.' }];

describe('tabular review cells on the subscription-engine default (API key also present)', () => {
  beforeEach(() => {
    process.env.DEFAULT_MODEL = 'sdk:claude-opus-5';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  });

  it('calls callChat per cell with the routed utility model — not the playbook literal — as background JSON work', async () => {
    const db = fakeDb();
    await startRun(db, { runId: 'run-1', documents, playbook });

    expect(playbook.defaultModel).toBe('claude-haiku-4-5-20251001');
    expect(state.calls).toHaveLength(2);
    for (const cfg of state.calls) {
      expect(cfg.model).toBe('sdk:claude-sonnet-5');
      expect(cfg.model?.startsWith('claude-')).toBe(false);
      expect(cfg.background).toBe(true);
      expect(cfg.jsonMode).toBe(true);
      expect(cfg.thinkingLevel).toBe('quick');
      expect(cfg.db).toBe(db);
    }

    // model_used records what actually ran; each cell lands as covered.
    const started = db.runs.filter((r) => r.sql.includes('tabular_review_cells') && r.sql.includes("SET status = 'running', started_at"));
    expect(started.map((r) => r.params[1])).toEqual(['sdk:claude-sonnet-5', 'sdk:claude-sonnet-5']);
    const done = db.runs.filter((r) => r.sql.includes('SET status = $1, result = $2'));
    expect(done.map((r) => r.params[0])).toEqual(['covered', 'covered']);
    expect(db.runs.some((r) => r.sql.includes("SET status = 'done'"))).toBe(true);
  });

  it('a failed routed call marks the cell as error and the run still completes', async () => {
    const db = fakeDb();
    state.reply = async () => { throw new Error('SDK engine busy'); };
    try {
      await startRun(db, { runId: 'run-2', documents, playbook: { ...playbook, columns: playbook.columns.slice(0, 1) } });
    } finally {
      state.reply = async () => ({ text: '{"status":"missing","evidence":"","rationale":"Silent."}', thinking: '', inputTokens: 1, outputTokens: 1 });
    }
    const errored = db.runs.find((r) => r.sql.includes("SET status = 'error', error = $1"));
    expect(errored?.params[0]).toBe('SDK engine busy');
    expect(db.runs.some((r) => r.sql.includes("SET status = 'done'"))).toBe(true);
  });

  it('larger playbook tiers keep their tier on the configured engine', async () => {
    const db = fakeDb();
    expect(await resolveCellModel(db, { defaultModel: 'claude-sonnet-4-6' })).toBe('sdk:claude-sonnet-5');
    expect(await resolveCellModel(db, { defaultModel: 'claude-opus-4-8' })).toBe('sdk:claude-opus-5');
  });
});

describe('tabular review cells on a Mistral-only install', () => {
  it('resolve to the Mistral utility tier instead of failing against a missing Anthropic key', async () => {
    process.env.MISTRAL_API_KEY = 'mk-test';
    expect(await resolveCellModel(fakeDb(), playbook)).toBe('mistral-small-latest');
  });
});
