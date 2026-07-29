/**
 * coding-projects-sibling-ownership.test.ts — the 56 sibling routes under
 * /coding/projects/:id.
 *
 * A previous pass scoped exactly two endpoints: GET /coding/projects (list) and
 * GET /coding/projects/:id (the aggregate read). Its own comment said plainly that
 * everything else hanging off /coding/projects/:id was still open, and it was: PATCH
 * the project, read and write releases, read and write tasks, create expert reviews,
 * read and write tech debt, run the configured build/test command, and DELETE the
 * project — all keyed off the path id alone.
 *
 * That made the aggregate guard close to decorative on a `DEPLOYMENT_MODE=team`
 * install. The kickoff charter it protected (`discovery_summary` — problem statement,
 * jurisdiction, references, risks) is echoed back verbatim by
 * POST /:id/discovery, POST /:id/architecture, POST /:id/alignment-check and
 * POST /:id/rediscovery, so any authenticated user could read another user's charter
 * by asking a different question. DELETE /:id would drop their project and its private
 * Postgres database.
 *
 * WHY THESE ASSERT ON THE GUARD, NOT ON AN END-TO-END OUTCOME
 * ownership.ts deliberately does not scope in solo mode or for admins, and the rest of
 * the suite runs as a solo admin — so a green end-to-end test proves nothing about
 * authorisation and would pass against completely unscoped code. Every case below
 * therefore runs in TEAM mode as a NON-ADMIN, the only configuration where the scoping
 * does anything, and the deny cases assert that the refusal happened BEFORE any data
 * was read, which is the property that actually matters.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = 'c'.repeat(64);

const ALICE = { id: 'alice', username: 'alice', role: 'analyst' };
const BOB_PROJECT = '11111111-2222-3333-4444-555555555555';

interface Recorded { sql: string; params: unknown[] }

/**
 * Every sibling route under /coding/projects/:id, as method + concrete path.
 *
 * Kept as a literal list rather than derived from the source, so that a route which
 * silently loses its guard still gets exercised here. The source-derived completeness
 * check further down is the other half: it fails when a route is ADDED without a
 * guard, which a literal list alone can never catch.
 */
const SIBLING_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ['PATCH', ''],
  ['DELETE', ''],
  ['POST', '/baseline'],
  ['POST', '/baseline/save'],
  ['GET', '/baseline'],
  ['POST', '/discovery'],
  ['POST', '/discovery/finalize'],
  ['POST', '/architecture'],
  ['POST', '/architecture/review'],
  ['PATCH', '/architecture'],
  ['POST', '/estimate'],
  ['GET', '/releases'],
  ['POST', '/releases'],
  ['GET', '/releases/r1'],
  ['PATCH', '/releases/r1'],
  ['POST', '/releases/r1/plan'],
  ['GET', '/tasks'],
  ['POST', '/tasks'],
  ['GET', '/tasks/t1'],
  ['PATCH', '/tasks/t1'],
  ['POST', '/tasks/t1/plan'],
  ['POST', '/tasks/t1/execute'],
  ['POST', '/tasks/t1/complete'],
  ['POST', '/tasks/t1/revise'],
  ['POST', '/tasks/t1/apply/preview'],
  ['GET', '/workspace'],
  ['PUT', '/workspace'],
  ['POST', '/workspace/provision'],
  ['PUT', '/test-command'],
  ['GET', '/atoms'],
  ['GET', '/container/probe'],
  ['POST', '/container/mode'],
  ['GET', '/toolchain'],
  ['GET', '/commands'],
  ['PUT', '/commands/test'],
  ['POST', '/commands/apply-preset'],
  ['POST', '/commands/test/run'],
  ['GET', '/applications'],
  ['GET', '/applications/a1'],
  ['POST', '/applications/a1/approve'],
  ['POST', '/applications/a1/reject'],
  ['POST', '/tests/run'],
  ['GET', '/tests'],
  ['POST', '/tests'],
  ['GET', '/tech-debt'],
  ['POST', '/tech-debt'],
  ['PATCH', '/tech-debt/td1'],
  ['GET', '/changes'],
  ['POST', '/changes'],
  ['POST', '/changes/c1/impact'],
  ['PATCH', '/changes/c1'],
  ['GET', '/cost'],
  ['GET', '/activity'],
  ['POST', '/alignment-check'],
  ['POST', '/operational-readiness'],
  ['POST', '/rediscovery'],
] as const;

/** Records every statement the router issues, and answers them permissively. */
function recordingDb(reads: Recorded[], rowExists: () => boolean): DatabaseAdapter {
  return {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      reads.push({ sql, params });
      if (/SELECT 1 AS ok/.test(sql)) return (rowExists() ? { ok: 1 } : undefined) as T | undefined;
      return { id: BOB_PROJECT, name: 'bob-project', project_id: 'p-bob' } as T;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      reads.push({ sql, params });
      return [] as T[];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      reads.push({ sql, params });
      return { changes: 0, lastInsertRowid: 0 };
    },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
    async close(): Promise<void> {},
  };
}

describe('every /coding/projects/:id sibling route is owner-scoped', () => {
  let server: Server;
  let base = '';
  const reads: Recorded[] = [];
  let caller: { id: string; username: string; role: string };
  let ownershipProbePasses = true;
  let savedMode: string | undefined;

  beforeAll(async () => {
    savedMode = process.env.DEPLOYMENT_MODE;
    const { createCodingLargeRoutes } = await import('../../server/routes/coding-large.js');
    const router = await createCodingLargeRoutes(
      recordingDb(reads, () => ownershipProbePasses),
      { serverDsn: 'postgresql://anton:anton@localhost:5432/anton' },
    );

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = caller;
      next();
    });
    app.use('/api', router);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no addr');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = savedMode;
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  beforeEach(() => {
    reads.length = 0;
    caller = { ...ALICE };
    ownershipProbePasses = true;
  });

  const call = (method: string, suffix: string) => fetch(
    `${base}/api/coding/projects/${BOB_PROJECT}${suffix}`,
    { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' },
  );

  /** The ownership probe assertOwned issues. */
  const ownershipProbe = () => reads.find((r) => /SELECT 1 AS ok/.test(r.sql));

  describe.each(SIBLING_ROUTES)('%s /coding/projects/:id%s', (method, suffix) => {
    it('refuses another user with 404, having read nothing else', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      ownershipProbePasses = false;

      const res = await call(method, suffix);

      expect(res.status, `${method} ${suffix} must 404 a foreign project`).toBe(404);
      // 403 would confirm the row exists and belongs to somebody else — an id oracle.
      expect(res.status).not.toBe(403);
      // The probe must be the ONLY statement: a fetch-then-compare would already have
      // pulled the charter into memory, and a mutating route would already have written.
      expect(
        reads.map((r) => r.sql.replace(/\s+/g, ' ').trim()),
        `${method} ${suffix} touched the database beyond the ownership probe`,
      ).toHaveLength(1);
      expect(ownershipProbe()).toBeTruthy();
    });

    it('checks ownership IN SQL, against projects.user_id, before anything else', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      // Deliberately the DENY path again. Letting the guard pass here would run the
      // real handler for all 56 routes — provisioning databases, mkdir-ing workspaces
      // and spawning build commands. The refusal path exercises exactly the statement
      // under test (the scoped probe) and nothing else.
      ownershipProbePasses = false;

      await call(method, suffix);

      const probe = ownershipProbe();
      expect(probe, `${method} ${suffix} ran no ownership probe`).toBeTruthy();
      expect(probe!.sql).toContain('p.user_id = ?');
      expect(probe!.sql).toContain('cp.id = ?');
      expect(probe!.params).toEqual([BOB_PROJECT, 'alice']);
      expect(reads[0], `${method} ${suffix} read something before the guard`).toBe(probe);
    });
  });

  describe('the properties ownership.ts documents are preserved', () => {
    it('does NOT scope an admin — support and audit paths keep working', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      caller = { id: 'root', username: 'root', role: 'admin' };
      await call('GET', '/releases');
      const probe = ownershipProbe()!;
      expect(probe.sql).not.toContain('user_id');
      expect(probe.params).toEqual([BOB_PROJECT]);
    });

    it('does NOT scope in solo mode — a laptop owner keeps their own project', async () => {
      process.env.DEPLOYMENT_MODE = 'solo';
      const res = await call('GET', '/releases');
      expect(res.status).toBe(200);
      const probe = ownershipProbe()!;
      expect(probe.sql).not.toContain('user_id');
      expect(probe.params).toEqual([BOB_PROJECT]);
    });

    it('lets the owner through — a guard that blocks everyone is an outage', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      const res = await call('GET', '/releases');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('gives a foreign project and a missing one the same reply on a sibling', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      ownershipProbePasses = false;
      const foreign = await call('GET', '/tasks');
      reads.length = 0;
      const missing = await fetch(`${base}/api/coding/projects/00000000-0000-0000-0000-000000000000/tasks`);
      // Pinned to 404 explicitly: "same status" alone is also true of an unscoped
      // route that answers 200 to both, which is the bug this file exists to prevent.
      expect(foreign.status).toBe(404);
      expect(foreign.status).toBe(missing.status);
      expect(await foreign.json()).toEqual(await missing.json());
    });
  });
});

/**
 * ── Completeness, derived from the source ────────────────────────────────────
 *
 * The request-driven cases above can only cover routes somebody remembered to list.
 * This block reads the router and fails when ANY handler registered under
 * /coding/projects/:id lacks the guard — including one added next year.
 */
describe('no /coding/projects/:id route ships without the guard', () => {
  const SRC = readFileSync(join(process.cwd(), 'server/routes/coding-large.ts'), 'utf8');
  const REGISTRATION = /router\.(get|post|patch|put|delete)\('(\/coding\/projects\/:id[^']*)'/g;

  /** The handler body for a registration, by brace-matching from its arrow. */
  function handlerBody(startIndex: number): string {
    const open = SRC.indexOf('{', SRC.indexOf('=>', startIndex));
    let depth = 0;
    for (let i = open; i < SRC.length; i++) {
      if (SRC[i] === '{') depth++;
      else if (SRC[i] === '}') { depth--; if (depth === 0) return SRC.slice(open, i + 1); }
    }
    throw new Error(`unbalanced handler body at ${startIndex}`);
  }

  const handlers = [...SRC.matchAll(REGISTRATION)].map((m) => ({
    route: `${m[1].toUpperCase()} ${m[2]}`,
    body: handlerBody(m.index!),
  }));

  it('found every registration (the regex still matches the file)', () => {
    // If a refactor changes how routes are registered this number moves and the
    // per-route assertion below would otherwise pass vacuously over zero handlers.
    expect(handlers).toHaveLength(57);
  });

  it.each(handlers.map((h) => [h.route, h.body] as const))('%s guards ownership', (route, body) => {
    const guarded = /ensureCodingProject\(db, req, res\)/.test(body)
      || /assertOwned\(db, req as OwnedRequest, res/.test(body);
    expect(guarded, `${route} has no ownership guard`).toBe(true);
  });

  it('guards BEFORE reading the project, on every route that reads one', () => {
    // Ordering is the property that makes the 404 honest: fetch-then-compare would
    // already have loaded another tenant's charter (and logged it on an error path).
    const offenders = handlers
      .filter((h) => h.body.includes('FROM coding_projects'))
      .filter((h) => {
        const guard = h.body.search(/ensureCodingProject\(db, req, res\)|assertOwned\(db, req as OwnedRequest, res/);
        return guard === -1 || guard > h.body.indexOf('FROM coding_projects');
      })
      .map((h) => h.route);
    expect(offenders).toEqual([]);
  });
});

/**
 * ── The same claim, against a real PostgreSQL ────────────────────────────────
 *
 * Everything above asserts on the SQL the router builds, which is the only way to see
 * scoping that solo mode correctly switches off. This block is the complement: two real
 * projects owned by two real user ids, and a non-admin asking for the other one.
 *
 * It is worth more than the recorded-SQL cases because it cannot be satisfied by a guard
 * that merely RUNS — the row genuinely exists, genuinely belongs to Bob, and Alice
 * genuinely must not get it. Each mutating case also re-reads Bob's row afterwards to
 * prove the write did not land, which a status-code assertion alone would miss.
 *
 * Skips when DATABASE_URL is absent (the convention the other DB-backed suites use).
 */
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
const dbDescribe = DATABASE_URL ? describe : describe.skip;

dbDescribe("a non-admin is refused another user's coding project (real Postgres)", () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';
  let savedMode: string | undefined;

  const tag = Math.random().toString(36).slice(2, 10);
  const ALICE_ID = `alice-${tag}`;
  const BOB_ID = `bob-${tag}`;
  const bobParent = `p-bob-${tag}`;
  const bobCoding = `cp-bob-${tag}`;
  const aliceParent = `p-alice-${tag}`;
  const aliceCoding = `cp-alice-${tag}`;
  /** The thing the leak actually exposed. */
  const BOB_CHARTER = `CONFIDENTIAL-CHARTER-${tag}: jurisdiction SE, sanctions exposure`;

  let current = { id: ALICE_ID, username: 'alice', role: 'analyst' };

  beforeAll(async () => {
    savedMode = process.env.DEPLOYMENT_MODE;
    process.env.DEPLOYMENT_MODE = 'team';

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    await db.run("INSERT INTO projects (id, name, status, user_id) VALUES (?, ?, 'active', ?)", bobParent, 'bob parent', BOB_ID);
    await db.run("INSERT INTO projects (id, name, status, user_id) VALUES (?, ?, 'active', ?)", aliceParent, 'alice parent', ALICE_ID);
    await db.run(
      "INSERT INTO coding_projects (id, project_id, name, tier, status, discovery_summary) VALUES (?, ?, ?, 'large', 'discovery', ?)",
      bobCoding, bobParent, 'bob project', BOB_CHARTER,
    );
    await db.run(
      "INSERT INTO coding_projects (id, project_id, name, tier, status) VALUES (?, ?, ?, 'large', 'discovery')",
      aliceCoding, aliceParent, 'alice project',
    );

    const { createCodingLargeRoutes } = await import('../../server/routes/coding-large.js');
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = current;
      next();
    });
    app.use('/api', await createCodingLargeRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no addr');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = savedMode;
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    for (const id of [bobCoding, aliceCoding]) {
      await db?.run('DELETE FROM coding_projects WHERE id = ?', id).catch(() => {});
    }
    for (const id of [bobParent, aliceParent]) {
      await db?.run('DELETE FROM projects WHERE id = ?', id).catch(() => {});
    }
    await db?.close().catch(() => {});
  });

  beforeEach(() => { current = { id: ALICE_ID, username: 'alice', role: 'analyst' }; });

  const asCaller = (method: string, path: string, body?: unknown) => fetch(`${base}/api/coding/projects/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });

  it("refuses to read the other user's tasks, releases and tech debt", async () => {
    for (const rail of ['tasks', 'releases', 'tech-debt', 'changes', 'tests', 'cost', 'activity']) {
      const res = await asCaller('GET', `${bobCoding}/${rail}`);
      expect(res.status, `GET /${rail} leaked`).toBe(404);
    }
  });

  it("never echoes the other user's charter back through a phase endpoint", async () => {
    // POST /discovery and /architecture interpolate discovery_summary into the prompt
    // they return, so an unscoped route hands the charter over verbatim.
    for (const phase of ['discovery', 'architecture', 'alignment-check', 'rediscovery']) {
      const res = await asCaller('POST', `${bobCoding}/${phase}`, { scope: 'x' });
      expect(res.status, `POST /${phase} leaked`).toBe(404);
      expect(await res.text()).not.toContain(BOB_CHARTER);
    }
  });

  it('does not write when it refuses a PATCH', async () => {
    const res = await asCaller('PATCH', bobCoding, { name: 'hijacked', discovery_summary: 'overwritten' });
    expect(res.status).toBe(404);
    const row = await db.get<{ name: string; discovery_summary: string }>(
      'SELECT name, discovery_summary FROM coding_projects WHERE id = ?', bobCoding);
    expect(row?.name).toBe('bob project');
    expect(row?.discovery_summary).toBe(BOB_CHARTER);
  });

  it("does not create a release or tech debt on the other user's project", async () => {
    expect((await asCaller('POST', `${bobCoding}/releases`, { name: 'R1' })).status).toBe(404);
    expect((await asCaller('POST', `${bobCoding}/tech-debt`, { title: 'planted' })).status).toBe(404);
    expect(await db.all('SELECT id FROM coding_releases WHERE coding_project_id = ?', bobCoding)).toHaveLength(0);
    expect(await db.all('SELECT id FROM coding_tech_debt WHERE coding_project_id = ?', bobCoding)).toHaveLength(0);
  });

  it("does not DELETE the other user's project", async () => {
    const res = await asCaller('DELETE', bobCoding);
    expect(res.status).toBe(404);
    const still = await db.get('SELECT id FROM coding_projects WHERE id = ?', bobCoding);
    expect(still, "Bob's project was deleted by Alice").toBeTruthy();
  });

  it('still serves Alice her OWN project — the guard is not an outage', async () => {
    const res = await asCaller('GET', `${aliceCoding}/tasks`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("still serves an admin the other user's project — support paths keep working", async () => {
    current = { id: 'root', username: 'root', role: 'admin' };
    const res = await asCaller('GET', `${bobCoding}/tasks`);
    expect(res.status).toBe(200);
  });
});
