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
  getItems: vi.fn(async () => [{ id: 'ri_1', title: 'EBA guideline', summary: 'text' }]),
  ingestManualItem: vi.fn(async () => 'ri_2'),
  updateItemStatus: vi.fn(async () => undefined),
  scoreItem: vi.fn(async () => undefined),
}));
vi.mock('../../server/services/regulatory-radar.js', () => ({
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
