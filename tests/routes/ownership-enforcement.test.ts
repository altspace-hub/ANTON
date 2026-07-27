/**
 * ownership-enforcement.test.ts — proves the ownership guards are actually WIRED into
 * the routes, not merely that the helper works.
 *
 * This distinction cost me a false sense of security once already today. The existing
 * rerun suite stays green with the guard deleted, because it runs as a solo admin —
 * the case the helper deliberately does not scope. So those tests exercise the route
 * and prove nothing about authorisation.
 *
 * Everything here runs in TEAM mode as a NON-ADMIN, which is the only configuration
 * where the guard does anything. Each case asserts the cross-tenant request is refused
 * AND that the owner's own request still succeeds — a guard that blocks everyone is
 * not a fix, it is an outage.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

/** Same resolver the other DB-backed route suites use: env first, then .env. */
function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const DATABASE_URL = resolveDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

d('ownership guards are enforced on the routes (team mode, non-admin)', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: import('http').Server;
  let base = '';
  let originalMode: string | undefined;

  const ALICE = 'user-alice-' + randomUUID().slice(0, 8);
  const BOB = 'user-bob-' + randomUUID().slice(0, 8);
  let alicesSession = '';
  let bobsSession = '';

  /** The caller identity for the next request — mutated per case. */
  let current = { id: ALICE, username: 'alice', role: 'analyst' };

  beforeAll(async () => {
    originalMode = process.env.DEPLOYMENT_MODE;
    process.env.DEPLOYMENT_MODE = 'team';

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    const { createDiscoveryRoutes } = await import('../../server/routes/discovery.js');

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { user: typeof current }).user = current;
      next();
    });
    app.use('/api', await createDiscoveryRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = originalMode;
    for (const id of [alicesSession, bobsSession]) {
      if (id) await db.run('DELETE FROM discovery_sessions WHERE id = ?', id).catch(() => {});
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  });

  beforeEach(async () => {
    if (!alicesSession) {
      alicesSession = randomUUID();
      bobsSession = randomUUID();
      await db.run(
        `INSERT INTO discovery_sessions (id, tier, state, user_id) VALUES (?, ?, ?, ?)`,
        alicesSession, 'lite', 'active', ALICE,
      ).catch(async () => {
        // Column set varies by migration; fall back to the minimum the guard needs.
        await db.run(`INSERT INTO discovery_sessions (id, user_id) VALUES (?, ?)`, alicesSession, ALICE);
      });
      await db.run(
        `INSERT INTO discovery_sessions (id, tier, state, user_id) VALUES (?, ?, ?, ?)`,
        bobsSession, 'lite', 'active', BOB,
      ).catch(async () => {
        await db.run(`INSERT INTO discovery_sessions (id, user_id) VALUES (?, ?)`, bobsSession, BOB);
      });
    }
    current = { id: ALICE, username: 'alice', role: 'analyst' };
  });

  it('lets Alice through to her OWN session — a guard that blocks the owner is an outage', async () => {
    // Asserted on the status PATCH rather than the GET: the GET reaches the discovery
    // engine, which does real work and would make this a test of the engine's fixture
    // completeness rather than of the guard. PATCH exercises the same router.use guard
    // and then does cheap DB work, so a non-404 here means the guard let her past.
    const res = await fetch(`${base}/api/discovery/sessions/${alicesSession}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).not.toBe(404);
  });

  it('refuses Alice access to BOB\'s discovery session', async () => {
    const res = await fetch(`${base}/api/discovery/sessions/${bobsSession}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 — not 403 — so the id cannot confirm the session exists', async () => {
    const real = await fetch(`${base}/api/discovery/sessions/${bobsSession}`);
    const fake = await fetch(`${base}/api/discovery/sessions/${randomUUID()}`);
    expect(real.status).toBe(404);
    expect(fake.status).toBe(404);
    expect(await real.json()).toEqual(await fake.json());   // indistinguishable
  });

  it('refuses a cross-tenant DELETE — the destructive case', async () => {
    const res = await fetch(`${base}/api/discovery/sessions/${bobsSession}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    const still = await db.get('SELECT id FROM discovery_sessions WHERE id = ?', bobsSession);
    expect(still).toBeTruthy();             // Bob's row survived
  });

  it('refuses a cross-tenant status PATCH', async () => {
    const res = await fetch(`${base}/api/discovery/sessions/${bobsSession}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'complete' }) });
    expect(res.status).toBe(404);
  });

  it('guards EVERY :id sub-route, including ones added later', async () => {
    // The guard is a single router.use over the id prefix precisely so a new handler
    // cannot ship without it. Spot-check several distinct sub-paths.
    for (const path of ['insights', 'output', 'start']) {
      const res = await fetch(`${base}/api/discovery/sessions/${bobsSession}/${path}`);
      expect(res.status, `sub-route ${path} must be guarded`).toBe(404);
    }
  });

  it('an admin is NOT scoped — support and audit paths keep working', async () => {
    current = { id: 'someone-else', username: 'admin', role: 'admin' };
    const res = await fetch(`${base}/api/discovery/sessions/${bobsSession}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).not.toBe(404);
  });
});
