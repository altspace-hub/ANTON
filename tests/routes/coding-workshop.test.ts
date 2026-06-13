/**
 * coding-workshop.test.ts — ANTON Studio P1 (route-level).
 *
 * The workshop turn loop is driven by an injected orchestrator stub
 * (deps.callOrchestrator) — NO live LLM in this file. Exercises:
 *   POST   /coding/workshop/sessions            → new session
 *   GET    /coding/workshop/sessions/:id/start  → opening turn
 *   POST   /coding/workshop/sessions/:id/respond → a turn (state advances)
 *   POST   /coding/workshop/sessions/:id/finalize → CHARTER + seeded coding_project
 *   GET    /coding/workshop/sessions            → listing (ownership)
 *   404 on an unknown session.
 *
 * Requires DATABASE_URL; skips otherwise (core-team route-test pattern).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

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

// Force Mistral so resolveCodingModel('orchestrator') is deterministic (Large).
const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;

describeOrSkip('ANTON Studio kickoff workshop routes', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;
  let savedEnv: Record<string, string | undefined>;

  const seeded: { codingProjectId?: string; projectId?: string; sessionIds: string[] } = { sessionIds: [] };

  beforeAll(async () => {
    savedEnv = {}; for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.MISTRAL_API_KEY = 'test-key';

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createCodingWorkshopRoutes } = await import('../../server/routes/coding-workshop.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    // A scripted orchestrator stub — each turn captures a piece of the charter.
    const scripted = async (): Promise<string> =>
      `Reflecting back. Next question.\n[STATE_UPDATE]:{"title":"Route Workshop Test","problemStatement":"prove the route seeds a project","scope":"minimal","language":"python","expertPanel":["project_manager"]}\n[PHASE_COMPLETE:problem_vision]`;

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = { id: 'solo', role: 'admin' };
      next();
    });
    app.use('/api', createCodingWorkshopRoutes(db, {
      callOrchestrator: scripted,
      suggestFrameworks: async () => [],
    }));

    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    try {
      if (seeded.codingProjectId) await db.run('DELETE FROM coding_projects WHERE id = ?', seeded.codingProjectId);
      if (seeded.projectId) await db.run('DELETE FROM projects WHERE id = ?', seeded.projectId);
      for (const id of seeded.sessionIds) await db.run('DELETE FROM coding_workshop_sessions WHERE id = ?', id);
    } finally {
      await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
      await db.close();
      for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
    }
  });

  async function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }
  async function get(path: string): Promise<{ status: number; json: unknown }> {
    const r = await fetch(`${base}${path}`);
    return { status: r.status, json: await r.json() };
  }

  it('creates a session, opens it, runs a turn, then finalizes into a seeded coding_project', async () => {
    const create = await post('/api/coding/workshop/sessions', { tier: 'standard', mode: 'project' });
    expect(create.status).toBe(200);
    const sessionId = create.json.id as string;
    expect(sessionId).toBeTruthy();
    seeded.sessionIds.push(sessionId);

    const start = await get(`/api/coding/workshop/sessions/${sessionId}/start`);
    expect(start.status).toBe(200);
    expect((start.json as { response: string }).response).toContain('Next question');

    const respond = await post(`/api/coding/workshop/sessions/${sessionId}/respond`, { message: 'I want to build a thing' });
    expect(respond.status).toBe(200);
    const state = (respond.json as { state: { phase: string; problemStatement: string; canFinalize: boolean } }).state;
    expect(state.phase).toBe('scope_mvp'); // advanced past problem_vision
    expect(state.problemStatement).toBe('prove the route seeds a project');
    expect(state.canFinalize).toBe(true);

    const finalize = await post(`/api/coding/workshop/sessions/${sessionId}/finalize`, {});
    expect(finalize.status).toBe(200);
    const codingProjectId = finalize.json.codingProjectId as string;
    const projectId = finalize.json.projectId as string;
    expect(codingProjectId).toBeTruthy();
    seeded.codingProjectId = codingProjectId;
    seeded.projectId = projectId;
    expect((finalize.json.charter as { language: string }).language).toBe('python');

    // The seeded coding project really exists and carries the charter.
    const cp = await db.get<{ name: string; tier: string }>(
      'SELECT name, tier FROM coding_projects WHERE id = ?', codingProjectId,
    );
    expect(cp!.name).toBe('Route Workshop Test');
    expect(cp!.tier).toBe('large');
  });

  it('finalize 400s when the workshop has no problem statement', async () => {
    // A fresh session whose stub never captures a problem (override via a second app is heavy;
    // instead: create, do NOT respond, finalize immediately → empty charter → 400).
    const create = await post('/api/coding/workshop/sessions', { tier: 'lite', mode: 'project' });
    const sessionId = create.json.id as string;
    seeded.sessionIds.push(sessionId);
    const finalize = await post(`/api/coding/workshop/sessions/${sessionId}/finalize`, {});
    expect(finalize.status).toBe(400);
    expect(String(finalize.json.error)).toMatch(/problem statement/i);
  });

  it('lists the caller sessions and 404s on an unknown session', async () => {
    const list = await get('/api/coding/workshop/sessions');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.json)).toBe(true);
    expect((list.json as unknown[]).length).toBeGreaterThanOrEqual(1);

    const missing = await get('/api/coding/workshop/sessions/00000000-0000-0000-0000-000000000000');
    expect(missing.status).toBe(404);
  });
});
