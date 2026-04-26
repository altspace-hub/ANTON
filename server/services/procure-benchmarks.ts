/**
 * procure-benchmarks.ts — pricing + delivery benchmarks per category.
 * Phase B.2 build-out.
 */

import type { DatabaseAdapter } from '../db/database.js';

export interface ProcureBenchmark {
  id: string;
  category: string;
  metric: string;
  region: string | null;
  metric_value_p25: number | null;
  metric_value_p50: number | null;
  metric_value_p75: number | null;
  unit: string | null;
  sample_size: number | null;
  source: string | null;
  last_updated_at: string;
}

export async function createProcureBenchmarks(db: DatabaseAdapter) {

  async function listBenchmarks(filter?: { category?: string; metric?: string; region?: string }): Promise<ProcureBenchmark[]> {
    const conds: string[] = [];
    const args: unknown[] = [];
    if (filter?.category) { conds.push(`category = ?`); args.push(filter.category); }
    if (filter?.metric)   { conds.push(`metric = ?`);   args.push(filter.metric); }
    if (filter?.region)   { conds.push(`(region = ? OR region IS NULL)`); args.push(filter.region); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    return await db.all<ProcureBenchmark>(
      `SELECT id, category, metric, region, metric_value_p25, metric_value_p50, metric_value_p75,
              unit, sample_size, source, last_updated_at
         FROM procure_benchmarks ${where}
         ORDER BY category, metric, region NULLS LAST`,
      ...args,
    );
  }

  /**
   * Compare a vendor's quoted value against the benchmark distribution.
   * Returns where the value sits (below_p25 / between_p25_p50 / between_p50_p75 / above_p75).
   */
  async function compareToBenchmark(category: string, metric: string, value: number, region?: string): Promise<{
    benchmark: ProcureBenchmark | null;
    position: 'below_p25' | 'between_p25_p50' | 'between_p50_p75' | 'above_p75' | 'no_benchmark';
  }> {
    const benchmarks = await listBenchmarks({ category, metric, region });
    const bm = benchmarks[0] ?? null;
    if (!bm || bm.metric_value_p25 == null || bm.metric_value_p50 == null || bm.metric_value_p75 == null) {
      return { benchmark: bm, position: 'no_benchmark' };
    }
    if (value < bm.metric_value_p25) return { benchmark: bm, position: 'below_p25' };
    if (value < bm.metric_value_p50) return { benchmark: bm, position: 'between_p25_p50' };
    if (value < bm.metric_value_p75) return { benchmark: bm, position: 'between_p50_p75' };
    return { benchmark: bm, position: 'above_p75' };
  }

  return { listBenchmarks, compareToBenchmark };
}

export type ProcureBenchmarks = Awaited<ReturnType<typeof createProcureBenchmarks>>;
