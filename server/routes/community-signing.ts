import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createSigningService } from '../services/community-signing-service.js';

export async function createCommunitySigningRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const signingService = await createSigningService(db);

  router.get('/community/tasks/:taskId/trail', async (req, res) => {
    try {
      const entries = await signingService.getTrailEntries(req.params.taskId);
      res.json(entries);
    } catch (err) { res.status(500).json({ error: 'Failed to get trail' }); }
  });

  router.post('/community/tasks/:taskId/trail/verify', async (req, res) => {
    try {
      const result = await signingService.verifyTrail(req.params.taskId);
      res.json(result);
    } catch (err) { res.status(500).json({ error: 'Failed to verify trail' }); }
  });

  return router;
}
