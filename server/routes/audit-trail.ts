/**
 * routes/audit-trail.ts — REST surface for the consolidated reasoning-trails viewer.
 *
 * Distinct from /audit (the compliance audit log surfaced by audit.ts):
 *   - /audit            → compliance / security event log + login attempts
 *   - /audit-trail      → reasoning trails (IRE, workflow, signed delivery, evidence, renderer)
 *
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §C.2.
 *
 * Both routes are owner-scoped on a team server (audit 2026-09-23, B3): the feed
 * carried every user's session ids and IRE chain ids, which other routes then
 * accepted. Solo mode and admins still see everything — see trailScopeForRequest.
 */

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { listTrails, getTrail, trailScopeForRequest, type TrailKind } from '../services/trails-aggregator-service.js';
import { safeError } from '../lib/error-response.js';

export function createAuditTrailRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  /** GET /audit-trail — list trails with filters + pagination. */
  router.get('/', async (req, res) => {
    try {
      const q = req.query;
      const kindsParam = (q.kinds as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) as TrailKind[] | undefined;
      // The scope is ANDed with the caller's own filters, so a `userId` or
      // `sessionId` naming someone else's rows narrows to nothing rather than
      // widening past the scope.
      const result = await listTrails(db, trailScopeForRequest(req), {
        kinds: kindsParam,
        sessionId: typeof q.sessionId === 'string' ? q.sessionId : undefined,
        userId: typeof q.userId === 'string' ? q.userId : undefined,
        from: typeof q.from === 'string' ? q.from : undefined,
        to: typeof q.to === 'string' ? q.to : undefined,
        q: typeof q.q === 'string' ? q.q : undefined,
        signature: q.signature as 'ok' | 'invalid' | 'unverified' | 'unsigned' | undefined,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  /** GET /audit-trail/:id — single trail by composite id. */
  router.get('/:id', async (req, res) => {
    try {
      const entry = await getTrail(db, trailScopeForRequest(req), req.params.id);
      if (!entry) {
        // Same 404 for "no such trail" and "not yours" — a 403 would confirm the id exists.
        res.status(404).json({ error: 'Trail not found' });
        return;
      }
      res.json(entry);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
