/**
 * cross-workflow-intelligence.ts — Five-layer funnel orchestrator.
 *
 * Wraps the five independently-built services (atom-extractor, knowledge-graph,
 * pattern-detection, quality-ratchet, apprentice) into a single funnel that
 * runs on every workflow output. Each stage is async + isolated — failure in
 * one does NOT abort subsequent stages.
 *
 * Defined per ANTON_Improvement_and_Investigation_Brief.md §E.1.
 *
 * Stages:
 *   1. atom-extract  → atomExtractor.extractAtoms(workflowOutputId)
 *                      (caller is responsible for first writing a workflow_outputs
 *                      row OR may call runFunnelForExistingOutput with a row id)
 *   2. graph-update  → indirect via atom-extractor.detectRelationships()
 *   3. pattern-detect→ patternDetection.detect* (returns arrays directly)
 *   4. quality-score → qualityRatchet.scoreOutput (Haiku-based)
 *   5. apprentice    → apprentice.recordSession (requires userId)
 */

import { randomUUID } from 'crypto';
import type Anthropic from '@anthropic-ai/sdk';
import type { DatabaseAdapter } from '../db/database.js';
import { createAtomExtractor } from './atom-extractor.js';
import { createPatternDetection } from './pattern-detection.js';
import { createQualityRatchet } from './quality-ratchet.js';
import { createApprentice } from './apprentice.js';

// ── Input / Output shapes ──────────────────────────────────────────────

export interface FunnelInput {
  /** Generated text content for atom extraction + quality scoring. */
  content: string;
  /** Module that generated the output. */
  moduleId: string;
  /** Area the module belongs to. */
  areaId: string;
  /** Session that produced the output. */
  sessionId?: string;
  /** Owner of the session — REQUIRED for apprentice progression (Layer 5). */
  userId: string;
  /** Optional Anthropic client (used by atom extractor + quality ratchet). */
  anthropicClient?: Anthropic;
  /**
   * Whether to run pattern-detection this turn. Patterns benefit from running
   * on a periodic schedule (every Nth output) — cheap callers default to false.
   */
  runPatternDetection?: boolean;
  /**
   * If the caller has already persisted a workflow_outputs row, pass the id
   * here to skip the per-funnel-call insert. Otherwise the orchestrator
   * creates a synthetic row first so atom-extraction has a canonical anchor.
   */
  workflowOutputId?: string;
}

export interface StageResult {
  ok: boolean;
  durationMs: number;
  /** Stage-specific summary; differs per stage. */
  summary?: unknown;
  /** Error message when ok=false. Stack trace stripped. */
  error?: string;
}

export interface FunnelResult {
  atomExtract:    StageResult;
  graphUpdate:    StageResult;
  patternDetect:  StageResult;
  qualityScore:   StageResult;
  apprentice:     StageResult;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Run the full funnel for one workflow output. Each stage runs sequentially
 * (so atoms exist before pattern-detection looks at them). All stages are
 * isolated — one failure does not block downstream stages.
 */
export async function runCrossWorkflowFunnel(
  db: DatabaseAdapter,
  input: FunnelInput
): Promise<FunnelResult> {
  const result: FunnelResult = {
    atomExtract:   skip('atom-extract requires anthropic client'),
    graphUpdate:   { ok: true, durationMs: 0, summary: { note: 'graph updated indirectly via atom-extractor' } },
    patternDetect: skip('opt-in (runPatternDetection=false)'),
    qualityScore:  skip('quality-score requires anthropic client'),
    apprentice:    skip('apprentice requires userId'),
  };

  // ── Stage 1: atom extract ───────────────────────────────────────────
  // The atom extractor reads workflow_outputs.<id>; if the caller didn't
  // pre-persist, create a synthetic row first.
  let outputId = input.workflowOutputId ?? null;
  if (input.anthropicClient) {
    result.atomExtract = await runStage(async () => {
      if (!outputId) {
        outputId = randomUUID();
        await db.run(
          `INSERT INTO workflow_outputs
             (id, execution_id, workflow_id, step_index, step_type, area_id,
              module_id, output_data, output_summary, created_by,
              workflow_name, step_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          outputId,
          input.sessionId ?? `synthetic:${outputId}`,
          'cross-workflow-funnel',
          0,
          'llm',
          input.areaId,
          input.moduleId,
          input.content,
          input.content.slice(0, 280),
          input.userId,
          'Cross-Workflow Intelligence Funnel',
          'output'
        );
      }
      const extractor = await createAtomExtractor(db, input.anthropicClient!);
      await extractor.extractAtoms(outputId!);
      return { workflowOutputId: outputId, note: 'atoms extracted' };
    });
  }

  // ── Stage 2: knowledge graph ────────────────────────────────────────
  // The atom extractor calls detectRelationships() internally on success,
  // which writes atom_relationships + atom_entity_links. There is no separate
  // graph-update entry-point in knowledge-graph.ts (factory exposes
  // higher-level builders). Status: stage is genuinely a no-op orchestrated
  // by Layer 1; reflected in the default summary above.

  // ── Stage 3: pattern detection (opt-in) ─────────────────────────────
  if (input.runPatternDetection) {
    result.patternDetect = await runStage(async () => {
      const pd = await createPatternDetection(db);
      const counts: Record<string, number> = {};
      // Each detector returns an array of pattern objects; count them.
      try { const x = await pd.detectTemporalCorrelation();   counts.temporal    = x.length; } catch { /* isolated */ }
      try { const x = await pd.detectEntityConvergence();      counts.convergence = x.length; } catch { /* isolated */ }
      try { const x = await pd.detectCascade();                counts.cascade     = x.length; } catch { /* isolated */ }
      try { const x = await pd.detectTrendDivergence();        counts.trend       = x.length; } catch { /* isolated */ }
      try { const x = await pd.detectGaps();                   counts.gaps        = x.length; } catch { /* isolated */ }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return { patternCounts: counts, total };
    });
  }

  // ── Stage 4: quality ratchet ────────────────────────────────────────
  if (input.anthropicClient) {
    result.qualityScore = await runStage(async () => {
      const qr = await createQualityRatchet(db);
      return await qr.scoreOutput({
        content: input.content,
        moduleId: input.moduleId,
        areaId: input.areaId,
        sessionId: input.sessionId,
        anthropicClient: input.anthropicClient!,
      });
    });
  }

  // ── Stage 5: apprentice ─────────────────────────────────────────────
  // recordSession requires userId; skipped above if absent.
  if (input.userId) {
    result.apprentice = await runStage(async () => {
      const ap = await createApprentice(db);
      const qScore =
        (result.qualityScore.summary as { score?: { overall?: number } } | undefined)?.score?.overall ?? undefined;
      return await ap.recordSession({
        userId: input.userId,
        moduleId: input.moduleId,
        areaId: input.areaId,
        qualityScore: qScore,
      });
    });
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────

function skip(reason: string): StageResult {
  return { ok: true, durationMs: 0, summary: { skipped: reason } };
}

async function runStage(fn: () => Promise<unknown>): Promise<StageResult> {
  const t0 = Date.now();
  try {
    const summary = await fn();
    return { ok: true, durationMs: Date.now() - t0, summary };
  } catch (err) {
    return {
      ok: false,
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Convenience: fire-and-forget — log + swallow any error. Useful from
 * `routes/claude.ts` `onComplete` callback where we don't want funnel work
 * to block the response cycle.
 */
export function runCrossWorkflowFunnelInBackground(
  db: DatabaseAdapter,
  input: FunnelInput,
  opts?: { logger?: (msg: string, data?: unknown) => void }
): void {
  const log = opts?.logger ?? ((m, d) => console.log(`[cross-workflow-funnel] ${m}`, d ?? ''));
  runCrossWorkflowFunnel(db, input)
    .then(result => {
      const summary: Record<string, string> = {};
      for (const [stage, r] of Object.entries(result)) {
        summary[stage] = r.ok ? `ok (${r.durationMs}ms)` : `fail: ${r.error}`;
      }
      log(`completed for module=${input.moduleId} user=${input.userId}`, summary);
    })
    .catch(err => log('unexpected funnel failure', err));
}
