import { Router } from 'express';
import multer from 'multer';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import {
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

export async function createExchangeRoutes(db: DatabaseAdapter) {
  const router = Router();

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
        buffer = await bundleBuiltinModuleToAnton(moduleId, { authorName, authorOrg, description, tags, license, governance });
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

  // Validate a .anton file without installing.
  // Dispatching validator (Wave 2.1): response carries
  //   { bundle_type, validated_depth: 'full' | 'structural', governance?, notes? }
  router.post('/exchange/validate', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    try {
      const result = await validateAntonFile(req.file.buffer, db);
      // Map is not JSON-serializable — surface file names only.
      const { files, ...rest } = result;
      res.json({ ...rest, files: files ? [...files.keys()] : undefined });
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
  router.post('/exchange/import-run', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    try {
      const userId = (req as import('express').Request & { user?: { id?: string } }).user?.id;
      const result = await importModuleRunBundle(req.file.buffer, db, userId ?? null);
      res.json({
        success: result.success,
        sessionId: result.sessionId,
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
        moduleExists: result.moduleExists,
        localModuleId: result.localModuleId,
        reproducible: result.reproducible,
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
  router.post('/exchange/import', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    try {
      const keepId = req.body?.keepId === 'true' || req.body?.keepId === true;
      const result = await importAntonFile(req.file.buffer, db, undefined, { keepId });
      // Flattened report for the UI (the validation Map doesn't serialize) +
      // governance display at import time (Wave 2.6).
      res.json({
        success: result.success,
        moduleId: result.moduleId,
        keptOriginalId: result.keptOriginalId,
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

  // ── Market bundle imports ──────────────────────────────────────

  async function handleMarketImport(
    req: import('express').Request,
    res: import('express').Response,
    importFn: (db: DatabaseAdapter, payload: Record<string, unknown>) => Promise<{ success: boolean; bundleType: string; imported: Record<string, number>; errors?: string[] }>,
  ) {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    try {
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(req.file.buffer);
      const entries = zip.getEntries();
      // Find the main content JSON in contents/
      const contentEntry = entries.find(e => e.entryName.startsWith('contents/') && e.entryName.endsWith('.json'));
      if (!contentEntry) { res.status(400).json({ error: 'Invalid .anton bundle — no content JSON found' }); return; }
      const payload = JSON.parse(contentEntry.getData().toString('utf-8'));
      const result = await importFn(db, payload);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  }

  router.post('/exchange/import-bundle/market-index', upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketIndex);
  });
  router.post('/exchange/import-bundle/market-thesis', upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketThesis);
  });
  router.post('/exchange/import-bundle/market-atom-collection', upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketAtomCollection);
  });
  router.post('/exchange/import-bundle/market-strategy-pack', upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketStrategyPack);
  });
  router.post('/exchange/import-bundle/market-investigation', upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketInvestigation);
  });
  router.post('/exchange/import-bundle/market-data-source-config', upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketDataSourceConfig);
  });
  router.post('/exchange/import-bundle/market-intelligence-model', upload.single('file'), (req, res) => {
    handleMarketImport(req, res, importMarketIntelligenceModel);
  });

  return router;
}
