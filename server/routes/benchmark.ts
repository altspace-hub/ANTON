import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { benchmarkOutput } from '../services/benchmark.js';

export function createBenchmarkRoutes(_db: DatabaseAdapter) {
  const router = Router();

  // POST /api/benchmark — benchmark an output against standard components
  router.post('/benchmark', requireAuth, async (req, res) => {
    try {
      const { content, moduleId } = req.body as { content?: string; moduleId?: string };
      if (!content || typeof content !== 'string') {
        res.status(400).json({ error: 'content is required' });
        return;
      }
      const result = benchmarkOutput(content, moduleId);
      res.json(result);
    } catch (error) {
      console.error('[benchmark] Error running benchmark:', error);
      res.status(500).json({ error: 'Benchmark failed' });
    }
  });

  return router;
}
