import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import { isTeamMode, requireRole } from '../middleware/role-guards.js';
import { canReadCustomModule } from './custom-modules.js';
import type { OwnedRequest } from '../middleware/ownership.js';
import { inspectModuleBundle } from '../services/anton-importer.js';
import { preloadInstalledSkills } from '../services/skills-manager.js';
import {
  computeModuleFingerprint,
  bundleModuleToAnton,
  bundleBuiltinModuleToAnton,
  bundleComplianceRuleset,
  bundleReviewPanel,
  bundleQualityBaseline,
  bundleAudienceProfile,
  bundleMarketIndex,
  bundleMarketThesis,
  bundleMarketIntelligenceModel,
  bundleMarketInvestigation,
  bundleMarketDataSourceConfig,
  bundleMarketAtomCollection,
  bundleMarketStrategyPack,
  bundleModuleRunToAnton,
} from '../services/anton-bundler.js';
import { validateAntonFile } from '../services/anton-validator.js';
import { importAntonFile } from '../services/anton-importer.js';
import { importModuleRunBundle } from '../services/anton-run-importer.js';
import { describeReplayability, replayRun } from './rerun.js';
import { signAntonBundle, getSigningIdentityStatus } from '../services/anton-bundle-signing.js';
import {
  importMarketIndex,
  importMarketThesis,
  importMarketAtomCollection,
  importMarketStrategyPack,
  importMarketInvestigation,
  importMarketDataSourceConfig,
  importMarketIntelligenceModel,
} from '../services/market-bundle-importer.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const analystOrAbove = requireRole('analyst');

/**
 * Wave 6: who may change this instance through the exchange — install a
 * bundle, or validate one (validation records the signer for trust-on-first-
 * use, which decides whether a later bundle shows as "known signer").
 * TEAM mode: an authenticated analyst or admin; a viewer is refused.
 * SOLO mode: the operator (authMiddleware stamps them) always passes.
 * Mounted BEFORE multer so a refused upload is never buffered.
 */
export function requireExchangeContributor(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!isTeamMode()) {
    next();
    return;
  }
  analystOrAbove(req, res, next);
}

/**
 * Wave 6: a viewer may still export (a download is a read), but never AS the
 * instance — an export route that signs would otherwise sign body-supplied
 * content (audience profiles, review panels) with the instance identity key.
 * In team mode a viewer's export is forced unsigned.
 */
function viewersExportUnsigned(req: Request, _res: Response, next: NextFunction): void {
  if (isTeamMode() && req.user?.role !== 'analyst' && req.user?.role !== 'admin') {
    const body: Record<string, unknown> = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    body.sign = false;
    req.body = body;
  }
  next();
}

export async function createExchangeRoutes(db: DatabaseAdapter) {
  const router = Router();

  // Wave 6: skills installed from bundles live in the `skills` table; the
  // composer resolves skills synchronously, so mirror them into its index.
  void preloadInstalledSkills(db);

  router.use(['/exchange/export', '/exchange/export-bundle', '/exchange/export-run'], viewersExportUnsigned);

  /**
   * Opt-in Ed25519 provenance (Wave 2.4): sign the finished bundle's manifest
   * with the instance identity key unless the exporter said `sign: false`.
   * Signing failures degrade to an unsigned export — never block the download.
   */
  async function maybeSign(buffer: Buffer, sign: unknown): Promise<Buffer> {
    if (sign === false || sign === 'false') return buffer;
    const result = await signAntonBundle(db, buffer);
    return result.buffer;
  }

  // Whether this instance can sign bundles, and as whom (drives the
  // "Sign this bundle" toggle in the export UI).
  router.get('/exchange/signing-identity', async (_req, res) => {
    try {
      res.json(await getSigningIdentityStatus(db));
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // Export a module as .anton
  // Query param: ?type=builtin (for file system modules) or ?type=custom (for database modules)
  router.post('/exchange/export/:moduleId', async (req, res) => {
    const { moduleId } = req.params;
    const { type = 'builtin' } = req.query;

    try {
      let buffer: Buffer;

      // Optional KP-03 governance metadata (Wave 2.6) — only written when the
      // exporter actually filled the fields, never fabricated.
      const { sourceUrl, validatedBy, effectiveDate, contentConfirmed } = req.body ?? {};
      const governance = {
        source_url: typeof sourceUrl === 'string' ? sourceUrl : undefined,
        validated_by: typeof validatedBy === 'string' ? validatedBy : undefined,
        effective_date: typeof effectiveDate === 'string' ? effectiveDate : undefined,
        content_confirmed: typeof contentConfirmed === 'boolean' ? contentConfirmed : undefined,
      };

      if (type === 'custom') {
        // A custom module has an owner (migration 290): export only one the caller
        // may read, with the same 404 as a missing module.
        if (!(await canReadCustomModule(db, req as unknown as OwnedRequest, String(moduleId)))) {
          res.status(404).json({ error: 'Module not found' });
          return;
        }
        // Export custom module from database (works in both solo and authenticated mode)
        buffer = await bundleModuleToAnton(db, moduleId, { governance });
      } else {
        // Export built-in module from file system — uses the same hybrid-dialect
        // bundler as custom modules so the result round-trips through
        // POST /api/exchange/import (B5 fix; replaced legacy flat antonExport.ts).
        const {
          authorName = 'openEXPERT Team',
          authorOrg = 'ANTON',
          description = '',
          tags = [],
          license = 'CC-BY-4.0',
        } = req.body;
        buffer = await bundleBuiltinModuleToAnton(moduleId, { authorName, authorOrg, description, tags, license, governance }, db);
      }

      // Opt-in Ed25519 provenance (Wave 2.4) — on unless sign === false
      buffer = await maybeSign(buffer, (req.body ?? {}).sign);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${moduleId}.anton"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // Wave 6: the visible identity of a custom / imported module —
  // { checksum, promptSha256, configSha256, signedBy, signedAt, … }.
  // 404 for anything that is not a custom module (built-ins have no bundle).
  router.get('/exchange/modules/:id/fingerprint', async (req, res) => {
    try {
      if (!(await canReadCustomModule(db, req as unknown as OwnedRequest, String(req.params.id)))) {
        res.status(404).json({ error: 'Not a custom module' });
        return;
      }
      const fingerprint = await computeModuleFingerprint(db, req.params.id);
      if (!fingerprint) {
        res.status(404).json({ error: 'Not a custom module' });
        return;
      }
      res.json(fingerprint);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // Validate a .anton file without installing.
  // Dispatching validator (Wave 2.1): response carries
  //   { bundle_type, validated_depth: 'full' | 'structural', governance?, notes? }
  // Wave 6, module bundles also: { fingerprint, injectionFindings, embedded,
  // unresolved } — what the import modal shows BEFORE anything is installed.
  // Embedded-file integrity failures are errors (valid: false).
  router.post('/exchange/validate', requireExchangeContributor, upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    try {
      const result = await validateAntonFile(req.file.buffer, db);
      // Map is not JSON-serializable — surface file names only.
      const { files, ...rest } = result;
      const isModule = result.bundle_type === 'module' && !!result.manifest;
      const inspection = isModule ? inspectModuleBundle(req.file.buffer, result) : null;
      res.json({
        ...rest,
        valid: rest.valid && (inspection ? inspection.errors.length === 0 : true),
        errors: [...rest.errors, ...(inspection?.errors ?? [])],
        warnings: [...rest.warnings, ...(inspection?.warnings ?? [])],
        files: files ? [...files.keys()] : undefined,
        ...(inspection
          ? {
              fingerprint: inspection.fingerprint,
              injectionFindings: inspection.injectionFindings,
              embedded: inspection.embedded,
              unresolved: inspection.unresolved,
            }
          : {}),
      });
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // ── New bundle type exports ────────────────────────────────────

  // POST /api/exchange/export-bundle/compliance-ruleset
  router.post('/exchange/export-bundle/compliance-ruleset', async (req, res) => {
    try {
      const { name, description, categories, author } = req.body as {
        name?: string; description?: string; categories?: string[]; author?: string;
      };
      const buffer = await maybeSign(await bundleComplianceRuleset(db, { name, description, categories, author }), (req.body ?? {}).sign);
      const filename = `compliance-ruleset-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // POST /api/exchange/export-bundle/quality-baseline
  router.post('/exchange/export-bundle/quality-baseline', async (req, res) => {
    try {
      const { name, description, moduleIds, author } = req.body as {
        name?: string; description?: string; moduleIds?: string[]; author?: string;
      };
      const buffer = await maybeSign(await bundleQualityBaseline(db, { name, description, moduleIds, author }), (req.body ?? {}).sign);
      const filename = `quality-baseline-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // POST /api/exchange/export-bundle/review-panel
  router.post('/exchange/export-bundle/review-panel', async (req, res) => {
    try {
      const { name, description, applicableAreas, reviewers, panelSettings, author } = req.body as Parameters<typeof bundleReviewPanel>[0];
      if (!name || !reviewers || reviewers.length === 0) {
        res.status(400).json({ error: 'name and reviewers are required' });
        return;
      }
      const buffer = await maybeSign(await bundleReviewPanel({ name, description, applicableAreas, reviewers, panelSettings, author }), (req.body as { sign?: unknown } | undefined)?.sign);
      const filename = `review-panel-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // POST /api/exchange/export-bundle/audience-profile
  router.post('/exchange/export-bundle/audience-profile', async (req, res) => {
    try {
      const params = req.body as Parameters<typeof bundleAudienceProfile>[0];
      if (!params.name || !params.systemPrompt) {
        res.status(400).json({ error: 'name and systemPrompt are required' });
        return;
      }
      const buffer = await maybeSign(await bundleAudienceProfile(params), (req.body as { sign?: unknown } | undefined)?.sign);
      const filename = `audience-profile-${params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // ── Market bundle type exports ────────────────────────────────

  // POST /api/exchange/export-bundle/market-index
  router.post('/exchange/export-bundle/market-index', async (req, res) => {
    try {
      const { indexId, author } = req.body as { indexId: string; author?: string };
      if (!indexId) { res.status(400).json({ error: 'indexId is required' }); return; }
      const buffer = await maybeSign(await bundleMarketIndex(db, indexId, { author }), (req.body ?? {}).sign);
      const filename = `market-index-${indexId}-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // POST /api/exchange/export-bundle/market-thesis
  router.post('/exchange/export-bundle/market-thesis', async (req, res) => {
    try {
      const { thesisId, author } = req.body as { thesisId: string; author?: string };
      if (!thesisId) { res.status(400).json({ error: 'thesisId is required' }); return; }
      const buffer = await maybeSign(await bundleMarketThesis(db, thesisId, { author }), (req.body ?? {}).sign);
      const filename = `market-thesis-${thesisId}-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // POST /api/exchange/export-bundle/market-intelligence-model
  router.post('/exchange/export-bundle/market-intelligence-model', async (req, res) => {
    try {
      const { name, author } = req.body as { name?: string; author?: string };
      const buffer = await maybeSign(await bundleMarketIntelligenceModel(db, { name, author }), (req.body ?? {}).sign);
      const filename = `market-intelligence-model-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // POST /api/exchange/export-bundle/market-investigation
  router.post('/exchange/export-bundle/market-investigation', async (req, res) => {
    try {
      const { investigationId, author } = req.body as { investigationId: string; author?: string };
      if (!investigationId) { res.status(400).json({ error: 'investigationId is required' }); return; }
      const buffer = await maybeSign(await bundleMarketInvestigation(db, investigationId, { author }), (req.body ?? {}).sign);
      const filename = `market-investigation-${investigationId}-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // POST /api/exchange/export-bundle/market-data-source-config
  router.post('/exchange/export-bundle/market-data-source-config', async (req, res) => {
    try {
      const { name, sourceIds, author } = req.body as { name?: string; sourceIds?: string[]; author?: string };
      const buffer = await maybeSign(await bundleMarketDataSourceConfig(db, { name, sourceIds, author }), (req.body ?? {}).sign);
      const filename = `market-data-source-config-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // POST /api/exchange/export-bundle/market-atom-collection
  router.post('/exchange/export-bundle/market-atom-collection', async (req, res) => {
    try {
      const { name, atomIds, category, author } = req.body as { name?: string; atomIds?: string[]; category?: string; author?: string };
      const buffer = await maybeSign(await bundleMarketAtomCollection(db, { name, atomIds, category, author }), (req.body ?? {}).sign);
      const filename = `market-atom-collection-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // POST /api/exchange/export-bundle/market-strategy-pack
  router.post('/exchange/export-bundle/market-strategy-pack', async (req, res) => {
    try {
      const { name, indexIds, thesisIds, author } = req.body as { name?: string; indexIds?: string[]; thesisIds?: string[]; author?: string };
      const buffer = await maybeSign(await bundleMarketStrategyPack(db, { name, indexIds, thesisIds, author }), (req.body ?? {}).sign);
      const filename = `market-strategy-pack-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // ── Module-run export + import (Wave 2.2 — the heart-of-vision item) ───────

  // POST /api/exchange/export-run { sessionId, messageId?, sign? }
  // Packages ONE module run (composed prompt + config snapshot + pinned source
  // hashes + input/output + cached structured payload/quality) as a .anton a
  // coworker can inspect and reproduce. messageId optional → latest assistant
  // message in the session. Signed via the standard maybeSign path.
  router.post('/exchange/export-run', async (req, res) => {
    try {
      const { sessionId, messageId, author } = (req.body ?? {}) as {
        sessionId?: unknown; messageId?: unknown; author?: unknown;
      };
      if (typeof sessionId !== 'string' || !sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }
      const buffer = await maybeSign(
        await bundleModuleRunToAnton(
          db,
          sessionId,
          typeof messageId === 'string' && messageId ? messageId : null,
          { author: typeof author === 'string' && author ? author : undefined },
        ),
        (req.body ?? {}).sign,
      );
      const filename = `module-run-${sessionId.slice(0, 8)}-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg });
        return;
      }
      res.status(500).json({ error: safeError(e) });
    }
  });

  // POST /api/exchange/import-run — read-only RUN VIEWER import.
  // Creates a new session in the importer's My Work with the run's input +
  // output as messages and config_snapshot preserved; the EXISTING /api/rerun
  // endpoint then reproduces the run (it rehydrates from config_snapshot).
  // Response carries `reproducible: { locally, missingModule?, notes }` — the
  // honest fidelity report (sources travel as hashes, not content).
  // Wave 5: when the bundle carries the composed prompt + hashes and the
  // served model is dispatchable here, `replay` says mode 'replay'; with the
  // multipart field reproduce=true the run is replayed verbatim right away
  // (through the rerun route's own replayRun). Otherwise `replay` says
  // 'recompose' and why — the caller picks a model and calls /api/rerun.
  // Wave 6: the same role gate as every other import (analyst or admin in team
  // mode; solo passes) — with reproduce=true this spends a model call.
  router.post('/exchange/import-run', requireExchangeContributor, upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    try {
      const userId = (req as import('express').Request & { user?: { id?: string } }).user?.id;
      const result = await importModuleRunBundle(req.file.buffer, db, userId ?? null);
      const reproduceNow = req.body?.reproduce === 'true' || req.body?.reproduce === true;
      let replay: Record<string, unknown> | null = null;
      if (result.success && result.sessionId && result.assistantMessageId) {
        const plan = await describeReplayability(db, result.sessionId, result.assistantMessageId);
        replay = { attempted: false, ...plan };
        if (reproduceNow && plan.mode === 'replay') {
          const outcome = await replayRun(db, { sessionId: result.sessionId, messageId: result.assistantMessageId });
          replay = outcome.ok
            ? { attempted: true, ...outcome.body }
            : {
                attempted: true,
                mode: 'recompose',
                model: plan.model,
                error: outcome.error,
                reason: `Replay failed closed (${outcome.error}) — reproduce with POST /api/rerun mode "recompose" and a model of your choice.`,
              };
        } else if (reproduceNow) {
          replay = { attempted: false, ...plan, reason: `${plan.reason} Reproduce with POST /api/rerun mode "recompose" and a model of your choice.` };
        }
      }
      res.json({
        success: result.success,
        sessionId: result.sessionId,
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
        moduleExists: result.moduleExists,
        localModuleId: result.localModuleId,
        reproducible: result.reproducible,
        replay,
        sourcesNotIncluded: result.sourcesNotIncluded,
        bundle_type: result.validation.bundle_type,
        validated_depth: result.validation.validated_depth,
        governance: result.validation.governance,
        provenance: result.validation.provenance,
        notes: result.validation.notes,
        errors: result.validation.errors.map((e) => e.details ? `${e.message} — ${e.details}` : e.message),
        warnings: result.validation.warnings.map((w) => w.message),
      });
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // Import a .anton file to user's custom modules (works in solo and authenticated mode).
  // Optional multipart field keepId=true keeps the original module id when free (Wave 2.8).
  //
  // Wave 6:
  //   • team mode requires an analyst or admin (solo passes) — viewers get 403;
  //   • the prompt-injection scan BLOCKS by default: 409
  //       { success: false, blocked: 'injection', error, injectionFindings[],
  //         fingerprint, acceptWith: { field: 'acceptInjectionFindings', value: true }, … }
  //     Re-submit with the multipart field acceptInjectionFindings=true to
  //     import anyway; the accepted findings come back in
  //     `acceptedInjectionFindings` and are stored with the module;
  //   • embedded skills / personas are installed and reported per id
  //     (`installedSkills`, `installedPersonas`: reused | installed | namespaced | missing).
  router.post('/exchange/import', requireExchangeContributor, upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    try {
      const keepId = req.body?.keepId === 'true' || req.body?.keepId === true;
      const acceptInjectionFindings =
        req.body?.acceptInjectionFindings === 'true' || req.body?.acceptInjectionFindings === true;
      const result = await importAntonFile(req.file.buffer, db, req.user?.id, { keepId, acceptInjectionFindings });
      // Flattened report for the UI (the validation Map doesn't serialize) +
      // governance display at import time (Wave 2.6).
      const report = {
        bundle_type: result.validation.bundle_type,
        validated_depth: result.validation.validated_depth,
        governance: result.validation.governance,
        provenance: result.validation.provenance,
        notes: result.validation.notes,
        errors: result.validation.errors.map((e) => e.details ? `${e.message} — ${e.details}` : e.message),
        warnings: result.validation.warnings.map((w) => w.message),
        fingerprint: result.fingerprint,
      };

      if (result.blocked === 'injection') {
        const findings = result.injectionFindings ?? [];
        res.status(409).json({
          success: false,
          blocked: 'injection',
          error: `Import blocked: the bundle contains ${findings.length} prompt-injection pattern${findings.length === 1 ? '' : 's'}. Review them, then re-submit with acceptInjectionFindings=true to import anyway.`,
          injectionFindings: findings,
          acceptWith: { field: 'acceptInjectionFindings', value: true },
          ...report,
        });
        return;
      }

      res.json({
        success: result.success,
        moduleId: result.moduleId,
        keptOriginalId: result.keptOriginalId,
        ...report,
        injectionFindings: result.injectionFindings ?? [],
        acceptedInjectionFindings: result.acceptedInjectionFindings ?? [],
        installedSkills: result.installedSkills ?? [],
        installedPersonas: result.installedPersonas ?? [],
        importWarnings: result.importWarnings ?? [],
      });
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // ── Market bundle imports ──────────────────────────────────────

  async function handleMarketImport(
    req: import('express').Request,
    res: import('express').Response,
    importFn: (db: DatabaseAdapter, payload: Record<string, unknown>) => Promise<{ success: boolean; bundleType: string; imported: Record<string, number>; errors?: string[] }>,
  ) {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    try {
      // F1: market bundles previously went straight to JSON.parse with no
      // validation at all — run the dispatching validator first, exactly like
      // the module import path. This rejects invalid signatures, content
      // checksum tampering, forbidden files and malformed manifests, and
      // surfaces provenance to the importer. Unsigned / checksum-less bundles
      // still import (READ-OLD) — those only produce warnings, never errors.
      const validation = await validateAntonFile(req.file.buffer, db);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: 'Bundle failed validation',
          bundle_type: validation.bundle_type,
          validated_depth: validation.validated_depth,
          provenance: validation.provenance,
          errors: validation.errors.map((e) => e.details ? `${e.message} — ${e.details}` : e.message),
          warnings: validation.warnings.map((w) => w.message),
        });
        return;
      }

      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(req.file.buffer);
      const entries = zip.getEntries();
      // Find the main content JSON in contents/
      const contentEntry = entries.find(e => e.entryName.startsWith('contents/') && e.entryName.endsWith('.json'));
      if (!contentEntry) { res.status(400).json({ error: 'Invalid .anton bundle — no content JSON found' }); return; }
      const payload = JSON.parse(contentEntry.getData().toString('utf-8'));
      const result = await importFn(db, payload);
      // Surface provenance like the module import path does.
      res.json({
        ...result,
        bundle_type: validation.bundle_type,
        validated_depth: validation.validated_depth,
        governance: validation.governance,
        provenance: validation.provenance,
        notes: validation.notes,
        warnings: validation.warnings.map((w) => w.message),
      });
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  }

  // Wave 6: every market import writes to this instance — same guard as /exchange/import.
  router.post('/exchange/import-bundle/market-index', requireExchangeContributor, upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketIndex);
  });
  router.post('/exchange/import-bundle/market-thesis', requireExchangeContributor, upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketThesis);
  });
  router.post('/exchange/import-bundle/market-atom-collection', requireExchangeContributor, upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketAtomCollection);
  });
  router.post('/exchange/import-bundle/market-strategy-pack', requireExchangeContributor, upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketStrategyPack);
  });
  router.post('/exchange/import-bundle/market-investigation', requireExchangeContributor, upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketInvestigation);
  });
  router.post('/exchange/import-bundle/market-data-source-config', requireExchangeContributor, upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketDataSourceConfig);
  });
  router.post('/exchange/import-bundle/market-intelligence-model', requireExchangeContributor, upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketIntelligenceModel);
  });

  return router;
}
