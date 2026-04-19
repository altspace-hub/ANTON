/**
 * collector.ts — walk the existing audit surface for a defined scope and
 * return the set of items that belong in the evidence pack.
 *
 * Phase 1 supports two scope types:
 *   - 'session'  — one session and everything reachable from it
 *   - 'project'  — every session in a project, transitively
 *
 * For every collected item the collector computes:
 *   1. The canonical JSON representation (stable key order, no drift).
 *   2. SHA-256 of that representation.
 *   3. A regulatory relevance tag set (per spec §7).
 *
 * Critical: nothing here writes back. Mutation lives in assembler.ts.
 * Source rows are read-only references — the collector returns enough metadata
 * for the assembler to insert into evidence_pack_items + serialize into the
 * bundle later.
 *
 * Spec §3.3: do NOT create a parallel audit subsystem. Every field surfaced
 * here comes from an existing table.
 */

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger('evidence-pack-collector');

// ── Scope shapes ───────────────────────────────────────────────────────────

export type ScopeType = 'session' | 'project' | 'workflow_run' | 'mission' | 'canvas' | 'date_range' | 'custom';

export interface SessionScope { type: 'session'; sessionId: string }
export interface ProjectScope { type: 'project'; projectId: string }
// Phase 2/3 will add the rest. Declared now so SQL routes can validate the
// scope_type union without a separate enum living elsewhere.
export interface WorkflowRunScope { type: 'workflow_run'; workflowRunId: string }
export interface MissionScope { type: 'mission'; missionId: string }
export interface CanvasScope { type: 'canvas'; canvasId: string }
export interface DateRangeScope { type: 'date_range'; from: string; to: string; userId?: string }
export interface CustomScope { type: 'custom'; items: Array<{ table: string; id: string }> }
export type ScopeDefinition =
  | SessionScope | ProjectScope | WorkflowRunScope
  | MissionScope | CanvasScope | DateRangeScope | CustomScope;

// ── Item shape ─────────────────────────────────────────────────────────────

export interface CollectedItem {
  itemType: string;                    // 'session' | 'message' | 'audit_log' | 'output_version' | ...
  itemTable: string;                   // source table name
  itemId: string;                      // source PK (always stringified)
  itemSummary: string;                 // short human-readable label for the index
  canonicalJson: string;               // stable canonicalised content
  itemHash: string;                    // sha256 of canonicalJson (hex)
  regulatoryRelevance: string[];       // ["eu_ai_act.art_13", "amlr.auditability"]
}

export interface CollectedItems {
  items: CollectedItem[];
  scopeLabel: string;                  // "Session 'AML Q2 review' + 3 messages + 12 audit entries"
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function collectForScope(db: DatabaseAdapter, scope: ScopeDefinition): Promise<CollectedItems> {
  switch (scope.type) {
    case 'session': return collectSessionScope(db, scope.sessionId);
    case 'project': return collectProjectScope(db, scope.projectId);
    default:
      // Phase 2/3 will fill these in. Throw early so the route layer can
      // map this to a clean 400.
      throw new Error(`Unsupported scope type for Phase 1: ${scope.type}`);
  }
}

// ── Session scope ──────────────────────────────────────────────────────────

async function collectSessionScope(db: DatabaseAdapter, sessionId: string): Promise<CollectedItems> {
  const session = await db.get<SessionRow>(
    `SELECT id, module_id, title, summary, project_id, user_id, review_status,
            reviewed_by, reviewed_at, created_at, updated_at, config
     FROM sessions WHERE id = ?`, sessionId,
  );
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const items: CollectedItem[] = [];
  items.push(toItem({
    itemType: 'session',
    itemTable: 'sessions',
    itemId: session.id,
    summary: `Session "${session.title}" (${session.module_id})`,
    payload: session,
    relevance: regulatoryRelevanceForSession(session),
  }));

  await collectSessionRelated(db, sessionId, items);

  log.info({ sessionId, itemCount: items.length }, 'session_scope_collected');
  return {
    items,
    scopeLabel: `Session "${session.title}" (${items.length} items: ${countByType(items)})`,
  };
}

// ── Project scope ──────────────────────────────────────────────────────────

async function collectProjectScope(db: DatabaseAdapter, projectId: string): Promise<CollectedItems> {
  const project = await db.get<ProjectRow>(
    `SELECT id, name, description, status, created_at FROM projects WHERE id = ?`, projectId,
  );
  if (!project) throw new Error(`Project ${projectId} not found`);

  const items: CollectedItem[] = [];
  items.push(toItem({
    itemType: 'project',
    itemTable: 'projects',
    itemId: project.id,
    summary: `Project "${project.name}"`,
    payload: project,
    relevance: ['eu_ai_act.art_12'],
  }));

  // Walk every session in the project, then per-session related artefacts.
  const sessionRows = await db.all<{ id: string; title: string; module_id: string }>(
    `SELECT id, title, module_id FROM sessions WHERE project_id = ? ORDER BY created_at ASC`,
    projectId,
  );
  for (const s of sessionRows) {
    const session = await db.get<SessionRow>(
      `SELECT id, module_id, title, summary, project_id, user_id, review_status,
              reviewed_by, reviewed_at, created_at, updated_at, config
       FROM sessions WHERE id = ?`, s.id,
    );
    if (!session) continue;
    items.push(toItem({
      itemType: 'session',
      itemTable: 'sessions',
      itemId: session.id,
      summary: `Session "${session.title}" (${session.module_id})`,
      payload: session,
      relevance: regulatoryRelevanceForSession(session),
    }));
    await collectSessionRelated(db, s.id, items);
  }

  log.info({ projectId, sessionCount: sessionRows.length, itemCount: items.length }, 'project_scope_collected');
  return {
    items,
    scopeLabel: `Project "${project.name}" — ${sessionRows.length} session(s), ${items.length} items`,
  };
}

// ── Per-session walker ─────────────────────────────────────────────────────

async function collectSessionRelated(db: DatabaseAdapter, sessionId: string, items: CollectedItem[]): Promise<void> {
  // Messages — every assistant message is Article 13 transparency evidence
  // when thinking_content is non-null.
  const messages = await db.all<MessageRow>(
    `SELECT id, session_id, role, content, thinking_content, content_blocks,
            token_count, cost, model_id, config_snapshot, created_at
     FROM messages WHERE session_id = ? ORDER BY created_at ASC`, sessionId,
  );
  for (const m of messages) {
    items.push(toItem({
      itemType: 'message',
      itemTable: 'messages',
      itemId: m.id,
      summary: `${m.role} message at ${m.created_at}${m.thinking_content ? ' (with thinking)' : ''}`,
      payload: m,
      relevance: regulatoryRelevanceForMessage(m),
    }));
  }

  // Audit log — one row per AI call. Token costs, model, seed, review status.
  const auditRows = await db.all<AuditLogRow>(
    `SELECT id, timestamp, session_id, module_id, area_id, model, provider,
            thinking_level, input_token_count, output_token_count, cached_tokens,
            cache_creation_tokens, estimated_cost_usd, response_status, review_status,
            reviewed_by, reviewed_at, seed, system_prompt_version_id, user_id,
            knowledge_sources_used, rag_chunks, created_at
     FROM audit_log WHERE session_id = ? ORDER BY timestamp ASC`, sessionId,
  );
  for (const a of auditRows) {
    items.push(toItem({
      itemType: 'audit_log',
      itemTable: 'audit_log',
      itemId: a.id,
      summary: `AI call ${a.model} at ${a.timestamp}`,
      payload: a,
      relevance: regulatoryRelevanceForAuditEntry(a),
    }));
  }

  // Output versions — every saved version of a session-bound output.
  const versionRows = await db.all<VersionRow>(
    `SELECT id, entity_type, entity_id, version_number, label, content, created_at
     FROM versions
     WHERE entity_type = 'session_output' AND entity_id = ?
     ORDER BY version_number ASC`, sessionId,
  );
  for (const v of versionRows) {
    items.push(toItem({
      itemType: 'output_version',
      itemTable: 'versions',
      itemId: String(v.id),
      summary: `Output v${v.version_number}${v.label ? ` (${v.label})` : ''}`,
      payload: v,
      relevance: ['eu_ai_act.art_12', 'amlr.auditability'],
    }));
  }
}

// ── Regulatory tagging (spec §7) ───────────────────────────────────────────

function regulatoryRelevanceForSession(s: SessionRow): string[] {
  const tags = ['eu_ai_act.art_12'];
  if (s.reviewed_by) tags.push('eu_ai_act.art_14');
  return tags;
}

function regulatoryRelevanceForMessage(m: MessageRow): string[] {
  const tags = ['eu_ai_act.art_12'];
  if (m.thinking_content && m.thinking_content.length > 0) tags.push('eu_ai_act.art_13');
  return tags;
}

function regulatoryRelevanceForAuditEntry(a: AuditLogRow): string[] {
  const tags = ['eu_ai_act.art_12'];
  if (a.seed !== null && a.seed !== undefined) tags.push('eu_ai_act.art_15');
  if (a.review_status && a.review_status !== 'draft') tags.push('eu_ai_act.art_14');
  if (a.area_id === 'fcp' || a.area_id === 'aml') tags.push('amlr.art_21', 'amlr.auditability');
  return tags;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toItem(input: {
  itemType: string; itemTable: string; itemId: string;
  summary: string; payload: unknown; relevance: string[];
}): CollectedItem {
  const canonicalJson = canonicalise(input.payload);
  return {
    itemType: input.itemType,
    itemTable: input.itemTable,
    itemId: input.itemId,
    itemSummary: input.summary,
    canonicalJson,
    itemHash: 'sha256:' + createHash('sha256').update(canonicalJson).digest('hex'),
    regulatoryRelevance: input.relevance,
  };
}

/**
 * Stable JSON: keys sorted recursively. Identical content always produces
 * identical bytes, which keeps the manifest hash deterministic across
 * re-assembly of the same scope (acceptance criterion §13.4).
 */
export function canonicalise(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v instanceof Date) return v.toISOString();
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    out[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
  }
  return out;
}

function countByType(items: CollectedItem[]): string {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.itemType, (counts.get(i.itemType) ?? 0) + 1);
  return Array.from(counts.entries()).map(([t, n]) => `${n} ${t}`).join(', ');
}

// ── Source row shapes ──────────────────────────────────────────────────────

interface SessionRow {
  id: string; module_id: string; title: string; summary: string | null;
  project_id: string | null; user_id: string | null;
  review_status: string | null; reviewed_by: string | null; reviewed_at: string | null;
  created_at: string; updated_at: string; config: string | null;
}
interface ProjectRow {
  id: string; name: string; description: string | null;
  status: string | null; created_at: string;
}
interface MessageRow {
  id: string; session_id: string; role: string; content: string;
  thinking_content: string | null; content_blocks: string | null;
  token_count: number | null; cost: number | null; model_id: string | null;
  config_snapshot: string | null; created_at: string;
}
interface AuditLogRow {
  id: string; timestamp: string; session_id: string | null; module_id: string | null;
  area_id: string | null; model: string | null; provider: string | null;
  thinking_level: string | null;
  input_token_count: number | null; output_token_count: number | null;
  cached_tokens: number | null; cache_creation_tokens: number | null;
  estimated_cost_usd: number | null; response_status: string | null;
  review_status: string | null; reviewed_by: string | null; reviewed_at: string | null;
  seed: number | null; system_prompt_version_id: string | null;
  user_id: string | null; knowledge_sources_used: string | null;
  rag_chunks: string | null; created_at: string;
}
interface VersionRow {
  id: number; entity_type: string; entity_id: string; version_number: number;
  label: string | null; content: string; created_at: string;
}
