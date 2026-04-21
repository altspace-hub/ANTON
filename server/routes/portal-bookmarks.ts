// ── portal-bookmarks.ts ────────────────────────────────────────────────────
// CRUD + reorder for the Visitor-Home bookmark bar (migration 158). All
// writes are auth-gated; reads return the authenticated user's own bookmarks
// only. Two scopes: global (category_id IS NULL) and per-category.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';

const createSchema = z.object({
  bookmark_type: z.enum(['platform', 'portal', 'route', 'external']),
  target_portal_id: z.string().uuid().nullable().optional(),
  target_route: z.string().max(256).nullable().optional(),
  target_url: z.string().url().max(512).nullable().optional(),
  category_id: z.string().max(64).nullable().optional(),
  label: z.string().min(1).max(64),
  icon_ref: z.string().max(64).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
}).refine(
  (b) => [b.target_portal_id, b.target_route, b.target_url].filter(Boolean).length === 1,
  { message: 'bookmark must have exactly one of target_portal_id / target_route / target_url' },
);

const updateSchema = z.object({
  label: z.string().min(1).max(64).optional(),
  icon_ref: z.string().max(64).nullable().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).max(32),
  scope: z.union([z.literal('global'), z.string().max(64)]),
});

interface BookmarkRow {
  id: string;
  bookmark_type: 'platform' | 'portal' | 'route' | 'external';
  target_portal_id: string | null;
  target_route: string | null;
  target_url: string | null;
  category_id: string | null;
  label: string;
  icon_ref: string | null;
  sort_order: number;
  undeletable: boolean;
  created_at: string;
}

export function createPortalBookmarksRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // GET /api/portal-bookmarks — all of caller's bookmarks (both scopes).
  // Caller can filter ?scope=global | ?scope=<category_id>.
  router.get('/portal-bookmarks', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const scope = typeof req.query.scope === 'string' ? req.query.scope : null;
      let where = 'user_id = ?';
      const args: unknown[] = [userId];
      if (scope === 'global') {
        where += ' AND category_id IS NULL';
      } else if (scope) {
        where += ' AND category_id = ?';
        args.push(scope);
      }
      const rows = await db.all<BookmarkRow>(
        `SELECT id, bookmark_type, target_portal_id, target_route, target_url,
                category_id, label, icon_ref, sort_order, undeletable, created_at
         FROM portal_bookmarks
         WHERE ${where}
         ORDER BY sort_order ASC, created_at ASC`,
        ...args,
      );
      res.json({ bookmarks: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/portal-bookmarks', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = createSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues }); return; }
      const input = parsed.data;
      const userId = req.user!.id;
      // Auto-pick sort_order when not provided: max+1 in the same scope.
      let sortOrder = input.sort_order;
      if (sortOrder === undefined) {
        const maxRow = await db.get<{ max_so: number | string | null }>(
          `SELECT MAX(sort_order) AS max_so FROM portal_bookmarks
           WHERE user_id = ? AND (category_id IS NOT DISTINCT FROM ?)`,
          userId, input.category_id ?? null,
        );
        sortOrder = maxRow?.max_so ? Number(maxRow.max_so) + 1 : 0;
      }
      const result = await db.get<{ id: string }>(
        `INSERT INTO portal_bookmarks
          (user_id, bookmark_type, target_portal_id, target_route, target_url, category_id, label, icon_ref, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        userId, input.bookmark_type,
        input.target_portal_id ?? null, input.target_route ?? null, input.target_url ?? null,
        input.category_id ?? null, input.label, input.icon_ref ?? null, sortOrder,
      );
      res.status(201).json({ id: result?.id });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.patch('/portal-bookmarks/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = updateSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const userId = req.user!.id;
      const existing = await db.get<{ user_id: string; undeletable: boolean }>(
        `SELECT user_id, undeletable FROM portal_bookmarks WHERE id = ?`,
        req.params.id,
      );
      if (!existing || existing.user_id !== userId) { res.status(404).json({ error: 'Not found' }); return; }
      const sets: string[] = [];
      const args: unknown[] = [];
      if (parsed.data.label !== undefined) { sets.push('label = ?'); args.push(parsed.data.label); }
      if (parsed.data.icon_ref !== undefined) { sets.push('icon_ref = ?'); args.push(parsed.data.icon_ref); }
      if (parsed.data.sort_order !== undefined) { sets.push('sort_order = ?'); args.push(parsed.data.sort_order); }
      if (sets.length === 0) { res.json({ ok: true }); return; }
      args.push(req.params.id);
      await db.run(`UPDATE portal_bookmarks SET ${sets.join(', ')} WHERE id = ?`, ...args);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.delete('/portal-bookmarks/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const existing = await db.get<{ user_id: string; undeletable: boolean }>(
        `SELECT user_id, undeletable FROM portal_bookmarks WHERE id = ?`,
        req.params.id,
      );
      if (!existing || existing.user_id !== userId) { res.status(404).json({ error: 'Not found' }); return; }
      if (existing.undeletable) { res.status(403).json({ error: 'Platform bookmark — hide via Settings instead' }); return; }
      await db.run(`DELETE FROM portal_bookmarks WHERE id = ?`, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/portal-bookmarks/reorder — body: { ids: [<id>, ...], scope: 'global' | '<category_id>' }
  // The `ids` array is the new order; sort_order is rewritten to match.
  router.post('/portal-bookmarks/reorder', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = reorderSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const userId = req.user!.id;
      const scopeArg = parsed.data.scope === 'global' ? null : parsed.data.scope;
      await db.transaction(async (tx) => {
        for (let i = 0; i < parsed.data.ids.length; i++) {
          await tx.run(
            `UPDATE portal_bookmarks
               SET sort_order = ?
             WHERE id = ? AND user_id = ? AND (category_id IS NOT DISTINCT FROM ?)`,
            i, parsed.data.ids[i], userId, scopeArg,
          );
        }
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  return router;
}
