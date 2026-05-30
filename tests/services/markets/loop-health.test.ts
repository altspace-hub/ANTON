/**
 * loop-health.test.ts — Markets silent-failure detector (roadmap Phase 2).
 *
 * Verifies the stale-loop logic that was missing when the pattern→weight loop
 * froze for a month: a loop with pending work but zero recent transitions is
 * flagged stale; a loop that is keeping up (or has no work) is not.
 */
import { describe, it, expect } from 'vitest';
import { checkMarketsLoopHealth, staleMarketLoops } from '../../../server/services/market-loop-health.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface Counts {
  patternsPending?: number; patternsApplied?: number;
  predsPending?: number; predsValidated?: number;
  runsRecent?: number;
}

function mockDb(counts: Counts, lastRun?: string): DatabaseAdapter {
  return {
    get: async (sql: string) => {
      if (sql.includes('LIMIT 1')) return lastRun ? { started_at: lastRun } : undefined;
      if (sql.includes('applied_to_weights_at IS NULL')) return { n: counts.patternsPending ?? 0 };
      if (sql.includes('applied_to_weights_at >=')) return { n: counts.patternsApplied ?? 0 };
      if (sql.includes("status != 'validated'")) return { n: counts.predsPending ?? 0 };
      if (sql.includes('validated_at >=')) return { n: counts.predsValidated ?? 0 };
      if (sql.includes('workflow_runs')) return { n: counts.runsRecent ?? 0 };
      return { n: 0 };
    },
    all: async () => [],
    run: async () => { /* no-op */ },
    exec: async () => { /* no-op */ },
  } as unknown as DatabaseAdapter;
}

const byLoop = (rows: { loop: string }[], loop: string) => rows.find((r) => r.loop === loop)!;

describe('checkMarketsLoopHealth', () => {
  it('flags the pattern→weight loop STALE when there is pending work but zero applied', async () => {
    const rows = await checkMarketsLoopHealth(mockDb({ patternsPending: 5, patternsApplied: 0, runsRecent: 1 }, '2026-05-30'));
    expect(byLoop(rows, 'pattern_to_weight').stale).toBe(true);
    expect(byLoop(rows, 'pattern_to_weight').detail).toContain('frozen');
  });

  it('does NOT flag the pattern loop when it is keeping up', async () => {
    const rows = await checkMarketsLoopHealth(mockDb({ patternsPending: 5, patternsApplied: 3, runsRecent: 1 }, '2026-05-30'));
    expect(byLoop(rows, 'pattern_to_weight').stale).toBe(false);
  });

  it('does NOT flag a loop with no pending work (idle ≠ broken)', async () => {
    const rows = await checkMarketsLoopHealth(mockDb({ patternsPending: 0, patternsApplied: 0, runsRecent: 1 }, '2026-05-30'));
    expect(byLoop(rows, 'pattern_to_weight').stale).toBe(false);
  });

  it('flags the prediction-validation loop STALE when predictions are past deadline but none validated', async () => {
    const rows = await checkMarketsLoopHealth(mockDb({ predsPending: 8, predsValidated: 0, runsRecent: 1 }, '2026-05-30'));
    expect(byLoop(rows, 'prediction_validation').stale).toBe(true);
  });

  it('flags the daily workflow STALE when there has been no successful run in the window', async () => {
    const rows = await checkMarketsLoopHealth(mockDb({ runsRecent: 0 }));
    const daily = byLoop(rows, 'daily_intelligence_workflow');
    expect(daily.stale).toBe(true);
    expect(daily.detail).toContain('never');
  });

  it('staleMarketLoops returns only the stale loops', async () => {
    const stale = await staleMarketLoops(mockDb({ patternsPending: 5, patternsApplied: 0, runsRecent: 1 }, '2026-05-30'));
    expect(stale.every((s) => s.stale)).toBe(true);
    expect(stale.map((s) => s.loop)).toContain('pattern_to_weight');
    expect(stale.map((s) => s.loop)).not.toContain('daily_intelligence_workflow');
  });
});
