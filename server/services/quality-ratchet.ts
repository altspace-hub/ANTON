import Database from 'better-sqlite3';
import crypto from 'crypto';

// Quality dimensions scored 0-10
interface QualityScore {
  overall: number;
  completeness: number;   // Does it cover all requested aspects?
  accuracy: number;       // Are claims well-grounded and qualified?
  structure: number;      // Is it well-organized with clear sections?
  actionability: number;  // Are recommendations specific and actionable?
  citations: number;      // Are sources/regulations cited where appropriate?
}

const SCORING_PROMPT = `You are a quality assessor for expert AI outputs in professional services.

Score the following output on these dimensions (0-10 each):
- completeness: Does it address all aspects of the task? Are there obvious gaps?
- accuracy: Are claims qualified appropriately? Are regulatory references correct?
- structure: Is it well-organized with clear headings/sections? Easy to navigate?
- actionability: Are recommendations specific, with owners/timelines where appropriate?
- citations: Are relevant regulations, frameworks, or sources cited?

Respond ONLY with valid JSON:
{
  "completeness": 7,
  "accuracy": 8,
  "structure": 9,
  "actionability": 6,
  "citations": 7,
  "overall": 7.4,
  "strengths": ["Clear structure", "Good regulatory references"],
  "weaknesses": ["Missing timeline on recommendations"],
  "improvement_suggestion": "Add specific deadlines and responsible parties to each action item."
}`;

export function createQualityRatchet(db: Database.Database) {

  async function scoreOutput(params: {
    content: string;
    moduleId: string;
    areaId?: string;
    sessionId?: string;
    anthropicClient?: any;
  }): Promise<{ score: QualityScore; id: string; regressionWarning?: string }> {

    const hash = crypto.createHash('sha256').update(params.content.slice(0, 5000)).digest('hex').slice(0, 16);
    const wordCount = params.content.split(/\s+/).length;

    let scores: QualityScore = { overall: 7.0, completeness: 7, accuracy: 7, structure: 7, actionability: 7, citations: 7 };
    let strengths: string[] = [];
    let weaknesses: string[] = [];
    let improvementSuggestion = '';

    // Use Claude Haiku if client provided
    if (params.anthropicClient) {
      try {
        const response = await params.anthropicClient.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `${SCORING_PROMPT}\n\n---OUTPUT TO SCORE---\n${params.content.slice(0, 3000)}\n---END OUTPUT---`,
          }],
        });
        const rawText = response.content[0]?.type === 'text' ? response.content[0].text : '';
        // Strip markdown code fences (Haiku sometimes wraps JSON in ```json ... ```)
        const text = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          scores = {
            overall: parsed.overall ?? 7,
            completeness: parsed.completeness ?? 7,
            accuracy: parsed.accuracy ?? 7,
            structure: parsed.structure ?? 7,
            actionability: parsed.actionability ?? 7,
            citations: parsed.citations ?? 7,
          };
          strengths = parsed.strengths ?? [];
          weaknesses = parsed.weaknesses ?? [];
          improvementSuggestion = parsed.improvement_suggestion ?? '';
        }
      } catch (e) {
        // Fall through to heuristic scoring — log so we can detect persistent parse failures
        console.warn('[quality-ratchet] Haiku scoring failed, using heuristic fallback:', e instanceof Error ? e.message : e);
        scores = heuristicScore(params.content);
      }
    } else {
      scores = heuristicScore(params.content);
    }

    // Store score
    const id = `qs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO quality_scores
        (id, session_id, module_id, area_id, content_hash, score_overall,
         score_completeness, score_accuracy, score_structure, score_actionability, score_citations, word_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, params.sessionId ?? null, params.moduleId, params.areaId ?? null, hash,
           scores.overall, scores.completeness, scores.accuracy,
           scores.structure, scores.actionability, scores.citations, wordCount);

    // Check regression against baseline
    let regressionWarning: string | undefined;
    const baseline = db.prepare('SELECT * FROM quality_baselines WHERE module_id = ?').get(params.moduleId) as any;

    if (baseline && scores.overall < baseline.baseline_score - 1.5) {
      regressionWarning = `Quality score (${scores.overall.toFixed(1)}) is significantly below baseline (${baseline.baseline_score.toFixed(1)}) for this module.`;
    }

    // Update baseline (rolling average — full weight for automated scores)
    updateBaselineWithWeight(params.moduleId, scores.overall, 1.0);

    return { score: scores, id, regressionWarning };
  }

  function heuristicScore(content: string): QualityScore {
    const wordCount = content.split(/\s+/).length;
    const hasHeadings = (content.match(/^#{1,3} /gm) ?? []).length;
    const hasBullets = (content.match(/^[-*•] /gm) ?? []).length;
    const hasNumbers = (content.match(/\b(article|regulation|directive|section)\s+\d/gi) ?? []).length;

    const structure = Math.min(10, 5 + hasHeadings * 0.5 + hasBullets * 0.1);
    const citations = Math.min(10, 5 + hasNumbers * 1.5);
    const completeness = Math.min(10, 5 + Math.log2(Math.max(wordCount, 100)) * 0.8);
    const overall = (structure + citations + completeness + 7 + 7) / 5;

    return { overall, completeness, accuracy: 7, structure, actionability: 7, citations };
  }

  function updateBaselineWithWeight(moduleId: string, newScore: number, weight = 1.0) {
    const existing = db.prepare('SELECT * FROM quality_baselines WHERE module_id = ?').get(moduleId) as any;
    if (!existing) {
      db.prepare(`
        INSERT INTO quality_baselines (id, module_id, baseline_score, sample_size)
        VALUES (?, ?, ?, 1)
      `).run(`qb_${Date.now()}`, moduleId, newScore);
    } else {
      const n = existing.sample_size;
      // Weighted average: automated scores use weight=1.0, user feedback uses weight=0.5.
      // effectiveN caps the denominator so early scores don't dominate forever.
      // Formula: (baseline * effectiveN + newScore * weight) / (effectiveN + weight)
      const effectiveN = Math.min(n, 9);
      const newBaseline = (existing.baseline_score * effectiveN + newScore * weight) / (effectiveN + weight);
      db.prepare(`
        UPDATE quality_baselines
        SET baseline_score = ?, sample_size = ?, updated_at = ?
        WHERE module_id = ?
      `).run(newBaseline, n + 1, new Date().toISOString(), moduleId);
    }
  }

  function getModuleQualityTrend(moduleId: string, limit = 20) {
    const scores = db.prepare(`
      SELECT * FROM quality_scores WHERE module_id = ? ORDER BY scored_at DESC LIMIT ?
    `).all(moduleId, limit) as any[];
    const baseline = db.prepare('SELECT * FROM quality_baselines WHERE module_id = ?').get(moduleId) as any;
    return { scores: scores.reverse(), baseline };
  }

  function getQualityLeaderboard() {
    const rows = db.prepare(`
      SELECT module_id, baseline_score, sample_size, updated_at
      FROM quality_baselines
      ORDER BY baseline_score DESC
      LIMIT 20
    `).all() as Array<{ module_id: string; baseline_score: number; sample_size: number; updated_at: string }>;

    return rows.map(row => {
      // Get last 5 scores for this module
      const recentScores = db.prepare(`
        SELECT score_overall FROM quality_scores
        WHERE module_id = ?
        ORDER BY scored_at DESC
        LIMIT 5
      `).all(row.module_id) as Array<{ score_overall: number }>;

      let trend_direction: 'up' | 'down' | 'flat' = 'flat';
      if (recentScores.length >= 3) {
        const recentAvg = (recentScores[0].score_overall + recentScores[1].score_overall + recentScores[2].score_overall) / 3;
        const olderCount = recentScores.length - 3;
        if (olderCount >= 1) {
          const olderScores = recentScores.slice(3);
          const olderAvg = olderScores.reduce((sum, s) => sum + s.score_overall, 0) / olderScores.length;
          const diff = recentAvg - olderAvg;
          trend_direction = diff > 0.3 ? 'up' : diff < -0.3 ? 'down' : 'flat';
        }
      }
      return { ...row, trend_direction };
    });
  }

  function submitFeedback(params: {
    sessionId?: string;
    qualityScoreId?: string;
    moduleId: string;
    areaId?: string;
    rating: number;
    comment?: string;
    userId?: string;
  }): { id: string; newBaseline?: number } {
    const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO output_feedback (id, session_id, quality_score_id, module_id, area_id, rating, comment, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.sessionId ?? null,
      params.qualityScoreId ?? null,
      params.moduleId,
      params.areaId ?? null,
      params.rating,
      params.comment ?? null,
      params.userId ?? null,
    );

    // Convert 1–5 star rating to 0–10 quality equivalent
    const qualityEquivalent = (params.rating - 1) * 2.5;

    // Nudge baseline at half the weight of an automated score
    updateBaselineWithWeight(params.moduleId, qualityEquivalent, 0.5);

    const baseline = db.prepare('SELECT baseline_score FROM quality_baselines WHERE module_id = ?').get(params.moduleId) as any;
    return { id, newBaseline: baseline?.baseline_score };
  }

  function getFeedbackStats(moduleId: string): {
    count: number;
    avgRating: number;
    distribution: Record<number, number>;
    recentComments: { rating: number; comment: string; created_at: string }[];
  } {
    const rows = db.prepare(`
      SELECT rating, comment, created_at FROM output_feedback
      WHERE module_id = ? ORDER BY created_at DESC
    `).all(moduleId) as Array<{ rating: number; comment: string | null; created_at: string }>;

    if (rows.length === 0) {
      return { count: 0, avgRating: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, recentComments: [] };
    }

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRating = 0;
    for (const row of rows) {
      distribution[row.rating] = (distribution[row.rating] ?? 0) + 1;
      totalRating += row.rating;
    }

    const recentComments = rows
      .filter((r) => r.comment && r.comment.trim())
      .slice(0, 5)
      .map((r) => ({ rating: r.rating, comment: r.comment as string, created_at: r.created_at }));

    return {
      count: rows.length,
      avgRating: totalRating / rows.length,
      distribution,
      recentComments,
    };
  }

  return { scoreOutput, getModuleQualityTrend, getQualityLeaderboard, submitFeedback, getFeedbackStats };
}
