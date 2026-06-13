/**
 * ANTON-specific boost layer for hybrid search results.
 *
 * Applied AFTER Reciprocal Rank Fusion to rerank results using
 * domain-aware signals: confidence, recency, area/module relevance,
 * and superseded status.
 *
 * This is the "professional context" reranking that makes APCI retrieval
 * smarter than generic vector search.
 */

import type { DatabaseAdapter } from '../db/database.js';
import type { HybridSearchResult } from './hybrid-search.js';

export interface BoostContext {
  areaId?: string | null;
  moduleId?: string | null;
  // ANTON Studio Phase 4: when set, atoms scoped to this coding project are the
  // project's OWN lessons — boosted ~2.0x (mirrors the area-1.3x block) so they
  // outrank generic atoms in the next plan/edit of the same project.
  codingProjectId?: string | null;
}

/**
 * Apply ANTON-specific boosts to hybrid search results.
 * Mutates scores in-place and returns results sorted by boosted score.
 *
 * When `db` is provided, past retrieval feedback is used as an additional
 * relevance signal (positive history boosts, negative history penalises).
 */
export async function applyAntonBoosts(
  results: HybridSearchResult[],
  context: BoostContext,
  db?: DatabaseAdapter,
): Promise<HybridSearchResult[]> {
  if (results.length === 0) return results;

  const now = Date.now();

  // ── Batch-load relevance history when DB is available ────────────────
  const feedbackMap = new Map<string, { positive: number; negative: number }>();
  if (db) {
    try {
      const atomIds = results.map(r => r.content_id);
      const placeholders = atomIds.map(() => '?').join(',');
      const rows = await db.all(
        `SELECT atom_id,
                SUM(CASE WHEN was_relevant = 1 THEN 1 ELSE 0 END) as positive,
                SUM(CASE WHEN was_relevant = 0 THEN 1 ELSE 0 END) as negative
         FROM retrieval_feedback
         WHERE atom_id IN (${placeholders}) AND was_relevant IS NOT NULL
         GROUP BY atom_id`
      , ...atomIds) as Array<{ atom_id: string; positive: number; negative: number }>;

      for (const row of rows) {
        feedbackMap.set(row.atom_id, { positive: row.positive, negative: row.negative });
      }
    } catch {
      // retrieval_feedback table may not exist yet — degrade gracefully
    }
  }

  return results
    .map((r) => {
      let boost = 1.0;
      const meta = r.metadata ?? {};

      // ── Confidence boost: 0.5x (low confidence) to 1.0x (high confidence) ──
      const confidence = typeof meta.confidence === 'number' ? meta.confidence : 0.7;
      boost *= 0.5 + confidence * 0.5;

      // ── Recency boost: max 30% penalty for atoms older than ~1 year ──
      const createdAt = typeof meta.created_at === 'string' ? new Date(meta.created_at).getTime() : now;
      const ageDays = Math.max(0, (now - createdAt) / (1000 * 60 * 60 * 24));
      boost *= Math.max(0.7, 1 - (ageDays / 365) * 0.3);

      // ── Area relevance: 1.3x for atoms from the same area ──
      if (context.areaId && meta.source_area_id === context.areaId) {
        boost *= 1.3;
      }

      // ── Module relevance: 1.2x for atoms from the same module ──
      if (context.moduleId && meta.source_module_id === context.moduleId) {
        boost *= 1.2;
      }

      // ── Project relevance (Studio P4): 2.0x for THIS project's own atoms ──
      // The project's captured lessons (test failures, review flags, what works,
      // decisions) are the most relevant context for its own next step.
      if (context.codingProjectId && meta.coding_project_id === context.codingProjectId) {
        boost *= 2.0;
      }

      // ── Superseded penalty: 0.1x for superseded atoms ──
      if (meta.is_superseded === 1 || meta.is_superseded === true || meta.temporal_validity === 'superseded') {
        boost *= 0.1;
      }

      // ── Provenance boost: local atoms preferred over external ──
      const trustLevel = (meta.trust_level as string) || 'local';
      if (trustLevel === 'trusted_peer') boost *= 0.8;
      else if (trustLevel === 'known_peer') boost *= 0.6;
      else if (trustLevel === 'external') boost *= 0.4;
      // 'local' → 1.0 (no change)

      // ── Relevance history boost/penalty from past feedback ──────────
      const fb = feedbackMap.get(r.content_id);
      if (fb) {
        if (fb.negative === 0) {
          // Only positive feedback → boost
          boost *= 1.15;
        } else if (fb.positive === 0) {
          // Only negative feedback → penalise
          boost *= 0.7;
        } else {
          // Mixed → weighted blend from 0.7 (all negative) to 1.15 (all positive)
          boost *= 0.7 + 0.45 * (fb.positive / (fb.positive + fb.negative));
        }
      }

      return { ...r, score: r.score * boost };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Estimate token count for a text string (rough: 1 token ~ 4 chars).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Apply a token budget cap — return as many results as fit within the budget.
 */
export function applyTokenBudget(
  results: HybridSearchResult[],
  maxTokens: number = 4000,
): HybridSearchResult[] {
  let used = 0;
  const selected: HybridSearchResult[] = [];

  for (const r of results) {
    const tokens = estimateTokens(r.content_text);
    if (used + tokens > maxTokens) break;
    selected.push(r);
    used += tokens;
  }

  return selected;
}
