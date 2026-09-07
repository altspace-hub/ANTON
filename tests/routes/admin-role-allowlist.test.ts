/**
 * admin-role-allowlist.test.ts — users.role may only ever be one of the three roles.
 *
 * The escalation this closes needs no attacker inside the product: an admin provisions
 * a service account through the API with role:'member' — a natural choice, and the API
 * took any string — and users.role has no CHECK constraint to stop it. requireRole then
 * failed open on the unknown value (see role-guards.test.ts), so the "below viewer"
 * account it created outranked admin.
 *
 * Two halves have to hold together: the value never reaches the INSERT, and the three
 * real roles still do. An allowlist that also rejects 'analyst' would stop team-mode
 * onboarding dead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { createAdminRoutes } from '../../server/routes/admin.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

/** Records every statement so a test can assert what did NOT reach the database. */
function recordingDb() {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    get: async () => undefined,
    all: async () => [],
    run: async (sql: string, ...params: unknown[]) => {
      runs.push({ sql, params });
      return { changes: 1, lastInsertRowid: 0 };
    },
    exec: async () => {},
  } as unknown as DatabaseAdapter;
  return { db, runs };
}

let server: import('http').Server;
let base = '';
let runs: Array<{ sql: string; params: unknown[] }>;
let originalMode: string | undefined;

/** The caller identity — an admin, since these routes are behind requireRole('admin'). */
let current: { id: string; username: string; role: string } = { id: 'admin-1', username: 'admin', role: 'admin' };

beforeAll(async () => {
  originalMode = process.env.DEPLOYMENT_MODE;
  process.env.DEPLOYMENT_MODE = 'team';
  const rec = recordingDb();
  runs = rec.runs;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: typeof current }).user = current; next(); });
  app.use('/api', await createAdminRoutes(rec.db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('No server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = originalMode;
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

beforeEach(() => {
  runs.length = 0;
  current = { id: 'admin-1', username: 'admin', role: 'admin' };
});

const post = (body: unknown) => fetch(`${base}/api/admin/users`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const patch = (id: string, body: unknown) => fetch(`${base}/api/admin/users/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('POST /admin/users', () => {
  it('refuses a role outside the three, and writes nothing', async () => {
    for (const role of ['member', 'user', 'superuser', 'owner']) {
      runs.length = 0;
      const res = await post({ username: `svc-${role}`, password: 'pw', role });
      expect(res.status, `role ${role}`).toBe(400);
      expect(runs.filter((r) => r.sql.startsWith('INSERT INTO users'))).toHaveLength(0);
    }
  });

  it('still creates a user with each real role — onboarding must keep working', async () => {
    for (const role of ['viewer', 'analyst', 'admin']) {
      runs.length = 0;
      const res = await post({ username: `real-${role}`, password: 'pw', role });
      expect(res.status, `role ${role}`).toBe(200);
      const insert = runs.find((r) => r.sql.startsWith('INSERT INTO users'));
      expect(insert?.params).toContain(role);
    }
  });

  it('defaults to analyst when the client sends no role at all', async () => {
    const res = await post({ username: 'no-role-given', password: 'pw' });
    expect(res.status).toBe(200);
    expect(runs.find((r) => r.sql.startsWith('INSERT INTO users'))?.params).toContain('analyst');
  });
});

describe('PATCH /admin/users/:id', () => {
  it('refuses a role outside the three and leaves the row untouched', async () => {
    const res = await patch('u-1', { role: 'superuser' });
    expect(res.status).toBe(400);
    expect(runs).toHaveLength(0);
  });

  it('still performs a legitimate demotion — the whole point of the route', async () => {
    const res = await patch('u-1', { role: 'viewer' });
    expect(res.status).toBe(200);
    const update = runs.find((r) => r.sql.includes('UPDATE users SET role'));
    expect(update?.params).toEqual(['viewer', 'u-1']);
  });

  it('leaves a role-free PATCH alone — resetting a password must not need a role', async () => {
    const res = await patch('u-1', { display_name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(runs.some((r) => r.sql.includes('UPDATE users SET display_name'))).toBe(true);
  });
});
