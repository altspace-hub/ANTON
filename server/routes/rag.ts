import { Router } from 'express';
import path from 'path';
import type Database from 'better-sqlite3';
import { indexFolder } from '../services/rag/indexer.js';
import { retrieveChunks } from '../services/rag/retriever.js';

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

export function createRagRoutes(db: Database.Database) {
  const router = Router();

  // POST /api/rag/index -- start indexing a folder
  router.post('/rag/index', async (req, res) => {
    const { folderPath } = req.body as { folderPath: string };
    if (!validateFolderPath(folderPath)) {
      res.status(400).json({ error: 'Valid absolute folder path required' });
      return;
    }
    try {
      const result = await indexFolder(db, folderPath);
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Indexing failed' });
    }
  });

  // GET /api/rag/folders -- list all indexed folders with stats
  router.get('/rag/folders', (_req, res) => {
    const folders = db.prepare(`SELECT * FROM indexed_folders ORDER BY last_indexed DESC`).all();
    res.json(folders);
  });

  // GET /api/rag/index/status -- get status of all indexed folders (alias)
  router.get('/rag/index/status', (_req, res) => {
    const folders = db.prepare(`SELECT * FROM indexed_folders ORDER BY last_indexed DESC`).all();
    res.json(folders);
  });

  // DELETE /api/rag/index -- remove a folder from the index
  router.delete('/rag/index', (req, res) => {
    const { folderPath } = req.body as { folderPath: string };
    if (!validateFolderPath(folderPath)) {
      res.status(400).json({ error: 'Valid absolute folder path required' });
      return;
    }
    db.prepare(`DELETE FROM document_chunks WHERE folder_path = ?`).run(folderPath);
    db.prepare(`DELETE FROM indexed_folders WHERE folder_path = ?`).run(folderPath);
    res.json({ success: true });
  });

  // POST /api/rag/search -- search indexed chunks (used internally + for preview)
  router.post('/rag/search', (req, res) => {
    const { query, folderPaths, topK = 10, minScore = 0.1 } = req.body as {
      query: string; folderPaths: string[]; topK?: number; minScore?: number;
    };
    if (!query || !folderPaths?.length) {
      res.status(400).json({ error: 'query and folderPaths required' });
      return;
    }
    const results = retrieveChunks(db, query, folderPaths, topK, minScore);
    res.json(results);
  });

  return router;
}
