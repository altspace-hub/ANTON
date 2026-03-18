import type { DatabaseAdapter } from '../db/database.js';
import { dateOffsetLiteral } from '../db/dialect-helpers.js';

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketIntelligenceService(db: DatabaseAdapter) {

  // ── Confidence Calibration ───────────────────────────────────────────────

  async function runCalibrationCheck() {
    const buckets = [
      { low: 0, high: 0.2 }, { low: 0.2, high: 0.4 }, { low: 0.4, high: 0.6 },
      { low: 0.6, high: 0.8 }, { low: 0.8, high: 1.01 },
    ];

    for (const bucket of buckets) {
      const row = await db.get<{ total: number; correct: number; avg_conf: number }>(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct,
                AVG(confidence) as avg_conf
         FROM market_predictions WHERE status = 'validated' AND confidence >= ? AND confidence < ?`,
        bucket.low, bucket.high
      );

      const total = row?.total ?? 0;
      if (total < 5) continue;

      const accuracy = (row?.correct ?? 0) / total;
      const avgConf = row?.avg_conf ?? 0;
      const error = Math.abs(avgConf - accuracy);

      await db.run(`
        INSERT INTO market_confidence_calibration (bucket_low, bucket_high, sample_size, actual_accuracy,
                                                     stated_confidence_avg, calibration_error, is_overconfident,
                                                     period_start, period_end)
        VALUES (?, ?, ?, ?, ?, ?, ?, ${dateOffsetLiteral(db.dialect, 90, 'days')}, NOW())
      `, bucket.low, bucket.high, total, accuracy, avgConf, error, avgConf > accuracy ? 1 : 0);
    }

    return { computed: true };
  }

  async function getCalibrationHistory() {
    return await db.all<{
      bucket_low: number; bucket_high: number; sample_size: number;
      actual_accuracy: number; stated_confidence_avg: number;
      calibration_error: number; is_overconfident: number; computed_at: string;
    }>('SELECT * FROM market_confidence_calibration ORDER BY computed_at DESC, bucket_low ASC LIMIT 25');
  }

  // ── Narratives ───────────────────────────────────────────────────────────

  async function createNarrative(params: {
    title: string;
    description: string;
    narrativeType?: string;
    strength?: number;
    beneficiaryEntities?: string[];
    counterNarrative?: string;
    supportingAtoms?: string[];
  }) {
    const id = `mnar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_narratives (id, title, description, narrative_type, strength,
                                      beneficiary_entities, counter_narrative, supporting_atoms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.title, params.description, params.narrativeType ?? 'thematic',
       params.strength ?? 0.5, JSON.stringify(params.beneficiaryEntities ?? []),
       params.counterNarrative ?? null, JSON.stringify(params.supportingAtoms ?? []));
    return id;
  }

  async function listNarratives(lifecycle?: string) {
    const where = lifecycle ? 'WHERE lifecycle = ?' : 'WHERE 1=1';
    const args = lifecycle ? [lifecycle] : [];
    return await db.all<{
      id: string; title: string; description: string; narrative_type: string;
      strength: number; momentum: string; lifecycle: string; created_at: string;
    }>(`SELECT * FROM market_narratives ${where} ORDER BY strength DESC`, ...args);
  }

  async function updateNarrativeLifecycle(id: string, lifecycle: string, momentum: string) {
    await db.run(
      "UPDATE market_narratives SET lifecycle = ?, momentum = ?, updated_at = NOW() WHERE id = ?",
      lifecycle, momentum, id
    );
  }

  // ── Narrative Auto-Detection ─────────────────────────────────────────────
  // Clusters recent atoms by category/sentiment to detect emerging narratives.

  async function detectNarratives() {
    // Query recent atoms (last 14 days) grouped by category and sentiment
    const categoryGroups = await db.all<{
      category: string; sentiment: string; count: number;
    }>(
      `SELECT category, sentiment, COUNT(*) as count
       FROM market_atoms
       WHERE is_active = 1
       AND created_at >= ${dateOffsetLiteral(db.dialect, 14, 'days')}
       AND sentiment IS NOT NULL
       GROUP BY category, sentiment
       HAVING COUNT(*) >= 5
       ORDER BY count DESC`
    );

    const narrativesCreated: Array<{ id: string; title: string; category: string; sentiment: string }> = [];

    // Map category to narrative_type
    const categoryToNarrativeType: Record<string, string> = {
      equity: 'sector_rotation',
      macro: 'macro_theme',
      sector: 'sector_rotation',
      commodity: 'thematic',
      fx: 'macro_theme',
      crypto: 'thematic',
      general: 'thematic',
    };

    for (const group of categoryGroups) {
      // Check if a similar narrative already exists (same category+sentiment, still emerging/active)
      const existing = await db.get<{ id: string }>(
        `SELECT id FROM market_narratives
         WHERE narrative_type = ? AND lifecycle IN ('emerging', 'established')
         AND title LIKE ?
         LIMIT 1`,
        categoryToNarrativeType[group.category] ?? 'thematic',
        `%${group.category}%${group.sentiment}%`
      );

      if (existing) continue;

      // Fetch representative atom content for description
      const sampleAtoms = await db.all<{ content: string; id: string }>(
        `SELECT content, id FROM market_atoms
         WHERE is_active = 1 AND category = ? AND sentiment = ?
         AND created_at >= ${dateOffsetLiteral(db.dialect, 14, 'days')}
         ORDER BY confidence DESC
         LIMIT 5`,
        group.category, group.sentiment
      );

      const supportingAtomIds = sampleAtoms.map(a => a.id);
      const description = sampleAtoms.map(a => a.content).join('; ');

      const narrativeType = categoryToNarrativeType[group.category] ?? 'thematic';
      const strength = Math.min(1, group.count / 20); // Normalize: 20+ atoms → strength 1.0

      const id = await createNarrative({
        title: `Auto-detected: ${group.sentiment} ${group.category} narrative (${group.count} atoms)`,
        description: description.slice(0, 500),
        narrativeType,
        strength,
        supportingAtoms: supportingAtomIds,
      });

      // Set lifecycle to emerging
      await updateNarrativeLifecycle(id, 'emerging', group.sentiment === 'bullish' ? 'accelerating' : group.sentiment === 'bearish' ? 'decelerating' : 'steady');

      narrativesCreated.push({
        id,
        title: `${group.sentiment} ${group.category}`,
        category: group.category,
        sentiment: group.sentiment,
      });
    }

    return {
      detected: narrativesCreated.length,
      narratives: narrativesCreated,
    };
  }

  // ── Meta-Learning ────────────────────────────────────────────────────────

  async function recordLearningEvent(params: {
    learningType: string;
    description: string;
    sourcePredictionId?: string;
  }) {
    const id = `mlearn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_meta_learning (id, learning_type, description, source_prediction_id)
      VALUES (?, ?, ?, ?)
    `, id, params.learningType, params.description, params.sourcePredictionId ?? null);
    return id;
  }

  async function getLearningEvents(limit = 20) {
    return await db.all<{
      id: string; learning_type: string; description: string; impact: string; created_at: string;
    }>('SELECT * FROM market_meta_learning ORDER BY created_at DESC LIMIT ?', limit);
  }

  async function getLearningStats() {
    return await db.all<{ learning_type: string; count: number; avg_impact: string }>(
      `SELECT learning_type, COUNT(*) as count,
              CASE WHEN AVG(CASE WHEN impact = 'high' THEN 3 WHEN impact = 'medium' THEN 2 WHEN impact = 'low' THEN 1 ELSE 0 END) > 2 THEN 'high'
                   WHEN AVG(CASE WHEN impact = 'high' THEN 3 WHEN impact = 'medium' THEN 2 WHEN impact = 'low' THEN 1 ELSE 0 END) > 1 THEN 'medium'
                   ELSE 'low' END as avg_impact
       FROM market_meta_learning GROUP BY learning_type`
    );
  }

  // ── Consul Performance ───────────────────────────────────────────────────

  async function getConsulPerformance() {
    return await db.all<{
      consul_name: string; context_type: string; total_predictions: number;
      correct_predictions: number; accuracy: number; avg_confidence: number;
    }>('SELECT * FROM market_consul_performance ORDER BY accuracy DESC');
  }

  // ── Backtests ────────────────────────────────────────────────────────────

  async function createBacktest(params: {
    name: string;
    description?: string;
    strategyConfig: Record<string, unknown>;
    startDate: string;
    endDate: string;
  }) {
    const id = `mbt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_backtests (id, name, description, strategy_config, start_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `, id, params.name, params.description ?? null,
       JSON.stringify(params.strategyConfig), params.startDate, params.endDate);
    return id;
  }

  async function listBacktests() {
    return await db.all<{
      id: string; name: string; status: string; start_date: string; end_date: string; created_at: string;
    }>('SELECT id, name, status, start_date, end_date, created_at FROM market_backtests ORDER BY created_at DESC');
  }

  return {
    runCalibrationCheck,
    getCalibrationHistory,
    createNarrative,
    listNarratives,
    updateNarrativeLifecycle,
    detectNarratives,
    recordLearningEvent,
    getLearningEvents,
    getLearningStats,
    getConsulPerformance,
    createBacktest,
    listBacktests,
  };
}

export type MarketIntelligenceService = Awaited<ReturnType<typeof createMarketIntelligenceService>>;
