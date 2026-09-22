/**
 * engine-guards.test.ts — GET/POST /api/settings/engine-guards (Wave 5).
 *
 * Against a fake adapter that keeps app_settings in a Map and answers the
 * audit-log seed with a scripted count (no database):
 *   - GET returns { sdkDailyRunCap, sdkRunsToday } with the persisted cap
 *     and a count seeded from the audit log;
 *   - POST validates: an integer >= 1 or null; 0, 1.5, a string and a
 *     missing key are 400s and write nothing;
 *   - POST persists (one app_settings row) or removes (DELETE) the cap, and
 *     answers the same shape as the GET;
 *   - in team mode a viewer may read but not write; solo mode is not gated;
 *   - a database error on the write is a 500 through safeError.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createEngineGuardRoutes } from '../../server/routes/engine-guards.js';
import {
  resetSdkDailyCounterForTests,
  SDK_DAILY_CAP_SEED_SQL,
  SDK_DAILY_RUN_CAP_SETTING_KEY,
} from '../../server/services/claude-sdk-client.js';

interface FakeState {
  settings: Map<string, string>;
  auditRunsToday: number;
  seedQueries: number;
  runThrows: boolean;
  writes: Array<{ sql: string; params: unknown[] }>;
}
const state: FakeState = { settings: new Map(), auditRunsToday: 0, seedQueries: 0, runThrows: false, writes: [] };

const db = {
  dialect: 'postgresql',
  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    if (sql === SDK_DAILY_CAP_SEED_SQL) { state.seedQueries += 1; return { n: String(state.auditRunsToday) } as T; }
    if (sql.includes('FROM app_settings')) {
      const value = state.settings.get(String(params[0]));
      return value === undefined ? undefined : ({ value } as T);
    }
    return undefined;
  },
  async all<T>(): Promise<T[]> { return []; },
  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    if (state.runThrows) throw new Error('connection terminated unexpectedly');
    state.writes.push({ sql, params });
    if (sql.startsWith('INSERT INTO app_settings')) state.settings.set(String(params[0]), String(params[1]));
    if (sql.startsWith('DELETE FROM app_settings')) state.settings.delete(String(params[0]));
    return { changes: 1, lastInsertRowid: 0 };
  },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
  async close() { /* noop */ },
} as unknown as DatabaseAdapter;

let server: Server;
let base = '';
let originalMode: string | undefined;
let current: { id: string; username: string; role: string };

/** A fresh app per test so the route factory's boot-time prime sees this test's settings. */
async function listen(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: typeof current }).user = current; next(); });
  app.use('/api', createEngineGuardRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}/api`;
}

beforeAll(() => { originalMode = process.env.DEPLOYMENT_MODE; });
afterAll(() => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
});

beforeEach(async () => {
  await new Promise<void>((resolve) => { if (server) server.close(() => resolve()); else resolve(); });
  state.settings.clear();
  state.auditRunsToday = 0;
  state.seedQueries = 0;
  state.runThrows = false;
  state.writes = [];
  resetSdkDailyCounterForTests();
  delete process.env.DEPLOYMENT_MODE;                       // solo unless a test says otherwise
  current = { id: 'solo', username: 'solo', role: 'admin' };
  await listen();
});

const get = () => fetch(`${base}/settings/engine-guards`);
const post = (body: unknown) => fetch(`${base}/settings/engine-guards`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
interface Shape { sdkDailyRunCap: number | null; sdkRunsToday: number }

describe('GET /settings/engine-guards', () => {
  it('answers the contract shape: no cap persisted → null, count seeded from the audit log', async () => {
    state.auditRunsToday = 4;
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json() as Shape).toEqual({ sdkDailyRunCap: null, sdkRunsToday: 4 });
    expect(state.seedQueries).toBe(1);
  });

  it('reads a persisted cap and seeds the count once across reads', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    state.settings.set(SDK_DAILY_RUN_CAP_SETTING_KEY, '25');
    state.auditRunsToday = 7;
    resetSdkDailyCounterForTests();
    await listen();
    expect(await (await get()).json() as Shape).toEqual({ sdkDailyRunCap: 25, sdkRunsToday: 7 });
    expect(await (await get()).json() as Shape).toEqual({ sdkDailyRunCap: 25, sdkRunsToday: 7 });
    expect(state.seedQueries).toBe(1);
  });
});

describe('POST /settings/engine-guards', () => {
  it('persists an integer cap as one app_settings row and answers the state', async () => {
    const res = await post({ sdkDailyRunCap: 40 });
    expect(res.status).toBe(200);
    expect(await res.json() as Shape).toEqual({ sdkDailyRunCap: 40, sdkRunsToday: 0 });
    expect(state.settings.get(SDK_DAILY_RUN_CAP_SETTING_KEY)).toBe('40');
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].sql).toMatch(/^INSERT INTO app_settings/);
    expect(await (await get()).json() as Shape).toMatchObject({ sdkDailyRunCap: 40 });
  });

  it('null removes the cap (DELETE) and the GET reports unlimited', async () => {
    await post({ sdkDailyRunCap: 12 });
    const res = await post({ sdkDailyRunCap: null });
    expect(res.status).toBe(200);
    expect(await res.json() as Shape).toEqual({ sdkDailyRunCap: null, sdkRunsToday: 0 });
    expect(state.settings.has(SDK_DAILY_RUN_CAP_SETTING_KEY)).toBe(false);
    expect(state.writes.at(-1)?.sql).toMatch(/^DELETE FROM app_settings/);
  });

  it('rejects 0, a fraction, a string, and a missing key with a 400 and writes nothing', async () => {
    for (const body of [{ sdkDailyRunCap: 0 }, { sdkDailyRunCap: 1.5 }, { sdkDailyRunCap: '10' }, { sdkDailyRunCap: -3 }, {}, { other: 1 }]) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toContain('sdkDailyRunCap');
    }
    expect(state.writes).toHaveLength(0);
    expect(await (await get()).json() as Shape).toEqual({ sdkDailyRunCap: null, sdkRunsToday: 0 });
  });

  it('in team mode a viewer may read but not write; an admin may', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    current = { id: 'v', username: 'viewer', role: 'viewer' };
    expect((await get()).status).toBe(200);
    expect((await post({ sdkDailyRunCap: 5 })).status).toBe(403);
    expect(state.writes).toHaveLength(0);
    current = { id: 'a', username: 'admin', role: 'admin' };
    expect((await post({ sdkDailyRunCap: 5 })).status).toBe(200);
  });

  it('a database error on the write answers 500 with a scrubbed error, not a hung request', async () => {
    state.runThrows = true;
    const res = await post({ sdkDailyRunCap: 5 });
    expect(res.status).toBe(500);
    const data = await res.json() as { error: string };
    expect(typeof data.error).toBe('string');
    expect(data.error.length).toBeGreaterThan(0);
  });
});
