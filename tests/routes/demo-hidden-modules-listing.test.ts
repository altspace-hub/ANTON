/**
 * demo-hidden-modules-listing.test.ts — the module catalogue a visitor sees on
 * the public demo (privacy review H3 / D13).
 *
 * The modules in DEMO_HIDDEN_AREAS / DEMO_HIDDEN_MODULES invite health,
 * employment, credit or criminal-offence data. For a visitor (a non-admin) in
 * demo mode, routes/modules.ts leaves them out of every listing, and every
 * single read of one (the module, its area, its prompt) answers 404 like a
 * module that does not exist. The run route refuses them too
 * (demo-hidden-modules-run.db.test.ts).
 *
 * Negative controls: an admin on the demo, and a visitor outside demo mode
 * with the same lists set, see the whole catalogue.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const HIDDEN_AREA = 'healthcare';
const HEALTH_MODULE = 'clinical-protocol';
const HIDDEN_MODULE = 'credit-risk';       // area: banking
const OPEN_MODULE = 'alert-investigation'; // area: fcp, not on this test's lists

interface ModuleRow { id: string; areaId?: string }
interface AreaRow { id: string; modules: ModuleRow[] }

describe('the module catalogue leaves the hidden modules out for demo visitors', () => {
  const saved = { demo: process.env.DEMO_MODE, areas: process.env.DEMO_HIDDEN_AREAS, modules: process.env.DEMO_HIDDEN_MODULES };
  let app: Server;
  let base = '';

  beforeAll(async () => {
    const { default: modulesRouter } = await import('../../server/routes/modules.js');
    const e = express();
    e.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: { id: string; username: string; role: string } }).user = {
        id: 'u-1', username: 'u', role: String(req.headers['x-test-role'] ?? 'analyst'),
      };
      next();
    });
    e.use('/api', modulesRouter);
    await new Promise<void>((resolve) => { app = e.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const [k, v] of [['DEMO_MODE', saved.demo], ['DEMO_HIDDEN_AREAS', saved.areas], ['DEMO_HIDDEN_MODULES', saved.modules]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
  });

  function setLists(demo: boolean): void {
    if (demo) process.env.DEMO_MODE = 'true'; else delete process.env.DEMO_MODE;
    // Mixed case and spaces, as an operator might write them.
    process.env.DEMO_HIDDEN_AREAS = ` Healthcare `;
    process.env.DEMO_HIDDEN_MODULES = `Credit-Risk, cv-writer`;
  }

  const get = (route: string, role = 'analyst') => fetch(`${base}/api${route}`, { headers: { 'x-test-role': role } });
  async function catalogue(role = 'analyst'): Promise<{ modules: ModuleRow[]; areas: AreaRow[] }> {
    const [m, a] = await Promise.all([get('/modules', role), get('/areas', role)]);
    expect(m.status).toBe(200);
    expect(a.status).toBe(200);
    return { modules: await m.json() as ModuleRow[], areas: await a.json() as AreaRow[] };
  }
  const areaModuleIds = (areas: AreaRow[]) => areas.flatMap((a) => a.modules.map((m) => m.id));

  it('a visitor on the demo: no hidden module or area in either listing', async () => {
    setLists(true);
    const { modules, areas } = await catalogue();

    expect(modules.some((m) => m.areaId === HIDDEN_AREA)).toBe(false);
    expect(modules.map((m) => m.id)).not.toContain(HIDDEN_MODULE);
    expect(modules.map((m) => m.id)).not.toContain('cv-writer');
    expect(modules.map((m) => m.id)).toContain(OPEN_MODULE);

    expect(areas.map((a) => a.id)).not.toContain(HIDDEN_AREA);
    expect(areaModuleIds(areas)).not.toContain(HIDDEN_MODULE);
    expect(areaModuleIds(areas)).not.toContain(HEALTH_MODULE);
    expect(areas.find((a) => a.id === 'banking')?.modules.length ?? 0).toBeGreaterThan(0);
  });

  it('a visitor on the demo: every single read of a hidden module answers 404', async () => {
    setLists(true);
    for (const route of [
      `/modules/${HIDDEN_MODULE}`,
      `/modules/${HIDDEN_MODULE}/prompt`,
      `/modules/${HEALTH_MODULE}`,
      `/modules/${HEALTH_MODULE}/prompt`,
      `/areas/${HIDDEN_AREA}`,
      `/areas/${HIDDEN_AREA}/modules/${HEALTH_MODULE}`,
      `/areas/banking/modules/${HIDDEN_MODULE}`,
    ]) {
      expect((await get(route)).status, route).toBe(404);
    }
    // A module on neither list still opens.
    expect((await get(`/modules/${OPEN_MODULE}`)).status).toBe(200);
    expect((await get(`/modules/${OPEN_MODULE}/prompt`)).status).toBe(200);
    expect((await get('/areas/banking')).status).toBe(200);
  });

  // ── Negative controls ──

  it('an admin on the demo sees the whole catalogue', async () => {
    setLists(true);
    const { modules, areas } = await catalogue('admin');
    expect(modules.map((m) => m.id)).toEqual(expect.arrayContaining([HIDDEN_MODULE, HEALTH_MODULE, 'cv-writer']));
    expect(areas.map((a) => a.id)).toContain(HIDDEN_AREA);
    expect((await get(`/modules/${HEALTH_MODULE}/prompt`, 'admin')).status).toBe(200);
    expect((await get(`/areas/banking/modules/${HIDDEN_MODULE}`, 'admin')).status).toBe(200);
  });

  it('outside demo mode the lists change nothing', async () => {
    setLists(false);
    const { modules, areas } = await catalogue();
    expect(modules.map((m) => m.id)).toEqual(expect.arrayContaining([HIDDEN_MODULE, HEALTH_MODULE, 'cv-writer']));
    expect(areas.map((a) => a.id)).toContain(HIDDEN_AREA);
    expect((await get(`/modules/${HIDDEN_MODULE}`)).status).toBe(200);
    expect((await get(`/areas/${HIDDEN_AREA}`)).status).toBe(200);
  });
});
