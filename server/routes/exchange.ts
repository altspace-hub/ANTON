import { Router } from 'express';
import multer from 'multer';
import type { Database } from 'better-sqlite3';
import { exportModuleToAnton } from '../services/antonExport.js';
import { bundleModuleToAnton } from '../services/anton-bundler.js';
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
