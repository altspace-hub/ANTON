/**
 * session-resume.ts
 * Session Resume service — creates and retrieves rich session snapshots
 * for first-class resume functionality. Injects resume context as prompt
 * layer 4a when continuing a session.
 *
 * Wave 4 (track C): the resume block is for coming back LATER. The
 * conversation history already carries the recent turns, so the block is
 * only due when a snapshot exists AND the previous turn ended more than
 * RESUME_GAP_MINUTES ago (`shouldInjectResume` / `buildResumeContextIfDue`).
 * Before this, "This session was paused" was injected on every turn once any
 * snapshot existed. The snapshot itself is now written by
 * session-conclusion.ts after each substantive answer.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

/** Minutes of silence after the previous answer before the resume block is due. */
export const RESUME_GAP_MINUTES = 30;

export interface SessionSnapshot {
  id: string;
  session_id: string;
  snapshot_type: 'auto' | 'manual' | 'pause' | 'checkpoint';
  title: string | null;
  summary: string;
  key_decisions: string[];
  open_questions: string[];
  next_steps: string[];
  context_state: Record<string, unknown>;
  token_count: number;
  user_id: string;
  /** The assistant message this conclusion was taken after (null for manual snapshots). */
  message_id: string | null;
  created_at: string;
}

interface RawSnapshotRow {
  id: string;
  session_id: string;
  snapshot_type: string;
  title: string | null;
  summary: string;
  key_decisions: string | string[] | null;
  open_questions: string | string[] | null;
  next_steps: string | string[] | null;
  context_state: string | Record<string, unknown> | null;
  token_count: number;
  user_id: string;
  message_id?: string | null;
  created_at: string;
}

function parseList(v: string | string[] | null | undefined): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (!v) return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseState(v: string | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (v && typeof v === 'object') return v;
  if (!v) return {};
  try {
    const parsed: unknown = JSON.parse(v);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseSnapshot(row: RawSnapshotRow): SessionSnapshot {
  return {
    ...row,
    snapshot_type: row.snapshot_type as SessionSnapshot['snapshot_type'],
    key_decisions: parseList(row.key_decisions),
    open_questions: parseList(row.open_questions),
    next_steps: parseList(row.next_steps),
    context_state: parseState(row.context_state),
    message_id: row.message_id ?? null,
  };
}

/**
 * Prompt layer 4a: the resume block. One renderer for every caller — the
 * factory's buildResumeContext, the /resume-context route and
 * buildResumeContextIfDue all produce this exact text.
 */
export function renderResumeContext(snapshot: SessionSnapshot): string {
  const lines: string[] = ['## SESSION RESUME CONTEXT'];
  lines.push('You are resuming this session after a break. Here is what was concluded so far:\n');
  if (snapshot.title) lines.push(`**Session:** ${snapshot.title}`);
  lines.push(`**Session Summary:** ${snapshot.summary}`);

  if (snapshot.key_decisions.length > 0) {
    lines.push('\n**Key Decisions Made:**');
    snapshot.key_decisions.forEach((d, i) => lines.push(`${i + 1}. ${d}`));
  }

  if (snapshot.open_questions.length > 0) {
    lines.push('\n**Open Questions (not yet resolved):**');
    snapshot.open_questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  }

  if (snapshot.next_steps.length > 0) {
    lines.push('\n**Planned Next Steps:**');
    snapshot.next_steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }

  lines.push('\nContinue from where the session left off. Do not repeat work already completed. Reference the above context where relevant.');

  return lines.join('\n');
}

/**
 * Is the resume block due on this turn? True only when a snapshot exists AND
 * the previous message is older than RESUME_GAP_MINUTES. A session with a
 * snapshot but no previous message at all has nothing recent to carry the
 * context, so the block is due; an unparseable timestamp is treated as "not
 * due" — injecting on doubt is the bug this replaces.
 */
export function shouldInjectResume(input: {
  lastMessageAt: string | Date | null;
  now?: Date;
  hasSnapshot: boolean;
}): boolean {
  if (!input.hasSnapshot) return false;
  if (input.lastMessageAt === null) return true;
  const last = input.lastMessageAt instanceof Date ? input.lastMessageAt : new Date(input.lastMessageAt);
  const lastMs = last.getTime();
  if (Number.isNaN(lastMs)) return false;
  const nowMs = (input.now ?? new Date()).getTime();
  return nowMs - lastMs >= RESUME_GAP_MINUTES * 60_000;
}

export interface ResumeContextDecision {
  /** The rendered block when due, '' otherwise. */
  text: string;
  due: boolean;
  /** Latest snapshot of the session, whether or not the block was due. */
  snapshotId: string | null;
  /** Whole minutes since the previous answer; null when the session has none. */
  gapMinutes: number | null;
}

const NOT_DUE: ResumeContextDecision = { text: '', due: false, snapshotId: null, gapMinutes: null };

/**
 * Read the latest snapshot and the previous turn's timestamp, apply
 * shouldInjectResume, and render the block only when it is due.
 *
 * "Previous message" is the newest ASSISTANT message: routes/claude.ts
 * persists the incoming user message before the prompt layers are built, so
 * MAX(created_at) over all messages would always be "just now" and the block
 * would never be due. Anchoring on the last answer is correct in either
 * wiring order. Never throws — any failure means "not due".
 */
export async function buildResumeContextIfDue(
  db: DatabaseAdapter,
  sessionId: string,
  now: Date = new Date(),
): Promise<ResumeContextDecision> {
  try {
    const row = await db.get<RawSnapshotRow>(
      'SELECT * FROM session_snapshots WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
      sessionId,
    );
    if (!row) return { ...NOT_DUE };

    const last = await db.get<{ created_at: string | Date | null }>(
      "SELECT created_at FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1",
      sessionId,
    );
    const lastMessageAt = last?.created_at ?? null;

    let gapMinutes: number | null = null;
    if (lastMessageAt !== null) {
      const lastMs = (lastMessageAt instanceof Date ? lastMessageAt : new Date(lastMessageAt)).getTime();
      gapMinutes = Number.isNaN(lastMs) ? null : Math.max(0, Math.round((now.getTime() - lastMs) / 60_000));
    }

    const due = shouldInjectResume({ lastMessageAt, now, hasSnapshot: true });
    return {
      text: due ? renderResumeContext(parseSnapshot(row)) : '',
      due,
      snapshotId: row.id,
      gapMinutes,
    };
  } catch {
    return { ...NOT_DUE };
  }
}

export interface CreateSnapshotInput {
  session_id: string;
  snapshot_type?: SessionSnapshot['snapshot_type'];
  title?: string;
  summary: string;
  key_decisions?: string[];
  open_questions?: string[];
  next_steps?: string[];
  context_state?: Record<string, unknown>;
  token_count?: number;
  user_id?: string;
}

export async function createSessionResumeService(db: DatabaseAdapter) {
  /**
   * Create a snapshot of the current session state.
   *
   * One row per snapshot (migration 276 dropped the UNIQUE (session_id)
   * constraint): a manual snapshot sits alongside the automatic conclusions
   * and readers take the newest by created_at.
   */
  async function createSnapshot(input: CreateSnapshotInput): Promise<SessionSnapshot> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const row = await db.get<{ id: string }>(`
      INSERT INTO session_snapshots
        (id, session_id, snapshot_type, title, summary, key_decisions, open_questions, next_steps, context_state, token_count, user_id, message_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      RETURNING id
    `,
      id,
      input.session_id,
      input.snapshot_type ?? 'auto',
      input.title ?? null,
      input.summary,
      JSON.stringify(input.key_decisions ?? []),
      JSON.stringify(input.open_questions ?? []),
      JSON.stringify(input.next_steps ?? []),
      JSON.stringify(input.context_state ?? {}),
      input.token_count ?? 0,
      input.user_id ?? 'default',
      now,
    );

    return (await getSnapshot(row?.id ?? id))!;
  }

  /**
   * Get the most recent snapshot for a session.
   */
  async function getLatestSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
    const row = await db.get(`
      SELECT * FROM session_snapshots
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, sessionId) as RawSnapshotRow | undefined;

    return row ? parseSnapshot(row) : null;
  }

  /**
   * Get a specific snapshot by ID.
   */
  async function getSnapshot(snapshotId: string): Promise<SessionSnapshot | null> {
    const row = await db.get('SELECT * FROM session_snapshots WHERE id = ?', snapshotId) as RawSnapshotRow | undefined;
    return row ? parseSnapshot(row) : null;
  }

  /**
   * List all snapshots for a session, most recent first.
   */
  async function listSnapshots(sessionId: string, limit = 10): Promise<SessionSnapshot[]> {
    const rows = await db.all(`
      SELECT * FROM session_snapshots
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, sessionId, limit) as RawSnapshotRow[];

    return rows.map(parseSnapshot);
  }

  /**
   * Delete a snapshot, but only if it belongs to `sessionId`.
   *
   * The session_id is part of the predicate, not merely of the caller's URL: the
   * route's ownership gate can only vouch for :sessionId, and a snapshot id is an
   * independently guessable key. Deleting by snapshot id alone (as this did) let a
   * team-mode caller pair their own session with another tenant's snapshot id and
   * destroy it. There is deliberately no delete-by-id-alone variant left to call.
   */
  async function deleteSnapshotForSession(snapshotId: string, sessionId: string): Promise<boolean> {
    const result = await db.run(
      'DELETE FROM session_snapshots WHERE id = ? AND session_id = ?',
      snapshotId, sessionId,
    );
    return result.changes > 0;
  }

  /**
   * Build prompt layer 4a: Resume Context.
   * Injected into the system prompt when resuming a session.
   */
  function buildResumeContext(snapshot: SessionSnapshot): string {
    return renderResumeContext(snapshot);
  }

  return {
    createSnapshot,
    getLatestSnapshot,
    getSnapshot,
    listSnapshots,
    deleteSnapshotForSession,
    buildResumeContext,
  };
}
