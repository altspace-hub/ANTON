import { safeError } from '../lib/error-response.js';
import { Router, type Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { scopesToOwner, assertOwned, ownerFilter, type OwnedRequest } from '../middleware/ownership.js';

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

  /**
   * Team isolation: a sessionId the client names must be the caller's. The
   * screen is cached into that session (and its monitoring registration named
   * it), so an unchecked id planted rows into a colleague's session. Checked in
   * SQL before the provider call; another user's session answers 404 like a
   * missing one. Returns false when the 404 has been sent. Solo mode and admins
   * are not scoped and keep the old behaviour.
   */
  async function sessionAllowed(req: OwnedRequest, res: Response, sessionId: string | null | undefined): Promise<boolean> {
    if (!sessionId || !scopesToOwner(req)) return true;
    return assertOwned(db, req, res, {
      table: 'sessions', ownerColumn: 'user_id', id: String(sessionId), notFoundMessage: 'Session not found',
    });
  }

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
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /api/dowjones/screen — real-time entity screen
  router.post('/dowjones/screen', async (req, res) => {
    try {
      const params = req.body as { name: string; birthDate?: string; nationality?: string; orgNumber?: string; screeningLists?: string[] };
      if (!params.name?.trim()) return res.status(400).json({ error: 'name is required' });
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
      if (!(await sessionAllowed(req, res, sessionId))) return;

      const result = await screenEntity(params);

      // Cache in DB — attributed to the caller (migration 287), so the recent
      // list below can be scoped to it.
      const id = randomUUID();
      await db.run(`
        INSERT INTO entity_screens (id, session_id, entity_name, connector, result, risk_score, hit_count, cached_until, user_id)
        VALUES (?, ?, ?, 'dowjones', ?, ?, ?, NOW() + INTERVAL '12 hours', ?)
      `, id, sessionId, params.name, JSON.stringify(result), result.riskScore, result.hits.length, req.user?.id ?? null);

      // Update connector stats
      await db.run(`
        UPDATE data_connectors SET total_calls=total_calls+1, last_successful_call=NOW(),
        status=?, api_key_set=? WHERE connector_type='dowjones'
      `, result.source === 'live' ? 'live' : 'mock', result.source === 'live' ? 1 : 0);

      res.json({ result, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
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
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/dowjones/entity/:id — full entity profile
  router.get('/dowjones/entity/:id', async (req, res) => {
    try {
      const profile = await getEntityProfile(req.params.id);
      res.json({ profile, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/dowjones/pep/:id — PEP detail profile
  router.get('/dowjones/pep/:id', async (req, res) => {
    try {
      const profile = await getPEPProfile(req.params.id);
      res.json({ profile, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
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
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/dowjones/sanctions/:id — sanctions list entry detail
  router.get('/dowjones/sanctions/:id', async (req, res) => {
    try {
      const detail = await getSanctionsDetail(req.params.id);
      res.json({ detail, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /api/dowjones/monitor — register entity for ongoing monitoring
  router.post('/dowjones/monitor', async (req, res) => {
    try {
      const { entityId, entityName, sessionId } = req.body as { entityId: string; entityName: string; sessionId?: string };
      if (!entityId || !entityName) return res.status(400).json({ error: 'entityId and entityName required' });
      if (!(await sessionAllowed(req, res, sessionId))) return;

      const registration = await registerForMonitoring(entityId, sessionId ?? '');

      // Persist in DB — attributed to the caller (migration 287): the list,
      // PATCH and DELETE below act only on the caller's own registrations.
      await db.run(`
        INSERT INTO entity_monitoring (id, entity_id, entity_name, connector, user_id)
        VALUES (?, ?, ?, 'dowjones', ?)
        ON CONFLICT DO NOTHING
      `, registration.id, entityId, entityName, req.user?.id ?? null);

      res.json({ registration });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/dowjones/alerts/:sessionId — monitoring alerts for session
  router.get('/dowjones/alerts/:sessionId', async (req, res) => {
    try {
      // Team isolation: a session's monitoring alerts are its owner's. Another
      // user's session answers 404 like a missing one; solo and admins unscoped.
      if (scopesToOwner(req) && !(await assertOwned(db, req, res, {
        table: 'sessions', ownerColumn: 'user_id', id: String(req.params.sessionId), notFoundMessage: 'Session not found',
      }))) return;
      const alerts = await getMonitoringAlerts(req.params.sessionId);
      res.json({ alerts, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PATCH /api/dowjones/monitor/:id — update monitoring status (pause/resume/cancel)
  router.patch('/dowjones/monitor/:id', async (req, res) => {
    try {
      const { status } = req.body as { status: string };
      if (!['active', 'paused', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'status must be active, paused, or cancelled' });
      }
      // Team isolation: the owner condition is part of the UPDATE itself, so a
      // colleague's registration (or an unowned legacy one) is untouched and
      // answers the same 404 as a missing id. Solo mode and admins unscoped.
      const scope = ownerFilter(req, 'user_id');
      const result = await db.run(`UPDATE entity_monitoring SET status=? WHERE id=? AND connector='dowjones'${scope.sql}`, status, req.params.id, ...scope.params);
      if (result.changes === 0) return res.status(404).json({ error: 'Monitoring registration not found' });
      res.json({ id: req.params.id, status });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // DELETE /api/dowjones/monitor/:id — permanently remove monitoring registration
  router.delete('/dowjones/monitor/:id', async (req, res) => {
    try {
      // Team isolation: owner-scoped in the DELETE itself (see PATCH above).
      const scope = ownerFilter(req, 'user_id');
      const result = await db.run(`DELETE FROM entity_monitoring WHERE id=? AND connector='dowjones'${scope.sql}`, req.params.id, ...scope.params);
      if (result.changes === 0) return res.status(404).json({ error: 'Monitoring registration not found' });
      res.json({ deleted: true, id: req.params.id });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/dowjones/monitoring — active monitoring registrations from DB
  // Team isolation: a non-admin lists only their own registrations; unowned
  // legacy rows are admin-only in team mode. Solo mode and admins see all.
  router.get('/dowjones/monitoring', async (req, res) => {
    try {
      const scope = ownerFilter(req, 'user_id');
      const rows = await db.all(`SELECT * FROM entity_monitoring WHERE connector='dowjones'${scope.sql} ORDER BY registered_at DESC`, ...scope.params);
      res.json({ monitoring: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/dowjones/screens/recent — recent screens from DB
  // Team isolation: each row carries the full screening result (who was
  // screened, PEP and sanctions hits), so a non-admin lists only their own
  // screens; unowned legacy rows are admin-only in team mode.
  router.get('/dowjones/screens/recent', async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
      const scope = ownerFilter(req, 'user_id');
      const rows = await db.all(`SELECT * FROM entity_screens WHERE connector='dowjones'${scope.sql} ORDER BY screened_at DESC LIMIT ?`, ...scope.params, limit);
      res.json({ screens: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
