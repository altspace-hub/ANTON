import type { DatabaseAdapter } from '../db/database.js';
import { dateOffsetLiteral } from '../db/dialect-helpers.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface PatternRow {
  id: string;
  pattern_type: string;
  title: string;
  description: string;
  severity: string;
  confidence: number;
  affected_entities: string;
  affected_symbols: string;
  evidence_atoms: string;
  metadata: string;
  status: string;
  detected_at: string;
  resolved_at: string | null;
}

type DetectorResult = {
  type: string;
  title: string;
  description: string;
  severity: string;
  confidence: number;
  symbols: string[];
  metadata: Record<string, unknown>;
};

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketPatternService(db: DatabaseAdapter) {

  // ── Pattern CRUD ─────────────────────────────────────────────────────────

  async function recordPattern(params: {
    patternType: string;
    title: string;
    description: string;
    severity?: string;
    confidence?: number;
    affectedEntities?: string[];
    affectedSymbols?: string[];
    evidenceAtoms?: string[];
    metadata?: Record<string, unknown>;
  }) {
    const id = `mpat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_pattern_detections (id, pattern_type, title, description, severity, confidence,
                                              affected_entities, affected_symbols, evidence_atoms, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.patternType, params.title, params.description,
       params.severity ?? 'medium', params.confidence ?? 0.5,
       JSON.stringify(params.affectedEntities ?? []),
       JSON.stringify(params.affectedSymbols ?? []),
       JSON.stringify(params.evidenceAtoms ?? []),
       JSON.stringify(params.metadata ?? {}));
    return id;
  }

  async function listPatterns(params: {
    patternType?: string;
    status?: string;
    severity?: string;
    limit?: number;
  }) {
    let where = 'WHERE 1=1';
    const args: unknown[] = [];

    if (params.patternType) { where += ' AND pattern_type = ?'; args.push(params.patternType); }
    if (params.status) { where += ' AND status = ?'; args.push(params.status); }
    if (params.severity) { where += ' AND severity = ?'; args.push(params.severity); }

    args.push(params.limit ?? 50);

    return await db.all<PatternRow>(
      `SELECT * FROM market_pattern_detections ${where} ORDER BY detected_at DESC LIMIT ?`, ...args
    );
  }

  async function updatePatternStatus(id: string, status: string) {
    const resolvedAt = (status === 'resolved' || status === 'false_positive') ? "NOW()" : 'NULL';
    await db.run(
      `UPDATE market_pattern_detections SET status = ?, resolved_at = ${resolvedAt === 'NULL' ? 'NULL' : "NOW()"} WHERE id = ?`,
      status, id
    );
  }

  // ── Detectors ────────────────────────────────────────────────────────────
  // Each detector analyses recent atoms/data and returns detected patterns

  async function detectMomentumDivergence(): Promise<DetectorResult[]> {
    // Check for price-volume divergence in recent atoms
    const recentAtoms = await db.all<{ content: string; entities: string; sentiment: string }>(
      `SELECT content, entities, sentiment FROM market_atoms
       WHERE is_active = 1 AND atom_type = 'signal'
       AND created_at >= ${dateOffsetLiteral(db.dialect, 7, 'days')}
       ORDER BY created_at DESC LIMIT 100`
    );

    // Simple heuristic: if we have contradicting signals for same entity
    const entitySignals: Record<string, { bullish: number; bearish: number }> = {};
    for (const atom of recentAtoms) {
      // entities is JSONB — arrives pre-parsed from the pg driver; JSON.parse
      // on it threw for every atom, so this detector never fired.
      let entities: Array<{ name?: string; id: string }>;
      if (typeof atom.entities === 'string') {
        try { entities = JSON.parse(atom.entities); } catch { continue; }
      } else {
        entities = atom.entities as unknown as Array<{ name?: string; id: string }>;
      }
      if (!Array.isArray(entities)) continue;
      for (const ent of entities) {
        const key = ent.name ?? ent.id;
        if (!entitySignals[key]) entitySignals[key] = { bullish: 0, bearish: 0 };
        if (atom.sentiment === 'bullish') entitySignals[key].bullish++;
        if (atom.sentiment === 'bearish') entitySignals[key].bearish++;
      }
    }

    const results: DetectorResult[] = [];
    for (const [entity, signals] of Object.entries(entitySignals)) {
      if (signals.bullish >= 3 && signals.bearish >= 3) {
        results.push({
          type: 'momentum_divergence',
          title: `Momentum divergence detected for ${entity}`,
          description: `${signals.bullish} bullish and ${signals.bearish} bearish signals in the last 7 days indicate conflicting momentum`,
          severity: 'medium',
          confidence: 0.6,
          symbols: [entity],
          metadata: { bullish: signals.bullish, bearish: signals.bearish },
        });
      }
    }

    return results;
  }

  async function detectCorrelationBreak(): Promise<DetectorResult[]> {
    // Check if recent correlations deviate significantly from historical
    const recent = await db.all<{ entity_a: string; entity_b: string; correlation: number }>(
      `SELECT entity_a, entity_b, correlation FROM market_correlation_map
       WHERE computed_at >= ${dateOffsetLiteral(db.dialect, 7, 'days')}
       ORDER BY computed_at DESC LIMIT 50`
    );

    // Compare with older correlations
    const results: DetectorResult[] = [];
    for (const entry of recent) {
      const historical = await db.get<{ correlation: number }>(
        `SELECT AVG(correlation) as correlation FROM market_correlation_map
         WHERE entity_a = ? AND entity_b = ? AND computed_at < ${dateOffsetLiteral(db.dialect, 7, 'days')}`,
        entry.entity_a, entry.entity_b
      );

      if (historical && Math.abs(entry.correlation - historical.correlation) > 0.3) {
        results.push({
          type: 'correlation_break',
          title: `Correlation break: ${entry.entity_a} / ${entry.entity_b}`,
          description: `Correlation shifted from ${historical.correlation.toFixed(2)} to ${entry.correlation.toFixed(2)}`,
          severity: Math.abs(entry.correlation - historical.correlation) > 0.5 ? 'high' : 'medium',
          confidence: 0.7,
          symbols: [entry.entity_a, entry.entity_b],
          metadata: { old: historical.correlation, new: entry.correlation },
        });
      }
    }

    return results;
  }

  // ── Regime Detection ─────────────────────────────────────────────────────

  async function detectRegimeChange(): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    // Query recent atoms (last 30 days) and count bearish vs bullish signals
    const sentimentCounts = await db.all<{ sentiment: string; count: number }>(
      `SELECT sentiment, COUNT(*) as count FROM market_atoms
       WHERE is_active = 1 AND sentiment IN ('bullish', 'bearish')
       AND created_at >= ${dateOffsetLiteral(db.dialect, 30, 'days')}
       GROUP BY sentiment`
    );

    const bullishCount = sentimentCounts.find(s => s.sentiment === 'bullish')?.count ?? 0;
    const bearishCount = sentimentCounts.find(s => s.sentiment === 'bearish')?.count ?? 0;
    const totalSentiment = bullishCount + bearishCount;

    // Query recent patterns count by severity
    const patternsBySeverity = await db.all<{ severity: string; count: number }>(
      `SELECT severity, COUNT(*) as count FROM market_pattern_detections
       WHERE status NOT IN ('resolved', 'false_positive')
       AND detected_at >= ${dateOffsetLiteral(db.dialect, 30, 'days')}
       GROUP BY severity`
    );

    const highCriticalPatterns = patternsBySeverity
      .filter(p => p.severity === 'high' || p.severity === 'critical')
      .reduce((sum, p) => sum + p.count, 0);
    const lowPatterns = patternsBySeverity
      .filter(p => p.severity === 'low')
      .reduce((sum, p) => sum + p.count, 0);
    const totalPatterns = patternsBySeverity.reduce((sum, p) => sum + p.count, 0);

    // Determine regime
    let detectedRegime: string | null = null;
    let regimeConfidence = 0;
    let description = '';

    if (totalSentiment > 0) {
      const bearishRatio = bearishCount / totalSentiment;
      const bullishRatio = bullishCount / totalSentiment;

      if (bearishRatio > 0.65 && highCriticalPatterns > 3) {
        detectedRegime = 'bear';
        regimeConfidence = Math.min(0.9, 0.5 + bearishRatio * 0.3 + (highCriticalPatterns / 10) * 0.2);
        description = `Bearish regime detected: ${(bearishRatio * 100).toFixed(0)}% bearish signals, ${highCriticalPatterns} high/critical patterns`;
      } else if (bullishRatio > 0.65 && lowPatterns >= totalPatterns * 0.5) {
        detectedRegime = 'bull';
        regimeConfidence = Math.min(0.9, 0.5 + bullishRatio * 0.3 + 0.1);
        description = `Bullish regime detected: ${(bullishRatio * 100).toFixed(0)}% bullish signals, low-severity patterns dominate`;
      } else if (totalPatterns > 5 && bearishRatio <= 0.65 && bullishRatio <= 0.65) {
        detectedRegime = 'volatile';
        regimeConfidence = 0.6;
        description = `Volatile regime detected: mixed signals (${bullishCount} bullish, ${bearishCount} bearish) with ${totalPatterns} active patterns`;
      }
    }

    // Compare with current regime and record change if significant
    if (detectedRegime) {
      const currentRegime = await getCurrentRegime();
      const regimeChanged = !currentRegime || currentRegime.regime_type !== detectedRegime;

      if (regimeChanged) {
        await recordRegimeChange({
          regimeType: detectedRegime,
          confidence: regimeConfidence,
          evidence: [
            `Bullish signals: ${bullishCount}`,
            `Bearish signals: ${bearishCount}`,
            `High/critical patterns: ${highCriticalPatterns}`,
            `Total patterns: ${totalPatterns}`,
          ],
          impactDescription: description,
        });

        results.push({
          type: 'regime_change',
          title: `Regime change: ${currentRegime?.regime_type ?? 'unknown'} → ${detectedRegime}`,
          description,
          severity: 'high',
          confidence: regimeConfidence,
          symbols: [],
          metadata: {
            previousRegime: currentRegime?.regime_type ?? 'unknown',
            newRegime: detectedRegime,
            bullishCount,
            bearishCount,
            highCriticalPatterns,
            totalPatterns,
          },
        });
      }
    }

    return results;
  }

  // ── Run All Detectors ────────────────────────────────────────────────────

  /** Detect prediction accuracy patterns — directional bias, confidence miscalibration, symbol failures */
  async function detectPredictionAccuracyPatterns(): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    // Need at least 5 validated predictions to detect patterns
    const validatedCount = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM market_predictions WHERE status = 'validated'"
    );
    if (!validatedCount || validatedCount.count < 5) return results;

    // 1. Directional bias: consistently wrong in one direction
    const directionStats = await db.all<{ dir: string; total: number; correct: number }>(`
      SELECT predicted_direction as dir, COUNT(*) as total,
             SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct
      FROM market_predictions
      WHERE status = 'validated' AND predicted_direction IS NOT NULL AND predicted_direction != ''
      GROUP BY predicted_direction HAVING COUNT(*) >= 3
    `);

    for (const stat of directionStats) {
      const accuracy = stat.correct / stat.total;
      if (accuracy <= 0.25 && stat.total >= 3) {
        results.push({
          type: 'directional_bias',
          title: `Systematic failure on "${stat.dir}" predictions`,
          description: `Only ${stat.correct}/${stat.total} (${Math.round(accuracy * 100)}%) of "${stat.dir}" predictions were correct. Consider reducing confidence or avoiding this direction.`,
          severity: 'high',
          confidence: Math.min(0.9, 0.5 + stat.total * 0.05),
          symbols: [],
          metadata: { direction: stat.dir, total: stat.total, correct: stat.correct, accuracy },
        });
      }
    }

    // 2. Confidence miscalibration: predictions at X% confidence hitting much lower
    const calibrationBuckets = await db.all<{ bucket: string; total: number; correct: number; avg_conf: number }>(`
      SELECT
        CASE WHEN confidence >= 0.7 THEN 'high' WHEN confidence >= 0.5 THEN 'medium' ELSE 'low' END as bucket,
        COUNT(*) as total,
        SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct,
        ROUND(AVG(confidence)::numeric, 2) as avg_conf
      FROM market_predictions
      WHERE status = 'validated'
      GROUP BY bucket HAVING COUNT(*) >= 3
    `);

    for (const b of calibrationBuckets) {
      const accuracy = b.correct / b.total;
      const gap = b.avg_conf - accuracy;
      if (gap > 0.25) {
        results.push({
          type: 'confidence_miscalibration',
          title: `Over-confident on ${b.bucket}-confidence predictions`,
          description: `${b.bucket} confidence predictions (avg ${(b.avg_conf * 100).toFixed(0)}%) only hit ${Math.round(accuracy * 100)}%. Calibration gap: ${Math.round(gap * 100)}pp.`,
          severity: gap > 0.4 ? 'high' : 'medium',
          confidence: 0.8,
          symbols: [],
          metadata: { bucket: b.bucket, avgConfidence: b.avg_conf, actualAccuracy: accuracy, gap, total: b.total },
        });
      }
    }

    // 3. Symbol-specific failure: a symbol with 3+ wrong predictions
    const symbolStats = await db.all<{ sym: string; total: number; wrong: number }>(`
      SELECT target_symbol as sym, COUNT(*) as total,
             SUM(CASE WHEN was_correct = 0 THEN 1 ELSE 0 END) as wrong
      FROM market_predictions
      WHERE status = 'validated' AND target_symbol IS NOT NULL AND target_symbol != ''
      GROUP BY target_symbol HAVING SUM(CASE WHEN was_correct = 0 THEN 1 ELSE 0 END) >= 3
    `);

    for (const s of symbolStats) {
      results.push({
        type: 'symbol_failure_cluster',
        title: `Repeated failures on ${s.sym}`,
        description: `${s.wrong}/${s.total} predictions on ${s.sym} were wrong. Consider avoiding or reducing confidence on this symbol.`,
        severity: 'high',
        confidence: 0.85,
        symbols: [s.sym],
        metadata: { symbol: s.sym, total: s.total, wrong: s.wrong, accuracy: (s.total - s.wrong) / s.total },
      });
    }

    // 4. Pulse vs thesis accuracy: compare weekly_pulse predictions to thesis-derived
    const sourceStats = await db.all<{ source: string; total: number; correct: number }>(`
      SELECT
        CASE WHEN key_assumptions::text LIKE '%weekly_pulse%' THEN 'pulse' ELSE 'thesis' END as source,
        COUNT(*) as total,
        SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct
      FROM market_predictions
      WHERE status = 'validated'
      GROUP BY source HAVING COUNT(*) >= 3
    `);

    if (sourceStats.length >= 2) {
      const pulse = sourceStats.find(s => s.source === 'pulse');
      const thesis = sourceStats.find(s => s.source === 'thesis');
      if (pulse && thesis) {
        const pulseAcc = pulse.correct / pulse.total;
        const thesisAcc = thesis.correct / thesis.total;
        if (Math.abs(pulseAcc - thesisAcc) > 0.2) {
          const better = pulseAcc > thesisAcc ? 'pulse' : 'thesis';
          results.push({
            type: 'source_performance_gap',
            title: `${better === 'pulse' ? 'Weekly pulse' : 'Thesis-derived'} predictions significantly outperform`,
            description: `Pulse accuracy: ${Math.round(pulseAcc * 100)}% (${pulse.total}), Thesis accuracy: ${Math.round(thesisAcc * 100)}% (${thesis.total}). Gap: ${Math.round(Math.abs(pulseAcc - thesisAcc) * 100)}pp.`,
            severity: 'medium',
            confidence: 0.7,
            symbols: [],
            metadata: { pulseAccuracy: pulseAcc, thesisAccuracy: thesisAcc, pulseTotal: pulse.total, thesisTotal: thesis.total },
          });
        }
      }
    }

    return results;
  }

  async function runAllDetectors() {
    const allResults: DetectorResult[] = [];
    let patternsDetected = 0;

    try {
      const momentumPatterns = await detectMomentumDivergence();
      allResults.push(...momentumPatterns);
    } catch (err) {
      console.error('[market-patterns] Momentum detector error:', err);
    }

    try {
      const corrPatterns = await detectCorrelationBreak();
      allResults.push(...corrPatterns);
    } catch (err) {
      console.error('[market-patterns] Correlation detector error:', err);
    }

    try {
      const regimePatterns = await detectRegimeChange();
      allResults.push(...regimePatterns);
    } catch (err) {
      console.error('[market-patterns] Regime detector error:', err);
    }

    try {
      const predictionPatterns = await detectPredictionAccuracyPatterns();
      allResults.push(...predictionPatterns);
    } catch (err) {
      console.error('[market-patterns] Prediction accuracy detector error:', err);
    }

    // Record all detected patterns
    for (const result of allResults) {
      await recordPattern({
        patternType: result.type,
        title: result.title,
        description: result.description,
        severity: result.severity,
        confidence: result.confidence,
        affectedSymbols: result.symbols,
        metadata: result.metadata,
      });
      patternsDetected++;
    }

    return { patternsDetected, patterns: allResults };
  }

  // ── Regime Detection ─────────────────────────────────────────────────────

  async function getCurrentRegime() {
    return await db.get<{
      id: string; regime_type: string; confidence: number; started_at: string;
    }>(
      "SELECT * FROM market_regime_history WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
    );
  }

  async function recordRegimeChange(params: {
    regimeType: string;
    confidence: number;
    evidence?: string[];
    impactDescription?: string;
  }) {
    // End current regime
    await db.run(
      "UPDATE market_regime_history SET ended_at = NOW() WHERE ended_at IS NULL"
    );

    const id = `mreg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_regime_history (id, regime_type, confidence, evidence, impact_description)
      VALUES (?, ?, ?, ?, ?)
    `, id, params.regimeType, params.confidence,
       JSON.stringify(params.evidence ?? []),
       params.impactDescription ?? null);
    return id;
  }

  return {
    recordPattern,
    listPatterns,
    updatePatternStatus,
    detectMomentumDivergence,
    detectCorrelationBreak,
    detectRegimeChange,
    detectPredictionAccuracyPatterns,
    runAllDetectors,
    getCurrentRegime,
    recordRegimeChange,
  };
}

export type MarketPatternService = Awaited<ReturnType<typeof createMarketPatternService>>;
