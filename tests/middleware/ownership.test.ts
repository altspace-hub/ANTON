/**
 * ownership.test.ts — per-user row scoping on a shared instance.
 *
 * Six route groups fetched, mutated or deleted rows by id alone. The fix has to hold
 * two properties that pull against each other:
 *
 *   - on a shared install a non-admin must not reach another user's rows;
 *   - on a single-user laptop NOTHING may disappear, including rows written before
 *     ownership existed (coding-scripts.ts still creates sessions with no user_id).
 *
 * The second is why solo short-circuits rather than filtering. A "security fix" that
 * makes a user's own history vanish from their own machine reads as data loss and
 * would be reverted — correctly — before anyone benefited from it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Response } from 'express';
import {
  scopesToOwner, ownerFilter, assertOwned, type OwnedRequest,
} from '../../server/middleware/ownership.js';

const ADMIN: OwnedRequest = { user: { id: 'admin-1', role: 'admin' } };
const ALICE: OwnedRequest = { user: { id: 'alice', role: 'analyst' } };
const ANON: OwnedRequest = {};

function res() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json } as unknown as Response & { status: ReturnType<typeof vi.fn> };
}

/** Minimal stand-in for the db adapter: records the SQL it was asked to run. */
function fakeDb(rowExistsFor: (sql: string, params: unknown[]) => boolean) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    get: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      return rowExistsFor(sql, params) ? { ok: 1 } : undefined;
    },
  } as never;
}

let original: string | undefined;
beforeEach(() => { original = process.env.DEPLOYMENT_MODE; });
afterEach(() => {
  if (original === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = original;
});

describe('when scoping applies at all', () => {
  it('never scopes in solo mode — a laptop owner keeps every row, attributed or not', () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    expect(scopesToOwner(ALICE)).toBe(false);
    expect(ownerFilter(ALICE, 'user_id').sql).toBe('');
  });

  it('never scopes an admin in team mode — support and audit paths keep working', () => {
    process.env.DEPLOYMENT_MODE = 'team';
    expect(scopesToOwner(ADMIN)).toBe(false);
    expect(ownerFilter(ADMIN, 'user_id').sql).toBe('');
  });

  it('scopes a non-admin in team mode', () => {
    process.env.DEPLOYMENT_MODE = 'team';
    expect(scopesToOwner(ALICE)).toBe(true);
    const f = ownerFilter(ALICE, 'user_id');
    expect(f.sql).toBe(' AND user_id = ?');
    expect(f.params).toEqual(['alice']);
  });

  it('returns NO rows for an unidentified caller in team mode, not ALL rows', () => {
    // The dangerous default. An empty filter here would widen the query to everything.
    process.env.DEPLOYMENT_MODE = 'team';
    const f = ownerFilter(ANON, 'user_id');
    expect(f.sql).toBe(' AND 1=0');
    expect(f.sql).not.toBe('');
  });

  it('emits a fragment that always starts with AND, so it appends safely', () => {
    process.env.DEPLOYMENT_MODE = 'team';
    expect(ownerFilter(ALICE, 'uploaded_by').sql.trimStart().startsWith('AND ')).toBe(true);
  });
});

describe('assertOwned', () => {
  it('401s with no user, before touching the database', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const db = fakeDb(() => true);
    const r = res();
    const ok = await assertOwned(db, ANON, r, { table: 't', ownerColumn: 'user_id', id: 'x' });
    expect(ok).toBe(false);
    expect(r.status).toHaveBeenCalledWith(401);
    expect((db as unknown as { calls: unknown[] }).calls).toHaveLength(0);
  });

  it('filters by owner IN SQL for a scoped caller — never fetch-then-check', async () => {
    // Checking after the fetch would load another tenant's row into memory, where it
    // can be logged or leak through an error path.
    process.env.DEPLOYMENT_MODE = 'team';
    const db = fakeDb(() => true);
    await assertOwned(db, ALICE, res(), { table: 'brand_templates', ownerColumn: 'user_id', id: 'tpl-1' });
    const { sql, params } = (db as unknown as { calls: Array<{ sql: string; params: unknown[] }> }).calls[0]!;
    expect(sql).toContain('user_id = ?');
    expect(params).toEqual(['tpl-1', 'alice']);
  });

  it('404s — NOT 403 — on another user\'s row, so an id cannot be used as an oracle', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const db = fakeDb(() => false);          // exists, but not Alice's
    const r = res();
    const ok = await assertOwned(db, ALICE, r, { table: 't', ownerColumn: 'user_id', id: 'someone-elses' });
    expect(ok).toBe(false);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.status).not.toHaveBeenCalledWith(403);
  });

  it('gives a missing row and a forbidden row the SAME response', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r1 = res(); const r2 = res();
    await assertOwned(fakeDb(() => false), ALICE, r1, { table: 't', ownerColumn: 'user_id', id: 'missing' });
    await assertOwned(fakeDb(() => false), ALICE, r2, { table: 't', ownerColumn: 'user_id', id: 'theirs' });
    expect(r1.status.mock.calls).toEqual(r2.status.mock.calls);
  });

  it('passes a scoped caller for their own row', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const ok = await assertOwned(fakeDb(() => true), ALICE, res(), {
      table: 't', ownerColumn: 'user_id', id: 'mine',
    });
    expect(ok).toBe(true);
  });

  it('in solo mode checks existence only — no owner predicate', async () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    const db = fakeDb(() => true);
    const ok = await assertOwned(db, ALICE, res(), { table: 'sessions', ownerColumn: 'user_id', id: 's1' });
    expect(ok).toBe(true);
    const { sql, params } = (db as unknown as { calls: Array<{ sql: string; params: unknown[] }> }).calls[0]!;
    expect(sql).not.toContain('user_id');
    expect(params).toEqual(['s1']);
  });

  it('still 404s a genuinely missing row in solo mode', async () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    const r = res();
    const ok = await assertOwned(fakeDb(() => false), ALICE, r, { table: 't', ownerColumn: 'user_id', id: 'nope' });
    expect(ok).toBe(false);
    expect(r.status).toHaveBeenCalledWith(404);
  });
});
