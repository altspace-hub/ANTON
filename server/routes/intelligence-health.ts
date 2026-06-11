/**
 * intelligence-health.ts — Wave 3.9: GET /api/system/intelligence-health
 *
 * One honest endpoint for "is the background intelligence actually running?"
 * Composes real probes (embedding zero-vector check, atom recency, ChromaDB
 * heartbeat, utility-provider credentials) — see
 * server/services/intelligence-health.ts. The embedding probe is cached for
 * 5 minutes inside the service.
 */

import { Router, type Request, type Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { safeError } from '../lib/error-response.js';
import { computeIntelligenceHealth } from '../services/intelligence-health.js';

export function createIntelligenceHealthRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  router.get('/system/intelligence-health', requireAuth, async (_req: Request, res: Response) => {
    try {
      const health = await computeIntelligenceHealth(db);
      res.json(health);
    } catch (err) {
      console.error('[intelligence-health] check failed:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
