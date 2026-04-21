// ── marketplace-visitor.ts ──────────────────────────────────────────────────
// Visitor-facing marketplace surface: library CRUD + install + (FutureChain
// only) purchase stub. Existing marketplace-service.ts covers list/get/
// publish/review; we add the bits that the v1 visitor library needs.
//
// Purchase flow is intentionally a stub in this commit: the FutureChain
// wallet route already exists at /futurechain/* — real settlement wires
// into that in a follow-up. For now, "purchase" records intent and flips
// library state to 'purchased' so the rest of the flow is exercisable.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';

const installSchema = z.object({ bundle_id: z.string() });
const reviewSchema = z.object({
  bundle_id: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(4000).optional(),
  version_reviewed: z.string().optional(),
});

export function createMarketplaceVisitorRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // Caller's library.
  router.get('/marketplace/library', requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.all(
        `SELECT l.*, b.title, b.bundle_type, b.author_name, b.version
         FROM marketplace_user_library l
         LEFT JOIN marketplace_bundle_listings b ON b.id = l.bundle_id
         WHERE l.user_id = ?
         ORDER BY l.acquired_at DESC`,
        req.user!.id,
      );
      res.json({ library: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Install (free bundle) — records library state + increments downloads.
  router.post('/marketplace/install', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = installSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const listing = await db.get<{ id: string; bundle_type: string }>(
        `SELECT id, bundle_type FROM marketplace_bundle_listings WHERE id = ?`,
        parsed.data.bundle_id,
      );
      if (!listing) { res.status(404).json({ error: 'Bundle not found' }); return; }
      await db.run(
        `INSERT INTO marketplace_user_library (user_id, bundle_id, state, acquired_at)
         VALUES (?, ?, 'installed', NOW())
         ON CONFLICT (user_id, bundle_id) DO UPDATE SET
           state = 'installed', acquired_at = NOW()`,
        req.user!.id, listing.id,
      );
      await db.run(
        `UPDATE marketplace_bundle_listings SET download_count = download_count + 1 WHERE id = ?`,
        listing.id,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // Purchase stub (FutureChain only per Q5). Records intent + flips state.
  router.post('/marketplace/purchase', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = installSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      await db.run(
        `INSERT INTO marketplace_user_library (user_id, bundle_id, state, acquired_at)
         VALUES (?, ?, 'purchased', NOW())
         ON CONFLICT (user_id, bundle_id) DO UPDATE SET
           state = 'purchased', acquired_at = NOW()`,
        req.user!.id, parsed.data.bundle_id,
      );
      res.json({
        ok: true,
        settlement: 'futurechain',
        note: 'Purchase recorded. Wallet settlement via /futurechain/* wires in a follow-up.',
      });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // Uninstall.
  router.post('/marketplace/uninstall', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = installSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      await db.run(
        `UPDATE marketplace_user_library SET state = 'uninstalled'
         WHERE user_id = ? AND bundle_id = ?`,
        req.user!.id, parsed.data.bundle_id,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // Review submit (flips verified_install if the caller has ever installed).
  router.post('/marketplace/reviews', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = reviewSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const installed = await db.get<{ state: string }>(
        `SELECT state FROM marketplace_user_library WHERE user_id = ? AND bundle_id = ?`,
        req.user!.id, parsed.data.bundle_id,
      );
      const verifiedInstall = installed?.state === 'installed' || installed?.state === 'updated';
      const reviewId = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(
        `INSERT INTO marketplace_reviews
           (id, listing_id, reviewer_hash, reviewer_name, rating,
            title, body, version_reviewed, verified_install, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        reviewId, parsed.data.bundle_id, req.user!.id,
        (req.user as { username?: string }).username ?? 'anon',
        parsed.data.rating, parsed.data.title ?? null, parsed.data.body ?? null,
        parsed.data.version_reviewed ?? null, verifiedInstall,
      );
      res.json({ ok: true, id: reviewId, verified_install: verifiedInstall });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  return router;
}
