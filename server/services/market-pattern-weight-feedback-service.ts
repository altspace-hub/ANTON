// ── market-pattern-weight-feedback-service.ts ──────────────────────────────
// Markets effectiveness M1 — close the pattern → signal-weight loop.
//
// Background: the April 2026 audit found market_pattern_detections had ~120
// rows (confidence_miscalibration, directional_bias, symbol_failure_cluster)
// while market_signal_weights were all still at the default 1.0. Detection
// layer working, application layer silent. This service is the bridge.
//
// Cheap — no LLM spend, pure arithmetic over existing pattern metadata.
// Safe to run under MARKETS_THINKING_DISABLED.
//
// Design:
//   1. Read active, unapplied patterns.
//   2. For each, derive (signal_type, category, multiplier, rationale) from
//      pattern metadata. Bounded deltas + floor to prevent a single noisy
//      pattern from collapsing weights.
//   3. Transactionally: update market_signal_weights, append an entry to
//      market_signal_weight_adjustments, mark pattern as applied.
//
// Multiplier bounds:
//   • [0.5, 1.1] per application (never stronger than halve, cap upside gentle).
//   • Weight floor 0.3 enforced at the UPDATE (matches existing floor in
//     market-workflow-orchestrator.ts).
//
// See BEEHIVE_PROTOCOL_SPEC.md §11 adjacent — similar defensive design for
// feedback pipelines that run automatically without a human per batch.

import type { DatabaseAdapter } from '../db/database.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('market-pattern-feedback');

const WEIGHT_FLOOR = 0.3;
const MIN_MULTIPLIER = 0.5;
const MAX_MULTIPLIER = 1.1;

interface PatternRow {
  id: string;
  pattern_type: string;
  title: string;
  description: string;
  severity: string;
  confidence: number;
  metadata: string;
  status: string;
  detected_at: string;
}

/**
 * Discriminated union of the two weight-target kinds:
 *   • 'signal'  → writes to market_signal_weights at (signal_type, category)
 *   • 'symbol'  → writes to market_symbol_weight_overrides at (symbol) — the
 *                 proper grain for symbol_failure_cluster patterns (M1.1).
 */
type PendingAdjustment =
  | {
      kind: 'signal';
      pattern_id: string;
      pattern_type: string;
      signal_type: string;
      category: string;
      multiplier: number;
      rationale: string;
    }
  | {
      kind: 'symbol';
      pattern_id: string;
      pattern_type: string;
      symbol: string;
      multiplier: number;
      rationale: string;
    };

export interface FeedbackResult {
  patternsConsidered: number;
  patternsApplied: number;
  patternsSkipped: Array<{ pattern_id: string; reason: string }>;
  adjustments: number;
}

export async function createMarketPatternWeightFeedbackService(db: DatabaseAdapter) {
  /**
   * Apply weight deltas for every active pattern that has not yet been
   * applied. Idempotent — re-running does nothing until new patterns arrive.
   * Returns a summary the caller can log or surface in an admin UI.
   */
  async function applyPatternFeedback(options: { batchLimit?: number } = {}): Promise<FeedbackResult> {
    const limit = options.batchLimit ?? 200;

    const patterns = await db.all<PatternRow>(
      `SELECT id, pattern_type, title, description, severity, confidence, metadata, status, detected_at
       FROM market_pattern_detections
       WHERE status NOT IN ('resolved', 'false_positive') AND applied_to_weights_at IS NULL
       ORDER BY detected_at ASC
       LIMIT ?`,
      limit,
    );

    const result: FeedbackResult = {
      patternsConsidered: patterns.length,
      patternsApplied: 0,
      patternsSkipped: [],
      adjustments: 0,
    };
    if (patterns.length === 0) return result;

    for (const pattern of patterns) {
      const adjustments = deriveAdjustments(pattern);
      if (adjustments.length === 0) {
        await db.run(
          `UPDATE market_pattern_detections SET applied_to_weights_at = NOW() WHERE id = ?`,
          pattern.id,
        );
        result.patternsSkipped.push({ pattern_id: pattern.id, reason: 'no-applicable-weight-delta' });
        continue;
      }

      try {
        // Per-pattern transaction: all weight adjustments + the idempotency
        // marker land together, or nothing does. Prevents double-apply if
        // the server restarts mid-pattern.
        const applied = await db.transaction(async (tx) => {
          let changed = 0;
          for (const adj of adjustments) {
            if (await applyOneAdjustment(tx, adj)) changed++;
          }
          await tx.run(
            `UPDATE market_pattern_detections SET applied_to_weights_at = NOW() WHERE id = ?`,
            pattern.id,
          );
          return changed;
        });
        result.adjustments += applied;
        result.patternsApplied++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ patternId: pattern.id, err: msg }, 'apply_feedback_failed');
        result.patternsSkipped.push({ pattern_id: pattern.id, reason: `apply-error: ${msg}` });
      }
    }

    log.info(
      { considered: result.patternsConsidered, applied: result.patternsApplied, adjustments: result.adjustments, skipped: result.patternsSkipped.length },
      'pattern_feedback_complete',
    );
    return result;
  }

  return { applyPatternFeedback };
}

export type MarketPatternWeightFeedbackService = Awaited<ReturnType<typeof createMarketPatternWeightFeedbackService>>;

// ── Translation: pattern → weight adjustments ─────────────────────────────

function deriveAdjustments(pattern: PatternRow): PendingAdjustment[] {
  const metadata = parseMetadata(pattern.metadata);
  switch (pattern.pattern_type) {
    case 'directional_bias':      return deriveFromDirectionalBias(pattern, metadata);
    case 'confidence_miscalibration': return deriveFromMiscalibration(pattern, metadata);
    case 'symbol_failure_cluster': return deriveFromSymbolFailure(pattern, metadata);
    default: return [];
  }
}

/**
 * Directional bias — system consistently wrong on one direction. Down-weight
 * the 'prediction' and 'signal' signal types in the general category because
 * we can't tell which upstream signal produced the biased call. Multiplier
 * = 0.5 + accuracy so 0% accuracy → 0.5x, 25% → 0.75x (noisier patterns get
 * softer corrections).
 */
function deriveFromDirectionalBias(pattern: PatternRow, meta: Record<string, unknown>): PendingAdjustment[] {
  const accuracy = toFiniteNumber(meta.accuracy) ?? 0;
  const total = toFiniteNumber(meta.total) ?? 0;
  const direction = typeof meta.direction === 'string' ? meta.direction : 'unknown';
  if (total < 3) return [];
  const multiplier = clamp(0.5 + accuracy, MIN_MULTIPLIER, MAX_MULTIPLIER);
  const rationale = `directional_bias on '${direction}' (${Math.round(accuracy * 100)}% accuracy over ${total} validated predictions) → down-weight prediction/signal types`;
  return [
    { kind: 'signal', pattern_id: pattern.id, pattern_type: pattern.pattern_type, signal_type: 'prediction', category: 'general', multiplier, rationale },
    { kind: 'signal', pattern_id: pattern.id, pattern_type: pattern.pattern_type, signal_type: 'signal',     category: 'general', multiplier, rationale },
  ];
}

/**
 * Confidence miscalibration — band X of confidence hitting much lower than it
 * claims. Down-weight 'signal' + 'insight' (these drive confidence). Scale:
 * gap 0.25 → 0.875x, gap 0.5 → 0.75x (1 - gap * 0.5, then clamped).
 */
function deriveFromMiscalibration(pattern: PatternRow, meta: Record<string, unknown>): PendingAdjustment[] {
  const gap = toFiniteNumber(meta.gap) ?? 0;
  const bucket = typeof meta.bucket === 'string' ? meta.bucket : 'unknown';
  const total = toFiniteNumber(meta.total) ?? 0;
  if (total < 3 || gap < 0.25) return [];
  const multiplier = clamp(1 - gap * 0.5, MIN_MULTIPLIER, MAX_MULTIPLIER);
  const rationale = `confidence_miscalibration on '${bucket}' bucket (gap ${Math.round(gap * 100)}pp over ${total} predictions) → down-weight signal/insight types`;
  return [
    { kind: 'signal', pattern_id: pattern.id, pattern_type: pattern.pattern_type, signal_type: 'signal',  category: 'general', multiplier, rationale },
    { kind: 'signal', pattern_id: pattern.id, pattern_type: pattern.pattern_type, signal_type: 'insight', category: 'general', multiplier, rationale },
  ];
}

/**
 * Symbol failure cluster — many wrong predictions on one symbol. M1.1
 * routes this to the symbol-grain override table instead of the category
 * fallback so one bad ticker doesn't drag all equity predictions down.
 * Scale: 0.5 + accuracy × 0.5 — tighter than directional_bias (which hits
 * a whole axis) because a symbol override directly multiplies every
 * future prediction's contribution on that ticker.
 */
function deriveFromSymbolFailure(pattern: PatternRow, meta: Record<string, unknown>): PendingAdjustment[] {
  const symbol = typeof meta.symbol === 'string' && meta.symbol.trim() !== '' ? meta.symbol : null;
  const accuracy = toFiniteNumber(meta.accuracy) ?? 0;
  const total = toFiniteNumber(meta.total) ?? 0;
  if (!symbol || total < 3) return [];
  const multiplier = clamp(0.5 + accuracy * 0.5, MIN_MULTIPLIER, MAX_MULTIPLIER);
  const rationale = `symbol_failure_cluster on ${symbol} (${Math.round(accuracy * 100)}% accuracy over ${total} predictions) → symbol-grain override`;
  return [
    { kind: 'symbol', pattern_id: pattern.id, pattern_type: pattern.pattern_type, symbol, multiplier, rationale },
  ];
}

// ── Apply one adjustment transactionally ──────────────────────────────────

async function applyOneAdjustment(db: DatabaseAdapter, adj: PendingAdjustment): Promise<boolean> {
  if (adj.kind === 'signal') {
    return applySignalWeightAdjustment(db, adj);
  }
  return applySymbolOverrideAdjustment(db, adj);
}

async function applySignalWeightAdjustment(
  db: DatabaseAdapter,
  adj: Extract<PendingAdjustment, { kind: 'signal' }>,
): Promise<boolean> {
  // Read current weight (insert default if row missing — signal_types beyond
  // the seed list are valid per the pattern detectors).
  const row = await db.get<{ weight: number | string }>(
    `SELECT weight FROM market_signal_weights WHERE signal_type = ? AND category = ?`,
    adj.signal_type, adj.category,
  );
  const weightBefore = row ? Number(row.weight) : 1.0;
  const weightAfter = Math.max(WEIGHT_FLOOR, weightBefore * adj.multiplier);

  // INSERT-or-UPDATE via the unique constraint on (signal_type, category)
  await db.run(
    `INSERT INTO market_signal_weights (signal_type, category, weight, last_calibrated_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())
     ON CONFLICT (signal_type, category) DO UPDATE SET
       weight = EXCLUDED.weight,
       last_calibrated_at = NOW(),
       updated_at = NOW()`,
    adj.signal_type, adj.category, weightAfter,
  );

  // Audit log — every change observable without replaying pattern metadata.
  await db.run(
    `INSERT INTO market_signal_weight_adjustments
      (pattern_id, pattern_type, signal_type, category, multiplier, weight_before, weight_after, rationale)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    adj.pattern_id, adj.pattern_type, adj.signal_type, adj.category,
    adj.multiplier, weightBefore, weightAfter, adj.rationale,
  );

  return weightAfter !== weightBefore;
}

/**
 * Write/update a per-symbol weight multiplier (M1.1). If a previous
 * multiplier already exists, we compound *geometrically* with the same
 * floor as signal weights. Successive failure clusters on the same symbol
 * therefore tighten the override — they don't reset each time — but never
 * drop below WEIGHT_FLOOR.
 *
 * Audit is written to market_signal_weight_adjustments with signal_type=
 * 'symbol_override' + category='<symbol>' so the existing
 * /weight-adjustments inspection endpoint shows these rows alongside
 * signal-weight changes.
 */
async function applySymbolOverrideAdjustment(
  db: DatabaseAdapter,
  adj: Extract<PendingAdjustment, { kind: 'symbol' }>,
): Promise<boolean> {
  const row = await db.get<{ weight_multiplier: number | string }>(
    `SELECT weight_multiplier FROM market_symbol_weight_overrides WHERE symbol = ?`,
    adj.symbol,
  );
  const weightBefore = row ? Number(row.weight_multiplier) : 1.0;
  const weightAfter = Math.max(WEIGHT_FLOOR, weightBefore * adj.multiplier);

  await db.run(
    `INSERT INTO market_symbol_weight_overrides
      (symbol, weight_multiplier, last_pattern_id, last_applied_at, rationale, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), ?, NOW(), NOW())
     ON CONFLICT (symbol) DO UPDATE SET
       weight_multiplier = EXCLUDED.weight_multiplier,
       last_pattern_id = EXCLUDED.last_pattern_id,
       last_applied_at = NOW(),
       rationale = EXCLUDED.rationale,
       updated_at = NOW()`,
    adj.symbol, weightAfter, adj.pattern_id, adj.rationale,
  );

  await db.run(
    `INSERT INTO market_signal_weight_adjustments
      (pattern_id, pattern_type, signal_type, category, multiplier, weight_before, weight_after, rationale)
     VALUES (?, ?, 'symbol_override', ?, ?, ?, ?, ?)`,
    adj.pattern_id, adj.pattern_type, adj.symbol,
    adj.multiplier, weightBefore, weightAfter, adj.rationale,
  );

  return weightAfter !== weightBefore;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseMetadata(raw: string): Record<string, unknown> {
  if (!raw) return {};
  // Defensive: if the adapter ever hands back an already-parsed object
  // (jsonb column), don't JSON.parse a "[object Object]" string.
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { return {}; }
}

/**
 * Coerce a metadata value to a finite number, or null.
 *
 * Load-bearing (plan 1.10b): the pattern detectors build metadata from pg
 * aggregate queries — pg returns COUNT()/SUM() bigints as STRINGS, so the
 * stored JSON is e.g. {"total":"9","accuracy":0}. The old
 * `typeof meta.total === 'number'` checks therefore always read 0 and every
 * deriver bailed on its `total < 3` guard — 182 patterns were consumed with
 * zero market_signal_weight_adjustments ever written.
 */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
