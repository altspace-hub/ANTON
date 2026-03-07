import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  lookupCompany,
  getBeneficialOwners,
  getBoardMembers,
  screenEntity,
  batchScreen,
  buildEntityProfile,
  getConnectorStatus,
} from '../services/roaring-connector.js';

export function createRoaringRoutes(db: Database): Router {
  const router = Router();

  // GET /api/roaring/status — connector health, mock/live indicator
  router.get('/roaring/status', (_req, res) => {
    const status = getConnectorStatus();
    const row = db.prepare("SELECT * FROM data_connectors WHERE connector_type='roaring'").get() as Record<string, unknown> | undefined;
    res.json({ ...status, connector: row ?? null });
  });

  // GET /api/roaring/company/:query — lookup by name or org number
  router.get('/roaring/company/:query', async (req, res) => {
    try {
      const { query } = req.params;
      const type = /^\d{6}-?\d{4}$/.test(query.trim()) ? 'orgNumber' : 'name';
      const company = await lookupCompany(query.trim(), type);
      res.json({ company, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/roaring/ubo/:orgNumber — full UBO chain
  router.get('/roaring/ubo/:orgNumber', async (req, res) => {
    try {
      const chain = await getBeneficialOwners(req.params.orgNumber);
      res.json({ chain, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/roaring/screen/:orgNumber — sanctions + PEP screen
  router.get('/roaring/screen/:orgNumber', async (req, res) => {
    try {
      const result = await screenEntity(req.params.orgNumber);

      // Cache screen result in DB
      const id = randomUUID();
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
      db.prepare(`
        INSERT INTO entity_screens (id, session_id, entity_name, org_number, connector, result, risk_score, hit_count, cached_until)
        VALUES (?, ?, ?, ?, 'roaring', ?, ?, ?, datetime('now', '+24 hours'))
      `).run(id, sessionId, req.params.orgNumber, req.params.orgNumber, JSON.stringify(result), result.hitCount > 0 ? 'HIGH' : 'CLEAR', result.hitCount);

      res.json({ result, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/roaring/batch-screen — body: { orgNumbers: string[] }
  router.post('/roaring/batch-screen', async (req, res) => {
    try {
      const { orgNumbers } = req.body as { orgNumbers: string[] };
      if (!Array.isArray(orgNumbers) || orgNumbers.length === 0) {
        return res.status(400).json({ error: 'orgNumbers must be a non-empty array' });
      }
      if (orgNumbers.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 entities per batch' });
      }
      const result = await batchScreen(orgNumbers);
      res.json({ result, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/roaring/profile/:orgNumber — full entity profile
  router.get('/roaring/profile/:orgNumber', async (req, res) => {
    try {
      const { orgNumber } = req.params;

      // Check DB cache (24h TTL)
      const cached = db.prepare(`
        SELECT result FROM entity_screens
        WHERE org_number=? AND connector='roaring' AND datetime(cached_until) > datetime('now')
        ORDER BY screened_at DESC LIMIT 1
      `).get(orgNumber) as { result: string } | undefined;

      if (cached) {
        try {
          return res.json({ profile: JSON.parse(cached.result), mode: getConnectorStatus().mode, cached: true });
        } catch {
          // Corrupt cache entry — fall through to live lookup
        }
      }

      const profile = await buildEntityProfile(orgNumber);

      // Cache in DB
      const id = randomUUID();
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
      db.prepare(`
        INSERT INTO entity_screens (id, session_id, entity_name, org_number, connector, result, risk_score, hit_count, cached_until)
        VALUES (?, ?, ?, ?, 'roaring', ?, ?, ?, datetime('now', '+24 hours'))
      `).run(id, sessionId, profile.company.name, orgNumber, JSON.stringify(profile), profile.riskScore >= 70 ? 'HIGH' : profile.riskScore >= 30 ? 'MEDIUM' : 'LOW', profile.sanctions.hitCount);

      // Update connector stats
      db.prepare(`
        UPDATE data_connectors SET total_calls=total_calls+1, last_successful_call=datetime('now'),
        status=?, api_key_set=? WHERE connector_type='roaring'
      `).run(profile.source === 'live' ? 'live' : 'mock', profile.source === 'live' ? 1 : 0);

      res.json({ profile, mode: getConnectorStatus().mode, cached: false });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/roaring/enrich-session — enrich current session context with entity data
  router.post('/roaring/enrich-session', async (req, res) => {
    try {
      const { orgNumber, sessionId } = req.body as { orgNumber: string; sessionId?: string };
      const profile = await buildEntityProfile(orgNumber);

      if (sessionId) {
        // Update session with entity context note
        const note = `[Roaring Entity Data] ${profile.company.name} (${profile.company.orgNumber}) — Risk Score: ${profile.riskScore}/100. ${profile.riskRationale}`;
        db.prepare("UPDATE sessions SET notes=COALESCE(notes||'\n\n','') || ? WHERE id=?").run(note, sessionId);
      }

      res.json({ profile, enriched: !!sessionId });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/roaring/board/:orgNumber — board members
  router.get('/roaring/board/:orgNumber', async (req, res) => {
    try {
      const members = await getBoardMembers(req.params.orgNumber);
      res.json({ members, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/roaring/screens/recent — recent screens from DB
  router.get('/roaring/screens/recent', (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
    const rows = db.prepare(`
      SELECT id, entity_name, org_number, risk_score, hit_count, screened_at
      FROM entity_screens WHERE connector='roaring'
      ORDER BY screened_at DESC LIMIT ?
    `).all(limit);
    res.json({ screens: rows });
  });

  return router;
}
