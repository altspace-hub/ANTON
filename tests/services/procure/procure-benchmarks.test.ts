/**
 * procure-benchmarks.test.ts — verifies SQL filter composition for the
 * benchmarks query layer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createProcureBenchmarks, type ProcureBenchmark } from '../../../server/services/procure-benchmarks.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(rows: ProcureBenchmark[] = []): DatabaseAdapter & { calls: SqlCall[] } {
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

describe('listBenchmarks', () => {
  it('issues a query with no WHERE conditions when no filter passed', async () => {
    const bm = await createProcureBenchmarks(mockDb);
    await bm.listBenchmarks();
    const call = mockDb.calls[0];
    expect(call.args).toEqual([]);
  });

  it('appends category filter', async () => {
    const bm = await createProcureBenchmarks(mockDb);
    await bm.listBenchmarks({ category: 'cloud-infra' });
    expect(mockDb.calls[0].sql).toContain('category = ?');
    expect(mockDb.calls[0].args).toEqual(['cloud-infra']);
  });

  it('appends metric filter', async () => {
    const bm = await createProcureBenchmarks(mockDb);
    await bm.listBenchmarks({ metric: 'monthly_spend_usd' });
    expect(mockDb.calls[0].sql).toContain('metric = ?');
    expect(mockDb.calls[0].args).toEqual(['monthly_spend_usd']);
  });

  it('appends region filter that includes IS NULL fallback', async () => {
    const bm = await createProcureBenchmarks(mockDb);
    await bm.listBenchmarks({ region: 'EU' });
    expect(mockDb.calls[0].sql).toContain('region = ? OR region IS NULL');
    expect(mockDb.calls[0].args).toEqual(['EU']);
  });

  it('combines all filters in declared order: category → metric → region', async () => {
    const bm = await createProcureBenchmarks(mockDb);
    await bm.listBenchmarks({ category: 'A', metric: 'B', region: 'C' });
    expect(mockDb.calls[0].args).toEqual(['A', 'B', 'C']);
  });
});

describe('compareToBenchmark', () => {
  function bm(p25: number | null, p50: number | null, p75: number | null): ProcureBenchmark {
    return {
      id: 'b1', category: 'X', metric: 'Y', region: null,
      metric_value_p25: p25, metric_value_p50: p50, metric_value_p75: p75,
      unit: 'usd', sample_size: 100, source: 'test', last_updated_at: '',
    };
  }

  it('returns no_benchmark when no rows', async () => {
    const svc = await createProcureBenchmarks(makeMockDb([]));
    const r = await svc.compareToBenchmark('X', 'Y', 100);
    expect(r.position).toBe('no_benchmark');
    expect(r.benchmark).toBeNull();
  });

  it('returns no_benchmark when any percentile is null', async () => {
    const svc = await createProcureBenchmarks(makeMockDb([bm(10, null, 30)]));
    const r = await svc.compareToBenchmark('X', 'Y', 20);
    expect(r.position).toBe('no_benchmark');
  });

  it('classifies below_p25', async () => {
    const svc = await createProcureBenchmarks(makeMockDb([bm(100, 200, 300)]));
    const r = await svc.compareToBenchmark('X', 'Y', 50);
    expect(r.position).toBe('below_p25');
  });

  it('classifies between_p25_p50', async () => {
    const svc = await createProcureBenchmarks(makeMockDb([bm(100, 200, 300)]));
    const r = await svc.compareToBenchmark('X', 'Y', 150);
    expect(r.position).toBe('between_p25_p50');
  });

  it('classifies between_p50_p75', async () => {
    const svc = await createProcureBenchmarks(makeMockDb([bm(100, 200, 300)]));
    const r = await svc.compareToBenchmark('X', 'Y', 250);
    expect(r.position).toBe('between_p50_p75');
  });

  it('classifies above_p75', async () => {
    const svc = await createProcureBenchmarks(makeMockDb([bm(100, 200, 300)]));
    const r = await svc.compareToBenchmark('X', 'Y', 350);
    expect(r.position).toBe('above_p75');
  });

  it('boundary: value exactly at p25 is between_p25_p50 (strict <)', async () => {
    const svc = await createProcureBenchmarks(makeMockDb([bm(100, 200, 300)]));
    const r = await svc.compareToBenchmark('X', 'Y', 100);
    expect(r.position).toBe('between_p25_p50');
  });

  it('boundary: value exactly at p75 is above_p75', async () => {
    const svc = await createProcureBenchmarks(makeMockDb([bm(100, 200, 300)]));
    const r = await svc.compareToBenchmark('X', 'Y', 300);
    expect(r.position).toBe('above_p75');
  });
});
