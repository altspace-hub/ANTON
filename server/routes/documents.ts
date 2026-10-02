/**
 * documents.ts
 * API routes for document upload, indexing, and management
 *
 * Ownership (team mode): a document is its uploader's (rag_documents.
 * uploaded_by), and it can only go into a collection the uploader may read
 * (collection-manager.ts collectionReadScope: their own or a shared one; on a
 * public demo, their own only). Every check runs in SQL before the row is
 * loaded, and "not yours" answers 404 like "missing".
 *
 * Public demo (DEMO_MODE=true), for a non-admin: uploads count toward the one
 * account quota with run attachments and project files (rag/demo-storage.ts
 * accountStoredUsage), their content must match their extension and a
 * .docx/.xlsx must not expand past the ZIP limit before it is indexed
 * (services/demo-upload-guard.ts), and their text is not embedded (keyword
 * search only). Deleting a document removes its file from disk.
 */

import { safeError, publicErrorMessage } from '../lib/error-response.js';
import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { assertOwned, ownerFilter, scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';
import multer from 'multer';
import * as path from 'path';
import fs from 'fs-extra';
import { randomBytes } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { indexDocument, reindexDocument, deleteDocument, getCollectionIndexStats } from '../services/document-indexer.js';
import { getCollectionDocuments, findCollectionFor } from '../services/collection-manager.js';
import { isDemoVisitor, quotaRefusal, ragUploadDir, removeFileInside } from '../services/rag/demo-storage.js';
import { demoVisitorUploadRefusal } from '../services/demo-upload-guard.js';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md', '.html'];
const MAX_FILE_BYTES = 50 * 1024 * 1024;

// File upload configuration. UPLOAD_DIR/rag-documents (./uploads/rag-documents
// when UPLOAD_DIR is unset, as before): retention and deletion find the files there.
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      const uploadDir = ragUploadDir();
      await fs.ensureDir(uploadDir);
      cb(null, uploadDir);
    } catch (err) {
      cb(err as Error, '');
    }
  },
  filename: (_req, file, cb) => {
    // A random prefix and a cleaned name: the client chooses originalname.
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150);
    cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new UploadRefused(`File type ${ext || '(none)'} is not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`));
    }
  },
});

/** A refusal written for the person uploading (multer passes it to next()); shown in production too. */
class UploadRefused extends Error {
  readonly publicMessage: string;
  constructor(text: string) {
    super(text);
    this.publicMessage = text;
  }
}

/** Runs a multer middleware and answers its refusals as JSON the page can show. */
function receive(mw: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    mw(req, res, (err?: unknown) => {
      if (!err) { next(); return; }
      if (err instanceof UploadRefused) { res.status(400).json({ error: publicErrorMessage(err) }); return; }
      if (err instanceof multer.MulterError) {
        const tooBig = err.code === 'LIMIT_FILE_SIZE';
        res.status(tooBig ? 413 : 400).json({
          error: tooBig ? `A file is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB` : 'The upload could not be read',
        });
        return;
      }
      res.status(500).json({ error: safeError(err) });
    });
  };
}

/** Removes files multer wrote for a request that is not kept. */
async function discard(files: Array<{ path: string }>): Promise<void> {
  const root = ragUploadDir();
  for (const f of files) await removeFileInside(root, f.path).catch(() => false);
}

function parseMetadata(raw: unknown): Record<string, unknown> | undefined | 'invalid' {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.length > 10_000) return 'invalid';
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : 'invalid';
  } catch {
    return 'invalid';
  }
}

function chunkingFrom(body: { chunkSize?: unknown; overlapSize?: unknown }): { chunkSize?: number; overlapSize?: number } {
  const n = (v: unknown, min: number, max: number): number | undefined => {
    const parsed = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : undefined;
  };
  const chunkSize = n(body.chunkSize, 100, 8000);
  const overlapSize = n(body.overlapSize, 0, 2000);
  return {
    ...(chunkSize !== undefined ? { chunkSize } : {}),
    ...(overlapSize !== undefined ? { overlapSize } : {}),
  };
}

export async function createDocumentsRouter(db: DatabaseAdapter) {
  const router = express.Router();

  /**
   * Refused before multer writes anything: what the account keeps, plus this
   * request's size, must fit the demo quota. Checked again with the real sizes
   * once the files are on disk, and once more after they are on record.
   */
  const quotaPrecheck: RequestHandler = async (req, res, next) => {
    try {
      const refusal = await quotaRefusal(db, req as OwnedRequest, Number(req.headers['content-length']) || 0, 1);
      if (refusal) { res.status(413).json(refusal); return; }
      next();
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  };

  /**
   * After multer: the collection must be one the caller may read, a demo
   * visitor's files must pass the content check (before anything extracts
   * them: mammoth and SheetJS inflate a whole archive in memory), and the
   * files must fit the quota. Sends the refusal (and removes the files) and
   * returns false when they may not be stored.
   */
  async function admit(req: Request, res: Response, files: Express.Multer.File[], collectionId: unknown): Promise<boolean> {
    if (typeof collectionId !== 'string' || !collectionId) {
      await discard(files);
      res.status(400).json({ error: 'collectionId is required' });
      return false;
    }
    const found = await findCollectionFor(db, req as OwnedRequest, collectionId, 'read');
    if (found === 'not_found' || found === 'read_only') {
      await discard(files);
      res.status(404).json({ error: 'Collection not found' });
      return false;
    }
    const content = await demoVisitorUploadRefusal(req as OwnedRequest, files);
    if (content) {
      await discard(files);
      res.status(400).json(content);
      return false;
    }
    const refusal = await quotaRefusal(db, req as OwnedRequest, files.reduce((sum, f) => sum + f.size, 0), files.length);
    if (refusal) {
      await discard(files);
      res.status(413).json(refusal);
      return false;
    }
    return true;
  }

  /**
   * Once a document is on record, the quota again: of uploads racing past the
   * earlier checks, none that stays takes the account over it. Returns the
   * refusal after removing the documents, or null.
   */
  async function recheckQuota(req: Request, documentIds: string[]): Promise<{ error: string; code: string } | null> {
    const refusal = await quotaRefusal(db, req as OwnedRequest, 0, 0);
    if (!refusal) return null;
    for (const id of documentIds) await deleteDocument(db, id, '').catch(() => false);
    return refusal;
  }

  /**
   * POST /documents/upload
   * Upload and index a document
   */
  router.post('/documents/upload', quotaPrecheck, receive(upload.single('file')), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const file = req.file;

    try {
      const { collectionId, metadata } = req.body as { collectionId?: unknown; metadata?: unknown };
      // req.userId is never set — the auth middleware stamps req.user.id. Reading the
      // wrong property meant every document was attributed to the literal 'system',
      // which silently disabled the ownership checks on reindex/delete/get below.
      const userId = req.user?.id ?? null;

      const customMetadata = parseMetadata(metadata);
      if (customMetadata === 'invalid') {
        await discard([file]);
        return res.status(400).json({ error: 'metadata must be a JSON object' });
      }
      if (!(await admit(req, res, [file], collectionId))) return;

      const result = await indexDocument(
        db,
        file.path,
        file.originalname,
        collectionId as string,
        userId,
        customMetadata,
        chunkingFrom(req.body as { chunkSize?: unknown; overlapSize?: unknown }),
        { embed: !isDemoVisitor(req as OwnedRequest) },
      );

      // Nothing on record points at the file: it goes.
      if (!result.documentId) await discard([file]);

      if (result.success && result.documentId) {
        const refusal = await recheckQuota(req, [result.documentId]);
        if (refusal) return res.status(413).json(refusal);
        res.json({
          success: true,
          documentId: result.documentId,
          chunkCount: result.chunkCount,
        });
      } else {
        res.status(422).json({ error: result.error ?? 'The document could not be indexed' });
      }
    } catch (error) {
      console.error('[documents] Upload error:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * POST /documents/upload-multiple
   * Upload and index multiple documents
   */
  router.post('/documents/upload-multiple', quotaPrecheck, receive(upload.array('files', 20)), async (req, res) => {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const files = req.files;

    try {
      const { collectionId, metadata } = req.body as { collectionId?: unknown; metadata?: unknown };
      const userId = req.user?.id ?? null;

      const customMetadata = parseMetadata(metadata);
      if (customMetadata === 'invalid') {
        await discard(files);
        return res.status(400).json({ error: 'metadata must be a JSON object' });
      }
      if (!(await admit(req, res, files, collectionId))) return;

      const chunking = chunkingFrom(req.body as { chunkSize?: unknown; overlapSize?: unknown });
      const embed = !isDemoVisitor(req as OwnedRequest);
      // One at a time: a request of twenty documents does not extract twenty at once.
      const results = [];
      for (const file of files) {
        const r = await indexDocument(db, file.path, file.originalname, collectionId as string, userId, customMetadata, chunking, { embed });
        if (!r.documentId) await discard([file]);
        results.push(r);
      }

      const stored = results.map((r) => r.documentId).filter((id): id is string => !!id);
      const refusal = await recheckQuota(req, stored);
      if (refusal) return res.status(413).json(refusal);

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
      console.error('[documents] Multiple upload error:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * GET /documents/collection/:collectionId
   * List the caller's documents in a collection they may read.
   */
  router.get('/documents/collection/:collectionId', async (req, res) => {
    try {
      const { collectionId } = req.params;
      const owned = req as OwnedRequest;
      const found = await findCollectionFor(db, owned, collectionId, 'read');
      if (found === 'not_found' || found === 'read_only') return res.status(404).json({ error: 'Collection not found' });
      const documents = await getCollectionDocuments(db, collectionId, ownerFilter(req, 'uploaded_by'));
      // The server path stays on the server for a team non-admin.
      const hidePath = scopesToOwner(owned);
      res.json({ documents: hidePath ? documents.map(({ file_path: _omit, ...doc }) => doc) : documents });
    } catch (error) {
      console.error('[documents] List error:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * GET /documents/collection/:collectionId/stats
   * Indexing statistics for a collection the caller may read (their own documents).
   */
  router.get('/documents/collection/:collectionId/stats', async (req, res) => {
    try {
      const { collectionId } = req.params;
      const owned = req as OwnedRequest;
      const found = await findCollectionFor(db, owned, collectionId, 'read');
      if (found === 'not_found' || found === 'read_only') return res.status(404).json({ error: 'Collection not found' });
      const stats = await getCollectionIndexStats(db, collectionId, ownerFilter(owned, 'uploaded_by'));
      res.json(stats);
    } catch (error) {
      console.error('[documents] Stats error:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * POST /documents/:id/reindex
   * Re-index a document with new chunking options. It stays in its own
   * collection: a collectionId in the body is not trusted.
   */
  router.post('/documents/:id/reindex', async (req, res) => {
    try {
      const { id } = req.params;

      // SECURITY (2026-07-27 survey): keyed off the document id alone, so on a shared
      // instance any user could read or destroy another user's uploaded document —
      // including its full extracted text. Checked before the row is loaded.
      if (!(await assertOwned(db, req as OwnedRequest, res, {
        table: 'rag_documents', ownerColumn: 'uploaded_by', id,
        notFoundMessage: 'Document not found',
      }))) return;

      const doc = await db.get<{ collection_id: string }>('SELECT collection_id FROM rag_documents WHERE id = ?', id);
      if (!doc) return res.status(404).json({ error: 'Document not found' });

      const result = await reindexDocument(
        db, id, doc.collection_id,
        chunkingFrom(req.body as { chunkSize?: unknown; overlapSize?: unknown }),
        { embed: !isDemoVisitor(req as OwnedRequest) },
      );

      if (result.success) {
        res.json({
          success: true,
          documentId: result.documentId,
          chunkCount: result.chunkCount,
        });
      } else {
        res.status(422).json({ error: result.error ?? 'The document could not be indexed' });
      }
    } catch (error) {
      console.error('[documents] Reindex error:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * DELETE /documents/:id
   * Delete a document, all its chunks and its file.
   */
  router.delete('/documents/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // SECURITY (2026-07-27 survey): keyed off the document id alone, so on a shared
      // instance any user could read or destroy another user's uploaded document —
      // including its full extracted text. Checked before the row is loaded.
      if (!(await assertOwned(db, req as OwnedRequest, res, {
        table: 'rag_documents', ownerColumn: 'uploaded_by', id,
        notFoundMessage: 'Document not found',
      }))) return;

      // Get document to find collection
      const doc = await db.get<{ collection_id: string }>('SELECT collection_id FROM rag_documents WHERE id = ?', id);

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
      console.error('[documents] Delete error:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * GET /documents/:id
   * Get document details with chunks
   */
  router.get('/documents/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // SECURITY (2026-07-27 survey): keyed off the document id alone, so on a shared
      // instance any user could read or destroy another user's uploaded document —
      // including its full extracted text. Checked before the row is loaded.
      if (!(await assertOwned(db, req as OwnedRequest, res, {
        table: 'rag_documents', ownerColumn: 'uploaded_by', id,
        notFoundMessage: 'Document not found',
      }))) return;

      const document = await db.get<Record<string, unknown>>('SELECT * FROM rag_documents WHERE id = ?', id);

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const chunks = await db.all('SELECT * FROM rag_chunks WHERE document_id = ? ORDER BY chunk_index ASC', id);

      if (scopesToOwner(req as OwnedRequest)) delete document.file_path;
      res.json({ document, chunks });
    } catch (error) {
      console.error('[documents] Get error:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  return router;
}
