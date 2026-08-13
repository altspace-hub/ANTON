/**
 * routes/market-consul.ts — Markets Consul Council REST surface.
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §E.4.
 */

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { runDeliberation, listCouncilMembers } from '../services/market-consul-service.js';
import { safeError } from '../lib/error-response.js';

export function createMarketConsulRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  router.get('/members', (_req, res) => {
    res.json({ members: listCouncilMembers() });
  });

  router.post('/deliberate', async (req, res) => {
    try {
      const b = req.body ?? {};
      const subject = String(b.subject ?? '').trim();
      const context = String(b.context ?? '').trim();
      if (!subject || !context) {
        res.status(400).json({ error: 'subject and context required' });
        return;
      }
      const result = await runDeliberation(db, {
        subject,
        context,
        model: typeof b.model === 'string' && b.model.length > 0 ? b.model : undefined,
        consulIds: Array.isArray(b.consulIds) ? b.consulIds : undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
