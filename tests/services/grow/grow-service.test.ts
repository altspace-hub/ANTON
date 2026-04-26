/**
 * grow-service.test.ts — verifies SQL composition for the Grow CRM service.
 *
 * Uses a mock DatabaseAdapter that records every call. The grow service
 * is a thin SQL wrapper, so the test surface is: did we INSERT/SELECT
 * with the right parameters and the right WHERE composition.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createGrowService } from '../../../server/services/grow-service.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return []; },
    get: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return undefined; },
    run: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); },
    exec: async () => { /* no-op */ },
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

let mockDb: ReturnType<typeof makeMockDb>;

beforeEach(() => { mockDb = makeMockDb(); });

describe('createContact', () => {
  it('inserts with required fields + sensible defaults', async () => {
    const svc = await createGrowService(mockDb);
    const id = await svc.createContact({ firstName: 'Ada', lastName: 'Lovelace' });
    const insert = mockDb.calls[0];
    expect(insert.sql).toContain('INSERT INTO grow_contacts');
    // First two bind positions: id, then first_name
    expect(insert.args[0]).toBe(id);
    expect(insert.args[1]).toBe('Ada');
    expect(insert.args[2]).toBe('Lovelace');
    // optional fields default to null
    expect(insert.args[3]).toBeNull(); // title
    expect(insert.args[4]).toBeNull(); // email
    expect(insert.args[5]).toBeNull(); // phone
    expect(insert.args[6]).toBeNull(); // organisationId
    // tags default to empty array (not null) — important for ANY() queries downstream
    expect(insert.args[7]).toEqual([]);
    // createdBy defaults to 'solo'
    expect(insert.args[11]).toBe('solo');
  });

  it('passes through optional fields when supplied', async () => {
    const svc = await createGrowService(mockDb);
    await svc.createContact({
      firstName: 'Grace', lastName: 'Hopper',
      email: 'g@h.test', tags: ['vip', 'speaker'],
      confidenceScore: 0.9, source: 'event',
      createdBy: 'user_1',
    });
    const insert = mockDb.calls[0];
    expect(insert.args[4]).toBe('g@h.test');
    expect(insert.args[7]).toEqual(['vip', 'speaker']);
    expect(insert.args[8]).toBe(0.9);
    expect(insert.args[9]).toBe('event');
    expect(insert.args[11]).toBe('user_1');
  });

  it('returns a uuid-shaped id', async () => {
    const svc = await createGrowService(mockDb);
    const id = await svc.createContact({ firstName: 'X', lastName: 'Y' });
    // standard uuid v4 length + hyphens
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('listContacts — filter composition', () => {
  it('no filters → no WHERE clause, default LIMIT 100 OFFSET 0', async () => {
    const svc = await createGrowService(mockDb);
    await svc.listContacts();
    const call = mockDb.calls[0];
    expect(call.sql).not.toMatch(/WHERE/);
    expect(call.args).toEqual([100, 0]);
  });

  it('search term → 3 ILIKE bindings (first_name OR last_name OR email)', async () => {
    const svc = await createGrowService(mockDb);
    await svc.listContacts({ search: 'lovelace' });
    const call = mockDb.calls[0];
    expect(call.sql).toContain('ILIKE');
    expect(call.sql).toContain('first_name ILIKE ? OR c.last_name ILIKE ? OR c.email ILIKE ?');
    expect(call.args.slice(0, 3)).toEqual(['%lovelace%', '%lovelace%', '%lovelace%']);
  });

  it('orgId filter → c.organisation_id = ?', async () => {
    const svc = await createGrowService(mockDb);
    await svc.listContacts({ orgId: 'org_42' });
    const call = mockDb.calls[0];
    expect(call.sql).toContain('c.organisation_id = ?');
    expect(call.args[0]).toBe('org_42');
  });

  it('combines search + orgId in declared order', async () => {
    const svc = await createGrowService(mockDb);
    await svc.listContacts({ search: 'q', orgId: 'org_1' });
    const call = mockDb.calls[0];
    // 3 search bindings then orgId then limit + offset
    expect(call.args).toEqual(['%q%', '%q%', '%q%', 'org_1', 100, 0]);
  });

  it('respects custom limit/offset', async () => {
    const svc = await createGrowService(mockDb);
    await svc.listContacts({ limit: 25, offset: 50 });
    expect(mockDb.calls[0].args).toEqual([25, 50]);
  });
});

describe('getContact', () => {
  it('joins with organisation table and binds id', async () => {
    const svc = await createGrowService(mockDb);
    await svc.getContact('contact_123');
    const call = mockDb.calls[0];
    expect(call.sql).toContain('LEFT JOIN grow_organisations');
    expect(call.sql).toContain('WHERE c.id = ?');
    expect(call.args).toEqual(['contact_123']);
  });
});
