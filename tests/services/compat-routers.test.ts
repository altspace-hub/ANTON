/**
 * compat-routers.test.ts — both routers on a compat:<slug>:<model> model.
 *
 *   provider-router (callChat / streamChat) — about sixty call sites pass no
 *   `db`; on a compat default each threw "Database adapter required …". They
 *   now resolve through the database registered at boot (setRouterDb). The
 *   endpoint's allowed-model list and the daily spend caps apply before any
 *   request leaves, and the call's cost comes back in the result.
 *
 *   unified-llm-client (Civic, Grow, Procure, the companion app) — a bare
 *   claude-* id now follows the configured engine at the entry, as every
 *   provider-router call does; before, a server with no Anthropic key failed
 *   with "API key not configured for provider: anthropic". Images reach a
 *   vision model as image parts, not as JSON-stringified base64 text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response as ExpressResponse } from 'express';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { callChat, streamChat } from '../../server/services/provider-router.js';
import { sendRequest } from '../../server/services/unified-llm-client.js';
import { setRouterDb } from '../../server/services/compat-endpoint.js';
import { invalidateCustomEndpointCache } from '../../server/services/custom-endpoint-resolver.js';
import { SpendCapError } from '../../server/services/llm-spend.js';

const ENV = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL', 'LLM_DAILY_SPEND_CAP_USD', 'LLM_USER_DAILY_SPEND_CAP_USD'] as const;
let saved: Record<string, string | undefined> = {};

const GLM = 'compat:openrouter:z-ai/glm-5.3-flash';

/** One OpenRouter endpoint row + a ledger that answers SUM queries with `spentToday`. */
function fakeDb(opts: { allowed?: string[]; spentToday?: number; meta?: Record<string, unknown> } = {}) {
  const ledgerRows: unknown[][] = [];
  const db = {
    all: vi.fn(async () => [{
      id: 1, slug: 'openrouter', display_name: 'OpenRouter', base_url: 'https://openrouter.test/api/v1',
      api_key_encrypted: null, default_model: 'z-ai/glm-5.3-flash', available_models: [], context_window: null,
      extra_headers: {}, enabled: true, notes: null, created_at: '', updated_at: '',
      extra_body: { provider: { only: ['inceptron', 'nextbit'], allow_fallbacks: false } },
      allowed_models: opts.allowed ?? [],
      max_output_tokens: null,
      model_meta: opts.meta ?? {},
    }]),
    get: vi.fn(async () => ({ total: opts.spentToday ?? 0 })),
    run: vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('llm_spend_ledger')) ledgerRows.push(args);
      return { changes: 1 };
    }),
  } as unknown as DatabaseAdapter;
  return { db, ledgerRows };
}

function okJson(content: string, cost = 0.002) {
  return vi.fn(async () => new Response(JSON.stringify({
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, cost },
  }), { status: 200 }));
}

function fakeRes() {
  const writes: string[] = [];
  return { writes, res: { write: (c: string) => { writes.push(c); return true; }, headersSent: true } as unknown as ExpressResponse };
}

beforeEach(() => {
  saved = {};
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  invalidateCustomEndpointCache();
  setRouterDb(null);
});
afterEach(() => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  invalidateCustomEndpointCache();
  setRouterDb(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('provider-router on a compat model', () => {
  it('runs a call that passes no db, through the database registered at boot', async () => {
    const { db, ledgerRows } = fakeDb();
    setRouterDb(db);
    const fetchMock = okJson('rendered');
    vi.stubGlobal('fetch', fetchMock);

    const out = await callChat({ model: GLM, system: 'Render a board deck.', messages: [{ role: 'user', content: 'x' }] });

    expect(out.text).toBe('rendered');
    expect(out.costUsd).toBeCloseTo(0.002);
    const body = JSON.parse(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string);
    expect(body.model).toBe('z-ai/glm-5.3-flash');
    expect(body.provider).toEqual({ only: ['inceptron', 'nextbit'], allow_fallbacks: false });
    expect(ledgerRows).toHaveLength(1);
  });

  it('still fails clearly when no database was registered and none passed', async () => {
    vi.stubGlobal('fetch', okJson('x'));
    await expect(callChat({ model: GLM, system: 's', messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(/Database adapter required/);
  });

  it('refuses a model outside the endpoint\'s allowed list without sending anything', async () => {
    const { db } = fakeDb({ allowed: ['z-ai/glm-5.3-flash'] });
    const fetchMock = okJson('x');
    vi.stubGlobal('fetch', fetchMock);
    await expect(callChat({ model: 'compat:openrouter:openai/o5-pro', system: 's', messages: [{ role: 'user', content: 'x' }], db }))
      .rejects.toMatchObject({ code: 'MODEL_NOT_ALLOWED' });
    await expect(streamChat({ model: 'compat:openrouter:openai/o5-pro', system: 's', messages: [{ role: 'user', content: 'x' }], db }, fakeRes().res))
      .rejects.toMatchObject({ code: 'MODEL_NOT_ALLOWED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops at the daily spend cap before dispatch, on both entry points', async () => {
    process.env.LLM_DAILY_SPEND_CAP_USD = '1';
    const { db } = fakeDb({ spentToday: 1.5 });
    const fetchMock = okJson('x');
    vi.stubGlobal('fetch', fetchMock);
    await expect(callChat({ model: GLM, system: 's', messages: [{ role: 'user', content: 'x' }], db })).rejects.toBeInstanceOf(SpendCapError);
    await expect(streamChat({ model: GLM, system: 's', messages: [{ role: 'user', content: 'x' }], db }, fakeRes().res)).rejects.toBeInstanceOf(SpendCapError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs below the cap (negative control)', async () => {
    process.env.LLM_DAILY_SPEND_CAP_USD = '1';
    const { db } = fakeDb({ spentToday: 0.5 });
    vi.stubGlobal('fetch', okJson('fine'));
    await expect(callChat({ model: GLM, system: 's', messages: [{ role: 'user', content: 'x' }], db })).resolves.toMatchObject({ text: 'fine' });
  });

  it('sends the thinking level as reasoning effort to a model that reasons', async () => {
    const { db } = fakeDb({ meta: { 'z-ai/glm-5.3-flash': { reasoning: { mandatory: true, supportedEfforts: ['low', 'high', 'max'] } } } });
    const fetchMock = okJson('x');
    vi.stubGlobal('fetch', fetchMock);
    await callChat({ model: GLM, system: 's', messages: [{ role: 'user', content: 'x' }], db, thinkingLevel: 'quick' });
    const body = JSON.parse(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string);
    expect(body.reasoning).toEqual({ effort: 'low' });
  });
});

describe('unified-llm-client on a compat default', () => {
  it('maps a bare claude-* id to the configured compat model instead of failing on the missing Anthropic key', async () => {
    process.env.DEFAULT_MODEL = GLM;
    const { db } = fakeDb();
    const fetchMock = okJson('civic answer');
    vi.stubGlobal('fetch', fetchMock);

    const out = await sendRequest({
      model: 'claude-sonnet-4-6',
      thinking: 'quick',
      system: 'You help with a civic question.',
      messages: [{ role: 'user', content: 'q' }],
      db,
    });

    expect(out.text).toBe('civic answer');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.test/api/v1/chat/completions');
    expect(JSON.parse(init.body as string).model).toBe('z-ai/glm-5.3-flash');
  });

  it('sends an image to a vision model as an image part, not as base64 text', async () => {
    const { db } = fakeDb({ meta: { 'vendor/vl': { inputModalities: ['text', 'image'] } } });
    const fetchMock = okJson('a cat');
    vi.stubGlobal('fetch', fetchMock);
    await sendRequest({
      model: 'compat:openrouter:vendor/vl',
      thinking: 'quick',
      system: 's',
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
        { type: 'text', text: 'What is this?' },
      ] }],
      db,
    });
    const body = JSON.parse(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string);
    const user = body.messages[1];
    expect(user.content).toEqual([
      { type: 'text', text: 'What is this?' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
    ]);
  });

  it('stops at the spend cap at the entry', async () => {
    process.env.LLM_DAILY_SPEND_CAP_USD = '0.5';
    const { db } = fakeDb({ spentToday: 0.5 });
    const fetchMock = okJson('x');
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendRequest({ model: GLM, thinking: 'quick', system: 's', messages: [{ role: 'user', content: 'q' }], db }))
      .rejects.toBeInstanceOf(SpendCapError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
