/**
 * session-create-project.test.ts — a session can be born inside a project.
 *
 * sessions.project_id could only ever be set by a later PATCH, and
 * containment that needs a second step after the work is done is containment
 * nobody performs: 0 of 54 sessions on this instance were ever linked to a
 * project. POST /api/sessions now takes projectId and stores it at creation.
 */
import { describe, it, expect, vi } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.mock('../../server/services/provider-router.js', () => ({ callChat: vi.fn() }));
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'sdk:claude-sonnet-5' }));

import { createSessionRoutes } from '../../server/routes/sessions.js';

type Handler = (req: unknown, res: unknown) => Promise<void>;

async function postSessionsHandler(db: DatabaseAdapter): Promise<Handler> {
  const router = await createSessionRoutes(db);
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === '/sessions' && l.route.methods.post);
  if (!layer?.route) throw new Error('route not mounted');
  return layer.route.stack[0].handle;
}

function mockRes() {
  const res = {
    statusCode: 200, body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res;
}

function fakeDb() {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    dialect: 'postgresql',
    get: vi.fn(async () => undefined),
    all: vi.fn(async () => []),
    run: vi.fn(async (sql: string, ...params: unknown[]) => { runs.push({ sql, params }); return { changes: 1, lastInsertRowid: 0 }; }),
    exec: vi.fn(async () => undefined),
    transaction: vi.fn(async (fn: (d: unknown) => unknown) => fn(db)),
    close: vi.fn(async () => undefined),
  } as unknown as DatabaseAdapter;
  return { db, runs };
}

describe('POST /sessions', () => {
  it('stores the project the session was created in', async () => {
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await postSessionsHandler(db))({ body: { moduleId: 'open-chat', title: 'Kickoff agenda', config: {}, projectId: 'proj-acme' }, user: { id: 'alice', role: 'user' } }, res);
    const insert = runs.find((r) => /INSERT INTO sessions/.test(r.sql));
    expect(insert).toBeDefined();
    expect(insert!.sql).toMatch(/project_id/);
    expect(insert!.params[insert!.params.length - 1]).toBe('proj-acme');
    expect((res.body as { projectId: string }).projectId).toBe('proj-acme');
  });

  it('stores NULL, not an empty string, when no project is given', async () => {
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await postSessionsHandler(db))({ body: { moduleId: 'open-chat', title: 'Hello', config: {}, projectId: '' }, user: { id: 'alice', role: 'user' } }, res);
    const insert = runs.find((r) => /INSERT INTO sessions/.test(r.sql));
    expect(insert!.params[insert!.params.length - 1]).toBeNull();
    expect((res.body as { projectId: string | null }).projectId).toBeNull();
  });
});
