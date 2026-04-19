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
import { statusFromError } from '../lib/hardware-helpers.js';
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
import {
  createMaintainService,
  type ChangeKind,
  type DeliveryChannel,
  type PlanStatus,
  type StageKind,
  type StageStatus,
  type RolloutStatus,
} from '../services/maintain-service.js';
import { createCveApplicabilityService } from '../services/cve-applicability-service.js';
import { createRegulatoryPackService, type ArtefactKind } from '../services/regulatory-pack-service.js';
import {
  createHumanitarianService,
  type CapacityArtefactKind,
  type DeploymentStatus,
  type InternetPosture,
  type PowerPosture,
} from '../services/humanitarian-service.js';
import { bundleHumanitarianDeploymentKit, bundleHardwareTemplate } from '../services/anton-bundler.js';
import {
  createTemplateService,
} from '../services/template-service.js';
import {
  createReviewQueueService,
  type SubmissionKind,
} from '../services/review-queue-service.js';
import { createExtendDeviceService } from '../services/extend-device-service.js';
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

const CHANGE_KINDS: [ChangeKind, ...ChangeKind[]] = [
  'firmware-update', 'config-change', 'calibration',
  'partition-table', 'secure-boot-burn', 'recall',
];
const STAGE_KINDS: [StageKind, ...StageKind[]] = ['canary', 'wave', 'full-rollout', 'verification', 'soak'];
const STAGE_STATUSES: [StageStatus, ...StageStatus[]] = ['pending', 'in_progress', 'soaking', 'passed', 'failed', 'rolled_back', 'skipped'];
const PLAN_STATUSES: [PlanStatus, ...PlanStatus[]] = ['draft', 'ready', 'in_progress', 'paused', 'rolled_back', 'complete', 'cancelled'];
const ROLLOUT_STATUSES: [RolloutStatus, ...RolloutStatus[]] = ['pending', 'queued', 'sent', 'applying', 'verified', 'failed', 'rolled_back', 'skipped'];
const DELIVERY_CHANNELS: [DeliveryChannel, ...DeliveryChannel[]] = ['ota', 'usb', 'aap-store-and-forward', 'manual'];

const createPatchPlanSchema = z.object({
  title: z.string().min(3).max(300),
  description: z.string().nullable().optional(),
  change_kind: z.enum(CHANGE_KINDS),
  source_event_id: z.string().nullable().optional(),
});

const updatePatchPlanSchema = z.object({
  title: z.string().min(3).max(300).optional(),
  description: z.string().nullable().optional(),
  rollback_artefact_ref: z.string().nullable().optional(),
  rollback_artefact_hash: z.string().nullable().optional(),
  signed_image: z.boolean().optional(),
  verified_boot: z.boolean().optional(),
  rollback_protected: z.boolean().optional(),
  status: z.enum(PLAN_STATUSES).optional(),
});

const addStageSchema = z.object({
  stage_kind: z.enum(STAGE_KINDS),
  title: z.string().min(3).max(200),
  description: z.string().nullable().optional(),
  cohort: z.object({
    device_ids: z.array(z.string()).optional(),
    percentage: z.number().int().min(1).max(100).optional(),
    all: z.boolean().optional(),
  }),
  acceptance_rules: z.array(z.object({
    metric: z.string().min(1),
    operator: z.enum(['<', '<=', '==', '>=', '>', '!=', 'within']),
    threshold: z.union([z.number(), z.string(), z.object({ min: z.number(), max: z.number() })]),
    observed_via: z.string().min(1),
  })).max(20),
  rollback_on_failure: z.boolean().optional(),
});

const advanceStageSchema = z.object({
  new_status: z.enum(STAGE_STATUSES),
});

const recordAcceptanceSchema = z.object({
  observations: z.array(z.object({
    metric: z.string().min(1),
    observed: z.union([z.number(), z.string()]),
  })).min(1),
});

const addDeviceSchema = z.object({
  device_label: z.string().min(1).max(120),
  hardware_serial: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  current_firmware: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const planRolloutSchema = z.object({
  delivery_channel: z.enum(DELIVERY_CHANNELS),
});

const updateRolloutSchema = z.object({
  status: z.enum(ROLLOUT_STATUSES),
  failure_reason: z.string().nullable().optional(),
  pre_patch_state: z.record(z.string(), z.unknown()).nullable().optional(),
  post_patch_state: z.record(z.string(), z.unknown()).nullable().optional(),
});

const ARTEFACT_KINDS: [ArtefactKind, ...ArtefactKind[]] = [
  'cra-tech-file', 'doc', 'vdp', 'hazard-analysis',
  'red-declaration', 'mdr-classification', 'dpa', 'workplace-safety',
];

const generateArtefactSchema = z.object({
  kind: z.enum(ARTEFACT_KINDS),
});

const updateArtefactSchema = z.object({
  content_markdown: z.string().min(50),
});

const signOffArtefactSchema = z.object({
  attestation: z.string().min(30),
});

const withdrawArtefactSchema = z.object({
  reason: z.string().max(2000).optional(),
});

const CAPACITY_ARTEFACT_KINDS: [CapacityArtefactKind, ...CapacityArtefactKind[]] = [
  'installation-guide', 'operator-checklist', 'troubleshooting-flowchart',
  'spares-procedure', 'escalation', 'decommissioning',
];
const DEPLOYMENT_STATUSES: [DeploymentStatus, ...DeploymentStatus[]] = [
  'planning', 'training', 'pilot', 'rollout', 'operating', 'transferred', 'decommissioned',
];
const INTERNET_POSTURES: [InternetPosture, ...InternetPosture[]] = ['none', 'intermittent', 'scheduled', 'always-on'];
const POWER_POSTURES: [PowerPosture, ...PowerPosture[]] = ['grid', 'grid+battery', 'solar', 'generator', 'battery'];

const upsertDeploymentSchema = z.object({
  local_partner_name: z.string().min(2).max(300),
  local_partner_contact: z.string().min(3).max(500),
  ocha_cluster: z.string().nullable().optional(),
  cluster_contact: z.string().nullable().optional(),
  donor_exit_date: z.string().nullable().optional(),
  post_donor_plan: z.string().nullable().optional(),
  units_planned: z.number().int().min(1).max(100000).optional(),
  internet_posture: z.enum(INTERNET_POSTURES).optional(),
  power_posture: z.enum(POWER_POSTURES).optional(),
  status: z.enum(DEPLOYMENT_STATUSES).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const generateCapacityArtefactSchema = z.object({
  kind: z.enum(CAPACITY_ARTEFACT_KINDS),
});

const updateCapacityArtefactSchema = z.object({
  content_markdown: z.string().min(100),
});

const signOffCapacityArtefactSchema = z.object({
  attestation: z.string().min(30),
});

const SUBMISSION_KINDS: [SubmissionKind, ...SubmissionKind[]] = ['hkp', 'diagnostic-case', 'template', 'patch-bundle'];

const captureTemplateSchema = z.object({
  template_id: z.string().regex(/^[a-z0-9-]{4,80}$/, 'lowercase / digits / hyphens only, 4-80 chars'),
  title: z.string().min(3).max(200),
  short_description: z.string().min(10).max(500),
  long_description: z.string().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
});

const instantiateTemplateSchema = z.object({
  title: z.string().min(3).max(300),
  region: z.string().nullable().optional(),
  working_language: z.string().max(10).optional(),
  tier_override: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

const submitReviewSchema = z.object({
  kind: z.enum(SUBMISSION_KINDS),
  source_id: z.string().min(1).max(120),
  source_family_id: z.string().nullable().optional(),
  summary: z.string().min(10).max(500),
  notes: z.string().max(4000).nullable().optional(),
});

const reviewDecisionSchema = z.object({
  notes: z.string().max(4000).optional(),
});

const rejectDecisionSchema = z.object({
  notes: z.string().min(10).max(4000),
});

const extendDeviceSchema = z.object({
  desired_change: z.string().min(10).max(4000),
  model: z.enum(['claude-opus-4-7','claude-sonnet-4-6','claude-haiku-4-5-20251001']).optional(),
});

const cveApplicabilitySchema = z.object({
  lookback_days: z.number().int().min(1).max(3650).optional(),
  min_cvss: z.number().min(0).max(10).optional(),
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
  const maintain = createMaintainService(db);
  const cveApplicability = createCveApplicabilityService(db);
  const regulatory = createRegulatoryPackService(db);
  const humanitarian = createHumanitarianService(db);
  const templates = createTemplateService(db);
  const reviewQueue = createReviewQueueService(db);
  const extend = createExtendDeviceService(db);

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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // ── Claims (nested) ───────────────────────────────────────────────────────

  router.get('/hardware/hkps/:id/claims', async (req, res) => {
    try {
      const cls = req.query.classification ? String(req.query.classification) as ClaimClassification : undefined;
      const claims = await hkp.listClaims(req.params.id, cls);
      res.json({ success: true, claims });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // ── Components (nested) ───────────────────────────────────────────────────

  router.get('/hardware/hkps/:id/components', async (req, res) => {
    try {
      const componentType = req.query.component_type ? String(req.query.component_type) : undefined;
      const components = await hkp.listComponents(req.params.id, componentType);
      res.json({ success: true, components });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // ── Regional alternatives (nested) ────────────────────────────────────────

  router.get('/hardware/hkps/:id/regional-alternatives', async (req, res) => {
    try {
      const region = req.query.region ? String(req.query.region) : undefined;
      const alternatives = await hkp.listRegionalAlternatives(req.params.id, region);
      res.json({ success: true, alternatives });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // ── Quality pipeline ──────────────────────────────────────────────────────

  router.get('/hardware/quality/adapters', (_req, res) => {
    res.json({ success: true, adapters: quality.listAdapters() });
  });

  router.get('/hardware/quality/adapter-availability', async (_req, res) => {
    try {
      const availability = await quality.getAvailability();
      res.json({ success: true, availability });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.get('/hardware/projects/:id/quality/runs', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 25), 100);
      const runs = await quality.listRuns(req.params.id, limit);
      res.json({ success: true, runs });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.get('/hardware/diagnostic-cases/:caseId/outcomes', async (req, res) => {
    try {
      const summary = await diagnose.summariseOutcomes(req.params.caseId);
      res.json({ success: true, summary });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // ── Maintain path: patch plans + stages + fleet + rollouts ────────────────

  router.get('/hardware/projects/:id/patch-plans', async (req, res) => {
    try {
      const plans = await maintain.listPlans(req.params.id);
      res.json({ success: true, plans });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/projects/:id/patch-plans', async (req, res) => {
    try {
      const parsed = createPatchPlanSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const plan = await maintain.createPlan({
        project_id: req.params.id,
        owner_id: getOwnerId(req),
        ...parsed.data,
      });
      res.status(201).json({ success: true, plan });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.get('/hardware/patch-plans/:planId', async (req, res) => {
    try {
      const plan = await maintain.getPlan(req.params.planId);
      if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }
      const stages = await maintain.listStages(plan.id);
      res.json({ success: true, plan, stages });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.put('/hardware/patch-plans/:planId', async (req, res) => {
    try {
      const parsed = updatePatchPlanSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const plan = await maintain.updatePlan(req.params.planId, getOwnerId(req), parsed.data);
      if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }
      res.json({ success: true, plan });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/patch-plans/:planId/stages', async (req, res) => {
    try {
      const parsed = addStageSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const stage = await maintain.addStage(req.params.planId, getOwnerId(req), parsed.data);
      res.status(201).json({ success: true, stage });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/patch-stages/:stageId/advance', async (req, res) => {
    try {
      const parsed = advanceStageSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const stage = await maintain.advanceStage(req.params.stageId, getOwnerId(req), parsed.data.new_status);
      if (!stage) { res.status(404).json({ error: 'Stage not found' }); return; }
      res.json({ success: true, stage });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/patch-stages/:stageId/acceptance', async (req, res) => {
    try {
      const parsed = recordAcceptanceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const result = await maintain.recordAcceptance(req.params.stageId, getOwnerId(req), parsed.data.observations);
      res.json({ success: true, ...result });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // Fleet devices

  router.get('/hardware/projects/:id/fleet-devices', async (req, res) => {
    try {
      const devices = await maintain.listFleet(req.params.id);
      res.json({ success: true, devices });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/projects/:id/fleet-devices', async (req, res) => {
    try {
      const parsed = addDeviceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const device = await maintain.addDevice({
        project_id: req.params.id,
        owner_id: getOwnerId(req),
        ...parsed.data,
      });
      res.status(201).json({ success: true, device });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // Rollouts

  router.post('/hardware/patch-stages/:stageId/rollouts', async (req, res) => {
    try {
      const parsed = planRolloutSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const rollouts = await maintain.planRollout(req.params.stageId, getOwnerId(req), parsed.data);
      res.status(201).json({ success: true, rollouts });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.get('/hardware/patch-stages/:stageId/rollouts', async (req, res) => {
    try {
      const rollouts = await maintain.listRolloutsForStage(req.params.stageId);
      res.json({ success: true, rollouts });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.put('/hardware/patch-rollouts/:rolloutId', async (req, res) => {
    try {
      const parsed = updateRolloutSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const rollout = await maintain.updateRolloutStatus(req.params.rolloutId, getOwnerId(req), parsed.data);
      if (!rollout) { res.status(404).json({ error: 'Rollout not found' }); return; }
      res.json({ success: true, rollout });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // CVE applicability assessment per project posture

  router.post('/hardware/projects/:id/cve-applicability', async (req, res) => {
    try {
      const parsed = cveApplicabilitySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const result = await cveApplicability.assess({
        project_id: req.params.id,
        ...parsed.data,
      });
      res.json({ success: true, assessment: result });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // ── Regulatory pack (Tier 2 + Tier 3 artefacts) ──────────────────────────

  router.get('/hardware/projects/:id/regulatory-artefacts', async (req, res) => {
    try {
      const list = await regulatory.listForProject(req.params.id);
      res.json({ success: true, artefacts: list });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/projects/:id/regulatory-artefacts', async (req, res) => {
    try {
      const parsed = generateArtefactSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const artefact = await regulatory.generateOrRegenerate({
        project_id: req.params.id,
        kind: parsed.data.kind,
        actor_id: getOwnerId(req),
      });
      res.status(201).json({ success: true, artefact });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.get('/hardware/regulatory-artefacts/:artefactId', async (req, res) => {
    try {
      const artefact = await regulatory.getArtefact(req.params.artefactId);
      if (!artefact) { res.status(404).json({ error: 'Artefact not found' }); return; }
      const history = await regulatory.listSignoffs(req.params.artefactId);
      res.json({ success: true, artefact, history });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.put('/hardware/regulatory-artefacts/:artefactId', async (req, res) => {
    try {
      const parsed = updateArtefactSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const artefact = await regulatory.updateContent({
        artefact_id: req.params.artefactId,
        actor_id: getOwnerId(req),
        content_markdown: parsed.data.content_markdown,
      });
      if (!artefact) { res.status(404).json({ error: 'Artefact not found' }); return; }
      res.json({ success: true, artefact });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/regulatory-artefacts/:artefactId/signoff', async (req, res) => {
    try {
      const parsed = signOffArtefactSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const artefact = await regulatory.signOff({
        artefact_id: req.params.artefactId,
        actor_id: getOwnerId(req),
        attestation: parsed.data.attestation,
      });
      res.json({ success: true, artefact });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/regulatory-artefacts/:artefactId/withdraw', async (req, res) => {
    try {
      const parsed = withdrawArtefactSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const artefact = await regulatory.withdraw({
        artefact_id: req.params.artefactId,
        actor_id: getOwnerId(req),
        reason: parsed.data.reason,
      });
      res.json({ success: true, artefact });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.get('/hardware/projects/:id/regulatory-pack-status', async (req, res) => {
    try {
      const summary = await regulatory.assessCompleteness({ project_id: req.params.id });
      res.json({ success: true, summary });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // ── Humanitarian deployment + capacity-transfer artefacts ────────────────

  router.get('/hardware/projects/:id/humanitarian-deployment', async (req, res) => {
    try {
      const deployment = await humanitarian.getDeployment(req.params.id);
      res.json({ success: true, deployment });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/projects/:id/humanitarian-deployment', async (req, res) => {
    try {
      const parsed = upsertDeploymentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const deployment = await humanitarian.upsertDeployment({
        project_id: req.params.id,
        owner_id: getOwnerId(req),
        ...parsed.data,
      });
      res.status(201).json({ success: true, deployment });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.get('/hardware/projects/:id/capacity-transfer-artefacts', async (req, res) => {
    try {
      const artefacts = await humanitarian.listArtefacts(req.params.id);
      const summary = await humanitarian.assessCompleteness(req.params.id);
      res.json({ success: true, artefacts, summary });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/projects/:id/capacity-transfer-artefacts', async (req, res) => {
    try {
      const parsed = generateCapacityArtefactSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const artefact = await humanitarian.generateOrRegenerate({
        project_id: req.params.id,
        kind: parsed.data.kind,
        actor_id: getOwnerId(req),
      });
      res.status(201).json({ success: true, artefact });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.get('/hardware/capacity-transfer-artefacts/:artefactId', async (req, res) => {
    try {
      const artefact = await humanitarian.getArtefact(req.params.artefactId);
      if (!artefact) { res.status(404).json({ error: 'Artefact not found' }); return; }
      const history = await humanitarian.listSignoffs(req.params.artefactId);
      res.json({ success: true, artefact, history });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.put('/hardware/capacity-transfer-artefacts/:artefactId', async (req, res) => {
    try {
      const parsed = updateCapacityArtefactSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const artefact = await humanitarian.updateContent({
        artefact_id: req.params.artefactId,
        actor_id: getOwnerId(req),
        content_markdown: parsed.data.content_markdown,
      });
      if (!artefact) { res.status(404).json({ error: 'Artefact not found' }); return; }
      res.json({ success: true, artefact });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/capacity-transfer-artefacts/:artefactId/signoff', async (req, res) => {
    try {
      const parsed = signOffCapacityArtefactSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const artefact = await humanitarian.signOff({
        artefact_id: req.params.artefactId,
        actor_id: getOwnerId(req),
        attestation: parsed.data.attestation,
      });
      res.json({ success: true, artefact });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/capacity-transfer-artefacts/:artefactId/withdraw', async (req, res) => {
    try {
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
      const artefact = await humanitarian.withdraw({
        artefact_id: req.params.artefactId,
        actor_id: getOwnerId(req),
        reason,
      });
      res.json({ success: true, artefact });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.get('/hardware/projects/:id/humanitarian-bundle', async (req, res) => {
    try {
      const allowUnsigned = req.query.allow_unsigned === 'true';
      const buf = await bundleHumanitarianDeploymentKit(db, req.params.id, { allow_unsigned: allowUnsigned });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="humanitarian-deployment-kit-${req.params.id.slice(0, 8)}.zip"`);
      res.send(buf);
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // ── Templates ─────────────────────────────────────────────────────────────

  router.get('/hardware/templates', async (req, res) => {
    try {
      const filters: Parameters<typeof templates.listTemplates>[0] = {};
      if (req.query.family_id) filters.family_id = String(req.query.family_id);
      if (req.query.path) filters.path = String(req.query.path) as HardwarePath;
      if (req.query.tier) filters.tier = Number(req.query.tier) as HardwareTier;
      if (req.query.authoritative_only === 'true') filters.authoritative_only = true;
      if (req.query.search) filters.search = String(req.query.search);
      const list = await templates.listTemplates(filters);
      res.json({ success: true, templates: list });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.get('/hardware/templates/:id', async (req, res) => {
    try {
      const tpl = await templates.getTemplate(req.params.id);
      if (!tpl) { res.status(404).json({ error: 'Template not found' }); return; }
      res.json({ success: true, template: tpl });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/projects/:id/capture-template', async (req, res) => {
    try {
      const parsed = captureTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const tpl = await templates.captureFromProject({
        project_id: req.params.id,
        owner_id: getOwnerId(req),
        ...parsed.data,
      });
      res.status(201).json({ success: true, template: tpl });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/templates/:id/instantiate', async (req, res) => {
    try {
      const parsed = instantiateTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const result = await templates.instantiate({
        template_id: req.params.id,
        owner_id: getOwnerId(req),
        ...parsed.data,
      });
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.delete('/hardware/templates/:id', async (req, res) => {
    try {
      const ok = await templates.deleteTemplate(req.params.id, getOwnerId(req));
      if (!ok) { res.status(404).json({ error: 'Template not found' }); return; }
      res.json({ success: true });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.get('/hardware/templates/:id/bundle', async (req, res) => {
    try {
      const buf = await bundleHardwareTemplate(db, req.params.id);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="hardware-template-${req.params.id}.zip"`);
      res.send(buf);
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // ── Review queue (community submissions) ──────────────────────────────────

  router.get('/hardware/review-queue', async (req, res) => {
    try {
      const filters: { kind?: SubmissionKind; family_id?: string } = {};
      if (req.query.kind) filters.kind = String(req.query.kind) as SubmissionKind;
      if (req.query.family_id) filters.family_id = String(req.query.family_id);
      const submissions = await reviewQueue.listPending(filters);
      res.json({ success: true, submissions });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.get('/hardware/review-queue/mine', async (req, res) => {
    try {
      const submissions = await reviewQueue.listForSubmitter(getOwnerId(req));
      res.json({ success: true, submissions });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/review-queue/submit', async (req, res) => {
    try {
      const parsed = submitReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const submission = await reviewQueue.submit({
        kind: parsed.data.kind,
        source_id: parsed.data.source_id,
        source_family_id: parsed.data.source_family_id,
        submitted_by: getOwnerId(req),
        summary: parsed.data.summary,
        notes: parsed.data.notes,
      });
      res.status(201).json({ success: true, submission });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/review-queue/:id/claim', async (req, res) => {
    try {
      const submission = await reviewQueue.claim(req.params.id, getOwnerId(req));
      if (!submission) { res.status(404).json({ error: 'Submission not pending or not found' }); return; }
      res.json({ success: true, submission });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/review-queue/:id/security-review', async (req, res) => {
    try {
      const submission = await reviewQueue.recordSecurityReview(req.params.id, getOwnerId(req));
      res.json({ success: true, submission });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/review-queue/:id/approve', async (req, res) => {
    try {
      const parsed = reviewDecisionSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const submission = await reviewQueue.approve(req.params.id, getOwnerId(req), parsed.data.notes);
      res.json({ success: true, submission });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/review-queue/:id/reject', async (req, res) => {
    try {
      const parsed = rejectDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const submission = await reviewQueue.reject(req.params.id, getOwnerId(req), parsed.data.notes);
      res.json({ success: true, submission });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  router.post('/hardware/review-queue/:id/withdraw', async (req, res) => {
    try {
      const submission = await reviewQueue.withdraw(req.params.id, getOwnerId(req));
      res.json({ success: true, submission });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
    }
  });

  // ── Extend existing device ────────────────────────────────────────────────

  router.post('/hardware/projects/:id/extend', async (req, res) => {
    try {
      const parsed = extendDeviceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const proposal = await extend.generateProposal({
        project_id: req.params.id,
        ...parsed.data,
      });
      res.json({ success: true, proposal });
    } catch (err) {
      { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
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
        { const __m = statusFromError(err); res.status(__m.status).json({ error: __m.message }); }
      }
    },
  );

  return router;
}
