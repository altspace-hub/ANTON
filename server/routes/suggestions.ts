import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { generateSuggestions } from '../services/suggestion-engine.js';

export async function createSuggestionsRoutes(db: DatabaseAdapter) {
  const router = Router();

  // GET /api/suggestions — proactive suggestions for the dashboard
  router.get('/suggestions', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const suggestions = await generateSuggestions(db, userId);
      res.json(suggestions);
    } catch (error) {
      console.error('[suggestions] Error generating suggestions:', error);
      res.json([]); // fail gracefully — never 500 the dashboard
    }
  });

  return router;
}
