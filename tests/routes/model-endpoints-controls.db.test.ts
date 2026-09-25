/**
 * model-endpoints-controls.db.test.ts — /api/settings/model-endpoints carries
 * the migration 288 controls, on the test database.
 *
 *   extraBody        merged into every request (OpenRouter provider routing)
 *   allowedModels    the only models that may run on the endpoint
 *   maxOutputTokens  the max_tokens ceiling
 *   modelMeta        read-only — the health check fills it from GET /models,
 *                    and never overwrites allowedModels
 * Skips without a test database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http, { type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);
const SLUG = `tctl${tag}`;

function startFakeModels(): Promise<{ server: Server; baseUrl: string }> {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url?.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [
        {
          id: 'z-ai/glm-5.3-flash', context_length: 1_310_720,
          architecture: { input_modalities: ['text'] },
          top_provider: { max_completion_tokens: 131_072 },
          supported_parameters: ['reasoning', 'max_tokens'],
          reasoning: { mandatory: true, default_effort: 'max', supported_efforts: ['low', 'high', 'max'] },
        },
        { id: 'inclusionai/ling-3.0-flash-vl', context_length: 262_144, architecture: { input_modalities: ['text', 'image'] } },
        { id: 'anthropic/claude-opus-5' },
      ] }));
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` }));
  });
}

d('model endpoints: showcase controls', () => {
  let db: DatabaseAdapter;
  let app: Server;
  let fake: Awaited<ReturnType<typeof startFakeModels>>;
  let base = '';
  const savedMode = process.env.DEPLOYMENT_MODE;
  let caller: { id: string; role: string } = { id: 'solo', role: 'admin' };

  beforeAll(async () => {
    delete process.env.DEPLOYMENT_MODE;
    fake = await startFakeModels();
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 2 });
    const { createCustomModelEndpointsRoutes } = await import('../../server/routes/custom-model-endpoints.js');
    const e = express();
    e.use(express.json());
    e.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: { id: string; role: string } }).user = caller;
      next();
    });
    e.use('/api', createCustomModelEndpointsRoutes(db));
    await new Promise<void>((resolve) => { app = e.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = savedMode;
    if (db) {
      await db.run('DELETE FROM custom_model_endpoints WHERE slug = ?', SLUG).catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
    await new Promise<void>((resolve) => { fake?.server.close(() => resolve()); });
  });

  const call = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, json: await res.json() as Record<string, unknown> };
  };

  it('creates an endpoint with extra body, allowed models and an output ceiling', async () => {
    const extraBody = { provider: { only: ['inceptron', 'nextbit'], allow_fallbacks: false, zdr: true, data_collection: 'deny' } };
    const { status, json } = await call('POST', '/api/settings/model-endpoints', {
      slug: SLUG, displayName: 'OpenRouter test', baseUrl: fake.baseUrl,
      extraBody, allowedModels: ['z-ai/glm-5.3-flash', ' z-ai/glm-5.3-flash ', ''], maxOutputTokens: 16000,
    });
    expect(status).toBe(200);
    const ep = json.endpoint as Record<string, unknown>;
    expect(ep.extraBody).toEqual(extraBody);
    expect(ep.allowedModels).toEqual(['z-ai/glm-5.3-flash']);
    expect(ep.maxOutputTokens).toBe(16000);
    expect(ep.modelMeta).toEqual({});
  });

  it('refuses an extra body that is not an object, and a bad ceiling', async () => {
    expect((await call('PATCH', `/api/settings/model-endpoints/${SLUG}`, { extraBody: ['x'] })).status).toBe(400);
    expect((await call('PATCH', `/api/settings/model-endpoints/${SLUG}`, { maxOutputTokens: -5 })).status).toBe(400);
    expect((await call('PATCH', `/api/settings/model-endpoints/${SLUG}`, { allowedModels: 'z-ai/glm-5.3-flash' })).status).toBe(400);
  });

  it('refuses an extra body that would choose the model (models, model, route, preset)', async () => {
    for (const extraBody of [{ models: ['anthropic/claude-opus-5.5'] }, { model: 'x' }, { route: 'fallback' }, { preset: 'p' }]) {
      const r = await call('PATCH', `/api/settings/model-endpoints/${SLUG}`, { extraBody });
      expect(r.status, JSON.stringify(extraBody)).toBe(400);
    }
    // Negative control: a provider pin is accepted.
    expect((await call('PATCH', `/api/settings/model-endpoints/${SLUG}`, { extraBody: { provider: { zdr: true } } })).status).toBe(200);
  });

  it('health check fills modelMeta from /models and leaves allowedModels alone', async () => {
    const { status, json } = await call('POST', `/api/settings/model-endpoints/${SLUG}/health`);
    expect(status).toBe(200);
    expect(json.available).toBe(true);
    expect(json.modelCount).toBe(3);

    const list = await call('GET', '/api/settings/model-endpoints');
    const ep = (list.json.endpoints as Array<Record<string, unknown>>).find((e) => e.slug === SLUG)!;
    expect(ep.allowedModels).toEqual(['z-ai/glm-5.3-flash']);
    expect(ep.availableModels).toEqual(['z-ai/glm-5.3-flash', 'inclusionai/ling-3.0-flash-vl', 'anthropic/claude-opus-5']);
    const meta = ep.modelMeta as Record<string, { reasoning?: unknown; inputModalities?: string[]; maxCompletionTokens?: number }>;
    expect(meta['z-ai/glm-5.3-flash'].reasoning).toEqual({ mandatory: true, supportedEfforts: ['low', 'high', 'max'], defaultEffort: 'max' });
    expect(meta['z-ai/glm-5.3-flash'].maxCompletionTokens).toBe(131_072);
    expect(meta['inclusionai/ling-3.0-flash-vl'].inputModalities).toEqual(['text', 'image']);
  });

  it('PATCH changes only the controls it names; modelMeta cannot be written', async () => {
    const { status, json } = await call('PATCH', `/api/settings/model-endpoints/${SLUG}`, {
      allowedModels: ['z-ai/glm-5.3-flash', 'inclusionai/ling-3.0-flash-vl'],
      modelMeta: { 'z-ai/glm-5.3-flash': { inputModalities: ['image'] } },
    });
    expect(status).toBe(200);
    const ep = json.endpoint as Record<string, unknown>;
    expect(ep.allowedModels).toEqual(['z-ai/glm-5.3-flash', 'inclusionai/ling-3.0-flash-vl']);
    expect(ep.maxOutputTokens).toBe(16000);
    expect((ep.extraBody as { provider?: unknown }).provider).toBeTruthy();
    expect((ep.modelMeta as Record<string, { inputModalities?: string[] }>)['z-ai/glm-5.3-flash'].inputModalities).toEqual(['text']);
  });

  it('the resolver sees the new allowed list at once (cache invalidated on write)', async () => {
    const { resolveCompatModel, CompatModelNotAllowedError } = await import('../../server/services/compat-endpoint.js');
    await expect(resolveCompatModel(`compat:${SLUG}:inclusionai/ling-3.0-flash-vl`, db)).resolves.toMatchObject({ model: 'inclusionai/ling-3.0-flash-vl' });
    await expect(resolveCompatModel(`compat:${SLUG}:anthropic/claude-opus-5`, db)).rejects.toBeInstanceOf(CompatModelNotAllowedError);
  });

  it('a team non-admin lists only what the picker needs: no URL, headers, extra body or prices', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    try {
      caller = { id: 'u-visitor', role: 'analyst' };
      const mine = ((await call('GET', '/api/settings/model-endpoints')).json.endpoints as Array<Record<string, unknown>>)
        .find((e) => e.slug === SLUG);
      expect(mine).toBeTruthy();
      for (const hidden of ['baseUrl', 'extraHeaders', 'extraBody', 'inputPricePerMillion', 'outputPricePerMillion', 'notes', 'modelMeta', 'hasApiKey']) {
        expect(mine, hidden).not.toHaveProperty(hidden);
      }
      expect(mine).toHaveProperty('allowedModels');

      // Negative control: a team admin still gets the whole row.
      caller = { id: 'u-root', role: 'admin' };
      const full = ((await call('GET', '/api/settings/model-endpoints')).json.endpoints as Array<Record<string, unknown>>)
        .find((e) => e.slug === SLUG);
      expect(full).toHaveProperty('baseUrl');
      expect(full).toHaveProperty('extraBody');
    } finally {
      caller = { id: 'solo', role: 'admin' };
      delete process.env.DEPLOYMENT_MODE;
    }
  });
});
