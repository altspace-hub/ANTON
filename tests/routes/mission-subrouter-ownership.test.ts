/**
 * mission-subrouter-ownership.test.ts — the four mission sub-routers, tenant-scoped.
 *
 * ── What was open ────────────────────────────────────────────────────────────
 *
 * missions.ts:213 does `router.use('/missions/:id', createMissionOwnerGuard(db))`, which
 * covers the ~17 per-mission routes in THAT router. The sub-routers — payments,
 * delivery, grow, delegation — are separate Routers mounted in index.ts BEFORE it
 * (686/689/692/695 against 706). Express dispatches in mount order and a matching router
 * terminates the chain, so that guard never ran for any of them: 15 `/missions/:id/…`
 * routes plus a further 12 keyed on a payment or delegation id were reachable by any
 * authenticated user in team mode.
 *
 * They could not simply adopt the same `router.use`, because each interleaves
 * `/missions/:id/…` with collection paths — `/missions/payments/run-pending`,
 * `/missions/deliveries/retry`, `/missions/delegations/inbound` — that
 * `'/missions/:id'` captures with id='payments' and 404s. Hence per-route guards, and
 * hence this file: per-route attachment is exactly the kind of change where one route
 * gets missed, and nothing but a test says which.
 *
 * ── What these cases prove, and why in this shape ────────────────────────────
 *
 * Against a REAL PostgreSQL and the REAL routers, mounted the way index.ts mounts them.
 * A fake db would let a guard pass that PostgreSQL rejects, and asserting on middleware
 * arrays would prove only that something was attached, not that it refuses anybody.
 *
 * Every case pairs the refusal with its opposite: the owner still gets in, and the solo
 * operator still gets everything. A guard that locks the person who owns the machine out
 * of their own missions is a worse bug than the one being fixed — and it is the failure
 * mode of this particular change, since `missions.missions.created_by` on an existing
 * install holds whichever sentinel resolveUserId picked, not a real user id.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { DatabaseAdapter } from '../../server/db/database.js';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return undefined;
  const m = readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m);
  return m ? m[1].trim() : undefined;
}

const DATABASE_URL = resolveDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

/** Whoever the request says it is — the middleware index.ts mounts, minus the tokens. */
function actingAs(user: { id: string; role: string } | null) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (user) (req as unknown as { user: unknown }).user = user;
    next();
  };
}

d('mission sub-routers — cross-tenant access', () => {
  let db: DatabaseAdapter;
  let app: Express;
  let current: { id: string; role: string } | null = null;

  const alice = `u_test_alice_${randomUUID()}`;
  const bob = `u_test_bob_${randomUUID()}`;
  const alicesMission = `m_test_${randomUUID()}`;
  const bobsMission = `m_test_${randomUUID()}`;
  const bobsPayment = `mp_test_${randomUUID()}`;
  const bobsTask = `mt_test_${randomUUID()}`;
  const alicesTask = `mt_test_${randomUUID()}`;

  let originalMode: string | undefined;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    // missions.created_by is FK -> users(id), so the two tenants must exist first.
    // Random ids, so this fixture cannot collide with a real account on the instance.
    for (const [id, name] of [[alice, 'test-alice'], [bob, 'test-bob']]) {
      await db.run(
        'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)',
        id, `${name}-${id.slice(-8)}`, 'x', 'analyst');
    }
    // Columns verified against information_schema: id, title, objective,
    // success_criteria and created_by are the NOT NULL columns without a default.
    for (const [id, owner] of [[alicesMission, alice], [bobsMission, bob]]) {
      await db.run(
        `INSERT INTO missions.missions (id, title, objective, success_criteria, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        id, 'test mission', 'test objective', 'test criteria', owner);
    }
    for (const [id, mission] of [[bobsTask, bobsMission], [alicesTask, alicesMission]]) {
      await db.run(
        `INSERT INTO missions.mission_tasks (id, mission_id, title, task_type)
         VALUES (?, ?, ?, ?)`,
        id, mission, 'test task', 'llm');
    }
    await db.run(
      `INSERT INTO missions.mission_payments
         (id, mission_id, wallet_id, recipient_address, amount_ftc, category, purpose,
          status, cancel_window_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW() + INTERVAL '1 hour')`,
      bobsPayment, bobsMission, 'w1', 'fc1qtest', 10, 'services', 'test', 'proposed');

    const [payments, delivery, grow, delegation] = await Promise.all([
      import('../../server/routes/mission-payments.js'),
      import('../../server/routes/mission-delivery.js'),
      import('../../server/routes/mission-grow.js'),
      import('../../server/routes/mission-delegation.js'),
    ]);

    app = express();
    app.use(express.json());
    app.use((req, res, next) => actingAs(current)(req, res, next));
    // Same order as index.ts:686-706 — the sub-routers ahead of the generic one.
    app.use('/api', delegation.createMissionDelegationRoutes(db));
    app.use('/api', payments.createMissionPaymentRoutes(db));
    app.use('/api', delivery.createMissionDeliveryRoutes(db));
    app.use('/api', grow.createMissionGrowRoutes(db));
  });

  afterAll(async () => {
    await db.run('DELETE FROM missions.mission_payments WHERE id = ?', bobsPayment).catch(() => {});
    for (const t of [bobsTask, alicesTask]) {
      await db.run('DELETE FROM missions.mission_tasks WHERE id = ?', t).catch(() => {});
    }
    for (const m of [alicesMission, bobsMission]) {
      await db.run('DELETE FROM missions.missions WHERE id = ?', m).catch(() => {});
    }
    for (const u of [alice, bob]) {
      await db.run('DELETE FROM users WHERE id = ?', u).catch(() => {});
    }
    await db.close();
  });

  beforeEach(() => { originalMode = process.env.DEPLOYMENT_MODE; process.env.DEPLOYMENT_MODE = 'team'; });
  afterEach(() => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = originalMode;
  });

  /** Drive the real router stack over a real socket. */
  async function call(method: string, path: string, as: { id: string; role: string } | null, body?: unknown) {
    current = as;
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const port = (server.address() as { port: number }).port;
    try {
      // fetch throws outright if a GET/HEAD carries a body, so the table-driven cases
      // below can pass one uniformly without special-casing each verb.
      const sendsBody = body !== undefined && method !== 'GET' && method !== 'HEAD';
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: sendsBody ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let parsed: unknown = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      return { status: res.status, body: parsed as Record<string, unknown> | null };
    } finally {
      await new Promise((r) => server.close(r));
    }
  }

  const ALICE = { id: alice, role: 'analyst' };
  const ADMIN = { id: 'root', role: 'admin' };

  // ── The mission-id routes, one per sub-router ────────────────────────────

  const MISSION_ROUTES: Array<[string, string]> = [
    ['GET', '/api/missions/%s/financial-settings'],
    ['GET', '/api/missions/%s/payments'],
    ['GET', '/api/missions/%s/deliveries'],
    ['GET', '/api/missions/%s/grow-outputs'],
    ['GET', '/api/missions/%s/delegations'],
  ];

  it.each(MISSION_ROUTES)('%s %s — Alice cannot reach Bob\'s mission', async (method, tpl) => {
    const res = await call(method, tpl.replace('%s', bobsMission), ALICE);
    expect(res.status, `${method} ${tpl} leaked Bob's mission to Alice`).toBe(404);
  });

  it.each(MISSION_ROUTES)('%s %s — Alice still reaches her own', async (method, tpl) => {
    const res = await call(method, tpl.replace('%s', alicesMission), ALICE);
    expect(res.status, `${method} ${tpl} locked Alice out of her own mission`).not.toBe(404);
    expect(res.status).toBeLessThan(500);
  });

  // The writes. Driven with an empty body on purpose: a guard that refuses answers 404
  // before the handler runs, so nothing is created on Bob's mission; and on Alice's own
  // mission the handler rejects the empty body on its own terms, which proves the guard
  // let her through without this test writing rows into the Grow pillar to find out.
  const WRITE_ROUTES: Array<[string, string]> = [
    ['PUT', '/api/missions/%s/financial-settings'],
    ['POST', '/api/missions/%s/payments/propose'],
    ['POST', '/api/missions/%s/deliver'],
    ['POST', '/api/missions/%s/tasks/poll-checkpoints'],
    ['POST', '/api/missions/%s/grow/lead'],
    ['POST', '/api/missions/%s/grow/opportunity'],
    ['POST', '/api/missions/%s/grow/signal'],
    ['POST', '/api/missions/%s/delegate-graph'],
  ];

  it.each(WRITE_ROUTES)('%s %s — Alice cannot write to Bob\'s mission', async (method, tpl) => {
    const res = await call(method, tpl.replace('%s', bobsMission), ALICE, {});
    expect(res.status, `${method} ${tpl} accepted a write against Bob's mission`).toBe(404);
  });

  it.each(WRITE_ROUTES)('%s %s — Alice is not locked out of her own', async (method, tpl) => {
    const res = await call(method, tpl.replace('%s', alicesMission), ALICE, {});
    expect(res.status, `${method} ${tpl} locked Alice out of her own mission`).not.toBe(404);
  });

  it('nothing was written to Bob\'s mission by any of the refused writes', async () => {
    // The assertion the status codes above cannot make: a 404 that still had a side
    // effect would pass every case in this file.
    const grow = await db.get<{ c: string }>(
      'SELECT COUNT(*) AS c FROM missions.mission_activity WHERE mission_id = ?', bobsMission);
    expect(Number(grow?.c ?? 0)).toBe(0);
    const payments = await db.all<{ id: string }>(
      'SELECT id FROM missions.mission_payments WHERE mission_id = ?', bobsMission);
    expect(payments.map((p) => p.id)).toEqual([bobsPayment]);
  });

  it('the 404 for "not yours" is identical to the 404 for "no such mission"', async () => {
    // Otherwise a mission id becomes an existence oracle for another tenant.
    const notYours = await call('GET', `/api/missions/${bobsMission}/payments`, ALICE);
    const noSuch = await call('GET', `/api/missions/m_does_not_exist/payments`, ALICE);
    expect(notYours.status).toBe(noSuch.status);
    expect(notYours.body).toEqual(noSuch.body);
  });

  // ── The resolver guards ──────────────────────────────────────────────────

  it('Alice cannot read Bob\'s payment by its own id', async () => {
    const res = await call('GET', `/api/missions/payments/${bobsPayment}`, ALICE);
    expect(res.status).toBe(404);
  });

  it('Alice cannot APPROVE Bob\'s payment — the worst outcome in these routers', async () => {
    // Approval is what arms real settlement: the 60s tick executes it with no further
    // human touch, and approved_by then attributes the movement to Bob's mission.
    const res = await call('POST', `/api/missions/payments/${bobsPayment}/approve`, ALICE, {});
    expect(res.status).toBe(404);
    const row = await db.get<{ status: string }>(
      'SELECT status FROM missions.mission_payments WHERE id = ?', bobsPayment);
    expect(row?.status, 'the payment changed state despite the 404').toBe('proposed');
  });

  it('Alice cannot CANCEL Bob\'s payment', async () => {
    const res = await call('POST', `/api/missions/payments/${bobsPayment}/cancel`, ALICE, {});
    expect(res.status).toBe(404);
    const row = await db.get<{ status: string }>(
      'SELECT status FROM missions.mission_payments WHERE id = ?', bobsPayment);
    expect(row?.status).toBe('proposed');
  });

  it('a payment id that does not exist answers the same as one that is not yours', async () => {
    const notYours = await call('GET', `/api/missions/payments/${bobsPayment}`, ALICE);
    const noSuch = await call('GET', '/api/missions/payments/mp_nope', ALICE);
    expect(notYours.status).toBe(noSuch.status);
    expect(notYours.body).toEqual(noSuch.body);
  });

  // ── Task-in-mission ──────────────────────────────────────────────────────

  it('a task from another mission cannot be driven through a mission Alice DOES own', async () => {
    // The hole the ownership guard alone does not close: the mission id in the path is
    // Alice's, so the owner check passes, and only the task guard notices that the task
    // belongs to Bob.
    const res = await call('POST',
      `/api/missions/${alicesMission}/tasks/${bobsTask}/delegate`, ALICE, {});
    expect(res.status).toBe(404);
    expect((res.body as { error?: string } | null)?.error).toBe('Task not found');
  });

  it('Alice\'s own task in her own mission gets past both guards', async () => {
    const res = await call('POST',
      `/api/missions/${alicesMission}/tasks/${alicesTask}/delegate`, ALICE, {});
    // Past the guards; the handler then rejects the empty body on its own terms.
    expect(res.status).not.toBe(404);
  });

  // ── Collection routes ────────────────────────────────────────────────────

  it('run-pending and the inbound listings are admin-only in team mode', async () => {
    for (const [method, path] of [
      ['POST', '/api/missions/payments/run-pending'],
      ['POST', '/api/missions/deliveries/retry'],
      ['GET', '/api/missions/delegations/inbound'],
      ['GET', '/api/missions/delegations/peer-suggestions'],
    ] as Array<[string, string]>) {
      const asUser = await call(method, path, ALICE, {});
      expect(asUser.status, `${method} ${path} was not admin-gated`).toBe(403);
      const asAdmin = await call(method, path, ADMIN, {});
      expect(asAdmin.status, `${method} ${path} refused an admin`).not.toBe(403);
    }
  });

  it('collection paths are NOT captured by a mission-id guard', async () => {
    // The regression `router.use('/missions/:id', guard)` would cause: id='payments'
    // and a 404 'Mission not found' instead of the route running. A 403 proves the
    // request reached the admin gate on the real handler, not a mission lookup.
    const res = await call('POST', '/api/missions/payments/run-pending', ALICE, {});
    expect(res.status).toBe(403);
    expect((res.body as { error?: string } | null)?.error).not.toBe('Mission not found');
  });

  // ── Solo mode: the regression that would matter to every existing install ─

  it('solo mode is unchanged — the operator still reaches every mission', async () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    // Rows created_by 'alice'/'bob' are stand-ins for whatever sentinel an existing
    // install stamped. In solo mode none of it is filtered.
    for (const m of [alicesMission, bobsMission]) {
      const res = await call('GET', `/api/missions/${m}/payments`, { id: 'solo', role: 'admin' });
      expect(res.status, 'solo operator locked out of their own mission').not.toBe(404);
    }
    const admin = await call('POST', '/api/missions/payments/run-pending', { id: 'solo', role: 'admin' }, {});
    expect(admin.status).not.toBe(403);
  });

  it('an unidentified caller is refused rather than served', async () => {
    const res = await call('GET', `/api/missions/${alicesMission}/payments`, null);
    expect([401, 403, 404]).toContain(res.status);
  });
});
