/**
 * hardware.ts — REST API for the Hardware Build pillar.
 *
 * Phase 2 surface area:
 *   - HKP CRUD + nested claims/components/regional alternatives
 *   - Family registry read endpoints
 *
 * Diagnose/Maintain/Develop path routes will mount here in later phases.
 */

import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import type { DatabaseAdapter } from '../db/database.js';
import {
  createHkpService,
  type ClaimClassification,
  type CounterfeitRisk,
  type PrimarySource,
} from '../services/hkp-service.js';
import {
  HARDWARE_FAMILIES,
  getFamily,
  listLaunchFamilies,
  listAllFamilies,
} from '../hardware/family-registry.js';
import { runLifecycleIngest } from '../services/lifecycle-feed-ingestor.js';
import {
  createHardwareProjectService,
  type HardwarePath,
  type HardwareTier,
  type ProjectStatus,
  type PhaseStatus,
} from '../services/hardware-project-service.js';
import { createQualityPipelineService } from '../services/quality-pipeline-service.js';
import { createDiagnoseService } from '../services/diagnose-service.js';
import { createPhotoIdService, type PhotoInput } from '../services/photo-id-service.js';
import { safeError } from '../lib/error-response.js';

// In-memory multer for photo-id uploads (max 4 photos × 8MB).
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG / PNG / WebP / GIF photos are accepted'));
  },
});

// ── Validation schemas ────────────────────────────────────────────────────────

const PRIMARY_SOURCES: [PrimarySource, ...PrimarySource[]] = [
  'sheetsdata-mcp', 'anton-curated', 'community', 'user-generated', 'legacy-identified',
];

const CLAIM_CLASSIFICATIONS: [ClaimClassification, ...ClaimClassification[]] = [
  'datasheet-verified', 'community-verified', 'physically-verified', 'AI-unverified',
];

const COUNTERFEIT_RISKS: [CounterfeitRisk, ...CounterfeitRisk[]] = [
  'low', 'moderate', 'high', 'critical',
];

const createPackSchema = z.object({
  family_id: z.string().min(1).max(64),
  manufacturer: z.string().min(1).max(200),
  part_number: z.string().min(1).max(200),
  revision: z.string().max(64).nullable().optional(),
  hkp_version: z.string().min(1).max(64),
  primary_source: z.enum(PRIMARY_SOURCES),
  signed_by: z.string().max(200).nullable().optional(),
  signing_verified: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updatePackSchema = z.object({
  revision: z.string().max(64).nullable().optional(),
  hkp_version: z.string().min(1).max(64).optional(),
  primary_source: z.enum(PRIMARY_SOURCES).optional(),
  source_last_refreshed: z.string().nullable().optional(),
  signed_by: z.string().max(200).nullable().optional(),
  signing_verified: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const upsertClaimSchema = z.object({
  claim_path: z.string().min(1).max(500),
  claim_value: z.string().min(1),
  classification: z.enum(CLAIM_CLASSIFICATIONS),
  verified_by: z.array(z.string()).optional(),
  evidence_ref: z.string().max(2000).nullable().optional(),
  notes: z.string().nullable().optional(),
});

const createComponentSchema = z.object({
  component_type: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createRegionalAltSchema = z.object({
  component_id: z.string().nullable().optional(),
  region: z.string().min(1).max(100),
  alternative_part: z.string().min(1).max(200),
  distributor: z.string().max(200).nullable().optional(),
  typical_price_local: z.number().nullable().optional(),
  typical_price_currency: z.string().max(10).nullable().optional(),
  typical_lead_days: z.number().int().nullable().optional(),
  counterfeit_risk: z.enum(COUNTERFEIT_RISKS).nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ── Route factory ─────────────────────────────────────────────────────────────

// ── Project / phase / quality validation schemas ─────────────────────────────

const HARDWARE_PATHS: [HardwarePath, ...HardwarePath[]] = ['diagnose', 'maintain', 'develop'];
const PROJECT_STATUSES: [ProjectStatus, ...ProjectStatus[]] = ['active', 'paused', 'archived', 'shipped'];
const PHASE_STATUSES: [PhaseStatus, ...PhaseStatus[]] = ['pending', 'in_progress', 'blocked', 'complete', 'skipped'];

const createProjectSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().nullable().optional(),
  family_id: z.string().min(1).max(64),
  path: z.enum(HARDWARE_PATHS),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  region: z.string().max(100).nullable().optional(),
  working_language: z.string().max(10).optional(),
  offline_first: z.boolean().optional(),
  safety_critical: z.boolean().optional(),
  medical_adjacent: z.boolean().optional(),
  tier1_secure_update_ack: z.boolean().optional(),
  hkp_id: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateProjectSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().nullable().optional(),
  region: z.string().max(100).nullable().optional(),
  working_language: z.string().max(10).optional(),
  offline_first: z.boolean().optional(),
  safety_critical: z.boolean().optional(),
  medical_adjacent: z.boolean().optional(),
  tier1_secure_update_ack: z.boolean().optional(),
  hkp_id: z.string().nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const advancePhaseSchema = z.object({
  new_status: z.enum(PHASE_STATUSES),
  blocking_reason: z.string().nullable().optional(),
  artefact_ref: z.string().nullable().optional(),
  quality_score_id: z.string().nullable().optional(),
});

const updatePhaseDataSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

const runQualitySchema = z.object({
  phase_id: z.string().nullable().optional(),
  trigger_reason: z.string().max(100).optional(),
  artefact_ref: z.string().nullable().optional(),
  artefact_hash: z.string().nullable().optional(),
  only_gates: z.array(z.string()).optional(),
});

const matchSymptomsSchema = z.object({
  description: z.string().min(5).max(4000),
  hkp_id: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

const logOutcomeSchema = z.object({
  case_id: z.string().min(1).max(120),
  resolution_id: z.string().min(1).max(40),
  outcome: z.enum(['worked', 'made_worse', 'no_effect', 'partial']),
  context_notes: z.string().max(2000).nullable().optional(),
  consent_for_sharing: z.boolean().optional(),
});

const contributeCaseSchema = z.object({
  case_id: z.string().regex(/^[a-z0-9-]{4,80}$/, 'lowercase / digits / hyphens only, 4-80 chars'),
  family_id: z.string().min(1).max(64),
  hkp_id: z.string().nullable().optional(),
  title: z.string().min(5).max(300),
  severity: z.enum(['low', 'moderate', 'high', 'critical']).optional(),
  symptoms: z.array(z.object({
    symptom: z.string().min(3),
    observable_via: z.array(z.string()).optional(),
    confidence_when_present: z.number().min(0).max(1).optional(),
  })).min(1).max(10),
  probable_causes: z.array(z.object({
    cause: z.string().min(3),
    confidence: z.number().min(0).max(1).optional(),
    evidence: z.array(z.string()).optional(),
  })).min(1).max(10),
  resolutions: z.array(z.object({
    description: z.string().min(3),
    preferred: z.boolean().optional(),
    verified_by: z.array(z.string()).optional(),
  })).min(1).max(10),
  diagnostic_questions: z.array(z.string()).max(10).optional(),
  related_cases: z.array(z.string()).max(10).optional(),
  consent_for_sharing: z.boolean(),
});

function getOwnerId(req: import('express').Request): string {
  const user = (req as { user?: { id?: string; username?: string } }).user;
  return user?.id ?? user?.username ?? 'default';
}

export function createHardwareRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const hkp = createHkpService(db);
  const projects = createHardwareProjectService(db);
  const quality = createQualityPipelineService(db);
  const diagnose = createDiagnoseService(db);
  const photoId = createPhotoIdService(db);

  // ── Family registry (read-only) ───────────────────────────────────────────

  router.get('/hardware/families', (_req, res) => {
    res.json({
      success: true,
      families: listAllFamilies(),
      launch: listLaunchFamilies().map(f => f.id),
    });
  });

  router.get('/hardware/families/:id', (req, res) => {
    const family = getFamily(req.params.id);
    if (!family) {
      res.status(404).json({ error: 'Family not found' });
      return;
    }
    res.json({ success: true, family });
  });

  // ── HKPs ──────────────────────────────────────────────────────────────────

  router.get('/hardware/hkps', async (req, res) => {
    try {
      const filters: Parameters<typeof hkp.listPacks>[0] = {};
      if (req.query.family_id) filters.family_id = String(req.query.family_id);
      if (req.query.primary_source) {
        const ps = String(req.query.primary_source);
        if ((PRIMARY_SOURCES as string[]).includes(ps)) filters.primary_source = ps as PrimarySource;
      }
      if (req.query.search) filters.search = String(req.query.search);
      const packs = await hkp.listPacks(filters);
      res.json({ success: true, packs });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/hardware/hkps', async (req, res) => {
    try {
      const parsed = createPackSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      if (!HARDWARE_FAMILIES[parsed.data.family_id]) {
        res.status(400).json({ error: `Unknown hardware family: ${parsed.data.family_id}` });
        return;
      }
      const pack = await hkp.createPack(parsed.data);
      res.status(201).json({ success: true, pack });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/hardware/hkps/:id', async (req, res) => {
    try {
      const detail = await hkp.getPackDetail(req.params.id);
      if (!detail) {
        res.status(404).json({ error: 'HKP not found' });
        return;
      }
      const lifecycle_events = await hkp.listRecentLifecycleEvents(req.params.id);
      res.json({ success: true, hkp: detail, lifecycle_events });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/hardware/hkps/:id', async (req, res) => {
    try {
      const parsed = updatePackSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const pack = await hkp.updatePack(req.params.id, parsed.data);
      if (!pack) {
        res.status(404).json({ error: 'HKP not found' });
        return;
      }
      res.json({ success: true, pack });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/hardware/hkps/:id', async (req, res) => {
    try {
      const ok = await hkp.deletePack(req.params.id);
      if (!ok) {
        res.status(404).json({ error: 'HKP not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Claims (nested) ───────────────────────────────────────────────────────

  router.get('/hardware/hkps/:id/claims', async (req, res) => {
    try {
      const cls = req.query.classification ? String(req.query.classification) as ClaimClassification : undefined;
      const claims = await hkp.listClaims(req.params.id, cls);
      res.json({ success: true, claims });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/hardware/hkps/:id/claims', async (req, res) => {
    try {
      const parsed = upsertClaimSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const claim = await hkp.upsertClaim({ hkp_id: req.params.id, ...parsed.data });
      res.status(201).json({ success: true, claim });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/hardware/hkps/:hkpId/claims/:claimId', async (req, res) => {
    try {
      const ok = await hkp.deleteClaim(req.params.claimId);
      if (!ok) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Components (nested) ───────────────────────────────────────────────────

  router.get('/hardware/hkps/:id/components', async (req, res) => {
    try {
      const componentType = req.query.component_type ? String(req.query.component_type) : undefined;
      const components = await hkp.listComponents(req.params.id, componentType);
      res.json({ success: true, components });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/hardware/hkps/:id/components', async (req, res) => {
    try {
      const parsed = createComponentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const component = await hkp.createComponent({ hkp_id: req.params.id, ...parsed.data });
      res.status(201).json({ success: true, component });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/hardware/hkps/:hkpId/components/:componentId', async (req, res) => {
    try {
      const ok = await hkp.deleteComponent(req.params.componentId);
      if (!ok) {
        res.status(404).json({ error: 'Component not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Regional alternatives (nested) ────────────────────────────────────────

  router.get('/hardware/hkps/:id/regional-alternatives', async (req, res) => {
    try {
      const region = req.query.region ? String(req.query.region) : undefined;
      const alternatives = await hkp.listRegionalAlternatives(req.params.id, region);
      res.json({ success: true, alternatives });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/hardware/hkps/:id/regional-alternatives', async (req, res) => {
    try {
      const parsed = createRegionalAltSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const alternative = await hkp.createRegionalAlternative({ hkp_id: req.params.id, ...parsed.data });
      res.status(201).json({ success: true, alternative });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/hardware/hkps/:hkpId/regional-alternatives/:altId', async (req, res) => {
    try {
      const ok = await hkp.deleteRegionalAlternative(req.params.altId);
      if (!ok) {
        res.status(404).json({ error: 'Regional alternative not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Diagnostic cases (read-only for now; contribution flow in Phase 5) ────

  router.get('/hardware/hkps/:id/diagnostic-cases', async (req, res) => {
    try {
      const pack = await hkp.getPack(req.params.id);
      if (!pack) {
        res.status(404).json({ error: 'HKP not found' });
        return;
      }
      const rows = await db.all(
        `SELECT case_id, title, severity, case_data, signed_by, authoritative
         FROM diagnostic_cases
         WHERE hkp_id = ? OR family_id = ?
         ORDER BY (severity = 'critical') DESC, (severity = 'high') DESC, last_updated DESC
         LIMIT 50`,
        pack.id, pack.family_id,
      );
      const cases = (rows as Array<{ case_id: string; title: string; severity: string | null;
                                     case_data: string | object; signed_by: string | null;
                                     authoritative: boolean }>).map(r => ({
        case_id: r.case_id,
        title: r.title,
        severity: r.severity,
        signed_by: r.signed_by,
        authoritative: r.authoritative,
        case_data: typeof r.case_data === 'string' ? JSON.parse(r.case_data) : r.case_data,
      }));
      res.json({ success: true, cases });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Lifecycle layer: events + manual feed ingest ──────────────────────────

  router.get('/hardware/lifecycle-events', async (req, res) => {
    try {
      const familyId = req.query.family_id ? String(req.query.family_id) : null;
      const eventType = req.query.event_type ? String(req.query.event_type) : null;
      const limit = Math.min(Number(req.query.limit ?? 100), 500);
      const where: string[] = [];
      const params: unknown[] = [];
      if (familyId) { where.push('family_id = ?'); params.push(familyId); }
      if (eventType) { where.push('event_type = ?'); params.push(eventType); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      params.push(limit);
      const rows = await db.all(
        `SELECT event_id, family_id, event_type, title, severity, cvss_score,
                published_at, source, source_url, ingested_at
         FROM lifecycle_events
         ${whereSql}
         ORDER BY published_at DESC
         LIMIT ?`,
        ...params,
      );
      res.json({ success: true, events: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/hardware/lifecycle-feeds/run', async (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        family_id?: string; lookback_days?: number;
        sources?: Array<'nvd' | 'ghsa' | 'espressif'>;
      };
      const result = await runLifecycleIngest(db, {
        family_id: body.family_id ?? 'esp32',
        lookback_days: body.lookback_days ?? 30,
        sources: body.sources,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Hardware projects ─────────────────────────────────────────────────────

  router.get('/hardware/projects', async (req, res) => {
    try {
      const ownerId = getOwnerId(req);
      const filters: Parameters<typeof projects.listProjects>[0] = { owner_id: ownerId };
      if (req.query.family_id) filters.family_id = String(req.query.family_id);
      if (req.query.path) filters.path = String(req.query.path) as HardwarePath;
      if (req.query.status) filters.status = String(req.query.status) as ProjectStatus;
      const list = await projects.listProjects(filters);
      res.json({ success: true, projects: list });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/hardware/projects', async (req, res) => {
    try {
      const parsed = createProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      if (!HARDWARE_FAMILIES[parsed.data.family_id]) {
        res.status(400).json({ error: `Unknown hardware family: ${parsed.data.family_id}` });
        return;
      }
      const detail = await projects.createProject({
        owner_id: getOwnerId(req),
        ...parsed.data,
        tier: parsed.data.tier as HardwareTier,
      });
      res.status(201).json({ success: true, project: detail });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/hardware/projects/:id', async (req, res) => {
    try {
      const detail = await projects.getProjectDetail(req.params.id);
      if (!detail) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json({ success: true, project: detail });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/hardware/projects/:id', async (req, res) => {
    try {
      const parsed = updateProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const project = await projects.updateProject(req.params.id, getOwnerId(req), parsed.data);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json({ success: true, project });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/hardware/projects/:id', async (req, res) => {
    try {
      const ok = await projects.deleteProject(req.params.id, getOwnerId(req));
      if (!ok) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Phases ────────────────────────────────────────────────────────────────

  router.put('/hardware/projects/:id/phases/:phaseId/data', async (req, res) => {
    try {
      const parsed = updatePhaseDataSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const phase = await projects.updatePhaseData(req.params.id, getOwnerId(req), req.params.phaseId, parsed.data.data);
      if (!phase) {
        res.status(404).json({ error: 'Phase not found' });
        return;
      }
      res.json({ success: true, phase });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/hardware/projects/:id/phases/:phaseId/advance', async (req, res) => {
    try {
      const parsed = advancePhaseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const result = await projects.advancePhase(
        req.params.id, getOwnerId(req), req.params.phaseId, parsed.data,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Quality pipeline ──────────────────────────────────────────────────────

  router.get('/hardware/quality/adapters', (_req, res) => {
    res.json({ success: true, adapters: quality.listAdapters() });
  });

  router.post('/hardware/projects/:id/quality/run', async (req, res) => {
    try {
      const parsed = runQualitySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const project = await projects.getProject(req.params.id);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const summary = await quality.runPipeline({
        project,
        phaseId: parsed.data.phase_id ?? null,
        triggeredBy: getOwnerId(req),
        triggerReason: parsed.data.trigger_reason ?? 'manual',
        artefactRef: parsed.data.artefact_ref ?? null,
        artefactHash: parsed.data.artefact_hash ?? null,
        onlyGates: parsed.data.only_gates,
      });
      res.json({ success: true, run: summary });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/hardware/projects/:id/quality/runs', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 25), 100);
      const runs = await quality.listRuns(req.params.id, limit);
      res.json({ success: true, runs });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/hardware/quality/runs/:runId', async (req, res) => {
    try {
      const detail = await quality.getRunDetail(req.params.runId);
      if (!detail) {
        res.status(404).json({ error: 'Quality run not found' });
        return;
      }
      res.json({ success: true, run: detail });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Diagnose path: symptom matching, outcome logging, contribution ────────

  router.post('/hardware/projects/:id/diagnose/match', async (req, res) => {
    try {
      const parsed = matchSymptomsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const project = await projects.getProject(req.params.id);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const candidates = await diagnose.matchSymptoms({
        family_id: project.family_id,
        hkp_id: parsed.data.hkp_id ?? project.hkp_id,
        description: parsed.data.description,
        limit: parsed.data.limit,
      });
      res.json({ success: true, candidates });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/hardware/projects/:id/diagnose/outcomes', async (req, res) => {
    try {
      const parsed = logOutcomeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const result = await diagnose.logOutcome({
        ...parsed.data,
        contributor_id: getOwnerId(req),
      });
      res.status(201).json({ success: true, outcome_id: result.id });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/hardware/diagnostic-cases/:caseId/outcomes', async (req, res) => {
    try {
      const summary = await diagnose.summariseOutcomes(req.params.caseId);
      res.json({ success: true, summary });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/hardware/diagnostic-cases', async (req, res) => {
    try {
      const parsed = contributeCaseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      if (!HARDWARE_FAMILIES[parsed.data.family_id]) {
        res.status(400).json({ error: `Unknown hardware family: ${parsed.data.family_id}` });
        return;
      }
      const result = await diagnose.contributeCase({
        ...parsed.data,
        contributor_id: getOwnerId(req),
      });
      res.status(201).json({ success: true, case_id: result.case_id });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Photo-based module identification ─────────────────────────────────────

  router.post('/hardware/identify-photo',
    photoUpload.array('photos', 4),
    async (req, res) => {
      try {
        const familyId = String(req.body.family_id ?? '').trim();
        if (!familyId || !HARDWARE_FAMILIES[familyId]) {
          res.status(400).json({ error: 'family_id is required and must be a known hardware family' });
          return;
        }
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        if (files.length === 0) {
          res.status(400).json({ error: 'At least one photo is required (multipart field name: photos)' });
          return;
        }
        const photos: PhotoInput[] = files.map(f => ({
          bytes: f.buffer,
          mimeType: f.mimetype as PhotoInput['mimeType'],
        }));
        const result = await photoId.identify({
          family_id: familyId,
          hkp_id: req.body.hkp_id || null,
          context: req.body.context || null,
          photos,
        });
        res.json({ success: true, identification: result });
      } catch (err) {
        res.status(500).json({ error: safeError(err) });
      }
    },
  );

  return router;
}
