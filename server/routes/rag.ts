import { Router } from 'express';
import path from 'path';
import type { DatabaseAdapter } from '../db/database.js';
import { indexFolder } from '../services/rag/indexer.js';
import { retrieveChunks } from '../services/rag/retriever.js';
import { checkFolderPath } from '../lib/folder-guard.js';
import { safeError } from '../lib/error-response.js';

/** Validates a folder path: must be absolute and must not contain path traversal sequences. */
function validateFolderPath(folderPath: unknown): folderPath is string {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return false;
  const normalised = path.normalize(folderPath);
  // Must be absolute
  if (!path.isAbsolute(normalised)) return false;
  // Reject sequences that try to escape — normalise removes them but reject if original had them
  if (folderPath.includes('..')) return false;
  return true;
}

export async function createRagRoutes(db: DatabaseAdapter) {
  const router = Router();

  // POST /api/rag/index -- start indexing a folder
  router.post('/rag/index', async (req, res) => {
    const { folderPath } = req.body as { folderPath: string };
    if (!validateFolderPath(folderPath)) {
      res.status(400).json({ error: 'Valid absolute folder path required' });
      return;
    }
    // "Absolute and no .." is not authorisation — C:\Users\someone\Documents
    // satisfies it. indexFolder() recurses this path and writes every document
    // into document_chunks, which POST /api/rag/search reads back, so the same
    // ALLOWED_FOLDER_PATHS whitelist the folder browser enforces applies here.
    const guard = checkFolderPath(folderPath);
    if (!guard.ok) {
      res.status(403).json({ error: guard.error });
      return;
    }
    try {
      const result = await indexFolder(db, folderPath);
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // GET /api/rag/folders -- list all indexed folders with stats
  router.get('/rag/folders', async (_req, res) => {
    const folders = await db.all(`SELECT * FROM indexed_folders ORDER BY last_indexed DESC`);
    res.json(folders);
  });

  // GET /api/rag/index/status -- get status of all indexed folders (alias)
  router.get('/rag/index/status', async (_req, res) => {
    const folders = await db.all(`SELECT * FROM indexed_folders ORDER BY last_indexed DESC`);
    res.json(folders);
  });

  // DELETE /api/rag/index -- remove a folder from the index
  router.delete('/rag/index', async (req, res) => {
    const { folderPath } = req.body as { folderPath: string };
    if (!validateFolderPath(folderPath)) {
      res.status(400).json({ error: 'Valid absolute folder path required' });
      return;
    }
    await db.run(`DELETE FROM document_chunks WHERE folder_path = ?`, folderPath);
    await db.run(`DELETE FROM indexed_folders WHERE folder_path = ?`, folderPath);
    res.json({ success: true });
  });

  // POST /api/rag/search -- search indexed chunks (used internally + for preview)
  router.post('/rag/search', async (req, res) => {
    const { query, folderPaths, topK = 10, minScore = 0.1 } = req.body as {
      query: string; folderPaths: string[]; topK?: number; minScore?: number;
    };
    if (!query || !folderPaths?.length) {
      res.status(400).json({ error: 'query and folderPaths required' });
      return;
    }
    // retrieveChunks is async: without the await this handler serialised a
    // Promise (`{}`) instead of the hits — the missing-await class CLAUDE.md
    // calls out. Only whitelisted folders can be indexed, so what comes back
    // here is already scoped by the guard on POST /api/rag/index.
    const results = await retrieveChunks(db, query, folderPaths, topK, minScore);
    res.json(results);
  });

  return router;
}
