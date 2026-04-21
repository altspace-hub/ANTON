// ── starter-packs.ts ────────────────────────────────────────────────────────
// Endpoints for the Visitor Home starter-pack system (bundle type #43).

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import type { DatabaseAdapter } from '../db/database.js';
import { createStarterPackService } from '../services/portals/starter-pack-service.js';
import { safeError } from '../lib/error-response.js';

const applySchema = z.object({ pack_id: z.string().min(1).max(64) });

export async function createStarterPackRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const svc = await createStarterPackService(db);

  // Public: list built-in packs. No auth needed — these are static assets.
  router.get('/starter-packs', async (_req: Request, res: Response) => {
    try {
      res.json({ packs: await svc.listBuiltIn() });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Authenticated: get caller's active pack + effective categories/bookmarks.
  router.get('/starter-packs/active', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      res.json(await svc.resolveForUser(userId));
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/starter-packs/apply', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = applySchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const r = await svc.applyToUser(req.user!.id, parsed.data.pack_id);
      if (!r.ok) { res.status(404).json({ error: r.reason }); return; }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // School-mode hook: idempotent auto-swap. Called by the frontend when it
  // detects the user entered School mode and has no school pack yet.
  router.post('/starter-packs/ensure-school', requireAuth, async (req: Request, res: Response) => {
    try {
      await svc.ensureSchoolPackIfMissing(req.user!.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
