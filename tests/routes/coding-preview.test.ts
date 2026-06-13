/**
 * coding-preview.test.ts — ANTON Studio P6 (the LIVE LOCAL PREVIEW SERVER
 * routes, route-level).
 *
 * Mounts the REAL coding-preview router with an INJECTED fake service (no real
 * spawn / no real preview process) and a tiny in-memory fake DatabaseAdapter for
 * the ownership lookup — so this test needs neither a live DB nor a live process.
 *
 * Exercises:
 *   POST /preview/start        → 200 (service ok) + the view
 *   POST /preview/start (gated)→ 412 when the service refuses (flag off)
 *   POST /preview/stop         → 200 + honest note
 *   GET  /preview/status       → 200 + reconciled view
 *   GET  /preview/logs         → 200 + ring buffer
 *   ownership                  → 404 on an unknown project
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { createCodingPreviewRoutes, type PreviewService } from '../../server/routes/coding-preview.js';
import type { StartResult, StopResult, PreviewView } from '../../server/services/coding-preview-service.js';

const KNOWN_PROJECT = 'proj-known';

// ── Fake DatabaseAdapter — only the ownership SELECT matters here ─────────────
function makeFakeDb(): DatabaseAdapter {
  const db: Partial<DatabaseAdapter> = {
    dialect: 'postgresql',
    get: (async (sql: string, ...params: unknown[]) => {
      if (/FROM coding_projects cp/i.test(sql)) {
        const id = String(params[0]);
        if (id === KNOWN_PROJECT) return { id: KNOWN_PROJECT, owner_user_id: 'solo' };
        return undefined; // unknown → 404
      }
      return undefined;
    }) as DatabaseAdapter['get'],
  };
  return db as DatabaseAdapter;
}

function runningView(): PreviewView {
  return {
    status: 'running', port: 4321, pid: 999, preview_url: 'http://localhost:4321',
    command: ['node', 'dev.js'], last_log: null, has_live_handle: true,
    started_at: null, stopped_at: null,
  };
}

// A configurable fake service so each test can dictate the outcome.
function makeFakeService(overrides: Partial<PreviewService> = {}): PreviewService {
  return {
    startPreview: async (): Promise<StartResult> => ({ ok: true, view: runningView() }),
    stopPreview: async (): Promise<StopResult> => ({ ok: true, note: 'killed', view: { ...runningView(), status: 'stopped', has_live_handle: false } }),
    getPreviewStatus: async (): Promise<PreviewView> => runningView(),
    getPreviewLogs: async () => ({ status: 'running', has_live_handle: true, logs: 'hello\nworld\n' }),
    ...overrides,
  };
}

async function mount(service: PreviewService): Promise<{ server: Server; base: string }> {
  const db = makeFakeDb();
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: unknown }).user = { id: 'solo', role: 'admin' };
    next();
  });
  app.use('/api', createCodingPreviewRoutes(db, { service }));
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  return { server, base: `http://127.0.0.1:${addr.port}` };
}

describe('coding-preview routes', () => {
  let server: Server;
  let base: string;
  let currentService: PreviewService = makeFakeService();

  beforeAll(async () => {
    // A thin pass-through service that delegates to the swappable currentService,
    // so individual tests can change behaviour without remounting.
    const proxy: PreviewService = {
      startPreview: (...a) => currentService.startPreview(...a),
      stopPreview: (...a) => currentService.stopPreview(...a),
      getPreviewStatus: (...a) => currentService.getPreviewStatus(...a),
      getPreviewLogs: (...a) => currentService.getPreviewLogs(...a),
    };
    const m = await mount(proxy);
    server = m.server; base = m.base;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
  });

  async function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }
  async function get(path: string): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}${path}`);
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  it('POST /preview/start returns 200 + the running view', async () => {
    currentService = makeFakeService();
    const { status, json } = await post(`/api/coding/projects/${KNOWN_PROJECT}/preview/start`, { argv: ['node', 'dev.js'] });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect((json.preview as PreviewView).status).toBe('running');
  });

  it('POST /preview/start surfaces the 412 when the service is gated off', async () => {
    currentService = makeFakeService({
      startPreview: async (): Promise<StartResult> => ({ ok: false, code: 412, error: 'Live preview is disabled. Set CODING_STUDIO_PREVIEW=true …' }),
    });
    const { status, json } = await post(`/api/coding/projects/${KNOWN_PROJECT}/preview/start`, { argv: ['node', 'dev.js'] });
    expect(status).toBe(412);
    expect(String(json.error)).toMatch(/CODING_STUDIO_PREVIEW/);
  });

  it('POST /preview/stop returns 200 + the honest note', async () => {
    currentService = makeFakeService({
      stopPreview: async (): Promise<StopResult> => ({ ok: true, note: 'no-handle', error: 'No live preview handle; marked stopped. Nothing was killed.', view: { ...runningView(), status: 'stopped' } }),
    });
    const { status, json } = await post(`/api/coding/projects/${KNOWN_PROJECT}/preview/stop`, {});
    expect(status).toBe(200);
    expect(json.note).toBe('no-handle');
    expect(String(json.message)).toMatch(/Nothing was killed/i);
  });

  it('GET /preview/status returns 200 + reconciled view', async () => {
    currentService = makeFakeService({
      getPreviewStatus: async (): Promise<PreviewView> => ({ ...runningView(), status: 'unknown', has_live_handle: false }),
    });
    const { status, json } = await get(`/api/coding/projects/${KNOWN_PROJECT}/preview/status`);
    expect(status).toBe(200);
    expect((json.preview as PreviewView).status).toBe('unknown');
  });

  it('GET /preview/logs returns 200 + the ring buffer', async () => {
    currentService = makeFakeService();
    const { status, json } = await get(`/api/coding/projects/${KNOWN_PROJECT}/preview/logs`);
    expect(status).toBe(200);
    expect(String(json.logs)).toContain('hello');
  });

  it('404s on an unknown project (all verbs ownership-gated)', async () => {
    currentService = makeFakeService();
    const unknown = randomUUID();
    expect((await post(`/api/coding/projects/${unknown}/preview/start`, { argv: ['node', 'dev.js'] })).status).toBe(404);
    expect((await post(`/api/coding/projects/${unknown}/preview/stop`, {})).status).toBe(404);
    expect((await get(`/api/coding/projects/${unknown}/preview/status`)).status).toBe(404);
    expect((await get(`/api/coding/projects/${unknown}/preview/logs`)).status).toBe(404);
  });

  it('400s when start has neither argv nor language', async () => {
    currentService = makeFakeService();
    const { status } = await post(`/api/coding/projects/${KNOWN_PROJECT}/preview/start`, {});
    expect(status).toBe(400);
  });
});
