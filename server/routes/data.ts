/**
 * Data Transformation API Routes
 *
 * Endpoints for data import, transform, merge, and export operations
 */

import express, { Request, Response } from 'express';
import { safeError } from '../lib/error-response.js';
import {
  importData,
  exportData,
  getSampleRows,
  ImportConfig,
  ExportConfig,
} from '../services/data-importer.js';
import {
  applyTransformations,
  validateOperation,
  getPreview,
  Dataset,
  TransformOperation,
} from '../services/data-transformer.js';
import {
  mergeDatasets,
  validateMergeConfig,
  previewMerge,
  deduplicateDataset,
  MergeConfig,
} from '../services/data-merger.js';
import type { DatabaseAdapter } from '../db/database.js';
import path from 'path';
import { isTeamMode, requireAdminOrSolo } from '../middleware/role-guards.js';

/**
 * On a team server, reading a file from the server's disk, writing one there,
 * and exporting into ANTON's own database are instance-wide acts: an admin's.
 * The importer also confines every path to ALLOWED_FOLDER_PATHS and every
 * database export to DATA_EXPORT_TABLES, for everyone. Solo is unchanged.
 */
function hostDataRefused(req: Request): boolean {
  return isTeamMode() && req.user?.role !== 'admin';
}

// In-memory cache for datasets during workflow execution
// Key: dataset ID, Value: Dataset
const datasetCache = new Map<string, Dataset>();

export async function createDataRoutes(db: DatabaseAdapter) {
  const router = express.Router();

// ==================== Import ====================

/**
 * POST /api/data/import
 * Import data from file or database
 */
router.post('/import', async (req: Request, res: Response) => {
  try {
    const config: ImportConfig = req.body;
    if (config?.source === 'file' && hostDataRefused(req)) {
      return res.status(403).json({ error: 'Only an administrator can import a file from the server' });
    }

    // If database source, hand the importer ANTON's DB handle so it can LOOK UP the
    // configured connection. It is not the query target: importFromDatabase runs the
    // query through that connection's own driver, under the connection guards. Do not
    // "simplify" this back into running config.query on `db` — that made an
    // unauthenticated request body arbitrary SQL against ANTON's own tables.
    if (config.source === 'database') {
      config.db = db;
    }

    const dataset = await importData(config);

    // Cache dataset for subsequent operations
    datasetCache.set(dataset.id, dataset);

    res.json({
      datasetId: dataset.id,
      columns: dataset.columns,
      rowCount: dataset.metadata.rowCount,
      preview: getSampleRows(dataset, 10),
      metadata: dataset.metadata,
    });
  } catch (error) {
    console.error('[data/import] Error:', error);
    res.status(500).json({
      error: 'Import failed',
      message: safeError(error),
    });
  }
});

// ==================== Transform ====================

/**
 * POST /api/data/transform
 * Apply transformations to a dataset
 */
router.post('/transform', async (req: Request, res: Response) => {
  try {
    const { datasetId, operations } = req.body as {
      datasetId: string;
      operations: TransformOperation[];
    };

    const dataset = datasetCache.get(datasetId);
    if (!dataset) {
      return res.status(404).json({ error: 'Dataset not found', datasetId });
    }

    // Validate all operations first
    for (const operation of operations) {
      const validation = validateOperation(dataset, operation);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid operation',
          operation: operation.type,
          message: validation.error,
        });
      }
    }

    // Apply transformations
    const transformed = applyTransformations(dataset, operations);

    // Cache transformed dataset
    datasetCache.set(transformed.id, transformed);

    res.json({
      datasetId: transformed.id,
      columns: transformed.columns,
      rowCount: transformed.metadata.rowCount,
      preview: getSampleRows(transformed, 10),
      metadata: transformed.metadata,
    });
  } catch (error) {
    console.error('[data/transform] Error:', error);
    res.status(500).json({
      error: 'Transform failed',
      message: safeError(error),
    });
  }
});

// ==================== Merge ====================

/**
 * POST /api/data/merge
 * Merge two datasets
 */
router.post('/merge', async (req: Request, res: Response) => {
  try {
    const { leftId, rightId, config } = req.body as {
      leftId: string;
      rightId: string;
      config: MergeConfig;
    };

    const left = datasetCache.get(leftId);
    const right = datasetCache.get(rightId);

    if (!left || !right) {
      return res.status(404).json({
        error: 'Dataset not found',
        leftId: left ? undefined : leftId,
        rightId: right ? undefined : rightId,
      });
    }

    // Validate merge config
    const validation = validateMergeConfig(left, right, config);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid merge configuration',
        message: validation.error,
      });
    }

    // Perform merge
    let merged = mergeDatasets(left, right, config);

    // Apply deduplication if configured
    if (config.deduplicateBy && config.deduplicateStrategy) {
      merged = deduplicateDataset(merged, config.deduplicateBy, config.deduplicateStrategy);
    }

    // Cache merged dataset
    datasetCache.set(merged.id, merged);

    res.json({
      datasetId: merged.id,
      columns: merged.columns,
      rowCount: merged.metadata.rowCount,
      preview: getSampleRows(merged, 10),
      metadata: merged.metadata,
    });
  } catch (error) {
    console.error('[data/merge] Error:', error);
    res.status(500).json({
      error: 'Merge failed',
      message: safeError(error),
    });
  }
});

// ==================== Export ====================

/**
 * POST /api/data/export
 * Export dataset to file or database
 */
router.post('/export', async (req: Request, res: Response) => {
  try {
    const { datasetId, config } = req.body as {
      datasetId: string;
      config: ExportConfig;
    };

    if ((config?.destination === 'file' || config?.destination === 'database') && hostDataRefused(req)) {
      return res.status(403).json({ error: 'Only an administrator can export to a server file or to the database' });
    }

    const dataset = datasetCache.get(datasetId);
    if (!dataset) {
      return res.status(404).json({ error: 'Dataset not found', datasetId });
    }

    // If database destination, inject DB instance
    if (config.destination === 'database') {
      config.db = db;
    }

    const result = await exportData(dataset, config);

    res.json({
      success: true,
      destination: config.destination,
      result,
    });
  } catch (error) {
    console.error('[data/export] Error:', error);
    res.status(500).json({
      error: 'Export failed',
      message: safeError(error),
    });
  }
});

// ==================== Preview ====================

/**
 * POST /api/data/preview
 * Preview transformation or merge result without applying
 */
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const { type, datasetId, leftId, rightId, operations, mergeConfig, limit } = req.body as {
      type: 'transform' | 'merge';
      datasetId?: string;
      leftId?: string;
      rightId?: string;
      operations?: TransformOperation[];
      mergeConfig?: MergeConfig;
      limit?: number;
    };

    if (type === 'transform') {
      const dataset = datasetCache.get(datasetId!);
      if (!dataset) {
        return res.status(404).json({ error: 'Dataset not found', datasetId });
      }

      const transformed = applyTransformations(dataset, operations || []);
      const preview = getPreview(transformed, limit || 100);

      res.json({
        columns: preview.columns,
        rows: preview.rows,
        totalRows: transformed.metadata.rowCount,
      });
    } else if (type === 'merge') {
      const left = datasetCache.get(leftId!);
      const right = datasetCache.get(rightId!);

      if (!left || !right) {
        return res.status(404).json({
          error: 'Dataset not found',
          leftId: left ? undefined : leftId,
          rightId: right ? undefined : rightId,
        });
      }

      const preview = previewMerge(left, right, mergeConfig!, limit || 100);

      res.json({
        columns: preview.columns,
        rows: preview.rows,
        totalRows: preview.metadata.rowCount,
        estimatedTotalRows: preview.metadata.rowCount, // TODO: actual estimate
      });
    } else {
      res.status(400).json({ error: 'Invalid preview type', type });
    }
  } catch (error) {
    console.error('[data/preview] Error:', error);
    res.status(500).json({
      error: 'Preview failed',
      message: safeError(error),
    });
  }
});

// ==================== Utility ====================

/**
 * GET /api/data/cache/:id
 * Get cached dataset details
 */
router.get('/cache/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const dataset = datasetCache.get(id);

  if (!dataset) {
    return res.status(404).json({ error: 'Dataset not found', id });
  }

  res.json({
    id: dataset.id,
    columns: dataset.columns,
    rowCount: dataset.metadata.rowCount,
    metadata: dataset.metadata,
    preview: getSampleRows(dataset, 10),
  });
});

/**
 * DELETE /api/data/cache/:id
 * Remove dataset from cache
 */
router.delete('/cache/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = datasetCache.delete(id);

  res.json({ success: deleted, id });
});

/**
 * GET /api/data/cache/:id/download
 * The whole cached dataset as a JSON file download — what the Datasets page's
 * Download button needs, without writing anything on the server.
 */
router.get('/cache/:id/download', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const dataset = datasetCache.get(id);
  if (!dataset) {
    return res.status(404).json({ error: 'Dataset not found', id });
  }
  const name = String(req.query.name ?? 'dataset').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'dataset';
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.json"`);
  res.send(JSON.stringify(dataset.rows, null, 2));
});

/**
 * DELETE /api/data/cache
 * Clear the whole dataset cache — every user's datasets, so an admin action on
 * a team server.
 */
router.delete('/cache', requireAdminOrSolo, async (_req: Request, res: Response) => {
  const size = datasetCache.size;
  datasetCache.clear();

  res.json({ success: true, clearedCount: size });
});

  return router;
}

/**
 * Export the dataset cache for access by other services (e.g., dataset persistence).
 * This allows the datasets API to save in-memory datasets to persistent storage.
 */
export function getDatasetCache(): Map<string, Dataset> {
  return datasetCache;
}
