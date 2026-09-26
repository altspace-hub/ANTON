import { safeError } from '../lib/error-response.js';
import { Router, type Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { scopesToOwner, assertOwned, ownerFilter, type OwnedRequest } from '../middleware/ownership.js';

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

export async function createRoaringRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();

  /**
   * Team isolation: a sessionId the client names must be the caller's — the
   * screen or profile is cached into that session, so an unchecked id planted
   * rows into a colleague's session. Checked in SQL before the provider call;
   * another user's session answers 404 like a missing one. Returns false when
   * the 404 has been sent. Solo mode and admins are not scoped.
   */
  async function sessionAllowed(req: OwnedRequest, res: Response, sessionId: string | null | undefined): Promise<boolean> {
    if (!sessionId || !scopesToOwner(req)) return true;
    return assertOwned(db, req, res, {
      table: 'sessions', ownerColumn: 'user_id', id: String(sessionId), notFoundMessage: 'Session not found',
    });
  }

  // GET /api/roaring/status — connector health, mock/live indicator
  router.get('/roaring/status', async (_req, res) => {
    const status = getConnectorStatus();
    const row = await db.get("SELECT * FROM data_connectors WHERE connector_type='roaring'") as Record<string, unknown> | undefined;
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
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/roaring/ubo/:orgNumber — full UBO chain
  router.get('/roaring/ubo/:orgNumber', async (req, res) => {
    try {
      const chain = await getBeneficialOwners(req.params.orgNumber);
      res.json({ chain, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/roaring/screen/:orgNumber — sanctions + PEP screen
  router.get('/roaring/screen/:orgNumber', async (req, res) => {
    try {
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
      if (!(await sessionAllowed(req, res, sessionId))) return;
      const result = await screenEntity(req.params.orgNumber);

      // Cache screen result in DB — attributed to the caller (migration 287).
      const id = randomUUID();
      await db.run(`
        INSERT INTO entity_screens (id, session_id, entity_name, org_number, connector, result, risk_score, hit_count, cached_until, user_id)
        VALUES (?, ?, ?, ?, 'roaring', ?, ?, ?, NOW() + INTERVAL '24 hours', ?)
      `, id, sessionId, req.params.orgNumber, req.params.orgNumber, JSON.stringify(result), result.hitCount > 0 ? 'HIGH' : 'CLEAR', result.hitCount, req.user?.id ?? null);

      res.json({ result, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
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
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/roaring/profile/:orgNumber — full entity profile
  router.get('/roaring/profile/:orgNumber', async (req, res) => {
    try {
      const { orgNumber } = req.params;
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
      if (!(await sessionAllowed(req, res, sessionId))) return;

      // Check DB cache (24h TTL). Team isolation: a non-admin reads only their
      // own cached rows — a hit ("cached: true") would otherwise tell them that a
      // colleague looked this company up in the last day.
      const scope = ownerFilter(req, 'user_id');
      const cached = await db.get(`
        SELECT result FROM entity_screens
        WHERE org_number=? AND connector='roaring' AND cached_until::timestamptz > NOW()${scope.sql}
        ORDER BY screened_at DESC LIMIT 1
      `, orgNumber, ...scope.params) as { result: string } | undefined;

      if (cached) {
        try {
          return res.json({ profile: JSON.parse(cached.result), mode: getConnectorStatus().mode, cached: true });
        } catch {
          // Corrupt cache entry — fall through to live lookup
        }
      }

      const profile = await buildEntityProfile(orgNumber);

      // Cache in DB — attributed to the caller (migration 287).
      const id = randomUUID();
      await db.run(`
        INSERT INTO entity_screens (id, session_id, entity_name, org_number, connector, result, risk_score, hit_count, cached_until, user_id)
        VALUES (?, ?, ?, ?, 'roaring', ?, ?, ?, NOW() + INTERVAL '24 hours', ?)
      `, id, sessionId, profile.company.name, orgNumber, JSON.stringify(profile), profile.riskScore >= 70 ? 'HIGH' : profile.riskScore >= 30 ? 'MEDIUM' : 'LOW', profile.sanctions.hitCount, req.user?.id ?? null);

      // Update connector stats
      await db.run(`
        UPDATE data_connectors SET total_calls=total_calls+1, last_successful_call=NOW(),
        status=?, api_key_set=? WHERE connector_type='roaring'
      `, profile.source === 'live' ? 'live' : 'mock', profile.source === 'live' ? 1 : 0);

      res.json({ profile, mode: getConnectorStatus().mode, cached: false });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /api/roaring/enrich-session — enrich current session context with entity data
  router.post('/roaring/enrich-session', async (req, res) => {
    try {
      const { orgNumber, sessionId } = req.body as { orgNumber: string; sessionId?: string };
      // Team isolation: the note is appended to the session, so it must be the
      // caller's — checked before the lookup and the UPDATE. Another
      // user's session answers 404 like a missing one. Solo mode and admins are
      // not scoped and keep the old behaviour for an unknown id.
      if (sessionId && scopesToOwner(req) && !(await assertOwned(db, req, res, {
        table: 'sessions', ownerColumn: 'user_id', id: String(sessionId), notFoundMessage: 'Session not found',
      }))) return;
      const profile = await buildEntityProfile(orgNumber);

      if (sessionId) {
        // Update session with entity context note
        const note = `[Roaring Entity Data] ${profile.company.name} (${profile.company.orgNumber}) — Risk Score: ${profile.riskScore}/100. ${profile.riskRationale}`;
        // The column is `note` (schema.postgresql.sql); `notes` does not exist, so this
        // statement failed with a 500 on every enrich that named a session.
        await db.run("UPDATE sessions SET note=COALESCE(note||'\n\n','') || ? WHERE id=?", note, sessionId);
      }

      res.json({ profile, enriched: !!sessionId });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/roaring/board/:orgNumber — board members
  router.get('/roaring/board/:orgNumber', async (req, res) => {
    try {
      const members = await getBoardMembers(req.params.orgNumber);
      res.json({ members, mode: getConnectorStatus().mode });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/roaring/screens/recent — recent screens from DB
  // Team isolation: a non-admin lists only their own screens (who was
  // screened, the risk score, the session); unowned legacy rows are admin-only
  // in team mode. Solo mode and admins see all.
  router.get('/roaring/screens/recent', async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
      const scope = ownerFilter(req, 'user_id');
      const rows = await db.all(`
        SELECT id, session_id, entity_name, org_number, connector, risk_score, hit_count, screened_at
        FROM entity_screens
        WHERE connector='roaring'${scope.sql}
        ORDER BY screened_at DESC LIMIT ?
      `, ...scope.params, limit);
      res.json({ screens: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
