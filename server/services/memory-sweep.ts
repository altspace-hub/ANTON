/**
 * memory-sweep.ts — the retry loop behind the learning ledger (Wave 4).
 *
 * The post-run hook learns from an output as soon as it is stored. When that
 * does not finish — the engine had no background slot, the summariser threw,
 * the server restarted mid-pipeline — the row keeps its state in
 * workflow_outputs.learning_status and this sweep comes back for it. One pass
 * an hour, oldest rows first, a bounded number per pass, and a row that has
 * failed too often is left alone (sweepUnlearnedOutputs holds the rules).
 *
 * Passes never overlap: a pass still running when the timer fires is left to
 * finish and that tick is skipped. Timers are unref'd so they never keep a
 * shutting-down process alive. MEMORY_SWEEP_DISABLED=true turns it off.
 */
import type { DatabaseAdapter } from '../db/database.js';
import { sweepUnlearnedOutputs, type SweepOptions, type SweepResult } from './output-store.js';

export interface MemorySweepOptions extends SweepOptions {
  /** Time between passes. Default one hour. */
  intervalMs?: number;
  /** Delay before the first pass — lets boot finish and the engine warm up. Default two minutes. */
  firstDelayMs?: number;
}

export interface MemorySweepHandle {
  /** Run one pass now. Resolves null when a pass is already in flight. */
  runOnce(): Promise<SweepResult | null>;
  /** True while a pass is in flight. */
  readonly running: boolean;
  /** Clear the timers. */
  stop(): void;
}

export const MEMORY_SWEEP_DISABLED_ENV = 'MEMORY_SWEEP_DISABLED';

/**
 * Register the hourly sweep. Returns null (after one log line) when the env
 * var disables it; otherwise a handle a test or an admin route can drive.
 */
export function startMemorySweep(db: DatabaseAdapter, opts: MemorySweepOptions = {}): MemorySweepHandle | null {
  if (process.env[MEMORY_SWEEP_DISABLED_ENV] === 'true') {
    console.log(`[memory-sweep] disabled (${MEMORY_SWEEP_DISABLED_ENV}=true) — unlearned outputs are not retried`);
    return null;
  }

  const intervalMs = opts.intervalMs ?? 60 * 60 * 1000;
  const firstDelayMs = opts.firstDelayMs ?? 2 * 60 * 1000;
  const sweepOpts: SweepOptions = { limit: opts.limit, olderThanMinutes: opts.olderThanMinutes, maxAttempts: opts.maxAttempts };

  let inFlight = false;

  const runOnce = async (): Promise<SweepResult | null> => {
    if (inFlight) return null;
    inFlight = true;
    try {
      const r = await sweepUnlearnedOutputs(db, sweepOpts);
      console.log(`[memory-sweep] pass: scanned=${r.scanned} learned=${r.learned} failed=${r.failed}${r.stopped ? ' stopped=engine-busy' : ''}`);
      return r;
    } catch (err) {
      console.warn('[memory-sweep] pass failed:', err instanceof Error ? err.message : err);
      return null;
    } finally {
      inFlight = false;
    }
  };

  const first = setTimeout(() => { void runOnce(); }, firstDelayMs);
  first.unref();
  const interval = setInterval(() => { void runOnce(); }, intervalMs);
  interval.unref();

  console.log(`[memory-sweep] registered — first pass in ${Math.round(firstDelayMs / 1000)}s, then every ${Math.round(intervalMs / 60000)} min`);

  return {
    runOnce,
    get running() { return inFlight; },
    stop() {
      clearTimeout(first);
      clearInterval(interval);
    },
  };
}
