import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

export async function createFCMarketplaceRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const { createFCMarketplaceService } = await import('../services/fc-marketplace-service.js');
  const svc = await createFCMarketplaceService(db);

  router.get('/futurechain/marketplace/services', async (req, res) => {
    try {
      const activeOnly = req.query.active !== 'false';
      const services = await svc.listServices(activeOnly);
      res.json(services);
    } catch (err) { res.status(500).json({ error: 'Failed to list services' }); }
  });

  router.post('/futurechain/marketplace/services', async (req, res) => {
    try {
      const { moduleId, title, description, priceFtc, pricingModel, qualityThresholdFull, qualityThresholdPartial, partialPayPercent, maxTurnaroundHours } = req.body;
      if (!moduleId || !title || !description || priceFtc == null) {
        return res.status(400).json({ error: 'moduleId, title, description, priceFtc are required' });
      }
      const id = await svc.createService({ moduleId, title, description, priceFtc: Number(priceFtc), pricingModel, qualityThresholdFull, qualityThresholdPartial, partialPayPercent, maxTurnaroundHours });
      res.status(201).json({ id });
    } catch (err) { res.status(500).json({ error: 'Failed to create service' }); }
  });

  router.get('/futurechain/marketplace/services/:id', async (req, res) => {
    try {
      const service = await svc.getService(req.params.id);
      if (!service) return res.status(404).json({ error: 'Service not found' });
      res.json(service);
    } catch (err) { res.status(500).json({ error: 'Failed to get service' }); }
  });

  router.put('/futurechain/marketplace/services/:id', async (req, res) => {
    try {
      // For now, delete + recreate is not ideal — just toggle or update individual fields
      // This is a simplified update that re-creates. In production, add proper partial update.
      const existing = await svc.getService(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Service not found' });
      // Toggle active state if that's all that's being updated
      if (req.body.is_active !== undefined) {
        await svc.toggleService(req.params.id, req.body.is_active);
      }
      const updated = await svc.getService(req.params.id);
      res.json(updated);
    } catch (err) { res.status(500).json({ error: 'Failed to update service' }); }
  });

  router.delete('/futurechain/marketplace/services/:id', async (req, res) => {
    try {
      await svc.deleteService(req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Failed to delete service' }); }
  });

  router.post('/futurechain/marketplace/services/:id/toggle', async (req, res) => {
    try {
      const active = req.body.active ?? true;
      await svc.toggleService(req.params.id, active);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Failed to toggle service' }); }
  });

  return router;
}
