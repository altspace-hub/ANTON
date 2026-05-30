/**
 * procure-isolation.test.ts — multi-tenant isolation for the Procure pillar.
 *
 * Cross-user leak (roadmap Phase 3): listCycles returned every user's cycles.
 * It now scopes by created_by for non-admin callers. These tests verify the SQL
 * composition (the route layer passes ownerId for non-admins; admin/solo omits it).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createProcureService } from '../../../server/services/procure-service.js';
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

describe('procure multi-tenant isolation', () => {
  it('listCycles scopes by created_by when ownerId is set (team-mode non-admin)', async () => {
    const svc = await createProcureService(mockDb);
    await svc.listCycles({ ownerId: 'user_a' });
    const q = mockDb.calls.at(-1)!;
    expect(q.sql).toContain('c.created_by = ?');
    expect(q.args).toContain('user_a');
  });

  it('listCycles does NOT filter by created_by for an admin/solo caller (no ownerId)', async () => {
    const svc = await createProcureService(mockDb);
    await svc.listCycles({});
    const q = mockDb.calls.at(-1)!;
    expect(q.sql).not.toContain('created_by');
  });

  it('listCycles combines status + owner scoping', async () => {
    const svc = await createProcureService(mockDb);
    await svc.listCycles({ status: 'active', ownerId: 'user_b' });
    const q = mockDb.calls.at(-1)!;
    expect(q.sql).toContain('c.status = ?');
    expect(q.sql).toContain('c.created_by = ?');
    expect(q.args).toEqual(['active', 'user_b']);
  });

  it('createCycle persists the owner in created_by', async () => {
    const svc = await createProcureService(mockDb);
    await svc.createCycle({ title: 'Laptop RFP', created_by: 'user_a' });
    const insert = mockDb.calls.find((c) => c.sql.includes('INSERT INTO procure_cycles'))!;
    // bind order: id, title, description, phase, status, company_size, budget_range, category, created_by
    expect(insert.args[8]).toBe('user_a');
  });
});
