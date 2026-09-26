/**
 * compat-window-and-truncation.test.ts — two 2026-09-25 review fixes on
 * compat:<slug>:<model> models.
 *
 * C10: the knowledge budget reserved 8,192 output tokens while a Work run sends
 * 16,384 plus up to 16,384 of reasoning room, and the window came from
 * OpenRouter's model-level context_length (the largest any provider serves),
 * so a large-document run passed the budget and then got an HTTP 400 no retry
 * could help. The budget now reserves what is sent; the window is the smaller
 * of the model's and its top provider's. /models pricing is kept too, to price
 * a call that was cut short (C1).
 *
 * C11: on the two routers a compat answer cut off at the output limit came
 * back as complete — the adapter's warning and finish_reason were dropped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response as ExpressResponse } from 'express';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { metaFromListingEntry, normalizeModelMeta, setRouterDb } from '../../server/services/compat-endpoint.js';
import { resolveContextBudget, resolveCompatInputWindow } from '../../server/services/context-budget.js';
import { invalidateCustomEndpointCache } from '../../server/services/custom-endpoint-resolver.js';
import { callChat, streamChat } from '../../server/services/provider-router.js';
import { sendRequest, streamToResponse } from '../../server/services/unified-llm-client.js';
import { COMPAT_TRUNCATED_WARNING } from '../../server/services/adapters/openaiCompatibleAdapter.js';

const GLM = 'compat:or:z-ai/glm-5.3-flash';

function endpointDb(opts: { contextWindow?: number | null; maxOutputTokens?: number | null; meta?: Record<string, unknown> } = {}): DatabaseAdapter {
  return {
    all: vi.fn(async () => [{
      id: 1, slug: 'or', display_name: 'OR', base_url: 'https://openrouter.test/api/v1', api_key_encrypted: null,
      default_model: 'z-ai/glm-5.3-flash', available_models: [], context_window: opts.contextWindow ?? null, extra_headers: {},
      enabled: true, notes: null, created_at: '', updated_at: '',
      extra_body: {}, allowed_models: [], max_output_tokens: opts.maxOutputTokens ?? null, model_meta: opts.meta ?? {},
    }]),
    get: vi.fn(async () => ({ total: 0 })),
    run: vi.fn(async () => ({ changes: 1 })),
  } as unknown as DatabaseAdapter;
}

beforeEach(() => { invalidateCustomEndpointCache(); setRouterDb(null); delete process.env.MAX_CONTEXT_TOKENS; });
afterEach(() => { invalidateCustomEndpointCache(); setRouterDb(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('what the health check keeps from /models (C10, C1)', () => {
  it('takes the smaller of the model\'s window and its top provider\'s', () => {
    // qwen3-32b on OpenRouter: 131072 at model level, 40960 at its top provider.
    expect(metaFromListingEntry({ id: 'qwen/qwen3-32b', context_length: 131_072, top_provider: { context_length: 40_960 } }).contextLength).toBe(40_960);
    // negative control: one number alone is kept as it is
    expect(metaFromListingEntry({ id: 'x', context_length: 131_072 }).contextLength).toBe(131_072);
    expect(metaFromListingEntry({ id: 'x', top_provider: { context_length: 65_536 } }).contextLength).toBe(65_536);
  });

  it('keeps the list price, per million tokens, and drops a router\'s -1', () => {
    const meta = metaFromListingEntry({ id: 'z-ai/glm-5.3-flash', pricing: { prompt: '0.000000165', completion: '0.00000055' } });
    expect(meta.pricing).toEqual({ inputPerMillion: 0.165, outputPerMillion: 0.55 });
    expect(metaFromListingEntry({ id: 'openrouter/auto', pricing: { prompt: '-1', completion: '-1' } }).pricing).toBeUndefined();
    // …and it survives the round trip through the stored model_meta.
    expect(normalizeModelMeta(meta)?.pricing).toEqual({ inputPerMillion: 0.165, outputPerMillion: 0.55 });
  });
});

describe('the knowledge budget of a compat model (C10)', () => {
  it('reserves the max_tokens a run actually sends, reasoning room included', async () => {
    // A 131072 window, a reasoning model: the most a run sends is 16384 + 16384.
    const db = endpointDb({ meta: { 'z-ai/glm-5.3-flash': { contextLength: 131_072, reasoning: { mandatory: true, supportedEfforts: ['low', 'high', 'max'] } } } });
    expect(await resolveContextBudget(GLM, db)).toBe(131_072 - 32_768 - 8_000);
    // The Work route passes what it will send for this run's level.
    expect(await resolveContextBudget(GLM, db, { outputTokens: 24_576 })).toBe(131_072 - 24_576 - 8_000);
  });

  it('negative control: a model that does not reason reserves the run\'s 16k, not more', async () => {
    const db = endpointDb({ meta: { 'z-ai/glm-5.3-flash': { contextLength: 131_072 } } });
    expect(await resolveContextBudget(GLM, db)).toBe(131_072 - 16_384 - 8_000);
  });

  it('is clamped to the endpoint\'s output ceiling', async () => {
    const db = endpointDb({ maxOutputTokens: 4_096, meta: { 'z-ai/glm-5.3-flash': { contextLength: 65_536, reasoning: { mandatory: true } } } });
    expect(await resolveContextBudget(GLM, db)).toBe(65_536 - 4_096 - 8_000);
  });

  it('holds a run\'s whole input to 128k when nothing states the window', async () => {
    expect(await resolveCompatInputWindow(GLM, endpointDb())).toBe(131_072);
    invalidateCustomEndpointCache();
    expect(await resolveCompatInputWindow(GLM, endpointDb({ meta: { 'z-ai/glm-5.3-flash': { contextLength: 40_960 } } }))).toBe(40_960);
  });
});

// ── C11: a cut-off answer on the routers ────────────────────────────────────

function cutOffJson() {
  return vi.fn(async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'Slide 1 … Slide 4 and the' }, finish_reason: 'length' }],
    usage: { prompt_tokens: 10, completion_tokens: 500, cost: 0.001 },
  }), { status: 200 }));
}

function completeJson() {
  return vi.fn(async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'All five slides.' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 50, cost: 0.001 },
  }), { status: 200 }));
}

function cutOffStream() {
  const body = [
    { choices: [{ delta: { content: 'Section 1. Section 2. Sect' } }] },
    { choices: [{ delta: {}, finish_reason: 'length' }], usage: { prompt_tokens: 50, completion_tokens: 20, cost: 0.0001 } },
  ].map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return vi.fn(async () => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
}

function fakeRes() {
  const writes: string[] = [];
  const res = {
    headersSent: true,
    writeHead: () => undefined,
    write: (c: string) => { writes.push(c); return true; },
    end: () => undefined,
  };
  const frames = () => writes.join('').split('\n').filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
    .map((l) => JSON.parse(l.slice(6)) as { type?: string; code?: string; message?: string });
  return { res: res as unknown as ExpressResponse, frames };
}

describe('provider-router passes a truncation on (C11)', () => {
  it('callChat returns the finish reason and the warning', async () => {
    vi.stubGlobal('fetch', cutOffJson());
    const out = await callChat({ model: GLM, system: 's', messages: [{ role: 'user', content: 'x' }], db: endpointDb() });
    expect(out.finishReason).toBe('length');
    expect(out.warning).toBe(COMPAT_TRUNCATED_WARNING);
  });

  it('negative control: a complete answer carries no warning', async () => {
    vi.stubGlobal('fetch', completeJson());
    const out = await callChat({ model: GLM, system: 's', messages: [{ role: 'user', content: 'x' }], db: endpointDb() });
    expect(out.finishReason).toBe('stop');
    expect(out.warning).toBeUndefined();
  });

  it('streamChat writes a warning frame and returns the warning', async () => {
    vi.stubGlobal('fetch', cutOffStream());
    const { res, frames } = fakeRes();
    const out = await streamChat({ model: GLM, system: 's', messages: [{ role: 'user', content: 'x' }], db: endpointDb() }, res);
    expect(out.warning).toBe(COMPAT_TRUNCATED_WARNING);
    expect(frames().find((f) => f.type === 'warning')).toMatchObject({ code: 'output_truncated', message: COMPAT_TRUNCATED_WARNING });
  });
});

describe('unified-llm-client passes a truncation on (C11)', () => {
  it('sendRequest returns the finish reason and the warning', async () => {
    vi.stubGlobal('fetch', cutOffJson());
    const out = await sendRequest({ model: GLM, thinking: 'quick', system: 's', messages: [{ role: 'user', content: 'q' }], db: endpointDb() });
    expect(out.finishReason).toBe('length');
    expect(out.warning).toBe(COMPAT_TRUNCATED_WARNING);
  });

  it('negative control: sendRequest on a complete answer has no warning', async () => {
    vi.stubGlobal('fetch', completeJson());
    const out = await sendRequest({ model: GLM, thinking: 'quick', system: 's', messages: [{ role: 'user', content: 'q' }], db: endpointDb() });
    expect(out.finishReason).toBe('stop');
    expect(out.warning).toBeUndefined();
  });

  it('streamToResponse sends a warning before message_stop and hands it to onComplete', async () => {
    vi.stubGlobal('fetch', cutOffStream());
    const { res, frames } = fakeRes();
    const onComplete = vi.fn();
    await streamToResponse({ model: GLM, thinking: 'quick', system: 's', messages: [{ role: 'user', content: 'q' }], db: endpointDb() }, res, onComplete);
    const types = frames().map((f) => f.type);
    expect(types.indexOf('warning')).toBeGreaterThan(-1);
    expect(types.indexOf('warning')).toBeLessThan(types.indexOf('message_stop'));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ finishReason: 'length', warning: COMPAT_TRUNCATED_WARNING }));
  });
});
