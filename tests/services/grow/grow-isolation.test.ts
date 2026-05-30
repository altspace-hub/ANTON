/**
 * grow-isolation.test.ts — multi-tenant isolation for the Grow pillar.
 *
 * Cross-user leak (roadmap Phase 3): listContacts / listOpportunities returned
 * every user's records. They now scope by created_by for non-admin callers
 * (contacts + opportunities are the entities that carry created_by).
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

describe('grow multi-tenant isolation', () => {
  it('listContacts scopes by created_by when ownerId is set', async () => {
    const svc = await createGrowService(mockDb);
    await svc.listContacts({ ownerId: 'user_a' });
    const q = mockDb.calls.at(-1)!;
    expect(q.sql).toContain('c.created_by = ?');
    expect(q.args).toContain('user_a');
  });

  it('listContacts does NOT filter by created_by for admin/solo (no ownerId)', async () => {
    const svc = await createGrowService(mockDb);
    await svc.listContacts({});
    const q = mockDb.calls.at(-1)!;
    expect(q.sql).not.toContain('created_by');
  });

  it('listOpportunities scopes by created_by when ownerId is set', async () => {
    const svc = await createGrowService(mockDb);
    await svc.listOpportunities({ ownerId: 'user_b' });
    const q = mockDb.calls.at(-1)!;
    expect(q.sql).toContain('op.created_by = ?');
    expect(q.args).toContain('user_b');
  });

  it('createContact persists the owner in created_by', async () => {
    const svc = await createGrowService(mockDb);
    await svc.createContact({ firstName: 'Ada', lastName: 'Lovelace', createdBy: 'user_a' });
    const insert = mockDb.calls.find((c) => c.sql.includes('INSERT INTO grow_contacts'))!;
    expect(insert.args).toContain('user_a');
  });
});
