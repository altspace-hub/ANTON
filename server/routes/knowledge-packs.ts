/**
 * knowledge-packs.ts
 * REST API for managing Regulatory Knowledge Packs.
 */

import { Router, Request, Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { createKnowledgePackService } from '../services/knowledge-pack-service.js';

// Rate limit bundle imports to 10 per 15 minutes per IP.
// Importing a pack parses a ZIP, validates thousands of entities, and runs
// a bulk-insert transaction — expensive enough to warrant throttling.
const importRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many pack imports — try again in 15 minutes.' },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB — matches service-level guard
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.endsWith('.anton')) {
      return cb(new Error('Only .anton bundle files are accepted'));
    }
    cb(null, true);
  },
});

export async function createKnowledgePacksRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const svc = await createKnowledgePackService(db);

  function getUserId(req: Request): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // ── List packs ─────────────────────────────────────────────────────────────
  router.get('/knowledge-packs', async (req: Request, res: Response) => {
    try {
      const packs = await svc.listPacks(getUserId(req));
      res.json({ packs });
    } catch (err) {
      console.error('[knowledge-packs] list error:', err);
      res.status(500).json({ error: 'Failed to list knowledge packs' });
    }
  });

  // ── Get single pack ────────────────────────────────────────────────────────
  router.get('/knowledge-packs/:id', async (req: Request, res: Response) => {
    try {
      const pack = await svc.getPack(String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      res.json({ pack });
    } catch (err) {
      console.error('[knowledge-packs] get error:', err);
      res.status(500).json({ error: 'Failed to get knowledge pack' });
    }
  });

  // ── Get pack entities (preview) ────────────────────────────────────────────
  router.get('/knowledge-packs/:id/entities', async (req: Request, res: Response) => {
    try {
      const pack = await svc.getPack(String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      const limit = Math.min(parseInt(String(req.query.limit ?? '100')), 500);
      const offset = parseInt(String(req.query.offset ?? '0'));
      const entities = await svc.getPackEntities(String(req.params.id), limit, offset);
      res.json({ entities, total: pack.entity_count });
    } catch (err) {
      console.error('[knowledge-packs] entities error:', err);
      res.status(500).json({ error: 'Failed to get entities' });
    }
  });

  // ── Get pack relationships (preview) ──────────────────────────────────────
  router.get('/knowledge-packs/:id/relationships', async (req: Request, res: Response) => {
    try {
      const pack = await svc.getPack(String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      const limit = Math.min(parseInt(String(req.query.limit ?? '100')), 500);
      const offset = parseInt(String(req.query.offset ?? '0'));
      const relationships = await svc.getPackRelationships(String(req.params.id), limit, offset);
      res.json({ relationships, total: pack.relationship_count });
    } catch (err) {
      console.error('[knowledge-packs] relationships error:', err);
      res.status(500).json({ error: 'Failed to get relationships' });
    }
  });

  // ── List bundled packs (ship with ANTON in data/knowledge-packs/) ──────────
  // MUST be before /:id to avoid route shadowing
  router.get('/knowledge-packs/bundled/list', async (_req: Request, res: Response) => {
    try {
      const packs = await svc.listBundledPacks();
      res.json({ packs });
    } catch (err) {
      console.error('[knowledge-packs] bundled list error:', err);
      res.status(500).json({ error: 'Failed to list bundled packs' });
    }
  });

  // ── Install a bundled pack ─────────────────────────────────────────────────
  router.post('/knowledge-packs/bundled/:slug/install', importRateLimit, async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug).replace(/[^a-z0-9-]/gi, ''); // sanitise
      const userId = getUserId(req);
      const pack = await svc.installBundledPack(slug, userId);
      res.status(201).json({ pack, message: `Pack '${pack.display_name}' installed with ${pack.entity_count} entities` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Install failed';
      console.error('[knowledge-packs] bundled install error:', err);
      res.status(400).json({ error: msg });
    }
  });

  // ── Summary (for prompt layer) — MUST be before /:id to avoid route shadowing ──
  router.get('/knowledge-packs/meta/active-summary', async (_req: Request, res: Response) => {
    try {
      const summary = await svc.getActivePacksSummary();
      res.json({ summary });
    } catch (err) {
      console.error('[knowledge-packs] summary error:', err);
      res.status(500).json({ error: 'Failed to get summary' });
    }
  });

  // ── Import pack from .anton bundle ─────────────────────────────────────────
  router.post('/knowledge-packs/import', importRateLimit, upload.single('bundle'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No bundle file uploaded (field: bundle)' });
      const userId = getUserId(req);
      const pack = await svc.importBundle(req.file.buffer, userId);
      res.status(201).json({ pack, message: `Pack '${pack.display_name}' imported successfully with ${pack.entity_count} entities` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      console.error('[knowledge-packs] import error:', err);
      res.status(400).json({ error: msg });
    }
  });

  // ── Activate pack ──────────────────────────────────────────────────────────
  router.patch('/knowledge-packs/:id/activate', async (req: Request, res: Response) => {
    try {
      const pack = await svc.getPack(String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      const userId = getUserId(req);
      if (pack.user_id !== userId && userId !== 'default' && pack.user_id !== 'system') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await svc.activatePack(String(req.params.id));
      res.json({ status: 'active' });
    } catch (err) {
      console.error('[knowledge-packs] activate error:', err);
      res.status(500).json({ error: 'Failed to activate pack' });
    }
  });

  // ── Deactivate pack ────────────────────────────────────────────────────────
  router.patch('/knowledge-packs/:id/deactivate', async (req: Request, res: Response) => {
    try {
      const pack = await svc.getPack(String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      const userId = getUserId(req);
      if (pack.user_id !== userId && userId !== 'default' && pack.user_id !== 'system') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await svc.deactivatePack(String(req.params.id));
      res.json({ status: 'deactivated' });
    } catch (err) {
      console.error('[knowledge-packs] deactivate error:', err);
      res.status(500).json({ error: 'Failed to deactivate pack' });
    }
  });

  // ── Delete pack ────────────────────────────────────────────────────────────
  router.delete('/knowledge-packs/:id', async (req: Request, res: Response) => {
    try {
      const pack = await svc.getPack(String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      const userId = getUserId(req);
      if (pack.user_id !== userId && userId !== 'default' && pack.user_id !== 'system') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await svc.deletePack(String(req.params.id));
      res.json({ deleted: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      console.error('[knowledge-packs] delete error:', err);
      // 409 Conflict if pack is still active
      const status = msg.includes('currently active') ? 409 : 500;
      res.status(status).json({ error: msg });
    }
  });

  return router;
}
