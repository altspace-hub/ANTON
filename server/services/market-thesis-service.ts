import type { DatabaseAdapter } from '../db/database.js';
import type { PgNotifyService } from './pg-notify-service.js';
import Anthropic from '@anthropic-ai/sdk';
import { ilike } from '../db/dialect-helpers.js';

let _pgNotify: PgNotifyService | null = null;
export function setThesisNotifyService(svc: PgNotifyService): void { _pgNotify = svc; }

// ── Types ────────────────────────────────────────────────────────────────────

interface ThesisRow {
  id: string;
  title: string;
  description: string;
  thesis_type: string;
  status: string;
  confidence: number;
  time_horizon: string;
  success_criteria: string;
  key_assumptions: string;
  risk_factors: string;
  target_entities: string;
  ai_score: number | null;
  ai_analysis: string | null;
  created_at: string;
  updated_at: string;
}

interface PredictionRow {
  id: string;
  thesis_id: string | null;
  title: string;
  description: string;
  prediction_type: string;
  target_entity: string | null;
  target_symbol: string | null;
  predicted_outcome: string;
  predicted_value: number | null;
  predicted_direction: string | null;
  confidence: number;
  time_horizon_days: number | null;
  deadline: string | null;
  status: string;
  actual_outcome: string | null;
  actual_value: number | null;
  was_correct: number | null;
  brier_score: number | null;
  key_assumptions: string;
  validated_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketThesisService(db: DatabaseAdapter, client?: Anthropic) {

  // ── Thesis CRUD ──────────────────────────────────────────────────────────

  async function createThesis(params: {
    title: string;
    description: string;
    thesisType?: string;
    confidence?: number;
    timeHorizon?: string;
    successCriteria?: string[];
    keyAssumptions?: string[];
    riskFactors?: string[];
    targetEntities?: string[];
    status?: string;
  }) {
    const id = `mth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_theses (id, title, description, thesis_type, confidence, time_horizon,
                                  success_criteria, key_assumptions, risk_factors, target_entities, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.title, params.description, params.thesisType ?? 'investment',
       params.confidence ?? 0.5, params.timeHorizon ?? 'medium',
       JSON.stringify(params.successCriteria ?? []),
       JSON.stringify(params.keyAssumptions ?? []),
       JSON.stringify(params.riskFactors ?? []),
       JSON.stringify(params.targetEntities ?? []),
       params.status ?? 'active');
    return id;
  }

  async function getThesis(id: string) {
    const thesis = await db.get<ThesisRow>('SELECT * FROM market_theses WHERE id = ?', id);
    if (!thesis) return null;

    const atoms = await db.all<{ atom_id: string; role: string; weight: number }>(
      'SELECT atom_id, role, weight FROM market_thesis_atoms WHERE thesis_id = ? ORDER BY weight DESC', id
    );
    const predictions = await db.all<PredictionRow>(
      'SELECT * FROM market_predictions WHERE thesis_id = ? ORDER BY created_at DESC', id
    );

    return { ...thesis, atoms, predictions };
  }

  async function listTheses(params: {
    status?: string;
    thesisType?: string;
    query?: string;
    limit?: number;
    offset?: number;
  }) {
    let where = 'WHERE 1=1';
    const args: unknown[] = [];

    if (params.status) { where += ' AND status = ?'; args.push(params.status); }
    if (params.thesisType) { where += ' AND thesis_type = ?'; args.push(params.thesisType); }
    if (params.query) {
      where += ` AND (${ilike(db.dialect, 'title')} OR ${ilike(db.dialect, 'description')})`;
      args.push(`%${params.query}%`, `%${params.query}%`);
    }

    args.push(params.limit ?? 50, params.offset ?? 0);

    return await db.all<ThesisRow>(
      `SELECT * FROM market_theses ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      ...args
    );
  }

  async function updateThesis(id: string, updates: {
    title?: string;
    description?: string;
    status?: string;
    confidence?: number;
    timeHorizon?: string;
    successCriteria?: string[];
    keyAssumptions?: string[];
    riskFactors?: string[];
    aiScore?: number;
    aiAnalysis?: string;
  }) {
    const fields: string[] = [];
    const args: unknown[] = [];

    if (updates.title !== undefined) { fields.push('title = ?'); args.push(updates.title); }
    if (updates.description !== undefined) { fields.push('description = ?'); args.push(updates.description); }
    if (updates.status !== undefined) { fields.push('status = ?'); args.push(updates.status); }
    if (updates.confidence !== undefined) { fields.push('confidence = ?'); args.push(updates.confidence); }
    if (updates.timeHorizon !== undefined) { fields.push('time_horizon = ?'); args.push(updates.timeHorizon); }
    if (updates.successCriteria !== undefined) { fields.push('success_criteria = ?'); args.push(JSON.stringify(updates.successCriteria)); }
    if (updates.keyAssumptions !== undefined) { fields.push('key_assumptions = ?'); args.push(JSON.stringify(updates.keyAssumptions)); }
    if (updates.riskFactors !== undefined) { fields.push('risk_factors = ?'); args.push(JSON.stringify(updates.riskFactors)); }
    if (updates.aiScore !== undefined) { fields.push('ai_score = ?'); args.push(updates.aiScore); }
    if (updates.aiAnalysis !== undefined) { fields.push('ai_analysis = ?'); args.push(updates.aiAnalysis); }

    if (fields.length === 0) return;
    fields.push("updated_at = NOW()");
    args.push(id);

    await db.run(`UPDATE market_theses SET ${fields.join(', ')} WHERE id = ?`, ...args);
  }

  async function deleteThesis(id: string) {
    await db.run('DELETE FROM market_theses WHERE id = ?', id);
  }

  // ── Thesis-Atom Linking ──────────────────────────────────────────────────

  async function linkAtom(thesisId: string, atomId: string, role = 'supports', weight = 1.0) {
    await db.run(`
      INSERT INTO market_thesis_atoms (thesis_id, atom_id, role, weight) VALUES (?, ?, ?, ?)
    `, thesisId, atomId, role, weight);
  }

  async function unlinkAtom(thesisId: string, atomId: string) {
    await db.run('DELETE FROM market_thesis_atoms WHERE thesis_id = ? AND atom_id = ?', thesisId, atomId);
  }

  // ── AI Scoring ───────────────────────────────────────────────────────────

  async function scoreThesisWithAI(thesisId: string): Promise<{ score: number; analysis: string } | null> {
    const thesis = await getThesis(thesisId);
    if (!thesis) return null;

    try {
      const { callChat } = await import('./provider-router.js');
      const { getMarketsModel } = await import('./markets-model-store.js');
      const message = await callChat({
        model: await getMarketsModel(db),
        maxTokens: 2048,
        system: `You are a financial analysis quality assessor. Score investment theses on a 0-1 scale.
Consider: clarity of thesis, quality of evidence, falsifiability of predictions, risk awareness, time horizon appropriateness.
Return JSON: { "score": 0.0-1.0, "analysis": "brief assessment", "strengths": [...], "weaknesses": [...] }`,
        messages: [{
          role: 'user',
          content: `Score this thesis:
Title: ${thesis.title}
Description: ${thesis.description}
Type: ${thesis.thesis_type}
Confidence: ${thesis.confidence}
Time Horizon: ${thesis.time_horizon}
Success Criteria: ${thesis.success_criteria}
Key Assumptions: ${thesis.key_assumptions}
Risk Factors: ${thesis.risk_factors}
Supporting atoms: ${thesis.atoms.length}
Predictions: ${thesis.predictions.length}`,
        }],
      });

      const cleaned = message.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      const result = JSON.parse(cleaned) as { score: number; analysis: string };

      await updateThesis(thesisId, { aiScore: result.score, aiAnalysis: result.analysis });
      return result;
    } catch (err) {
      console.error('[market-thesis] AI scoring failed:', err);
      return null;
    }
  }

  // ── Predictions CRUD ─────────────────────────────────────────────────────

  async function createPrediction(params: {
    thesisId?: string;
    title: string;
    description: string;
    predictionType?: string;
    targetEntity?: string;
    targetSymbol?: string;
    predictedOutcome: string;
    predictedValue?: number;
    predictedDirection?: string;
    confidence?: number;
    timeHorizonDays?: number;
    deadline?: string;
    keyAssumptions?: string[];
    horizon?: string;
  }) {
    const id = `mpred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_predictions (id, thesis_id, title, description, prediction_type,
                                       target_entity, target_symbol, predicted_outcome,
                                       predicted_value, predicted_direction, confidence,
                                       time_horizon_days, deadline, key_assumptions, horizon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.thesisId ?? null, params.title, params.description,
       params.predictionType ?? 'directional',
       params.targetEntity ?? null, params.targetSymbol ?? null,
       params.predictedOutcome, params.predictedValue ?? null,
       params.predictedDirection ?? null, params.confidence ?? 0.5,
       params.timeHorizonDays ?? null, params.deadline ?? null,
       JSON.stringify(params.keyAssumptions ?? []),
       params.horizon ?? 'this_month');
    return id;
  }

  async function getPrediction(id: string) {
    return await db.get<PredictionRow>('SELECT * FROM market_predictions WHERE id = ?', id);
  }

  async function listPredictions(params: {
    thesisId?: string;
    status?: string;
    targetSymbol?: string;
    limit?: number;
    offset?: number;
  }) {
    let where = 'WHERE 1=1';
    const args: unknown[] = [];

    if (params.thesisId) { where += ' AND thesis_id = ?'; args.push(params.thesisId); }
    if (params.status) { where += ' AND status = ?'; args.push(params.status); }
    if (params.targetSymbol) { where += ' AND target_symbol = ?'; args.push(params.targetSymbol); }

    args.push(params.limit ?? 50, params.offset ?? 0);

    return await db.all<PredictionRow>(
      `SELECT * FROM market_predictions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...args
    );
  }

  async function validatePrediction(id: string, params: {
    actualOutcome: string;
    actualValue?: number;
    wasCorrect: boolean;
    explanation?: string;
    lessonsLearned?: string;
  }) {
    // Calculate Brier score if we have predicted confidence
    const prediction = await getPrediction(id);
    if (!prediction) return;

    const predicted = prediction.confidence;
    const actual = params.wasCorrect ? 1 : 0;
    const brierScore = (predicted - actual) ** 2;

    await db.run(`
      UPDATE market_predictions SET
        actual_outcome = ?, actual_value = ?, was_correct = ?,
        brier_score = ?, status = 'validated', validated_at = NOW(),
        updated_at = NOW()
      WHERE id = ?
    `, params.actualOutcome, params.actualValue ?? null,
       params.wasCorrect ? 1 : 0, brierScore, id);

    // Create feedback record
    await db.run(`
      INSERT INTO market_prediction_feedback (prediction_id, feedback_type, predicted_value, actual_value,
                                               accuracy_score, explanation, lessons_learned)
      VALUES (?, 'validation', ?, ?, ?, ?, ?)
    `, id, prediction.predicted_value, params.actualValue ?? null,
       1 - brierScore, params.explanation ?? null, params.lessonsLearned ?? null);

    // Auto-update thesis confidence based on prediction track record
    if (prediction.thesis_id) {
      await updateThesisConfidenceFromPredictions(prediction.thesis_id);
    }

    // Notify (PG LISTEN/NOTIFY — no-op on SQLite)
    if (_pgNotify) {
      _pgNotify.notify('market_prediction_validated', { predictionId: id, wasCorrect: params.wasCorrect, brierScore }).catch(() => {});
    }
  }

  // ── Auto-update thesis confidence from predictions ─────────────────────

  async function updateThesisConfidenceFromPredictions(thesisId: string): Promise<void> {
    const thesis = await db.get<ThesisRow>('SELECT * FROM market_theses WHERE id = ?', thesisId);
    if (!thesis) return;

    const validated = await db.all<{ was_correct: number }>(
      "SELECT was_correct FROM market_predictions WHERE thesis_id = ? AND status = 'validated'",
      thesisId
    );
    if (validated.length === 0) return;

    const accuracy = validated.filter(p => p.was_correct === 1).length / validated.length;
    // Adjust confidence: blend current with accuracy-based signal
    const newConfidence = Math.max(0.05, Math.min(0.95, thesis.confidence * (0.5 + accuracy * 0.5)));

    await db.run(
      "UPDATE market_theses SET confidence = ?, updated_at = NOW() WHERE id = ?",
      newConfidence, thesisId
    );
  }

  // ── Track Record Stats ───────────────────────────────────────────────────

  async function getTrackRecord() {
    // Use materialized view on PostgreSQL for pre-aggregated data
    if (db.dialect === 'postgresql') {
      try {
        const mvRows = await db.all<{ prediction_type: string; total: number; correct: number; accuracy: number; avg_brier: number }>(
          'SELECT * FROM mv_prediction_track_record'
        );
        if (mvRows.length > 0) {
          const totalValidated = mvRows.reduce((s, r) => s + r.total, 0);
          const totalCorrect = mvRows.reduce((s, r) => s + r.correct, 0);
          const avgBrier = mvRows.reduce((s, r) => s + (r.avg_brier ?? 0) * r.total, 0) / (totalValidated || 1);
          return {
            totalValidated,
            totalCorrect,
            accuracy: totalValidated > 0 ? totalCorrect / totalValidated : 0,
            averageBrierScore: avgBrier || null,
            byType: mvRows.map(r => ({ prediction_type: r.prediction_type, total: r.total, correct: r.correct })),
          };
        }
      } catch { /* materialized view may not exist yet — fall through */ }
    }

    const total = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_predictions WHERE status = 'validated'");
    const correct = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_predictions WHERE was_correct = 1");
    const avgBrier = await db.get<{ avg: number }>("SELECT AVG(brier_score) as avg FROM market_predictions WHERE brier_score IS NOT NULL");
    const byType = await db.all<{ prediction_type: string; total: number; correct: number }>(
      `SELECT prediction_type, COUNT(*) as total, SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct
       FROM market_predictions WHERE status = 'validated' GROUP BY prediction_type`
    );

    return {
      totalValidated: total?.n ?? 0,
      totalCorrect: correct?.n ?? 0,
      accuracy: total?.n ? (correct?.n ?? 0) / total.n : 0,
      averageBrierScore: avgBrier?.avg ?? null,
      byType,
    };
  }

  return {
    // Theses
    createThesis,
    getThesis,
    listTheses,
    updateThesis,
    deleteThesis,
    linkAtom,
    unlinkAtom,
    scoreThesisWithAI,
    // Predictions
    createPrediction,
    getPrediction,
    listPredictions,
    validatePrediction,
    updateThesisConfidenceFromPredictions,
    getTrackRecord,
  };
}

export type MarketThesisService = Awaited<ReturnType<typeof createMarketThesisService>>;
