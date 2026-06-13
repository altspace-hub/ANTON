/**
 * core-team.test.ts — ANTON Studio P2 (route-level).
 *
 * POST /api/core-team/:projectId/panel { gate, artifact, mode } → PanelVerdict
 *   (persists 7 coding_reviews + 1 coding_panel_decisions). The panel RUN is an
 *   injected stub (deps.runPanel) — NO live LLM in this file. The CODE-COMPUTED
 *   rollup/blocking + persistence + the gate guard are exercised for real.
 * GET  /api/core-team/:projectId/panel/:gate → decision record + blocked status.
 *
 * Requires DATABASE_URL; skips otherwise (council-dissent route-test pattern).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import {
  computeRollup,
  persistPanelDecision,
  CORE_TEAM_ROLES,
  type RunPanelResult,
  type ExpertReview,
  type PanelGate,
} from '../../server/services/core-team-panel.js';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
}
const DATABASE_URL = resolveDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

/** Build a RunPanelResult the route can persist — verdict rolled up in code. */
function makeResult(gate: PanelGate, overrides: Record<string, 'endorse' | 'flag' | 'dissent'> = {}): RunPanelResult {
  const mandatory = new Set(
    gate === 'start' ? ['project_manager', 'business_expert', 'product_designer']
    : gate === 'build' ? ['solution_architect', 'devsecops_expert', 'engineering_expert']
    : gate === 'testing' ? ['ux_expert', 'devsecops_expert', 'engineering_expert']
    : CORE_TEAM_ROLES.map((r) => r.id),
  );
  const experts: ExpertReview[] = CORE_TEAM_ROLES.map((r) => ({
    role: r.id, roleLabel: r.label,
    verdict: overrides[r.id] ?? 'endorse',
    concerns: [], required_change: null, rationale: `${r.label} view`,
    mandatory: mandatory.has(r.id),
  }));
  const { panel_verdict, blocking } = computeRollup(experts);
  return {
    verdict: { gate, experts, agreements: [], dissents: [], open_questions: [], synthesis: 'chair', panel_verdict, blocking },
    mode: 'fast', expertModel: 'mistral-medium-latest', chairModel: null, dissentLedger: null,
  };
}

describeOrSkip('ANTON Studio core-team panel routes', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;

  const projectsRowId = randomUUID();
  const codingProjectId = randomUUID();
  let nextResult: RunPanelResult = makeResult('start');

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createCoreTeamRoutes } = await import('../../server/routes/core-team.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = { id: 'solo', username: 'solo', role: 'admin' };
      next();
    });
    app.use('/api', createCoreTeamRoutes(db, {
      // inject the panel run — no live LLM
      runPanel: async () => nextResult,
    }));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;

    await db.run(`INSERT INTO projects (id, name) VALUES (?, ?)`, projectsRowId, 'ct-route-test');
    await db.run(`INSERT INTO coding_projects (id, project_id, name) VALUES (?, ?, ?)`, codingProjectId, projectsRowId, 'ct-route-coding');
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM coding_panel_decisions WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_reviews WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_projects WHERE id = ?', codingProjectId);
      await db.run('DELETE FROM projects WHERE id = ?', projectsRowId);
    } finally {
      await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
      await db.close();
    }
  });

  async function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }
  async function get(path: string): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}${path}`);
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  it('runs the panel, persists 7 reviews + 1 decision, returns the code-computed verdict', async () => {
    nextResult = makeResult('start'); // all endorse
    const { status, json } = await post(`/api/core-team/${codingProjectId}/panel`, { gate: 'start', artifact: 'a real plan' });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.panel_verdict).toBe('endorse');
    expect(json.blocking).toBe(false);
    expect((json.verdict as { experts: unknown[] }).experts).toHaveLength(7);

    const rows = await db.all('SELECT id FROM coding_reviews WHERE coding_project_id = ? AND gate = ?', codingProjectId, 'start');
    expect(rows).toHaveLength(7);
    const decs = await db.all('SELECT id FROM coding_panel_decisions WHERE coding_project_id = ? AND gate = ?', codingProjectId, 'start');
    expect(decs).toHaveLength(1);
  });

  it('a mandatory-role dissent blocks the gate (code-computed, not the LLM)', async () => {
    nextResult = makeResult('start', { project_manager: 'dissent' }); // PM mandatory at start
    const { status, json } = await post(`/api/core-team/${codingProjectId}/panel`, { gate: 'start', artifact: 'a flawed plan' });
    expect(status).toBe(200);
    expect(json.panel_verdict).toBe('dissent');
    expect(json.blocking).toBe(true);
  });

  it('GET returns the persisted decision + blocked status', async () => {
    const { status, json } = await get(`/api/core-team/${codingProjectId}/panel/start`);
    expect(status).toBe(200);
    expect(json.decided).toBe(true);
    expect(json.blocked).toBe(true); // from the prior blocking run
    expect((json.verdict as { gate: string }).gate).toBe('start');
  });

  it('GET on an un-reviewed gate reports decided=false, blocked=false', async () => {
    const { status, json } = await get(`/api/core-team/${codingProjectId}/panel/finish`);
    expect(status).toBe(200);
    expect(json.decided).toBe(false);
    expect(json.blocked).toBe(false);
    expect(json.verdict).toBeNull();
  });

  it('400s on an invalid gate', async () => {
    const { status } = await post(`/api/core-team/${codingProjectId}/panel`, { gate: 'nonsense', artifact: 'x' });
    expect(status).toBe(400);
  });

  it('400s on a missing artifact', async () => {
    const { status } = await post(`/api/core-team/${codingProjectId}/panel`, { gate: 'start' });
    expect(status).toBe(400);
  });

  it('404s on an unknown project', async () => {
    const { status } = await post(`/api/core-team/${randomUUID()}/panel`, { gate: 'start', artifact: 'x' });
    expect(status).toBe(404);
  });

  it('the GET decision can also be persisted directly via persistPanelDecision (build gate, non-blocking flag)', async () => {
    const result = makeResult('build', { project_manager: 'flag' }); // PM not mandatory at build → flag, not blocking
    await persistPanelDecision(db, result, codingProjectId);
    const { json } = await get(`/api/core-team/${codingProjectId}/panel/build`);
    expect(json.decided).toBe(true);
    expect(json.blocked).toBe(false);
    expect(json.panel_verdict).toBe('flag');
  });
});
