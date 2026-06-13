/**
 * coding-studio.test.ts — ANTON Studio P5 (route-level).
 *
 * Mounts the REAL coding-studio router with an injected orchestrator (all
 * LLM/exec/panel seams stubbed) + an injected bundle/sign (no real zip needed).
 * Exercises:
 *   POST /run            → plan → awaiting_plan (the plan-approval checkpoint)
 *   POST /run/approve-plan → runs to done (injected pass)
 *   GET  /run/status     → the live run state
 *   POST /run/stop       → the STOP control
 *   POST /export         → returns the .anton bytes
 *   ownership: 404 on an unknown project
 *
 * Requires DATABASE_URL (real coding_studio_runs/coding_projects schema; skips
 * otherwise — the core-team route-test pattern).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter } from '../../server/db/database.js';
import type { OrchestratorDeps, RawPlanTask } from '../../server/services/coding-studio-orchestrator.js';
import {
  computeRollup,
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

// Force Mistral so resolveCodingModel inside the orchestrator is deterministic.
const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let savedEnv: Record<string, string | undefined> = {};

function makeResult(gate: PanelGate): RunPanelResult {
  const experts: ExpertReview[] = CORE_TEAM_ROLES.map((r) => ({
    role: r.id, roleLabel: r.label, verdict: 'endorse', concerns: [], required_change: null, rationale: 'ok', mandatory: false,
  }));
  const { panel_verdict, blocking } = computeRollup(experts);
  return { verdict: { gate, experts, agreements: [], dissents: [], open_questions: [], synthesis: 'c', panel_verdict, blocking }, mode: 'fast', expertModel: 'mistral-medium-latest', chairModel: null, dissentLedger: null };
}

function orchestratorDeps(): OrchestratorDeps {
  return {
    callPlanner: async (): Promise<{ releaseName: string; summary: string; tasks: RawPlanTask[] }> => ({ releaseName: 'MVP', summary: 's', tasks: [{ title: 'A', description: 'do A' }] }),
    callCodegen: async () => '```ts\n// FILE: src/a.ts\nexport const a = 1;\n```',
    runPanel: async (_db, opts) => makeResult(opts.gate),
    validateWorkspace: async () => ({ ok: true, resolved: '/fake/ws' }),
    readWorkspaceFile: async () => null,
    applyFiles: async () => ({ written: 1, unchanged: 0, backupDir: '' }),
    runTests: async () => ({ ran: true, exitCode: 0, durationMs: 5, timedOut: false, stdoutTail: '1 passed', stderrTail: '', outputTruncated: false }),
    resolveProjectDsn: async () => null,
    integration: {
      captureTestResult: () => {}, captureReviewFlag: () => {}, captureDependencyCve: () => {},
      captureTechDebt: () => {}, captureArchDecision: () => {},
      mintCodingAtom: async () => null, scoreOutput: async () => null,
      saveVersion: async () => ({ id: 0, version_number: 1, label: null }),
      getVersionHistory: async () => [], diffVersions: async () => null, extractKnowledge: async () => {},
    } as unknown as OrchestratorDeps['integration'],
  };
}

describeOrSkip('ANTON Studio orchestrator routes', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base: string;
  const projectsRowId = randomUUID();
  const codingProjectId = randomUUID();

  beforeAll(async () => {
    savedEnv = {}; for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
    process.env.MISTRAL_API_KEY = 'test-key';

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createCodingStudioRoutes } = await import('../../server/routes/coding-studio.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = { id: 'solo', role: 'admin' };
      next();
    });
    app.use('/api', createCodingStudioRoutes(db, {
      orchestratorDeps: orchestratorDeps(),
      bundle: async () => Buffer.from('PK-FAKE-ANTON'),
      sign: async (_d, buf) => buf, // no-op signer
    }));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;

    await db.run('INSERT INTO projects (id, name) VALUES (?, ?)', projectsRowId, 'studio-route-test');
    await db.run(
      "INSERT INTO coding_projects (id, project_id, name, tier, discovery_summary, test_command) VALUES (?, ?, ?, 'large', ?, ?)",
      codingProjectId, projectsRowId, 'Route build', '# Charter', JSON.stringify(['node', '--run', 'test']),
    );
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM coding_test_runs WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_workspace_applications WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_panel_decisions WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_reviews WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_tasks WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_releases WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_studio_runs WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_projects WHERE id = ?', codingProjectId);
      await db.run('DELETE FROM projects WHERE id = ?', projectsRowId);
    } finally {
      for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
      await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
      await db.close();
    }
  });

  beforeEach(async () => {
    await db.run('DELETE FROM coding_test_runs WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_workspace_applications WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_panel_decisions WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_reviews WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_tasks WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_releases WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_studio_runs WHERE coding_project_id = ?', codingProjectId);
  });

  async function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }
  async function get(path: string): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}${path}`);
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  it('POST /run plans and parks at awaiting_plan', async () => {
    const { status, json } = await post(`/api/coding/studio/${codingProjectId}/run`, { autonomy: 'more', reviseCap: 4 });
    expect(status).toBe(200);
    const run = json.run as Record<string, unknown>;
    expect(run.status).toBe('awaiting_plan');
    expect((run.plan as { tasks: unknown[] }).tasks).toHaveLength(1);
  });

  it('POST /run/approve-plan runs the loop to done', async () => {
    await post(`/api/coding/studio/${codingProjectId}/run`, {});
    const { status, json } = await post(`/api/coding/studio/${codingProjectId}/run/approve-plan`, {});
    expect(status).toBe(200);
    expect((json.run as Record<string, unknown>).status).toBe('done');
  });

  it('GET /run/status returns the live run', async () => {
    await post(`/api/coding/studio/${codingProjectId}/run`, {});
    const { status, json } = await get(`/api/coding/studio/${codingProjectId}/run/status`);
    expect(status).toBe(200);
    expect((json.run as Record<string, unknown>).status).toBe('awaiting_plan');
  });

  it('POST /run/stop sets the stop flag', async () => {
    await post(`/api/coding/studio/${codingProjectId}/run`, {});
    const { status, json } = await post(`/api/coding/studio/${codingProjectId}/run/stop`, {});
    expect(status).toBe(200);
    expect((json.run as Record<string, unknown>).stop_requested).toBe(true);
  });

  it('POST /export returns the .anton bytes', async () => {
    const r = await fetch(`${base}/api/coding/studio/${codingProjectId}/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/octet-stream');
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.toString('utf-8')).toBe('PK-FAKE-ANTON');
  });

  it('404s on an unknown project', async () => {
    const { status } = await post(`/api/coding/studio/${randomUUID()}/run`, {});
    expect(status).toBe(404);
  });
});
