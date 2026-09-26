/**
 * demo-community-modules-hidden.test.ts — the community-shared custom modules
 * a visitor sees on a public demo (routes/custom-modules.ts; privacy
 * verification 2026-09-26, problem 2).
 *
 * GET /api/modules/community listed every shared custom module, including
 * one in an area the demo keeps off (DEMO_HIDDEN_AREAS) or one whose id is on
 * DEMO_HIDDEN_MODULES; the run route refuses such a module, so the listing
 * offered what could not be run. A visitor (a non-admin) on a demo now gets
 * neither in the listing, and a single read of one answers 404 like a missing
 * module, as routes/modules.ts does for the built-in catalogue.
 *
 * Negative controls: an admin on the demo, and a visitor outside demo mode,
 * see every shared module. The built-in hidden lists apply when the .env sets
 * none (demo-hidden-defaults.test.ts), so the healthcare module is hidden with
 * no configuration.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseAdapter } from '../../server/db/database.js';

const ROWS = [
  { id: 'custom-health01', name: 'Clinic intake', area: 'healthcare', config: '{}', is_shared_with_community: 1, user_id: 'owner' },
  { id: 'custom-listed01', name: 'Listed by id', area: 'strategy', config: '{}', is_shared_with_community: 1, user_id: 'owner' },
  { id: 'custom-open0001', name: 'Market sizing', area: 'strategy', config: '{"x":1}', is_shared_with_community: 1, user_id: 'owner' },
];
const ALL_IDS = ROWS.map((r) => r.id);

/** Answers the two queries these routes make: the shared list, and one module by id. */
function fakeDb(): DatabaseAdapter {
  return {
    all: async (sql: string) => (/is_shared_with_community = 1/.test(sql) ? ROWS : []),
    get: async (sql: string, ...params: unknown[]) => {
      const row = ROWS.find((r) => r.id === params[0]);
      if (!row) return undefined;
      return /SELECT 1 AS ok/.test(sql) ? { ok: 1 } : row;
    },
    run: async () => ({ changes: 0 }),
  } as unknown as DatabaseAdapter;
}

describe('community modules on a demo', () => {
  const ENV = ['DEMO_MODE', 'DEPLOYMENT_MODE', 'DEMO_HIDDEN_AREAS', 'DEMO_HIDDEN_MODULES'] as const;
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]])) as Record<typeof ENV[number], string | undefined>;
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const { createCustomModuleRoutes } = await import('../../server/routes/custom-modules.js');
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      type Role = 'admin' | 'analyst' | 'viewer';
      (req as Request & { user?: { id: string; username: string; role: Role } }).user = {
        id: 'visitor-1', username: 'v', role: String(req.headers['x-test-role'] ?? 'analyst') as Role,
      };
      next();
    });
    app.use('/api', await createCustomModuleRoutes(fakeDb()));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  });

  function setup(demo: boolean, hiddenModules?: string): void {
    process.env.DEPLOYMENT_MODE = 'team';
    if (demo) process.env.DEMO_MODE = 'true'; else delete process.env.DEMO_MODE;
    delete process.env.DEMO_HIDDEN_AREAS; // the built-in list, which hides healthcare
    if (hiddenModules === undefined) delete process.env.DEMO_HIDDEN_MODULES; else process.env.DEMO_HIDDEN_MODULES = hiddenModules;
  }

  const get = (route: string, role = 'analyst') => fetch(`${base}/api${route}`, { headers: { 'x-test-role': role } });
  async function listed(role = 'analyst'): Promise<string[]> {
    const res = await get('/modules/community', role);
    expect(res.status).toBe(200);
    return (await res.json() as Array<{ id: string }>).map((m) => m.id);
  }

  it('a visitor on the demo: no module of a hidden area, or on the hidden list, is listed', async () => {
    setup(true, 'custom-listed01, sar-quality-check');
    expect(await listed()).toEqual(['custom-open0001']);
  });

  it('with no lists set, the built-in ones apply: the healthcare module is left out', async () => {
    setup(true);
    expect(await listed()).toEqual(['custom-listed01', 'custom-open0001']);
  });

  it('a visitor reading a hidden one by id gets 404, an open one 200', async () => {
    setup(true, 'custom-listed01');
    expect((await get('/custom-modules/custom-health01')).status).toBe(404);
    expect((await get('/custom-modules/custom-listed01')).status).toBe(404);
    const open = await get('/custom-modules/custom-open0001');
    expect(open.status).toBe(200);
    expect((await open.json() as { config: unknown }).config).toEqual({ x: 1 });
  });

  it('an admin on the demo sees and reads every one (negative control)', async () => {
    setup(true, 'custom-listed01');
    expect(await listed('admin')).toEqual(ALL_IDS);
    expect((await get('/custom-modules/custom-health01', 'admin')).status).toBe(200);
  });

  it('a visitor outside demo mode sees and reads every one (negative control)', async () => {
    setup(false, 'custom-listed01');
    expect(await listed()).toEqual(ALL_IDS);
    expect((await get('/custom-modules/custom-health01')).status).toBe(200);
  });
});
