import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { recommendModel } from '../services/model-router.js';

export function createModelRouterRoutes(): Router {
  const router = Router();

  // POST /api/model-router/recommend
  // Body: { moduleId?, thinkingLevel?, outputFormats?, areaId? }
  // Returns: ModelRecommendation
  router.post('/model-router/recommend', requireAuth, (req, res) => {
    try {
      const { moduleId, thinkingLevel, outputFormats, areaId } = req.body as {
        moduleId?: string;
        thinkingLevel?: string;
        outputFormats?: string[];
        areaId?: string;
      };

      const recommendation = recommendModel({
        moduleId,
        thinkingLevel,
        outputFormats,
        areaId,
      });

      res.json(recommendation);
    } catch (error) {
      console.error('[model-router] Recommendation error:', error);
      res.status(500).json({ error: 'Failed to generate model recommendation' });
    }
  });

  return router;
}
