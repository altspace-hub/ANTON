/**
 * engagement-demo-limits.test.ts — the limits index.ts mounts on the
 * engagement API (mountEngagementDemoLimits, services/engagement-demo-routes.ts).
 *
 * Before (2026-10-02): only create, uploads, export and the model steps went
 * through the demo write limiter. Scope items, workstreams, the team, client
 * intelligence and every PATCH ran at the general per-user rate — 1,200 a
 * minute, up to 256 KB each — on the public demo. Now every request that
 * changes something is one count, a model step included (once, not twice):
 * create, uploads, export and the model steps of the write limit, every other
 * edit of the edit limit (so a walkthrough's edits do not use up the uploads
 * and AI requests), and the model steps still pass the model-call limiter and
 * the budget.
 *
 * The real demo limiters (createDemoWriteLimiter, createDemoEditLimiter) on a
 * real Express app; the model-call limiter and the budget are counting stand-ins.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mountEngagementDemoLimits, ENGAGEMENT_MODEL_ROUTES, isHeavyEngagementWrite } from '../../server/services/engagement-demo-routes.js';
import { createDemoWriteLimiter, createDemoEditLimiter } from '../../server/middleware/demo-mode.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ENV = ['DEMO_MODE', 'DEMO_USER_WRITES_PER_10_MIN', 'DEMO_USER_EDITS_PER_10_MIN'] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV) saved[k] = process.env[k];

let server: Server | null = null;
let base = '';
const counted = { model: 0, budget: 0 };

/** An app with the limits mounted as index.ts mounts them, above a router that answers every engagement request. */
async function start(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const id = req.header('x-test-user');
    if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
    next();
  });
  const counting = (key: keyof typeof counted): RequestHandler => (_req, _res, next) => { counted[key] += 1; next(); };
  mountEngagementDemoLimits(app, { demoWriteLimiter: createDemoWriteLimiter(), demoEditLimiter: createDemoEditLimiter(), claudeLimiter: counting('model'), modelBudget: counting('budget') });
  app.use('/api/engagements', (_req: Request, res: Response) => { res.json({ ok: true }); });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

const call = (method: string, p: string, who: { id: string; role: string } = { id: 'visitor-1', role: 'analyst' }) => fetch(`${base}/api/engagements${p}`, {
  method,
  headers: { 'content-type': 'application/json', 'x-test-user': who.id, 'x-test-role': who.role },
  body: method === 'GET' || method === 'HEAD' ? undefined : '{}',
});

beforeEach(async () => {
  process.env.DEMO_MODE = 'true';
  process.env.DEMO_USER_WRITES_PER_10_MIN = '3';
  process.env.DEMO_USER_EDITS_PER_10_MIN = '3';
  counted.model = 0;
  counted.budget = 0;
  await start();
});

afterEach(async () => {
  await new Promise<void>((resolve) => { if (server) server.close(() => resolve()); else resolve(); });
  server = null;
});

afterAll(() => {
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
});

describe('the demo limits on the engagement API', () => {
  it('counts every edit — POST, PUT, PATCH, DELETE on any engagement path — and refuses past the edit limit', async () => {
    expect((await call('PATCH', '/e1/scope-items/s1')).status).toBe(200);
    expect((await call('PUT', '/e1/client-intelligence')).status).toBe(200);
    expect((await call('DELETE', '/e1/team/m1')).status).toBe(200);
    const refused = await call('POST', '/e1/workstreams');
    expect(refused.status).toBe(429);
    expect((await refused.json() as { error: string }).error).toMatch(/Too many changes/);
    // The same account is refused on any other edit too.
    expect((await call('PATCH', '/e1')).status).toBe(429);
  });

  it('keeps edits and uploads/exports/model steps on separate counts', async () => {
    for (let i = 0; i < 3; i++) expect((await call('POST', '/e1/scope-items')).status).toBe(200);
    expect((await call('POST', '/e1/scope-items')).status).toBe(429);
    // The write limit is untouched by the edits.
    expect((await call('POST', '/e1/export')).status).toBe(200);
    expect((await call('POST', '/e1/documents')).status).toBe(200);
    expect((await call('POST', '')).status).toBe(200);
    const refused = await call('POST', '/e1/resources');
    expect(refused.status).toBe(429);
    expect((await refused.json() as { error: string }).error).toMatch(/uploads, exports or AI requests/);
  });

  it('classes create, uploads, export and every model step as heavy writes, and nothing else', () => {
    for (const p of ['', '/', '/e1/documents', '/e1/resources', '/e1/export', '/e1/intake/turn', '/e1/execute', '/e1/documents/d1/extract', '/e1/iterations/i1/gap-analysis', '/e1/team/extract', '/e1/quality-gate/run']) {
      expect(isHeavyEngagementWrite(p), p).toBe(true);
    }
    for (const p of ['/e1', '/e1/scope-items', '/e1/scope-items/s1', '/e1/team', '/e1/team/m1', '/e1/workstreams/w1', '/e1/client-intelligence', '/e1/resources/r1', '/e1/complete']) {
      expect(isHeavyEngagementWrite(p), p).toBe(false);
    }
  });

  it('never counts a read', async () => {
    for (let i = 0; i < 6; i++) expect((await call('GET', '/e1/team')).status).toBe(200);
    expect((await call('GET', '')).status).toBe(200);
    // The three edits are all still there.
    for (let i = 0; i < 3; i++) expect((await call('POST', '/e1/scope-items')).status).toBe(200);
    expect((await call('POST', '/e1/scope-items')).status).toBe(429);
  });

  it('counts a model step once, and sends it through the model-call limiter and the budget check', async () => {
    expect((await call('POST', '/e1/intake/turn')).status).toBe(200);
    expect((await call('POST', '/e1/quality-gate/run')).status).toBe(200);
    expect(counted).toEqual({ model: 2, budget: 2 });
    // Two counts used, one left: counted twice per step, this third heavy write would be refused.
    expect((await call('POST', '/e1/export')).status).toBe(200);
    expect((await call('POST', '/e1/export')).status).toBe(429);
    // A plain write is not a model call.
    expect((await call('POST', '/e1/team')).status).toBe(200);
    expect(counted).toEqual({ model: 2, budget: 2 });
    expect(ENGAGEMENT_MODEL_ROUTES).toContain('/api/engagements/:id/intake/turn');
  });

  it('leaves administrators, other visitors and a server that is not a demo alone (negative controls)', async () => {
    for (let i = 0; i < 3; i++) await call('POST', '/e1/scope-items');
    expect((await call('POST', '/e1/scope-items')).status).toBe(429);
    // Another visitor has a count of their own; an administrator has none.
    expect((await call('POST', '/e2/scope-items', { id: 'visitor-2', role: 'analyst' })).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await call('POST', '/e3/scope-items', { id: 'admin-1', role: 'admin' })).status).toBe(200);
    // Not a demo: nothing is counted.
    process.env.DEMO_MODE = 'false';
    for (let i = 0; i < 5; i++) expect((await call('POST', '/e1/scope-items')).status).toBe(200);
  });

  it('is mounted by index.ts with both limiters, before the engagements router', () => {
    const index = readFileSync(path.resolve(__dirname, '../../server/index.ts'), 'utf8');
    // At the start of a line: a commented-out call does not count.
    const mount = index.search(/^mountEngagementDemoLimits\(app, \{ demoWriteLimiter, demoEditLimiter, claudeLimiter,/m);
    expect(mount).toBeGreaterThan(0);
    const router = index.search(/app\.use\('\/api\/engagements',\s*(?:await\s+)?createEngagementsRoutes/);
    expect(router).toBeGreaterThan(mount);
  });
});
