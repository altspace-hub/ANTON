/**
 * sessions-project-assign.test.ts — moving a session into a project goes
 * through the same gate as creating one there (Wave 4).
 *
 * PATCH /api/sessions/:id/project accepted any project id for any session:
 * no existence check, no membership check, no session ownership. Against a
 * fake adapter answering the service's own statements:
 *   - 404 'Session not found' / 'Project not found', nothing updated;
 *   - team mode (round-1 verifier gap, 2026-09-23): another user's session
 *     answers the same 404 'Session not found' as a missing one, and a project
 *     the caller is not in the same 404 'Project not found' as a missing one —
 *     the 403s confirmed the ids existed. An unowned (user_id NULL) session is
 *     admin-only, as ownership.ts says; any member could claim it before.
 *     Owner, member and admin succeed; null clears without reading the project;
 *   - solo mode: existence only.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { PROJECT_CONTEXT_SQL } from '../../server/services/project-context.js';

vi.mock('../../server/services/workspace.js', () => ({
  createProjectWorkspace: vi.fn(async () => '/tmp/ws'),
  deleteProjectWorkspace: vi.fn(async () => undefined),
}));

import { createProjectRoutes } from '../../server/routes/projects.js';

const PROJECT = 'proj-1';

interface FakeState { updates: unknown[][]; calls: string[]; members: Set<string> }

/** Session owners; null is a legacy, unattributed session. */
const SESSIONS: Record<string, string | null> = { 'sess-alice': 'alice', 'sess-bob': 'bob', 'sess-unowned': null };

function makeFakeDb(): { db: DatabaseAdapter; state: FakeState } {
  // Alice created the project, so she is its owner member (projects.ts adds her).
  const state: FakeState = { updates: [], calls: [], members: new Set(['alice', 'bob']) };
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      state.calls.push(sql);
      // assertOwned (middleware/ownership.ts): the scoped and the unscoped form.
      if (sql === 'SELECT 1 AS ok FROM sessions WHERE id = ? AND user_id = ?') {
        const id = String(params[0]);
        return (id in SESSIONS && SESSIONS[id] !== null && SESSIONS[id] === params[1] ? { ok: 1 } : undefined) as T | undefined;
      }
      if (sql === 'SELECT 1 AS ok FROM sessions WHERE id = ?') {
        return (String(params[0]) in SESSIONS ? { ok: 1 } : undefined) as T | undefined;
      }
      if (sql === PROJECT_CONTEXT_SQL.project) {
        return (params[0] === PROJECT ? { id: PROJECT, name: 'Orion acquisition', description: null, project_goal: null, user_id: 'alice' } : undefined) as T | undefined;
      }
      if (sql === PROJECT_CONTEXT_SQL.membership) return (params[0] === PROJECT && state.members.has(String(params[1])) ? { '?column?': 1 } : undefined) as T | undefined;
      if (sql === PROJECT_CONTEXT_SQL.anyMember) return (params[0] === PROJECT && state.members.size > 0 ? { '?column?': 1 } : undefined) as T | undefined;
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (/UPDATE sessions SET project_id/i.test(sql)) { state.updates.push(params); return { changes: 1, lastInsertRowid: 0 }; }
      throw new Error(`fake db: unexpected run(): ${sql.slice(0, 80)}`);
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, state };
}

const originalMode = process.env.DEPLOYMENT_MODE;

function restoreMode(): void {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = originalMode;
}

async function boot(mode: 'team' | 'solo'): Promise<{ server: Server; base: string; state: FakeState }> {
  if (mode === 'team') process.env.DEPLOYMENT_MODE = 'team'; else delete process.env.DEPLOYMENT_MODE;
  const fake = makeFakeDb();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.header('x-test-user');
    if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
    next();
  });
  app.use('/api', await createProjectRoutes(fake.db));
  const server = await new Promise<Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  return { server, base: `http://127.0.0.1:${addr.port}`, state: fake.state };
}

function patch(base: string, id: string, body: unknown, user?: string, role?: string): Promise<Response> {
  return fetch(`${base}/api/sessions/${id}/project`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}), ...(role ? { 'x-test-role': role } : {}) },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/sessions/:id/project in team mode', () => {
  let server: Server; let base: string; let state: FakeState;
  beforeAll(async () => { ({ server, base, state } = await boot('team')); });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); restoreMode(); });
  beforeEach(() => { state.updates.length = 0; state.calls.length = 0; });
  afterEach(() => { state.members = new Set(['alice', 'bob']); });

  it('404 for an unknown session, nothing updated', async () => {
    const res = await patch(base, 'nope', { projectId: PROJECT }, 'alice');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Session not found' });
    expect(state.updates).toEqual([]);
  });

  it("another user's session answers the same 404 as a missing one", async () => {
    const foreign = await patch(base, 'sess-alice', { projectId: PROJECT }, 'bob');
    const missing = await patch(base, 'nope', { projectId: PROJECT }, 'bob');
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
    expect(state.updates).toEqual([]);
  });

  it('an unowned (legacy) session is admin-only: a member gets 404, an admin moves it', async () => {
    const member = await patch(base, 'sess-unowned', { projectId: PROJECT }, 'bob');
    expect(member.status).toBe(404);
    expect(await member.json()).toEqual({ error: 'Session not found' });
    expect(state.updates).toEqual([]);
    const admin = await patch(base, 'sess-unowned', { projectId: PROJECT }, 'root', 'admin');
    expect(admin.status).toBe(200);
    expect(state.updates[0]?.[0]).toBe(PROJECT);
  });

  it('404 for an unknown project', async () => {
    const res = await patch(base, 'sess-alice', { projectId: 'ghost' }, 'alice');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Project not found' });
    expect(state.updates).toEqual([]);
  });

  it('a project the caller is not in answers the same 404 as a missing one', async () => {
    state.members = new Set(['bob']);   // Alice is not (or no longer) a member
    const foreign = await patch(base, 'sess-alice', { projectId: PROJECT }, 'alice');
    const missing = await patch(base, 'sess-alice', { projectId: 'ghost' }, 'alice');
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ error: 'Project not found' });
    expect(await missing.json()).toEqual({ error: 'Project not found' });
    expect(state.updates).toEqual([]);
  });

  it('owner, member and admin succeed', async () => {
    const own: Record<string, string> = { alice: 'sess-alice', bob: 'sess-bob', root: 'sess-unowned' };
    for (const [user, role] of [['alice', 'analyst'], ['bob', 'analyst'], ['root', 'admin']] as const) {
      state.updates.length = 0;
      const res = await patch(base, own[user], { projectId: PROJECT }, user, role);
      expect(res.status, `${user}/${role}`).toBe(200);
      expect(await res.json()).toEqual({ ok: true, projectId: PROJECT });
      expect(state.updates[0]?.[0]).toBe(PROJECT);
    }
  });

  it('null clears the project without reading the projects table', async () => {
    const res = await patch(base, 'sess-alice', { projectId: null }, 'alice');
    expect(res.status).toBe(200);
    expect(state.updates[0]?.[0]).toBeNull();
    expect(state.calls.some((c) => c === PROJECT_CONTEXT_SQL.project)).toBe(false);
  });

  it('400 for a non-string projectId', async () => {
    const res = await patch(base, 'sess-alice', { projectId: 42 }, 'alice');
    expect(res.status).toBe(400);
    expect(state.updates).toEqual([]);
  });
});

describe('PATCH /api/sessions/:id/project in solo mode', () => {
  let server: Server; let base: string; let state: FakeState;
  beforeAll(async () => { ({ server, base, state } = await boot('solo')); });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); restoreMode(); });

  it('existence only — membership is never asked about', async () => {
    // authMiddleware stamps the solo user as { id: 'solo', role: 'admin' }.
    const res = await patch(base, 'sess-alice', { projectId: PROJECT }, 'solo', 'admin');
    expect(res.status).toBe(200);
    expect(state.calls.some((c) => c === PROJECT_CONTEXT_SQL.membership)).toBe(false);
    expect(state.updates[0]?.[0]).toBe(PROJECT);
  });
});
