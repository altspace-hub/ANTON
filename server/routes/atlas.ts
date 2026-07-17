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
import multer from 'multer';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createAtlasService } from '../services/risk-atlas/atlas-service.js';
import { importAtlasBundle } from '../services/risk-atlas/atlas-importer.js';
import { createAtlasEventLogger } from '../services/risk-atlas/atlas-event-logger.js';
import { createAtlasPackLoader } from '../services/risk-atlas/atlas-pack-loader.js';
import { createAtlasExport, renderBoardPackMarkdown } from '../services/risk-atlas/atlas-export.js';
import { createAtlasIntegrityRunner, listIntegrityRules } from '../services/risk-atlas/atlas-integrity-rules.js';
import { createAtlasFcpScopeService } from '../services/risk-atlas/atlas-fcp-scope-service.js';
import { createQualityRatchet } from '../services/quality-ratchet.js';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAtlasRoutes(db: DatabaseAdapter, anthropic?: any): Router {
  const router = Router();
  const events = createAtlasEventLogger(db);
  const service = createAtlasService(db, { eventLogger: events });
  const packs = createAtlasPackLoader(db);
  const atlasExport = createAtlasExport(db);
  const integrity = createAtlasIntegrityRunner(db);
  const fcp = createAtlasFcpScopeService(db);
  // Quality ratchet — lazily resolved on first request to avoid blocking
  // route construction when the underlying schema isn't ready yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ratchetPromise: Promise<any> | null = null;
  const getRatchet = () => (ratchetPromise ??= createQualityRatchet(db));

  // ── Atlas CRUD ──────────────────────────────────────────────────

  router.get('/atlas', async (req, res) => {
    try {
      const userId = (req as AuthedRequest).user?.id;
      if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }
      // Validate status — z.enum prevents arbitrary strings flowing into the SQL
      const statusSchema = z.enum(['draft','active','review','archived']).optional();
      const statusParse = statusSchema.safeParse(typeof req.query.status === 'string' ? req.query.status : undefined);
      if (!statusParse.success) { res.status(400).json({ error: 'Invalid status filter' }); return; }
      const status = statusParse.data;
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
      const threatPath = await service.getThreatPathFull(String(req.params.tpId), id);
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
      const result = await service.scoreInherent(id, String(req.params.tpId), parsed.data as never, (req as AuthedRequest).user!.id);
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
      const residual = await service.recalculateResidualForPath(String(req.params.tpId), (req as AuthedRequest).user!.id, id);
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
      const appetite = await service.approveAppetite(id, String(req.params.appetiteId), (req as AuthedRequest).user!.id);
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
      const cycle = await service.addReviewCycle(id, parsed.data, (req as AuthedRequest).user!.id);
      res.status(201).json({ success: true, cycle });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  // ── FCP Scope (Addendum 1) — which FCP domains are active for an Atlas ──

  router.get('/atlas/:id/fcp-scope', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const scope = await fcp.getScope(id);
      res.json({ success: true, scope });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/atlas/:id/fcp-scope', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      // assessed_by is server-side: always set to req.user.id, never trusted
      // from the body. Drop it from the input schema entirely.
      const schema = z.object({
        amlcft_active: z.boolean().optional(),
        sanctions_active: z.boolean().optional(),
        fraud_active: z.boolean().optional(),
        abc_active: z.boolean().optional(),
        market_abuse_active: z.boolean().optional(),
        tax_evasion_facilitation_active: z.boolean().optional(),
        export_controls_active: z.boolean().optional(),
        modern_slavery_active: z.boolean().optional(),
        scope_rationale: z.string().max(8000).nullable().optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      const scope = await fcp.upsertScope(id, parsed.data, (req as AuthedRequest).user!.id);
      res.status(200).json({ success: true, scope });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  // ── Cross-domain path bundles (Addendum 1) ──────────────────────

  router.get('/atlas/:id/cross-domain-bundles', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const bundles = await fcp.listBundles(id);
      res.json({ success: true, bundles });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/atlas/:id/cross-domain-bundles', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const schema = z.object({
        bundle_code: z.string().min(1).max(40),
        name: z.string().min(1).max(200),
        description: z.string().max(4000).optional(),
        primary_domain: z.enum(['amlcft','sanctions','fraud','abc','market_abuse','tax_evasion_facilitation','export_controls','modern_slavery']).optional(),
        member_path_ids: z.array(z.string()).max(50).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      const bundle = await fcp.createBundle(id, parsed.data, (req as AuthedRequest).user!.id);
      res.status(201).json({ success: true, bundle });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  router.post('/atlas/:id/cross-domain-bundles/:bundleId/members', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const schema = z.object({
        threat_path_id: z.string().min(1),
        role_in_bundle: z.enum(['entry','middle','exit','amplifier']).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const bundleId = Number(req.params.bundleId);
      if (!Number.isInteger(bundleId) || bundleId <= 0) { res.status(400).json({ error: 'Invalid bundle id' }); return; }
      await fcp.addBundleMember(id, bundleId, parsed.data.threat_path_id, parsed.data.role_in_bundle ?? 'middle', (req as AuthedRequest).user!.id);
      res.json({ success: true });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  router.delete('/atlas/:id/cross-domain-bundles/:bundleId/members/:pathId', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const bundleId = Number(req.params.bundleId);
      if (!Number.isInteger(bundleId) || bundleId <= 0) { res.status(400).json({ error: 'Invalid bundle id' }); return; }
      await fcp.removeBundleMember(id, bundleId, String(req.params.pathId), (req as AuthedRequest).user!.id);
      res.json({ success: true });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  router.delete('/atlas/:id/cross-domain-bundles/:bundleId', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const bundleId = Number(req.params.bundleId);
      if (!Number.isInteger(bundleId) || bundleId <= 0) { res.status(400).json({ error: 'Invalid bundle id' }); return; }
      await fcp.deleteBundle(id, bundleId, (req as AuthedRequest).user!.id);
      res.json({ success: true });
    } catch (err) { res.status(400).json({ error: safeError(err) }); }
  });

  // ── Company-wide appetite rollup (Stage 7b) ─────────────────────

  router.get('/atlas/:id/company-appetite', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const rollup = await fcp.computeCompanyAppetite(id);
      res.json({ success: true, rollup });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // ── Integrity — Compliance-as-Code surface over the Atlas state ──

  router.get('/atlas/integrity/rules', async (req, res) => {
    try {
      if (!(req as AuthedRequest).user?.id) { res.status(401).json({ error: 'Authentication required' }); return; }
      res.json({ success: true, rules: listIntegrityRules() });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.get('/atlas/:id/integrity', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const report = await integrity.evaluate(id);
      if (!report) { res.status(404).json({ error: 'Atlas not found' }); return; }
      res.json({ success: true, report });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // Score the current board-pack output against the Quality Ratchet
  router.post('/atlas/:id/quality-score', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const snap = await atlasExport.buildSnapshot(id, (req as AuthedRequest).user!.id);
      if (!snap) { res.status(404).json({ error: 'Atlas not found' }); return; }
      const md = renderBoardPackMarkdown(snap);
      const ratchet = await getRatchet();
      const result = await ratchet.scoreOutput({
        content: md,
        moduleId: 'risk-atlas',
        areaId: 'risk',
        sessionId: id,
        anthropicClient: anthropic,
      });
      res.json({ success: true, score: result });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // ── Exports — board pack DOCX, threat-path cards PDF, heatmap SVG, .anton bundle ──

  router.get('/atlas/:id/export/board', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const buf = await atlasExport.generateBoardPackDocx(id, (req as AuthedRequest).user!.id);
      if (!buf) { res.status(404).json({ error: 'Atlas not found' }); return; }
      const safeName = encodeURIComponent(id) + '.docx';
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="atlas-board-${safeName}"`);
      res.send(buf);
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.get('/atlas/:id/export/paths', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const buf = await atlasExport.generateThreatPathCardsPdf(id, (req as AuthedRequest).user!.id);
      if (!buf) { res.status(404).json({ error: 'Atlas not found' }); return; }
      const safeName = encodeURIComponent(id) + '.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="atlas-paths-${safeName}"`);
      res.send(buf);
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.get('/atlas/:id/export/heatmap.svg', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const svg = await atlasExport.generateHeatMapSvg(id);
      if (!svg) { res.status(404).json({ error: 'Atlas not found' }); return; }
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Content-Disposition', `inline; filename="atlas-heatmap-${encodeURIComponent(id)}.svg"`);
      res.send(svg);
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // ── Import — the promised "successor handover" (Wave 4.10) ──────
  // Accepts the flat-JSON .anton.json produced by GET /atlas/:id/export/bundle,
  // either as a multipart file upload (`file`) or as `{ bundle: {...} }` JSON.
  // Recreates the Atlas under the importer's ownership and runs the
  // deterministic recomputation check (mismatch = imported with a flag).
  const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
  router.post('/atlas/import-bundle', importUpload.single('file'), async (req, res) => {
    try {
      const userId = (req as AuthedRequest).user?.id;
      if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }
      let payload: unknown;
      if (req.file) {
        try {
          payload = JSON.parse(req.file.buffer.toString('utf-8'));
        } catch {
          res.status(400).json({ error: 'Uploaded file is not valid JSON — expected a risk-atlas-export .anton.json bundle' });
          return;
        }
      } else if (req.body && typeof req.body === 'object' && 'bundle' in req.body) {
        payload = (req.body as { bundle: unknown }).bundle;
      } else {
        res.status(400).json({ error: 'Provide the bundle as a multipart `file` upload or as a `bundle` JSON field' });
        return;
      }
      const result = await importAtlasBundle(db, payload, userId);
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/Not a valid risk-atlas-export bundle/.test(msg)) {
        res.status(400).json({ error: msg });
        return;
      }
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/atlas/:id/export/bundle', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await ensureAtlasAccess(db, req as AuthedRequest, id, res))) return;
      const out = await atlasExport.generateAtlasBundle(id, (req as AuthedRequest).user!.id);
      if (!out) { res.status(404).json({ error: 'Atlas not found' }); return; }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      res.send(out.payload);
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // ── Packs ──────────────────────────────────────────────────────

  router.get('/atlas/packs', async (req, res) => {
    try {
      // Pack content is internal authoring IP — require auth even for the list
      if (!(req as AuthedRequest).user?.id) { res.status(401).json({ error: 'Authentication required' }); return; }
      const list = await packs.listPacks();
      res.json({ success: true, packs: list });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/atlas/packs/seed', async (req, res) => {
    try {
      const user = (req as AuthedRequest).user;
      if (!user?.id) { res.status(401).json({ error: 'Authentication required' }); return; }
      if (user.role !== 'admin') { res.status(403).json({ error: 'Admin required' }); return; }
      const result = await packs.seedBuiltinPacks();
      res.json({ success: true, ...result });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.get('/atlas/packs/:packId/content', async (req, res) => {
    try {
      if (!(req as AuthedRequest).user?.id) { res.status(401).json({ error: 'Authentication required' }); return; }
      // Validate packId pattern to mirror the loader's id constraint and
      // to prevent enumeration with traversal-shaped strings.
      const packId = String(req.params.packId);
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(packId)) { res.status(400).json({ error: 'Invalid pack id' }); return; }
      const content = await packs.getPackContent(packId);
      if (!content) { res.status(404).json({ error: 'Pack not found' }); return; }
      res.json({ success: true, content });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  return router;
}
