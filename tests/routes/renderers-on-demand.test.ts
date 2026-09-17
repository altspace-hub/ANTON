/**
 * renderers-on-demand.test.ts — the renderer route extracts on demand,
 * returns structured errors, and hides experimental renderers from
 * non-admins (Wave 3, 2026-09-16).
 *
 * The registry, the extraction queue and the database are fakes injected at
 * the route factory's seams; the handlers are pulled off the Express router
 * without listening on a port (the session-title test's pattern).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Router } from 'express';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { createRendererRoutes } from '../../server/routes/renderers.js';
import { RendererRunError, type RendererRegistry } from '../../server/services/renderer-registry.js';
import { resetAutoExtractionForTests, type ExtractionQueue, type EnqueueInput } from '../../server/services/structured-extraction-queue.js';
import type { ExtractionResult } from '../../server/services/structured-extractor.js';

type Handler = (req: unknown, res: unknown) => Promise<void>;

function handlerFor(router: Router, routePath: string, method: 'get' | 'post'): Handler {
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === routePath && l.route.methods[method]);
  if (!layer?.route) throw new Error(`route ${method} ${routePath} not mounted`);
  return layer.route.stack[0].handle;
}

function mockRes() {
  const res: { statusCode: number; body: unknown; status: (c: number) => typeof res; json: (b: unknown) => typeof res } = {
    statusCode: 200,
    body: undefined,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res;
}

const heatmap = {
  id: 'svg-risk-heatmap', label: 'Risk heatmap', description: '', category: 'visualize', trigger: 'post_hoc',
  applies_when: { content_types: ['risk_register'], requires_fields: ['items[*].likelihood', 'items[*].impact'] },
  output: { file_type: 'svg', mime_type: 'image/svg+xml', filename_template: 'x' },
  renderer_module: './renderers/visualize/svg-risk-heatmap.js', phase: 1, status: 'beta', sort_order: 10,
};
const plain = {
  ...heatmap, id: 'plain-language', label: 'Plain language', category: 'adapt_audience', applies_when: {},
  output: { file_type: 'md', mime_type: 'text/markdown', filename_template: 'x' },
};

function fakeRegistry(over: { applicable?: unknown[]; runRenderer?: () => Promise<unknown> } = {}) {
  const registry = {
    seedRegistry: vi.fn(async () => ({ inserted: 0, updated: 0 })),
    listRenderers: vi.fn(async () => [heatmap, plain]),
    getRenderer: vi.fn(async (id: string) => [heatmap, plain].find((r) => r.id === id) ?? null),
    getApplicableRenderers: vi.fn(async () => over.applicable ?? [{ ...heatmap, needs_extraction: false }, { ...plain, needs_extraction: false }]),
    runRenderer: vi.fn(over.runRenderer ?? (async () => ({ artifact_id: 1, file_path: 'f.svg', metadata: {}, duration_ms: 3 }))),
    audit: vi.fn(async () => undefined),
    _evaluateRequiresField: () => true,
  };
  return registry;
}

function fakeQueue(result: ExtractionResult) {
  return {
    enqueue: vi.fn(() => null),
    extractNow: vi.fn(async (_input: EnqueueInput) => result),
    inflightCount: () => 0,
    MAX_CONCURRENT: 5,
  };
}

function fakeDb(opts: { session?: Record<string, unknown>; markdown?: string } = {}) {
  const db = {
    dialect: 'postgresql',
    get: vi.fn(async (sql: string) => {
      if (/SELECT id FROM sessions/.test(sql)) return { id: 'sess-1' };
      if (/FROM sessions/.test(sql)) return opts.session ?? { module_id: 'atlas-threat-cataloguer', user_id: 'alice', output_structured: null, content_type: null, structured_status: 'pending', structured_error: null, structured_attempts: 0 };
      if (/FROM messages/.test(sql)) return { content: opts.markdown ?? 'x'.repeat(200), model_id: 'sdk:claude-opus-5' };
      return undefined;
    }),
    all: vi.fn(async () => []),
    run: vi.fn(async () => ({ changes: 1, lastInsertRowid: 0 })),
    exec: vi.fn(async () => undefined),
    transaction: vi.fn(async (fn: (d: unknown) => unknown) => fn(db)),
    close: vi.fn(async () => undefined),
  } as unknown as DatabaseAdapter;
  return db;
}

const extracted: ExtractionResult = { status: 'extracted', payload: null, cached: false, hash: 'h', method: 'sdk_schema', model: 'sdk:claude-sonnet-5' };
const failed: ExtractionResult = { status: 'failed', payload: null, cached: false, hash: 'h', error: 'Extraction timed out after 45000ms', method: 'sdk_schema', model: 'sdk:claude-sonnet-5' };

function build(opts: { registry?: ReturnType<typeof fakeRegistry>; queue?: ReturnType<typeof fakeQueue>; db?: DatabaseAdapter } = {}) {
  const registry = opts.registry ?? fakeRegistry();
  const queue = opts.queue ?? fakeQueue(extracted);
  const db = opts.db ?? fakeDb();
  const router = createRendererRoutes(db, {
    registry: registry as unknown as RendererRegistry,
    extractionQueue: queue as unknown as ExtractionQueue,
  });
  return { router, registry, queue, db };
}

const runReq = (rendererId: string, user: Record<string, unknown> = { id: 'alice', role: 'user' }) => ({
  body: { session_id: 'sess-1', renderer_id: rendererId },
  query: {},
  params: {},
  user,
});

let savedEnv: Record<string, string | undefined>;
beforeEach(() => {
  savedEnv = { DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE, DEFAULT_MODEL: process.env.DEFAULT_MODEL };
  delete process.env.DEPLOYMENT_MODE;
  delete process.env.DEFAULT_MODEL;
  resetAutoExtractionForTests();
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  resetAutoExtractionForTests();
});

// ── Visibility ─────────────────────────────────────────────

describe('GET /renderers — experimental renderers are admin-only on request', () => {
  it('team mode, ordinary user asking for experimental → not included', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const { router, registry } = build();
    const res = mockRes();
    await handlerFor(router, '/renderers', 'get')({ query: { includeExperimental: '1' }, user: { id: 'bob', role: 'user' } }, res);
    expect(registry.listRenderers).toHaveBeenCalledWith({ includeExperimental: false });
    expect(res.statusCode).toBe(200);
  });

  it('team mode, admin asking → included', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const { router, registry } = build();
    await handlerFor(router, '/renderers', 'get')({ query: { includeExperimental: '1' }, user: { id: 'root', role: 'admin' } }, mockRes());
    expect(registry.listRenderers).toHaveBeenCalledWith({ includeExperimental: true });
  });

  it('solo mode, the operator asking → included; nobody gets them without asking', async () => {
    const { router, registry } = build();
    await handlerFor(router, '/renderers', 'get')({ query: { includeExperimental: 'true' }, user: { id: 'me', role: 'user' } }, mockRes());
    expect(registry.listRenderers).toHaveBeenLastCalledWith({ includeExperimental: true });
    await handlerFor(router, '/renderers', 'get')({ query: {}, user: { id: 'me', role: 'admin' } }, mockRes());
    expect(registry.listRenderers).toHaveBeenLastCalledWith({ includeExperimental: false });
  });

  it('/renderers/applicable applies the same gate and reports the metered extraction state', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const db = fakeDb({ session: {
      module_id: 'm', user_id: 'alice', output_structured: null, content_type: 'risk_register',
      structured_status: 'failed', structured_error: 'Extraction timed out after 45000ms', structured_attempts: '3',
    } });
    const { router, registry } = build({ db });
    const res = mockRes();
    await handlerFor(router, '/renderers/applicable', 'get')(
      { query: { session_id: 'sess-1', includeExperimental: '1' }, user: { id: 'alice', role: 'user' } }, res,
    );
    expect(registry.getApplicableRenderers).toHaveBeenCalledWith('sess-1', { includeExperimental: false });
    expect(res.body).toMatchObject({
      structured_status: 'failed',
      structured_error: 'Extraction timed out after 45000ms',
      structured_attempts: 3,
    });
    expect(typeof (res.body as { auto_extraction: unknown }).auto_extraction).toBe('boolean');
  });
});

// ── Extraction on demand ───────────────────────────────────

describe('POST /renderers/run — extraction on demand', () => {
  it('content-aware renderer, no payload, extraction fails → 422 with the metered error, nothing rendered', async () => {
    const queue = fakeQueue(failed);
    const { router, registry } = build({ queue });
    const res = mockRes();
    await handlerFor(router, '/renderers/run', 'post')(runReq('svg-risk-heatmap'), res);

    expect(queue.extractNow).toHaveBeenCalledTimes(1);
    expect(queue.extractNow.mock.calls[0][0]).toMatchObject({
      sessionId: 'sess-1',
      moduleId: 'atlas-threat-cataloguer',
      userId: 'alice',
      generationModel: 'sdk:claude-opus-5',
    });
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({
      error: 'Structured extraction failed: Extraction timed out after 45000ms',
      stage: 'extraction',
      renderer_id: 'svg-risk-heatmap',
      structured_status: 'failed',
      structured_error: 'Extraction timed out after 45000ms',
    });
    expect(registry.audit).toHaveBeenCalledWith(expect.objectContaining({
      event: 'extraction_missing',
      details: expect.objectContaining({ on_demand: true, error: 'Extraction timed out after 45000ms', method: 'sdk_schema' }),
    }));
    expect(registry.runRenderer).not.toHaveBeenCalled();
  });

  it('extraction succeeds and the renderer applies → rendered (201)', async () => {
    const queue = fakeQueue(extracted);
    const { router, registry } = build({ queue });
    const res = mockRes();
    await handlerFor(router, '/renderers/run', 'post')(runReq('svg-risk-heatmap'), res);
    expect(queue.extractNow).toHaveBeenCalledTimes(1);
    expect(registry.getApplicableRenderers).toHaveBeenCalledWith('sess-1', { includeExperimental: true });
    expect(registry.runRenderer).toHaveBeenCalledWith('sess-1', 'svg-risk-heatmap', {}, 'alice');
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ success: true, artifact_id: 1 });
  });

  it('extraction succeeds but the payload lacks the required fields → 422 precondition, validation_failed logged', async () => {
    const registry = fakeRegistry({ applicable: [{ ...plain, needs_extraction: false }] });
    const { router } = build({ registry, queue: fakeQueue(extracted) });
    const res = mockRes();
    await handlerFor(router, '/renderers/run', 'post')(runReq('svg-risk-heatmap'), res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({
      stage: 'precondition',
      error: 'The structured analysis of this output does not carry what this transform needs (items[*].likelihood, items[*].impact).',
    });
    expect(registry.audit).toHaveBeenCalledWith(expect.objectContaining({ event: 'validation_failed' }));
    expect(registry.runRenderer).not.toHaveBeenCalled();
  });

  it('a session that already has a payload is not re-extracted', async () => {
    const db = fakeDb({ session: { module_id: 'm', user_id: 'alice', output_structured: '{"body":{}}' } });
    const queue = fakeQueue(extracted);
    const { router, registry } = build({ db, queue });
    await handlerFor(router, '/renderers/run', 'post')(runReq('svg-risk-heatmap'), mockRes());
    expect(queue.extractNow).not.toHaveBeenCalled();
    expect(registry.runRenderer).toHaveBeenCalledTimes(1);
  });

  it('a renderer that works from the Markdown never triggers extraction', async () => {
    const queue = fakeQueue(failed);
    const { router, registry } = build({ queue });
    const res = mockRes();
    await handlerFor(router, '/renderers/run', 'post')(runReq('plain-language'), res);
    expect(queue.extractNow).not.toHaveBeenCalled();
    expect(registry.runRenderer).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(201);
  });

  it('an unknown renderer is 404 before any extraction', async () => {
    const queue = fakeQueue(extracted);
    const { router } = build({ queue });
    const res = mockRes();
    await handlerFor(router, '/renderers/run', 'post')(runReq('nope'), res);
    expect(res.statusCode).toBe(404);
    expect(queue.extractNow).not.toHaveBeenCalled();
  });
});

// ── Renderer failures come back structured ─────────────────

describe('POST /renderers/run — renderer failures', () => {
  it('RendererRunError(render) → 422 with the renderer message, stage and id', async () => {
    const registry = fakeRegistry({ runRenderer: async () => { throw new RendererRunError('render', 'plain-language', 'sess-1', 'Plain language failed: pandoc exited with code 2'); } });
    const { router } = build({ registry });
    const res = mockRes();
    await handlerFor(router, '/renderers/run', 'post')(runReq('plain-language'), res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: 'Plain language failed: pandoc exited with code 2', stage: 'render', renderer_id: 'plain-language' });
  });

  it('RendererRunError(lookup) → 404; RendererRunError(persist) → 500', async () => {
    for (const [stage, status] of [['lookup', 404], ['persist', 500]] as const) {
      const registry = fakeRegistry({ runRenderer: async () => { throw new RendererRunError(stage, 'plain-language', 'sess-1', `${stage} problem`); } });
      const { router } = build({ registry });
      const res = mockRes();
      await handlerFor(router, '/renderers/run', 'post')(runReq('plain-language'), res);
      expect(res.statusCode).toBe(status);
      expect(res.body).toMatchObject({ stage, renderer_id: 'plain-language' });
    }
  });

  it('an unexpected throw is 500 with a scrubbed message and the renderer id', async () => {
    const registry = fakeRegistry({ runRenderer: async () => { throw new Error('ENOSPC'); } });
    const { router } = build({ registry });
    const res = mockRes();
    await handlerFor(router, '/renderers/run', 'post')(runReq('plain-language'), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ stage: 'render', renderer_id: 'plain-language' });
    expect(typeof (res.body as { error: unknown }).error).toBe('string');
  });
});
