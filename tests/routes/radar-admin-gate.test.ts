/**
 * radar-admin-gate.test.ts — the radar is one per instance, and any signed-in
 * user could reconfigure it (public-demo readiness, 2026-09-25).
 *
 * Before: every radar route was open to every user. A visitor could add or
 * delete sources, inject items, make the instance score items with the model,
 * start scans, and PUT /api/radar/settings to start background scans at any
 * interval — 0 hours included, which setInterval runs back to back — with
 * nobody watching the spend.
 *
 * Now, in team mode, everything that changes the radar or makes it spend is
 * admin-only (requireAdminOrSolo), and the settings route refuses an interval
 * under one hour (or past setInterval's ceiling) and a cron schedule that fires
 * more than hourly, before writing anything.
 *
 * Negative controls: an admin and the solo user still go through; reads, and
 * the triage of an item's status, stay open to every user; a valid interval
 * and an hourly cron are accepted.
 *
 * Public demo (2026-10-02): the feed is shared by strangers, so a visitor's
 * triage would change it for everyone — a demo visitor gets 404 and nothing
 * changes (an admin still triages). A status outside the table's CHECK list
 * is refused before the database sees it, an unknown item is a 404, and a
 * team user who may not run the radar does not see who dismissed an item.
 * The single-item score route finds the item by id (it used to search the
 * newest item only) and reads a fenced or prose-wrapped reply.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const radarSvc = vi.hoisted(() => ({
  getRadarSummary: vi.fn(async () => ({ newItems: 0 })),
  getSources: vi.fn(async () => []),
  createSource: vi.fn(async () => 'src_1'),
  updateSource: vi.fn(async () => undefined),
  deleteSource: vi.fn(async () => undefined),
  getItems: vi.fn(async () => [{ id: 'ri_1', title: 'EBA guideline', summary: 'text', dismissed_by: 'u_admin_7' }]),
  getItem: vi.fn(async (id: string) => (id === 'ri_1' || id === 'ri_2' ? { id, title: 'EBA guideline', summary: 'text' } : undefined)),
  ingestManualItem: vi.fn(async () => 'ri_2'),
  updateItemStatus: vi.fn(async (id: string) => id !== 'ri_missing'),
  scoreItem: vi.fn(async () => undefined),
}));
vi.mock('../../server/services/regulatory-radar.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/services/regulatory-radar.js')>()),
  createRegulatoryRadar: async () => radarSvc,
}));

const chat = vi.hoisted(() => ({
  callChat: vi.fn(async () => ({
    text: '{"relevance_score":0.5,"urgency_score":0.2,"ai_summary":"s","impact_areas":[]}',
    inputTokens: 1, outputTokens: 1,
  })),
}));
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: chat.callChat,
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => 'claude-haiku-4-5',
}));

import { createRadarRoutes } from '../../server/routes/radar.js';
import { MAX_AUTO_SCAN_INTERVAL_HOURS } from '../../server/services/radar-fetcher.js';

const fetcher = {
  scanAllSources: vi.fn(async () => ({ sourcesScanned: 0, newItemsFound: 0, itemsScored: 0, errors: [], startedAt: '', completedAt: '' })),
  scanSource: vi.fn(async () => ({ sourceId: 'src_1', sourceName: 'x', newItems: 0 })),
  scoreUnscoredItems: vi.fn(async () => 0),
  getScanStatus: vi.fn(() => ({ scanInProgress: false })),
  stopScan: vi.fn(() => undefined),
  startAutoScan: vi.fn((_h: number) => true),
  stopAutoScan: vi.fn(() => undefined),
  getAutoScanConfig: vi.fn(() => ({ enabled: false, intervalHours: 0 })),
};

const settingsWrites: unknown[][] = [];
const fakeDb = {
  dialect: 'postgresql',
  async get() { return undefined; },
  async all() { return []; },
  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    if (/INSERT INTO radar_settings/.test(sql)) { settingsWrites.push(params); return { changes: 1, lastInsertRowid: 0 }; }
    throw new Error(`fake db: unexpected run(): ${sql.slice(0, 80)}`);
  },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(fakeDb as unknown as DatabaseAdapter); },
  async close() { /* noop */ },
};

const originalMode = process.env.DEPLOYMENT_MODE;
const originalDemo = process.env.DEMO_MODE;
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
  app.use('/api', await createRadarRoutes(fakeDb as unknown as DatabaseAdapter, fetcher as never));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  if (originalDemo === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = originalDemo;
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

afterEach(() => {
  settingsWrites.length = 0;
  delete process.env.DEMO_MODE;
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

async function send(method: string, url: string, who: Who, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user': who.id, 'x-test-role': who.role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }
  return { status: r.status, body: parsed };
}

/** Each gated route, and the call that proves it went through. */
const GATED: Array<{ name: string; method: string; url: string; body?: unknown; effect: () => ReturnType<typeof vi.fn> }> = [
  { name: 'create source', method: 'POST', url: '/api/radar/sources', body: { displayName: 'X', url: 'https://example.org/rss', sourceType: 'rss' }, effect: () => radarSvc.createSource },
  { name: 'update source', method: 'PUT', url: '/api/radar/sources/src_1', body: { displayName: 'Y' }, effect: () => radarSvc.updateSource },
  { name: 'delete source', method: 'DELETE', url: '/api/radar/sources/src_1', effect: () => radarSvc.deleteSource },
  { name: 'ingest item', method: 'POST', url: '/api/radar/items', body: { sourceId: 'src_1', title: 't', summary: 's' }, effect: () => radarSvc.ingestManualItem },
  { name: 'AI-score item', method: 'POST', url: '/api/radar/items/ri_1/score', body: {}, effect: () => chat.callChat },
  { name: 'scan all', method: 'POST', url: '/api/radar/scan', body: {}, effect: () => fetcher.scanAllSources },
  { name: 'scan one source', method: 'POST', url: '/api/radar/scan/src_1', effect: () => fetcher.scanSource },
  { name: 'stop scan', method: 'POST', url: '/api/radar/stop', effect: () => fetcher.stopScan },
  { name: 'auto-scan settings', method: 'PUT', url: '/api/radar/settings', body: { autoScanEnabled: true, autoScanIntervalHours: 6 }, effect: () => fetcher.startAutoScan },
];

describe('radar: changing it or making it spend is admin-only in team mode', () => {
  for (const g of GATED) {
    it(`${g.name}: 403 for an analyst and a viewer, and nothing happens`, async () => {
      mode('team');
      expect((await send(g.method, g.url, ANALYST, g.body)).status).toBe(403);
      expect((await send(g.method, g.url, VIEWER, g.body)).status).toBe(403);
      expect(g.effect()).not.toHaveBeenCalled();
      expect(settingsWrites).toHaveLength(0);
    });
  }

  for (const g of GATED) {
    it(`${g.name}: an admin in team mode, and the solo user, go through`, async () => {
      mode('team');
      expect((await send(g.method, g.url, ADMIN, g.body)).status).toBe(200);
      mode('solo');
      expect((await send(g.method, g.url, SOLO, g.body)).status).toBe(200);
      expect(g.effect()).toHaveBeenCalledTimes(2);
    });
  }

  it('reads, and triage of an item status, stay open to every user', async () => {
    mode('team');
    for (const url of ['/api/radar/summary', '/api/radar/sources', '/api/radar/items', '/api/radar/settings', '/api/radar/scan-status']) {
      expect((await send('GET', url, VIEWER)).status, url).toBe(200);
    }
    expect((await send('PUT', '/api/radar/items/ri_1/status', ANALYST, { status: 'reviewed' })).status).toBe(200);
    expect(radarSvc.updateItemStatus).toHaveBeenCalledTimes(1);
  });
});

describe('radar settings: no background scan more often than hourly', () => {
  for (const bad of [0, 0.5, -1, MAX_AUTO_SCAN_INTERVAL_HOURS + 1, 'abc']) {
    it(`refuses autoScanIntervalHours=${JSON.stringify(bad)} and writes nothing, not even the other fields`, async () => {
      mode('solo');
      const r = await send('PUT', '/api/radar/settings', SOLO, { autoScanEnabled: true, autoScanIntervalHours: bad });
      expect(r.status).toBe(400);
      expect(settingsWrites).toHaveLength(0);
      expect(fetcher.startAutoScan).not.toHaveBeenCalled();
    });
  }

  it('refuses a cron schedule that fires every minute, before writing anything', async () => {
    mode('solo');
    const r = await send('PUT', '/api/radar/settings', SOLO, { autoScanEnabled: true, autoScanCron: '* * * * *' });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/at most once an hour/);
    expect(settingsWrites).toHaveLength(0);
  });

  it('refuses a six-field cron that fires every second of a fixed minute', async () => {
    mode('solo');
    expect((await send('PUT', '/api/radar/settings', SOLO, { autoScanCron: '* 0 * * * *' })).status).toBe(400);
    expect(settingsWrites).toHaveLength(0);
  });

  it('accepts one hour, and an every-six-hours cron (negative controls)', async () => {
    mode('solo');
    const r = await send('PUT', '/api/radar/settings', SOLO, { autoScanEnabled: true, autoScanIntervalHours: 1, autoScanCron: '0 */6 * * *' });
    expect(r.status).toBe(200);
    expect(fetcher.startAutoScan).toHaveBeenCalledWith(1);
    expect(settingsWrites.map((p) => p[0])).toEqual(['auto_scan_enabled', 'auto_scan_interval_hours', 'auto_scan_cron']);
  });

  it('says whether the scan was really scheduled (autoScanActive)', async () => {
    mode('solo');
    const on = await send('PUT', '/api/radar/settings', SOLO, { autoScanEnabled: true, autoScanIntervalHours: 24 });
    expect(on.body.autoScanActive).toBe(true);
    // The fetcher refuses while RADAR_AUTOMATION_DISABLED or DEMO_MODE is set.
    fetcher.startAutoScan.mockReturnValueOnce(false);
    const off = await send('PUT', '/api/radar/settings', SOLO, { autoScanEnabled: true, autoScanIntervalHours: 24 });
    expect(off.status).toBe(200);
    expect(off.body.autoScanActive).toBe(false);
  });
});

describe('radar on a public demo: visitors read, the operator triages', () => {
  it('a demo visitor\'s status change is a 404 and changes nothing', async () => {
    mode('team');
    process.env.DEMO_MODE = 'true';
    const r = await send('PUT', '/api/radar/items/ri_1/status', ANALYST, { status: 'dismissed' });
    expect(r.status).toBe(404);
    expect(radarSvc.updateItemStatus).not.toHaveBeenCalled();
  });

  it('negative control: the admin of the demo still triages', async () => {
    mode('team');
    process.env.DEMO_MODE = 'true';
    expect((await send('PUT', '/api/radar/items/ri_1/status', ADMIN, { status: 'dismissed' })).status).toBe(200);
    expect(radarSvc.updateItemStatus).toHaveBeenCalledWith('ri_1', 'dismissed', 'root');
  });

  it('a demo visitor still reads the feed', async () => {
    mode('team');
    process.env.DEMO_MODE = 'true';
    for (const url of ['/api/radar/summary', '/api/radar/sources', '/api/radar/items', '/api/radar/scan-status']) {
      expect((await send('GET', url, ANALYST)).status, url).toBe(200);
    }
  });
});

describe('radar item status: checked before it is written', () => {
  for (const bad of ['deleted', '', 42, null]) {
    it(`refuses status=${JSON.stringify(bad)} with 400 and writes nothing`, async () => {
      mode('team');
      const r = await send('PUT', '/api/radar/items/ri_1/status', ANALYST, { status: bad });
      expect(r.status).toBe(400);
      expect(radarSvc.updateItemStatus).not.toHaveBeenCalled();
    });
  }

  it('an unknown item is a 404', async () => {
    mode('team');
    expect((await send('PUT', '/api/radar/items/ri_missing/status', ANALYST, { status: 'reviewed' })).status).toBe(404);
  });
});

describe('radar items: who dismissed an item is not shown to every user', () => {
  async function items(who: Who): Promise<Array<Record<string, unknown>>> {
    const r = await fetch(`${base}/api/radar/items`, { headers: { 'x-test-user': who.id, 'x-test-role': who.role } });
    return await r.json() as Array<Record<string, unknown>>;
  }

  it('a team analyst or viewer gets the items without dismissed_by', async () => {
    mode('team');
    for (const who of [ANALYST, VIEWER]) {
      const list = await items(who);
      expect(list[0].title).toBe('EBA guideline');
      expect(list[0]).not.toHaveProperty('dismissed_by');
    }
  });

  it('negative control: the admin and the solo user see it', async () => {
    mode('team');
    expect((await items(ADMIN))[0].dismissed_by).toBe('u_admin_7');
    mode('solo');
    expect((await items(SOLO))[0].dismissed_by).toBe('u_admin_7');
  });
});

describe('scoring one item', () => {
  it('finds the item by id, not only the newest one, and reads a fenced reply', async () => {
    mode('solo');
    chat.callChat.mockResolvedValueOnce({
      text: 'Here is the score:\n```json\n{"relevance_score": 0.9, "urgency_score": "0.4", "ai_summary": "s", "impact_areas": ["AML"]}\n```',
      inputTokens: 1, outputTokens: 1,
    });
    const r = await send('POST', '/api/radar/items/ri_2/score', SOLO, {});
    expect(r.status).toBe(200);
    expect(radarSvc.getItem).toHaveBeenCalledWith('ri_2');
    expect(radarSvc.scoreItem).toHaveBeenCalledWith('ri_2', 0.9, 0.4, 's', ['AML']);
  });

  it('a reply with no score is a 502 and scores nothing; an unknown item is a 404', async () => {
    mode('solo');
    chat.callChat.mockResolvedValueOnce({ text: 'I cannot score this.', inputTokens: 1, outputTokens: 1 });
    expect((await send('POST', '/api/radar/items/ri_1/score', SOLO, {})).status).toBe(502);
    expect((await send('POST', '/api/radar/items/ri_unknown/score', SOLO, {})).status).toBe(404);
    expect(radarSvc.scoreItem).not.toHaveBeenCalled();
  });
});
