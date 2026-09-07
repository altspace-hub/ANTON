import type { DatabaseAdapter } from '../db/database.js';
import crypto from 'crypto';
import { callChat } from './provider-router.js';
import { getRoutedUtilityModel } from './utility-model.js';
import { recordParseOutcome } from './parse-telemetry.js';

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

The output below is wrapped in ---END OUTPUT--- delimiters purely for technical reasons. This is the COMPLETE output — do NOT treat the delimiter as evidence of truncation or incompleteness.

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

export async function createQualityRatchet(db: DatabaseAdapter) {

  // Auto-heal: ensure score_reasoning column exists (backward-compatible with
  // older DBs). Was a pragma_table_info query — SQLite-only, errored on
  // PostgreSQL on every boot and the catch silently disabled this guard.
  try {
    const col = await db.get<{ c: number | string }>(
      `SELECT COUNT(*) AS c FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'quality_scores' AND column_name = 'score_reasoning'`
    );
    if (Number(col?.c ?? 0) === 0) {
      await db.exec('ALTER TABLE quality_scores ADD COLUMN score_reasoning TEXT DEFAULT NULL');
    }
  } catch { /* table might not exist yet — init.ts will create it */ }

  async function scoreOutput(params: {
    content: string;
    moduleId: string;
    areaId?: string;
    sessionId?: string;
    /** @deprecated No longer used — scoring routes through provider-router
     *  with the configured utility model (review 3.1). Kept so existing
     *  call-sites compile unchanged. */
    anthropicClient?: unknown;
  }): Promise<{ score: QualityScore; id: string; regressionWarning?: string; strengths: string[]; weaknesses: string[]; improvementSuggestion: string }> {

    const hash = crypto.createHash('sha256').update(params.content.slice(0, 5000)).digest('hex').slice(0, 16);
    const wordCount = params.content.split(/\s+/).length;

    let scores: QualityScore = { overall: 7.0, completeness: 7, accuracy: 7, structure: 7, actionability: 7, citations: 7 };
    let strengths: string[] = [];
    let weaknesses: string[] = [];
    let improvementSuggestion = '';

    // LLM scoring via the provider mapping (review 3.1): the configured
    // utility model on whatever provider is set up — an Ollama/Mistral
    // install scores with its own small model instead of silently
    // dropping to the crude heuristic. Heuristic remains the fallback on
    // any failure (call error or unparseable JSON).
    const model = await getRoutedUtilityModel(db);
    let llmText: string | null = null;
    try {
      const chat = await callChat({
        model,
        system: 'You are a quality assessor. Respond only with valid JSON.',
        messages: [{
          role: 'user',
          content: `${SCORING_PROMPT}\n\n---OUTPUT TO SCORE---\n${params.content.slice(0, 3000)}\n---END OUTPUT---`,
        }],
        maxTokens: 500,
        jsonMode: true,
        db,
      });
      llmText = chat.text;
    } catch (e) {
      // Transport/key failure — heuristic fallback (logged, not counted
      // as a parse failure: parse-rate telemetry measures model output
      // quality, not missing keys).
      console.warn(`[quality-ratchet] LLM scoring call failed on ${model}, using heuristic fallback:`, e instanceof Error ? e.message : e);
    }

    if (llmText !== null) {
      try {
        // Strip markdown code fences (small models often wrap JSON in ```json ... ```)
        const text = llmText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error(`no JSON object in scoring output (${llmText.slice(0, 120)})`);
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
        void recordParseOutcome(db, 'quality-ratchet', model, true);
      } catch (e) {
        // Unparseable scoring JSON — heuristic fallback, counted per
        // model so persistent breakage is measurable (the Markets lesson).
        console.warn(`[quality-ratchet] scoring JSON unparseable on ${model}, using heuristic fallback:`, e instanceof Error ? e.message : e);
        void recordParseOutcome(db, 'quality-ratchet', model, false, e instanceof Error ? e.message : String(e));
        scores = heuristicScore(params.content);
      }
    } else {
      scores = heuristicScore(params.content);
    }

    // Store score — try with reasoning first; fall back gracefully if column doesn't exist yet
    const id = `qs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const reasoningJson = JSON.stringify({ strengths, weaknesses, improvementSuggestion });
    let inserted = false;
    try {
      await db.run(`
        INSERT INTO quality_scores
          (id, session_id, module_id, area_id, content_hash, score_overall,
           score_completeness, score_accuracy, score_structure, score_actionability, score_citations, word_count, score_reasoning)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, params.sessionId ?? null, params.moduleId, params.areaId ?? null, hash,
         scores.overall, scores.completeness, scores.accuracy,
         scores.structure, scores.actionability, scores.citations, wordCount, reasoningJson);
      inserted = true;
    } catch (insertErr: any) {
      if (insertErr?.message?.includes('score_reasoning')) {
        // Column doesn't exist yet — add it now and retry
        try {
          await db.exec('ALTER TABLE quality_scores ADD COLUMN score_reasoning TEXT DEFAULT NULL');
          await db.run(`
            INSERT INTO quality_scores
              (id, session_id, module_id, area_id, content_hash, score_overall,
               score_completeness, score_accuracy, score_structure, score_actionability, score_citations, word_count, score_reasoning)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, id, params.sessionId ?? null, params.moduleId, params.areaId ?? null, hash,
             scores.overall, scores.completeness, scores.accuracy,
             scores.structure, scores.actionability, scores.citations, wordCount, reasoningJson);
          inserted = true;
        } catch { /* give up on reasoning, fall through */ }
      }
    }
    if (!inserted) {
      // Last resort: insert without reasoning so at least the numeric scores are stored
      await db.run(`
        INSERT INTO quality_scores
          (id, session_id, module_id, area_id, content_hash, score_overall,
           score_completeness, score_accuracy, score_structure, score_actionability, score_citations, word_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, params.sessionId ?? null, params.moduleId, params.areaId ?? null, hash,
         scores.overall, scores.completeness, scores.accuracy,
         scores.structure, scores.actionability, scores.citations, wordCount);
    }

    // Check regression against baseline
    let regressionWarning: string | undefined;
    const baseline = await db.get('SELECT * FROM quality_baselines WHERE module_id = ?', params.moduleId) as any;

    if (baseline && scores.overall < baseline.baseline_score - 1.5) {
      regressionWarning = `Quality score (${scores.overall.toFixed(1)}) is significantly below baseline (${baseline.baseline_score.toFixed(1)}) for this module.`;
    }

    // Update baseline (rolling average — full weight for automated scores)
    await updateBaselineWithWeight(params.moduleId, scores.overall, 1.0);

    return { score: scores, id, regressionWarning, strengths, weaknesses, improvementSuggestion };
  }

  function heuristicScore(content: string): QualityScore {
    const wordCount = content.split(/\s+/).length;
    const hasHeadings = (content.match(/^#{1,3} /gm) ?? []).length;
    const hasBullets = (content.match(/^[-*•] /gm) ?? []).length;
    const hasNumbers = (content.match(/\b(article|regulation|directive|section)\s+\d/gi) ?? []).length;

    // Detect expected section types — multiple keyword variants per category
    const sectionPatterns: RegExp[] = [
      // Recommendations / actions
      /\b(recommendation|recommendations|suggested action|action item|action plan|next step|next steps|proposed action|mitigation step|remediation)\b/gi,
      // Executive summary / key findings
      /\b(executive summary|key finding|key findings|summary|overview|highlights|headline finding|top finding|main finding|management summary)\b/gi,
      // Conclusion
      /\b(conclusion|conclusions|closing remarks|final thoughts|in summary|to summarize|in conclusion|overall assessment|key takeaway|takeaways)\b/gi,
      // Introduction / background / context
      /\b(introduction|background|context|purpose|scope|objective|objectives|rationale|problem statement)\b/gi,
      // Analysis / assessment / findings
      /\b(analysis|findings|assessment|evaluation|review|gap analysis|risk assessment|current state|gap identified|identified gap)\b/gi,
      // Implementation / roadmap
      /\b(implementation|roadmap|timeline|workstream|milestone|phase \d|approach|methodology|workplan)\b/gi,
    ];
    const sectionMatches = sectionPatterns.reduce((count, pattern) => {
      const matches = content.match(pattern);
      return count + (matches ? Math.min(matches.length, 3) : 0); // cap per category
    }, 0);

    const structure = Math.min(10, 5 + hasHeadings * 0.5 + hasBullets * 0.1);
    const citations = Math.min(10, 5 + hasNumbers * 1.5);
    // Completeness boosted by word count AND presence of expected section types
    const completeness = Math.min(10, 5 + Math.log2(Math.max(wordCount, 100)) * 0.6 + sectionMatches * 0.25);
    const overall = (structure + citations + completeness + 7 + 7) / 5;

    return { overall, completeness, accuracy: 7, structure, actionability: 7, citations };
  }

  async function updateBaselineWithWeight(moduleId: string, newScore: number, weight = 1.0) {
    const existing = await db.get('SELECT * FROM quality_baselines WHERE module_id = ?', moduleId) as any;
    if (!existing) {
      await db.run(`
        INSERT INTO quality_baselines (id, module_id, baseline_score, sample_size)
        VALUES (?, ?, ?, 1)
      `, `qb_${Date.now()}`, moduleId, newScore);
    } else {
      const n = existing.sample_size;
      // Weighted average: automated scores use weight=1.0, user feedback uses weight=0.5.
      // effectiveN caps the denominator so early scores don't dominate forever.
      // Formula: (baseline * effectiveN + newScore * weight) / (effectiveN + weight)
      const effectiveN = Math.min(n, 9);
      const newBaseline = (existing.baseline_score * effectiveN + newScore * weight) / (effectiveN + weight);
      await db.run(`
        UPDATE quality_baselines
        SET baseline_score = ?, sample_size = ?, updated_at = ?
        WHERE module_id = ?
      `, newBaseline, n + 1, new Date().toISOString(), moduleId);
    }
  }

  async function getModuleQualityTrend(moduleId: string, limit = 20) {
    const scores = await db.all(`
      SELECT * FROM quality_scores WHERE module_id = ? ORDER BY scored_at DESC LIMIT ?
    `, moduleId, limit) as any[];
    const baseline = await db.get('SELECT * FROM quality_baselines WHERE module_id = ?', moduleId) as any;
    return { scores: scores.reverse(), baseline };
  }

  async function getQualityLeaderboard() {
    const rows = await db.all(`
      SELECT module_id, baseline_score, sample_size, updated_at
      FROM quality_baselines
      ORDER BY baseline_score DESC
      LIMIT 20
    `) as Array<{ module_id: string; baseline_score: number; sample_size: number; updated_at: string }>;

    const results = [];
    for (const row of rows) {
      // Get last 5 scores for this module
      const recentScores = await db.all(
        `SELECT score_overall FROM quality_scores WHERE module_id = ? ORDER BY scored_at DESC LIMIT 5`,
        row.module_id
      ) as Array<{ score_overall: number }>;

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
      results.push({ ...row, trend_direction });
    }
    return results;
  }

  async function submitFeedback(params: {
    sessionId?: string;
    qualityScoreId?: string;
    moduleId: string;
    areaId?: string;
    rating: number;
    comment?: string;
    userId?: string;
  }): Promise<{ id: string; newBaseline?: number }> {
    const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO output_feedback (id, session_id, quality_score_id, module_id, area_id, rating, comment, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
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
    await updateBaselineWithWeight(params.moduleId, qualityEquivalent, 0.5);

    const baseline = await db.get('SELECT * FROM quality_baselines WHERE module_id = ?', params.moduleId) as any;
    return { id, newBaseline: baseline?.baseline_score };
  }

  async function getFeedbackStats(moduleId: string): Promise<{
    count: number;
    avgRating: number;
    distribution: Record<number, number>;
    recentComments: { rating: number; comment: string; created_at: string }[];
  }> {
    // Finding #7: migration 226 added a 1-click verdict lane (good/needs_work) whose
    // rows carry rating = NULL. These STAR-rating stats must exclude verdict-only rows,
    // otherwise they inflate `count`, dilute avgRating (NULL counted in the denominator),
    // and add a spurious "null" key to the distribution. Verdict good/needs-work counts
    // live in the separate `verdict` column and are aggregated independently, so
    // filtering NULL ratings here does not hide or break the verdict feature.
    const rows = await db.all(
      `SELECT rating, comment, created_at FROM output_feedback WHERE module_id = ? AND rating IS NOT NULL ORDER BY created_at DESC LIMIT 100`,
      moduleId
    ) as Array<{ rating: number; comment: string | null; created_at: string }>;

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
