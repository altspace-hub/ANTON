/**
 * coding-task-release-scoping.test.ts — child ids from the request BODY are not scoped
 * by the guard on :id, and a status union wider than its column is a live bug.
 *
 * Two defects, found by an adversarial reviewer and reproduced against a real database
 * with two tenants before anything was changed:
 *
 * 1. CROSS-TENANT WRITE. `POST /coding/projects/:id/tasks` took `coding_release_id` from
 *    the body and never checked it belonged to `:id`. ensureCodingProject proves you own
 *    the project in the URL — which the attacker does, it is their own — and says nothing
 *    about a release id they typed. The inserted row carried the attacker's
 *    coding_project_id and the victim's coding_release_id, so it was invisible in the
 *    attacker's own project and showed up in the victim's `GET /releases/:rid`, which
 *    lists tasks by release id. Completing it also drove the victim's release to 'review',
 *    because the completion rollup counted by release id alone.
 *
 * 2. GUARANTEED 500. `POST /coding/projects/:id/tasks/:tid/plan` wrote
 *    `status = 'planning'`. coding_tasks_status_check has never permitted that value, so
 *    the UPDATE threw and the handler's bare catch reported "Failed to plan task" — to
 *    every user, owner included, not just an attacker. The value was not invented at
 *    random: src/lib/coding-types.ts declared 'planning' a task status. It disagreed with
 *    both server/types/coding.ts and the column, and the code trusted the type.
 *
 * The HTTP cases below run the REAL router and assert on what it does, not on how the
 * source reads — deleting the fix makes them fail because no probe is issued and no 404
 * is returned. The last block asks PostgreSQL directly, since the constraint is the only
 * authority on which statuses exist.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = 'c'.repeat(64);

const ALICE = { id: 'alice', username: 'alice', role: 'admin' };
const MY_PROJECT = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const MY_RELEASE = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';
const FOREIGN_RELEASE = 'cccccccc-3333-3333-3333-cccccccccccc';

interface Recorded { sql: string; params: unknown[] }

/**
 * Answers reads as the database would for a caller who owns MY_PROJECT and MY_RELEASE
 * but not FOREIGN_RELEASE, and records every write so the assertions can inspect them.
 */
function scenarioDb(reads: Recorded[], writes: Recorded[]): DatabaseAdapter {
  return {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      reads.push({ sql, params });
      if (/SELECT 1 AS ok/.test(sql)) return { ok: 1 } as T;             // caller owns :id

      // The release-ownership probe the fix introduces. It is the ONLY read that selects
      // from coding_releases filtered by both a release id and a project id.
      if (/FROM coding_releases/.test(sql) && /coding_project_id/.test(sql)) {
        return (params[0] === FOREIGN_RELEASE ? undefined : { id: params[0] }) as T | undefined;
      }
      if (/COUNT\(\*\)/.test(sql)) return { c: 0, count: 0 } as T;
      if (/FROM coding_tasks/.test(sql)) {
        return { id: 'task-1', title: 't', coding_release_id: MY_RELEASE, coding_project_id: MY_PROJECT } as T;
      }
      if (/FROM coding_projects/.test(sql)) return { id: MY_PROJECT, name: 'mine', project_id: 'p-alice' } as T;
      return { id: params[0] } as T;
    },
    async all<T>(): Promise<T[]> { return [] as T[]; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      writes.push({ sql, params });
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
    async close(): Promise<void> {},
  };
}

describe('a task cannot be written into another project\'s release', () => {
  let server: Server;
  let base = '';
  const reads: Recorded[] = [];
  const writes: Recorded[] = [];

  beforeAll(async () => {
    const { createCodingLargeRoutes } = await import('../../server/routes/coding-large.js');
    const router = await createCodingLargeRoutes(
      scenarioDb(reads, writes),
      { serverDsn: 'postgresql://anton:anton@localhost:5432/anton' },
    );
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = ALICE;
      next();
    });
    app.use('/api', router);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no addr');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  beforeEach(() => { reads.length = 0; writes.length = 0; });

  const post = (path: string, body: unknown) =>
    fetch(`${base}/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const taskInsert = () => writes.find((w) => /INSERT INTO coding_tasks/.test(w.sql));

  it('rejects a release id belonging to a different project', async () => {
    const res = await post(`/coding/projects/${MY_PROJECT}/tasks`, {
      coding_release_id: FOREIGN_RELEASE,
      title: 'INJECTED',
    });

    expect(res.status).toBe(404);
    // The load-bearing assertion: nothing was written. A 404 with the row already
    // inserted would be the same bug wearing a different status code.
    expect(taskInsert(), 'no task row may be inserted for a foreign release').toBeUndefined();
  });

  it('still accepts a release the caller owns', async () => {
    // Paired with the case above: a guard that rejects everything would pass that test
    // and break the feature outright.
    const res = await post(`/coding/projects/${MY_PROJECT}/tasks`, {
      coding_release_id: MY_RELEASE,
      title: 'legitimate task',
    });

    expect(res.status).toBe(200);
    const insert = taskInsert();
    expect(insert, 'an owned release must still create a task').toBeTruthy();
    expect(insert!.params).toContain(MY_RELEASE);
    expect(insert!.params).toContain(MY_PROJECT);
  });

  it('checks the release against the project id from the URL, not the body', async () => {
    await post(`/coding/projects/${MY_PROJECT}/tasks`, {
      coding_release_id: MY_RELEASE,
      title: 't',
      // A body that tries to talk its way past the check.
      coding_project_id: FOREIGN_RELEASE,
      id: FOREIGN_RELEASE,
    });

    const probe = reads.find((r) => /FROM coding_releases/.test(r.sql) && /coding_project_id/.test(r.sql));
    expect(probe, 'the release must be verified against :id').toBeTruthy();
    expect(probe!.params).toEqual([MY_RELEASE, MY_PROJECT]);
  });

  it('scopes the completion rollup by project as well as release', async () => {
    // Rows written before the fix above can still exist, so the rollup must not let a
    // foreign task decide a release's status.
    await post(`/coding/projects/${MY_PROJECT}/tasks/task-1/complete`, {
      completion_record: { done: true },
    });

    const count = reads.find((r) => /FROM coding_tasks/.test(r.sql) && /COUNT\(\*\)/.test(r.sql));
    expect(count, 'the rollup must count pending tasks').toBeTruthy();
    expect(count!.sql).toContain('coding_project_id');
    expect(count!.params).toContain(MY_PROJECT);

    const flip = writes.find((w) => /UPDATE coding_releases/.test(w.sql));
    expect(flip, 'the release must be flipped to review').toBeTruthy();
    expect(flip!.sql).toContain('coding_project_id');
    expect(flip!.params).toContain(MY_PROJECT);
  });

  it('plans a task with a status the column accepts', async () => {
    const res = await post(`/coding/projects/${MY_PROJECT}/tasks/task-1/plan`, {});
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: 'planned' });

    const update = writes.find((w) => /UPDATE coding_tasks SET status/.test(w.sql));
    expect(update, 'the plan endpoint must set a status').toBeTruthy();
    expect(update!.sql).toContain("'planned'");
    expect(update!.sql).not.toContain("'planning'");
  });
});

describe('the three task-status lists agree', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

  /** The union members declared on a `CodingTaskStatus` type alias. */
  function declared(src: string): string[] {
    const m = /export type CodingTaskStatus =([^;]+);/.exec(src);
    if (!m) throw new Error('CodingTaskStatus not found');
    return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
  }

  it('the frontend and server unions are identical', () => {
    // They drifted, and the wider one won an argument with the database.
    expect(declared(read('src/lib/coding-types.ts')))
      .toEqual(declared(read('server/types/coding.ts')));
  });

  it('neither claims a task can be "planning"', () => {
    // Named explicitly so a re-add fails with the reason rather than a diff.
    expect(declared(read('src/lib/coding-types.ts'))).not.toContain('planning');
    expect(declared(read('server/types/coding.ts'))).not.toContain('planning');
  });

  it('the parser sees a real union, so the checks above are not vacuous', () => {
    expect(declared(read('src/lib/coding-types.ts')).length).toBeGreaterThan(5);
  });
});

// ── What does the column actually permit? ────────────────────────────────────
const DATABASE_URL = (() => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const m = readFileSync(join(process.cwd(), '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
})();
const d = DATABASE_URL ? describe : describe.skip;

d('coding_tasks_status_check, asked directly', () => {
  let client: import('pg').Client;

  beforeAll(async () => {
    const { Client } = await import('pg');
    client = new Client({ connectionString: DATABASE_URL! });
    await client.connect();
  }, 30_000);
  afterAll(async () => { await client?.end(); });

  async function allowed(): Promise<string[]> {
    const { rows } = await client.query(
      `SELECT pg_get_constraintdef(oid) d FROM pg_constraint
        WHERE conrelid = 'coding_tasks'::regclass AND conname = 'coding_tasks_status_check'`,
    );
    expect(rows.length, 'the constraint must exist for this test to mean anything').toBe(1);
    return [...rows[0].d.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
  }

  it('permits every status the type unions declare, and no fewer', async () => {
    const src = readFileSync(join(process.cwd(), 'server/types/coding.ts'), 'utf8');
    const declared = [...(/export type CodingTaskStatus =([^;]+);/.exec(src)![1])
      .matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(await allowed()).toEqual(declared);
  });

  it('does NOT permit "planning"', async () => {
    // The whole bug in one line. If a later migration adds it, this fails and whoever
    // added it can delete this test on purpose rather than by accident.
    expect(await allowed()).not.toContain('planning');
  });
});
