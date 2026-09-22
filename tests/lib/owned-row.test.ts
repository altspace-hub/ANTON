/**
 * owned-row.test.ts — the guarded row load.
 *
 * Two halves, because each proves something the other cannot:
 *
 *   1. Fake-db cases assert the SHAPE of the query that goes out — that the owner
 *      predicate is actually in the SQL, that solo and admin get the unscoped form,
 *      and that an unidentified caller never reaches the database at all.
 *   2. Live-PostgreSQL cases run the same calls against a real table, so a query that
 *      is syntactically wrong for PG, or a `?` that never becomes `$1`, cannot pass
 *      here and fail in production. A joined-text assertion over generated SQL is not
 *      evidence that the database honoured it.
 *
 * Every case pairs "the other tenant is refused" with "the owner still gets their row"
 * and "the solo operator still gets everything". A guard that blocks the person who
 * owns the machine is a worse bug than the one it fixes.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  loadOwnedRow, respondToRowAccessError, isRowAccessError, RowAccessError,
} from '../../server/lib/owned-row.js';
import type { OwnedRequest } from '../../server/middleware/ownership.js';

const ADMIN: OwnedRequest = { user: { id: 'admin-1', role: 'admin' } };
const ALICE: OwnedRequest = { user: { id: 'alice', role: 'analyst' } };
const BOB: OwnedRequest = { user: { id: 'bob', role: 'viewer' } };
const SOLO: OwnedRequest = { user: { id: 'solo', role: 'admin' } };
const ANON: OwnedRequest = {};

let originalMode: string | undefined;
beforeEach(() => { originalMode = process.env.DEPLOYMENT_MODE; });
afterEach(() => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = originalMode;
});

/** Records every statement, and pretends the row exists whenever the WHERE matches. */
function fakeDb(rows: Array<Record<string, string>>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    get: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      const [id, owner] = params as string[];
      return rows.find((r) => r.id === id && (owner === undefined || r.user_id === owner));
    },
  } as never;
}

const ROWS = [
  { id: 'row-alice', user_id: 'alice', secret: "alice's" },
  { id: 'row-bob', user_id: 'bob', secret: "bob's" },
  { id: 'row-legacy', user_id: '', secret: 'written before ownership existed' },
];

describe('loadOwnedRow — which query goes out', () => {
  it('binds the owner into the WHERE clause for a non-admin in team mode', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const db = fakeDb(ROWS);
    const row = await loadOwnedRow<{ secret: string }>(db, ALICE, {
      table: 'discovery_sessions', ownerColumn: 'user_id', id: 'row-alice',
    });
    expect(row.secret).toBe("alice's");
    const { sql, params } = (db as unknown as ReturnType<typeof fakeDb>).calls[0];
    expect(sql).toContain('WHERE id = ? AND user_id = ?');
    expect(params).toEqual(['row-alice', 'alice']);
  });

  it('refuses another tenant\'s row with 404, not 403', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const db = fakeDb(ROWS);
    const err = await loadOwnedRow(db, ALICE, {
      table: 'discovery_sessions', ownerColumn: 'user_id', id: 'row-bob',
    }).catch((e: unknown) => e);
    expect(isRowAccessError(err)).toBe(true);
    expect((err as RowAccessError).status).toBe(404);
  });

  it('answers a stranger\'s id exactly as it answers a nonexistent one', async () => {
    // A distinct message or status turns the id into an existence oracle.
    process.env.DEPLOYMENT_MODE = 'team';
    const db = fakeDb(ROWS);
    const spec = { table: 'discovery_sessions', ownerColumn: 'user_id' };
    const theirs = await loadOwnedRow(db, ALICE, { ...spec, id: 'row-bob' }).catch((e: unknown) => e);
    const missing = await loadOwnedRow(db, ALICE, { ...spec, id: 'no-such-row' }).catch((e: unknown) => e);
    expect((theirs as RowAccessError).status).toBe((missing as RowAccessError).status);
    expect((theirs as RowAccessError).message).toBe((missing as RowAccessError).message);
  });

  it('does NOT scope the solo operator — their own history must not vanish', async () => {
    delete process.env.DEPLOYMENT_MODE;             // solo is the default deployment
    const db = fakeDb(ROWS);
    // Row attributed to somebody else, and a row attributed to nobody: on a
    // single-user laptop both are the operator's and both must load.
    for (const id of ['row-bob', 'row-legacy']) {
      const row = await loadOwnedRow<{ id: string }>(db, SOLO, {
        table: 'discovery_sessions', ownerColumn: 'user_id', id,
      });
      expect(row.id).toBe(id);
    }
    for (const call of (db as unknown as ReturnType<typeof fakeDb>).calls) {
      expect(call.sql).not.toContain('user_id = ?');
    }
  });

  it('does not scope an admin in team mode — support paths keep working', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const db = fakeDb(ROWS);
    const row = await loadOwnedRow<{ secret: string }>(db, ADMIN, {
      table: 'discovery_sessions', ownerColumn: 'user_id', id: 'row-bob',
    });
    expect(row.secret).toBe("bob's");
  });

  it('still 404s the solo operator on a genuinely missing id', async () => {
    // The unscoped branch is a pass-through for ownership, not for existence: a route
    // must not behave differently depending on DEPLOYMENT_MODE.
    process.env.DEPLOYMENT_MODE = 'solo';
    const db = fakeDb(ROWS);
    const err = await loadOwnedRow(db, SOLO, {
      table: 'discovery_sessions', ownerColumn: 'user_id', id: 'no-such-row',
    }).catch((e: unknown) => e);
    expect((err as RowAccessError).status).toBe(404);
  });

  it('401s an unidentified caller WITHOUT querying — no unscoped fallback', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const db = fakeDb(ROWS);
    const err = await loadOwnedRow(db, ANON, {
      table: 'discovery_sessions', ownerColumn: 'user_id', id: 'row-bob',
    }).catch((e: unknown) => e);
    expect((err as RowAccessError).status).toBe(401);
    expect((db as unknown as ReturnType<typeof fakeDb>).calls).toHaveLength(0);
  });

  it('hides an unattributed row from a non-admin in team mode', async () => {
    // Deliberate fail-closed choice: on a shared instance an unowned row is ambiguous,
    // and showing it to everyone is the outcome being removed. Admins still see it.
    process.env.DEPLOYMENT_MODE = 'team';
    const db = fakeDb(ROWS);
    const err = await loadOwnedRow(db, BOB, {
      table: 'discovery_sessions', ownerColumn: 'user_id', id: 'row-legacy',
    }).catch((e: unknown) => e);
    expect((err as RowAccessError).status).toBe(404);
    const asAdmin = await loadOwnedRow<{ id: string }>(db, ADMIN, {
      table: 'discovery_sessions', ownerColumn: 'user_id', id: 'row-legacy',
    });
    expect(asAdmin.id).toBe('row-legacy');
  });

  it('projects only the requested columns when asked', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const db = fakeDb(ROWS);
    await loadOwnedRow(db, ALICE, {
      table: 'discovery_sessions', ownerColumn: 'user_id', id: 'row-alice',
      columns: ['id', 'user_id'],
    });
    expect((db as unknown as ReturnType<typeof fakeDb>).calls[0].sql)
      .toContain('SELECT id, user_id FROM discovery_sessions');
  });

  it('rejects an identifier that is not a bare name, rather than concatenating it', async () => {
    // table/ownerColumn are concatenated — they cannot be bound — so a call site that
    // ever passes request-derived text must fail loudly instead of making the guard
    // itself the injection vector.
    process.env.DEPLOYMENT_MODE = 'team';
    const db = fakeDb(ROWS);
    const err = await loadOwnedRow(db, ALICE, {
      table: 'users WHERE 1=1 --', ownerColumn: 'user_id', id: 'row-alice',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isRowAccessError(err)).toBe(false);      // a bug, not an auth outcome
    expect((db as unknown as ReturnType<typeof fakeDb>).calls).toHaveLength(0);
  });
});

describe('respondToRowAccessError', () => {
  function res() {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    return { res: { status, json } as unknown as Response, status, json };
  }

  it('sends the carried status and claims the error', () => {
    const { res: r, status, json } = res();
    expect(respondToRowAccessError(new RowAccessError(404, 'Not found'), r)).toBe(true);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'Not found' });
  });

  it('leaves anything else alone — a DB fault must not be reported as "not found"', () => {
    const { res: r, status } = res();
    expect(respondToRowAccessError(new Error('connection terminated'), r)).toBe(false);
    expect(status).not.toHaveBeenCalled();
  });
});

// ── Live PostgreSQL ─────────────────────────────────────────────────────────

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

d('loadOwnedRow against real PostgreSQL', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  const alicesRow = randomUUID();
  const bobsRow = randomUUID();
  const orphanRow = randomUUID();

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    // discovery_sessions: real table, nullable user_id, no FK to users — the same
    // fixture tests/routes/ownership-enforcement.test.ts uses.
    await db.run('INSERT INTO discovery_sessions (id, tier, state, user_id) VALUES (?, ?, ?, ?)', alicesRow, 'lite', '{}', 'alice');
    await db.run('INSERT INTO discovery_sessions (id, tier, state, user_id) VALUES (?, ?, ?, ?)', bobsRow, 'lite', '{}', 'bob');
    await db.run('INSERT INTO discovery_sessions (id, tier, state) VALUES (?, ?, ?)', orphanRow, 'lite', '{}');
  });

  afterAll(async () => {
    for (const id of [alicesRow, bobsRow, orphanRow]) {
      await db.run('DELETE FROM discovery_sessions WHERE id = ?', id).catch(() => {});
    }
    await db.close();
  });

  const spec = { table: 'discovery_sessions', ownerColumn: 'user_id' };

  it('gives Alice her own row', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const row = await loadOwnedRow<{ id: string }>(db, ALICE, { ...spec, id: alicesRow });
    expect(row.id).toBe(alicesRow);
  });

  it('refuses Alice Bob\'s row — the cross-tenant read this helper exists to stop', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const err = await loadOwnedRow(db, ALICE, { ...spec, id: bobsRow }).catch((e: unknown) => e);
    expect(isRowAccessError(err)).toBe(true);
    expect((err as RowAccessError).status).toBe(404);
  });

  it('hides the unattributed row from a non-admin but not from an admin', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const err = await loadOwnedRow(db, ALICE, { ...spec, id: orphanRow }).catch((e: unknown) => e);
    expect((err as RowAccessError).status).toBe(404);
    const asAdmin = await loadOwnedRow<{ id: string }>(db, ADMIN, { ...spec, id: orphanRow });
    expect(asAdmin.id).toBe(orphanRow);
  });

  it('SOLO: the operator reads every row on their machine, attributed or not', async () => {
    delete process.env.DEPLOYMENT_MODE;
    for (const id of [alicesRow, bobsRow, orphanRow]) {
      const row = await loadOwnedRow<{ id: string }>(db, SOLO, { ...spec, id });
      expect(row.id).toBe(id);
    }
  });
});
