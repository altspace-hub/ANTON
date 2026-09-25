/**
 * context-budget-compat-meta.test.ts — the knowledge budget of a compat model
 * whose endpoint has no context_window set.
 *
 * It used to fall to 32k (a medium PDF answered CONTEXT_TOO_LARGE), and it
 * needed a db the caller might not pass. Now the window the endpoint's /models
 * reported for the model is used — capped at 128k, so GLM 5.3 Flash's 1.31M
 * does not let one run pack 800k tokens of documents onto a paid key — and
 * the database registered at boot is used when none is passed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { resolveContextWindow } from '../../server/services/context-budget.js';
import { setRouterDb } from '../../server/services/compat-endpoint.js';
import { invalidateCustomEndpointCache } from '../../server/services/custom-endpoint-resolver.js';

function endpointDb(contextWindow: number | null, meta: Record<string, unknown>): DatabaseAdapter {
  return {
    all: async () => [{
      id: 1, slug: 'or', display_name: 'OR', base_url: 'http://x/v1', api_key_encrypted: null,
      default_model: 'm', available_models: [], context_window: contextWindow, extra_headers: {},
      enabled: true, notes: null, created_at: '', updated_at: '', model_meta: meta,
    }],
    get: async () => undefined,
    run: async () => ({ changes: 0 }),
  } as unknown as DatabaseAdapter;
}

beforeEach(() => { invalidateCustomEndpointCache(); setRouterDb(null); });
afterEach(() => { invalidateCustomEndpointCache(); setRouterDb(null); });

describe('compat context window from the endpoint\'s /models', () => {
  it('uses the reported window, capped at 128k', async () => {
    const db = endpointDb(null, { 'z-ai/glm-5.3-flash': { contextLength: 1_310_720 }, 'small/model': { contextLength: 65_536 } });
    expect(await resolveContextWindow('compat:or:z-ai/glm-5.3-flash', db)).toBe(131_072);
    invalidateCustomEndpointCache();
    expect(await resolveContextWindow('compat:or:small/model', db)).toBe(65_536);
  });

  it('keeps the admin\'s context_window first', async () => {
    const db = endpointDb(200_000, { 'z-ai/glm-5.3-flash': { contextLength: 1_310_720 } });
    expect(await resolveContextWindow('compat:or:z-ai/glm-5.3-flash', db)).toBe(200_000);
  });

  it('uses the database registered at boot when none is passed', async () => {
    setRouterDb(endpointDb(null, { 'small/model': { contextLength: 65_536 } }));
    expect(await resolveContextWindow('compat:or:small/model')).toBe(65_536);
  });
});
