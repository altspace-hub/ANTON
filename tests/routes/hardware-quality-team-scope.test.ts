/**
 * hardware-quality-team-scope.test.ts — the hardware quality pipeline on a team
 * server (round-2 gap "verify2:files-2", "Hardware quality pipeline routes have
 * no ownership check and spawn host tools").
 *
 *  - POST /hardware/projects/:id/quality/run spawns pio, clang-tidy, cppcheck and
 *    the SBOM tool on the host. It is now admin-only in team mode (like Code
 *    Studio's execution routes), AFTER the ownership 404.
 *  - GET /hardware/quality/runs/:runId is addressed by run id, so the
 *    /hardware/projects/:id gate never covered it: any user read any run. It now
 *    checks the run's project owner in SQL and answers 404 on a miss.
 *  - The /hardware/projects/:id gate and the artefact guard answered 403 for a
 *    foreign row — a confirmation that the id exists. Both now answer the same
 *    404 as a missing row.
 *  - Patch plans, stages and rollouts are addressed by their own ids, so the
 *    project gate never covered GET /hardware/patch-plans/:planId (the plan and
 *    its stages) or GET /hardware/patch-stages/:stageId/rollouts (the fleet's
 *    rollouts). Each id now resolves to its project's owner in SQL, 404 on a miss.
 *
 * Negative controls: the owner still reads; a team admin and the solo user pass
 * every gate. Fake DB: nothing is spawned (the run route is stopped at body
 * validation, which comes after the gates, whenever a caller passes them).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

interface Caller { id: string; username: string; role: 'admin' | 'viewer' | 'analyst' }
const ALICE: Caller = { id: 'alice', username: 'alice', role: 'analyst' };
const BOB: Caller = { id: 'bob', username: 'bob', role: 'analyst' };
const ADMIN: Caller = { id: 'root', username: 'root', role: 'admin' };
const SOLO: Caller = { id: 'solo', username: 'solo', role: 'admin' };

const PROJECT_OWNERS: Record<string, string> = { 'hw-alice': 'alice' };
const RUNS: Record<string, string> = { 'run-alice': 'hw-alice' };
const ARTEFACTS: Record<string, string> = { 'art-alice': 'hw-alice' };
const PLANS: Record<string, string> = { 'plan-alice': 'hw-alice' };
const STAGES: Record<string, string> = { 'stage-alice': 'plan-alice' };
const ROLLOUTS: Record<string, string> = { 'ro-alice': 'stage-alice' };
const ownsProject = (project: string | undefined, owner: unknown): boolean =>
  !!project && PROJECT_OWNERS[project] === owner;

const savedMode = process.env.DEPLOYMENT_MODE;
let server: Server;
let base = '';
let caller: Caller = BOB;
const reads: string[] = [];

const db: DatabaseAdapter = {
  dialect: 'postgresql',
  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const s = sql.replace(/\s+/g, ' ').trim();
    reads.push(s);
    if (/^SELECT 1 AS ok FROM hardware_projects WHERE id = \? AND owner_id = \?/.test(s)) {
      return (PROJECT_OWNERS[String(params[0])] === params[1] ? { ok: 1 } : undefined) as T | undefined;
    }
    if (/^SELECT 1 AS ok FROM hw_quality_runs r JOIN hardware_projects p/.test(s)) {
      const project = RUNS[String(params[0])];
      return (project && PROJECT_OWNERS[project] === params[1] ? { ok: 1 } : undefined) as T | undefined;
    }
    if (/^SELECT r\.id, r\.project_id, s\.overall_score/.test(s)) {
      const project = RUNS[String(params[0])];
      return (project ? {
        id: params[0], project_id: project, overall_score: 90, ship_verdict: 'ship',
        mandatory_gates_total: 1, mandatory_gates_pass: 1, warnings_count: 0, failures_count: 0, reasoning: '[]',
      } : undefined) as T | undefined;
    }
    if (/^SELECT 1 AS ok FROM hw_patch_plans pl JOIN hardware_projects hp/.test(s)) {
      return (ownsProject(PLANS[String(params[0])], params[1]) ? { ok: 1 } : undefined) as T | undefined;
    }
    if (/^SELECT 1 AS ok FROM hw_patch_stages st JOIN hw_patch_plans pl/.test(s)) {
      return (ownsProject(PLANS[STAGES[String(params[0])]], params[1]) ? { ok: 1 } : undefined) as T | undefined;
    }
    if (/^SELECT 1 AS ok FROM hw_patch_rollouts ro JOIN hw_patch_stages st/.test(s)) {
      return (ownsProject(PLANS[STAGES[ROLLOUTS[String(params[0])]]], params[1]) ? { ok: 1 } : undefined) as T | undefined;
    }
    // What maintain-service's own write check reads (updateRolloutStatus →
    // assertProjectOwner), so a write the gate lets through meets the service's
    // 403 — the answer that confirmed a foreign rollout exists.
    if (/^SELECT plan_id FROM hw_patch_rollouts WHERE id = \?/.test(s)) {
      const stage = ROLLOUTS[String(params[0])];
      return (stage ? { plan_id: STAGES[stage] } : undefined) as T | undefined;
    }
    if (/^SELECT owner_id FROM hardware_projects WHERE id = \?/.test(s)) {
      const owner = PROJECT_OWNERS[String(params[0])];
      return (owner ? { owner_id: owner } : undefined) as T | undefined;
    }
    if (/^SELECT \* FROM hw_patch_plans WHERE id = \?/.test(s)) {
      const project = PLANS[String(params[0])];
      return (project ? {
        id: params[0], project_id: project, title: 'ALICE-PLAN', description: null, change_kind: 'security',
        status: 'draft', audit_trail: '[]', created_by: 'alice', created_at: 'x', updated_at: 'x',
      } : undefined) as T | undefined;
    }
    if (/^SELECT \* FROM hw_regulatory_artefacts WHERE id = \?/.test(s)) {
      const project = ARTEFACTS[String(params[0])];
      return (project ? {
        id: params[0], project_id: project, kind: 'doc', title: 'DoC', required_for_tier: 1,
        required_when: 'always', status: 'draft', content_markdown: 'ALICE-DOC', content_schema_version: '1.0.0',
        generator_version: null, generator_inputs: null, created_at: 'x', updated_at: 'x',
      } : undefined) as T | undefined;
    }
    return undefined;
  },
  async all<T>(sql: string): Promise<T[]> {
    reads.push(sql.replace(/\s+/g, ' ').trim());
    return [] as T[];
  },
  async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 }; },
  async exec(): Promise<void> {},
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
  async close(): Promise<void> {},
};

beforeAll(async () => {
  const { createHardwareRoutes } = await import('../../server/routes/hardware.js');
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: Caller }).user = caller;
    next();
  });
  app.use('/api', createHardwareRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no addr');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = savedMode;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

beforeEach(() => {
  reads.length = 0;
  caller = BOB;
  process.env.DEPLOYMENT_MODE = 'team';
});

// An invalid body: a caller who passes both gates stops at validation (400), so
// no pipeline — and no host tool — ever runs in this file.
const runQuality = (projectId: string) => fetch(`${base}/api/hardware/projects/${projectId}/quality/run`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phase_id: 42 }),
});
const get = (route: string) => fetch(`${base}/api${route}`);

describe('POST /hardware/projects/:id/quality/run — team mode', () => {
  it("someone else's project: 404, identical to a missing one", async () => {
    const foreign = await runQuality('hw-alice');
    const missing = await runQuality('hw-nope');
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it('own project, non-admin: 403 — running host tools is an admin action', async () => {
    caller = ALICE;
    const r = await runQuality('hw-alice');
    expect(r.status).toBe(403);
    expect(reads.some((s) => /FROM hardware_projects WHERE id = \?$/.test(s))).toBe(false); // handler never reached
  });

  it('negative controls — a team admin and the solo user pass both gates (stopped at validation)', async () => {
    caller = ADMIN;
    expect((await runQuality('hw-alice')).status).toBe(400);
    caller = SOLO;
    delete process.env.DEPLOYMENT_MODE;
    expect((await runQuality('hw-alice')).status).toBe(400);
  });
});

describe('GET /hardware/projects/:id/quality/runs — team mode', () => {
  it("someone else's project: 404 (was 403, which confirmed the id)", async () => {
    const r = await get('/hardware/projects/hw-alice/quality/runs');
    expect(r.status).toBe(404);
    expect(reads.some((s) => /FROM hw_quality_runs r LEFT JOIN/.test(s))).toBe(false);
  });

  it('negative control — the owner lists her runs', async () => {
    caller = ALICE;
    expect((await get('/hardware/projects/hw-alice/quality/runs')).status).toBe(200);
  });
});

describe('GET /hardware/quality/runs/:runId — team mode', () => {
  it("someone else's run: 404, identical to a missing run, and the run is never loaded", async () => {
    const foreign = await get('/hardware/quality/runs/run-alice');
    const missing = await get('/hardware/quality/runs/run-nope');
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
    expect(reads.some((s) => /^SELECT r\.id, r\.project_id/.test(s))).toBe(false);
  });

  it('negative controls — the owner, a team admin and the solo user read it', async () => {
    for (const who of [ALICE, ADMIN]) {
      caller = who;
      const r = await get('/hardware/quality/runs/run-alice');
      expect(r.status).toBe(200);
      expect((await r.json() as { run: { runId: string } }).run.runId).toBe('run-alice');
    }
    caller = SOLO;
    delete process.env.DEPLOYMENT_MODE;
    expect((await get('/hardware/quality/runs/run-alice')).status).toBe(200);
  });
});

describe('artefact guard — 404, not 403', () => {
  it("someone else's regulatory artefact answers the missing-artefact 404", async () => {
    const foreign = await get('/hardware/regulatory-artefacts/art-alice');
    const missing = await get('/hardware/regulatory-artefacts/art-nope');
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it('negative control — the owner reads it', async () => {
    caller = ALICE;
    const r = await get('/hardware/regulatory-artefacts/art-alice');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('ALICE-DOC');
  });
});

describe('patch plans, stages and rollouts — addressed by their own ids', () => {
  const put = (route: string, body: unknown) => fetch(`${base}/api${route}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });

  it("someone else's plan: 404, identical to a missing plan, and the plan is never loaded", async () => {
    const foreign = await get('/hardware/patch-plans/plan-alice');
    const missing = await get('/hardware/patch-plans/plan-nope');
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
    expect(reads.some((s) => /^SELECT \* FROM hw_patch_plans WHERE id = \?/.test(s))).toBe(false);
    expect(reads.some((s) => /FROM hw_patch_stages WHERE plan_id/.test(s))).toBe(false);
  });

  it("someone else's stage: its rollouts are 404 and never read", async () => {
    const foreign = await get('/hardware/patch-stages/stage-alice/rollouts');
    const missing = await get('/hardware/patch-stages/stage-nope/rollouts');
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
    expect(reads.some((s) => /FROM hw_patch_rollouts r JOIN hw_fleet_devices/.test(s))).toBe(false);
  });

  it("someone else's rollout: the write answers 404 (the service's own check answered 403)", async () => {
    const foreign = await put('/hardware/patch-rollouts/ro-alice', { status: 'failed' });
    const missing = await put('/hardware/patch-rollouts/ro-nope', { status: 'failed' });
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
    expect(reads.some((s) => /^SELECT plan_id FROM hw_patch_rollouts/.test(s))).toBe(false);
  });

  it('negative controls — the owner, a team admin and the solo user read the plan and the rollouts', async () => {
    for (const who of [ALICE, ADMIN]) {
      caller = who;
      const plan = await get('/hardware/patch-plans/plan-alice');
      expect(plan.status).toBe(200);
      expect((await plan.json() as { plan: { title: string } }).plan.title).toBe('ALICE-PLAN');
      expect((await get('/hardware/patch-stages/stage-alice/rollouts')).status).toBe(200);
    }
    caller = SOLO;
    delete process.env.DEPLOYMENT_MODE;
    expect((await get('/hardware/patch-plans/plan-alice')).status).toBe(200);
  });
});
