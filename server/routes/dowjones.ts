import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { randomUUID } from 'crypto';
import {
  screenEntity,
  batchScreen,
  getEntityProfile,
  searchAdverseMedia,
  getPEPProfile,
  getSanctionsDetail,
  registerForMonitoring,
  getMonitoringAlerts,
  getAvailableLists,
  getConnectorStatus,
} from '../services/dowjones-connector.js';

export async function createDowJonesRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();

  // GET /api/dowjones/status — connector health + mock/live indicator
  router.get('/dowjones/status', async (_req, res) => {
    const status = getConnectorStatus();
    const row = await db.get("SELECT * FROM data_connectors WHERE connector_type='dowjones'") as Record<string, unknown> | undefined;
    res.json({ ...status, connector: row ?? null });
  });

  // GET /api/dowjones/lists — available screening list catalogue
  router.get('/dowjones/lists', async (_req, res) => {
    try {
      const lists = await getAvailableLists();
      res.json({ lists });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/dowjones/screen — real-time entity screen
  router.post('/dowjones/screen', async (req, res) => {
    try {
      const params = req.body as { name: string; birthDate?: string; nationality?: string; orgNumber?: string; screeningLists?: string[] };
      if (!params.name?.trim()) return res.status(400).json({ error: 'name is required' });

      const result = await screenEntity(params);

      // Cache in DB
      const id = randomUUID();
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
      await db.run(`
        INSERT INTO entity_screens (id, session_id, entity_name, connector, result, risk_score, hit_count, cached_until)
        VALUES (?, ?, ?, 'dowjones', ?, ?, ?, NOW() + INTERVAL '12 hours')
      `, id, sessionId, params.name, JSON.stringify(result), result.riskScore, result.hits.length);

      // Update connector stats
      await db.run(`
        UPDATE data_connectors SET total_calls=total_calls+1, last_successful_call=NOW(),
        status=?, api_key_set=? WHERE connector_type='dowjones'
      `, result.source === 'live' ? 'live' : 'mock', result.source === 'live' ? 1 : 0);

      res.json({ result, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/dowjones/batch — batch screen up to 100 entities
  router.post('/dowjones/batch', async (req, res) => {
    try {
      const { entities } = req.body as { entities: Array<{ name: string; birthDate?: string }> };
      if (!Array.isArray(entities) || entities.length === 0) {
        return res.status(400).json({ error: 'entities must be a non-empty array' });
      }
      if (entities.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 entities per batch' });
      }
      const result = await batchScreen(entities);
      res.json({ result, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/dowjones/entity/:id — full entity profile
  router.get('/dowjones/entity/:id', async (req, res) => {
    try {
      const profile = await getEntityProfile(req.params.id);
      res.json({ profile, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/dowjones/pep/:id — PEP detail profile
  router.get('/dowjones/pep/:id', async (req, res) => {
    try {
      const profile = await getPEPProfile(req.params.id);
      res.json({ profile, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/dowjones/adverse-media — search adverse media
  router.get('/dowjones/adverse-media', async (req, res) => {
    try {
      const { q, from, to } = req.query as { q?: string; from?: string; to?: string };
      if (!q) return res.status(400).json({ error: 'q parameter required' });
      const dateRange = from && to ? { from, to } : undefined;
      const result = await searchAdverseMedia(q, dateRange);
      res.json({ result, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/dowjones/sanctions/:id — sanctions list entry detail
  router.get('/dowjones/sanctions/:id', async (req, res) => {
    try {
      const detail = await getSanctionsDetail(req.params.id);
      res.json({ detail, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/dowjones/monitor — register entity for ongoing monitoring
  router.post('/dowjones/monitor', async (req, res) => {
    try {
      const { entityId, entityName, sessionId } = req.body as { entityId: string; entityName: string; sessionId?: string };
      if (!entityId || !entityName) return res.status(400).json({ error: 'entityId and entityName required' });

      const registration = await registerForMonitoring(entityId, sessionId ?? '');

      // Persist in DB
      await db.run(`
        INSERT INTO entity_monitoring (id, entity_id, entity_name, connector)
        VALUES (?, ?, ?, 'dowjones')
        ON CONFLICT DO NOTHING
      `, registration.id, entityId, entityName);

      res.json({ registration });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/dowjones/alerts/:sessionId — monitoring alerts for session
  router.get('/dowjones/alerts/:sessionId', async (req, res) => {
    try {
      const alerts = await getMonitoringAlerts(req.params.sessionId);
      res.json({ alerts, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // PATCH /api/dowjones/monitor/:id — update monitoring status (pause/resume/cancel)
  router.patch('/dowjones/monitor/:id', async (req, res) => {
    try {
      const { status } = req.body as { status: string };
      if (!['active', 'paused', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'status must be active, paused, or cancelled' });
      }
      const result = await db.run(`UPDATE entity_monitoring SET status=? WHERE id=? AND connector='dowjones'`, status, req.params.id);
      if (result.changes === 0) return res.status(404).json({ error: 'Monitoring registration not found' });
      res.json({ id: req.params.id, status });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // DELETE /api/dowjones/monitor/:id — permanently remove monitoring registration
  router.delete('/dowjones/monitor/:id', async (req, res) => {
    try {
      const result = await db.run(`DELETE FROM entity_monitoring WHERE id=? AND connector='dowjones'`, req.params.id);
      if (result.changes === 0) return res.status(404).json({ error: 'Monitoring registration not found' });
      res.json({ deleted: true, id: req.params.id });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/dowjones/monitoring — active monitoring registrations from DB
  router.get('/dowjones/monitoring', async (req, res) => {
    const rows = await db.all(`SELECT * FROM entity_monitoring WHERE connector='dowjones' ORDER BY registered_at DESC`);
    res.json({ monitoring: rows });
  });

  // GET /api/dowjones/screens/recent — recent screens from DB
  router.get('/dowjones/screens/recent', async (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
    const rows = await db.all(`SELECT * FROM entity_screens WHERE connector='dowjones' ORDER BY screened_at DESC LIMIT ?`, limit);
    res.json({ screens: rows });
  });

  return router;
}
