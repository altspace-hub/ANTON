import { Router } from 'express';
import Database from 'better-sqlite3';
import { createQualityRatchet } from '../services/quality-ratchet.js';
import { requireAuth } from '../middleware/auth.js';

export function createQualityRoutes(db: Database.Database, anthropic?: any) {
  const router = Router();
  const ratchet = createQualityRatchet(db);

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
  router.get('/quality/trend/:moduleId', requireAuth, (req, res) => {
    try {
      res.json(ratchet.getModuleQualityTrend(req.params.moduleId as string));
    } catch (error) {
      console.error('Quality trend error:', error);
      res.status(500).json({ error: 'Failed to fetch quality trend' });
    }
  });

  // GET /api/quality/leaderboard — top scoring modules
  router.get('/quality/leaderboard', requireAuth, (req, res) => {
    try {
      res.json(ratchet.getQualityLeaderboard());
    } catch (error) {
      console.error('Quality leaderboard error:', error);
      res.status(500).json({ error: 'Failed to fetch quality leaderboard' });
    }
  });

  // POST /api/quality/feedback — submit a user star rating for an output
  router.post('/quality/feedback', requireAuth, (req, res) => {
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
  router.get('/quality/feedback/stats/:moduleId', requireAuth, (req, res) => {
    try {
      res.json(ratchet.getFeedbackStats(req.params.moduleId as string));
    } catch (error) {
      console.error('Feedback stats error:', error);
      res.status(500).json({ error: 'Failed to fetch feedback stats' });
    }
  });

  return router;
}
