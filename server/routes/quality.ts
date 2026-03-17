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
