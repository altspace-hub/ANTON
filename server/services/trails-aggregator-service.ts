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

async function listWorkflowRuns(db: DatabaseAdapter, opts: TrailListOptions): Promise<TrailEntry[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (opts.from) { conds.push(`started_at >= $${i++}`); args.push(opts.from); }
  if (opts.to)   { conds.push(`started_at <= $${i++}`); args.push(opts.to); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  // workflow_runs is created across multiple migrations; the columns we read
  // (id, workflow_id, status, started_at, finished_at, error) are present.
  // If a deployment lacks the table, swallow the error and return [].
  try {
    const rows = await db.all<{
      id: string;
      workflow_id: string;
      status: string;
      started_at: string;
      finished_at: string | null;
      error: string | null;
    }>(
      `SELECT id, workflow_id, status, started_at, finished_at, error
         FROM workflow_runs
         ${where}
         ORDER BY started_at DESC
         LIMIT 200`,
      ...args
    );
    return rows.map(r => ({
      id: `wf:${r.id}`,
      kind: 'workflow_run' as TrailKind,
      title: `Workflow run — ${r.workflow_id}`,
      summary: `Status: ${r.status}${r.error ? ` · error: ${r.error.slice(0, 80)}` : ''}`,
      actorId: null,
      sessionId: null,
      emittedAt: r.started_at,
      payload: {
        runId: r.id,
        workflowId: r.workflow_id,
        status: r.status,
        finishedAt: r.finished_at,
        error: r.error,
      },
      signatureStatus: null,
    }));
  } catch {
    return [];
  }
}

async function listSignedDeliveries(db: DatabaseAdapter, opts: TrailListOptions): Promise<TrailEntry[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (opts.from) { conds.push(`signed_at >= $${i++}`); args.push(opts.from); }
  if (opts.to)   { conds.push(`signed_at <= $${i++}`); args.push(opts.to); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  try {
    const rows = await db.all<{
      id: string;
      task_id: string | null;
      trail_id: string | null;
      entry_index: number | null;
      signing_key_fingerprint: string | null;
      signed_at: string;
    }>(
      `SELECT id, task_id, trail_id, entry_index, signing_key_fingerprint, signed_at
         FROM community_signed_trail_entries
         ${where}
         ORDER BY signed_at DESC
         LIMIT 200`,
      ...args
    );
    // Cross-reference verifications, if any, to derive signature status.
    const verifByEntryId = await getVerificationStatusMap(db, rows.map(r => r.id));
    return rows.map(r => ({
      id: `signed:${r.id}`,
      kind: 'signed_delivery' as TrailKind,
      title: `Signed trail entry${r.task_id ? ` — task ${r.task_id.slice(0, 8)}` : ''}`,
      summary: `Key fingerprint: ${r.signing_key_fingerprint?.slice(0, 16) ?? 'unknown'}…`,
      actorId: null,
      sessionId: null,
      emittedAt: r.signed_at,
      payload: {
        entryId: r.id,
        taskId: r.task_id,
        trailId: r.trail_id,
        entryIndex: r.entry_index,
        keyFingerprint: r.signing_key_fingerprint,
      },
      signatureStatus: verifByEntryId.get(r.id) ?? 'unverified',
    }));
  } catch {
    return [];
  }
}

async function getVerificationStatusMap(
  db: DatabaseAdapter,
  entryIds: string[]
): Promise<Map<string, 'ok' | 'invalid' | 'unverified'>> {
  const map = new Map<string, 'ok' | 'invalid' | 'unverified'>();
  if (entryIds.length === 0) return map;
  try {
    // Best-effort: many deployments don't carry a 1:1 link from verification → entry id.
    // We surface 'unverified' as default; callers can drill in via the per-entry detail route.
    const rows = await db.all<{ entry_id: string; verification_status: string }>(
      `SELECT entry_id, verification_status FROM community_trail_verifications WHERE entry_id = ANY($1::text[])`,
      entryIds
    );
    for (const r of rows) {
      map.set(r.entry_id, r.verification_status === 'ok' ? 'ok' : 'invalid');
    }
  } catch { /* table layout differs across deployments — fall back to unverified */ }
  return map;
}

async function listEvidencePacks(db: DatabaseAdapter, opts: TrailListOptions): Promise<TrailEntry[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (opts.userId) { conds.push(`user_id = $${i++}`); args.push(opts.userId); }
  if (opts.from)   { conds.push(`created_at >= $${i++}`); args.push(opts.from); }
  if (opts.to)     { conds.push(`created_at <= $${i++}`); args.push(opts.to); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  try {
    const rows = await db.all<{
      id: string;
      user_id: string | null;
      title: string | null;
      framework: string | null;
      status: string | null;
      created_at: string;
    }>(
      `SELECT id, user_id, title, framework, status, created_at
         FROM evidence_packs
         ${where}
         ORDER BY created_at DESC
         LIMIT 200`,
      ...args
    );
    return rows.map(r => ({
      id: `ep:${r.id}`,
      kind: 'evidence_pack' as TrailKind,
      title: r.title ?? `Evidence pack ${r.id.slice(0, 8)}`,
      summary: `Framework: ${r.framework ?? 'custom'} · status: ${r.status ?? 'draft'}`,
      actorId: r.user_id,
      sessionId: null,
      emittedAt: r.created_at,
      payload: {
        packId: r.id,
        framework: r.framework,
        status: r.status,
      },
      signatureStatus: r.status === 'signed' ? 'ok' : 'unsigned' as never,
    }));
  } catch {
    return [];
  }
}

async function listRendererArtifacts(db: DatabaseAdapter, opts: TrailListOptions): Promise<TrailEntry[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (opts.sessionId) { conds.push(`session_id = $${i++}`); args.push(opts.sessionId); }
  if (opts.from)      { conds.push(`rendered_at >= $${i++}`); args.push(opts.from); }
  if (opts.to)        { conds.push(`rendered_at <= $${i++}`); args.push(opts.to); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  try {
    const rows = await db.all<{
      id: string;
      session_id: string | null;
      renderer_id: string;
      artifact_type: string;
      uri: string | null;
      rendered_at: string;
    }>(
      `SELECT id, session_id, renderer_id, artifact_type, uri, rendered_at
         FROM rendered_artifacts
         ${where}
         ORDER BY rendered_at DESC
         LIMIT 200`,
      ...args
    );
    return rows.map(r => ({
      id: `rend:${r.id}`,
      kind: 'renderer_artifact' as TrailKind,
      title: `Render — ${r.renderer_id} → ${r.artifact_type}`,
      summary: r.uri ? `Artifact at ${r.uri}` : 'Inline artifact',
      actorId: null,
      sessionId: r.session_id,
      emittedAt: r.rendered_at,
      payload: {
        artifactId: r.id,
        rendererId: r.renderer_id,
        artifactType: r.artifact_type,
        uri: r.uri,
      },
      signatureStatus: null,
    }));
  } catch {
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
