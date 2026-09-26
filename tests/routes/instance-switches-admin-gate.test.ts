/**
 * instance-switches-admin-gate.test.ts — H10 and H11 of the team-server
 * readiness audit (2026-09-23): two instance-wide switches any user could flip.
 *
 * H10. Knowledge packs. Every ACTIVE pack goes into every user's prompts, yet
 *      any user could import, install, activate, deactivate or delete one —
 *      'system' packs included.
 * H11. POST /api/analytics/budget-cap. Its comment said "admin only"; nothing
 *      enforced it, and the cap stops everyone's runs once reached.
 *
 * Both now sit behind requireAdminOrSolo. Each refusal is checked for the
 * absence of its side effect (the service call, the settings write), and paired
 * with the same request succeeding for an admin and in solo mode, and with
 * reads staying open to every user.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const svc = vi.hoisted(() => {
  const pack = { id: 'pack-1', display_name: 'AMLR pack', entity_count: 3, relationship_count: 1, user_id: 'someone-else', status: 'installed' };
  return {
    pack,
    listPacks: vi.fn(async () => [pack]),
    getPack: vi.fn(async (id: string) => (id === pack.id ? pack : null)),
    getPackEntities: vi.fn(async () => []),
    getPackRelationships: vi.fn(async () => []),
    listBundledPacks: vi.fn(async () => []),
    installBundledPack: vi.fn(async () => pack),
    getActivePacksSummary: vi.fn(async () => ''),
    importBundle: vi.fn(async () => pack),
    activatePack: vi.fn(async () => undefined),
    deactivatePack: vi.fn(async () => undefined),
    deletePack: vi.fn(async () => undefined),
  };
});
vi.mock('../../server/services/knowledge-pack-service.js', () => ({
  createKnowledgePackService: async () => svc,
}));

import { createKnowledgePacksRoutes } from '../../server/routes/knowledge-packs.js';
import { createAnalyticsRouter } from '../../server/routes/analytics.js';

const settingsWrites: unknown[][] = [];
const fakeDb = {
  dialect: 'postgresql',
  async get() { return undefined; },
  async all() { return []; },
  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    if (/INSERT INTO app_settings/.test(sql)) { settingsWrites.push(params); return { changes: 1, lastInsertRowid: 0 }; }
    throw new Error(`fake db: unexpected run(): ${sql.slice(0, 80)}`);
  },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(fakeDb as unknown as DatabaseAdapter); },
  async close() { /* noop */ },
};

const originalMode = process.env.DEPLOYMENT_MODE;
let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.header('x-test-user');
    if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
    next();
  });
  app.use('/api', await createKnowledgePacksRoutes(fakeDb as unknown as DatabaseAdapter));
  app.use('/api/analytics', await createAnalyticsRouter(fakeDb as unknown as DatabaseAdapter));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

afterEach(() => {
  settingsWrites.length = 0;
  vi.clearAllMocks();
});

type Who = { id: string; role: string };
const ANALYST: Who = { id: 'carol', role: 'analyst' };
const VIEWER: Who = { id: 'vic', role: 'viewer' };
const ADMIN: Who = { id: 'root', role: 'admin' };
const SOLO: Who = { id: 'solo', role: 'admin' };

function mode(m: 'team' | 'solo'): void {
  if (m === 'team') process.env.DEPLOYMENT_MODE = 'team'; else delete process.env.DEPLOYMENT_MODE;
}

async function send(method: string, url: string, who: Who, body?: unknown): Promise<number> {
  const r = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user': who.id, 'x-test-role': who.role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await r.text();
  return r.status;
}

async function importBundle(who: Who): Promise<number> {
  const form = new FormData();
  form.append('bundle', new Blob([Buffer.from('PK-not-really-a-zip')]), 'pack.anton');
  const r = await fetch(`${base}/api/knowledge-packs/import`, {
    method: 'POST',
    headers: { 'x-test-user': who.id, 'x-test-role': who.role },
    body: form,
  });
  await r.text();
  return r.status;
}

/** Each pack mutation, and the service call that proves it went through. */
const PACK_MUTATIONS: Array<{ name: string; run: (who: Who) => Promise<number>; effect: () => ReturnType<typeof vi.fn>; ok: number }> = [
  { name: 'import', run: importBundle, effect: () => svc.importBundle, ok: 201 },
  { name: 'install bundled', run: (w) => send('POST', '/api/knowledge-packs/bundled/amlr/install', w), effect: () => svc.installBundledPack, ok: 201 },
  { name: 'activate', run: (w) => send('PATCH', '/api/knowledge-packs/pack-1/activate', w), effect: () => svc.activatePack, ok: 200 },
  { name: 'deactivate', run: (w) => send('PATCH', '/api/knowledge-packs/pack-1/deactivate', w), effect: () => svc.deactivatePack, ok: 200 },
  { name: 'delete', run: (w) => send('DELETE', '/api/knowledge-packs/pack-1', w), effect: () => svc.deletePack, ok: 200 },
];

describe('H10: knowledge-pack mutations are admin-only in team mode', () => {
  for (const m of PACK_MUTATIONS) {
    it(`${m.name}: 403 for an analyst and a viewer, and the service is never called`, async () => {
      mode('team');
      expect(await m.run(ANALYST)).toBe(403);
      expect(await m.run(VIEWER)).toBe(403);
      expect(m.effect()).not.toHaveBeenCalled();
    });
  }

  // Negative controls. One admin pass and one solo pass per mutation stays under
  // the import rate limit (10 per window), which only counts requests the guard lets through.
  for (const m of PACK_MUTATIONS) {
    it(`${m.name}: an admin in team mode, and the solo user, go through`, async () => {
      mode('team');
      expect(await m.run(ADMIN)).toBe(m.ok);
      mode('solo');
      expect(await m.run(SOLO)).toBe(m.ok);
      expect(m.effect()).toHaveBeenCalledTimes(2);
    });
  }

  it("an analyst cannot switch off a 'system' pack, nor activate one they imported themselves", async () => {
    // The old per-pack check let exactly these through: it waved 'system' packs past
    // for everyone and treated the importer as the pack's authority.
    mode('team');
    try {
      svc.pack.user_id = 'system';
      expect(await send('PATCH', '/api/knowledge-packs/pack-1/deactivate', ANALYST)).toBe(403);
      expect(await send('DELETE', '/api/knowledge-packs/pack-1', ANALYST)).toBe(403);
      svc.pack.user_id = ANALYST.id;
      expect(await send('PATCH', '/api/knowledge-packs/pack-1/activate', ANALYST)).toBe(403);
      expect(svc.deactivatePack).not.toHaveBeenCalled();
      expect(svc.deletePack).not.toHaveBeenCalled();
      expect(svc.activatePack).not.toHaveBeenCalled();
    } finally {
      svc.pack.user_id = 'someone-else';
    }
  });

  it('an admin may manage a pack someone else imported (the per-pack owner check is gone)', async () => {
    mode('team');
    expect(svc.pack.user_id).not.toBe(ADMIN.id);
    expect(await send('PATCH', '/api/knowledge-packs/pack-1/deactivate', ADMIN)).toBe(200);
    expect(svc.deactivatePack).toHaveBeenCalledWith('pack-1');
  });

  it('reading packs stays open to every user in team mode', async () => {
    mode('team');
    expect(await send('GET', '/api/knowledge-packs', ANALYST)).toBe(200);
    expect(await send('GET', '/api/knowledge-packs/pack-1', VIEWER)).toBe(200);
    expect(await send('GET', '/api/knowledge-packs/meta/active-summary', ANALYST)).toBe(200);
  });
});

describe('H11: POST /api/analytics/budget-cap is admin-only in team mode', () => {
  it('403 for an analyst, and the cap is not written', async () => {
    mode('team');
    expect(await send('POST', '/api/analytics/budget-cap', ANALYST, { cap: 0 })).toBe(403);
    expect(await send('POST', '/api/analytics/budget-cap', VIEWER, { cap: 1 })).toBe(403);
    expect(settingsWrites).toEqual([]);
  });

  it('negative control: an admin sets it in team mode, and the solo user sets it as before', async () => {
    mode('team');
    expect(await send('POST', '/api/analytics/budget-cap', ADMIN, { cap: 250 })).toBe(200);
    mode('solo');
    expect(await send('POST', '/api/analytics/budget-cap', SOLO, { cap: 300 })).toBe(200);
    expect(settingsWrites).toEqual([['250'], ['300']]);
  });
});
