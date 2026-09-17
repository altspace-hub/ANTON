/**
 * module-access.test.ts — the module-access router (Wave 6 track F).
 *
 * Express harness with a stamped req.user and a fake adapter (no database);
 * the module catalogue is mocked so the check and preview endpoints are
 * hermetic.
 *
 *   - POST validation answers 400 naming the field, and stores nothing;
 *   - in team mode only an admin may list / add / remove / preview;
 *   - GET /check uses the CALLER's role, resolves the area from the
 *     catalogue when the page did not send one, and bypasses in solo mode;
 *   - GET /preview counts built-in plus custom modules per restricted role;
 *   - a database error answers 500 with a string error.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

vi.mock('../../server/services/module-loader.js', () => {
  const catalogue = [
    { id: 'gap-analysis', areaId: 'fcp' },
    { id: 'sanctions-advisory', areaId: 'fcp' },
    { id: 'contract-review', areaId: 'legal' },
  ];
  return {
    getModule: vi.fn(async (id: string) => catalogue.find((m) => m.id === id)),
    getAllModules: vi.fn(async () => catalogue),
  };
});

import { createModuleAccessRoutes } from '../../server/routes/module-access.js';
import { MODULE_ACCESS_SQL, resetModuleAccessCache } from '../../server/services/module-access.js';

interface Row {
  id: string; role: string; module_id: string | null; area_id: string | null;
  effect: string; note: string | null; created_by: string | null; created_at: string;
}

const state = { rows: [] as Row[], customModules: [] as Array<{ id: string; area: string | null }>, allThrows: false, writes: 0 };

const db = {
  dialect: 'postgresql',
  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    if (sql.includes('FROM custom_modules')) return state.customModules.find((m) => m.id === params[0]) as T | undefined;
    return undefined;
  },
  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    if (state.allThrows) throw new Error('connection terminated unexpectedly');
    if (sql === MODULE_ACCESS_SQL.byRole) return state.rows.filter((r) => r.role === params[0]) as T[];
    if (sql === MODULE_ACCESS_SQL.all) return [...state.rows] as T[];
    if (sql.includes('FROM custom_modules')) return [...state.customModules] as T[];
    throw new Error(`unexpected statement: ${sql}`);
  },
  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    state.writes += 1;
    if (sql === MODULE_ACCESS_SQL.insert) {
      const [id, role, module_id, area_id, effect, note, created_by] = params as [string, string, string | null, string | null, string, string | null, string | null];
      state.rows.push({ id, role, module_id, area_id, effect, note, created_by, created_at: '2026-09-17T00:00:00Z' });
      return { changes: 1, lastInsertRowid: 0 };
    }
    if (sql === MODULE_ACCESS_SQL.remove) {
      const before = state.rows.length;
      state.rows = state.rows.filter((r) => r.id !== params[0]);
      return { changes: before - state.rows.length, lastInsertRowid: 0 };
    }
    throw new Error(`unexpected statement: ${sql}`);
  },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
  async close() { /* noop */ },
} as unknown as DatabaseAdapter;

let server: Server;
let base = '';
let originalMode: string | undefined;
let current: { id: string; username: string; role: string } | undefined;

beforeAll(async () => {
  originalMode = process.env.DEPLOYMENT_MODE;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: typeof current }).user = current; next(); });
  app.use('/api', createModuleAccessRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}/api/module-access`;
});

afterAll(async () => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

beforeEach(() => {
  state.rows = [];
  state.customModules = [];
  state.allThrows = false;
  state.writes = 0;
  resetModuleAccessCache();
  delete process.env.DEPLOYMENT_MODE;                       // solo unless a test says otherwise
  current = { id: 'solo', username: 'solo', role: 'admin' };
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => { vi.restoreAllMocks(); });

const list = () => fetch(`${base}/rules`);
const post = (body: unknown) => fetch(`${base}/rules`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const remove = (id: string) => fetch(`${base}/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
const check = (qs: string) => fetch(`${base}/check${qs}`);
const preview = () => fetch(`${base}/preview`);

interface RuleJson { id: string; role: string; moduleId: string | null; areaId: string | null; effect: string; note: string | null }
interface Verdict { allowed: boolean; rule: { id: string; effect: string; scope: string } | null; reason: string; moduleId: string | null; areaId: string | null; role: string | null; teamMode: boolean }

function team(role: 'viewer' | 'analyst' | 'admin'): void {
  process.env.DEPLOYMENT_MODE = 'team';
  current = { id: `u-${role}`, username: role, role };
}

describe('POST /module-access/rules — validation', () => {
  it.each([
    [{ role: 'admin', areaId: 'fcp', effect: 'deny' }, /admin/],
    [{ role: 'member', areaId: 'fcp', effect: 'deny' }, /role/],
    [{ areaId: 'fcp', effect: 'deny' }, /role/],
    [{ role: 'viewer', areaId: 'fcp', effect: 'block' }, /effect/],
    [{ role: 'viewer', areaId: 'fcp' }, /effect/],
    [{ role: 'viewer', effect: 'deny' }, /scope/],
    [{ role: 'viewer', effect: 'deny', moduleId: '', areaId: '   ' }, /scope/],
    [{ role: 'viewer', effect: 'deny', wildcard: 'yes' }, /scope/],
    [{ role: 'viewer', effect: 'deny', moduleId: 42 }, /moduleId/],
    [{ role: 'viewer', effect: 'deny', areaId: ['fcp'] }, /areaId/],
    [{ role: 'viewer', effect: 'deny', areaId: 'fcp', note: 7 }, /note/],
  ])('400s %j naming the field, and writes nothing', async (body, pattern) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(pattern);
    expect(state.writes).toBe(0);
  });
});

describe('rules — list, add, remove', () => {
  it('starts empty, stores an area rule, lists it, removes it', async () => {
    expect(await (await list()).json()).toEqual({ rules: [] });

    const res = await post({ role: 'viewer', areaId: 'fcp', effect: 'deny', note: '  no FCP for viewers ' });
    expect(res.status).toBe(201);
    const { rule } = await res.json() as { rule: RuleJson };
    expect(rule).toMatchObject({ role: 'viewer', moduleId: null, areaId: 'fcp', effect: 'deny', note: 'no FCP for viewers' });
    expect(state.rows[0].created_by).toBe('solo');

    const listed = (await (await list()).json() as { rules: RuleJson[] }).rules;
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(rule.id);

    expect((await remove(rule.id)).status).toBe(200);
    expect(await (await list()).json()).toEqual({ rules: [] });
    expect((await remove(rule.id)).status).toBe(404);
  });

  it('a wildcard rule needs wildcard: true, and stores both ids null', async () => {
    const res = await post({ role: 'analyst', effect: 'allow', wildcard: true });
    expect(res.status).toBe(201);
    const { rule } = await res.json() as { rule: RuleJson };
    expect(rule).toMatchObject({ role: 'analyst', moduleId: null, areaId: null, effect: 'allow', note: null });
  });

  it('logs the rule id and action, never the note', async () => {
    const log = console.log as unknown as ReturnType<typeof vi.fn>;
    const res = await post({ role: 'viewer', moduleId: 'gap-analysis', effect: 'deny', note: 'SECRET-NOTE' });
    const { rule } = await res.json() as { rule: RuleJson };
    await remove(rule.id);
    const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[module-access]'));
    expect(lines).toEqual([
      `[module-access] rule ${rule.id} added (viewer, deny, module)`,
      `[module-access] rule ${rule.id} removed`,
    ]);
    expect(lines.join('\n')).not.toContain('SECRET-NOTE');
  });
});

describe('access — mutations are admin-only in team mode', () => {
  it.each(['viewer', 'analyst'] as const)('team mode: a %s gets 403 on list / add / remove / preview, nothing written', async (role) => {
    team(role);
    expect((await list()).status).toBe(403);
    expect((await post({ role: 'viewer', areaId: 'fcp', effect: 'deny' })).status).toBe(403);
    expect((await remove('r1')).status).toBe(403);
    expect((await preview()).status).toBe(403);
    expect(state.writes).toBe(0);
  });

  it('team mode: an admin writes', async () => {
    team('admin');
    expect((await post({ role: 'viewer', areaId: 'fcp', effect: 'deny' })).status).toBe(201);
    expect((await list()).status).toBe(200);
    expect((await preview()).status).toBe(200);
  });

  it('solo mode: the laptop owner writes whatever role they carry', async () => {
    current = { id: 'solo', username: 'solo', role: 'viewer' };
    expect((await post({ role: 'viewer', areaId: 'fcp', effect: 'deny' })).status).toBe(201);
  });

  it('unauthenticated: 401 everywhere', async () => {
    current = undefined;
    expect((await list()).status).toBe(401);
    expect((await check('?moduleId=gap-analysis')).status).toBe(401);
  });
});

describe('GET /module-access/check — the caller\'s own verdict', () => {
  beforeEach(async () => {
    team('admin');
    await post({ role: 'viewer', areaId: 'fcp', effect: 'deny' });
    await post({ role: 'analyst', moduleId: 'contract-review', effect: 'deny' });
  });

  it('a viewer is denied an FCP module (area resolved from the catalogue), allowed a legal one', async () => {
    team('viewer');
    let v = await (await check('?moduleId=gap-analysis')).json() as Verdict;
    expect(v).toMatchObject({ allowed: false, reason: 'denied by area rule', moduleId: 'gap-analysis', areaId: 'fcp', role: 'viewer', teamMode: true });
    expect(v.rule?.scope).toBe('area');
    v = await (await check('?moduleId=contract-review')).json() as Verdict;
    expect(v).toMatchObject({ allowed: true, rule: null, areaId: 'legal' });
  });

  it('an analyst has their own rules: the module deny, not the viewer\'s area deny', async () => {
    team('analyst');
    expect((await (await check('?moduleId=gap-analysis')).json() as Verdict).allowed).toBe(true);
    const v = await (await check('?moduleId=contract-review')).json() as Verdict;
    expect(v).toMatchObject({ allowed: false, reason: 'denied by module rule', role: 'analyst' });
  });

  it('an admin is always allowed', async () => {
    team('admin');
    expect(await (await check('?moduleId=gap-analysis')).json()).toMatchObject({ allowed: true, reason: 'admin' });
  });

  it('an areaId the page sends wins over the catalogue lookup', async () => {
    team('viewer');
    const v = await (await check('?moduleId=contract-review&areaId=fcp')).json() as Verdict;
    expect(v).toMatchObject({ allowed: false, areaId: 'fcp' });
  });

  it('a custom module resolves its area from custom_modules', async () => {
    state.customModules.push({ id: 'custom-1', area: 'fcp' });
    team('viewer');
    expect(await (await check('?moduleId=custom-1')).json()).toMatchObject({ allowed: false, areaId: 'fcp' });
  });

  it('no module (open chat): area rules do not apply', async () => {
    team('viewer');
    expect(await (await check('')).json()).toMatchObject({ allowed: true, moduleId: null, areaId: null });
  });

  it('solo mode bypasses whatever the rows say', async () => {
    delete process.env.DEPLOYMENT_MODE;
    current = { id: 'solo', username: 'solo', role: 'viewer' };
    expect(await (await check('?moduleId=gap-analysis')).json()).toMatchObject({ allowed: true, reason: 'solo mode', teamMode: false });
  });
});

describe('GET /module-access/preview', () => {
  it('counts built-in plus custom modules the rules let each restricted role run', async () => {
    state.customModules.push({ id: 'custom-1', area: 'custom' });
    await post({ role: 'viewer', areaId: 'fcp', effect: 'deny' });
    await post({ role: 'analyst', effect: 'deny', wildcard: true });
    await post({ role: 'analyst', moduleId: 'custom-1', effect: 'allow' });
    const body = await (await preview()).json() as { total: number; roles: Record<string, { allowed: number; total: number }> };
    expect(body.total).toBe(4);
    expect(body.roles).toEqual({
      viewer: { allowed: 2, total: 4 },      // contract-review + custom-1
      analyst: { allowed: 1, total: 4 },     // only the module allow beats the wildcard deny
    });
  });

  it('with no rules every role runs every module', async () => {
    const body = await (await preview()).json() as { total: number; roles: Record<string, { allowed: number; total: number }> };
    expect(body.roles).toEqual({ viewer: { allowed: 3, total: 3 }, analyst: { allowed: 3, total: 3 } });
  });
});

describe('errors', () => {
  it('a database error on the list answers 500 with an error string', async () => {
    state.allThrows = true;
    const res = await list();
    expect(res.status).toBe(500);
    expect(typeof ((await res.json()) as { error?: unknown }).error).toBe('string');
  });

  it('a database error on the check still answers allowed (never a lock-out)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    team('viewer');
    state.allThrows = true;
    const res = await check('?moduleId=gap-analysis');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ allowed: true, reason: 'access rules unavailable' });
  });
});
