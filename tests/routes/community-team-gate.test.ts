/**
 * community-team-gate.test.ts — the Community pillar is single-identity-per-instance,
 * so on a team install it is admin-only.
 *
 * There is exactly ONE community identity per ANTON: `community_identity.user_id` is
 * `NOT NULL DEFAULT 'default' UNIQUE` (migrations-pg/077:18) and every query in
 * routes/community.ts pins user_id / owner_user_id / creator_user_id to that 'default'
 * sentinel. That is a design — the contact hash and the Ed25519 / X25519 keys peers
 * verify belong to the instance, and a peer ANTON cannot address one colleague inside
 * another instance — so the fix is NOT to scope those rows per user. It is to stop a
 * non-admin acting AS the instance:
 *
 *   - PATCH /community/identity re-points payment_address / agent_wallet_address —
 *     the addresses every contact pays;
 *   - the mail routes read the one shared mailbox and send SIGNED AS the identity, so
 *     the recipient attributes a colleague's message to whoever activated it;
 *   - connection accept/decline admits contacts on the whole instance's behalf.
 *
 * Two halves have to hold together, and only one of them is about security:
 *
 *   1. TEAM mode: a viewer/analyst is refused and NOTHING reaches the database.
 *   2. SOLO mode: unchanged. requireAdminOrSolo is a pass-through there, and solo is
 *      the default for every laptop install — a guard that 403s the sole operator out
 *      of their own mailbox would be a worse bug than the one being fixed.
 *
 * Part A is the wiring, which is where this class of fix actually fails: Express runs
 * middleware in REGISTRATION order, so a community router mounted above the guard
 * never reaches it, and the guard would sit in index.ts looking correct forever.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { DatabaseAdapter } from '../../server/db/database.js';

// ── Part A: the guard is wired ABOVE every router serving /community/* ──────────

describe('index.ts wiring', () => {
  const indexSrc = readFileSync(join(process.cwd(), 'server', 'index.ts'), 'utf8');
  const lines = indexSrc.split('\n');
  const gateLine = lines.findIndex((l) =>
    /^app\.use\('\/api\/community',\s*requireAdminOrSolo\)/.test(l.trim()));

  it("mounts requireAdminOrSolo on the '/api/community' prefix", () => {
    expect(gateLine, "app.use('/api/community', requireAdminOrSolo) not found in server/index.ts").toBeGreaterThan(-1);
  });

  /**
   * Every route file that registers a /community/... path, discovered rather than
   * listed: a sixth community router added later must also be mounted below the gate,
   * and this fails until it is.
   */
  const communityRouteFiles = readdirSync(join(process.cwd(), 'server', 'routes'))
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => /router\.(get|post|patch|put|delete)\(\s*['"]\/community[/'"]/
      .test(readFileSync(join(process.cwd(), 'server', 'routes', f), 'utf8')));

  it('finds the community routers (sanity — the discovery itself must not silently match nothing)', () => {
    expect(communityRouteFiles.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of communityRouteFiles) {
    it(`mounts ${file} below the gate`, () => {
      const src = readFileSync(join(process.cwd(), 'server', 'routes', file), 'utf8');
      const factory = src.match(/export\s+(?:async\s+)?function\s+(create\w+Routes)/)?.[1];
      expect(factory, `no create*Routes export in ${file}`).toBeTruthy();
      const mountLine = lines.findIndex((l) => l.trim().startsWith('app.use(') && l.includes(`${factory}(`));
      expect(mountLine, `${factory} is never mounted in index.ts`).toBeGreaterThan(-1);
      // Registered BEFORE the guard ⇒ requests to it never run the guard.
      expect(mountLine).toBeGreaterThan(gateLine);
    });
  }
});

// ── Part B/C: the guard's behaviour on the real routes ─────────────────────────

/** Records every write so a test can assert what did NOT reach the database. */
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

const VIEWER = { id: 'user-viewer', username: 'viewer', role: 'viewer' };
const ANALYST = { id: 'user-analyst', username: 'analyst', role: 'analyst' };
const ADMIN = { id: 'user-admin', username: 'admin', role: 'admin' };
const SOLO = { id: 'solo', username: 'solo', role: 'admin' };

describe('/api/community behind requireAdminOrSolo', () => {
  let server: import('http').Server;
  let base = '';
  let runs: Array<{ sql: string; params: unknown[] }>;
  let originalMode: string | undefined;
  let current: { id: string; username: string; role: string } = ADMIN;

  beforeAll(async () => {
    originalMode = process.env.DEPLOYMENT_MODE;
    // middleware/auth throws at import when JWT_SECRET is unset (solo dev envs).
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-community-team-gate';

    const { requireAdminOrSolo } = await import('../../server/middleware/role-guards.js');
    const { createCommunityRoutes } = await import('../../server/routes/community.js');
    const { createTaskDelegationRoutes } = await import('../../server/routes/task-delegation.js');

    const rec = recordingDb();
    runs = rec.runs;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as unknown as { user: typeof current }).user = current; next(); });
    // Same composition as server/index.ts: the prefix guard, then the routers.
    app.use('/api/community', requireAdminOrSolo);
    app.use('/api', await createCommunityRoutes(rec.db));
    app.use('/api', await createTaskDelegationRoutes(rec.db));

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

  beforeEach(() => { runs.length = 0; });

  const patchIdentity = (body: unknown) => fetch(`${base}/api/community/identity`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  describe('team mode', () => {
    beforeEach(() => { process.env.DEPLOYMENT_MODE = 'team'; });

    it('refuses a viewer re-pointing the instance payment address, and writes nothing', async () => {
      current = VIEWER;
      const res = await patchIdentity({ payment_address: 'FTC-attacker-address' });
      expect(res.status).toBe(403);
      expect(runs.filter((r) => /UPDATE community_identity/i.test(r.sql))).toHaveLength(0);
    });

    it('refuses an analyst reading the shared mailbox', async () => {
      current = ANALYST;
      const res = await fetch(`${base}/api/community/mail`);
      expect(res.status).toBe(403);
    });

    it('refuses an analyst accepting a connection on the instance behalf', async () => {
      current = ANALYST;
      const res = await fetch(`${base}/api/community/connections/conn-1/accept`, { method: 'POST' });
      expect(res.status).toBe(403);
      expect(runs.filter((r) => /UPDATE community_connections/i.test(r.sql))).toHaveLength(0);
    });

    it('covers the task-delegation router too (same /community prefix, different file)', async () => {
      current = VIEWER;
      const res = await fetch(`${base}/api/community/connections/conn-1/delegation`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegation_trust_level: 'auto' }),
      });
      expect(res.status).toBe(403);
      expect(runs).toHaveLength(0);
    });

    it('still lets an admin manage the identity', async () => {
      current = ADMIN;
      const res = await patchIdentity({ display_name: 'Instance' });
      expect(res.status).toBe(200);
      expect(runs.some((r) => /UPDATE community_identity/i.test(r.sql))).toBe(true);
    });
  });

  describe('solo mode (the default — must be untouched)', () => {
    beforeEach(() => { delete process.env.DEPLOYMENT_MODE; });

    it('lets the solo operator update the identity', async () => {
      current = SOLO;
      const res = await patchIdentity({ payment_address: 'FTC-my-own-address' });
      expect(res.status).toBe(200);
      expect(runs.some((r) => /UPDATE community_identity/i.test(r.sql))).toBe(true);
    });

    it('lets the solo operator read the mailbox', async () => {
      current = SOLO;
      expect((await fetch(`${base}/api/community/mail`)).status).toBe(200);
    });

    it('does not scope on role in solo — a non-admin identity still gets through', async () => {
      // Belt and braces: authMiddleware stamps role 'admin' in solo, but nothing in the
      // guard may depend on that. A solo install whose users row says 'viewer' (an
      // instance switched back from team) must still reach its own community data.
      current = VIEWER;
      expect((await fetch(`${base}/api/community/mail`)).status).toBe(200);
    });
  });
});

// ── The enum the delegation route writes ───────────────────────────────────────

/**
 * delegation_trust_level decides whether an INBOUND task from a contact is processed
 * with no human review (task-auto-processor.ts:102), and import_policy whether a peer's
 * pushed knowledge is accepted (p2p.ts:47). Both were written straight from the body.
 */
describe('PATCH /community/connections/:id/delegation — enum allowlist', () => {
  let server: import('http').Server;
  let base = '';
  let runs: Array<{ sql: string; params: unknown[] }>;
  let originalMode: string | undefined;

  beforeAll(async () => {
    originalMode = process.env.DEPLOYMENT_MODE;
    delete process.env.DEPLOYMENT_MODE;             // solo: the guard is a pass-through
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-community-team-gate';
    const { createTaskDelegationRoutes } = await import('../../server/routes/task-delegation.js');
    const rec = recordingDb();
    runs = rec.runs;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as unknown as { user: typeof SOLO }).user = SOLO; next(); });
    app.use('/api', await createTaskDelegationRoutes(rec.db));
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

  beforeEach(() => { runs.length = 0; });

  const patchDelegation = (body: unknown) => fetch(`${base}/api/community/connections/conn-1/delegation`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  it('refuses an unknown trust level, and writes nothing', async () => {
    for (const trust of ['always', 'AUTO', 'auto; drop', '']) {
      runs.length = 0;
      const res = await patchDelegation({ delegation_trust_level: trust, endpoint: undefined });
      if (trust === '') {
        // Falsy has always meant "leave unchanged" — it must not become a 400.
        expect(res.status, `trust ${JSON.stringify(trust)}`).toBe(200);
      } else {
        expect(res.status, `trust ${JSON.stringify(trust)}`).toBe(400);
      }
      expect(runs.filter((r) => /delegation_trust_level/i.test(r.sql)), `trust ${JSON.stringify(trust)}`).toHaveLength(0);
    }
  });

  it('refuses an unknown import policy, and writes nothing', async () => {
    const res = await patchDelegation({ import_policy: 'accept_everything' });
    expect(res.status).toBe(400);
    expect(runs).toHaveLength(0);
  });

  it('still accepts each of the three real trust levels', async () => {
    for (const trust of ['manual', 'trusted', 'auto']) {
      runs.length = 0;
      const res = await patchDelegation({ delegation_trust_level: trust });
      expect(res.status, `trust ${trust}`).toBe(200);
      expect(runs.some((r) => /delegation_trust_level = \?/.test(r.sql) && r.params.includes(trust)), `trust ${trust}`).toBe(true);
    }
  });

  it('still accepts each of the three real import policies, and the UI pair together', async () => {
    for (const policy of ['auto_accept', 'ask_first', 'block']) {
      runs.length = 0;
      const res = await patchDelegation({ delegation_trust_level: 'trusted', import_policy: policy });
      expect(res.status, `policy ${policy}`).toBe(200);
      expect(runs.some((r) => r.params.includes(policy)), `policy ${policy}`).toBe(true);
    }
  });
});
