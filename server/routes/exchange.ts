import { Router } from 'express';
import multer from 'multer';
import type { DatabaseAdapter } from '../db/database.js';
import { exportModuleToAnton } from '../services/antonExport.js';
import { safeError } from '../lib/error-response.js';
import {
  bundleModuleToAnton,
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
} from '../services/anton-bundler.js';
import { validateAntonFile } from '../services/anton-validator.js';
import { importAntonFile } from '../services/anton-importer.js';
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

  // Export a module as .anton
  // Query param: ?type=builtin (for file system modules) or ?type=custom (for database modules)
  router.post('/exchange/export/:moduleId', async (req, res) => {
    const { moduleId } = req.params;
    const { type = 'builtin' } = req.query;

    try {
      let buffer: Buffer;

      if (type === 'custom') {
        // Export custom module from database (works in both solo and authenticated mode)
        buffer = await bundleModuleToAnton(db, moduleId);
      } else {
        // Export built-in module from file system
        const {
          authorName = 'openEXPERT Team',
          authorOrg = 'ANTON',
          description = '',
          tags = [],
          license = 'CC-BY-4.0',
        } = req.body;
        buffer = await exportModuleToAnton(moduleId, { authorName, authorOrg, description, tags, license });
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${moduleId}.anton"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // Validate a .anton file without installing
  router.post('/exchange/validate', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    try {
      const result = await validateAntonFile(req.file.buffer, db);
      res.json(result);
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
      const buffer = await bundleComplianceRuleset(db, { name, description, categories, author });
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
      const buffer = await bundleQualityBaseline(db, { name, description, moduleIds, author });
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
      const buffer = await bundleReviewPanel({ name, description, applicableAreas, reviewers, panelSettings, author });
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
      const buffer = await bundleAudienceProfile(params);
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
      const buffer = await bundleMarketIndex(db, indexId, { author });
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
      const buffer = await bundleMarketThesis(db, thesisId, { author });
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
      const buffer = await bundleMarketIntelligenceModel(db, { name, author });
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
      const buffer = await bundleMarketInvestigation(db, investigationId, { author });
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
      const buffer = await bundleMarketDataSourceConfig(db, { name, sourceIds, author });
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
      const buffer = await bundleMarketAtomCollection(db, { name, atomIds, category, author });
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
      const buffer = await bundleMarketStrategyPack(db, { name, indexIds, thesisIds, author });
      const filename = `market-strategy-pack-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // Import a .anton file to user's custom modules (works in solo and authenticated mode)
  router.post('/exchange/import', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    try {
      const result = await importAntonFile(req.file.buffer, db);
      res.json(result);
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
