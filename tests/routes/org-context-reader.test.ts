/**
 * org-context-reader.test.ts — a team user's read of the organisation context
 * does not make the instance-wide row theirs (public showcase, 2026-10-02).
 *
 * GET /api/org-context inserts the one org_context row (empty) when there is
 * none, and used to name the reader as its user_id. On the public demo that
 * reader is a visitor, and demo retention deletes every row whose user_id is an
 * expired visitor's: the operator's org context (kept under the same row when
 * the admin later fills it in) would go with them, history included. The
 * reader's response also carried that user_id.
 *
 * Now a team user who may not change the context is never written as its
 * creator (the column default, 'default', is), and gets it without user_id.
 *
 * Negative controls: an admin and the solo user are still recorded as the
 * creator and see user_id; when the row exists nothing is inserted.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createOrgContextRoutes } from '../../server/routes/org-context.js';

let row: Record<string, unknown> | null = null;
const inserts: unknown[][] = [];

const db = {
  dialect: 'postgresql',
  async get<T>(sql: string): Promise<T | undefined> {
    if (sql.includes('FROM org_context')) return (row ?? undefined) as T | undefined;
    return undefined;
  },
  async all<T>(): Promise<T[]> { return []; },
  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    if (sql.includes('INSERT INTO org_context')) {
      inserts.push(params);
      row = {
        id: params[0], org_name: null, org_type: null, jurisdiction: null, regulatory_perimeter: '[]', risk_appetite: null,
        key_systems: '[]', key_relationships: '[]', current_priorities: '[]', regulatory_calendar: '[]',
        preferred_language: 'en', custom_context: null, user_id: params[1], updated_at: params[2],
      };
    }
    return { changes: 1, lastInsertRowid: 0 };
  },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
  async close() { /* noop */ },
} as unknown as DatabaseAdapter;

let server: Server;
let base = '';
let current: { id: string; username: string; role: string } | null = null;
const originalMode = process.env.DEPLOYMENT_MODE;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (current) (req as unknown as { user: typeof current }).user = current; next(); });
  app.use('/api', await createOrgContextRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

beforeEach(() => {
  row = null;
  inserts.length = 0;
});

async function read(path = '/org-context'): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}${path}`);
  expect(r.status).toBe(200);
  return await r.json() as Record<string, unknown>;
}

describe('GET /org-context by a team user who may not change it', () => {
  it('creates the empty row as \'default\', not as the reader, and answers without user_id', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    current = { id: 'visitor_1', username: 'visitor_1', role: 'analyst' };
    const body = await read();
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toBe('default');
    expect(body.context).toBeDefined();
    expect(body.context).not.toHaveProperty('user_id');
  });

  it('the prompt route creates it the same way', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    current = { id: 'visitor_2', username: 'visitor_2', role: 'viewer' };
    await read('/org-context/prompt');
    expect(inserts[0][1]).toBe('default');
  });

  it('an existing row is read, not written, and its creator stays hidden', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    row = {
      id: 'default', org_name: 'Acme Bank', org_type: 'bank', jurisdiction: 'SE', regulatory_perimeter: '[]', risk_appetite: 'low',
      key_systems: '[]', key_relationships: '[]', current_priorities: '["AMLR"]', regulatory_calendar: '[]',
      preferred_language: 'en', custom_context: null, user_id: 'admin_7', updated_at: '2026-10-01',
    };
    current = { id: 'visitor_1', username: 'visitor_1', role: 'analyst' };
    const body = await read();
    expect(inserts).toHaveLength(0);
    expect(body.context).toMatchObject({ org_name: 'Acme Bank', current_priorities: ['AMLR'] });
    expect(body.context).not.toHaveProperty('user_id');
  });
});

describe('negative controls: who may change it is still recorded and shown', () => {
  it('an admin on a team server', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    current = { id: 'admin_7', username: 'admin_7', role: 'admin' };
    const body = await read();
    expect(inserts[0][1]).toBe('admin_7');
    expect(body.context).toMatchObject({ user_id: 'admin_7' });
  });

  it('the solo user', async () => {
    delete process.env.DEPLOYMENT_MODE;
    current = { id: 'solo', username: 'solo', role: 'admin' };
    const body = await read();
    expect(inserts[0][1]).toBe('solo');
    expect(body.context).toMatchObject({ user_id: 'solo' });
  });
});
