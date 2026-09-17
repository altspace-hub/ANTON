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
 * DELETE /api/data/cache
 * Clear entire dataset cache
 */
router.delete('/cache', async (_req: Request, res: Response) => {
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
