/**
 * legal-research-project.test.ts — the matter lives in a project (Wave 4,
 * track D). POST /legal-research and PATCH /legal-research/:id accept a
 * projectId, store it in project_id, and refuse one the caller may not use;
 * the GET routes hand back project_id (and the project's name).
 *
 * Same fake-adapter pattern as legal-research-matter.test.ts: the route is
 * pulled off the router and called with a mock req/res.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { PROJECT_CONTEXT_SQL } from '../../server/services/project-context.js';

vi.mock('../../server/services/provider-router.js', () => ({ streamChat: vi.fn(), callChat: vi.fn(), mapModelToProvider: (m: string) => m }));
vi.mock('../../server/services/default-model-store.js', () => ({ getEffectiveDefaultModel: () => 'sdk:claude-opus-5' }));
vi.mock('../../server/services/claude-engine-availability.js', () => ({ hasClaudeEngine: () => true, NO_CLAUDE_ENGINE_MESSAGE: 'no engine' }));
vi.mock('../../server/services/prompt-builder.js', () => ({ buildOrgContextLayer: async () => '' }));
vi.mock('../../server/services/framework-text-retrieval.js', () => ({ retrieveGroundingText: async () => null }));

import { createLegalResearchRoutes } from '../../server/routes/legal-research.js';

const PROJECT = 'proj-1';
type Handler = (req: unknown, res: unknown) => Promise<void>;

async function handler(db: DatabaseAdapter, path: string, method: 'post' | 'patch' | 'get'): Promise<Handler> {
  const router = await createLegalResearchRoutes(db);
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`route not mounted: ${method} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
}

function fakeDb(sessionOver: Record<string, unknown> = {}) {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const calls: string[] = [];
  const session = {
    id: 'ls-1', user_id: 'alice', title: 'Orion SPA warranty claim', mode: 'deep-dive', expert_role: 'eu-regulatory-lawyer',
    research_questions: '[]', pinned_findings: '[]', citations: '[]', active_knowledge_packs: '[]',
    documents: '[]', matter_brief: '{}', intake_conversation: '[]', project_id: null as string | null, project_name: null as string | null,
    ...sessionOver,
  };
  const members = new Set(['bob']);
  const db = {
    dialect: 'postgresql',
    get: vi.fn(async (sql: string, ...params: unknown[]) => {
      calls.push(sql);
      if (sql === PROJECT_CONTEXT_SQL.project) return params[0] === PROJECT ? { id: PROJECT, name: 'Orion acquisition', description: null, project_goal: null, user_id: 'alice' } : undefined;
      if (sql === PROJECT_CONTEXT_SQL.membership) return params[0] === PROJECT && members.has(String(params[1])) ? { '?column?': 1 } : undefined;
      if (/FROM legal_research_sessions/.test(sql)) {
        // The joined read: the row plus the project's name.
        if (/project_name/.test(sql)) return { ...session, project_name: session.project_id === PROJECT ? 'Orion acquisition' : null };
        return session;
      }
      return undefined;
    }),
    all: vi.fn(async () => []),
    run: vi.fn(async (sql: string, ...params: unknown[]) => {
      runs.push({ sql, params });
      const m = sql.match(/^UPDATE legal_research_sessions SET (.+?), updated_at = \?/);
      if (m && /project_id = \?/.test(m[1])) session.project_id = params[m[1].split(', ').indexOf('project_id = ?')] as string | null;
      if (/^INSERT INTO legal_research_sessions/.test(sql.trim())) session.project_id = params[6] as string | null;
      return { changes: 1, lastInsertRowid: 0 };
    }),
    exec: vi.fn(async () => undefined),
    transaction: vi.fn(async (fn: (d: unknown) => unknown) => fn(db)),
    close: vi.fn(async () => undefined),
  } as unknown as DatabaseAdapter;
  return { db, runs, calls };
}

const req = (body: Record<string, unknown>, user: { id: string; role: string } = { id: 'alice', role: 'admin' }) => ({ params: { id: 'ls-1' }, body, user });

const originalMode = process.env.DEPLOYMENT_MODE;
beforeEach(() => { delete process.env.DEPLOYMENT_MODE; });
afterEach(() => { if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode; });

describe('POST /legal-research with a projectId', () => {
  it('stores the project and answers with the joined row', async () => {
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await handler(db, '/legal-research', 'post'))(req({ title: 'Orion', projectId: PROJECT }), res);
    expect(res.statusCode).toBe(201);
    const insert = runs.find((r) => /INSERT INTO legal_research_sessions/.test(r.sql));
    expect(insert).toBeDefined();
    expect(insert!.sql).toMatch(/project_id/);
    expect(insert!.params[6]).toBe(PROJECT);
    const body = res.body as { session: { project_id: string | null; project_name: string | null } };
    expect(body.session.project_id).toBe(PROJECT);
    expect(body.session.project_name).toBe('Orion acquisition');
  });

  it('stores null when no project is given', async () => {
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await handler(db, '/legal-research', 'post'))(req({ title: 'Orion' }), res);
    expect(res.statusCode).toBe(201);
    expect(runs.find((r) => /INSERT INTO legal_research_sessions/.test(r.sql))!.params[6]).toBeNull();
  });

  it('404 for an unknown project, nothing inserted', async () => {
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await handler(db, '/legal-research', 'post'))(req({ title: 'Orion', projectId: 'nope' }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Project not found' });
    expect(runs).toEqual([]);
  });

  it('team mode: 403 for a non-member, 201 for a member', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const denied = fakeDb();
    const r1 = mockRes();
    await (await handler(denied.db, '/legal-research', 'post'))(req({ title: 'Orion', projectId: PROJECT }, { id: 'carol', role: 'analyst' }), r1);
    expect(r1.statusCode).toBe(403);
    expect(r1.body).toEqual({ error: 'Not a member of this project' });
    expect(denied.runs).toEqual([]);

    const allowed = fakeDb({ user_id: 'bob' });
    const r2 = mockRes();
    await (await handler(allowed.db, '/legal-research', 'post'))(req({ title: 'Orion', projectId: PROJECT }, { id: 'bob', role: 'analyst' }), r2);
    expect(r2.statusCode).toBe(201);
    expect(allowed.runs.find((r) => /INSERT INTO legal_research_sessions/.test(r.sql))!.params[6]).toBe(PROJECT);
  });
});

describe('PATCH /legal-research/:id projectId', () => {
  it('files the matter under a project and hands back the project name', async () => {
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await handler(db, '/legal-research/:id', 'patch'))(req({ projectId: PROJECT }), res);
    expect(res.statusCode).toBe(200);
    const update = runs.find((r) => /UPDATE legal_research_sessions SET project_id = \?/.test(r.sql));
    expect(update).toBeDefined();
    expect(update!.params[0]).toBe(PROJECT);
    expect(update!.params.slice(-2)).toEqual(['ls-1', 'alice']);
    const body = res.body as { session: { project_id: string | null; project_name: string | null } };
    expect(body.session.project_id).toBe(PROJECT);
    expect(body.session.project_name).toBe('Orion acquisition');
  });

  it('takes the matter out of its project with null, without reading projects', async () => {
    const { db, runs, calls } = fakeDb({ project_id: PROJECT });
    const res = mockRes();
    await (await handler(db, '/legal-research/:id', 'patch'))(req({ projectId: null }), res);
    expect(res.statusCode).toBe(200);
    const update = runs.find((r) => /UPDATE legal_research_sessions SET project_id = \?/.test(r.sql));
    expect(update!.params[0]).toBeNull();
    expect(calls).not.toContain(PROJECT_CONTEXT_SQL.project);
    expect((res.body as { session: { project_id: string | null } }).session.project_id).toBeNull();
  });

  it('refuses an unknown project (404), a non-member in team mode (403) and a non-string (400) — nothing written', async () => {
    const { db, runs } = fakeDb();
    const patch = await handler(db, '/legal-research/:id', 'patch');

    const missing = mockRes();
    await patch(req({ projectId: 'nope' }), missing);
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toEqual({ error: 'Project not found' });

    process.env.DEPLOYMENT_MODE = 'team';
    const forbidden = mockRes();
    await patch(req({ projectId: PROJECT }, { id: 'carol', role: 'analyst' }), forbidden);
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.body).toEqual({ error: 'Not a member of this project' });
    delete process.env.DEPLOYMENT_MODE;

    const bad = mockRes();
    await patch(req({ projectId: 42 }), bad);
    expect(bad.statusCode).toBe(400);

    expect(runs).toEqual([]);
  });

  it('a PATCH without projectId leaves project_id alone', async () => {
    const { db, runs } = fakeDb({ project_id: PROJECT });
    const res = mockRes();
    await (await handler(db, '/legal-research/:id', 'patch'))(req({ title: 'Renamed' }), res);
    const update = runs.find((r) => /UPDATE legal_research_sessions/.test(r.sql));
    expect(update!.sql).not.toMatch(/project_id/);
    expect((res.body as { session: { project_id: string | null } }).session.project_id).toBe(PROJECT);
  });
});

describe('GET /legal-research/:id', () => {
  it('returns project_id and the project name', async () => {
    const { db } = fakeDb({ project_id: PROJECT });
    const res = mockRes();
    await (await handler(db, '/legal-research/:id', 'get'))(req({}), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as { session: { project_id: string | null; project_name: string | null } };
    expect(body.session.project_id).toBe(PROJECT);
    expect(body.session.project_name).toBe('Orion acquisition');
  });
});
