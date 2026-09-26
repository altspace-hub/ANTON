/**
 * demo-privacy-pin.test.ts — on a public demo (DEMO_MODE=true) no request goes
 * to OpenRouter unless the endpoint's extra body carries the privacy pin:
 * provider.zdr = true, provider.data_collection = 'deny' and a non-empty
 * provider.only (privacy review H9, 2026-09-26).
 *
 * Before this the pin was only as good as the extra body an admin saved: an
 * edit or a lost row sent visitors' prompts to any provider, while the privacy
 * notice said every request asks for zero retention. The refusal is checked in
 * both places a call passes: the resolver every router and the Work route go
 * through (compat-endpoint.ts), and the adapter's one dispatch point. Each
 * refusal has a negative control: outside demo mode, a complete pin, and an
 * endpoint that is not OpenRouter all go through.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import {
  resolveCompatModel,
  setRouterDb,
  missingPrivacyPinSettings,
  isOpenRouterBaseUrl,
  assertDemoPrivacyPin,
  CompatPrivacyPinError,
  DEMO_PRIVACY_PIN_MESSAGE,
} from '../../server/services/compat-endpoint.js';
import { invalidateCustomEndpointCache } from '../../server/services/custom-endpoint-resolver.js';
import {
  callOpenAICompatible,
  streamOpenAICompatible,
  type OpenAICompatibleStreamParams,
} from '../../server/services/adapters/openaiCompatibleAdapter.js';
import { publicErrorMessage } from '../../server/lib/error-response.js';
import { OPENROUTER_EU_ZDR_EXTRA_BODY } from '../../src/lib/model-endpoint-form.js';

const PIN = { provider: { only: ['inceptron'], zdr: true, data_collection: 'deny' } };
const OPENROUTER = 'https://openrouter.ai/api/v1';

const savedDemo = process.env.DEMO_MODE;
const logged: string[] = [];
beforeEach(() => {
  invalidateCustomEndpointCache();
  setRouterDb(null);
  logged.length = 0;
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });
});
afterEach(() => {
  invalidateCustomEndpointCache();
  setRouterDb(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (savedDemo === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = savedDemo;
});

function warnings(): string {
  return logged.join('\n');
}

describe('missingPrivacyPinSettings', () => {
  it('is empty for the complete pin, and for the Settings preset', () => {
    expect(missingPrivacyPinSettings(PIN)).toEqual([]);
    expect(missingPrivacyPinSettings(OPENROUTER_EU_ZDR_EXTRA_BODY)).toEqual([]);
  });

  it('names each setting that is missing or wrong, never a value', () => {
    expect(missingPrivacyPinSettings({})).toEqual(['provider.zdr', 'provider.data_collection', 'provider.only']);
    expect(missingPrivacyPinSettings(null)).toEqual(['provider.zdr', 'provider.data_collection', 'provider.only']);
    expect(missingPrivacyPinSettings({ provider: { ...PIN.provider, zdr: 'true' } })).toEqual(['provider.zdr']);
    expect(missingPrivacyPinSettings({ provider: { ...PIN.provider, data_collection: 'allow' } })).toEqual(['provider.data_collection']);
    expect(missingPrivacyPinSettings({ provider: { ...PIN.provider, only: [] } })).toEqual(['provider.only']);
    expect(missingPrivacyPinSettings({ provider: { ...PIN.provider, only: 'inceptron' } })).toEqual(['provider.only']);
    expect(missingPrivacyPinSettings({ provider: { ...PIN.provider, only: [''] } })).toEqual(['provider.only']);
    // `order` is a preference, not a limit: OpenRouter may still fall back to anyone.
    expect(missingPrivacyPinSettings({ provider: { order: ['inceptron'], zdr: true, data_collection: 'deny' } })).toEqual(['provider.only']);
  });
});

describe('isOpenRouterBaseUrl', () => {
  it('is openrouter.ai and its subdomains, nothing else', () => {
    expect(isOpenRouterBaseUrl(OPENROUTER)).toBe(true);
    expect(isOpenRouterBaseUrl('https://eu.openrouter.ai/api/v1')).toBe(true);
    expect(isOpenRouterBaseUrl('https://OpenRouter.AI/api/v1')).toBe(true);
    expect(isOpenRouterBaseUrl('https://api.deepseek.com/v1')).toBe(false);
    expect(isOpenRouterBaseUrl('https://openrouter.ai.example.com/v1')).toBe(false);
    expect(isOpenRouterBaseUrl('http://127.0.0.1:4000/v1')).toBe(false);
    expect(isOpenRouterBaseUrl('not a url')).toBe(false);
  });
});

describe('assertDemoPrivacyPin', () => {
  it('checks only in demo mode and only an OpenRouter endpoint', () => {
    const demo = { DEMO_MODE: 'true' };
    expect(() => assertDemoPrivacyPin({ slug: 'openrouter', baseUrl: OPENROUTER, extraBody: {} }, demo)).toThrow(CompatPrivacyPinError);
    // Negative controls.
    expect(() => assertDemoPrivacyPin({ slug: 'openrouter', baseUrl: OPENROUTER, extraBody: {} }, {})).not.toThrow();
    expect(() => assertDemoPrivacyPin({ slug: 'openrouter', baseUrl: OPENROUTER, extraBody: PIN }, demo)).not.toThrow();
    expect(() => assertDemoPrivacyPin({ slug: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', extraBody: {} }, demo)).not.toThrow();
  });
});

// ── The resolver: the Work route and both routers ───────────────

function endpointDb(row: Record<string, unknown>): DatabaseAdapter {
  return {
    all: async () => [{
      id: 1, slug: 'openrouter', display_name: 'OpenRouter', base_url: OPENROUTER,
      api_key_encrypted: null, default_model: 'z-ai/glm-5.3-flash', available_models: [], context_window: null,
      extra_headers: {}, enabled: true, notes: null, created_at: '', updated_at: '',
      allowed_models: ['z-ai/glm-5.3-flash'],
      ...row,
    }],
    get: async () => undefined,
    run: async () => ({ changes: 0 }),
  } as unknown as DatabaseAdapter;
}

const MODEL_ID = 'compat:openrouter:z-ai/glm-5.3-flash';

describe('resolveCompatModel on a demo', () => {
  it('refuses an OpenRouter endpoint without the pin, before anything is sent, with a message for the visitor', async () => {
    process.env.DEMO_MODE = 'true';
    const db = endpointDb({ extra_body: { provider: { only: ['inceptron'], zdr: true } } });
    const err = await resolveCompatModel(MODEL_ID, db).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CompatPrivacyPinError);
    const pinErr = err as CompatPrivacyPinError;
    expect(pinErr.status).toBe(503);
    expect(pinErr.code).toBe('DEMO_PRIVACY_PIN_MISSING');
    expect(publicErrorMessage(pinErr)).toBe(DEMO_PRIVACY_PIN_MESSAGE);
    expect(pinErr.missing).toEqual(['provider.data_collection']);
    // One log line: the slug and the missing setting, not the URL or the body.
    const log = warnings();
    expect(log).toContain('[demo]');
    expect(log).toContain('"openrouter"');
    expect(log).toContain('provider.data_collection');
    expect(log).not.toContain('openrouter.ai');
    expect(log).not.toContain('inceptron');
  });

  it('refuses a lost extra body (an empty one)', async () => {
    process.env.DEMO_MODE = 'true';
    await expect(resolveCompatModel(MODEL_ID, endpointDb({ extra_body: null }))).rejects.toBeInstanceOf(CompatPrivacyPinError);
  });

  it('resolves with the complete pin (negative control)', async () => {
    process.env.DEMO_MODE = 'true';
    const r = await resolveCompatModel(MODEL_ID, endpointDb({ extra_body: PIN }));
    expect(r.endpoint.extraBody).toEqual(PIN);
    expect(warnings()).toBe('');
  });

  it('resolves without a pin outside demo mode (negative control: an ordinary install is unchanged)', async () => {
    delete process.env.DEMO_MODE;
    const r = await resolveCompatModel(MODEL_ID, endpointDb({ extra_body: {} }));
    expect(r.slug).toBe('openrouter');
  });

  it('resolves another endpoint without a pin on a demo (negative control: the pin is OpenRouter\'s)', async () => {
    process.env.DEMO_MODE = 'true';
    const db = endpointDb({ slug: 'local', base_url: 'http://127.0.0.1:1234/v1', extra_body: {}, allowed_models: [] });
    const r = await resolveCompatModel('compat:local:qwen', db);
    expect(r.slug).toBe('local');
  });
});

// ── The adapter: the one dispatch point ────────────────────────

const params = (over: Partial<OpenAICompatibleStreamParams> = {}): OpenAICompatibleStreamParams => ({
  baseUrl: OPENROUTER,
  apiKey: 'sk-or-v1-not-a-real-key',
  model: 'z-ai/glm-5.3-flash',
  system: 'sys',
  messages: [{ role: 'user', content: 'a visitor prompt' }],
  userId: null,
  spend: { modelId: MODEL_ID },
  ...over,
});

function okReply(): Response {
  return new Response(JSON.stringify({
    id: 'gen-1',
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const nullSink = { headersSent: true, writeHead: () => undefined, end: () => undefined, write: () => true };

describe('the adapter on a demo', () => {
  it('sends nothing to OpenRouter without the pin, streamed or not', async () => {
    process.env.DEMO_MODE = 'true';
    const fetchSpy = vi.fn(async () => okReply());
    vi.stubGlobal('fetch', fetchSpy);

    const plain = await callOpenAICompatible(params({ extraBody: { provider: { only: ['inceptron'] } } })).catch((e: unknown) => e);
    expect(plain).toBeInstanceOf(CompatPrivacyPinError);
    expect((plain as CompatPrivacyPinError).missing).toEqual(['provider.zdr', 'provider.data_collection']);
    const streamed = await streamOpenAICompatible(params({ extraBody: undefined }), nullSink).catch((e: unknown) => e);
    expect(streamed).toBeInstanceOf(CompatPrivacyPinError);
    expect(fetchSpy).not.toHaveBeenCalled();

    // The slug comes from the model id; no key, URL or prompt reaches the log.
    const log = warnings();
    expect(log).toContain('"openrouter"');
    expect(log).not.toContain('sk-or-v1');
    expect(log).not.toContain('openrouter.ai');
    expect(log).not.toContain('a visitor prompt');
  });

  it('sends the call with the complete pin (negative control)', async () => {
    process.env.DEMO_MODE = 'true';
    const fetchSpy = vi.fn(async () => okReply());
    vi.stubGlobal('fetch', fetchSpy);
    const out = await callOpenAICompatible(params({ extraBody: PIN }));
    expect(out.text).toBe('ok');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.provider).toEqual(PIN.provider);
  });

  it('sends the call without a pin outside demo mode (negative control)', async () => {
    delete process.env.DEMO_MODE;
    const fetchSpy = vi.fn(async () => okReply());
    vi.stubGlobal('fetch', fetchSpy);
    await callOpenAICompatible(params({ extraBody: undefined }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('names no slug when the caller gave no model id, and still refuses', async () => {
    process.env.DEMO_MODE = 'true';
    const fetchSpy = vi.fn(async () => okReply());
    vi.stubGlobal('fetch', fetchSpy);
    const err = await callOpenAICompatible(params({ spend: undefined, extraBody: {} })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CompatPrivacyPinError);
    expect((err as CompatPrivacyPinError).slug).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
