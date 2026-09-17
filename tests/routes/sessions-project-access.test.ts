/**
 * sessions-project-access.test.ts — a session is born inside a project only
 * when that project exists and the caller may see it (Wave 4, track D).
 *
 * Before: POST /api/sessions stored any projectId string, and the run then
 * injected that project's other sessions into the prompt with no check.
 *
 * Against a fake adapter answering the service's own statements:
 *   - 404 'Project not found' for an unknown id, nothing inserted;
 *   - team mode: 403 'Not a member of this project' for a non-member,
 *     nothing inserted; owner, member and admin get their session;
 *   - solo mode: existence only — membership is never asked about.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { PROJECT_CONTEXT_SQL } from '../../server/services/project-context.js';

vi.mock('../../server/services/provider-router.js', () => ({ callChat: vi.fn(), streamChat: vi.fn(), mapModelToProvider: (m: string) => m }));
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'sdk:claude-sonnet-5' }));

import { createSessionRoutes } from '../../server/routes/sessions.js';

const PROJECT = 'proj-1';

interface FakeState {
  inserts: unknown[][];
  calls: string[];
  members: Set<string>;
}

function makeFakeDb(): { db: DatabaseAdapter; state: FakeState } {
  const state: FakeState = { inserts: [], calls: [], members: new Set(['bob']) };
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      state.calls.push(sql);
      if (sql === PROJECT_CONTEXT_SQL.project) {
        return (params[0] === PROJECT ? { id: PROJECT, name: 'Orion acquisition', description: null, project_goal: null, user_id: 'alice' } : undefined) as T | undefined;
      }
      if (sql === PROJECT_CONTEXT_SQL.membership) return (params[0] === PROJECT && state.members.has(String(params[1])) ? { '?column?': 1 } : undefined) as T | undefined;
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (/INSERT INTO sessions/i.test(sql)) { state.inserts.push(params); return { changes: 1, lastInsertRowid: 0 }; }
      throw new Error(`fake db: unexpected run(): ${sql.slice(0, 80)}`);
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, state };
}

let server: Server;
let base: string;
let state: FakeState;
const originalMode = process.env.DEPLOYMENT_MODE;

beforeAll(async () => {
  const fake = makeFakeDb();
  state = fake.state;
  const app = express();
  app.use(express.json());
  // The caller, as middleware/auth.ts would have set it.
  app.use((req, _res, next) => {
    const id = req.header('x-test-user');
    if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
    next();
  });
  app.use('/api', await createSessionRoutes(fake.db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

beforeEach(() => { state.inserts.length = 0; state.calls.length = 0; });
afterEach(() => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
});

async function create(user: string, role: string, projectId: string | undefined) {
  const r = await fetch(`${base}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-user': user, 'x-test-role': role },
    body: JSON.stringify({ moduleId: 'open-chat', title: 'A session', config: {}, ...(projectId !== undefined ? { projectId } : {}) }),
  });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

describe('POST /api/sessions with a projectId', () => {
  it('404 for a project that does not exist, and nothing is inserted', async () => {
    delete process.env.DEPLOYMENT_MODE;
    const r = await create('alice', 'admin', 'no-such-project');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Project not found' });
    expect(state.inserts).toEqual([]);
  });

  it('team mode: 403 for a caller who is neither member, owner nor admin — nothing inserted', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await create('carol', 'analyst', PROJECT);
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'Not a member of this project' });
    expect(state.inserts).toEqual([]);
    expect(state.calls).toContain(PROJECT_CONTEXT_SQL.membership);
  });

  it('team mode: a member, the owner and an admin each get their session filed under the project', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    for (const [user, role] of [['bob', 'analyst'], ['alice', 'analyst'], ['root', 'admin']] as const) {
      const r = await create(user, role, PROJECT);
      expect(r.status, user).toBe(200);
      expect(r.body.projectId, user).toBe(PROJECT);
    }
    expect(state.inserts).toHaveLength(3);
    for (const params of state.inserts) expect(params[5]).toBe(PROJECT);
  });

  it('solo mode: existence is the only check — a non-member gets the session and membership is never read', async () => {
    delete process.env.DEPLOYMENT_MODE;
    const r = await create('carol', 'analyst', PROJECT);
    expect(r.status).toBe(200);
    expect(r.body.projectId).toBe(PROJECT);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0][5]).toBe(PROJECT);
    expect(state.calls).toContain(PROJECT_CONTEXT_SQL.project);
    expect(state.calls).not.toContain(PROJECT_CONTEXT_SQL.membership);
  });

  it('no projectId: no project is read and project_id is null', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await create('carol', 'analyst', undefined);
    expect(r.status).toBe(200);
    expect(r.body.projectId).toBeNull();
    expect(state.inserts[0][5]).toBeNull();
    expect(state.calls).toEqual([]);
  });
});
