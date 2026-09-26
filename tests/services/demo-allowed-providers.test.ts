/**
 * demo-allowed-providers.test.ts — on a public demo, provider.only must name
 * DEMO_ALLOWED_PROVIDERS only (default "inceptron"), or no request goes to
 * OpenRouter (privacy verification 2026-09-26, problem 4).
 *
 * The privacy notice says requests go only to Inceptron. The H9 check
 * accepted any non-empty provider.only, so an endpoint saved from the
 * 2026-09-25 preset (["inceptron","nextbit"], allow_fallbacks) passed it.
 * The refusal is checked where the pin is: the resolver the Work route and
 * both routers go through, and the adapter's one dispatch point.
 *
 * Negative controls: a subset of the allowed providers passes; a wider
 * DEMO_ALLOWED_PROVIDERS admits the second provider; outside demo mode, and
 * for an endpoint that is not OpenRouter, nothing changes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import {
  resolveCompatModel,
  setRouterDb,
  missingPrivacyPinSettings,
  assertDemoPrivacyPin,
  CompatPrivacyPinError,
  PROVIDER_ONLY_OUTSIDE_ALLOWED,
} from '../../server/services/compat-endpoint.js';
import { demoAllowedProviders, DEFAULT_DEMO_ALLOWED_PROVIDERS } from '../../server/middleware/demo-mode.js';
import { invalidateCustomEndpointCache } from '../../server/services/custom-endpoint-resolver.js';
import { callOpenAICompatible, type OpenAICompatibleStreamParams } from '../../server/services/adapters/openaiCompatibleAdapter.js';
import { OPENROUTER_EU_ZDR_EXTRA_BODY } from '../../src/lib/model-endpoint-form.js';

const OPENROUTER = 'https://openrouter.ai/api/v1';
const pin = (only: unknown) => ({ provider: { only, zdr: true, data_collection: 'deny' } });
/** The extra body the 2026-09-25 preset saved on the VM. */
const OLD_PRESET = { provider: { only: ['inceptron', 'nextbit'], allow_fallbacks: true, zdr: true, data_collection: 'deny' } };
const DEMO = { DEMO_MODE: 'true' };

const saved = { demo: process.env.DEMO_MODE, allowed: process.env.DEMO_ALLOWED_PROVIDERS };
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
  if (saved.demo === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = saved.demo;
  if (saved.allowed === undefined) delete process.env.DEMO_ALLOWED_PROVIDERS; else process.env.DEMO_ALLOWED_PROVIDERS = saved.allowed;
});

describe('demoAllowedProviders', () => {
  it('is "inceptron" unless DEMO_ALLOWED_PROVIDERS names others', () => {
    expect(DEFAULT_DEMO_ALLOWED_PROVIDERS).toEqual(['inceptron']);
    expect(demoAllowedProviders({})).toEqual(['inceptron']);
    expect(demoAllowedProviders({ DEMO_ALLOWED_PROVIDERS: '  ' })).toEqual(['inceptron']);
    expect(demoAllowedProviders({ DEMO_ALLOWED_PROVIDERS: ',' })).toEqual(['inceptron']);
    expect(demoAllowedProviders({ DEMO_ALLOWED_PROVIDERS: ' Inceptron, nextbit ,inceptron' })).toEqual(['inceptron', 'nextbit']);
  });
});

describe('missingPrivacyPinSettings with the allowed providers', () => {
  it('names provider.only when it reaches past them', () => {
    expect(missingPrivacyPinSettings(pin(['inceptron', 'nextbit']), ['inceptron'])).toEqual([PROVIDER_ONLY_OUTSIDE_ALLOWED]);
    expect(missingPrivacyPinSettings(pin(['nextbit']), ['inceptron'])).toEqual([PROVIDER_ONLY_OUTSIDE_ALLOWED]);
    expect(missingPrivacyPinSettings(OLD_PRESET, ['inceptron'])).toEqual([PROVIDER_ONLY_OUTSIDE_ALLOWED]);
    // The name is a setting, never a provider.
    expect(PROVIDER_ONLY_OUTSIDE_ALLOWED).not.toMatch(/nextbit|inceptron/);
  });

  it('passes a subset of them, whatever the case (negative control)', () => {
    expect(missingPrivacyPinSettings(pin(['inceptron']), ['inceptron'])).toEqual([]);
    expect(missingPrivacyPinSettings(pin(['Inceptron ']), ['inceptron'])).toEqual([]);
    expect(missingPrivacyPinSettings(pin(['inceptron']), ['inceptron', 'nextbit'])).toEqual([]);
    expect(missingPrivacyPinSettings(pin(['inceptron', 'nextbit']), ['nextbit', 'inceptron'])).toEqual([]);
    // The Settings preset is the pin a demo wants.
    expect(missingPrivacyPinSettings(OPENROUTER_EU_ZDR_EXTRA_BODY, DEFAULT_DEMO_ALLOWED_PROVIDERS)).toEqual([]);
  });

  it('checks only what it is given: without a list any non-empty only passes, as before (negative control)', () => {
    expect(missingPrivacyPinSettings(pin(['inceptron', 'nextbit']))).toEqual([]);
    expect(missingPrivacyPinSettings(pin(['inceptron', 'nextbit']), null)).toEqual([]);
  });

  it('still reports a missing only as provider.only, not as outside the list', () => {
    expect(missingPrivacyPinSettings(pin([]), ['inceptron'])).toEqual(['provider.only']);
  });
});

describe('assertDemoPrivacyPin', () => {
  const endpoint = (extraBody: Record<string, unknown>) => ({ slug: 'openrouter', baseUrl: OPENROUTER, extraBody });

  it('refuses the old preset on a demo, and logs no provider name', () => {
    let err: unknown;
    try { assertDemoPrivacyPin(endpoint(OLD_PRESET), DEMO); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(CompatPrivacyPinError);
    expect((err as CompatPrivacyPinError).missing).toEqual([PROVIDER_ONLY_OUTSIDE_ALLOWED]);
    const log = logged.join('\n');
    expect(log).toContain('"openrouter"');
    expect(log).not.toContain('nextbit');
    expect(log).not.toContain('openrouter.ai');
  });

  it('lets it through when DEMO_ALLOWED_PROVIDERS names both, and a subset always (negative controls)', () => {
    expect(() => assertDemoPrivacyPin(endpoint(OLD_PRESET), { ...DEMO, DEMO_ALLOWED_PROVIDERS: 'inceptron,nextbit' })).not.toThrow();
    expect(() => assertDemoPrivacyPin(endpoint(pin(['inceptron'])), DEMO)).not.toThrow();
  });

  it('checks nothing outside demo mode, or for another endpoint (negative controls)', () => {
    expect(() => assertDemoPrivacyPin(endpoint(OLD_PRESET), {})).not.toThrow();
    expect(() => assertDemoPrivacyPin({ slug: 'local', baseUrl: 'http://127.0.0.1:1234/v1', extraBody: OLD_PRESET }, DEMO)).not.toThrow();
  });
});

// ── Through the resolver and the adapter, as a demo run meets them ──

function endpointDb(extraBody: unknown): DatabaseAdapter {
  return {
    all: async () => [{
      id: 1, slug: 'openrouter', display_name: 'OpenRouter', base_url: OPENROUTER,
      api_key_encrypted: null, default_model: 'z-ai/glm-5.3-flash', available_models: [], context_window: null,
      extra_headers: {}, enabled: true, notes: null, created_at: '', updated_at: '',
      allowed_models: ['z-ai/glm-5.3-flash'], extra_body: extraBody,
    }],
    get: async () => undefined,
    run: async () => ({ changes: 0 }),
  } as unknown as DatabaseAdapter;
}

const MODEL_ID = 'compat:openrouter:z-ai/glm-5.3-flash';

describe('an endpoint saved with ["inceptron","nextbit"] on a demo', () => {
  it('is refused by the resolver before anything is sent', async () => {
    process.env.DEMO_MODE = 'true';
    delete process.env.DEMO_ALLOWED_PROVIDERS;
    await expect(resolveCompatModel(MODEL_ID, endpointDb(OLD_PRESET))).rejects.toBeInstanceOf(CompatPrivacyPinError);
  });

  it('resolves once the extra body pins Inceptron alone (negative control)', async () => {
    process.env.DEMO_MODE = 'true';
    delete process.env.DEMO_ALLOWED_PROVIDERS;
    const r = await resolveCompatModel(MODEL_ID, endpointDb(pin(['inceptron'])));
    expect(r.slug).toBe('openrouter');
  });

  it('resolves outside demo mode (negative control: an ordinary install is unchanged)', async () => {
    delete process.env.DEMO_MODE;
    const r = await resolveCompatModel(MODEL_ID, endpointDb(OLD_PRESET));
    expect(r.slug).toBe('openrouter');
  });

  const params = (extraBody: Record<string, unknown>): OpenAICompatibleStreamParams => ({
    baseUrl: OPENROUTER,
    apiKey: 'sk-or-v1-not-a-real-key',
    model: 'z-ai/glm-5.3-flash',
    system: 'sys',
    messages: [{ role: 'user', content: 'a visitor prompt' }],
    userId: null,
    spend: { modelId: MODEL_ID },
    extraBody,
  });
  const okReply = () => new Response(JSON.stringify({
    id: 'gen-1', choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('is refused by the adapter too, with no request made; a subset is sent (negative control)', async () => {
    process.env.DEMO_MODE = 'true';
    delete process.env.DEMO_ALLOWED_PROVIDERS;
    const fetchSpy = vi.fn(async () => okReply());
    vi.stubGlobal('fetch', fetchSpy);
    await expect(callOpenAICompatible(params(OLD_PRESET))).rejects.toBeInstanceOf(CompatPrivacyPinError);
    expect(fetchSpy).not.toHaveBeenCalled();
    const out = await callOpenAICompatible(params(pin(['inceptron'])));
    expect(out.text).toBe('ok');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
