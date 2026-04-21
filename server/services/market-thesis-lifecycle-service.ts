// ── market-thesis-lifecycle-service.ts ──────────────────────────────────────
// Markets effectiveness M3 — close + archive theses automatically.
//
// The April 2026 audit found 0 of 130 theses ever closed. Without a
// lifecycle sweep the set grows monotonically — the dashboard shows every
// abandoned hypothesis ever scribbled, and the system can't learn "which
// kinds of theses actually pan out" because none reach a terminal state.
//
// Deterministic rules — no LLM spend, safe under MARKETS_THINKING_DISABLED:
//
//   1. outcome_validated  (monitoring → validated)
//      Thesis has ≥3 child predictions, all closed, ≥50% were correct.
//
//   2. outcome_invalidated (monitoring → invalidated)
//      Thesis has ≥3 child predictions, all closed, <50% were correct.
//
//   3. stale_no_activity  (draft/active/monitoring → archived)
//      Thesis is past 2× its declared time-horizon window with no updated_at
//      progress AND no recent child predictions AND no recent linked atoms.
//      Window: short = 60d, medium = 180d, long = 365d (matches the spec
//      comment in migration 050).
//
//   4. redundant_unused   (draft/active → archived)
//      Thesis is ≥60 days old, has zero linked atoms AND zero predictions.
//      Probably abandoned after draft-save with no follow-through.
//
// Transitions stamp closed_at + close_reason so a reviewer can see why.
// Pure arithmetic + DB queries; cron runs daily, idempotent (terminal rows
// are filtered out of the candidate set by the partial index from mig 155).

import type { DatabaseAdapter } from '../db/database.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('market-thesis-lifecycle');

const STALE_DAYS_BY_HORIZON: Record<string, number> = {
  short: 60,
  medium: 180,
  long: 365,
};
const DEFAULT_STALE_DAYS = 180;
const REDUNDANT_UNUSED_DAYS = 60;
const MIN_PREDICTIONS_FOR_OUTCOME = 3;

export type CloseReason =
  | 'outcome_validated'
  | 'outcome_invalidated'
  | 'stale_no_activity'
  | 'redundant_unused'
  | 'manual';

export interface ThesisLifecycleResult {
  theses_considered: number;
  validated: number;
  invalidated: number;
  archived_stale: number;
  archived_redundant: number;
  left_open: number;
  errors: Array<{ thesis_id: string; reason: string }>;
}

interface OpenThesisRow {
  id: string;
  status: string;
  time_horizon: string;
  created_at: string;
  updated_at: string;
}

interface PredictionTally {
  total: number;
  closed: number;
  correct: number;
}

export async function createMarketThesisLifecycleService(db: DatabaseAdapter) {

  /**
   * Sweep every non-terminal thesis and apply the lifecycle rules. Returns
   * a summary suitable for logging or admin-surface display. Idempotent:
   * terminal rows (validated / invalidated / archived) are excluded by the
   * partial index so re-runs only look at rows that can still transition.
   */
  async function applyThesisLifecycle(options: { batchLimit?: number } = {}): Promise<ThesisLifecycleResult> {
    const limit = options.batchLimit ?? 500;

    const open = await db.all<OpenThesisRow>(
      `SELECT id, status, time_horizon, created_at, updated_at
       FROM market_theses
       WHERE status IN ('draft', 'active', 'monitoring')
       ORDER BY updated_at ASC
       LIMIT ?`,
      limit,
    );

    const result: ThesisLifecycleResult = {
      theses_considered: open.length,
      validated: 0, invalidated: 0,
      archived_stale: 0, archived_redundant: 0,
      left_open: 0, errors: [],
    };
    if (open.length === 0) return result;

    for (const thesis of open) {
      try {
        const transition = await evaluateThesis(db, thesis);
        if (!transition) {
          result.left_open++;
          continue;
        }
        await db.run(
          `UPDATE market_theses
             SET status = ?, close_reason = ?, closed_at = NOW(), updated_at = NOW()
           WHERE id = ?`,
          transition.newStatus, transition.reason, thesis.id,
        );
        switch (transition.reason) {
          case 'outcome_validated':   result.validated++; break;
          case 'outcome_invalidated': result.invalidated++; break;
          case 'stale_no_activity':   result.archived_stale++; break;
          case 'redundant_unused':    result.archived_redundant++; break;
          case 'manual':              /* won't fire via sweep */ break;
        }
      } catch (err) {
        result.errors.push({
          thesis_id: thesis.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (result.theses_considered > 0) {
      log.info(
        {
          considered: result.theses_considered,
          validated: result.validated,
          invalidated: result.invalidated,
          archived_stale: result.archived_stale,
          archived_redundant: result.archived_redundant,
          left_open: result.left_open,
          errors: result.errors.length,
        },
        'thesis_lifecycle_sweep_complete',
      );
    }
    return result;
  }

  return { applyThesisLifecycle };
}

export type MarketThesisLifecycleService = Awaited<ReturnType<typeof createMarketThesisLifecycleService>>;

// ── Rules ──────────────────────────────────────────────────────────────────

interface LifecycleTransition {
  newStatus: 'validated' | 'invalidated' | 'archived';
  reason: CloseReason;
}

/**
 * Return the transition a thesis should take this sweep, or null to leave
 * it open. Rule order matters: outcome-based transitions take priority over
 * time-based ones (a thesis that resolved last week shouldn't get archived
 * for staleness).
 */
async function evaluateThesis(db: DatabaseAdapter, thesis: OpenThesisRow): Promise<LifecycleTransition | null> {
  const tally = await tallyPredictions(db, thesis.id);

  // Rule 1 + 2: outcome reached.
  if (tally.total >= MIN_PREDICTIONS_FOR_OUTCOME && tally.closed === tally.total) {
    const accuracy = tally.closed === 0 ? 0 : tally.correct / tally.closed;
    return accuracy >= 0.5
      ? { newStatus: 'validated',   reason: 'outcome_validated' }
      : { newStatus: 'invalidated', reason: 'outcome_invalidated' };
  }

  const ageDays = daysSince(thesis.created_at);
  const sinceUpdateDays = daysSince(thesis.updated_at);

  // Rule 4: redundant (draft/active only — monitoring implies predictions exist).
  if (
    (thesis.status === 'draft' || thesis.status === 'active') &&
    ageDays >= REDUNDANT_UNUSED_DAYS
  ) {
    const atomCount = await countLinkedAtoms(db, thesis.id);
    if (atomCount === 0 && tally.total === 0) {
      return { newStatus: 'archived', reason: 'redundant_unused' };
    }
  }

  // Rule 3: stale by horizon.
  const staleDays = STALE_DAYS_BY_HORIZON[thesis.time_horizon] ?? DEFAULT_STALE_DAYS;
  if (sinceUpdateDays >= staleDays * 2) {
    const recentAtom = await mostRecentLinkedAtom(db, thesis.id);
    const recentAtomDays = recentAtom ? daysSince(recentAtom) : Infinity;
    if (recentAtomDays >= staleDays) {
      return { newStatus: 'archived', reason: 'stale_no_activity' };
    }
  }

  return null;
}

async function tallyPredictions(db: DatabaseAdapter, thesisId: string): Promise<PredictionTally> {
  const row = await db.get<{ total: number | string; closed: number | string; correct: number | string }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status IN ('validated', 'invalidated')) AS closed,
       COUNT(*) FILTER (WHERE was_correct = 1) AS correct
     FROM market_predictions WHERE thesis_id = ?`,
    thesisId,
  );
  return {
    total: Number(row?.total ?? 0),
    closed: Number(row?.closed ?? 0),
    correct: Number(row?.correct ?? 0),
  };
}

async function countLinkedAtoms(db: DatabaseAdapter, thesisId: string): Promise<number> {
  const row = await db.get<{ n: number | string }>(
    `SELECT COUNT(*) AS n FROM market_thesis_atoms WHERE thesis_id = ?`,
    thesisId,
  );
  return Number(row?.n ?? 0);
}

async function mostRecentLinkedAtom(db: DatabaseAdapter, thesisId: string): Promise<string | null> {
  const row = await db.get<{ added_at: string }>(
    `SELECT added_at FROM market_thesis_atoms WHERE thesis_id = ? ORDER BY added_at DESC LIMIT 1`,
    thesisId,
  );
  return row?.added_at ?? null;
}

function daysSince(timestamp: string): number {
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return 0;
  return (Date.now() - t) / (24 * 3600 * 1000);
}
