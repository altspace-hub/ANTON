/**
 * procure-vendor-directory.test.ts — verifies SQL filter composition.
 *
 * Uses a mock DatabaseAdapter that records the SQL + args passed to
 * `all` / `get`, so tests can assert the right WHERE clauses + bind args.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createProcureVendorDirectory, type ProcureVendor } from '../../../server/services/procure-vendor-directory.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(rows: ProcureVendor[] = []): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return rows; },
    get: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return rows[0]; },
    run: async () => { /* no-op */ },
    exec: async () => { /* no-op */ },
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

let mockDb: ReturnType<typeof makeMockDb>;

beforeEach(() => { mockDb = makeMockDb(); });

describe('listVendors', () => {
  it('always includes the active filter', async () => {
    const dir = await createProcureVendorDirectory(mockDb);
    await dir.listVendors();
    const call = mockDb.calls[0];
    expect(call.sql).toContain('is_active = TRUE');
    expect(call.args).toEqual([]);
  });

  it('appends category filter with bind arg', async () => {
    const dir = await createProcureVendorDirectory(mockDb);
    await dir.listVendors({ category: 'cloud-infra' });
    const call = mockDb.calls[0];
    expect(call.sql).toContain('category = ?');
    expect(call.args).toEqual(['cloud-infra']);
  });

  it('appends jurisdiction filter using ANY operator', async () => {
    const dir = await createProcureVendorDirectory(mockDb);
    await dir.listVendors({ jurisdiction: 'EU' });
    const call = mockDb.calls[0];
    expect(call.sql).toContain('? = ANY(jurisdictions)');
    expect(call.args).toEqual(['EU']);
  });

  it('appends minTrust filter (>=)', async () => {
    const dir = await createProcureVendorDirectory(mockDb);
    await dir.listVendors({ minTrust: 0.7 });
    const call = mockDb.calls[0];
    expect(call.sql).toContain('trust_score >= ?');
    expect(call.args).toEqual([0.7]);
  });

  it('treats minTrust=0 as a real filter (not skipped)', async () => {
    const dir = await createProcureVendorDirectory(mockDb);
    await dir.listVendors({ minTrust: 0 });
    const call = mockDb.calls[0];
    expect(call.sql).toContain('trust_score >= ?');
    expect(call.args).toEqual([0]);
  });

  it('appends sizeBand filter', async () => {
    const dir = await createProcureVendorDirectory(mockDb);
    await dir.listVendors({ sizeBand: 'sme' });
    const call = mockDb.calls[0];
    expect(call.sql).toContain('size_band = ?');
    expect(call.args).toEqual(['sme']);
  });

  it('combines all filters in args order: category → jurisdiction → minTrust → sizeBand', async () => {
    const dir = await createProcureVendorDirectory(mockDb);
    await dir.listVendors({ category: 'A', jurisdiction: 'EU', minTrust: 0.5, sizeBand: 'mid' });
    expect(mockDb.calls[0].args).toEqual(['A', 'EU', 0.5, 'mid']);
  });

  it('sorts by trust_score DESC NULLS LAST, name', async () => {
    const dir = await createProcureVendorDirectory(mockDb);
    await dir.listVendors();
    expect(mockDb.calls[0].sql).toContain('ORDER BY trust_score DESC NULLS LAST, name');
  });
});

describe('getVendor', () => {
  it('issues a single-row query with the id arg', async () => {
    const dir = await createProcureVendorDirectory(mockDb);
    await dir.getVendor('vendor_anthropic');
    expect(mockDb.calls[0].sql).toContain('WHERE id = ?');
    expect(mockDb.calls[0].args).toEqual(['vendor_anthropic']);
  });

  it('returns null when vendor missing', async () => {
    const dir = await createProcureVendorDirectory(makeMockDb([]));
    const result = await dir.getVendor('nope');
    expect(result).toBeNull();
  });
});

describe('listCategories', () => {
  it('issues DISTINCT query, returns string array', async () => {
    const stub = makeMockDb();
    stub.all = async (sql: string) => {
      stub.calls.push({ sql, args: [] });
      return [{ category: 'cloud-infra' }, { category: 'payments' }] as never[];
    };
    const dir = await createProcureVendorDirectory(stub);
    const cats = await dir.listCategories();
    expect(stub.calls[0].sql).toContain('DISTINCT category');
    expect(cats).toEqual(['cloud-infra', 'payments']);
  });
});
