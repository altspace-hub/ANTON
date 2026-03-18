import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketInvestigationService } from '../services/market-investigation-service.js';

export async function createMarketInvestigationsRoutes(db: DatabaseAdapter) {
  const router = Router();
  const service = await createMarketInvestigationService(db);

  router.get('/markets/investigations', async (req, res) => {
    try {
      const investigations = await service.listInvestigations({
        status: req.query.status as string | undefined,
        triggerType: req.query.trigger as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      });
      res.json(investigations);
    } catch (err) { console.error('[market-investigations] List error:', err); res.status(500).json({ error: 'Failed to list' }); }
  });

  router.get('/markets/investigations/stats', async (_req, res) => {
    try { res.json(await service.getInvestigationStats()); }
    catch (err) { console.error('[market-investigations] Stats error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  router.get('/markets/investigations/:id', async (req, res) => {
    try {
      const inv = await service.getInvestigation(req.params.id);
      if (!inv) return res.status(404).json({ error: 'Not found' });
      res.json(inv);
    } catch (err) { console.error('[market-investigations] Get error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  router.post('/markets/investigations', async (req, res) => {
    try {
      const { triggerType, triggerReference, title, question, assignedConsul } = req.body;
      if (!triggerType || !title || !question) return res.status(400).json({ error: 'triggerType, title, question required' });
      const id = await service.createInvestigation({ triggerType, triggerReference, title, question, assignedConsul });
      res.status(201).json({ id });
    } catch (err) { console.error('[market-investigations] Create error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  router.put('/markets/investigations/:id', async (req, res) => {
    try {
      await service.updateInvestigation(req.params.id, req.body);
      res.json({ ok: true });
    } catch (err) { console.error('[market-investigations] Update error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  return router;
}
