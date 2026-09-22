/**
 * trails-aggregator-service.ts
 *
 * Single backend that returns a unified, filterable feed of every reasoning
 * trail kind ANTON emits. Consumers (the AuditTrailPage UI, the Companion
 * App's IRE drawer extension, evidence-pack export) read from here rather
 * than querying each trail table directly.
 *
 * Trail kinds aggregated:
 *   - IRE revelations           → revelation_chains + revelation_steps
 *   - Workflow runs             → workflow_runs + workflow_step_runs
 *   - Signed delivery trails    → community_signed_trail_entries (+ verifications)
 *   - Evidence-pack items       → evidence_packs + evidence_pack_items
 *   - Renderer audit            → rendered_artifacts + renderer_audit_log
 *
 * Defined per ANTON_Improvement_and_Investigation_Brief.md §C.2.
 *
 * Design notes:
 *   - All queries are parameterised. Never inline filter values.
 *   - The aggregator returns a UNIFIED shape (TrailEntry) so the frontend
 *     doesn't need per-kind branching.
 *   - Pagination is enforced server-side (default 50, max 200).
 */

import type { DatabaseAdapter } from '../db/database.js';

// ── Unified trail shape ────────────────────────────────────────────────

export type TrailKind =
  | 'ire_revelation'
  | 'workflow_run'
  | 'signed_delivery'
  | 'evidence_pack'
  | 'renderer_artifact';

export interface TrailEntry {
  id: string;
  kind: TrailKind;
  /** Display title. */
  title: string;
  /** Free-text summary (one paragraph max). */
  summary: string;
  /** Owning user / actor identifier where known. */
  actorId: string | null;
  /** Session id where the trail originated, if any. */
  sessionId: string | null;
  /** Trail emission timestamp (ISO8601 UTC). */
  emittedAt: string;
  /** Per-kind structured payload — opaque to the aggregator, rendered by the frontend per-kind. */
  payload: Record<string, unknown>;
  /** Signature-verification status if the trail is signed; null when not applicable. */
  signatureStatus: 'ok' | 'invalid' | 'unverified' | null;
}

export interface TrailFilters {
  kinds?: TrailKind[];
  sessionId?: string;
  userId?: string;
  /** Inclusive ISO8601 lower bound. */
  from?: string;
  /** Inclusive ISO8601 upper bound. */
  to?: string;
  /** Free-text search against title + summary. */
  q?: string;
  /** Signature-status filter. */
  signature?: 'ok' | 'invalid' | 'unverified' | 'unsigned';
}

export interface TrailListOptions extends TrailFilters {
  limit?: number;   // default 50, max 200
  offset?: number;  // default 0
}

export interface TrailListResult {
  entries: TrailEntry[];
  total: number;
  hasMore: boolean;
}

// ── Per-kind queries ───────────────────────────────────────────────────
// Each pulls into the unified shape. Kept separate for readability.

async function listIreRevelations(db: DatabaseAdapter, opts: TrailListOptions): Promise<TrailEntry[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (opts.sessionId) { conds.push(`session_id = $${i++}`); args.push(opts.sessionId); }
  if (opts.from)      { conds.push(`created_at >= $${i++}`); args.push(opts.from); }
  if (opts.to)        { conds.push(`created_at <= $${i++}`); args.push(opts.to); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const rows = await db.all<{
    id: string;
    session_id: string | null;
    thinking_level: string;
    phase_count: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_duration_ms: number;
    synthesis_quality_score: number | null;
    created_at: string;
  }>(
    `SELECT id, session_id, thinking_level, phase_count,
            total_input_tokens, total_output_tokens, total_duration_ms,
            synthesis_quality_score, created_at
       FROM revelation_chains
       ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
    ...args
  );

  return rows.map(r => ({
    id: `ire:${r.id}`,
    kind: 'ire_revelation' as TrailKind,
    title: `IRE chain — ${r.thinking_level} (${r.phase_count} phases)`,
    summary: `${r.total_input_tokens.toLocaleString()} in / ${r.total_output_tokens.toLocaleString()} out tokens · ${(r.total_duration_ms / 1000).toFixed(1)}s${r.synthesis_quality_score != null ? ` · quality ${r.synthesis_quality_score.toFixed(2)}` : ''}`,
    actorId: null,
    sessionId: r.session_id,
    emittedAt: r.created_at,
    payload: {
      chainId: r.id,
      thinkingLevel: r.thinking_level,
      phaseCount: r.phase_count,
      inputTokens: r.total_input_tokens,
      outputTokens: r.total_output_tokens,
      durationMs: r.total_duration_ms,
      qualityScore: r.synthesis_quality_score,
    },
    signatureStatus: null,
  }));
}

/**
 * workflow_runs SQL, exported for tests/db/query-column-drift.test.ts. The live
 * table carries `completed_at` (TEXT) and `error_message`, not the `finished_at`
 * / `error` an earlier draft selected; `user_id` is the initiating user.
 */
export const WORKFLOW_RUN_SQL = {
  /** `where` is either '' or a full `WHERE …` clause using $n placeholders. */
  runs: (where: string): string =>
    `SELECT id, workflow_id, status, user_id, started_at, completed_at, error_message
       FROM workflow_runs
       ${where}
       ORDER BY started_at DESC
       LIMIT 200`,
} as const;

async function listWorkflowRuns(db: DatabaseAdapter, opts: TrailListOptions): Promise<TrailEntry[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (opts.userId) { conds.push(`user_id = $${i++}`); args.push(opts.userId); }
  if (opts.from)   { conds.push(`started_at >= $${i++}`); args.push(opts.from); }
  if (opts.to)     { conds.push(`started_at <= $${i++}`); args.push(opts.to); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  try {
    const rows = await db.all<{
      id: string;
      workflow_id: string;
      status: string;
      user_id: string | null;
      started_at: string;
      completed_at: string | null;
      error_message: string | null;
    }>(WORKFLOW_RUN_SQL.runs(where), ...args);
    return rows.map(r => ({
      id: `wf:${r.id}`,
      kind: 'workflow_run' as TrailKind,
      title: `Workflow run — ${r.workflow_id}`,
      summary: `Status: ${r.status}${r.error_message ? ` · error: ${r.error_message.slice(0, 80)}` : ''}`,
      actorId: r.user_id,
      sessionId: null,
      emittedAt: r.started_at,
      payload: {
        runId: r.id,
        workflowId: r.workflow_id,
        status: r.status,
        completedAt: r.completed_at,
        error: r.error_message,
      },
      signatureStatus: null,
    }));
  } catch (err) {
    console.warn('[trails-aggregator] workflow_run query failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * SQL for the signed-delivery kind, exported so tests/db/query-column-drift.test.ts
 * can run the exact statements against a real schema. Column names follow
 * migration 080_signed_trails_and_compliance.sql — the table carries
 * `signer_hash` / `signer_public_key` / `created_at`, NOT the
 * `signing_key_fingerprint` / `signed_at` an earlier draft of this file assumed.
 * That drift threw inside the try/catch below and the catch returned [], so the
 * kind was silently absent from /audit-trail.
 */
export const SIGNED_DELIVERY_SQL = {
  /** `where` is either '' or a full `WHERE …` clause using $n placeholders. */
  entries: (where: string): string =>
    `SELECT id, task_id, trail_id, entry_index, entry_type, signer_hash, signer_public_key, created_at
       FROM community_signed_trail_entries
       ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
  /**
   * Latest verification per trail. `placeholders` is the `$1, $2, …` list for
   * the trail ids. community_trail_verifications has no per-entry link — it
   * records one verdict per (trail_id, task_id) run — so status is per trail.
   */
  latestVerificationPerTrail: (placeholders: string): string =>
    `SELECT DISTINCT ON (trail_id) trail_id, verification_result
       FROM community_trail_verifications
      WHERE trail_id IN (${placeholders})
      ORDER BY trail_id, verified_at DESC`,
} as const;

interface SignedTrailEntryRow {
  id: string;
  task_id: string | null;
  trail_id: string | null;
  entry_index: number | null;
  entry_type: string | null;
  signer_hash: string | null;
  signer_public_key: string | null;
  created_at: string;
}

async function listSignedDeliveries(db: DatabaseAdapter, opts: TrailListOptions): Promise<TrailEntry[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (opts.from) { conds.push(`created_at >= $${i++}`); args.push(opts.from); }
  if (opts.to)   { conds.push(`created_at <= $${i++}`); args.push(opts.to); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  try {
    const rows = await db.all<SignedTrailEntryRow>(SIGNED_DELIVERY_SQL.entries(where), ...args);
    // Cross-reference verifications, if any, to derive signature status.
    const verifByTrailId = await getVerificationStatusMap(
      db,
      rows.map(r => r.trail_id).filter((t): t is string => typeof t === 'string')
    );
    return rows.map(r => ({
      id: `signed:${r.id}`,
      kind: 'signed_delivery' as TrailKind,
      title: `Signed trail entry${r.task_id ? ` — task ${r.task_id.slice(0, 8)}` : ''}`,
      summary: `Entry #${r.entry_index ?? 0}${r.entry_type ? ` (${r.entry_type})` : ''} · signer ${r.signer_hash?.slice(0, 16) ?? 'unknown'}…`,
      actorId: r.signer_hash,
      sessionId: null,
      emittedAt: r.created_at,
      payload: {
        entryId: r.id,
        taskId: r.task_id,
        trailId: r.trail_id,
        entryIndex: r.entry_index,
        entryType: r.entry_type,
        signerHash: r.signer_hash,
        signerPublicKey: r.signer_public_key,
      },
      signatureStatus: (r.trail_id ? verifByTrailId.get(r.trail_id) : undefined) ?? 'unverified',
    }));
  } catch (err) {
    // Surface the failure: a swallowed error here is exactly how the column
    // drift above stayed invisible. Never log row content — only the message.
    console.warn('[trails-aggregator] signed_delivery query failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Map trail_id → signature status from the latest verification run per trail.
 * 'valid' → 'ok'; 'invalid' and 'partial' → 'invalid' (a partial run means at
 * least one entry failed, and the table does not say which one).
 */
async function getVerificationStatusMap(
  db: DatabaseAdapter,
  trailIds: string[]
): Promise<Map<string, 'ok' | 'invalid' | 'unverified'>> {
  const map = new Map<string, 'ok' | 'invalid' | 'unverified'>();
  const unique = [...new Set(trailIds)];
  if (unique.length === 0) return map;
  try {
    const placeholders = unique.map((_, idx) => `$${idx + 1}`).join(', ');
    const rows = await db.all<{ trail_id: string; verification_result: string }>(
      SIGNED_DELIVERY_SQL.latestVerificationPerTrail(placeholders),
      ...unique
    );
    for (const r of rows) {
      map.set(r.trail_id, r.verification_result === 'valid' ? 'ok' : 'invalid');
    }
  } catch (err) {
    console.warn('[trails-aggregator] trail verification lookup failed:', err instanceof Error ? err.message : String(err));
  }
  return map;
}

/**
 * evidence_packs SQL, exported for tests/db/query-column-drift.test.ts. The live
 * table (migration 152) has `created_by` as the actor and `compliance_frameworks`
 * (JSONB string array, default ["eu_ai_act","amlr"]) — not the `user_id` /
 * `framework` an earlier draft selected.
 */
export const EVIDENCE_PACK_SQL = {
  /** `where` is either '' or a full `WHERE …` clause using $n placeholders. */
  packs: (where: string): string =>
    `SELECT id, created_by, title, status, compliance_frameworks, signature, created_at
       FROM evidence_packs
       ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
} as const;

/**
 * compliance_frameworks arrives as a parsed JSONB array from pg, but the
 * assembler tolerates a JSON string too (older rows / other adapters). Normalise
 * to string[] without trusting the shape.
 */
function parseFrameworks(raw: unknown): string[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return [raw]; }
  }
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

async function listEvidencePacks(db: DatabaseAdapter, opts: TrailListOptions): Promise<TrailEntry[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (opts.userId) { conds.push(`created_by = $${i++}`); args.push(opts.userId); }
  if (opts.from)   { conds.push(`created_at >= $${i++}`); args.push(opts.from); }
  if (opts.to)     { conds.push(`created_at <= $${i++}`); args.push(opts.to); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  try {
    const rows = await db.all<{
      id: string;
      created_by: string | null;
      title: string | null;
      status: string | null;
      compliance_frameworks: unknown;
      signature: string | null;
      created_at: string;
    }>(EVIDENCE_PACK_SQL.packs(where), ...args);
    return rows.map(r => {
      const frameworks = parseFrameworks(r.compliance_frameworks);
      return {
        id: `ep:${r.id}`,
        kind: 'evidence_pack' as TrailKind,
        title: r.title ?? `Evidence pack ${r.id.slice(0, 8)}`,
        summary: `Frameworks: ${frameworks.length ? frameworks.join(', ') : 'custom'} · status: ${r.status ?? 'draft'}`,
        actorId: r.created_by,
        sessionId: null,
        emittedAt: r.created_at,
        payload: {
          packId: r.id,
          frameworks,
          status: r.status,
        },
        // A pack is signed when its manifest signature is present (status alone
        // is 'draft' | 'finalised'; there is no 'signed' status).
        signatureStatus: r.signature ? 'ok' : null,
      };
    });
  } catch (err) {
    console.warn('[trails-aggregator] evidence_pack query failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * rendered_artifacts SQL, exported for tests/db/query-column-drift.test.ts. The
 * live table (migration 123) has `file_type` / `file_path` / `created_at` /
 * `created_by`, not the `artifact_type` / `uri` / `rendered_at` an earlier
 * draft selected. `id` is BIGINT, which pg returns as a string.
 */
export const RENDERER_ARTIFACT_SQL = {
  /** `where` is either '' or a full `WHERE …` clause using $n placeholders. */
  artifacts: (where: string): string =>
    `SELECT id, session_id, renderer_id, file_type, file_path, mime_type, created_by, created_at
       FROM rendered_artifacts
       ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
} as const;

async function listRendererArtifacts(db: DatabaseAdapter, opts: TrailListOptions): Promise<TrailEntry[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (opts.sessionId) { conds.push(`session_id = $${i++}`); args.push(opts.sessionId); }
  if (opts.userId)    { conds.push(`created_by = $${i++}`); args.push(opts.userId); }
  if (opts.from)      { conds.push(`created_at >= $${i++}`); args.push(opts.from); }
  if (opts.to)        { conds.push(`created_at <= $${i++}`); args.push(opts.to); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  try {
    const rows = await db.all<{
      id: string | number;
      session_id: string | null;
      renderer_id: string;
      file_type: string | null;
      file_path: string | null;
      mime_type: string | null;
      created_by: string | null;
      created_at: string;
    }>(RENDERER_ARTIFACT_SQL.artifacts(where), ...args);
    return rows.map(r => ({
      id: `rend:${String(r.id)}`,
      kind: 'renderer_artifact' as TrailKind,
      title: `Render — ${r.renderer_id} → ${r.file_type ?? 'artifact'}`,
      summary: r.file_path ? `Artifact at ${r.file_path}` : 'Inline artifact',
      actorId: r.created_by,
      sessionId: r.session_id,
      emittedAt: r.created_at,
      payload: {
        artifactId: String(r.id),
        rendererId: r.renderer_id,
        fileType: r.file_type,
        filePath: r.file_path,
        mimeType: r.mime_type,
      },
      signatureStatus: null,
    }));
  } catch (err) {
    console.warn('[trails-aggregator] renderer_artifact query failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Aggregate trails across kinds with filters + pagination.
 * Trail-kind selection is via opts.kinds; when absent, all kinds are queried.
 */
export async function listTrails(
  db: DatabaseAdapter,
  opts: TrailListOptions = {}
): Promise<TrailListResult> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const kinds = opts.kinds ?? ['ire_revelation', 'workflow_run', 'signed_delivery', 'evidence_pack', 'renderer_artifact'];

  // Run per-kind queries in parallel — each is bounded to 200 rows.
  const buckets = await Promise.all([
    kinds.includes('ire_revelation')   ? listIreRevelations(db, opts)  : Promise.resolve([] as TrailEntry[]),
    kinds.includes('workflow_run')     ? listWorkflowRuns(db, opts)    : Promise.resolve([] as TrailEntry[]),
    kinds.includes('signed_delivery')  ? listSignedDeliveries(db, opts): Promise.resolve([] as TrailEntry[]),
    kinds.includes('evidence_pack')    ? listEvidencePacks(db, opts)   : Promise.resolve([] as TrailEntry[]),
    kinds.includes('renderer_artifact')? listRendererArtifacts(db, opts): Promise.resolve([] as TrailEntry[]),
  ]);

  let merged = buckets.flat();

  // Free-text filter (post-merge — small N, fine to filter in-process).
  if (opts.q) {
    const needle = opts.q.toLowerCase();
    merged = merged.filter(e => e.title.toLowerCase().includes(needle) || e.summary.toLowerCase().includes(needle));
  }

  // Signature-status filter.
  if (opts.signature) {
    merged = merged.filter(e => {
      if (opts.signature === 'unsigned') return e.signatureStatus === null;
      return e.signatureStatus === opts.signature;
    });
  }

  // Sort merged by emittedAt DESC, then paginate.
  merged.sort((a, b) => (b.emittedAt > a.emittedAt ? 1 : -1));
  const total = merged.length;
  const entries = merged.slice(offset, offset + limit);

  return { entries, total, hasMore: offset + entries.length < total };
}

/** Return one trail by composite id (returned in TrailEntry.id, e.g. `ire:<chainId>`). */
export async function getTrail(db: DatabaseAdapter, compositeId: string): Promise<TrailEntry | null> {
  const [kind, raw] = compositeId.split(':');
  if (!kind || !raw) return null;
  const single = (await listTrails(db, {})).entries.find(e => e.id === compositeId);
  // Note: O(n) over the merged list; acceptable for first-pass detail surface.
  // A future optimisation would dispatch per-kind (see open question in 23-reasoning-trails.md).
  return single ?? null;
}
