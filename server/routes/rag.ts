import { Router, type Response } from 'express';
import path from 'path';
import type { DatabaseAdapter } from '../db/database.js';
import { indexFolder } from '../services/rag/indexer.js';
import { retrieveChunks } from '../services/rag/retriever.js';
import { checkFolderPath } from '../lib/folder-guard.js';
import { safeError } from '../lib/error-response.js';
import { scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';
import { requireAdminOrSolo } from '../middleware/role-guards.js';

/*
 * Who may see which folder index, on a shared (team-mode) instance.
 *
 * indexed_folders / document_chunks have no owner column: one index per folder
 * path, shared by everyone who may read that folder. So "yours" here means "a
 * folder the whitelist lets you read" — the same checkFolderPath() that gates
 * indexing, which in team mode also refuses ANTON's own upload/output storage.
 * An index built before that rule (or while solo) must not stay readable, so
 * list and search re-check every path rather than trusting the index.
 * Solo and admins are not scoped, per middleware/ownership.ts.
 */
function isVisibleFolder(req: OwnedRequest, folderPath: string): boolean {
  return !scopesToOwner(req) || checkFolderPath(folderPath).ok;
}

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

  // GET /api/rag/folders -- list indexed folders with stats. In team mode a
  // non-admin sees only folders they may read: the paths and document counts of
  // an index over someone else's material are themselves a disclosure.
  const listIndexedFolders = async (req: OwnedRequest, res: Response) => {
    try {
      const folders = await db.all<{ folder_path: string }>(`SELECT * FROM indexed_folders ORDER BY last_indexed DESC`);
      res.json(folders.filter((f) => isVisibleFolder(req, f.folder_path)));
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  };
  router.get('/rag/folders', (req, res) => listIndexedFolders(req as OwnedRequest, res));

  // GET /api/rag/index/status -- get status of all indexed folders (alias)
  router.get('/rag/index/status', (req, res) => listIndexedFolders(req as OwnedRequest, res));

  // DELETE /api/rag/index -- remove a folder from the index. Admin-only in team
  // mode: the index belongs to no one person (see above), so one colleague
  // removing it would remove it for every colleague who searches that folder.
  router.delete('/rag/index', requireAdminOrSolo, async (req, res) => {
    const { folderPath } = req.body as { folderPath: string };
    if (!validateFolderPath(folderPath)) {
      res.status(400).json({ error: 'Valid absolute folder path required' });
      return;
    }
    try {
      await db.run(`DELETE FROM document_chunks WHERE folder_path = ?`, folderPath);
      await db.run(`DELETE FROM indexed_folders WHERE folder_path = ?`, folderPath);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  // POST /api/rag/search -- search indexed chunks (used internally + for preview)
  router.post('/rag/search', async (req, res) => {
    const { query, folderPaths, topK = 10, minScore = 0.1 } = req.body as {
      query: string; folderPaths: string[]; topK?: number; minScore?: number;
    };
    if (typeof query !== 'string' || !query || !Array.isArray(folderPaths) || !folderPaths.length) {
      res.status(400).json({ error: 'query and folderPaths required' });
      return;
    }
    // Not "already scoped by the guard on POST /api/rag/index": chunks indexed
    // before the team-mode storage rule, or while the whitelist was wider, are
    // still in document_chunks. A folder the caller may not read is dropped
    // silently, so it answers exactly like a folder that was never indexed.
    const visible = folderPaths.filter(
      (p): p is string => typeof p === 'string' && isVisibleFolder(req as OwnedRequest, p),
    );
    if (visible.length === 0) {
      res.json([]);
      return;
    }
    try {
      // retrieveChunks is async: without the await this handler serialised a
      // Promise (`{}`) instead of the hits — the missing-await class CLAUDE.md
      // calls out.
      const results = await retrieveChunks(db, query, visible, topK, minScore);
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: safeError(e) });
    }
  });

  return router;
}
