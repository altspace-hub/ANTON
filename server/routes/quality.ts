import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createQualityRatchet } from '../services/quality-ratchet.js';
import { requireAuth } from '../middleware/auth.js';
import { scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';

export async function createQualityRoutes(db: DatabaseAdapter, anthropic?: any) {
  const router = Router();
  const ratchet = await createQualityRatchet(db);

  /**
   * Team isolation: is this session the caller's? Checked in SQL before any read
   * or write keyed on the id. A quality score's reasoning (strengths, weaknesses,
   * the improvement suggestion) describes the scored output, and a verdict or
   * rating is written against it, so by-session reads and output verdicts used to
   * work on any user's session. A session that is not the caller's is handled
   * exactly like a missing one by each route below. Solo mode and admins are not
   * scoped.
   */
  async function isOwnSession(req: OwnedRequest, sessionId: string | null | undefined): Promise<boolean> {
    if (!scopesToOwner(req)) return true;
    const userId = req.user?.id;
    if (!sessionId || !userId) return false;
    const row = await db.get('SELECT 1 AS ok FROM sessions WHERE id = ? AND user_id = ?', String(sessionId), userId);
    return !!row;
  }

  /** A client-supplied sessionId, or undefined when it names someone else's session (treated as absent). */
  async function ownSessionIdOrAbsent(req: OwnedRequest, sessionId: unknown): Promise<string | undefined> {
    if (typeof sessionId !== 'string' || !sessionId) return undefined;
    return (await isOwnSession(req, sessionId)) ? sessionId : undefined;
  }

  // POST /api/quality/score — score an output
  router.post('/quality/score', requireAuth, async (req, res) => {
    try {
      const { content, moduleId, areaId } = req.body;
      if (!content || !moduleId) {
        return res.status(400).json({ error: 'content and moduleId required' });
      }
      // The score is stored against the session and shown on it; someone else's
      // session is treated as absent, so the content is scored but tied to nothing.
      const sessionId = await ownSessionIdOrAbsent(req, req.body.sessionId);
      const result = await ratchet.scoreOutput({ content, moduleId, areaId, sessionId, anthropicClient: anthropic });
      res.json(result);
    } catch (error) {
      console.error('Quality scoring error:', error);
      res.status(500).json({ error: 'Failed to score output' });
    }
  });

  // GET /api/quality/trend/:moduleId — quality trend for a module
  router.get('/quality/trend/:moduleId', requireAuth, async (req, res) => {
    try {
      // Team isolation: each score row carries its reasoning, session id and
      // notes, and module ids are public, so a non-admin sees only scores on
      // their own sessions. The module baseline stays instance-wide.
      const ownerUserId = scopesToOwner(req) ? (req.user?.id ?? null) : undefined;
      res.json(await ratchet.getModuleQualityTrend(req.params.moduleId as string, { ownerUserId }));
    } catch (error) {
      console.error('Quality trend error:', error);
      res.status(500).json({ error: 'Failed to fetch quality trend' });
    }
  });

  // GET /api/quality/leaderboard — top scoring modules
  router.get('/quality/leaderboard', requireAuth, async (req, res) => {
    try {
      res.json(await ratchet.getQualityLeaderboard());
    } catch (error) {
      console.error('Quality leaderboard error:', error);
      res.status(500).json({ error: 'Failed to fetch quality leaderboard' });
    }
  });

  // POST /api/quality/feedback — submit a user star rating for an output
  router.post('/quality/feedback', requireAuth, async (req, res) => {
    try {
      const { moduleId, rating, qualityScoreId, areaId, comment } = req.body;
      if (!moduleId) return res.status(400).json({ error: 'moduleId required' });
      if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
      }
      // A rating tied to someone else's session is kept for the module only.
      const sessionId = await ownSessionIdOrAbsent(req, req.body.sessionId);
      const result = await ratchet.submitFeedback({ moduleId, rating, sessionId, qualityScoreId, areaId, comment, userId: req.user?.id });
      res.json(result);
    } catch (error) {
      console.error('Feedback submit error:', error);
      res.status(500).json({ error: 'Failed to submit feedback' });
    }
  });

  // POST /api/quality/output-verdict — Wave 3.3: 1-click "Good output /
  // Needs work" valve in the standard output footer. Writes an
  // output_feedback row with verdict + the exact assistant message_id
  // (migration 226); a second click on the same message UPDATES the verdict
  // instead of stacking rows. messageId optional — resolved to the session's
  // latest assistant message when omitted (the footer rates the last output).
  router.post('/quality/output-verdict', requireAuth, async (req, res) => {
    try {
      const { sessionId, messageId, moduleId, areaId, verdict, comment } = req.body as {
        sessionId?: string; messageId?: string; moduleId?: string;
        areaId?: string; verdict?: string; comment?: string;
      };
      if (verdict !== 'good' && verdict !== 'needs_work') {
        return res.status(400).json({ error: "verdict must be 'good' or 'needs_work'" });
      }
      if (!sessionId && !messageId) {
        return res.status(400).json({ error: 'sessionId or messageId required' });
      }

      let msgId = typeof messageId === 'string' && messageId ? messageId : null;
      let sessId = typeof sessionId === 'string' && sessionId ? sessionId : null;
      const NO_OUTPUT = 'No assistant output found to rate in this session';
      // Team isolation, checked before anything is read by either id, with the
      // same 404 as a session with no output: a named session must be the
      // caller's, and so must a named message's real session (joined from the
      // message, so one's own sessionId paired with a colleague's messageId does
      // not get through).
      if (scopesToOwner(req)) {
        if (sessId && !(await isOwnSession(req, sessId))) {
          return res.status(404).json({ error: NO_OUTPUT });
        }
        if (msgId) {
          const owned = await db.get(
            `SELECT 1 AS ok FROM messages m JOIN sessions s ON s.id = m.session_id
              WHERE m.id = ? AND s.user_id = ?`,
            msgId, req.user?.id ?? '') as { ok: number } | undefined;
          if (!owned) return res.status(404).json({ error: NO_OUTPUT });
        }
      }
      if (!msgId && sessId) {
        const row = await db.get(
          `SELECT id FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1`,
          sessId) as { id: string } | undefined;
        msgId = row?.id ?? null;
      } else if (msgId && !sessId) {
        const row = await db.get('SELECT session_id FROM messages WHERE id = ?', msgId) as { session_id: string | null } | undefined;
        sessId = row?.session_id ?? null;
      }
      if (!msgId) {
        return res.status(404).json({ error: NO_OUTPUT });
      }

      // One verdict per message — toggle by update.
      const existing = await db.get(
        'SELECT id FROM output_feedback WHERE message_id = ? AND verdict IS NOT NULL LIMIT 1',
        msgId) as { id: string } | undefined;
      if (existing) {
        await db.run(
          'UPDATE output_feedback SET verdict = ?, comment = COALESCE(?, comment) WHERE id = ?',
          verdict, typeof comment === 'string' && comment.trim() ? comment.trim() : null, existing.id);
        return res.json({ id: existing.id, messageId: msgId, verdict, updated: true });
      }

      const id = `ofv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(
        `INSERT INTO output_feedback (id, session_id, message_id, module_id, area_id, verdict, comment, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id, sessId, msgId,
        typeof moduleId === 'string' && moduleId ? moduleId : 'open-chat',
        typeof areaId === 'string' && areaId ? areaId : null,
        verdict,
        typeof comment === 'string' && comment.trim() ? comment.trim() : null,
        req.user?.id ?? null);
      res.json({ id, messageId: msgId, verdict, updated: false });
    } catch (error) {
      console.error('Output verdict error:', error);
      res.status(500).json({ error: 'Failed to record output verdict' });
    }
  });

  // GET /api/quality/output-verdict/:sessionId — current verdict for the
  // session's latest assistant output (the footer's "rated ✓" state).
  router.get('/quality/output-verdict/:sessionId', requireAuth, async (req, res) => {
    try {
      // Someone else's session answers like one with no output yet.
      if (!(await isOwnSession(req, String(req.params.sessionId)))) return res.json({ messageId: null, verdict: null });
      const msg = await db.get(
        `SELECT id FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1`,
        req.params.sessionId) as { id: string } | undefined;
      if (!msg) return res.json({ messageId: null, verdict: null });
      const row = await db.get(
        `SELECT verdict FROM output_feedback WHERE message_id = ? AND verdict IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
        msg.id) as { verdict: string } | undefined;
      res.json({ messageId: msg.id, verdict: row?.verdict ?? null });
    } catch (error) {
      console.error('Output verdict fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch output verdict' });
    }
  });

  // GET /api/quality/feedback/stats/:moduleId — user feedback stats for a module
  router.get('/quality/feedback/stats/:moduleId', requireAuth, async (req, res) => {
    try {
      // Team isolation: the counts stay instance-wide, but a non-admin's
      // recentComments are their own — the comments are free text about a
      // colleague's output.
      const commentsOfUserId = scopesToOwner(req) ? (req.user?.id ?? null) : undefined;
      res.json(await ratchet.getFeedbackStats(req.params.moduleId as string, { commentsOfUserId }));
    } catch (error) {
      console.error('Feedback stats error:', error);
      res.status(500).json({ error: 'Failed to fetch feedback stats' });
    }
  });

  // GET /api/quality/by-session/:sessionId — most recent quality score for a session
  router.get('/quality/by-session/:sessionId', requireAuth, async (req, res) => {
    try {
      // Someone else's session answers like one with no score yet.
      if (!(await isOwnSession(req, String(req.params.sessionId)))) return res.json(null);
      const row = await db.get(
        `SELECT * FROM quality_scores WHERE session_id = ? ORDER BY scored_at DESC LIMIT 1`
      , req.params.sessionId) as Record<string, unknown> | undefined;
      if (!row) return res.json(null);
      let reasoning: { strengths?: string[]; weaknesses?: string[]; improvementSuggestion?: string } | null = null;
      try { if (row.score_reasoning) reasoning = JSON.parse(row.score_reasoning as string); } catch { /* ignore */ }
      res.json({
        id: row.id,
        moduleId: row.module_id,
        overall: row.score_overall,
        completeness: row.score_completeness,
        accuracy: row.score_accuracy,
        structure: row.score_structure,
        actionability: row.score_actionability,
        citations: row.score_citations,
        isRegression: !!row.is_regression,
        scoredAt: row.scored_at,
        reasoning,
      });
    } catch (error) {
      console.error('Quality by-session error:', error);
      res.status(500).json({ error: 'Failed to fetch session quality score' });
    }
  });

  return router;
}
