/**
 * pathfinder-router-routing.test.ts — Pathfinder's model calls go through the
 * router and follow Settings (Wave 6, track I).
 *
 * Pathfinder used to construct its own Anthropic client for the web search,
 * the streamed synthesis and Deep mode's tool-use reflection, with literal
 * Haiku / Sonnet 4.6 ids — so with ANTHROPIC_API_KEY in .env it billed the key
 * even when the Settings default was the subscription engine. Here the tier
 * resolution is real (env pinned per test); only callChat / streamChat, the
 * local-knowledge search and Bing are faked, so the assertions are about which
 * model and tools each call was handed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../../server/db/database.js';
import type { StreamChatConfig, ChatResult } from '../../../server/services/provider-router.js';

const calls = vi.hoisted(() => ({
  callChat: [] as StreamChatConfig[],
  streamChat: [] as StreamChatConfig[],
}));

vi.mock('../../../server/services/provider-router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/services/provider-router.js')>();
  return {
    ...actual,
    callChat: vi.fn(async (cfg: StreamChatConfig): Promise<ChatResult> => {
      calls.callChat.push(cfg);
      const usage = { thinking: '', inputTokens: 10, outputTokens: 20 };
      if (cfg.tools?.some((t) => t.name === 'web_search')) {
        return {
          ...usage,
          text: '**Key Findings**\n- AMLR applies from 2027.\n\n**Sources**\n- [EBA guidelines](https://www.eba.europa.eu/guidelines).\n- https://eur-lex.europa.eu/eli/reg/2024/1624/oj',
        };
      }
      if (cfg.messages[0]?.content.includes('## Confidence verdict')) {
        return { ...usage, text: 'The analysis holds up.\n{"confidence": 0.92, "revision_needed": false, "gaps": ""}' };
      }
      return { ...usage, text: 'Structured analysis.' };
    }),
    streamChat: vi.fn(async (cfg: StreamChatConfig, res: { write: (s: string) => boolean }): Promise<ChatResult> => {
      calls.streamChat.push(cfg);
      res.write(`data: ${JSON.stringify({ type: 'text_delta', content: 'Synthesis.' })}\n\n`);
      return { text: 'Synthesis.', thinking: '', inputTokens: 5, outputTokens: 5 };
    }),
  };
});

vi.mock('../../../server/services/hybrid-search.js', () => ({
  hybridSearch: vi.fn(async () => []),
  INSTANCE_WIDE_SEARCH: { kind: 'instance' },
}));
vi.mock('../../../server/services/bing-search.js', () => ({
  getBingSearchApiKey: vi.fn(async () => null),
  searchBing: vi.fn(async () => ({ results: [] })),
}));

import {
  dispatchDeepSearch,
  dispatchQuickSearch,
  getAvailableSearchModels,
  parseConfidenceAssessment,
  type SearchCallbacks,
} from '../../../server/services/pathfinder-engine.js';
import { INSTANCE_WIDE_SEARCH } from '../../../server/services/hybrid-search.js';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL', 'BING_SEARCH_API_KEY'] as const;
let savedEnv: Record<string, string | undefined> = {};

function setEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  calls.callChat.length = 0;
  calls.streamChat.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
});

function fakeDb(): DatabaseAdapter & { runs: string[] } {
  const runs: string[] = [];
  return {
    dialect: 'postgresql',
    runs,
    async get() { return undefined; },           // no persisted utility model
    async all() { return []; },
    async run(sql: string): Promise<RunResult> { runs.push(sql); return { changes: 1, lastInsertRowid: 0 }; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter & { runs: string[] };
}

function callbacks(): SearchCallbacks & { notices: string[]; started: Array<[string, string]> } {
  const notices: string[] = [];
  const started: Array<[string, string]> = [];
  return {
    notices,
    started,
    onSearchStart: vi.fn(),
    onPreSearchReasoning: vi.fn(),
    onModelStart: (modelId: string, role: string) => { started.push([modelId, role]); },
    onModelComplete: vi.fn(),
    onSynthesisStart: vi.fn(),
    onTextDelta: vi.fn(),
    onThinkingDelta: vi.fn(),
    onSearchComplete: vi.fn(),
    onError: vi.fn(),
    onNotice: (m: string) => { notices.push(m); },
  };
}

const allModels = () => [...calls.callChat, ...calls.streamChat].map((c) => c.model ?? `tier:${c.tier}`);

describe('Deep search on the subscription-engine default (API key also present)', () => {
  it('runs every phase on sdk: models through the router — never a literal claude-* id', async () => {
    setEnv({ DEFAULT_MODEL: 'sdk:claude-opus-5', ANTHROPIC_API_KEY: 'sk-ant-test' });
    const db = fakeDb();
    const cb = callbacks();

    const result = await dispatchDeepSearch(db, 'AMLR start date', 'u1', INSTANCE_WIDE_SEARCH, null, '', null, cb);

    const models = allModels();
    expect(models.length).toBeGreaterThanOrEqual(4); // search, analysis, reflection, synthesis
    expect(models.every((m) => m.startsWith('sdk:'))).toBe(true);
    expect(models.some((m) => m.startsWith('claude-'))).toBe(false);

    // Web search: the routed utility model (small tier → Sonnet 5 on the engine) with ANTON's web_search tool.
    const search = calls.callChat.find((c) => c.tools?.some((t) => t.name === 'web_search'));
    expect(search?.model).toBe('sdk:claude-sonnet-5');
    // Deep phases and the chairman synthesis: the medium tier.
    const phases = calls.callChat.filter((c) => !c.tools);
    expect(phases.map((c) => c.model)).toEqual(['sdk:claude-sonnet-5', 'sdk:claude-sonnet-5']);
    expect(calls.streamChat.map((c) => c.model)).toEqual(['sdk:claude-sonnet-5']);

    // Sources are read back from the links the answer cites.
    expect(result.webSources.map((s) => s.url)).toEqual([
      'https://www.eba.europa.eu/guidelines',
      'https://eur-lex.europa.eu/eli/reg/2024/1624/oj',
    ]);

    // Reflection runs on the engine now (it used to need the Anthropic tool_use API):
    // confidence 0.92 is read from the JSON verdict, so no Deepening phase.
    const reflection = result.modelResults.find((r) => r.role === 'Reflection');
    expect(reflection?.confidenceScore).toBe(0.92);
    expect(reflection?.response).toBe('The analysis holds up.');
    expect(result.modelResults.some((r) => r.role === 'Deepening')).toBe(false);
    expect(result.modelResults.filter((r) => r.role !== 'Web Search').every((r) => r.provider === 'anthropic_sdk')).toBe(true);
    expect(cb.notices).toEqual([]);
    expect(db.runs.some((s) => s.includes('INSERT INTO pathfinder_searches'))).toBe(true);
  });
});

describe('Quick search on an Anthropic API install', () => {
  it('uses the tier ids the router resolves for the configured provider, with web search', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' });
    await dispatchQuickSearch(fakeDb(), 'AMLR start date', 'u1', INSTANCE_WIDE_SEARCH, null, '', null, callbacks());
    const search = calls.callChat.find((c) => c.tools?.some((t) => t.name === 'web_search'));
    // DEFAULT_UTILITY_MODEL, routed: on the API provider the router keeps the Haiku tier.
    expect(search?.model).toBe('claude-haiku-4-5-20251001');
    expect(calls.streamChat).toHaveLength(1);
    expect(calls.streamChat[0].model).toBe('claude-haiku-4-5-20251001');
    expect(calls.streamChat[0].thinkingLevel).toBe('think_hard');
  });
});

describe('Quick search on a provider that cannot search the web', () => {
  it('never hands a web_search tool to Mistral: Bing (absent here) is skipped with a notice', async () => {
    setEnv({ MISTRAL_API_KEY: 'mk-test' });
    const cb = callbacks();
    await dispatchQuickSearch(fakeDb(), 'AMLR start date', 'u1', INSTANCE_WIDE_SEARCH, null, '', null, cb);
    expect(calls.callChat.some((c) => c.tools?.length)).toBe(false);
    expect(calls.streamChat.map((c) => c.model)).toEqual(['mistral-small-latest']);
    expect(cb.notices.join(' ')).toMatch(/web search/i);
  });
});

describe('getAvailableSearchModels on the subscription engine', () => {
  it('reports the engine models, available without a key', () => {
    setEnv({ DEFAULT_MODEL: 'sdk:claude-opus-5' });
    const models = getAvailableSearchModels();
    expect(models.map((m) => [m.role, m.modelId, m.provider, m.available])).toEqual([
      ['Web Search', 'sdk:claude-sonnet-5', 'anthropic_sdk', true],
      ['Analysis (Quick/Thorough)', 'sdk:claude-sonnet-5', 'anthropic_sdk', true],
      ['Chairman Synthesis', 'sdk:claude-sonnet-5', 'anthropic_sdk', true],
    ]);
  });
});

describe('parseConfidenceAssessment', () => {
  it('reads a trailing JSON verdict and strips it from the text', () => {
    const v = parseConfidenceAssessment('Gaps remain.\n{"confidence": 0.4, "revision_needed": true, "gaps": "no 2027 source"}');
    expect(v).toEqual({ confidence: 0.4, revisionNeeded: true, gaps: 'no 2027 source', body: 'Gaps remain.' });
  });

  it('reads a fenced verdict', () => {
    const v = parseConfidenceAssessment('Fine.\n```json\n{"confidence": 0.85, "revision_needed": false, "gaps": ""}\n```');
    expect(v.confidence).toBe(0.85);
    expect(v.revisionNeeded).toBe(false);
    expect(v.gaps).toBeUndefined();
    expect(v.body).toBe('Fine.');
  });

  it('clamps an out-of-range score', () => {
    expect(parseConfidenceAssessment('{"confidence": 7}').confidence).toBe(1);
  });

  it('leaves the score undefined — never guessed — when the verdict is missing or malformed', () => {
    expect(parseConfidenceAssessment('No verdict at all.')).toEqual({ body: 'No verdict at all.' });
    expect(parseConfidenceAssessment('Broken {"confidence": 0.7,').confidence).toBeUndefined();
  });
});
