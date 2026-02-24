/**
 * datasets.ts
 * REST API routes for dataset persistence.
 * Allows workflows to save/load datasets for reuse.
 */

import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { createDatasetStore } from '../services/dataset-store.js';
import { requireAuth } from '../middleware/auth.js';

// Import from data routes to access in-memory cache
import { getDatasetCache } from './data.js';

export function createDatasetsRoutes(db: Database) {
  const router = Router();
  const store = createDatasetStore(db);

  // GET /api/datasets — list accessible datasets
  router.get('/datasets', requireAuth, (req, res) => {
    try {
      const userId = req.user!.id;
      const sessionId = req.query.sessionId as string | undefined;

      const datasets = store.list(userId, sessionId);

      res.json(datasets);
    } catch (err) {
      console.error('[datasets] list error:', err);
      res.status(500).json({ error: 'Failed to list datasets' });
    }
  });

  // GET /api/datasets/:id — get dataset metadata
  router.get('/datasets/:id', requireAuth, (req, res) => {
    try {
      const dataset = store.get(req.params.id as string);

      if (!dataset) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      // Check access: owner or global
      if (dataset.created_by !== req.user!.id && dataset.session_id !== null) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      res.json(dataset);
    } catch (err) {
      console.error('[datasets] get error:', err);
      res.status(500).json({ error: 'Failed to get dataset' });
    }
  });

  // POST /api/datasets — save a dataset from memory cache
  router.post('/datasets', requireAuth, (req, res) => {
    try {
      const {
        datasetId,
        name,
        description,
        sessionId,
        workflowId,
        sourceType,
        ttlDays,
      } = req.body as {
        datasetId: string;
        name: string;
        description?: string;
        sessionId?: string;
        workflowId?: string;
        sourceType: 'import' | 'transform' | 'merge';
        ttlDays?: number;
      };

      if (!datasetId || !name) {
        res.status(400).json({ error: 'datasetId and name are required' });
        return;
      }

      // Check if name already exists
      if (store.nameExists(name)) {
        res.status(409).json({ error: 'Dataset name already exists' });
        return;
      }

      // Get dataset from in-memory cache
      const datasetCache = getDatasetCache();
      const dataset = datasetCache.get(datasetId);

      if (!dataset) {
        res.status(404).json({ error: 'Dataset not found in cache' });
        return;
      }

      // Save to persistent storage
      const saved = store.save(dataset, {
        name,
        description,
        sessionId,
        workflowId,
        sourceType: sourceType || 'import',
        ttlDays,
        userId: req.user!.id,
      });

      res.status(201).json(saved);
    } catch (err) {
      console.error('[datasets] save error:', err);
      res.status(500).json({ error: 'Failed to save dataset' });
    }
  });

  // GET /api/datasets/:id/load — load dataset into memory cache
  router.get('/datasets/:id/load', requireAuth, (req, res) => {
    try {
      const meta = store.get(req.params.id as string);

      if (!meta) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      // Check access
      if (meta.created_by !== req.user!.id && meta.session_id !== null) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Load dataset into memory
      const dataset = store.load(req.params.id as string);

      if (!dataset) {
        res.status(404).json({ error: 'Dataset expired or could not be loaded' });
        return;
      }

      // Cache it in memory for workflow use
      const datasetCache = getDatasetCache();
      const cacheId = dataset.id; // Use storage_path as cache ID
      datasetCache.set(cacheId, dataset);

      res.json({
        id: req.params.id as string,
        cacheId,
        name: meta.name,
        rowCount: dataset.rows.length,
        columns: dataset.columns,
      });
    } catch (err) {
      console.error('[datasets] load error:', err);
      res.status(500).json({ error: 'Failed to load dataset' });
    }
  });

  // DELETE /api/datasets/:id — delete a dataset
  router.delete('/datasets/:id', requireAuth, (req, res) => {
    try {
      const meta = store.get(req.params.id as string);

      if (!meta) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      // Check ownership
      if (meta.created_by !== req.user!.id) {
        res.status(403).json({ error: 'Only the owner can delete this dataset' });
        return;
      }

      const deleted = store.delete(req.params.id as string);

      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: 'Failed to delete dataset' });
      }
    } catch (err) {
      console.error('[datasets] delete error:', err);
      res.status(500).json({ error: 'Failed to delete dataset' });
    }
  });

  // PATCH /api/datasets/:id — update dataset metadata
  router.patch('/datasets/:id', requireAuth, (req, res) => {
    try {
      const meta = store.get(req.params.id as string);

      if (!meta) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      // Check ownership
      if (meta.created_by !== req.user!.id) {
        res.status(403).json({ error: 'Only the owner can update this dataset' });
        return;
      }

      const { description, ttlDays } = req.body as {
        description?: string;
        ttlDays?: number;
      };

      const updated = store.update(req.params.id as string, { description, ttlDays });

      if (updated) {
        res.json(store.get(req.params.id as string));
      } else {
        res.status(400).json({ error: 'No updates provided' });
      }
    } catch (err) {
      console.error('[datasets] update error:', err);
      res.status(500).json({ error: 'Failed to update dataset' });
    }
  });

  // POST /api/datasets/cleanup — manually trigger cleanup (admin only)
  router.post('/datasets/cleanup', requireAuth, (req, res) => {
    try {
      const deleted = store.cleanupExpired();
      res.json({ deleted });
    } catch (err) {
      console.error('[datasets] cleanup error:', err);
      res.status(500).json({ error: 'Failed to cleanup datasets' });
    }
  });

  return router;
}
