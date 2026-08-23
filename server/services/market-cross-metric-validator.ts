/**
 * market-cross-metric-validator.ts
 * Validates prediction coherence before publication.
 *
 * Checks:
 * 1. Directional consistency — does this prediction conflict with other active predictions for the same symbol?
 * 2. Financial statement coherence — do margin/EPS/cash flow predictions make accounting sense together?
 * 3. Regime alignment — does the direction match the current market regime?
 * 4. Atom consistency — does the prediction align with recent intelligence atoms?
 *
 * Returns a coherence score (0-1) and adjusted confidence.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { isClaimAlreadySettled } from './market-claim-parsers.js';

export interface ValidationResult {
  coherenceScore: number;        // 0 = totally incoherent, 1 = fully coherent
  adjustedConfidence: number;    // Original confidence × coherence penalties
  conflicts: ConflictDetail[];
  flags: string[];               // Human-readable warnings
  pass: boolean;                 // true = OK to publish, false = needs review
  /**
   * false = the claim was ALREADY true at the price it was written against,
   * so it forecasts nothing. Unlike `pass` (advisory, and currently unread by
   * the orchestrator) this is a hard block: the caller must not publish.
   */
  falsifiable: boolean;
  /** Why it was judged unfalsifiable, for the log. */
  falsifiabilityReason?: string;
}

/**
 * How much room a price claim must still have to travel to count as a
 * forecast. Set to zero this only rejects claims spot has already satisfied;
 * a small positive margin also rejects the ones a rounding error away.
 */
export const FALSIFIABILITY_MARGIN_PCT = 0.5;

interface ConflictDetail {
  type: 'directional' | 'financial_coherence' | 'regime' | 'atom_conflict';
  severity: 'high' | 'medium' | 'low';
  description: string;
  penaltyPct: number;  // % to reduce confidence
}

// Financial metrics that must be coherent
const FINANCIAL_METRIC_GROUPS: Record<string, string[]> = {
  profitability: ['operating_margin', 'gross_margin', 'net_margin', 'eps', 'ebitda'],
  cash_flow: ['ocf', 'fcf', 'cash_flow', 'ocf_per_share'],
  growth: ['revenue_growth', 'earnings_growth', 'ebitda_growth'],
  valuation: ['pe_ratio', 'ev_ebitda', 'price_target'],
};

// Keywords that indicate financial metric type
const METRIC_KEYWORDS: Record<string, string[]> = {
  margin: ['margin', 'profitability', 'operating margin', 'gross margin', 'net margin'],
  cash_flow: ['cash flow', 'ocf', 'fcf', 'cash conversion', 'cash generation'],
  earnings: ['eps', 'earnings', 'ebitda', 'net income', 'bottom line'],
  revenue: ['revenue', 'sales', 'top line', 'organic growth'],
  valuation: ['valuation', 'multiple', 'pe ratio', 'ev/ebitda', 'price target'],
};

function detectMetricType(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(METRIC_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return type;
  }
  return null;
}

export async function createCrossMetricValidator(db: DatabaseAdapter) {

  /**
   * Validate a prediction before publication.
   */
  async function validatePrediction(prediction: {
    targetSymbol?: string | null;
    predictedDirection?: string | null;
    confidence: number;
    title: string;
    description: string;
    predictionType?: string;
    /** The machine-written outcome, where a quantified threshold usually sits. */
    predictedOutcome?: string | null;
  }): Promise<ValidationResult> {
    const conflicts: ConflictDetail[] = [];
    const flags: string[] = [];
    let totalPenalty = 0;

    const symbol = prediction.targetSymbol;

    // ── Check 1: Directional consistency with active predictions ─────────
    if (symbol && prediction.predictedDirection) {
      const activePreds = await db.all<{
        id: string; title: string; predicted_direction: string; confidence: number;
      }>(
        `SELECT id, title, predicted_direction, confidence
         FROM market_predictions
         WHERE target_symbol = $1 AND status = 'active' AND predicted_direction IS NOT NULL`,
        symbol
      );

      for (const active of activePreds) {
        if (active.predicted_direction && active.predicted_direction !== prediction.predictedDirection) {
          // Opposing directions — check if it's a meaningful conflict
          const isOpposing = (
            (active.predicted_direction === 'up' && prediction.predictedDirection === 'down') ||
            (active.predicted_direction === 'down' && prediction.predictedDirection === 'up')
          );

          if (isOpposing) {
            const penalty = active.confidence > 0.7 ? 15 : 10;
            conflicts.push({
              type: 'directional',
              severity: 'high',
              description: `Conflicts with active prediction "${active.title}" (${active.predicted_direction}, conf ${active.confidence})`,
              penaltyPct: penalty,
            });
            totalPenalty += penalty;
            flags.push(`CONFLICT: Predicts ${prediction.predictedDirection} but "${active.title}" predicts ${active.predicted_direction}`);
          }
        }
      }
    }

    // ── Check 2: Financial statement coherence ───────────────────────────
    if (symbol) {
      const newMetric = detectMetricType(prediction.title + ' ' + prediction.description);

      if (newMetric) {
        // Find active predictions for the same symbol with related metrics
        const relatedPreds = await db.all<{
          title: string; predicted_direction: string; description: string;
        }>(
          `SELECT title, predicted_direction, description
           FROM market_predictions
           WHERE target_symbol = $1 AND status = 'active'`,
          symbol
        );

        for (const related of relatedPreds) {
          const relatedMetric = detectMetricType(related.title + ' ' + (related.description || ''));
          if (!relatedMetric || relatedMetric === newMetric) continue;

          // Check for known incoherent combinations
          const newDir = prediction.predictedDirection;
          const relDir = related.predicted_direction;

          // Margins up + cash flow down = suspicious (unless working capital explains it)
          if (
            (newMetric === 'margin' && relatedMetric === 'cash_flow' && newDir === 'up' && relDir === 'down') ||
            (newMetric === 'cash_flow' && relatedMetric === 'margin' && newDir === 'down' && relDir === 'up')
          ) {
            conflicts.push({
              type: 'financial_coherence',
              severity: 'high',
              description: `Margin expansion + cash flow decline predicted simultaneously for ${symbol}. This requires explicit working capital deterioration thesis.`,
              penaltyPct: 20,
            });
            totalPenalty += 20;
            flags.push(`ACCOUNTING CONFLICT: ${symbol} — margins and cash flow moving in opposite directions without explanation`);
          }

          // Revenue declining + earnings growing = suspicious (unless massive cost cutting)
          if (
            (newMetric === 'revenue' && relatedMetric === 'earnings' && newDir === 'down' && relDir === 'up') ||
            (newMetric === 'earnings' && relatedMetric === 'revenue' && newDir === 'up' && relDir === 'down')
          ) {
            conflicts.push({
              type: 'financial_coherence',
              severity: 'medium',
              description: `Revenue decline + earnings growth predicted for ${symbol}. Requires cost restructuring thesis.`,
              penaltyPct: 10,
            });
            totalPenalty += 10;
            flags.push(`WARNING: ${symbol} — revenue falling but earnings rising needs explicit cost thesis`);
          }
        }
      }
    }

    // ── Check 3: Atom consistency ────────────────────────────────────────
    if (symbol && prediction.predictedDirection) {
      const recentAtoms = await db.all<{ content: string; atom_type: string; confidence: number }>(
        `SELECT a.content, a.atom_type, a.confidence
         FROM market_atoms a
         JOIN market_atom_entity_links l ON l.atom_id = a.id
         JOIN market_entities e ON e.id = l.entity_id
         WHERE e.symbol = $1 AND a.atom_type IN ('signal', 'prediction', 'insight')
         ORDER BY a.created_at DESC LIMIT 10`,
        symbol
      );

      // Count atoms that support vs oppose the predicted direction
      let supporting = 0, opposing = 0;
      const dirWords: Record<string, string[]> = {
        up: ['bullish', 'positive', 'growth', 'increase', 'outperform', 'beat', 'expansion', 'upgrade'],
        down: ['bearish', 'negative', 'decline', 'decrease', 'underperform', 'miss', 'contraction', 'downgrade'],
      };

      for (const atom of recentAtoms) {
        const lower = atom.content.toLowerCase();
        const supportWords = dirWords[prediction.predictedDirection] || [];
        const opposeWords = dirWords[prediction.predictedDirection === 'up' ? 'down' : 'up'] || [];

        if (supportWords.some(w => lower.includes(w))) supporting++;
        if (opposeWords.some(w => lower.includes(w))) opposing++;
      }

      if (opposing > supporting && opposing >= 3) {
        const penalty = Math.min(15, opposing * 3);
        conflicts.push({
          type: 'atom_conflict',
          severity: 'medium',
          description: `${opposing} recent atoms oppose the ${prediction.predictedDirection} direction vs ${supporting} supporting`,
          penaltyPct: penalty,
        });
        totalPenalty += penalty;
        flags.push(`SIGNAL MISMATCH: ${opposing} atoms oppose prediction direction for ${symbol}`);
      }
    }

    // ── Check 4: Business model similarity for peer extrapolations ─────
    if (symbol) {
      const peerPattern = /(?:like|similar to|following|mirrors?|tracks?|as with)\s+([A-Z]{1,5})\b/gi;
      const combinedText = prediction.title + ' ' + prediction.description;
      const peerMatches = [...combinedText.matchAll(peerPattern)];

      for (const match of peerMatches) {
        const peerSymbol = match[1];
        if (peerSymbol === symbol) continue;
        try {
          const { createBusinessModelSimilarity } = await import('./market-business-model-similarity.js');
          const bms = await createBusinessModelSimilarity(db);
          const sim = await bms.computeSimilarity(symbol, peerSymbol);
          if (!sim.shouldExtrapolate) {
            conflicts.push({ type: 'atom_conflict', severity: 'high', description: `Low similarity with ${peerSymbol} (${(sim.similarity * 100).toFixed(0)}%). ${sim.reasoning}`, penaltyPct: sim.confidencePenalty * 100 });
            totalPenalty += sim.confidencePenalty * 100;
            flags.push(`PEER MISMATCH: ${symbol} vs ${peerSymbol} — ${(sim.similarity * 100).toFixed(0)}% similar`);
          } else if (sim.confidencePenalty > 0) {
            totalPenalty += sim.confidencePenalty * 100;
            flags.push(`PEER: ${symbol}/${peerSymbol} ${(sim.similarity * 100).toFixed(0)}% similar, -${(sim.confidencePenalty * 100).toFixed(0)}% conf`);
          }
        } catch { /* non-fatal */ }
      }
    }

    // ── Check 5: falsifiability ─────────────────────────────────────────
    // A claim the spot price already satisfies is not a forecast. Three of
    // the first 33 graded predictions asked whether SPY would close above
    // 663-665 while it traded at 765-778; all three graded CORRECT and lifted
    // the hit rate from 50.0% to 54.5% between them. Nothing downstream can
    // tell such a claim from a real one, so it has to be stopped here.
    let falsifiable = true;
    let falsifiabilityReason: string | undefined;
    if (symbol) {
      const spot = await db.get<{ close: number }>(
        `SELECT close FROM market_price_normalized
          WHERE symbol = $1 ORDER BY price_date DESC LIMIT 1`,
        symbol,
      );
      const spotPrice = Number(spot?.close);
      if (Number.isFinite(spotPrice) && spotPrice > 0) {
        const verdict = isClaimAlreadySettled(
          `${prediction.predictedOutcome ?? ''} ${prediction.title} ${prediction.description}`,
          spotPrice,
          FALSIFIABILITY_MARGIN_PCT,
        );
        if (verdict.trivial) {
          falsifiable = false;
          falsifiabilityReason = `${symbol}: ${verdict.reason}`;
          flags.push(`UNFALSIFIABLE: ${falsifiabilityReason}`);
        }
      }
      // No price for the symbol → cannot judge, so do not block. A missing
      // spine is a different failure and blocking on it would silently stop
      // prediction generation for every newly-followed instrument.
    }

    // ── Calculate final scores ──────────────────────────────────────────
    const cappedPenalty = Math.min(totalPenalty, 50); // Max 50% penalty
    const adjustedConfidence = Math.max(0.15, prediction.confidence * (1 - cappedPenalty / 100));
    const coherenceScore = Math.max(0, 1 - cappedPenalty / 100);
    const pass = conflicts.filter(c => c.severity === 'high').length === 0;

    return { coherenceScore, adjustedConfidence, conflicts, flags, pass, falsifiable, falsifiabilityReason };
  }

  return { validatePrediction };
}
