/**
 * intelligence-dashboard-admin-gate.test.ts — the two instance-wide switches on
 * the Intelligence Dashboard are admin writes, like their Settings sibling.
 *
 * `POST /intelligence/atom-injection/mode` writes the same app_settings key as
 * `POST /settings/memory-governance` (which is `requireAdminOrSolo`), and
 * `POST /intelligence/atom-ab/toggle` turns the A/B experiment off for every
 * user. In team mode a viewer must get 403 and nothing written; an admin
 * writes; solo mode is not gated.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createIntelligenceDashboardRoutes } from '../../server/routes/intelligence-dashboard.js';
import { ATOM_INJECTION_MODE_SETTING_KEY, resetAtomInjectionGateCache } from '../../server/services/atom-injection-gate.js';
import { ATOM_AB_SETTING_KEY } from '../../server/services/atom-ab.js';

const settings = new Map<string, string>();
const writes: string[] = [];

const db = {
  dialect: 'postgresql',
  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    if (sql.includes('FROM app_settings')) {
      const value = settings.get(String(params[0]));
      return value === undefined ? undefined : ({ value } as T);
    }
    if (sql.includes('COUNT(')) return { c: '0', n: '0' } as T;
    return undefined;
  },
  async all<T>(): Promise<T[]> { return []; },
  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    writes.push(sql);
    if (sql.startsWith('INSERT INTO app_settings')) settings.set(String(params[0]), String(params[1]));
    if (sql.startsWith('DELETE FROM app_settings')) settings.delete(String(params[0]));
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

beforeAll(async () => {
  originalMode = process.env.DEPLOYMENT_MODE;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: typeof current }).user = current; next(); });
  app.use('/api', await createIntelligenceDashboardRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

beforeEach(() => {
  settings.clear();
  writes.length = 0;
  resetAtomInjectionGateCache();
  delete process.env.DEPLOYMENT_MODE;
  current = { id: 'solo', username: 'solo', role: 'admin' };
});

const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

const SWITCHES = [
  { path: '/intelligence/atom-injection/mode', body: { mode: 'on' }, key: ATOM_INJECTION_MODE_SETTING_KEY },
  { path: '/intelligence/atom-ab/toggle', body: { enabled: false }, key: ATOM_AB_SETTING_KEY },
];

describe.each(SWITCHES)('POST $path', ({ path, body, key }) => {
  it('team mode: a viewer gets 403 and nothing is written', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    current = { id: 'u-1', username: 'viewer', role: 'viewer' };
    const res = await post(path, body);
    expect(res.status).toBe(403);
    expect(writes).toEqual([]);
    expect(settings.has(key)).toBe(false);
  });

  it('team mode: an analyst gets 403 too', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    current = { id: 'u-2', username: 'analyst', role: 'analyst' };
    const res = await post(path, body);
    expect(res.status).toBe(403);
    expect(settings.has(key)).toBe(false);
  });

  it('team mode: an admin writes', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    current = { id: 'a-1', username: 'admin', role: 'admin' };
    const res = await post(path, body);
    expect(res.status).toBe(200);
    expect(settings.has(key)).toBe(true);
  });

  it('solo mode is not gated', async () => {
    const res = await post(path, body);
    expect(res.status).toBe(200);
    expect(settings.has(key)).toBe(true);
  });
});
