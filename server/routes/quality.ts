import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createQualityRatchet } from '../services/quality-ratchet.js';
import { requireAuth } from '../middleware/auth.js';

export async function createQualityRoutes(db: DatabaseAdapter, anthropic?: any) {
  const router = Router();
  const ratchet = await createQualityRatchet(db);

  // POST /api/quality/score — score an output
  router.post('/quality/score', requireAuth, async (req, res) => {
    try {
      const { content, moduleId, areaId, sessionId } = req.body;
      if (!content || !moduleId) {
        return res.status(400).json({ error: 'content and moduleId required' });
      }
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
      res.json(ratchet.getModuleQualityTrend(req.params.moduleId as string));
    } catch (error) {
      console.error('Quality trend error:', error);
      res.status(500).json({ error: 'Failed to fetch quality trend' });
    }
  });

  // GET /api/quality/leaderboard — top scoring modules
  router.get('/quality/leaderboard', requireAuth, async (req, res) => {
    try {
      res.json(ratchet.getQualityLeaderboard());
    } catch (error) {
      console.error('Quality leaderboard error:', error);
      res.status(500).json({ error: 'Failed to fetch quality leaderboard' });
    }
  });

  // POST /api/quality/feedback — submit a user star rating for an output
  router.post('/quality/feedback', requireAuth, async (req, res) => {
    try {
      const { moduleId, rating, sessionId, qualityScoreId, areaId, comment } = req.body;
      if (!moduleId) return res.status(400).json({ error: 'moduleId required' });
      if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
      }
      const result = ratchet.submitFeedback({ moduleId, rating, sessionId, qualityScoreId, areaId, comment });
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
        return res.status(404).json({ error: 'No assistant output found to rate in this session' });
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
      res.json(ratchet.getFeedbackStats(req.params.moduleId as string));
    } catch (error) {
      console.error('Feedback stats error:', error);
      res.status(500).json({ error: 'Failed to fetch feedback stats' });
    }
  });

  // GET /api/quality/by-session/:sessionId — most recent quality score for a session
  router.get('/quality/by-session/:sessionId', requireAuth, async (req, res) => {
    try {
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
