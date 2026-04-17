// ── Risk Atlas REST API ─────────────────────────────────────────────────
//
// Full CRUD surface for Phase 1d. Endpoints:
//
//   Atlas
//     GET    /api/atlas
//     POST   /api/atlas
//     GET    /api/atlas/:id
//     PUT    /api/atlas/:id
//     DELETE /api/atlas/:id                (archive)
//     GET    /api/atlas/:id/dashboard
//     GET    /api/atlas/:id/events
//
//   Stage 1
//     GET    /api/atlas/:id/exposures
//     POST   /api/atlas/:id/exposures
//     DELETE /api/atlas/:id/exposures/:exposureId
//
//   Stage 2
//     GET    /api/atlas/:id/threat-paths
//     POST   /api/atlas/:id/threat-paths
//     GET    /api/atlas/:id/threat-paths/:tpId      (full hydrated view)
//     DELETE /api/atlas/:id/threat-paths/:tpId
//
//   Stage 3
//     GET    /api/atlas/:id/vulnerabilities
//     POST   /api/atlas/:id/vulnerabilities
//     DELETE /api/atlas/:id/vulnerabilities/:vulnId
//
//   Stage 4
//     POST   /api/atlas/:id/threat-paths/:tpId/score-inherent
//
//   Stage 5
//     GET    /api/atlas/:id/controls
//     POST   /api/atlas/:id/controls
//     DELETE /api/atlas/:id/controls/:controlId
//
//   Stage 6
//     POST   /api/atlas/:id/threat-paths/:tpId/recalc-residual
//
//   Stage 7
//     GET    /api/atlas/:id/appetite
//     POST   /api/atlas/:id/appetite
//     POST   /api/atlas/:id/appetite/:appetiteId/approve
//     GET    /api/atlas/:id/triggers
//     POST   /api/atlas/:id/triggers
//
//   Maintenance
//     GET    /api/atlas/:id/review-cycles
//     POST   /api/atlas/:id/review-cycles
//
//   Packs
//     GET    /api/atlas/packs
//     POST   /api/atlas/packs/seed                  (admin re-seed)
//     GET    /api/atlas/packs/:packId/content
//
// Identity binding: ensureAtlasAccess() verifies the caller owns the
// atlas (admin override). Same shape as routes/sessions.ts and
// routes/renderers.ts.

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createAtlasService } from '../services/risk-atlas/atlas-service.js';
import { createAtlasEventLogger } from '../services/risk-atlas/atlas-event-logger.js';
import { createAtlasPackLoader } from '../services/risk-atlas/atlas-pack-loader.js';
import { safeError } from '../lib/error-response.js';

interface AuthedRequest { user?: { id: string; role?: string } }

async function ensureAtlasAccess(
  db: DatabaseAdapter, req: AuthedRequest, atlasId: string,
  res: import('express').Response,
): Promise<boolean> {
  const userId = req.user?.id;
  const userRole = req.user?.role;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return false; }
  const row = await db.get<{ id: string }>(
    userRole === 'admin'
      ? `SELECT id FROM risk_atlases WHERE id = ?`
      : `SELECT id FROM risk_atlases WHERE id = ? AND owner_user_id = ?`,
    ...(userRole === 'admin' ? [atlasId] : [atlasId, userId]),
  );
  if (!row) { res.status(404).json({ error: 'Atlas not found or access denied' }); return false; }
  return true;
}

export function createAtlasRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const events = createAtlasEventLogger(db);
  const service = createAtlasService(db, { eventLogger: events });
  const packs = createAtlasPackLoader(db);

  // ── Atlas CRUD ──────────────────────────────────────────────────

  router.get('/atlas', async (req, res) => {
    try {
      const userId = (req as AuthedRequest).user?.id;
      if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const atlases = (req as AuthedRequest).user?.role === 'admin'
        ? await service.listAtlases({ status })
        : await service.listAtlases({ userId, status });
      res.json({ success: true, atlases });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/atlas', async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        business_description: z.string().max(20000).optional(),
        industry_pack_id: z.string().optional(),
        mode: z.enum(['socratic', 'draft', 'expert', 'autonomous']).optional(),
        entity_id: z.string().optional(),
        project_id: z.string().optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      const userId = (req as AuthedRequest).user?.id;
      if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }
      const atlas = await service.createAtlas(parsed.data, userId);
      res.status(201).json({ success: true, atlas });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  router.get('/atlas/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const atlas = await service.getAtlas(id);
      res.json({ success: true, atlas });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.put('/atlas/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const schema = z.object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        business_description: z.string().max(20000).optional(),
        industry_pack_id: z.string().optional(),
        mode: z.enum(['socratic', 'draft', 'expert', 'autonomous']).optional(),
        status: z.enum(['draft', 'active', 'review', 'archived']).optional(),
        next_review_due_at: z.string().nullable().optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const atlas = await service.updateAtlas(id, parsed.data, (req as AuthedRequest).user!.id);
      res.json({ success: true, atlas });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  router.delete('/atlas/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const atlas = await service.archiveAtlas(id, (req as AuthedRequest).user!.id);
      res.json({ success: true, atlas });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  router.get('/atlas/:id/dashboard', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const dashboard = await service.getDashboard(id);
      res.json({ success: true, dashboard });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.get('/atlas/:id/events', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));
      const eventsList = await events.listEvents(id, limit);
      res.json({ success: true, events: eventsList });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // ── Stage 1 — exposures ─────────────────────────────────────────

  router.get('/atlas/:id/exposures', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const exposures = await service.listExposures(id);
      res.json({ success: true, exposures });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/atlas/:id/exposures', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const schema = z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        category: z.string().max(80).optional(),
        source_pack_exposure_id: z.string().optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const exposure = await service.addExposure(id, parsed.data, (req as AuthedRequest).user!.id);
      res.status(201).json({ success: true, exposure });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  router.delete('/atlas/:id/exposures/:exposureId', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      await service.removeExposure(id, String(req.params.exposureId), (req as AuthedRequest).user!.id);
      res.json({ success: true });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  // ── Stage 2 — threat paths ──────────────────────────────────────

  router.get('/atlas/:id/threat-paths', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const threatPaths = await service.listThreatPaths(id);
      res.json({ success: true, threatPaths });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/atlas/:id/threat-paths', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const schema = z.object({
        path_code: z.string().min(1).max(40),
        name: z.string().min(1).max(200),
        description: z.string().max(4000).optional(),
        fcp_domain: z.enum(['amlcft','sanctions','fraud','abc','market_abuse','tax_evasion_facilitation','export_controls','modern_slavery']).nullable().optional(),
        source_pack_path_id: z.string().optional(),
        exposure_ids: z.array(z.string()).max(50).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      const threatPath = await service.addThreatPath(id, parsed.data, (req as AuthedRequest).user!.id);
      res.status(201).json({ success: true, threatPath });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  router.get('/atlas/:id/threat-paths/:tpId', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const threatPath = await service.getThreatPathFull(String(req.params.tpId));
      if (!threatPath) { res.status(404).json({ error: 'Threat path not found' }); return; }
      res.json({ success: true, threatPath });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.delete('/atlas/:id/threat-paths/:tpId', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      await service.removeThreatPath(id, String(req.params.tpId), (req as AuthedRequest).user!.id);
      res.json({ success: true });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  // ── Stage 3 — vulnerabilities ───────────────────────────────────

  router.get('/atlas/:id/vulnerabilities', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const vulnerabilities = await service.listVulnerabilities(id);
      res.json({ success: true, vulnerabilities });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/atlas/:id/vulnerabilities', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const schema = z.object({
        vuln_code: z.string().min(1).max(40),
        name: z.string().min(1).max(200),
        description: z.string().max(4000).optional(),
        severity: z.number().int().min(1).max(5),
        source_pack_vuln_id: z.string().optional(),
        threat_path_ids: z.array(z.string()).max(50).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const vulnerability = await service.addVulnerability(id, parsed.data as never, (req as AuthedRequest).user!.id);
      res.status(201).json({ success: true, vulnerability });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  router.delete('/atlas/:id/vulnerabilities/:vulnId', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      await service.removeVulnerability(id, String(req.params.vulnId), (req as AuthedRequest).user!.id);
      res.json({ success: true });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  // ── Stage 4 — inherent scoring ─────────────────────────────────

  router.post('/atlas/:id/threat-paths/:tpId/score-inherent', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const schema = z.object({
        exposure: z.number().int().min(1).max(5),
        threat: z.number().int().min(1).max(5),
        vulnerability: z.number().int().min(1).max(5),
        rationale: z.string().max(4000).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const result = await service.scoreInherent(String(req.params.tpId), parsed.data as never, (req as AuthedRequest).user!.id);
      res.json({ success: true, ...result });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  // ── Stage 5 — controls ─────────────────────────────────────────

  router.get('/atlas/:id/controls', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const controls = await service.listControls(id);
      res.json({ success: true, controls });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/atlas/:id/controls', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const schema = z.object({
        control_code: z.string().min(1).max(40),
        name: z.string().min(1).max(200),
        description: z.string().max(4000).optional(),
        type: z.enum(['prevent','detect','respond']),
        strength: z.enum(['strong','adequate','weak']),
        evidence: z.string().max(4000).optional(),
        owner_role: z.string().max(200).optional(),
        source_pack_control_id: z.string().optional(),
        vulnerability_links: z.array(z.object({
          vulnerability_id: z.string(),
          type: z.enum(['prevent','detect','respond']),
          notes: z.string().max(500).optional(),
        })).max(50).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      const control = await service.addControl(id, parsed.data, (req as AuthedRequest).user!.id);
      res.status(201).json({ success: true, control });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  router.delete('/atlas/:id/controls/:controlId', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      await service.removeControl(id, String(req.params.controlId), (req as AuthedRequest).user!.id);
      res.json({ success: true });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  // ── Stage 6 — residual recalc ──────────────────────────────────

  router.post('/atlas/:id/threat-paths/:tpId/recalc-residual', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const residual = await service.recalculateResidualForPath(String(req.params.tpId), (req as AuthedRequest).user!.id);
      res.json({ success: true, residual });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  // ── Stage 7 — appetite + triggers ──────────────────────────────

  router.get('/atlas/:id/appetite', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const appetite = await service.listAppetite(id);
      res.json({ success: true, appetite });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/atlas/:id/appetite', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const schema = z.object({
        threat_path_id: z.string().nullable().optional(),
        appetite_position: z.enum(['within','boundary','outside','unacceptable']),
        required_action: z.string().max(2000).optional(),
        target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        budget_eur: z.number().min(0).nullable().optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const appetite = await service.upsertAppetite(id, parsed.data, (req as AuthedRequest).user!.id);
      res.status(201).json({ success: true, appetite });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  router.post('/atlas/:id/appetite/:appetiteId/approve', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const appetite = await service.approveAppetite(String(req.params.appetiteId), (req as AuthedRequest).user!.id);
      res.json({ success: true, appetite });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  router.get('/atlas/:id/triggers', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const triggers = await service.listTriggers(id);
      res.json({ success: true, triggers });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/atlas/:id/triggers', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const schema = z.object({
        trigger_event: z.string().min(1).max(500),
        required_action: z.string().min(1).max(1000),
        timeline: z.string().max(200).optional(),
        source: z.enum(['user','pack','regulatory']).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const trigger = await service.addTrigger(id, parsed.data, (req as AuthedRequest).user!.id);
      res.status(201).json({ success: true, trigger });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  // ── Maintenance — review cycles ────────────────────────────────

  router.get('/atlas/:id/review-cycles', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const cycles = await service.listReviewCycles(id);
      res.json({ success: true, cycles });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/atlas/:id/review-cycles', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const schema = z.object({
        activity: z.enum(['full_review','threat_update','control_test','residual_rescore','appetite','regulatory_check']),
        frequency: z.enum(['annual','semi-annual','quarterly','monthly','on_change','on_new_regulation']),
        owner_user_id: z.string().optional(),
        next_due_at: z.string().datetime().optional(),
        deadline_id: z.string().optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const cycle = await service.addReviewCycle(id, parsed.data);
      res.status(201).json({ success: true, cycle });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  // ── Packs ──────────────────────────────────────────────────────

  router.get('/atlas/packs', async (_req, res) => {
    try {
      const list = await packs.listPacks();
      res.json({ success: true, packs: list });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/atlas/packs/seed', async (req, res) => {
    try {
      const userRole = (req as AuthedRequest).user?.role;
      if (userRole !== 'admin') { res.status(403).json({ error: 'Admin required' }); return; }
      const result = await packs.seedBuiltinPacks();
      res.json({ success: true, ...result });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.get('/atlas/packs/:packId/content', async (req, res) => {
    try {
      const content = await packs.getPackContent(String(req.params.packId));
      if (!content) { res.status(404).json({ error: 'Pack not found' }); return; }
      res.json({ success: true, content });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  return router;
}
