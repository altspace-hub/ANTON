/**
 * coding-projects-ownership.test.ts — GET /coding/projects and /coding/projects/:id.
 *
 * Both read endpoints were keyed off nothing at all: the list returned every tenant's
 * coding projects, and the by-id read returned any project to anyone who knew an id.
 * A Studio project carries its kickoff charter in `discovery_summary` — problem
 * statement, jurisdiction, references, risks — so on a `DEPLOYMENT_MODE=team` install
 * that was every user's charter, readable by every other user.
 *
 * These assert on the SQL the route BUILDS, following tests/middleware/ownership.test.ts.
 * An end-to-end request test would be worthless here: ownership.ts deliberately does
 * not scope in solo mode or for admins, and the whole existing suite runs as a solo
 * admin — so a green end-to-end test proves nothing about authorisation. Everything
 * below therefore runs in TEAM mode as a NON-ADMIN, the only configuration where the
 * scoping does anything, and each case is paired with the solo/admin case to prove
 * the fix does not blind a laptop owner to their own projects.
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

/** Records every read the router issues, and answers them permissively. */
function recordingDb(reads: Recorded[], rowExists: () => boolean): DatabaseAdapter {
  return {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      reads.push({ sql, params });
      // Answer the ownership probe according to the scenario; answer the handler's
      // own SELECT with a minimal row so a passing guard still reaches a 200.
      if (/SELECT 1 AS ok/.test(sql)) return (rowExists() ? { ok: 1 } : undefined) as T | undefined;
      return { id: BOB_PROJECT, name: 'bob-project', project_id: 'p-bob' } as T;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      reads.push({ sql, params });
      return [] as T[];
    },
    async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 }; },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
    async close(): Promise<void> {},
  };
}

describe('coding project reads are owner-scoped', () => {
  let server: Server;
  let base = '';
  // One array + one app for the whole file; each test retunes the scenario through
  // the `caller` / `ownershipProbePasses` closures rather than rebuilding the router.
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

  /** The SELECT the list endpoint issued (db.all), not the guard's probe. */
  const listQuery = () => reads.find((r) => /FROM coding_projects cp/.test(r.sql) && /ORDER BY/.test(r.sql));
  /** The ownership probe assertOwned issues (db.get). */
  const ownershipProbe = () => reads.find((r) => /SELECT 1 AS ok/.test(r.sql));

  describe('GET /coding/projects (list)', () => {
    it('filters by the owner IN SQL for a non-admin in team mode', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      const res = await fetch(`${base}/api/coding/projects`);
      expect(res.status).toBe(200);

      const q = listQuery();
      expect(q, 'the list endpoint must have run a query').toBeTruthy();
      // Owner lives on the parent projects row — the same column every other Studio
      // router treats as the owner.
      expect(q!.sql).toContain('p.user_id = ?');
      expect(q!.params).toContain('alice');
    });

    it('still applies the status/tier filters alongside the owner scope', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      await fetch(`${base}/api/coding/projects?status=discovery&tier=large`);

      const q = listQuery()!;
      expect(q.sql).toContain('cp.status = ?');
      expect(q.sql).toContain('cp.tier = ?');
      expect(q.sql).toContain('p.user_id = ?');
      // Order matters: params must line up with the ? positions in the statement.
      expect(q.params).toEqual(['discovery', 'large', 'alice', 20]);
    });

    it('does NOT scope an admin — support and audit paths keep working', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      caller = { id: 'root', username: 'root', role: 'admin' };
      await fetch(`${base}/api/coding/projects`);
      expect(listQuery()!.sql).not.toContain('p.user_id = ?');
    });

    it('does NOT scope in solo mode — a laptop owner keeps every project', async () => {
      // Rows written before ownership existed have no user_id; filtering them out on
      // a single-user machine reads as data loss, which is the worse bug.
      process.env.DEPLOYMENT_MODE = 'solo';
      await fetch(`${base}/api/coding/projects`);
      expect(listQuery()!.sql).not.toContain('p.user_id = ?');
    });
  });

  describe('GET /coding/projects/:id (by id)', () => {
    it('checks ownership in SQL before loading anything', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      await fetch(`${base}/api/coding/projects/${BOB_PROJECT}`);

      const probe = ownershipProbe();
      expect(probe, 'assertOwned must have run an ownership probe').toBeTruthy();
      expect(probe!.sql).toContain('p.user_id = ?');
      expect(probe!.params).toEqual([BOB_PROJECT, 'alice']);
      // The probe must be the FIRST read: a fetch-then-check would have already
      // pulled another tenant's charter into memory.
      expect(reads[0]).toBe(probe);
    });

    it('404s — not 403 — on another user\'s project, and loads nothing', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      ownershipProbePasses = false;
      const res = await fetch(`${base}/api/coding/projects/${BOB_PROJECT}`);
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
      // Only the probe ran — no releases, tasks, reviews or tech-debt reads.
      expect(reads).toHaveLength(1);
    });

    it('gives a foreign project and a missing one the same response', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      ownershipProbePasses = false;
      const foreign = await fetch(`${base}/api/coding/projects/${BOB_PROJECT}`);
      const missing = await fetch(`${base}/api/coding/projects/00000000-0000-0000-0000-000000000000`);
      expect(foreign.status).toBe(missing.status);
      expect(await foreign.json()).toEqual(await missing.json());
    });

    it('lets the owner through — a guard that blocks everyone is an outage', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      const res = await fetch(`${base}/api/coding/projects/${BOB_PROJECT}`);
      expect(res.status).toBe(200);
    });

    it('drops the owner predicate in solo mode (existence check only)', async () => {
      process.env.DEPLOYMENT_MODE = 'solo';
      const res = await fetch(`${base}/api/coding/projects/${BOB_PROJECT}`);
      expect(res.status).toBe(200);
      const probe = ownershipProbe()!;
      expect(probe.sql).not.toContain('user_id');
      expect(probe.params).toEqual([BOB_PROJECT]);
    });
  });
});

/**
 * ── Found by adversarial review: scoping the reads without attributing the writes ──
 *
 * The guards above were added to GET /coding/projects and /:id. But POST
 * /api/coding/projects — the endpoint the Studio UI calls to create a project — still
 * inserted into `projects` WITHOUT user_id, and `projects.user_id` is
 * NOT NULL DEFAULT 'default'.
 *
 * The two halves combine into something worse than the leak they were fixing: every new
 * project is owned by a user who does not exist, and the owner filter then hides it from
 * the person who just created it. A user watches the UI navigate into a project and gets
 * a 404. Scoping reads without attributing writes converts a confidentiality bug into
 * data loss, which is the one outcome a security fix must never produce.
 */
describe('the project WRITER attributes an owner', () => {
  const SRC = readFileSync(join(process.cwd(), 'server/routes/coding-large.ts'), 'utf8');

  it('inserts user_id when creating the parent project', () => {
    const insert = SRC.slice(SRC.indexOf('INSERT INTO projects'));
    expect(insert.slice(0, insert.indexOf('`'))).toContain('user_id');
  });

  it('and that INSERT is syntactically valid SQL', () => {
    // The assertion above is about the SHAPE OF THE SOURCE, and that is exactly how it
    // failed: between 2026-07-28 and 2026-07-29 the statement contained `//` comment
    // lines inside the template literal, so every create 500'd — and `.toContain
    // ('user_id')` passed the whole time, because invalid SQL contains that string just
    // as happily as valid SQL.
    //
    // A `//` anywhere in the statement means a comment leaked into the string. Parsing
    // it for real is in tests/lint/sql-template-literals.test.ts, which needs a database;
    // this cheap check runs everywhere.
    const m = /db\.run\(`([^`]*INSERT INTO projects[^`]*)`/.exec(SRC);
    expect(m, 'INSERT INTO projects not found').toBeTruthy();
    expect(m![1]).not.toMatch(/^\s*\/\//m);
    expect(m![1]).toMatch(/VALUES\s*\(/);
  });

  it('uses the authenticated caller, not the always-undefined req.userId', () => {
    // `(req as any).userId` is never set anywhere — authMiddleware stamps req.user.id.
    // Reading the wrong property is how coding_projects.created_by came to be the
    // literal string 'system' on every row.
    const create = SRC.slice(SRC.indexOf('INSERT INTO projects'), SRC.indexOf('res.json({ id, project_id'));
    expect(create).toContain('req.user?.id');
    expect(create).not.toContain('(req as any).userId');
  });

  it('falls back per COLUMN, because the two owner columns differ', () => {
    // projects.user_id is NOT NULL DEFAULT 'default' — an explicit null still violates
    // the constraint, so the fallback there must be 'default', not null.
    // coding_projects.created_by is nullable with no default, so null is the honest
    // value for "unattributed" and is strictly better than the literal 'system' this
    // code used to write (a sentinel that looks like a real account and matches nobody).
    const projectsInsert = SRC.slice(SRC.indexOf('INSERT INTO projects'), SRC.indexOf('INSERT INTO coding_projects'));
    expect(projectsInsert).toMatch(/req\.user\?\.id \?\? 'default'/);
    expect(projectsInsert).not.toMatch(/req\.user\?\.id \?\? null/);

    const codingInsert = SRC.slice(SRC.indexOf('INSERT INTO coding_projects'), SRC.indexOf('res.json({ id, project_id'));
    expect(codingInsert).toMatch(/req\.user\?\.id \?\? null/);
    expect(codingInsert).not.toContain("'system'");
  });

  it('does not overstate what the by-id guard covers', () => {
    // The sibling routes under /coding/projects/:id are still unscoped. A comment that
    // claims otherwise is worse than no comment — it stops the next reader looking.
    const guard = SRC.slice(SRC.indexOf('// GET /api/coding/projects/:id'), SRC.indexOf("router.get('/coding/projects/:id'"));
    expect(guard).toMatch(/still unscoped|separate pass/i);
  });
});

describe('the workshop attributes the project to its author', () => {
  const ENGINE = readFileSync(join(process.cwd(), 'server/services/coding-workshop-engine.ts'), 'utf8');

  it('prefers the session creator over whoever finalises it', () => {
    // loadOwned lets an admin act on any user's session, so preferring the caller would
    // hand a support admin the project and 404 the user out of their own work.
    expect(ENGINE).toContain("session.userId ?? userId ?? 'default'");
    expect(ENGINE).not.toContain("userId ?? session.userId ?? 'default'");
  });
});
