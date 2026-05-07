import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketCrossPillarService } from '../services/market-cross-pillar-service.js';
import { safeError } from '../lib/error-response.js';

export async function createMarketCrossPillarRoutes(db: DatabaseAdapter) {
  const router = Router();
  const service = await createMarketCrossPillarService(db);

  // Link a market entity to an external entity
  router.post('/markets/cross-pillar/link', async (req, res) => {
    try {
      const { marketEntityType, marketEntityId, externalType, externalId, relationship, notes } = req.body;
      if (!marketEntityType || !marketEntityId || !externalType || !externalId) {
        res.status(400).json({ error: 'marketEntityType, marketEntityId, externalType, and externalId are required' });
        return;
      }
      const ref = await service.linkEntities({ marketEntityType, marketEntityId, externalType, externalId, relationship, notes });
      res.json(ref);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Unlink entities
  router.delete('/markets/cross-pillar/link', async (req, res) => {
    try {
      const { marketEntityId, externalId, relationship } = req.body;
      if (!marketEntityId || !externalId) {
        res.status(400).json({ error: 'marketEntityId and externalId are required' });
        return;
      }
      await service.unlinkEntities(marketEntityId, externalId, relationship);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Get refs for a market entity
  router.get('/markets/cross-pillar/market/:type/:id', async (req, res) => {
    try {
      const refs = await service.getRefsWithDetails(req.params.type, req.params.id);
      res.json(refs);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Get refs for an external entity
  router.get('/markets/cross-pillar/external/:type/:id', async (req, res) => {
    try {
      const refs = await service.getRefsForExternal(req.params.type, req.params.id);
      res.json(refs);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
