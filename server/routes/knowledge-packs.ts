/**
 * knowledge-packs.ts
 * REST API for managing Regulatory Knowledge Packs.
 */

import { Router, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import multer from 'multer';
import { createKnowledgePackService } from '../services/knowledge-pack-service.js';

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

export function createKnowledgePacksRoutes(db: Database.Database): Router {
  const router = Router();
  const svc = createKnowledgePackService(db);

  function getUserId(req: Request): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // ── List packs ─────────────────────────────────────────────────────────────
  router.get('/knowledge-packs', (req: Request, res: Response) => {
    try {
      const packs = svc.listPacks(getUserId(req));
      res.json({ packs });
    } catch (err) {
      console.error('[knowledge-packs] list error:', err);
      res.status(500).json({ error: 'Failed to list knowledge packs' });
    }
  });

  // ── Get single pack ────────────────────────────────────────────────────────
  router.get('/knowledge-packs/:id', (req: Request, res: Response) => {
    try {
      const pack = svc.getPack(String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      res.json({ pack });
    } catch (err) {
      console.error('[knowledge-packs] get error:', err);
      res.status(500).json({ error: 'Failed to get knowledge pack' });
    }
  });

  // ── Get pack entities (preview) ────────────────────────────────────────────
  router.get('/knowledge-packs/:id/entities', (req: Request, res: Response) => {
    try {
      const pack = svc.getPack(String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      const limit = Math.min(parseInt(String(req.query.limit ?? '100')), 500);
      const offset = parseInt(String(req.query.offset ?? '0'));
      const entities = svc.getPackEntities(String(req.params.id), limit, offset);
      res.json({ entities, total: pack.entity_count });
    } catch (err) {
      console.error('[knowledge-packs] entities error:', err);
      res.status(500).json({ error: 'Failed to get entities' });
    }
  });

  // ── Summary (for prompt layer) — MUST be before /:id to avoid route shadowing ──
  router.get('/knowledge-packs/meta/active-summary', (_req: Request, res: Response) => {
    try {
      const summary = svc.getActivePacksSummary();
      res.json({ summary });
    } catch (err) {
      console.error('[knowledge-packs] summary error:', err);
      res.status(500).json({ error: 'Failed to get summary' });
    }
  });

  // ── Import pack from .anton bundle ─────────────────────────────────────────
  router.post('/knowledge-packs/import', upload.single('bundle'), (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No bundle file uploaded (field: bundle)' });
      const userId = getUserId(req);
      const pack = svc.importBundle(req.file.buffer, userId);
      res.status(201).json({ pack, message: `Pack '${pack.display_name}' imported successfully with ${pack.entity_count} entities` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      console.error('[knowledge-packs] import error:', err);
      res.status(400).json({ error: msg });
    }
  });

  // ── Activate pack ──────────────────────────────────────────────────────────
  router.patch('/knowledge-packs/:id/activate', (req: Request, res: Response) => {
    try {
      const pack = svc.getPack(String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      const userId = getUserId(req);
      if (pack.user_id !== userId && userId !== 'default' && pack.user_id !== 'system') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      svc.activatePack(String(req.params.id));
      res.json({ status: 'active' });
    } catch (err) {
      console.error('[knowledge-packs] activate error:', err);
      res.status(500).json({ error: 'Failed to activate pack' });
    }
  });

  // ── Deactivate pack ────────────────────────────────────────────────────────
  router.patch('/knowledge-packs/:id/deactivate', (req: Request, res: Response) => {
    try {
      const pack = svc.getPack(String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      const userId = getUserId(req);
      if (pack.user_id !== userId && userId !== 'default' && pack.user_id !== 'system') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      svc.deactivatePack(String(req.params.id));
      res.json({ status: 'deactivated' });
    } catch (err) {
      console.error('[knowledge-packs] deactivate error:', err);
      res.status(500).json({ error: 'Failed to deactivate pack' });
    }
  });

  // ── Delete pack ────────────────────────────────────────────────────────────
  router.delete('/knowledge-packs/:id', (req: Request, res: Response) => {
    try {
      const pack = svc.getPack(String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      const userId = getUserId(req);
      if (pack.user_id !== userId && userId !== 'default' && pack.user_id !== 'system') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      svc.deletePack(String(req.params.id));
      res.json({ deleted: true });
    } catch (err) {
      console.error('[knowledge-packs] delete error:', err);
      res.status(500).json({ error: 'Failed to delete pack' });
    }
  });

  return router;
}
