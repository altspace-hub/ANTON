// ── market-loop-health.ts ───────────────────────────────────────────────────
// Silent-failure detector for the Markets closed loops.
//
// The April 2026 audit found the pattern→weight learning loop had been frozen
// for ~a month because its query filtered status='active' (a value not in the
// table's vocabulary) and NOTHING noticed — there was no check for "this loop
// reported zero transitions while it had pending work". This is that check.
//
// A loop is STALE when it has pending work but produced zero transitions in the
// recent window. Read-only, cheap, no LLM spend — safe under MARKETS_THINKING_DISABLED.

import type { DatabaseAdapter } from '../db/database.js';

export interface LoopHealth {
  loop: string;
  pending: number;
  recentTransitions: number;
  stale: boolean;
  detail: string;
}

function num(v: unknown): number {
  const n = Number((v as { n?: unknown } | null | undefined)?.n ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function checkMarketsLoopHealth(
  db: DatabaseAdapter,
  opts?: { windowDays?: number },
): Promise<LoopHealth[]> {
  const windowDays = Math.max(1, Math.floor(opts?.windowDays ?? 7));
  const since = `NOW() - INTERVAL '${windowDays} days'`; // windowDays is a sanitised integer
  const findings: LoopHealth[] = [];

  // 1. Pattern → weight loop (the one that silently froze).
  {
    const pending = num(await db.get(
      `SELECT COUNT(*)::int AS n FROM market_pattern_detections
       WHERE applied_to_weights_at IS NULL AND status NOT IN ('resolved','false_positive')`));
    const recent = num(await db.get(
      `SELECT COUNT(*)::int AS n FROM market_pattern_detections
       WHERE applied_to_weights_at >= ${since}`));
    const stale = pending > 0 && recent === 0;
    findings.push({
      loop: 'pattern_to_weight', pending, recentTransitions: recent, stale,
      detail: stale
        ? `${pending} unapplied patterns but 0 applied in ${windowDays}d — loop appears frozen`
        : `${pending} pending, ${recent} applied in ${windowDays}d`,
    });
  }

  // 2. Prediction validation loop.
  {
    const pending = num(await db.get(
      `SELECT COUNT(*)::int AS n FROM market_predictions
       WHERE status != 'validated' AND deadline IS NOT NULL AND deadline < NOW()`));
    const recent = num(await db.get(
      `SELECT COUNT(*)::int AS n FROM market_predictions
       WHERE validated_at >= ${since}`));
    const stale = pending > 0 && recent === 0;
    findings.push({
      loop: 'prediction_validation', pending, recentTransitions: recent, stale,
      detail: stale
        ? `${pending} predictions past deadline but 0 validated in ${windowDays}d — loop appears stalled`
        : `${pending} past-deadline, ${recent} validated in ${windowDays}d`,
    });
  }

  // 3. Daily intelligence workflow heartbeat.
  // NOTE: the schema CHECK on workflow_runs.status only permits
  // 'pending'/'running'/'completed'/'failed'/'cancelled' — the original
  // status='success' filter matched zero rows by construction, so this
  // watchdog cried stale forever (and nothing consumed it). 'success' is kept
  // in the IN-list purely defensively for any pre-CHECK historical rows.
  {
    const lastSuccess = await db.get<{ started_at: string }>(
      `SELECT started_at FROM workflow_runs
       WHERE workflow_id = 'wf_markets_daily_intelligence' AND status IN ('completed','success')
       ORDER BY started_at DESC LIMIT 1`);
    const recent = num(await db.get(
      `SELECT COUNT(*)::int AS n FROM workflow_runs
       WHERE workflow_id = 'wf_markets_daily_intelligence' AND status IN ('completed','success')
         AND started_at >= ${since}`));
    const stale = recent === 0;
    findings.push({
      loop: 'daily_intelligence_workflow', pending: 0, recentTransitions: recent, stale,
      detail: stale
        ? `no successful daily run in ${windowDays}d${lastSuccess?.started_at ? ` (last: ${lastSuccess.started_at})` : ' (never)'}`
        : `${recent} successful runs in ${windowDays}d`,
    });
  }

  // 4. Pattern-consumption → adjustment integrity (the 1.10b failure class).
  // Actionable pattern types marked applied_to_weights_at should normally
  // produce market_signal_weight_adjustments rows. Consumed > 0 with zero
  // adjustments written in the same window means the derivers are silently
  // no-opping (e.g. metadata type coercion) while still stamping patterns
  // as applied — exactly the bug that ate 182 patterns with 0 adjustments.
  {
    const consumed = num(await db.get(
      `SELECT COUNT(*)::int AS n FROM market_pattern_detections
       WHERE applied_to_weights_at >= ${since}
         AND pattern_type IN ('directional_bias','confidence_miscalibration','symbol_failure_cluster')`));
    const adjustments = num(await db.get(
      `SELECT COUNT(*)::int AS n FROM market_signal_weight_adjustments
       WHERE applied_at >= ${since}`));
    const stale = consumed > 0 && adjustments === 0;
    findings.push({
      loop: 'pattern_adjustments_written', pending: consumed, recentTransitions: adjustments, stale,
      detail: stale
        ? `${consumed} actionable patterns consumed but 0 weight adjustments written in ${windowDays}d — derivers appear to be silently no-opping`
        : `${consumed} patterns consumed, ${adjustments} adjustments written in ${windowDays}d`,
    });
  }

  return findings;
}

/** Only the stale loops — what an alert/dashboard would surface. */
export async function staleMarketLoops(
  db: DatabaseAdapter, opts?: { windowDays?: number },
): Promise<LoopHealth[]> {
  return (await checkMarketsLoopHealth(db, opts)).filter((f) => f.stale);
}
