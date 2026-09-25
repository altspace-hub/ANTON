/**
 * audit-trail-owner-scope.test.ts — GET /api/audit-trail and /api/audit-trail/:id
 * are owner-scoped on a team server (team-server audit 2026-09-23, B3).
 *
 * Before: the list ran every kind's query with no owner predicate, so any user
 * received every other user's session ids and IRE chain ids — the ids that
 * /api/revelation-chains/:chainId and the chat route then accepted. The detail
 * route scanned the same unscoped feed.
 *
 * Against a fake adapter that records the statements the aggregator sends:
 *   - team mode, non-admin: every kind that is queried carries its owner predicate
 *     bound to the caller's id; signed delivery (no owner column) is never queried;
 *     a detail lookup puts the owner predicate in the same WHERE as the row id;
 *   - negative controls: an admin on a team server and the solo user send exactly
 *     the unscoped statements, and signed delivery is queried for them.
 *
 * The DB-backed companion (tests/db/audit-trail-owner-scope.db.test.ts) proves the
 * predicates select the right rows against the real schema.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createAuditTrailRoutes } from '../../server/routes/audit-trail.js';
import { trailScopeForRequest, TRAIL_OWNER_SQL } from '../../server/services/trails-aggregator-service.js';
import { adapterParams } from '../helpers/adapter-params';

interface Call { sql: string; params: unknown[] }

const calls: Call[] = [];

const fakeDb = {
  dialect: 'postgresql',
  async get(): Promise<undefined> { throw new Error('fake db: get() is not expected'); },
  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    params = adapterParams(params);
    calls.push({ sql, params });
    return [];
  },
  async run(): Promise<RunResult> { throw new Error('fake db: run() is not expected'); },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(fakeDb as unknown as DatabaseAdapter); },
  async close() { /* noop */ },
};

/** Which trail table a recorded statement read. */
function tableOf(sql: string): string {
  const m = /FROM\s+(\w+)/.exec(sql);
  return m ? m[1] : '?';
}

const OWNED_TABLES = ['revelation_chains', 'workflow_runs', 'evidence_packs', 'rendered_artifacts'];

let server: Server;
let base: string;
const originalMode = process.env.DEPLOYMENT_MODE;

beforeAll(async () => {
  const app = express();
  // The caller, as middleware/auth.ts would have set it.
  app.use((req, _res, next) => {
    const id = req.header('x-test-user');
    if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
    next();
  });
  app.use('/api/audit-trail', createAuditTrailRoutes(fakeDb as unknown as DatabaseAdapter));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

beforeEach(() => { calls.length = 0; });
afterEach(() => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
});

async function get(path: string, user: string, role: string) {
  const r = await fetch(`${base}/api/audit-trail${path}`, { headers: { 'x-test-user': user, 'x-test-role': role } });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

describe('trailScopeForRequest', () => {
  it('follows scopesToOwner: solo and admins see all, a team non-admin only their own, no identity nothing', () => {
    delete process.env.DEPLOYMENT_MODE;
    expect(trailScopeForRequest({ user: { id: 'solo', role: 'admin' } })).toEqual({ kind: 'all' });
    expect(trailScopeForRequest({ user: { id: 'carol', role: 'analyst' } })).toEqual({ kind: 'all' });
    process.env.DEPLOYMENT_MODE = 'team';
    expect(trailScopeForRequest({ user: { id: 'root', role: 'admin' } })).toEqual({ kind: 'all' });
    expect(trailScopeForRequest({ user: { id: 'carol', role: 'analyst' } })).toEqual({ kind: 'owner', userId: 'carol' });
    expect(trailScopeForRequest({ user: { id: 'vic', role: 'viewer' } })).toEqual({ kind: 'owner', userId: 'vic' });
    expect(trailScopeForRequest({})).toEqual({ kind: 'none' });
  });
});

describe('GET /api/audit-trail — the list', () => {
  it('team mode, non-admin: each owned kind is queried with its owner predicate bound to the caller; signed delivery is not queried', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await get('/', 'carol', 'analyst');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ entries: [], total: 0, hasMore: false });

    const tables = calls.map((c) => tableOf(c.sql)).sort();
    expect(tables).toEqual([...OWNED_TABLES].sort());
    expect(tables).not.toContain('community_signed_trail_entries');

    const predicateOf: Record<string, string> = {
      revelation_chains: TRAIL_OWNER_SQL.ire_revelation!('$1'),
      workflow_runs: TRAIL_OWNER_SQL.workflow_run!('$1'),
      evidence_packs: TRAIL_OWNER_SQL.evidence_pack!('$1'),
      rendered_artifacts: TRAIL_OWNER_SQL.renderer_artifact!('$1'),
    };
    for (const c of calls) {
      const table = tableOf(c.sql);
      expect(c.sql, table).toContain(`WHERE ${predicateOf[table]}`);
      expect(c.params, table).toEqual(['carol']);
    }
  });

  it('team mode, non-admin: a userId filter naming someone else is ANDed with the scope, never instead of it', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    await get('/?kinds=workflow_run,evidence_pack&userId=bob', 'carol', 'analyst');
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.params, tableOf(c.sql)).toEqual(['carol', 'bob']);
      expect(c.sql).toMatch(/WHERE \S+ = \$1 AND \S+ = \$2/);
    }
  });

  it('negative control — team mode admin: the unscoped statements, signed delivery included', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await get('/', 'root', 'admin');
    expect(r.status).toBe(200);
    const tables = calls.map((c) => tableOf(c.sql)).sort();
    expect(tables).toEqual([...OWNED_TABLES, 'community_signed_trail_entries'].sort());
    for (const c of calls) {
      expect(c.sql, tableOf(c.sql)).not.toMatch(/\bWHERE\b/);
      expect(c.params).toEqual([]);
    }
  });

  it('negative control — solo mode: exactly what an admin gets, for any role', async () => {
    delete process.env.DEPLOYMENT_MODE;
    await get('/', 'solo', 'admin');
    const soloCalls = calls.map((c) => ({ ...c }));
    calls.length = 0;
    await get('/', 'carol', 'analyst');
    expect(calls).toEqual(soloCalls);
    expect(soloCalls.map((c) => tableOf(c.sql))).toContain('community_signed_trail_entries');
    for (const c of soloCalls) expect(c.params).toEqual([]);
  });
});

describe('GET /api/audit-trail/:id — the detail', () => {
  it('team mode, non-admin: one query, owner predicate and row id in the same WHERE; a miss is 404', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await get('/ire:chain-1', 'carol', 'analyst');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Trail not found' });
    expect(calls).toHaveLength(1);
    expect(tableOf(calls[0].sql)).toBe('revelation_chains');
    expect(calls[0].sql).toContain(`WHERE ${TRAIL_OWNER_SQL.ire_revelation!('$1')} AND id = $2`);
    expect(calls[0].params).toEqual(['carol', 'chain-1']);
  });

  it('team mode, non-admin: a signed-delivery id is 404 without touching the database', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await get('/signed:ste_1', 'carol', 'analyst');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Trail not found' });
    expect(calls).toEqual([]);
  });

  it('negative control — admin: the row is looked up by id alone', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    await get('/signed:ste_1', 'root', 'admin');
    expect(calls).toHaveLength(1);
    expect(tableOf(calls[0].sql)).toBe('community_signed_trail_entries');
    expect(calls[0].sql).toContain('WHERE id = $1');
    expect(calls[0].params).toEqual(['ste_1']);
  });

  it('unknown prefixes, prototype keys and non-numeric renderer ids are 404 with no query', async () => {
    delete process.env.DEPLOYMENT_MODE;
    for (const id of ['nope:1', '__proto__:1', 'constructor:1', 'ire:', ':x', 'rend:abc']) {
      const r = await get(`/${encodeURIComponent(id)}`, 'solo', 'admin');
      expect(r.status, id).toBe(404);
    }
    expect(calls).toEqual([]);
  });
});
