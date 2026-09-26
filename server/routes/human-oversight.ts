/**
 * human-oversight.ts
 * EUAI-02: Human oversight sign-off workflow for high-risk FCP modules.
 *
 * Modules requiring mandatory human review before export (the list lives in
 * services/oversight-status.ts; re-exported here for existing importers):
 *   - gap-analysis
 *   - sanctions-advisory
 *   - investigation-support
 *
 * A sign-off is bound to the run it reviewed (Wave 3): the client names the
 * assistant message, the server verifies it belongs to the session, looks up
 * the run's prompt hash (run_artifacts.prompt_sha256) and hashes the stored
 * output itself. A client can therefore not attest to text the server never
 * produced, and a later answer in the same session is not covered by an
 * earlier signature (services/oversight-status.ts checks the binding).
 *
 * Endpoints:
 *   POST /api/oversight/reviews          — record a human review sign-off
 *   GET  /api/oversight/reviews          — list reviews (filterable by session_id, module_id)
 *   GET  /api/oversight/sessions/:id/review — get latest review for a session
 *   GET  /api/oversight/modules          — list modules that require oversight
 */

import express from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { ownerFilter } from '../middleware/ownership.js';
import { sha256Hex } from '../services/run-artifact-writer.js';
import { OVERSIGHT_GATED_MODULES, type OversightReviewRow } from '../services/oversight-status.js';

/** @deprecated alias — import OVERSIGHT_GATED_MODULES from services/oversight-status.ts. */
export const OVERSIGHT_REQUIRED_MODULES = OVERSIGHT_GATED_MODULES;

export type OversightRequiredModule = typeof OVERSIGHT_REQUIRED_MODULES[number];

const VERDICTS = ['approved', 'requires_amendment', 'rejected'] as const;
type Verdict = typeof VERDICTS[number];

function isVerdict(v: unknown): v is Verdict {
  return typeof v === 'string' && (VERDICTS as readonly string[]).includes(v);
}

function getUserId(req: unknown): string {
  return (req as { user?: { id?: string } }).user?.id ?? 'default';
}

/** Body of POST /oversight/reviews. Both spellings of the message id are accepted. */
interface SignOffBody {
  session_id?: unknown;
  module_id?: unknown;
  reviewer_name?: unknown;
  reviewer_role?: unknown;
  verdict?: unknown;
  notes?: unknown;
  messageId?: unknown;
  message_id?: unknown;
  evidencePackId?: unknown;
  evidence_pack_id?: unknown;
}

function optionalString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined;
}

/**
 * The queries, exported so tests/db/query-column-drift.test.ts can run the
 * exact statements against a real schema. human_oversight_reviews (schema line
 * ~566) scopes rows by `user_id`; there is no `reviewer_id` column — an earlier
 * draft filtered on one and the per-session GET 500'd on every call.
 */
export const OVERSIGHT_SQL = {
  /** Latest review for one session, scoped to the calling user. Params: session_id, user_id. */
  sessionReview:
    'SELECT * FROM human_oversight_reviews WHERE session_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
  /** Review list for the calling user with optional filters. Returns SQL + params in order. */
  listReviews: (
    userId: string,
    filters: { sessionId?: string; moduleId?: string },
    limit: number,
  ): { sql: string; params: unknown[] } => {
    let sql = 'SELECT * FROM human_oversight_reviews WHERE user_id = ?';
    const params: unknown[] = [userId];
    if (filters.sessionId) {
      sql += ' AND session_id = ?';
      params.push(filters.sessionId);
    }
    if (filters.moduleId) {
      sql += ' AND module_id = ?';
      params.push(filters.moduleId);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return { sql, params };
  },
  /**
   * The answer being signed: must be an assistant message OF THAT SESSION. The
   * sessions join exists so ownerFilter(req, 's.user_id') can be appended in team
   * mode. Params: message_id, session_id (+ owner scope).
   */
  assistantMessage:
    "SELECT m.id, m.content, m.created_at FROM messages m JOIN sessions s ON s.id = m.session_id WHERE m.id = ? AND m.session_id = ? AND m.role = 'assistant'",
  /** The run's prompt hash, written by run-artifact-writer at the end of the run. Params: message_id. */
  runArtifactHash:
    'SELECT prompt_sha256 FROM run_artifacts WHERE message_id = ?',
  /**
   * Existence check for an optional evidence pack reference. Params: id (+ owner
   * scope: ownerFilter(req, 'created_by') is appended in team mode).
   */
  evidencePack:
    'SELECT id FROM evidence_packs WHERE id = ?',
  /**
   * The audit_log row of the signed run — a heuristic, because audit_log has no
   * message_id. The assistant row is inserted first (claude.ts ~:1076) and the
   * audit entry is enqueued afterwards (~:1192) and flushed by audit-queue on a
   * 5 s timer, so the run's audit row carries a `timestamp` 0–7 s AFTER the
   * message's created_at (measured on the dev database: +0.1 s … +2 s). The row
   * we want is therefore the EARLIEST audit row for the session at or after the
   * message's created_at (5 s tolerance for the node-clock vs NOW() gap), and
   * strictly BEFORE the next assistant message of the session — so a run whose
   * audit write failed does not borrow the following run's row. With no later
   * answer the window closes 10 minutes after the message. A row that is not
   * found is left alone; the sign-off itself does not depend on it.
   * Params: message_id.
   */
  auditRowForMessage:
    `SELECT a.id FROM audit_log a
       JOIN messages m ON m.session_id = a.session_id
      WHERE m.id = ?
        AND a.timestamp >= m.created_at - interval '5 seconds'
        AND a.timestamp < COALESCE(
              (SELECT MIN(n.created_at) FROM messages n
                WHERE n.session_id = m.session_id AND n.role = 'assistant' AND n.created_at > m.created_at),
              m.created_at + interval '10 minutes')
      ORDER BY a.timestamp ASC
      LIMIT 1`,
} as const;

/** Params: reviewed_by, message_id. */
const MARK_AUDIT_REVIEWED_SQL =
  `UPDATE audit_log SET review_status = 'reviewed', reviewed_by = ?, reviewed_at = NOW()
    WHERE id = (${OVERSIGHT_SQL.auditRowForMessage})`;

export async function createHumanOversightRoutes(db: DatabaseAdapter) {
  const router = express.Router();

  /** GET /oversight/modules — list modules requiring human oversight */
  router.get('/oversight/modules', async (_req, res) => {
    res.json({
      modules: OVERSIGHT_GATED_MODULES,
      rationale: 'These modules produce compliance outputs that may materially affect regulated entities. EU AI Act Art. 14 requires human oversight before export.',
    });
  });

  /** POST /oversight/reviews — record a human review sign-off, bound to one answer */
  router.post('/oversight/reviews', async (req, res) => {
    try {
      const userId = getUserId(req);
      const body = (req.body ?? {}) as SignOffBody;
      const session_id = optionalString(body.session_id);
      const module_id = optionalString(body.module_id);
      const reviewer_name = optionalString(body.reviewer_name);
      const reviewer_role = optionalString(body.reviewer_role);
      const notes = optionalString(body.notes);
      const { verdict } = body;
      const messageId = optionalString(body.messageId) ?? optionalString(body.message_id);
      const evidencePackId = optionalString(body.evidencePackId) ?? optionalString(body.evidence_pack_id);

      if (!session_id || !module_id || !reviewer_name || !verdict) {
        return res.status(400).json({ error: 'session_id, module_id, reviewer_name, and verdict are required' });
      }
      if (!messageId) {
        return res.status(400).json({ error: 'messageId is required — a sign-off is bound to the answer it reviews' });
      }
      if (!isVerdict(verdict)) {
        return res.status(400).json({ error: 'verdict must be approved | requires_amendment | rejected' });
      }
      if (reviewer_name.length > 200) {
        return res.status(400).json({ error: 'reviewer_name too long (max 200 chars)' });
      }
      if (notes && notes.length > 2000) {
        return res.status(400).json({ error: 'notes too long (max 2000 chars)' });
      }
      if (messageId.length > 200 || (evidencePackId && evidencePackId.length > 200)) {
        return res.status(400).json({ error: 'messageId / evidencePackId too long (max 200 chars)' });
      }

      // The answer must be an assistant message of this session (and, in team
      // mode, of a session the caller owns). Anything else is refused: a
      // sign-off on a user message, on another session's answer, or on an id
      // the browser minted but the server never persisted, would attest to
      // nothing.
      const scope = ownerFilter(req, 's.user_id');
      const message = await db.get<{ id: string; content: string; created_at: string | Date }>(
        OVERSIGHT_SQL.assistantMessage + scope.sql,
        messageId,
        session_id,
        ...scope.params,
      );
      if (!message) {
        return res.status(400).json({ error: 'messageId is not an assistant message of this session' });
      }

      // Only a pack the caller may open (its creator; solo and admins are not
      // scoped), and someone else's pack gets the same 400 as a missing one:
      // this check answered for any pack id, which made it an existence oracle
      // for ids evidence-pack.ts hides behind a 404, and let a sign-off cite a
      // colleague's pack (round-2 gap "verify2:projects-2").
      if (evidencePackId) {
        const packScope = ownerFilter(req, 'created_by');
        const pack = await db.get<{ id: string }>(
          OVERSIGHT_SQL.evidencePack + packScope.sql, evidencePackId, ...packScope.params,
        );
        if (!pack) return res.status(400).json({ error: 'evidencePackId does not name an evidence pack' });
      }

      // Both hashes are the server's own: the prompt hash from the run record
      // (absent only for answers older than Wave 1 or whose artifact write
      // failed — the sign-off still records the output hash), the output hash
      // from the stored content. Client-supplied hashes are never read.
      const artifact = await db.get<{ prompt_sha256: string | null }>(OVERSIGHT_SQL.runArtifactHash, messageId);
      const promptSha256 = artifact?.prompt_sha256 ?? null;
      const outputSha256 = sha256Hex(message.content ?? '');

      const attestation = `I, ${reviewer_name.trim()}, confirm that I have reviewed the AI-generated analysis produced by openEXPERT for session ${session_id} (answer ${messageId}, output sha256 ${outputSha256}). I understand that this output is AI-assisted and does not constitute legal or regulatory advice. I take professional responsibility for any compliance decisions made based on this analysis.`;

      const result = await db.run(`
        INSERT INTO human_oversight_reviews
          (session_id, module_id, user_id, reviewer_name, reviewer_role, attestation, verdict, notes, export_blocked,
           message_id, prompt_sha256, output_sha256, evidence_pack_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, session_id,
        module_id,
        userId,
        reviewer_name.trim(),
        reviewer_role?.trim() ?? null,
        attestation,
        verdict,
        notes?.trim() ?? null,
        verdict === 'rejected' ? 1 : 0,
        messageId,
        promptSha256,
        outputSha256,
        evidencePackId ?? null,
      );

      // Best effort: stamp the run's audit row (see OVERSIGHT_SQL.auditRowForMessage
      // for why this is a heuristic). A failure here must not lose the sign-off.
      let auditRowsMarked = 0;
      try {
        const marked = await db.run(MARK_AUDIT_REVIEWED_SQL, userId, messageId);
        auditRowsMarked = marked.changes;
      } catch (err) {
        console.warn('[oversight] could not mark audit_log row reviewed (non-fatal):', err instanceof Error ? err.message : err);
      }

      const review = await db.get<OversightReviewRow>('SELECT * FROM human_oversight_reviews WHERE id = ?', result.lastInsertRowid);
      res.status(201).json({ review, auditRowsMarked });
    } catch (err) {
      console.error('[oversight] POST /oversight/reviews error:', err);
      res.status(500).json({ error: 'Failed to record review' });
    }
  });

  /** GET /oversight/reviews — list reviews for current user, optionally filtered */
  router.get('/oversight/reviews', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { session_id, module_id, limit: limitStr } = req.query as Record<string, string | undefined>;
      const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);

      const { sql, params } = OVERSIGHT_SQL.listReviews(userId, { sessionId: session_id, moduleId: module_id }, limit);
      // A list route: db.all, not db.get (which returned only the first row).
      const reviews = await db.all(sql, ...params);
      res.json({ reviews });
    } catch (err) {
      console.error('[oversight] GET /oversight/reviews error:', err);
      res.status(500).json({ error: 'Failed to fetch reviews' });
    }
  });

  /** GET /oversight/sessions/:sessionId/review — latest review for a session */
  router.get('/oversight/sessions/:sessionId/review', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { sessionId } = req.params;
      const review = await db.get(OVERSIGHT_SQL.sessionReview, sessionId, userId);
      res.json({ review: review ?? null });
    } catch (err) {
      console.error('[oversight] GET session review error:', err);
      res.status(500).json({ error: 'Failed to fetch session review' });
    }
  });

  return router;
}
