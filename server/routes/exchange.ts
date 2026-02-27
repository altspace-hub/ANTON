import { Router } from 'express';
import multer from 'multer';
import type { Database } from 'better-sqlite3';
import { exportModuleToAnton } from '../services/antonExport.js';
import {
  bundleModuleToAnton,
  bundleComplianceRuleset,
  bundleReviewPanel,
  bundleQualityBaseline,
  bundleAudienceProfile,
} from '../services/anton-bundler.js';
import { validateAntonFile } from '../services/anton-validator.js';
import { importAntonFile } from '../services/anton-importer.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export function createExchangeRoutes(db: Database) {
  const router = Router();

  // Export a module as .anton
  // Query param: ?type=builtin (for file system modules) or ?type=custom (for database modules)
  router.post('/exchange/export/:moduleId', async (req, res) => {
    const { moduleId } = req.params;
    const { type = 'builtin' } = req.query;
    const userId = (req as any).user?.id;

    try {
      let buffer: Buffer;

      if (type === 'custom') {
        // Export custom module from database
        if (!userId) {
          res.status(401).json({ error: 'Authentication required for custom module export' });
          return;
        }
        buffer = await bundleModuleToAnton(db, moduleId, userId);
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
      res.status(500).json({ error: e instanceof Error ? e.message : 'Export failed' });
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
      res.status(500).json({ error: e instanceof Error ? e.message : 'Validation failed' });
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
      res.status(500).json({ error: e instanceof Error ? e.message : 'Export failed' });
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
      res.status(500).json({ error: e instanceof Error ? e.message : 'Export failed' });
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
      res.status(500).json({ error: e instanceof Error ? e.message : 'Export failed' });
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
      res.status(500).json({ error: e instanceof Error ? e.message : 'Export failed' });
    }
  });

  // Import a .anton file to user's custom modules
  router.post('/exchange/import', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const result = await importAntonFile(req.file.buffer, db, userId);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Import failed' });
    }
  });

  return router;
}
