/**
 * market-why-chain-insights.ts — Aggregates lessons from why-chain analyses
 *
 * Closes the feedback loop: why-chain insights → prediction generation → portfolio decisions
 *
 * Consumed by:
 * - Thesis generation (avoid blind spots, apply lessons)
 * - Signal weight calibration (downweight unreliable signal types)
 * - Rebalance decisions (flag systemic risk on symbols)
 * - Weekly pulse (calibrate confidence based on failure patterns)
 */

import type { DatabaseAdapter } from '../db/database.js';

// ── Types ──────────────────────────────────────────────────────

export interface SymbolRisk {
  symbol: string;
  riskLevel: 'high' | 'medium' | 'low';
  rootCauses: string[];
  systemic: boolean;
  recentFailures: number;
  lastFailureDate: string;
}

export interface SignalAdjustment {
  signalType: string;
  reliabilityMultiplier: number; // 0.5 = halve weight, 1.0 = no change
  reason: string;
}

export interface AggregatedInsights {
  blindSpots: string[];
  lessons: string[];
  processImprovements: string[];
  symbolRisks: SymbolRisk[];
  signalAdjustments: SignalAdjustment[];
  avoidancePatterns: string[];
  promptContext: string; // Pre-formatted context block for LLM prompts
}

// ── Service ──────────────────────────────────────────────────────

export async function createWhyChainInsightsAggregator(db: DatabaseAdapter) {

  /**
   * Aggregate insights from why-chains completed in the last N days.
   */
  async function getInsights(lookbackDays = 30): Promise<AggregatedInsights> {
    const blindSpots = new Set<string>();
    const lessons = new Set<string>();
    const processImprovements = new Set<string>();
    const avoidancePatterns = new Set<string>();
    const symbolFailures = new Map<string, { causes: Set<string>; systemic: boolean; count: number; lastDate: string }>();
    const signalWeaknesses = new Map<string, number>();

    // 1. Query completed why-chains
    const chains = await db.all<{
      prediction_id: string;
      root_cause_type: string | null;
      root_cause_summary: string | null;
      blind_spots_identified: string | null;
      process_improvements: string | null;
      systemic_impact: string | null;
      completed_at: string;
    }>(`
      SELECT wc.prediction_id, wc.root_cause_type, wc.root_cause_summary,
             wc.blind_spots_identified, wc.process_improvements, wc.systemic_impact,
             wc.completed_at
      FROM market_why_chains wc
      WHERE wc.completed_at >= NOW() - INTERVAL '${lookbackDays} days'
        AND wc.status = 'completed'
      ORDER BY wc.completed_at DESC
    `);

    // 2. Query prediction feedback lessons
    const feedback = await db.all<{
      target_symbol: string | null;
      lessons_learned: string | null;
      explanation: string | null;
    }>(`
      SELECT mp.target_symbol, pf.lessons_learned, pf.explanation
      FROM market_prediction_feedback pf
      JOIN market_predictions mp ON mp.id = pf.prediction_id
      WHERE pf.created_at >= NOW() - INTERVAL '${lookbackDays} days'
        AND pf.lessons_learned IS NOT NULL AND pf.lessons_learned != ''
    `);

    // 3. Query failed predictions with symbols
    const failures = await db.all<{
      target_symbol: string;
      predicted_direction: string;
      confidence: number;
      actual_outcome: string;
      validated_at: string;
    }>(`
      SELECT target_symbol, predicted_direction, confidence, actual_outcome, validated_at
      FROM market_predictions
      WHERE was_correct = 0 AND status = 'validated'
        AND target_symbol IS NOT NULL AND target_symbol != ''
        AND validated_at >= NOW() - INTERVAL '${lookbackDays} days'
    `);

    // 4. Aggregate why-chain insights
    for (const chain of chains) {
      // Blind spots
      if (chain.blind_spots_identified) {
        try {
          const spots = JSON.parse(chain.blind_spots_identified) as string[];
          spots.forEach(s => blindSpots.add(s));
        } catch { if (chain.blind_spots_identified) blindSpots.add(chain.blind_spots_identified); }
      }

      // Process improvements
      if (chain.process_improvements) {
        try {
          const improvements = JSON.parse(chain.process_improvements) as string[];
          improvements.forEach(s => processImprovements.add(s));
        } catch { if (chain.process_improvements) processImprovements.add(chain.process_improvements); }
      }

      // Root cause tracking for signal adjustments
      if (chain.root_cause_type) {
        const count = signalWeaknesses.get(chain.root_cause_type) || 0;
        signalWeaknesses.set(chain.root_cause_type, count + 1);

        if (chain.root_cause_type === 'signal_weakness' || chain.root_cause_type === 'data_gap') {
          avoidancePatterns.add(`Avoid over-relying on ${chain.root_cause_type}: ${chain.root_cause_summary || 'see why-chain'}`);
        }
      }

      // Root cause summary as lesson
      if (chain.root_cause_summary) {
        lessons.add(chain.root_cause_summary);
      }
    }

    // 5. Aggregate feedback lessons
    for (const fb of feedback) {
      if (fb.lessons_learned) lessons.add(fb.lessons_learned);
    }

    // 6. Build symbol risk map
    for (const f of failures) {
      const existing = symbolFailures.get(f.target_symbol) || { causes: new Set(), systemic: false, count: 0, lastDate: '' };
      existing.count++;
      existing.lastDate = f.validated_at > existing.lastDate ? f.validated_at : existing.lastDate;
      symbolFailures.set(f.target_symbol, existing);
    }

    // Cross-reference with systemic impact from why-chains
    for (const chain of chains) {
      if (chain.systemic_impact && chain.prediction_id) {
        const pred = await db.get<{ target_symbol: string }>(
          'SELECT target_symbol FROM market_predictions WHERE id = ?', chain.prediction_id
        );
        if (pred?.target_symbol) {
          const existing = symbolFailures.get(pred.target_symbol) || { causes: new Set(), systemic: false, count: 0, lastDate: '' };
          existing.systemic = true;
          if (chain.root_cause_type) existing.causes.add(chain.root_cause_type);
          symbolFailures.set(pred.target_symbol, existing);
        }
      }
    }

    const symbolRisks: SymbolRisk[] = Array.from(symbolFailures.entries()).map(([symbol, data]) => ({
      symbol,
      riskLevel: data.systemic ? 'high' : data.count >= 3 ? 'high' : data.count >= 2 ? 'medium' : 'low',
      rootCauses: Array.from(data.causes),
      systemic: data.systemic,
      recentFailures: data.count,
      lastFailureDate: data.lastDate,
    }));

    // 7. Build signal adjustments
    const signalAdjustments: SignalAdjustment[] = [];
    for (const [causeType, count] of signalWeaknesses) {
      if (count >= 2) {
        signalAdjustments.push({
          signalType: causeType,
          reliabilityMultiplier: Math.max(0.5, 1.0 - count * 0.15),
          reason: `${count} why-chains identified ${causeType} as root cause`,
        });
      }
    }

    // 8. Build pre-formatted prompt context
    const promptParts: string[] = [];

    if (lessons.size > 0) {
      promptParts.push(`LESSONS FROM RECENT FAILURES (${lookbackDays} days):\n${Array.from(lessons).slice(0, 8).map(l => `- ${l}`).join('\n')}`);
    }

    if (blindSpots.size > 0) {
      promptParts.push(`KNOWN BLIND SPOTS:\n${Array.from(blindSpots).slice(0, 6).map(b => `- ${b}`).join('\n')}`);
    }

    const highRiskSymbols = symbolRisks.filter(s => s.riskLevel === 'high');
    if (highRiskSymbols.length > 0) {
      promptParts.push(`HIGH-RISK SYMBOLS (recent failures):\n${highRiskSymbols.map(s => `- ${s.symbol}: ${s.recentFailures} failures, causes: ${s.rootCauses.join(', ') || 'unknown'}${s.systemic ? ' [SYSTEMIC]' : ''}`).join('\n')}`);
    }

    if (avoidancePatterns.size > 0) {
      promptParts.push(`AVOIDANCE PATTERNS:\n${Array.from(avoidancePatterns).slice(0, 5).map(a => `- ${a}`).join('\n')}`);
    }

    const promptContext = promptParts.length > 0
      ? '\n\n' + promptParts.join('\n\n') + '\n\nApply these lessons and avoid known blind spots when generating new predictions.'
      : '';

    return {
      blindSpots: Array.from(blindSpots),
      lessons: Array.from(lessons),
      processImprovements: Array.from(processImprovements),
      symbolRisks,
      signalAdjustments,
      avoidancePatterns: Array.from(avoidancePatterns),
      promptContext,
    };
  }

  return { getInsights };
}
