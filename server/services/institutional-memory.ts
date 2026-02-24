import Database from 'better-sqlite3';
import {
  generateDecisionEmbedding,
  cosineSimilarity,
  findMostSimilar,
  serializeEmbedding,
  deserializeEmbedding,
} from './embeddings.js';
import { nanoid } from 'nanoid';

export function createInstitutionalMemory(db: Database.Database) {

  /**
   * Save a checkpoint decision with automatic embedding generation
   * Adapted to work with existing workflow-based checkpoint_decisions table
   */
  async function saveCheckpointDecision(params: {
    executionId: string;
    workflowId: string;
    stepIndex: number;
    aiRecommendation?: string;
    aiConfidence?: number;
    humanDecision: string;
    humanReasoning?: string;
    isOverride?: boolean;
    overrideCategory?: string;
    contextSnapshot?: any;
    decidedBy: string;
  }): Promise<string> {
    const id = nanoid();

    // Generate embedding for semantic similarity
    const embedding = await generateDecisionEmbedding({
      decisionText: params.humanDecision,
      context: params.contextSnapshot ? JSON.stringify(params.contextSnapshot) : '',
      reasoning: params.humanReasoning || '',
    });

    db.prepare(`
      INSERT INTO checkpoint_decisions
      (id, execution_id, workflow_id, step_index, ai_recommendation, ai_confidence,
       human_decision, human_reasoning, is_override, override_category, context_snapshot,
       decided_by, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.executionId,
      params.workflowId,
      params.stepIndex,
      params.aiRecommendation || null,
      params.aiConfidence ?? null,
      params.humanDecision,
      params.humanReasoning || null,
      params.isOverride ? 1 : 0,
      params.overrideCategory || null,
      params.contextSnapshot ? JSON.stringify(params.contextSnapshot) : null,
      params.decidedBy,
      serializeEmbedding(embedding)
    );

    return id;
  }

  /**
   * Add user feedback to a checkpoint decision (thumbs up/down)
   */
  function addFeedback(checkpointId: string, feedback: 1 | -1) {
    db.prepare(`
      UPDATE checkpoint_decisions
      SET user_feedback = ?, feedback_at = datetime('now')
      WHERE id = ?
    `).run(feedback, checkpointId);
  }

  function getCheckpointHistory(params: {
    workflowId?: string;
    stepIndex?: number;
    decidedBy?: string;
    limit?: number;
  }) {
    let query = 'SELECT * FROM checkpoint_decisions WHERE 1=1';
    const queryParams: any[] = [];

    if (params.workflowId) {
      query += ' AND workflow_id = ?';
      queryParams.push(params.workflowId);
    }

    if (params.stepIndex !== undefined) {
      query += ' AND step_index = ?';
      queryParams.push(params.stepIndex);
    }

    if (params.decidedBy) {
      query += ' AND decided_by = ?';
      queryParams.push(params.decidedBy);
    }

    query += ' ORDER BY decided_at DESC LIMIT ?';
    queryParams.push(params.limit ?? 20);

    const rows = db.prepare(query).all(...queryParams) as any[];

    // Calculate distribution
    const distribution: Record<string, number> = {};
    for (const row of rows) {
      distribution[row.human_decision] = (distribution[row.human_decision] ?? 0) + 1;
    }

    // Feedback analysis
    const positiveFeedback = rows.filter(r => r.user_feedback === 1).length;
    const negativeFeedback = rows.filter(r => r.user_feedback === -1).length;
    const feedbackRate = rows.length > 0
      ? (positiveFeedback + negativeFeedback) / rows.length
      : 0;

    return {
      totalDecisions: rows.length,
      distribution,
      positiveFeedback,
      negativeFeedback,
      feedbackRate,
      recentDecisions: rows.slice(0, 10).map(r => ({
        id: r.id,
        decision: r.human_decision,
        reasoning: r.human_reasoning,
        context: r.context_snapshot,
        workflowId: r.workflow_id,
        stepIndex: r.step_index,
        confidence: r.ai_confidence,
        userFeedback: r.user_feedback,
        createdAt: r.decided_at,
        decidedBy: r.decided_by,
        isOverride: !!r.is_override,
        overrideCategory: r.override_category,
      })),
    };
  }

  /**
   * Find semantically similar decisions using embeddings
   */
  async function getSimilarDecisions(params: {
    decisionText: string;
    context?: string;
    reasoning?: string;
    workflowId?: string;
    decidedBy?: string;
    limit?: number;
    minSimilarity?: number;
  }) {
    // Generate embedding for query decision
    const queryEmbedding = await generateDecisionEmbedding({
      decisionText: params.decisionText,
      context: params.context,
      reasoning: params.reasoning,
    });

    // Fetch all decisions with embeddings
    let query = 'SELECT * FROM checkpoint_decisions WHERE embedding IS NOT NULL';
    const queryParams: any[] = [];

    if (params.workflowId) {
      query += ' AND workflow_id = ?';
      queryParams.push(params.workflowId);
    }

    if (params.decidedBy) {
      query += ' AND decided_by = ?';
      queryParams.push(params.decidedBy);
    }

    const rows = db.prepare(query).all(...queryParams) as any[];

    // Compute similarities
    const similarities = rows.map(row => {
      const embedding = deserializeEmbedding(row.embedding);
      const similarity = cosineSimilarity(queryEmbedding, embedding);

      return {
        id: row.id,
        decision: row.human_decision,
        reasoning: row.human_reasoning?.substring(0, 200),
        context: row.context_snapshot ? JSON.stringify(row.context_snapshot).substring(0, 200) : '',
        workflowId: row.workflow_id,
        stepIndex: row.step_index,
        confidence: row.ai_confidence,
        userFeedback: row.user_feedback,
        createdAt: row.decided_at,
        similarity,
      };
    });

    // Filter by minimum similarity threshold
    const minSim = params.minSimilarity ?? 0.7;
    const filtered = similarities.filter(s => s.similarity >= minSim);

    // Sort by similarity (descending) and take top K
    const sorted = filtered.sort((a, b) => b.similarity - a.similarity);
    const topK = sorted.slice(0, params.limit ?? 10);

    return topK;
  }

  /**
   * Generate decision clusters using k-means-like approach on embeddings
   * Groups similar decisions together for pattern analysis
   */
  async function generateDecisionClusters(params: {
    workflowId?: string;
    decidedBy?: string;
    numClusters?: number;
  }): Promise<Array<{
    id: string;
    clusterName: string;
    representativeDecision: string;
    decisionCount: number;
    avgConfidence: number;
    positiveFeedback: number;
    negativeFeedback: number;
    decisions: Array<{ id: string; decision: string; similarity: number }>;
  }>> {
    // Fetch all decisions with embeddings
    let query = 'SELECT * FROM checkpoint_decisions WHERE embedding IS NOT NULL';
    const queryParams: any[] = [];

    if (params.workflowId) {
      query += ' AND workflow_id = ?';
      queryParams.push(params.workflowId);
    }

    if (params.decidedBy) {
      query += ' AND decided_by = ?';
      queryParams.push(params.decidedBy);
    }

    const rows = db.prepare(query).all(...queryParams) as any[];

    if (rows.length < 3) {
      return []; // Not enough decisions to cluster
    }

    // Simple clustering: group by similarity to most common decisions
    const k = Math.min(params.numClusters ?? 5, Math.floor(rows.length / 3));

    // Find k representative decisions (those with highest average similarity to others)
    const embeddings = rows.map(r => deserializeEmbedding(r.embedding));
    const representatives: number[] = [];

    for (let i = 0; i < k; i++) {
      let maxAvgSim = -1;
      let bestIdx = -1;

      for (let j = 0; j < rows.length; j++) {
        if (representatives.includes(j)) continue;

        let avgSim = 0;
        for (let l = 0; l < rows.length; l++) {
          if (l !== j) {
            avgSim += cosineSimilarity(embeddings[j], embeddings[l]);
          }
        }
        avgSim /= (rows.length - 1);

        if (avgSim > maxAvgSim) {
          maxAvgSim = avgSim;
          bestIdx = j;
        }
      }

      if (bestIdx !== -1) {
        representatives.push(bestIdx);
      }
    }

    // Assign each decision to nearest representative
    const clusters: Map<number, number[]> = new Map();
    representatives.forEach(r => clusters.set(r, []));

    for (let i = 0; i < rows.length; i++) {
      if (representatives.includes(i)) {
        clusters.get(i)!.push(i);
        continue;
      }

      let maxSim = -1;
      let bestRep = representatives[0];

      for (const rep of representatives) {
        const sim = cosineSimilarity(embeddings[i], embeddings[rep]);
        if (sim > maxSim) {
          maxSim = sim;
          bestRep = rep;
        }
      }

      clusters.get(bestRep)!.push(i);
    }

    // Build cluster objects
    const clusterResults = Array.from(clusters.entries()).map(([repIdx, memberIndices]) => {
      const repDecision = rows[repIdx];
      const members = memberIndices.map(idx => rows[idx]);

      const avgConf = members.reduce((sum, m) => sum + (m.ai_confidence || 0), 0) / members.length;
      const posFeedback = members.filter(m => m.user_feedback === 1).length;
      const negFeedback = members.filter(m => m.user_feedback === -1).length;

      return {
        id: `cluster-${nanoid(8)}`,
        clusterName: `Cluster: ${repDecision.human_decision.substring(0, 40)}...`,
        representativeDecision: repDecision.human_decision,
        decisionCount: members.length,
        avgConfidence: avgConf,
        positiveFeedback: posFeedback,
        negativeFeedback: negFeedback,
        decisions: members.map(m => ({
          id: m.id,
          decision: m.human_decision,
          similarity: cosineSimilarity(deserializeEmbedding(m.embedding), deserializeEmbedding(repDecision.embedding)),
        })),
      };
    });

    return clusterResults.sort((a, b) => b.decisionCount - a.decisionCount);
  }

  /**
   * Get insight summary for a workflow or user
   */
  function getInsightSummary(params: {
    workflowId?: string;
    decidedBy?: string;
  }) {
    const history = getCheckpointHistory(params);

    if (history.totalDecisions === 0) {
      return {
        hasHistory: false,
        message: 'No previous decisions recorded yet.',
      };
    }

    const dominantDecision = Object.entries(history.distribution)
      .sort((a, b) => b[1] - a[1])[0];

    const feedbackScore = history.positiveFeedback - history.negativeFeedback;

    return {
      hasHistory: true,
      totalDecisions: history.totalDecisions,
      distribution: history.distribution,
      positiveFeedback: history.positiveFeedback,
      negativeFeedback: history.negativeFeedback,
      feedbackScore,
      dominantDecision: dominantDecision?.[0],
      dominantDecisionRate: dominantDecision ? dominantDecision[1] / history.totalDecisions : 0,
      recentDecisions: history.recentDecisions,
      insight: buildInsightText(history, feedbackScore),
    };
  }

  function buildInsightText(history: any, feedbackScore: number): string {
    const lines: string[] = [];

    if (history.totalDecisions >= 3) {
      const dom = Object.entries(history.distribution as Record<string, number>)
        .sort((a, b) => b[1] - a[1])[0];
      if (dom) {
        const pct = Math.round((dom[1] / history.totalDecisions) * 100);
        lines.push(`Most common decision: "${dom[0]}" (${pct}% of cases)`);
      }
    }

    if (feedbackScore > 0) {
      lines.push(`✓ Positive feedback trend (+${feedbackScore})`);
    } else if (feedbackScore < 0) {
      lines.push(`⚠ Negative feedback trend (${feedbackScore})`);
    }

    if (history.feedbackRate > 0.5) {
      lines.push(`${Math.round(history.feedbackRate * 100)}% of decisions have user feedback.`);
    }

    return lines.join(' • ') || 'Building institutional memory...';
  }

  return {
    saveCheckpointDecision,
    addFeedback,
    getCheckpointHistory,
    getSimilarDecisions,
    generateDecisionClusters,
    getInsightSummary,
  };
}
