import { Router } from 'express';
import type { MarketRCIService } from '../services/market-rci-service.js';
import { safeError } from '../lib/error-response.js';

export async function createMarketRCIRoutes(rciService: MarketRCIService) {
  const router = Router();

  // Full RCI pipeline
  router.post('/markets/rci', async (req, res) => {
    try {
      const { question, context } = req.body as { question?: string; context?: string };
      if (!question) {
        res.status(400).json({ error: 'question is required' });
        return;
      }
      const result = await rciService.reasonComputeInterpret(question, context);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Suggest templates only (REASON phase)
  router.post('/markets/rci/suggest', async (req, res) => {
    try {
      const { question } = req.body as { question?: string };
      if (!question) {
        res.status(400).json({ error: 'question is required' });
        return;
      }
      const suggestions = await rciService.suggestTemplates(question);
      res.json(suggestions);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
