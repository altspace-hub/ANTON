/**
 * civic-isolation.test.ts — multi-tenant isolation for the Civic pillar.
 *
 * Cross-user leak (roadmap Phase 3): listEngagements + getUpcomingDeadlines
 * returned every user's data, and createEngagement never set created_by. These
 * tests verify the SQL scoping + owner binding (route layer passes ownerId for
 * non-admins; admin/solo omits it).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createCivicService } from '../../../server/services/civic-service.js';
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

describe('civic multi-tenant isolation', () => {
  it('listEngagements scopes by created_by when ownerId is set', async () => {
    const svc = await createCivicService(mockDb);
    await svc.listEngagements({ ownerId: 'user_a' });
    const q = mockDb.calls.at(-1)!;
    expect(q.sql).toContain('created_by = ?');
    expect(q.args).toContain('user_a');
  });

  it('listEngagements does NOT filter by created_by for admin/solo (no ownerId)', async () => {
    const svc = await createCivicService(mockDb);
    await svc.listEngagements({});
    const q = mockDb.calls.at(-1)!;
    expect(q.sql).not.toContain('created_by');
  });

  it('createEngagement persists the owner in created_by', async () => {
    const svc = await createCivicService(mockDb);
    await svc.createEngagement({ title: 'Permit application', created_by: 'user_a' });
    const insert = mockDb.calls.find((c) => c.sql.includes('INSERT INTO civic_engagements'))!;
    expect(insert.args).toContain('user_a');
  });

  it('getUpcomingDeadlines scopes to the caller’s engagements when ownerId is set', async () => {
    const svc = await createCivicService(mockDb);
    await svc.getUpcomingDeadlines(30, 'user_a');
    const q = mockDb.calls.at(-1)!;
    expect(q.sql).toContain('civic_engagements WHERE created_by = ?');
    expect(q.args).toContain('user_a');
  });
});
