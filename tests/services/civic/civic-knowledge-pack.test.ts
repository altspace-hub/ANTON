/**
 * civic-knowledge-pack.test.ts — knowledge-pack bridge service tests.
 *
 * Covers SQL filter composition + the graceful-degradation path
 * (returns [] / null when the table layout is unexpected).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCivicKnowledgePackService, type CivicKnowledgePack } from '../../../server/services/civic-knowledge-pack.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(rows: CivicKnowledgePack[] = []): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return rows; },
    get: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return rows[0]; },
    run: async () => { /* no-op */ },
    exec: async () => { /* no-op */ },
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

function makeFailingDb(): DatabaseAdapter {
  return {
    all: async () => { throw new Error('table missing'); },
    get: async () => { throw new Error('table missing'); },
    run: async () => { /* no-op */ },
    exec: async () => { /* no-op */ },
  } as unknown as DatabaseAdapter;
}

let mockDb: ReturnType<typeof makeMockDb>;
beforeEach(() => { mockDb = makeMockDb(); });

describe('listPacks', () => {
  it('no filter → no WHERE clause', async () => {
    const svc = await createCivicKnowledgePackService(mockDb);
    await svc.listPacks();
    expect(mockDb.calls[0].sql).not.toMatch(/WHERE/);
    expect(mockDb.calls[0].args).toEqual([]);
  });

  it('jurisdiction filter', async () => {
    const svc = await createCivicKnowledgePackService(mockDb);
    await svc.listPacks({ jurisdiction: 'SE' });
    expect(mockDb.calls[0].sql).toContain('jurisdiction = ?');
    expect(mockDb.calls[0].args).toEqual(['SE']);
  });

  it('domain filter', async () => {
    const svc = await createCivicKnowledgePackService(mockDb);
    await svc.listPacks({ domain: 'tax' });
    expect(mockDb.calls[0].sql).toContain('domain = ?');
    expect(mockDb.calls[0].args).toEqual(['tax']);
  });

  it('returns empty array when table is missing (graceful)', async () => {
    const svc = await createCivicKnowledgePackService(makeFailingDb());
    const r = await svc.listPacks();
    expect(r).toEqual([]);
  });
});

describe('getPack', () => {
  it('binds id', async () => {
    const svc = await createCivicKnowledgePackService(mockDb);
    await svc.getPack('pack_se_amlcft');
    expect(mockDb.calls[0].args).toEqual(['pack_se_amlcft']);
  });

  it('returns null on DB error (graceful)', async () => {
    const svc = await createCivicKnowledgePackService(makeFailingDb());
    expect(await svc.getPack('anything')).toBeNull();
  });

  it('returns null when no row found', async () => {
    const svc = await createCivicKnowledgePackService(makeMockDb([]));
    expect(await svc.getPack('nope')).toBeNull();
  });
});
