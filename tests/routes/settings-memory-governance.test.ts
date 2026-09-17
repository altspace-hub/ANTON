/**
 * settings-memory-governance.test.ts — the three governance settings behind
 * one Settings entry (Wave 4b, GET/POST /api/settings/memory-governance).
 *
 * Against a fake adapter that answers the gate's own statements by identity
 * and keeps app_settings in a Map (no database):
 *
 *   - GET returns the documented shape, with the injection gate read FRESH
 *     (a count that changed a moment ago is what the page shows);
 *   - POST validates every key before writing any — one bad key and nothing
 *     changes, with a 400 that names the key;
 *   - POST writes only the keys present, logs one line per key whose value
 *     actually changed, and answers the same shape as the GET;
 *   - the extraction default follows the default model (off under `sdk:`);
 *   - in team mode a viewer may read but not write; solo mode is not gated;
 *   - a database error on the write answers 500 through safeError, not a
 *     hung request.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createSettingsRoutes } from '../../server/routes/settings.js';
import {
  ATOM_INJECTION_GATE_SQL,
  ATOM_INJECTION_MODE_SETTING_KEY,
  resetAtomInjectionGateCache,
} from '../../server/services/atom-injection-gate.js';
import { OVERSIGHT_BLOCKS_EXPORT_SETTING_KEY } from '../../server/services/oversight-status.js';
import { AUTO_EXTRACTION_SETTING_KEY, resetAutoExtractionForTests } from '../../server/services/structured-extraction-queue.js';

interface FakeState {
  settings: Map<string, string>;
  moduleAtoms: number;
  ratings: number;
  /** Every write throws (simulates a database error mid-request). */
  runThrows: boolean;
  writes: Array<{ sql: string; params: unknown[] }>;
}

const state: FakeState = { settings: new Map(), moduleAtoms: 0, ratings: 0, runThrows: false, writes: [] };

const db = {
  dialect: 'postgresql',
  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    // Postgres hands COUNT(*) back as a string; the gate must Number() it.
    if (sql === ATOM_INJECTION_GATE_SQL.moduleAtoms) return { c: String(state.moduleAtoms) } as T;
    if (sql === ATOM_INJECTION_GATE_SQL.ratings) return { c: String(state.ratings) } as T;
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
let originalDefaultModel: string | undefined;
let current: { id: string; username: string; role: string };

beforeAll(async () => {
  originalMode = process.env.DEPLOYMENT_MODE;
  originalDefaultModel = process.env.DEFAULT_MODEL;
  delete process.env.DEFAULT_MODEL;   // the extraction-default test sets the model itself

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: typeof current }).user = current; next(); });
  app.use('/api', await createSettingsRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  if (originalDefaultModel === undefined) delete process.env.DEFAULT_MODEL; else process.env.DEFAULT_MODEL = originalDefaultModel;
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

beforeEach(() => {
  state.settings.clear();
  state.moduleAtoms = 0;
  state.ratings = 0;
  state.runThrows = false;
  state.writes = [];
  resetAtomInjectionGateCache();
  resetAutoExtractionForTests();
  delete process.env.DEPLOYMENT_MODE;                       // solo unless a test says otherwise
  current = { id: 'solo', username: 'solo', role: 'admin' };
});

afterEach(() => { vi.restoreAllMocks(); });

const get = () => fetch(`${base}/settings/memory-governance`);
const post = (body: unknown) => fetch(`${base}/settings/memory-governance`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

interface Shape {
  atomInjection: {
    mode: string; ready: boolean; applies: boolean; moduleAtoms: number; ratings: number;
    thresholds: { moduleAtoms: number; ratings: number }; reason: string;
  };
  oversightBlocksExport: boolean;
  structuredExtractionAuto: boolean;
  structuredExtractionAutoDefault: boolean;
}

function expectShape(body: Shape): void {
  expect(Object.keys(body).sort()).toEqual(['atomInjection', 'oversightBlocksExport', 'structuredExtractionAuto', 'structuredExtractionAutoDefault']);
  expect(Object.keys(body.atomInjection).sort()).toEqual(['applies', 'mode', 'moduleAtoms', 'ratings', 'ready', 'reason', 'thresholds']);
  expect(typeof body.oversightBlocksExport).toBe('boolean');
  expect(typeof body.structuredExtractionAuto).toBe('boolean');
  expect(typeof body.structuredExtractionAutoDefault).toBe('boolean');
}

describe('GET /settings/memory-governance', () => {
  it('answers the documented shape with the defaults when nothing is persisted', async () => {
    state.moduleAtoms = 91;
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json() as Shape;
    expectShape(body);
    expect(body.atomInjection.mode).toBe('auto');
    expect(body.atomInjection.applies).toBe(false);
    expect(body.atomInjection.moduleAtoms).toBe(91);
    expect(body.atomInjection.reason).toBe('Collecting: 91 of 100 module atoms, 0 of 30 ratings');
    expect(body.oversightBlocksExport).toBe(false);                            // default OFF
    expect(body.structuredExtractionAuto).toBe(body.structuredExtractionAutoDefault); // no row → default rule
  });

  it('reads the injection gate fresh — a count that just changed is what the page sees', async () => {
    state.moduleAtoms = 10;
    expect(((await (await get()).json()) as Shape).atomInjection.moduleAtoms).toBe(10);
    state.moduleAtoms = 11;                                   // within the gate's 60 s cache window
    expect(((await (await get()).json()) as Shape).atomInjection.moduleAtoms).toBe(11);
  });

  it('reflects persisted rows: forced on, export blocked, extraction on', async () => {
    state.settings.set(ATOM_INJECTION_MODE_SETTING_KEY, 'on');
    state.settings.set(OVERSIGHT_BLOCKS_EXPORT_SETTING_KEY, 'true');
    state.settings.set(AUTO_EXTRACTION_SETTING_KEY, 'true');
    const body = await (await get()).json() as Shape;
    expect(body.atomInjection.mode).toBe('on');
    expect(body.atomInjection.applies).toBe(true);
    expect(body.atomInjection.reason).toBe('Forced on in Settings');
    expect(body.oversightBlocksExport).toBe(true);
    expect(body.structuredExtractionAuto).toBe(true);
  });

  it('the extraction default follows the default model: off under sdk:, on otherwise', async () => {
    let res = await fetch(`${base}/settings/default-model`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'sdk:claude-opus-5' }),
    });
    expect(res.status).toBe(200);
    let body = await (await get()).json() as Shape;
    expect(body.structuredExtractionAutoDefault).toBe(false);
    expect(body.structuredExtractionAuto).toBe(false);

    res = await fetch(`${base}/settings/default-model`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: null }),
    });
    expect(res.status).toBe(200);
    body = await (await get()).json() as Shape;
    expect(body.structuredExtractionAutoDefault).toBe(true);
    expect(body.structuredExtractionAuto).toBe(true);
  });
});

describe('POST /settings/memory-governance — validation', () => {
  it.each([
    [{ atomInjectionMode: 'sometimes' }, /atomInjectionMode/],
    [{ atomInjectionMode: true }, /atomInjectionMode/],
    [{ oversightBlocksExport: 'yes' }, /oversightBlocksExport/],
    [{ oversightBlocksExport: 1 }, /oversightBlocksExport/],
    [{ structuredExtractionAuto: 'on' }, /structuredExtractionAuto/],
    [{ structuredExtractionAuto: null }, /structuredExtractionAuto/],
  ])('400s %j naming the key, and writes nothing', async (body, pattern) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(pattern);
    expect(state.writes).toHaveLength(0);
  });

  it('one bad key voids the whole request — the valid key next to it is not applied', async () => {
    const res = await post({ oversightBlocksExport: true, atomInjectionMode: 'maybe' });
    expect(res.status).toBe(400);
    expect(state.writes).toHaveLength(0);
    expect(state.settings.has(OVERSIGHT_BLOCKS_EXPORT_SETTING_KEY)).toBe(false);
  });

  it('accepts an empty patch as a no-op and answers the current state', async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    expectShape(await res.json() as Shape);
    expect(state.writes).toHaveLength(0);
  });
});

describe('POST /settings/memory-governance — applies only the keys present', () => {
  it('writes one key and leaves the other two rows absent', async () => {
    const res = await post({ oversightBlocksExport: true });
    expect(res.status).toBe(200);
    const body = await res.json() as Shape;
    expectShape(body);
    expect(body.oversightBlocksExport).toBe(true);
    expect(state.settings.get(OVERSIGHT_BLOCKS_EXPORT_SETTING_KEY)).toBe('true');
    expect(state.settings.has(ATOM_INJECTION_MODE_SETTING_KEY)).toBe(false);
    expect(state.settings.has(AUTO_EXTRACTION_SETTING_KEY)).toBe(false);
    expect(state.writes).toHaveLength(1);
  });

  it('writes all three and the answer reflects each, including the gate reason', async () => {
    const res = await post({ atomInjectionMode: 'on', oversightBlocksExport: true, structuredExtractionAuto: true });
    expect(res.status).toBe(200);
    const body = await res.json() as Shape;
    expect(body.atomInjection.mode).toBe('on');
    expect(body.atomInjection.applies).toBe(true);
    expect(body.atomInjection.reason).toBe('Forced on in Settings');
    expect(body.oversightBlocksExport).toBe(true);
    expect(body.structuredExtractionAuto).toBe(true);
    expect(state.settings.get(ATOM_INJECTION_MODE_SETTING_KEY)).toBe('on');
    expect(state.settings.get(OVERSIGHT_BLOCKS_EXPORT_SETTING_KEY)).toBe('true');
    expect(state.settings.get(AUTO_EXTRACTION_SETTING_KEY)).toBe('true');
  });

  it('switching the gate off is visible on the very next read (the 60 s cache is dropped)', async () => {
    state.settings.set(ATOM_INJECTION_MODE_SETTING_KEY, 'on');
    expect(((await (await get()).json()) as Shape).atomInjection.applies).toBe(true);
    const body = await (await post({ atomInjectionMode: 'off' })).json() as Shape;
    expect(body.atomInjection.mode).toBe('off');
    expect(body.atomInjection.applies).toBe(false);
    expect(body.atomInjection.reason).toBe('Switched off in Settings');
  });

  it('logs one line per key whose value changed, and none for a key set to what it already was', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const lines = () => log.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('[settings] memory-governance:'));

    await post({ atomInjectionMode: 'on', oversightBlocksExport: true });
    expect(lines()).toEqual([
      '[settings] memory-governance: atomInjectionMode → on',
      '[settings] memory-governance: oversightBlocksExport → true',
    ]);

    log.mockClear();
    await post({ atomInjectionMode: 'on', oversightBlocksExport: true, structuredExtractionAuto: false });
    // 'on' and true were already the values. Extraction had no row, so its
    // effective value was the default (ON — no sdk: model here); false changes it.
    expect(lines()).toEqual(['[settings] memory-governance: structuredExtractionAuto → false']);

    log.mockClear();
    await post({ structuredExtractionAuto: false });
    expect(lines()).toEqual([]);
  });
});

describe('access', () => {
  it('team mode: a viewer may read but the write answers 403 and nothing is written', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    current = { id: 'u-1', username: 'viewer', role: 'viewer' };
    expect((await get()).status).toBe(200);
    const res = await post({ oversightBlocksExport: true });
    expect(res.status).toBe(403);
    expect(state.writes).toHaveLength(0);
  });

  it('team mode: an admin writes', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    current = { id: 'a-1', username: 'admin', role: 'admin' };
    expect((await post({ oversightBlocksExport: true })).status).toBe(200);
    expect(state.settings.get(OVERSIGHT_BLOCKS_EXPORT_SETTING_KEY)).toBe('true');
  });

  it('solo mode: the laptop owner writes whatever role they carry', async () => {
    current = { id: 'solo', username: 'solo', role: 'viewer' };
    expect((await post({ atomInjectionMode: 'off' })).status).toBe(200);
    expect(state.settings.get(ATOM_INJECTION_MODE_SETTING_KEY)).toBe('off');
  });
});

describe('errors', () => {
  it('a database error on the write answers 500 with an error string', async () => {
    state.runThrows = true;
    const res = await post({ oversightBlocksExport: true });
    expect(res.status).toBe(500);
    const body = await res.json() as { error?: unknown };
    expect(typeof body.error).toBe('string');
  });
});
