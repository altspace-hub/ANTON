/**
 * beehive-state.test.ts — SQL composition tests for the state-layer queries.
 *
 * Verifies bind-arg correctness + WHERE composition for the read-side
 * paths (hive lookup, participants, rounds, output). Mutation paths
 * are covered by integration tests with a live Postgres.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createBeehiveState } from '../../../server/services/beehive/beehive-state.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(rows: unknown[] = []): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return rows; },
    get: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return rows[0]; },
    run: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); },
    exec: async () => {},
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

let db: ReturnType<typeof makeMockDb>;

beforeEach(() => { db = makeMockDb(); });

describe('getHive', () => {
  it('returns null when row missing', async () => {
    const svc = createBeehiveState(db);
    const r = await svc.getHive('nope');
    expect(r).toBeNull();
  });

  it('binds id', async () => {
    const svc = createBeehiveState(db);
    await svc.getHive('h_1');
    expect(db.calls[0].args).toEqual(['h_1']);
  });
});

describe('listHives — filter composition', () => {
  it('no filter → no WHERE clause', async () => {
    const svc = createBeehiveState(db);
    await svc.listHives();
    const sql = db.calls[0].sql;
    expect(sql).not.toMatch(/WHERE/);
  });

  it('single status filter — implementation always uses IN (?)', async () => {
    const svc = createBeehiveState(db);
    await svc.listHives({ status: 'active' });
    // The state-layer treats single-status uniformly as a list, so it
    // always emits IN (?) — ergonomic and SQL-injection-safe.
    expect(db.calls[0].sql).toContain('status IN');
    expect(db.calls[0].args).toContain('active');
  });

  it('multiple status filter uses IN', async () => {
    const svc = createBeehiveState(db);
    await svc.listHives({ status: ['active', 'converging'] });
    expect(db.calls[0].sql).toContain('status IN');
  });

  it('createdBy filter is a separate AND', async () => {
    const svc = createBeehiveState(db);
    await svc.listHives({ createdBy: 'h_alice' });
    expect(db.calls[0].sql).toContain('created_by =');
    expect(db.calls[0].args).toContain('h_alice');
  });

  it('default limit is applied', async () => {
    const svc = createBeehiveState(db);
    await svc.listHives();
    expect(db.calls[0].sql).toContain('LIMIT');
  });
});

describe('listParticipants', () => {
  it('binds hiveId + filters by hive_id', async () => {
    const svc = createBeehiveState(db);
    await svc.listParticipants('h_1');
    expect(db.calls[0].sql).toContain('hive_id = ?');
    expect(db.calls[0].args).toEqual(['h_1']);
  });
});

describe('listRounds', () => {
  it('orders by round_number ASC', async () => {
    const svc = createBeehiveState(db);
    await svc.listRounds('h_1');
    expect(db.calls[0].sql).toContain('ORDER BY round_number');
  });
});

describe('countContributions', () => {
  it('returns 0 when no row', async () => {
    const svc = createBeehiveState(db);
    const c = await svc.countContributions('h_1');
    expect(c).toBe(0);
  });

  it('returns numeric value when row present', async () => {
    const svc = createBeehiveState(makeMockDb([{ c: 42 }]));
    const c = await svc.countContributions('h_1');
    expect(c).toBe(42);
  });
});

describe('updateHiveStatus', () => {
  it('issues UPDATE with status + id', async () => {
    const svc = createBeehiveState(db);
    await svc.updateHiveStatus('h_1', 'concluded');
    const sql = db.calls[0].sql;
    expect(sql).toContain('UPDATE');
    expect(sql).toContain('status');
  });

  it('includes concluded_at when status is concluded', async () => {
    const svc = createBeehiveState(db);
    await svc.updateHiveStatus('h_1', 'concluded', '2026-04-26T10:00:00Z');
    expect(db.calls[0].sql).toContain('concluded_at');
  });
});

describe('loadFullState', () => {
  it('returns null when hive missing', async () => {
    const svc = createBeehiveState(db);
    const r = await svc.loadFullState('nope');
    expect(r).toBeNull();
  });
});
