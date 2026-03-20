import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

export async function createFCSettingsRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const { createFCConnectionService } = await import('../services/fc-connection-service.js');
  const svc = await createFCConnectionService(db);

  router.get('/futurechain/config', async (_req, res) => {
    try {
      const config = await svc.getConfig();
      res.json(config);
    } catch (err) { res.status(500).json({ error: 'Failed to get FutureChain config' }); }
  });

  router.put('/futurechain/config', async (req, res) => {
    try {
      const config = await svc.updateConfig(req.body);
      res.json(config);
    } catch (err) { res.status(500).json({ error: 'Failed to update FutureChain config' }); }
  });

  router.post('/futurechain/health-check', async (_req, res) => {
    try {
      const result = await svc.healthCheck();
      res.json(result);
    } catch (err) { res.status(500).json({ error: 'Failed to run health check' }); }
  });

  router.get('/futurechain/status', async (_req, res) => {
    try {
      const config = await svc.getConfig();
      const c = config as Record<string, unknown> | undefined;
      res.json({
        connected: c?.connected ?? false,
        stubMode: c?.stub_mode ?? true,
        nodeVersion: c?.node_version ?? null,
        pacs008Support: c?.pacs008_support ?? false,
        twoTierStorage: c?.two_tier_storage ?? false,
        lastHealthCheck: c?.last_health_check ?? null,
      });
    } catch (err) { res.status(500).json({ error: 'Failed to get FutureChain status' }); }
  });

  return router;
}
