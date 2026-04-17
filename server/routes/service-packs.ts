// ── Missions — Service Pack REST API (Phase 2) ─────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createServicePackManager } from '../services/missions/service-pack-manager.js';
import { resolveCallerIdentity } from '../services/missions/mission-identity.js';
import { safeError } from '../lib/error-response.js';

function sendIdentityError(res: import('express').Response, err: unknown): void {
  const msg = safeError(err);
  if (/not activated/i.test(msg)) { res.status(409).json({ error: msg }); return; }
  if (/does not match/i.test(msg)) { res.status(403).json({ error: msg }); return; }
  res.status(400).json({ error: msg });
}

export function createServicePackRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const manager = createServicePackManager(db);

  // Seed built-in packs on first request (idempotent)
  let seedAttempted = false;
  async function ensureSeeded(): Promise<void> {
    if (seedAttempted) return;
    seedAttempted = true;
    try {
      const result = await manager.seedBuiltinPacks();
      if (result.errors.length > 0) {
        console.warn('[service-packs] Seed errors:', result.errors);
      }
    } catch (err) {
      console.error('[service-packs] Seeding failed:', err instanceof Error ? err.message : err);
    }
  }

  router.get('/service-packs', async (req, res) => {
    try {
      await ensureSeeded();
      const category = req.query.category as string | undefined;
      const packs = await manager.listPacks({ category });
      // Strip oversized fields for the list view
      const summary = packs.map(p => ({
        id: p.id,
        service_id: p.service_id,
        service_name: p.service_name,
        version: p.version,
        author: p.author,
        description: p.description,
        category: p.category,
        interaction_type: p.interaction_type,
        selectors_health: p.selectors_health,
        total_uses: p.total_uses,
        fallback_count: p.fallback_count,
        is_builtin: p.is_builtin,
        workflow_count: Object.keys(p.workflows).length,
        page_count: Object.keys(p.pages).length,
      }));
      res.json({ success: true, packs: summary });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/service-packs/:serviceId', async (req, res) => {
    try {
      await ensureSeeded();
      const pack = await manager.getPack(String(req.params.serviceId));
      if (!pack) { res.status(404).json({ error: 'Service pack not found' }); return; }
      res.json({ success: true, pack });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /api/service-packs — register a custom pack from JSON body
  router.post('/service-packs', async (req, res) => {
    try {
      const schema = z.object({
        service_id: z.string().min(1).max(100),
        service_name: z.string().min(1).max(200),
        version: z.string().optional(),
        author: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        interaction_type: z.enum(['browser', 'api', 'mcp', 'hybrid']).optional(),
        service_info: z.record(z.string(), z.unknown()).optional(),
        pages: z.record(z.string(), z.unknown()).optional(),
        workflows: z.record(z.string(), z.unknown()).optional(),
        known_issues: z.array(z.string()).optional(),
        fallback_hints: z.record(z.string(), z.string()).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pack = await manager.registerPack(parsed.data as any);
      res.status(201).json({ success: true, pack });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/service-packs/:serviceId/resolve-workflow
  router.post('/service-packs/:serviceId/resolve-workflow', async (req, res) => {
    try {
      const schema = z.object({
        workflow_id: z.string().min(1),
        params: z.record(z.string(), z.string()).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const result = await manager.resolveWorkflow(
        String(req.params.serviceId),
        parsed.data.workflow_id,
        parsed.data.params ?? {},
      );
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.get('/service-packs/:serviceId/health', async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const events = await manager.listHealEvents(String(req.params.serviceId), status);
      res.json({ success: true, heal_events: events });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
