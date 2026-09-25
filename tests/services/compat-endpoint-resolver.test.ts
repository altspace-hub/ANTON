/**
 * compat-endpoint-resolver.test.ts — the one resolver for compat:<slug>:<model>
 * ids (server/services/compat-endpoint.ts), and the health-check parser that
 * fills each model's metadata from GET /models.
 *
 * Before 2026-09-25 three copies of the resolver took the slug and ran any
 * model named after it — on OpenRouter several hundred, up to ~3,000 times the
 * showcase model's price — and each threw "Database adapter required …" when
 * the caller passed no db (about sixty callChat / streamChat sites do not).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import {
  resolveCompatModel,
  setRouterDb,
  parseCompatModelId,
  parseModelsListing,
  modelAcceptsImages,
  CompatModelNotAllowedError,
  CompatEndpointError,
} from '../../server/services/compat-endpoint.js';
import { invalidateCustomEndpointCache } from '../../server/services/custom-endpoint-resolver.js';

function endpointDb(row: Record<string, unknown>): DatabaseAdapter {
  return {
    all: async () => [{
      id: 1, slug: 'openrouter', display_name: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1',
      api_key_encrypted: null, default_model: 'z-ai/glm-5.3-flash', available_models: [], context_window: null,
      extra_headers: {}, enabled: true, notes: null, created_at: '', updated_at: '',
      ...row,
    }],
    get: async () => undefined,
    run: async () => ({ changes: 0 }),
  } as unknown as DatabaseAdapter;
}

beforeEach(() => { invalidateCustomEndpointCache(); setRouterDb(null); });
afterEach(() => { invalidateCustomEndpointCache(); setRouterDb(null); });

describe('allowedModels', () => {
  it('refuses a model the endpoint does not allow, before anything is dispatched', async () => {
    const db = endpointDb({ allowed_models: ['z-ai/glm-5.3-flash'] });
    const err = await resolveCompatModel('compat:openrouter:anthropic/claude-opus-5', db).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CompatModelNotAllowedError);
    expect((err as CompatModelNotAllowedError).status).toBe(403);
    expect((err as CompatModelNotAllowedError).code).toBe('MODEL_NOT_ALLOWED');
  });

  it('lets an allowed model run (negative control)', async () => {
    const db = endpointDb({ allowed_models: ['z-ai/glm-5.3-flash'] });
    const r = await resolveCompatModel('compat:openrouter:z-ai/glm-5.3-flash', db);
    expect(r.model).toBe('z-ai/glm-5.3-flash');
    expect(r.endpoint.allowedModels).toEqual(['z-ai/glm-5.3-flash']);
  });

  it('lets any model run when the list is empty (the behaviour before migration 288)', async () => {
    const r = await resolveCompatModel('compat:openrouter:any/model', endpointDb({}));
    expect(r.model).toBe('any/model');
  });
});

describe('the database registered at boot', () => {
  it('is used when the caller passes no db', async () => {
    setRouterDb(endpointDb({}));
    const r = await resolveCompatModel('compat:openrouter:z-ai/glm-5.3-flash');
    expect(r.endpoint.baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('is required: with none registered and none passed, the call fails clearly', async () => {
    await expect(resolveCompatModel('compat:openrouter:z-ai/glm-5.3-flash')).rejects.toThrow(/setRouterDb/);
  });
});

describe('endpoint controls reach the caller', () => {
  it('carries extra body, ceiling, prices and the model\'s own metadata', async () => {
    const db = endpointDb({
      extra_body: { provider: { only: ['inceptron', 'nextbit'], zdr: true } },
      max_output_tokens: 16_000,
      input_price_per_million: 0.15,
      output_price_per_million: 0.5,
      model_meta: { 'z-ai/glm-5.3-flash': { contextLength: 1_310_720, reasoning: { mandatory: true, supportedEfforts: ['low', 'high', 'max'] } } },
    });
    const r = await resolveCompatModel('compat:openrouter:z-ai/glm-5.3-flash', db);
    expect(r.endpoint.extraBody).toEqual({ provider: { only: ['inceptron', 'nextbit'], zdr: true } });
    expect(r.endpoint.maxOutputTokens).toBe(16_000);
    expect(r.pricing).toEqual({ inputPerMillion: 0.15, outputPerMillion: 0.5 });
    expect(r.meta?.reasoning).toEqual({ mandatory: true, supportedEfforts: ['low', 'high', 'max'] });
    expect(r.meta?.contextLength).toBe(1_310_720);
  });

  it('rejects a malformed id', () => {
    expect(() => parseCompatModelId('compat:openrouter')).toThrow(CompatEndpointError);
    expect(() => parseCompatModelId('compat::m')).toThrow(CompatEndpointError);
    expect(parseCompatModelId('compat:or:vendor/model:free')).toEqual({ slug: 'or', model: 'vendor/model:free' });
  });
});

describe('parseModelsListing — what the health check stores', () => {
  it('reads OpenRouter\'s context length, output ceiling, modalities, reasoning and parameters', () => {
    const { ids, meta } = parseModelsListing({
      data: [
        {
          id: 'z-ai/glm-5.3-flash',
          context_length: 1_310_720,
          architecture: { input_modalities: ['text'], output_modalities: ['text'] },
          top_provider: { context_length: 1_310_720, max_completion_tokens: 131_072 },
          supported_parameters: ['reasoning', 'include_reasoning', 'max_tokens', 'response_format'],
          reasoning: { mandatory: true, default_effort: 'max', supported_efforts: ['low', 'high', 'max'] },
        },
        {
          id: 'inclusionai/ling-3.0-flash-vl',
          context_length: 262_144,
          architecture: { input_modalities: ['text', 'image'] },
          top_provider: { max_completion_tokens: 32_768 },
          supported_parameters: ['reasoning', 'max_tokens'],
        },
        { id: 'plain-model', object: 'model' },
      ],
    });
    expect(ids).toEqual(['z-ai/glm-5.3-flash', 'inclusionai/ling-3.0-flash-vl', 'plain-model']);
    expect(meta['z-ai/glm-5.3-flash']).toEqual({
      contextLength: 1_310_720,
      maxCompletionTokens: 131_072,
      inputModalities: ['text'],
      supportedParameters: ['reasoning', 'include_reasoning', 'max_tokens', 'response_format'],
      reasoning: { mandatory: true, supportedEfforts: ['low', 'high', 'max'], defaultEffort: 'max' },
    });
    expect(meta['inclusionai/ling-3.0-flash-vl'].reasoning).toEqual({ mandatory: false });
    expect(modelAcceptsImages(meta['inclusionai/ling-3.0-flash-vl'])).toBe(true);
    expect(modelAcceptsImages(meta['z-ai/glm-5.3-flash'])).toBe(false);
    // A plain OpenAI-style listing says nothing: no reasoning sent, no images.
    expect(meta['plain-model']).toBeUndefined();
  });
});
