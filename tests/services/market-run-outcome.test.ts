/**
 * market-run-outcome.test.ts
 *
 * runDailyIntelligence reported 'completed' unconditionally, so a run that
 * produced nothing looked identical to one that produced a full day of theses
 * and predictions. Thirty such runs are in the database, going back to March.
 *
 * The status is not cosmetic: three separate gates read it — the same-day dedup
 * guard, the scheduler's alreadyDone check, and the loop-health watchdog — so a
 * barren run reporting success actively blocked the retry that would have
 * salvaged the day, and told the watchdog the loop was fine.
 */

import { describe, it, expect } from 'vitest';
import {
  dailyIntelligenceOutcome,
  THESIS_STEP,
  type StepResultLike,
} from '../../server/services/market-run-outcome.js';

const ok = (step: string): StepResultLike => ({ step, status: 'success', output: {} });

describe('dailyIntelligenceOutcome', () => {
  it('is the 2026-09-04 regression: the thesis step errored, so the run failed', () => {
    // Exactly what the incident recorded: Signal Scanner timed out, and the
    // thesis step then died building its prompt.
    const steps: StepResultLike[] = [
      ok('Fetch Market Data'),
      { step: 'Signal Scanner', status: 'error', error: 'Step "Signal Scanner" timed out after 300000ms' },
      { step: THESIS_STEP, status: 'error', error: "Cannot read properties of undefined (reading 'slice')" },
    ];
    const outcome = dailyIntelligenceOutcome(steps);
    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.reason).toContain('slice');
  });

  it('fails when the thesis step never ran at all', () => {
    const outcome = dailyIntelligenceOutcome([ok('Fetch Market Data')]);
    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.reason).toContain('did not run');
  });

  it('completes when the thesis step succeeded', () => {
    const steps: StepResultLike[] = [ok('Signal Scanner'), ok(THESIS_STEP)];
    expect(dailyIntelligenceOutcome(steps)).toEqual({ status: 'completed' });
  });

  it('does NOT fail a run merely because some other step broke', () => {
    // The loose "any dead letter" predicate would mark 40 of 120 historical
    // completed runs degraded, including ones whose only casualty was a market
    // data fetch the cycle then carried on without. Each of those would become
    // an extra paid LLM retry.
    const steps: StepResultLike[] = [
      { step: 'Fetch Market Data', status: 'error', error: 'timeout' },
      { step: 'Refresh Correlation Map', status: 'skipped' },
      ok(THESIS_STEP),
    ];
    expect(dailyIntelligenceOutcome(steps)).toEqual({ status: 'completed' });
  });

  it('does NOT fail a run where the model simply created nothing', () => {
    // A thesis step that ran and declined is a judgement, not a fault; retrying
    // would ask the same model the same question again.
    const steps: StepResultLike[] = [
      { step: THESIS_STEP, status: 'success', output: { thesesCreated: 0, predictionsCreated: 0 } },
    ];
    expect(dailyIntelligenceOutcome(steps)).toEqual({ status: 'completed' });
  });

  it('treats a skipped thesis step as a failure, not a success', () => {
    // Six steps in this file push 'skipped' alongside a dead letter, so a
    // predicate keyed only on 'error' would under-report exactly the failures
    // that are least visible.
    const outcome = dailyIntelligenceOutcome([{ step: THESIS_STEP, status: 'skipped' }]);
    expect(outcome.status).toBe('failed');
  });
});
