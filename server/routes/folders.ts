import { Router } from 'express';
import type Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { validate } from '../lib/validate.js';
import { FolderBrowseSchema, FolderRegisterSchema, FolderIndexSchema } from '../lib/schemas.js';

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.csv', '.html'];

/** Resolve the list of allowed base directories from the environment. */
function getAllowedBases(): string[] {
  const raw = process.env.ALLOWED_FOLDER_PATHS || './uploads,./outputs';
  return raw.split(',').map(p => path.resolve(p.trim()));
}

/** Return true if the resolved path is within one of the allowed bases. */
function isPathAllowed(resolvedPath: string): boolean {
  return getAllowedBases().some(
    base => resolvedPath === base || resolvedPath.startsWith(base + path.sep)
  );
}

function getUserId(req: unknown): string {
  return (req as { user?: { id?: string } }).user?.id ?? 'default';
}

export function createFolderRoutes(db: Database.Database) {
  const router = Router();

  // POST /api/folders/browse — list directory contents
  router.post('/folders/browse', validate(FolderBrowseSchema), async (req, res) => {
    try {
      const { path: dirPath } = req.body as { path: string };
      if (!path.isAbsolute(dirPath)) {
        res.status(400).json({ error: 'Absolute path required' });
        return;
      }

      if (!isPathAllowed(path.resolve(dirPath))) {
        res.status(403).json({ error: 'Path outside allowed directories' });
        return;
      }

      if (!await fs.pathExists(dirPath)) {
        res.status(404).json({ error: 'Path not found' });
        return;
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const items = entries
        .filter(e => !e.name.startsWith('.'))
        .map(e => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          isDirectory: e.isDirectory(),
          extension: e.isFile() ? path.extname(e.name).toLowerCase() : null,
          isSupported: e.isFile() ? SUPPORTED_EXTENSIONS.includes(path.extname(e.name).toLowerCase()) : null,
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      res.json({ path: dirPath, items });
    } catch (error) {
      res.status(500).json({ error: 'Failed to browse folder' });
    }
  });

  // POST /api/folders/register — save a folder
  router.post('/folders/register', validate(FolderRegisterSchema), async (req, res) => {
    try {
      const { path: folderPath, label } = req.body as { path: string; label?: string };
      if (!path.isAbsolute(folderPath)) {
        res.status(400).json({ error: 'Absolute path required' });
        return;
      }

      if (!isPathAllowed(path.resolve(folderPath))) {
        res.status(403).json({ error: 'Path outside allowed directories' });
        return;
      }

      if (!await fs.pathExists(folderPath)) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }

      // Count supported files
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      const fileCount = entries.filter(
        e => e.isFile() && SUPPORTED_EXTENSIONS.includes(path.extname(e.name).toLowerCase())
      ).length;

      const userId = getUserId(req);
      db.prepare(
        'INSERT OR REPLACE INTO registered_folders (path, label, file_count, last_indexed, user_id) VALUES (?, ?, ?, datetime("now"), ?)'
      ).run(folderPath, label || path.basename(folderPath), fileCount, userId);

      const folder = db.prepare('SELECT * FROM registered_folders WHERE path = ? AND user_id = ?').get(folderPath, userId);
      res.json(folder);
    } catch (error) {
      res.status(500).json({ error: 'Failed to register folder' });
    }
  });

  // GET /api/folders/registered
  router.get('/folders/registered', (req, res) => {
    try {
      const userId = getUserId(req);
      const folders = db.prepare('SELECT * FROM registered_folders WHERE user_id = ? ORDER BY label ASC').all(userId);
      res.json(folders);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch folders' });
    }
  });

  // DELETE /api/folders/registered/:id
  router.delete('/folders/registered/:id', (req, res) => {
    try {
      const userId = getUserId(req);
      db.prepare('DELETE FROM registered_folders WHERE id = ? AND user_id = ?').run(req.params.id, userId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete folder' });
    }
  });

  // POST /api/folders/index — get detailed index of folder contents
  router.post('/folders/index', validate(FolderIndexSchema), async (req, res) => {
    try {
      const { path: folderPath, recursive = true, filter } = req.body as { path: string; recursive: boolean; filter?: string[] };
      if (!path.isAbsolute(folderPath)) {
        res.status(400).json({ error: 'Absolute path required' });
        return;
      }

      if (!isPathAllowed(path.resolve(folderPath))) {
        res.status(403).json({ error: 'Path outside allowed directories' });
        return;
      }

      const extensions = filter || SUPPORTED_EXTENSIONS;
      const files: Array<{
        name: string;
        path: string;
        extension: string;
        sizeBytes: number;
        lastModified: string;
      }> = [];

      const MAX_DEPTH = 20;
      async function scanDir(dirPath: string, depth = 0) {
        if (depth > MAX_DEPTH) return;
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory() && recursive) {
            await scanDir(fullPath, depth + 1);
          } else if (entry.isFile() && extensions.includes(path.extname(entry.name).toLowerCase())) {
            const stat = await fs.stat(fullPath);
            files.push({
              name: entry.name,
              path: fullPath,
              extension: path.extname(entry.name).toLowerCase(),
              sizeBytes: stat.size,
              lastModified: stat.mtime.toISOString(),
            });
          }
        }
      }

      await scanDir(folderPath);

      const totalSize = files.reduce((sum, f) => sum + f.sizeBytes, 0);
      const estimatedWords = Math.round(totalSize / 6); // Rough estimate
      const estimatedTokens = Math.round(estimatedWords * 1.3);

      res.json({
        folderPath,
        files,
        totalFiles: files.length,
        totalWords: estimatedWords,
        totalTokenEstimate: estimatedTokens,
        extensions: [...new Set(files.map(f => f.extension))],
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to index folder' });
    }
  });

  return router;
}
