/**
 * market-run-outcome.ts
 * Decides whether a markets workflow run actually did the thing it exists to do.
 *
 * runDailyIntelligence used to end with an unconditional
 * `await updateRun(runId, 'completed')`. Eleven steps each catch their own
 * errors, so no step failure ever reached the run's status: the run reported
 * success whatever happened inside it.
 *
 * That is not a cosmetic problem. 'completed' is load-bearing in three places
 * that all then behave wrongly for a barren run:
 *
 *   - the same-day dedup guard at the top of runDailyIntelligence, which skips
 *     a second run if one already "succeeded" today;
 *   - the scheduler's alreadyDone gate, which asks whether the day's cycle has
 *     already happened before rescuing a missed slot;
 *   - the loop-health watchdog, which reports how long since a successful run.
 *
 * So a run that produced nothing did not merely fail quietly — it actively
 * blocked the retry that would have salvaged the day, and told the watchdog the
 * loop was healthy. On 2026-09-04 that is exactly what happened, and the
 * database shows 30 earlier runs in the same state going back to March.
 *
 * The judgement lives here rather than inline for the reason the recorder and
 * the slot arithmetic do: the orchestrator cannot be exercised in a test, and
 * this is the part with a decision in it.
 */

/** The shape runDailyIntelligence accumulates for each step. */
export interface StepResultLike {
  step: string;
  status: string;
  output?: unknown;
  error?: string;
}

export type RunOutcome =
  | { status: 'completed' }
  | { status: 'failed'; reason: string };

/**
 * The step that writes theses and predictions. Nothing else in the daily cycle
 * produces them, so its outcome is the run's outcome.
 */
export const THESIS_STEP = 'Auto Thesis Generation';

/**
 * Classify a completed pass of the daily-intelligence cycle.
 *
 * Deliberately narrow: only a FAILURE of the thesis step marks the run failed.
 *
 * Not "any dead letter" — that predicate marks 40 of the 120 historical
 * completed runs degraded, including ones whose only casualty was a market-data
 * fetch that the cycle then carried on without. Under a retryable status those
 * would each become an extra paid LLM cycle, so a loose predicate here costs
 * real money.
 *
 * Not "produced zero theses" either. A thesis step that ran and chose to create
 * nothing is the model declining to call anything, which is a judgement rather
 * than a fault; re-running would only ask it the same question again. Only a
 * step that did not succeed is worth another attempt.
 */
export function dailyIntelligenceOutcome(stepResults: readonly StepResultLike[]): RunOutcome {
  const thesisStep = stepResults.find((s) => s.step === THESIS_STEP);
  if (!thesisStep) {
    return { status: 'failed', reason: `${THESIS_STEP} did not run` };
  }
  if (thesisStep.status !== 'success') {
    return {
      status: 'failed',
      reason: `${THESIS_STEP} ${thesisStep.status}: ${thesisStep.error ?? 'no error recorded'}`,
    };
  }
  return { status: 'completed' };
}
