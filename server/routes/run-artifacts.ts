/**
 * run-artifacts.ts — read API for the run record v2 (Wave 5, 2026-09-17).
 *
 * A run record used to be reachable only through its assistant message
 * (GET /sessions/:sessionId/messages/:messageId/artifacts in routes/claude.ts).
 * The agentic paths — a gap batch, a task step, an engagement iteration —
 * have no message; their records are found by parent here, and the tool
 * calls a run made are listed in order.
 *
 *   GET /api/run-artifacts/by-parent/:kind/:id      records for a parent
 *       ?includePrompt=1      adds composed_prompt
 *       ?includeTranscript=1  adds the transcript (assistant turns)
 *       For gap_batch / task_step the id may be the assessment / task id
 *       alone: every batch / step under it is returned (parent_id prefix).
 *   GET /api/run-artifacts/:id                       one record, transcript included
 *       ?includePrompt=1      adds composed_prompt
 *   GET /api/run-artifacts/:id/tool-calls            ordered tool calls
 *       ?full=1               full stored output_text (else a preview)
 *
 * Ownership: admins see everything. Otherwise a message-parented record is
 * visible to the owner of its session, and a non-message record to the
 * owner of its parent (gap_assessments.user_id, anton_tasks.user_id,
 * engagements.user_id through the iteration).
 */
import { Router, type Request, type Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';

export const RUN_PARENT_KINDS = ['message', 'gap_batch', 'task_step', 'engagement_step'] as const;
export type RunParentKind = (typeof RUN_PARENT_KINDS)[number];

/** Parents whose id is `<ownerId>:<…>` — a lookup by the owner id alone lists them all. */
const COMPOSITE_PARENT_KINDS: ReadonlySet<RunParentKind> = new Set<RunParentKind>(['gap_batch', 'task_step']);

/** Characters of tool output returned without ?full=1. */
export const TOOL_OUTPUT_PREVIEW_CHARS = 600;
const MAX_RECORDS = 200;

const SUMMARY_COLUMNS = `ra.id, ra.message_id, ra.session_id, ra.parent_kind, ra.parent_id, ra.engine, ra.engine_version,
        ra.model_requested, ra.model_served, ra.request_params, ra.prompt_sha256, ra.prompt_chars, ra.truncated,
        ra.user_message_sha256, ra.history_sha256, ra.output_sha256, ra.thinking_sha256, ra.usage, ra.cost_usd,
        ra.cost_basis, ra.status, ra.rerun_of, ra.rerun_mode, ra.layer_summary, ra.source_manifest,
        ra.created_at, ra.finished_at,
        CASE WHEN jsonb_typeof(ra.transcript) = 'array' THEN jsonb_array_length(ra.transcript) ELSE 0 END AS transcript_turns,
        (SELECT COUNT(*)::int FROM run_tool_calls t WHERE t.run_artifact_id = ra.id) AS tool_call_count`;

/** The statements the routes issue — exported so a test fake can answer by shape. */
export const RUN_ARTIFACT_SQL = {
  /** Params: kind, parent_id. */
  byParentExact: (extra: string) =>
    `SELECT ${SUMMARY_COLUMNS}${extra} FROM run_artifacts ra WHERE ra.parent_kind = ? AND ra.parent_id = ? ORDER BY ra.created_at ASC, ra.id ASC LIMIT ${MAX_RECORDS}`,
  /** Params: kind, parent_id, like-pattern (escaped, `<id>:%`). */
  byParentPrefix: (extra: string) =>
    `SELECT ${SUMMARY_COLUMNS}${extra} FROM run_artifacts ra WHERE ra.parent_kind = ? AND (ra.parent_id = ? OR ra.parent_id LIKE ? ESCAPE '\\') ORDER BY ra.created_at ASC, ra.id ASC LIMIT ${MAX_RECORDS}`,
  /** Params: message_id (a message-parented record; rows from before v2 carry no parent_id). */
  byMessage: (extra: string) =>
    `SELECT ${SUMMARY_COLUMNS}${extra} FROM run_artifacts ra WHERE ra.message_id = ? ORDER BY ra.created_at ASC, ra.id ASC LIMIT ${MAX_RECORDS}`,
  /** Params: id. */
  byId: (extra: string) => `SELECT ${SUMMARY_COLUMNS}${extra} FROM run_artifacts ra WHERE ra.id = ?`,
  /** Params: run_artifact_id. */
  toolCalls:
    'SELECT id, seq, tool_name, input, output_text, output_sha256, output_chars, is_error, duration_ms, created_at FROM run_tool_calls WHERE run_artifact_id = ? ORDER BY seq ASC, created_at ASC',
  sessionOwner: 'SELECT user_id FROM sessions WHERE id = ?',
  gapOwner: 'SELECT user_id FROM gap_assessments WHERE id = ?',
  taskOwner: 'SELECT user_id FROM anton_tasks WHERE id = ?',
  engagementOwner:
    'SELECT e.user_id FROM engagement_iterations i JOIN engagements e ON e.id = i.engagement_id WHERE i.id = ?',
} as const;

interface RequestUser { id?: string; role?: string }

function requestUser(req: Request): RequestUser | null {
  const user = (req as unknown as { user?: RequestUser }).user;
  return user && typeof user === 'object' ? user : null;
}

function flag(v: unknown): boolean {
  return v === '1' || v === 'true' || v === 'yes';
}

function isParentKind(v: string): v is RunParentKind {
  return (RUN_PARENT_KINDS as ReadonlyArray<string>).includes(v);
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function parseMaybe(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalise a run_artifacts row for the client (JSONB may arrive as strings, NUMERIC as text). */
function normaliseRecord(row: Record<string, unknown>, opts: { includePrompt: boolean; includeTranscript: boolean }): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...row,
    request_params: parseMaybe(row.request_params),
    usage: parseMaybe(row.usage),
    layer_summary: parseMaybe(row.layer_summary),
    source_manifest: parseMaybe(row.source_manifest),
    cost_usd: numberOrNull(row.cost_usd),
    transcript_turns: numberOrNull(row.transcript_turns) ?? 0,
    tool_call_count: numberOrNull(row.tool_call_count) ?? 0,
    truncated: row.truncated === true || row.truncated === 1 || row.truncated === 't',
  };
  if (opts.includeTranscript) {
    const t = parseMaybe(row.transcript);
    out.transcript = Array.isArray(t) ? t : [];
  } else {
    delete out.transcript;
  }
  if (!opts.includePrompt) delete out.composed_prompt;
  return out;
}

/**
 * The user id that owns a record's parent, or undefined when the parent is
 * not found (or the kind unknown). A message-parented record is owned by its
 * session's owner.
 */
export async function ownerOfRunParent(
  db: DatabaseAdapter,
  kind: string,
  parentId: string | null,
  sessionId: string | null,
): Promise<string | null | undefined> {
  const first = (id: string | null): string | null => (id ? id.split(':')[0] : null);
  switch (kind) {
    case 'message': {
      if (!sessionId) return undefined;
      const row = await db.get<{ user_id: string | null }>(RUN_ARTIFACT_SQL.sessionOwner, sessionId);
      return row ? row.user_id ?? null : undefined;
    }
    case 'gap_batch': {
      const id = first(parentId);
      if (!id) return undefined;
      const row = await db.get<{ user_id: string | null }>(RUN_ARTIFACT_SQL.gapOwner, id);
      return row ? row.user_id ?? null : undefined;
    }
    case 'task_step': {
      const id = first(parentId);
      if (!id) return undefined;
      const row = await db.get<{ user_id: string | null }>(RUN_ARTIFACT_SQL.taskOwner, id);
      return row ? row.user_id ?? null : undefined;
    }
    case 'engagement_step': {
      if (!parentId) return undefined;
      const row = await db.get<{ user_id: string | null }>(RUN_ARTIFACT_SQL.engagementOwner, parentId);
      return row ? row.user_id ?? null : undefined;
    }
    default:
      return undefined;
  }
}

/** Admins pass; otherwise the caller must own the parent. */
async function canReadParent(
  db: DatabaseAdapter,
  user: RequestUser,
  kind: string,
  parentId: string | null,
  sessionId: string | null,
): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (!user.id) return false;
  const owner = await ownerOfRunParent(db, kind, parentId, sessionId);
  return owner !== undefined && owner !== null && owner === user.id;
}

export function createRunArtifactRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // GET /api/run-artifacts/by-parent/:kind/:id
  router.get('/run-artifacts/by-parent/:kind/:id', async (req: Request, res: Response) => {
    try {
      const user = requestUser(req);
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const kind = String(req.params.kind ?? '');
      const parentId = String(req.params.id ?? '').trim();
      if (!isParentKind(kind)) { res.status(400).json({ error: `Unknown parent kind: ${kind}` }); return; }
      if (!parentId) { res.status(400).json({ error: 'Parent id required' }); return; }

      const includePrompt = flag(req.query.includePrompt);
      const includeTranscript = flag(req.query.includeTranscript);
      const extra = `${includePrompt ? ', ra.composed_prompt' : ''}${includeTranscript ? ', ra.transcript' : ''}`;

      // Ownership is decided by the parent, not by any one record — an
      // assessment with no records yet answers [] to its owner, 403 to others.
      let rows: Record<string, unknown>[];
      if (kind === 'message') {
        rows = await db.all<Record<string, unknown>>(RUN_ARTIFACT_SQL.byMessage(extra), parentId);
        // A message record's owner is its session's owner (the parent id is the message id).
        const sessionId = rows.length > 0 ? (rows[0].session_id as string | null) ?? null : null;
        if (rows.length === 0) { res.json([]); return; }
        if (!await canReadParent(db, user, kind, parentId, sessionId)) { res.status(403).json({ error: 'Access denied' }); return; }
      } else {
        if (!await canReadParent(db, user, kind, parentId, null)) { res.status(403).json({ error: 'Access denied' }); return; }
        rows = COMPOSITE_PARENT_KINDS.has(kind)
          ? await db.all<Record<string, unknown>>(RUN_ARTIFACT_SQL.byParentPrefix(extra), kind, parentId, `${escapeLike(parentId)}:%`)
          : await db.all<Record<string, unknown>>(RUN_ARTIFACT_SQL.byParentExact(extra), kind, parentId);
      }
      res.json(rows.map((r) => normaliseRecord(r, { includePrompt, includeTranscript })));
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/run-artifacts/:id — one record with its transcript
  router.get('/run-artifacts/:id', async (req: Request, res: Response) => {
    try {
      const user = requestUser(req);
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const id = String(req.params.id ?? '').trim();
      if (!id) { res.status(400).json({ error: 'Run record id required' }); return; }
      const includePrompt = flag(req.query.includePrompt);
      const extra = `${includePrompt ? ', ra.composed_prompt' : ''}, ra.transcript`;
      const row = await db.get<Record<string, unknown>>(RUN_ARTIFACT_SQL.byId(extra), id);
      if (!row) { res.status(404).json({ error: 'Run record not found' }); return; }
      const kind = String(row.parent_kind ?? 'message');
      const parentId = kind === 'message' ? (row.message_id as string | null) ?? null : (row.parent_id as string | null) ?? null;
      if (!await canReadParent(db, user, kind, parentId, (row.session_id as string | null) ?? null)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      res.json(normaliseRecord(row, { includePrompt, includeTranscript: true }));
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/run-artifacts/:id/tool-calls — in call order
  router.get('/run-artifacts/:id/tool-calls', async (req: Request, res: Response) => {
    try {
      const user = requestUser(req);
      if (!user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const id = String(req.params.id ?? '').trim();
      if (!id) { res.status(400).json({ error: 'Run record id required' }); return; }
      const full = flag(req.query.full);
      const row = await db.get<Record<string, unknown>>(RUN_ARTIFACT_SQL.byId(''), id);
      if (!row) { res.status(404).json({ error: 'Run record not found' }); return; }
      const kind = String(row.parent_kind ?? 'message');
      const parentId = kind === 'message' ? (row.message_id as string | null) ?? null : (row.parent_id as string | null) ?? null;
      if (!await canReadParent(db, user, kind, parentId, (row.session_id as string | null) ?? null)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      const calls = await db.all<Record<string, unknown>>(RUN_ARTIFACT_SQL.toolCalls, id);
      res.json(calls.map((c) => {
        const text = typeof c.output_text === 'string' ? c.output_text : '';
        const out: Record<string, unknown> = {
          id: c.id,
          seq: numberOrNull(c.seq) ?? 0,
          tool_name: c.tool_name,
          input: parseMaybe(c.input),
          output_sha256: c.output_sha256 ?? null,
          output_chars: numberOrNull(c.output_chars) ?? text.length,
          stored_chars: text.length,
          is_error: c.is_error === true || c.is_error === 1 || c.is_error === 't',
          duration_ms: numberOrNull(c.duration_ms),
          created_at: c.created_at,
          output_preview: text.length > TOOL_OUTPUT_PREVIEW_CHARS ? text.slice(0, TOOL_OUTPUT_PREVIEW_CHARS) : text,
          output_preview_truncated: text.length > TOOL_OUTPUT_PREVIEW_CHARS,
        };
        if (full) out.output_text = text;
        return out;
      }));
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
