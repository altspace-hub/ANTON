/**
 * coding-integration.ts
 *
 * Ties coding area outputs to quality scoring, versioning, and knowledge extraction.
 * Follows the factory function pattern used by quality-ratchet and atom-extractor.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import { createQualityRatchet } from './quality-ratchet.js';
import { createAtomExtractor } from './atom-extractor.js';
import { computeDiff, computeStats, buildSemanticSummary } from './version-diff.js';
import { embedAndStore } from './hybrid-search.js';

// ── ANTON Studio Phase 4: project-scoped coding-atoms (active memory) ────────
//
// Coding signals become PROJECT-SCOPED atoms (knowledge_atoms.coding_project_id
// + atom_origin, migration 239) that are injected into the NEXT plan/edit of the
// SAME project (buildAtomLayer's codingProjectId + the atom-boost project match).
//
// DESIGN (CODING_STUDIO_DESIGN_2026-06-13.md §C-req3 / §D.6): PREFER NO-LLM
// deterministic minting — test pass/fail, CVE counts, panel verdicts are EXACT
// data; we just format them. No LLM call is burned on a structured signal.
//
// CODING_ATOM_TYPES — the five taxonomy entries (atom_type values). They reuse
// the existing knowledge_atoms taxonomy roots (risk.identified / decision.approval
// already exist; test.failed / pattern.works / review.flag are coding-specific
// children) so nothing downstream needs to learn a new vocabulary.
export const CODING_ATOM_TYPES = {
  TEST_FAILED: 'test.failed',
  PATTERN_WORKS: 'pattern.works',
  REVIEW_FLAG: 'review.flag',
  RISK_IDENTIFIED: 'risk.identified',
  DECISION_APPROVAL: 'decision.approval',
} as const;

export type CodingAtomType = (typeof CODING_ATOM_TYPES)[keyof typeof CODING_ATOM_TYPES];

/** Free-text provenance tags written to knowledge_atoms.atom_origin. */
export const CODING_ATOM_ORIGINS = {
  TEST_FAILURE: 'test_failure',
  PATTERN_WORKS: 'pattern_works',
  REVIEW_FLAG: 'review_flag',
  BUG: 'bug',
  CVE: 'cve',
  ARCH_DECISION: 'arch_decision',
} as const;

export interface MintCodingAtomParams {
  projectId: string;
  /** One of CODING_ATOM_TYPES (the knowledge_atoms.atom_type value). */
  type: CodingAtomType;
  /** Provenance tag (CODING_ATOM_ORIGINS) → knowledge_atoms.atom_origin. */
  origin: string;
  /** The lesson as one clear sentence (kept under ~280 chars). */
  text: string;
  /** Coarse category root (defaults derived from the atom_type prefix). */
  category?: string;
  confidence?: number;
  /** Optional task scope — recorded as a tag for later attribution. */
  taskId?: string | null;
}

/** Map an atom_type like 'risk.identified' to its category root ('risk'). */
function categoryFromType(type: string): string {
  const root = type.split('.')[0];
  // knowledge_atoms.category vocabulary: observation|decision|action|risk|status|recommendation
  if (['observation', 'decision', 'action', 'risk', 'status', 'recommendation'].includes(root)) {
    return root;
  }
  // test.* / pattern.* / review.* → 'observation' (they are findings about the build)
  return 'observation';
}

// ── Types ──────────────────────────────────────────────────────

interface ScoreResult {
  score: {
    overall: number;
    completeness: number;
    accuracy: number;
    structure: number;
    actionability: number;
    citations: number;
  };
  id: string;
  regressionWarning?: string;
}

interface VersionRecord {
  id: number;
  version_number: number;
  label: string | null;
  created_at: string;
  content_length: number;
}

interface SavedVersion {
  id: number;
  version_number: number;
  label: string | null;
}

interface DiffResult {
  chunks: any[];
  stats: any;
  summary: string;
}

// ── Factory ────────────────────────────────────────────────────

export async function createCodingIntegration(db: DatabaseAdapter, anthropicClient?: any) {

  // ── Helpers ────────────────────────────────────────────────────

  async function tableExists(tableName: string): Promise<boolean> {
    const row = await db.get(
      "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = ?"
    , tableName) as { name: string } | undefined;
    return !!row;
  }

  // ── scoreOutput ────────────────────────────────────────────────

  async function scoreOutput(
    content: string,
    moduleId: string,
    areaId: string = 'coding',
    sessionId?: string
  ): Promise<ScoreResult | null> {
    try {
      const ratchet = await createQualityRatchet(db);
      const result = await ratchet.scoreOutput({
        content,
        moduleId,
        areaId,
        sessionId,
        anthropicClient,
      });
      return result;
    } catch (error) {
      console.error('[coding-integration] scoreOutput error (non-fatal):', error);
      return null;
    }
  }

  // ── saveVersion ────────────────────────────────────────────────

  async function saveVersion(
    entityType: string,
    entityId: string,
    content: string,
    label?: string
  ): Promise<SavedVersion> {
    // Get current max version_number for this entity
    const maxRow = await db.get(
      'SELECT MAX(version_number) as max_ver FROM versions WHERE entity_type = ? AND entity_id = ?'
    , entityType, entityId) as { max_ver: number | null } | undefined;

    const nextVersion = (maxRow?.max_ver ?? 0) + 1;

    const result = await db.run(
      `INSERT INTO versions (entity_type, entity_id, version_number, label, content)
       VALUES (?, ?, ?, ?, ?)`
    , entityType, entityId, nextVersion, label || null, content);

    return {
      id: Number(result.lastInsertRowid),
      version_number: nextVersion,
      label: label || null,
    };
  }

  // ── getVersionHistory ──────────────────────────────────────────

  async function getVersionHistory(
    entityType: string,
    entityId: string,
    limit: number = 20
  ): Promise<VersionRecord[]> {
    const rows = await db.all(
      `SELECT id, version_number, label, created_at, LENGTH(content) as content_length
       FROM versions
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY version_number DESC
       LIMIT ?`
    , entityType, entityId, limit) as Array<{
      id: number;
      version_number: number;
      label: string | null;
      created_at: string;
      content_length: number;
    }>;

    return rows;
  }

  // ── diffVersions ──────────────────────────────────────────────

  async function diffVersions(
    entityType: string,
    entityId: string,
    v1: number,
    v2: number
  ): Promise<DiffResult | null> {
    const version1 = await db.get('SELECT content FROM versions WHERE entity_type = ? AND entity_id = ? AND version_number = ?'
    , entityType, entityId, v1) as { content: string } | undefined;

    const version2 = await db.get(
      'SELECT content FROM versions WHERE entity_type = ? AND entity_id = ? AND version_number = ?'
    , entityType, entityId, v2) as { content: string } | undefined;

    if (!version1 || !version2) {
      return null;
    }

    const oldContent = version1.content;
    const newContent = version2.content;

    const chunks = computeDiff(oldContent, newContent);
    const stats = computeStats(chunks, oldContent, newContent);
    const summary = buildSemanticSummary(stats);

    return { chunks, stats, summary };
  }

  // ── extractKnowledge ──────────────────────────────────────────

  async function extractKnowledge(
    content: string,
    projectId: string,
    phase: string,
    moduleId: string
  ): Promise<void> {
    try {
      // Check if workflow_outputs table exists
      if (!tableExists('workflow_outputs')) {
        console.warn('[coding-integration] workflow_outputs table not found, skipping knowledge extraction');
        return;
      }

      if (!anthropicClient) {
        console.warn('[coding-integration] No Anthropic client provided, skipping knowledge extraction');
        return;
      }

      // Create a minimal workflow_output row for the atom extractor
      const outputId = randomUUID();
      const workflowId = `coding-${projectId}`;
      const executionId = `coding-phase-${phase}`;

      await db.run(`
        INSERT INTO workflow_outputs
          (id, workflow_id, execution_id, step_index, step_type, output_data,
           module_id, area_id, created_by, workflow_name, step_name)
        VALUES (?, ?, ?, 0, 'text', ?, ?, 'coding', 'system', ?, ?)
      `, 
        outputId,
        workflowId,
        executionId,
        JSON.stringify(content),
        moduleId,
        `Coding: ${phase}`,
        `${phase}-output`
      );

      const extractor = await createAtomExtractor(db, anthropicClient);
      await extractor.extractAtoms(outputId);

      console.log(`[coding-integration] Knowledge extracted for project ${projectId}, phase ${phase}`);
    } catch (error) {
      console.error('[coding-integration] extractKnowledge error (non-fatal):', error);
    }
  }

  // ── mintCodingAtom — deterministic, NO-LLM project-scoped atom write ────────
  //
  // Writes ONE knowledge_atoms row tagged with coding_project_id + atom_origin,
  // then fire-and-forget embeds it (reusing the same embedAndStore path as the
  // atom-extractor). The search_vector tsvector is auto-populated by the DB
  // trigger (trg_knowledge_atoms_search_vector). Tolerant of a missing
  // embedding backend (the embed is best-effort and never throws into the call).
  async function mintCodingAtom(params: MintCodingAtomParams): Promise<string | null> {
    if (!params.projectId || !params.text || !params.text.trim()) return null;
    const atomId = `atom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const category = params.category ?? categoryFromType(params.type);
    const confidence = typeof params.confidence === 'number' ? params.confidence : 0.85;
    const content = params.text.trim().slice(0, 2000);
    const tags = params.taskId ? JSON.stringify([`task:${params.taskId}`]) : null;

    try {
      // source_workflow_id / source_execution_id are NOT NULL — use synthetic,
      // project-stable values (same convention as extractKnowledge above).
      await db.run(
        `INSERT INTO knowledge_atoms
           (id, source_output_id, source_workflow_id, source_execution_id,
            source_area_id, source_module_id, content, atom_type, confidence,
            category, tags, coding_project_id, atom_origin, created_at)
         VALUES (?, NULL, ?, ?, 'coding', NULL, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        atomId,
        `coding-${params.projectId}`,
        `coding-signal-${params.origin}`,
        content,
        params.type,
        confidence,
        category,
        tags,
        params.projectId,
        params.origin,
      );
    } catch (err) {
      console.error('[coding-integration] mintCodingAtom insert failed (non-fatal):', err);
      return null;
    }

    // Fire-and-forget embed for semantic retrieval (tolerate no embeddings).
    void embedAndStore(db, {
      contentType: 'knowledge_atom',
      contentId: atomId,
      contentText: content,
      metadata: {
        category,
        atom_type: params.type,
        source_area_id: 'coding',
        confidence,
        coding_project_id: params.projectId,
        atom_origin: params.origin,
        created_at: new Date().toISOString(),
        is_superseded: 0,
      },
    }).catch((err) => {
      console.warn('[coding-integration] mintCodingAtom embed failed (non-fatal):',
        err instanceof Error ? err.message : err);
    });

    return atomId;
  }

  // ── Deterministic capture hooks (fire-and-forget — NEVER block / throw) ─────
  //
  // Each hook is a thin, no-LLM formatter over an EXACT structured signal. They
  // are called from the existing write sites in coding-large.ts. Every hook
  // swallows its own errors so a learning-loop failure can never break the
  // request that produced the signal.

  /** test FAILED → test.failed; test PASSED after a prior revision → pattern.works. */
  function captureTestResult(input: {
    projectId: string;
    taskId?: string | null;
    passed: boolean;
    afterRevision: boolean;
    argv: string[];
    outputTail?: string | null;
  }): void {
    void (async () => {
      try {
        if (!input.passed) {
          const tail = (input.outputTail ?? '').replace(/\s+/g, ' ').trim().slice(-280);
          await mintCodingAtom({
            projectId: input.projectId,
            type: CODING_ATOM_TYPES.TEST_FAILED,
            origin: CODING_ATOM_ORIGINS.TEST_FAILURE,
            taskId: input.taskId ?? null,
            text: `running \`${input.argv.join(' ')}\` fails${tail ? `: ${tail}` : ''}`,
          });
        } else if (input.afterRevision) {
          // A green run that followed a revision = a pattern that now works.
          await mintCodingAtom({
            projectId: input.projectId,
            type: CODING_ATOM_TYPES.PATTERN_WORKS,
            origin: CODING_ATOM_ORIGINS.PATTERN_WORKS,
            taskId: input.taskId ?? null,
            text: `after a revision, \`${input.argv.join(' ')}\` now passes — keep this approach`,
          });
        }
      } catch (err) {
        console.error('[coding-integration] captureTestResult error (non-fatal):', err);
      }
    })();
  }

  /** panel flag/dissent → review.flag. */
  function captureReviewFlag(input: {
    projectId: string;
    gate?: string | null;
    role: string;
    verdict: string;
    requiredChange?: string | null;
  }): void {
    void (async () => {
      try {
        const change = (input.requiredChange ?? '').trim();
        await mintCodingAtom({
          projectId: input.projectId,
          type: CODING_ATOM_TYPES.REVIEW_FLAG,
          origin: CODING_ATOM_ORIGINS.REVIEW_FLAG,
          text: `${input.role} ${input.verdict}${input.gate ? ` at the ${input.gate} gate` : ''}${change ? `: ${change}` : ''}`,
        });
      } catch (err) {
        console.error('[coding-integration] captureReviewFlag error (non-fatal):', err);
      }
    })();
  }

  /** high tech-debt / bug → risk.identified (origin bug). */
  function captureTechDebt(input: {
    projectId: string;
    title: string;
    severity?: string | null;
    taskId?: string | null;
  }): void {
    void (async () => {
      try {
        // Only HIGH/CRITICAL debt is worth a project lesson — low/medium is noise.
        const sev = (input.severity ?? '').toLowerCase();
        if (sev !== 'high' && sev !== 'critical') return;
        await mintCodingAtom({
          projectId: input.projectId,
          type: CODING_ATOM_TYPES.RISK_IDENTIFIED,
          origin: CODING_ATOM_ORIGINS.BUG,
          taskId: input.taskId ?? null,
          text: `${sev} tech-debt/bug: ${input.title}`,
        });
      } catch (err) {
        console.error('[coding-integration] captureTechDebt error (non-fatal):', err);
      }
    })();
  }

  /** dependency CVE (vulnerability_count > 0) → risk.identified (origin cve). */
  function captureDependencyCve(input: {
    projectId: string;
    packageName: string;
    currentVersion?: string | null;
    vulnerabilityCount: number;
  }): void {
    void (async () => {
      try {
        if (!(input.vulnerabilityCount > 0)) return;
        const ver = input.currentVersion ? `@${input.currentVersion}` : '';
        await mintCodingAtom({
          projectId: input.projectId,
          type: CODING_ATOM_TYPES.RISK_IDENTIFIED,
          origin: CODING_ATOM_ORIGINS.CVE,
          text: `dependency \`${input.packageName}${ver}\` has ${input.vulnerabilityCount} known vulnerabilit${input.vulnerabilityCount === 1 ? 'y' : 'ies'} — avoid or upgrade`,
        });
      } catch (err) {
        console.error('[coding-integration] captureDependencyCve error (non-fatal):', err);
      }
    })();
  }

  /** approved arch change → decision.approval. */
  function captureArchDecision(input: {
    projectId: string;
    title: string;
    changeLevel?: string | null;
    rationale?: string | null;
  }): void {
    void (async () => {
      try {
        const rationale = (input.rationale ?? '').trim();
        await mintCodingAtom({
          projectId: input.projectId,
          type: CODING_ATOM_TYPES.DECISION_APPROVAL,
          origin: CODING_ATOM_ORIGINS.ARCH_DECISION,
          text: `approved ${input.changeLevel ? `${input.changeLevel} ` : ''}change: ${input.title}${rationale ? ` — ${rationale}` : ''}`,
        });
      } catch (err) {
        console.error('[coding-integration] captureArchDecision error (non-fatal):', err);
      }
    })();
  }

  return {
    scoreOutput, saveVersion, getVersionHistory, diffVersions, extractKnowledge,
    mintCodingAtom,
    captureTestResult, captureReviewFlag, captureTechDebt,
    captureDependencyCve, captureArchDecision,
  };
}

export type CodingIntegration = ReturnType<typeof createCodingIntegration>;
