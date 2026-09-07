import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import { indexFolder } from '../services/rag/indexer.js';
import { checkFolderPath } from '../lib/folder-guard.js';
import { safeError } from '../lib/error-response.js';

export async function createKnowledgeLibraryRoutes(db: DatabaseAdapter) {
  const router = Router();

  // GET /api/knowledge-library — list all entries
  router.get('/knowledge-library', async (_req, res) => {
    try {
      const entries = await db.all(`SELECT * FROM knowledge_library ORDER BY label ASC`) as Record<string, unknown>[];
      res.json(entries.map(e => ({
        ...e,
        recursive: Boolean(e.recursive),
        file_filter: e.file_filter ? JSON.parse(e.file_filter as string) : null,
      })));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch knowledge library' });
    }
  });

  // POST /api/knowledge-library — create entry
  router.post('/knowledge-library', async (req, res) => {
    try {
      const { label, path: entryPath, category, recursive, file_filter, description } = req.body as {
        label: string;
        path: string;
        category?: string;
        recursive?: boolean;
        file_filter?: string[];
        description?: string;
      };
      if (!label?.trim()) return res.status(400).json({ error: 'label is required' });
      if (!entryPath?.trim()) return res.status(400).json({ error: 'path is required' });
      // The path is read from the request body and is later handed to
      // indexFolder(), which recurses it and writes every document into
      // document_chunks — from where POST /api/rag/search returns it. existsSync
      // is not an authorisation check: enforce the same ALLOWED_FOLDER_PATHS
      // whitelist the folder browser uses (CLAUDE.md pattern 6).
      const guard = checkFolderPath(entryPath);
      if (!guard.ok) return res.status(403).json({ error: guard.error });
      if (!fs.existsSync(guard.resolved)) return res.status(400).json({ error: `Path does not exist: ${entryPath}` });

      const id = randomUUID();
      const now = new Date().toISOString();
      await db.run(`
        INSERT INTO knowledge_library (id, label, path, category, recursive, file_filter, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, 
        id, label.trim(), entryPath.trim(),
        category || 'other',
        recursive !== false ? 1 : 0,
        file_filter ? JSON.stringify(file_filter) : null,
        description || '',
        now, now,
      );
      const created = await db.get(`SELECT * FROM knowledge_library WHERE id = ?`, id) as Record<string, unknown>;
      res.status(201).json({ ...created, recursive: Boolean(created.recursive), file_filter: created.file_filter ? JSON.parse(created.file_filter as string) : null });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create knowledge library entry' });
    }
  });

  // PATCH /api/knowledge-library/:id — update metadata
  router.patch('/knowledge-library/:id', async (req, res) => {
    try {
      const existing = await db.get(`SELECT * FROM knowledge_library WHERE id = ?`, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const { label, category, description, recursive, file_filter } = req.body as Record<string, unknown>;
      const now = new Date().toISOString();
      await db.run(`
        UPDATE knowledge_library
        SET label = COALESCE(?, label),
            category = COALESCE(?, category),
            description = COALESCE(?, description),
            recursive = COALESCE(?, recursive),
            file_filter = COALESCE(?, file_filter),
            updated_at = ?
        WHERE id = ?
      `, 
        label || null,
        category || null,
        description ?? null,
        recursive !== undefined ? (recursive ? 1 : 0) : null,
        file_filter ? JSON.stringify(file_filter) : null,
        now, req.params.id,
      );
      const updated = await db.get(`SELECT * FROM knowledge_library WHERE id = ?`, req.params.id) as Record<string, unknown>;
      res.json({ ...updated, recursive: Boolean(updated.recursive), file_filter: updated.file_filter ? JSON.parse(updated.file_filter as string) : null });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update knowledge library entry' });
    }
  });

  // DELETE /api/knowledge-library/:id — hard delete
  router.delete('/knowledge-library/:id', async (req, res) => {
    try {
      const result = await db.run(`DELETE FROM knowledge_library WHERE id = ?`, req.params.id);
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete knowledge library entry' });
    }
  });

  // POST /api/knowledge-library/:id/index — trigger BM25 indexing
  router.post('/knowledge-library/:id/index', async (req, res) => {
    try {
      const entry = await db.get(`SELECT * FROM knowledge_library WHERE id = ?`, req.params.id) as Record<string, unknown> | undefined;
      if (!entry) return res.status(404).json({ error: 'Not found' });
      const folderPath = entry.path as string;
      // Re-check on every index, not just at create time: rows written before
      // this guard existed (or while ALLOWED_FOLDER_PATHS was wider) must not
      // become a standing licence to re-read a folder that is now out of scope.
      const guard = checkFolderPath(folderPath);
      if (!guard.ok) return res.status(403).json({ error: guard.error });
      if (!fs.existsSync(folderPath)) return res.status(400).json({ error: `Path does not exist: ${folderPath}` });

      const result = await indexFolder(db, folderPath);

      const chunkData = await db.get(`SELECT SUM(LENGTH(chunk_text)) as total_chars FROM document_chunks WHERE folder_path = ?`, folderPath) as { total_chars: number } | undefined;
      const wordCount = Math.round((chunkData?.total_chars || 0) / 5);

      const now = new Date().toISOString();
      await db.run(`UPDATE knowledge_library SET indexed_at = ?, file_count = ?, word_count = ?, updated_at = ? WHERE id = ?`, now, result.documents, wordCount, now, req.params.id);

      const updated = await db.get(`SELECT * FROM knowledge_library WHERE id = ?`, req.params.id) as Record<string, unknown>;
      res.json({ ...updated, recursive: Boolean(updated.recursive), file_filter: updated.file_filter ? JSON.parse(updated.file_filter as string) : null, chunks: result.chunks });
    } catch (error) {
      const msg = safeError(error);
      res.status(500).json({ error: msg });
    }
  });

  // GET /api/knowledge-library/:id/status — file/chunk counts
  router.get('/knowledge-library/:id/status', async (req, res) => {
    try {
      const entry = await db.get(`SELECT * FROM knowledge_library WHERE id = ?`, req.params.id) as Record<string, unknown> | undefined;
      if (!entry) return res.status(404).json({ error: 'Not found' });
      const chunkCount = (await db.get(`SELECT COUNT(*) as c FROM document_chunks WHERE folder_path = ?`, entry.path) as { c: number }).c;
      res.json({ indexed_at: entry.indexed_at, file_count: entry.file_count, word_count: entry.word_count, chunk_count: chunkCount });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  return router;
}
