/**
 * documents.ts
 * API routes for document upload, indexing, and management
 */

import express from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs-extra';
import type { Database } from 'better-sqlite3';
import { indexDocument, reindexDocument, deleteDocument, getCollectionIndexStats } from '../services/document-indexer.js';
import { getCollectionDocuments } from '../services/collection-manager.js';

// File upload configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'rag-documents');
    await fs.ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md', '.html'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Allowed types: ${allowed.join(', ')}`));
    }
  },
});

export function createDocumentsRouter(db: Database) {
  const router = express.Router();

  /**
   * POST /documents/upload
   * Upload and index a document
   */
  router.post('/documents/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const { collectionId, metadata, chunkSize, overlapSize } = req.body;
      const userId = (req as any).userId || 'system';

      if (!collectionId) {
        return res.status(400).json({ error: 'collectionId is required' });
      }

      // Parse chunking options
      const chunkingOptions = {
        ...(chunkSize ? { chunkSize: parseInt(chunkSize, 10) } : {}),
        ...(overlapSize ? { overlapSize: parseInt(overlapSize, 10) } : {}),
      };

      // Parse custom metadata
      const customMetadata = metadata ? JSON.parse(metadata) : undefined;

      // Index the document
      const result = await indexDocument(
        db,
        req.file.path,
        req.file.originalname,
        collectionId,
        userId,
        customMetadata,
        chunkingOptions
      );

      if (result.success) {
        res.json({
          success: true,
          documentId: result.documentId,
          chunkCount: result.chunkCount,
        });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error) {
      console.error('[documents] Upload error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * POST /documents/upload-multiple
   * Upload and index multiple documents
   */
  router.post('/documents/upload-multiple', upload.array('files', 20), async (req, res) => {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    try {
      const { collectionId, metadata, chunkSize, overlapSize } = req.body;
      const userId = (req as any).userId || 'system';

      if (!collectionId) {
        return res.status(400).json({ error: 'collectionId is required' });
      }

      // Parse chunking options
      const chunkingOptions = {
        ...(chunkSize ? { chunkSize: parseInt(chunkSize, 10) } : {}),
        ...(overlapSize ? { overlapSize: parseInt(overlapSize, 10) } : {}),
      };

      // Parse custom metadata
      const customMetadata = metadata ? JSON.parse(metadata) : undefined;

      // Index all documents
      const results = await Promise.all(
        req.files.map((file) =>
          indexDocument(
            db,
            file.path,
            file.originalname,
            collectionId,
            userId,
            customMetadata,
            chunkingOptions
          )
        )
      );

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      res.json({
        success: true,
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        results: results.map((r) => ({
          documentId: r.documentId,
          chunkCount: r.chunkCount,
          error: r.error,
        })),
      });
    } catch (error) {
      console.error('[documents] Multiple upload error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * GET /documents/collection/:collectionId
   * List all documents in a collection
   */
  router.get('/documents/collection/:collectionId', (req, res) => {
    try {
      const { collectionId } = req.params;
      const documents = getCollectionDocuments(db, collectionId);
      res.json({ documents });
    } catch (error) {
      console.error('[documents] List error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * GET /documents/collection/:collectionId/stats
   * Get indexing statistics for a collection
   */
  router.get('/documents/collection/:collectionId/stats', (req, res) => {
    try {
      const { collectionId } = req.params;
      const stats = getCollectionIndexStats(db, collectionId);
      res.json(stats);
    } catch (error) {
      console.error('[documents] Stats error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * POST /documents/:id/reindex
   * Re-index a document with new chunking options
   */
  router.post('/documents/:id/reindex', async (req, res) => {
    try {
      const { id } = req.params;
      const { collectionId, chunkSize, overlapSize } = req.body;

      if (!collectionId) {
        return res.status(400).json({ error: 'collectionId is required' });
      }

      const chunkingOptions = {
        ...(chunkSize ? { chunkSize: parseInt(chunkSize, 10) } : {}),
        ...(overlapSize ? { overlapSize: parseInt(overlapSize, 10) } : {}),
      };

      const result = await reindexDocument(db, id, collectionId, chunkingOptions);

      if (result.success) {
        res.json({
          success: true,
          documentId: result.documentId,
          chunkCount: result.chunkCount,
        });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error) {
      console.error('[documents] Reindex error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * DELETE /documents/:id
   * Delete a document and all its chunks
   */
  router.delete('/documents/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // Get document to find collection
      const doc = db.prepare('SELECT collection_id FROM rag_documents WHERE id = ?').get(id) as any;

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const success = await deleteDocument(db, id, doc.collection_id);

      if (success) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: 'Failed to delete document' });
      }
    } catch (error) {
      console.error('[documents] Delete error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * GET /documents/:id
   * Get document details with chunks
   */
  router.get('/documents/:id', (req, res) => {
    try {
      const { id } = req.params;

      const document = db.prepare('SELECT * FROM rag_documents WHERE id = ?').get(id);

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const chunks = db
        .prepare('SELECT * FROM rag_chunks WHERE document_id = ? ORDER BY chunk_index ASC')
        .all(id);

      res.json({ document, chunks });
    } catch (error) {
      console.error('[documents] Get error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
