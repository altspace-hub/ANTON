import { Router } from 'express';
import type Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';

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

export function createFolderRoutes(db: Database.Database) {
  const router = Router();

  // POST /api/folders/browse — list directory contents
  router.post('/folders/browse', async (req, res) => {
    try {
      const { path: dirPath } = req.body;
      if (!dirPath || !path.isAbsolute(dirPath)) {
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
  router.post('/folders/register', async (req, res) => {
    try {
      const { path: folderPath, label } = req.body;
      if (!folderPath || !path.isAbsolute(folderPath)) {
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

      db.prepare(
        'INSERT OR REPLACE INTO registered_folders (path, label, file_count, last_indexed) VALUES (?, ?, ?, datetime("now"))'
      ).run(folderPath, label || path.basename(folderPath), fileCount);

      const folder = db.prepare('SELECT * FROM registered_folders WHERE path = ?').get(folderPath);
      res.json(folder);
    } catch (error) {
      res.status(500).json({ error: 'Failed to register folder' });
    }
  });

  // GET /api/folders/registered
  router.get('/folders/registered', (_req, res) => {
    try {
      const folders = db.prepare('SELECT * FROM registered_folders ORDER BY label ASC').all();
      res.json(folders);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch folders' });
    }
  });

  // DELETE /api/folders/registered/:id
  router.delete('/folders/registered/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM registered_folders WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete folder' });
    }
  });

  // POST /api/folders/index — get detailed index of folder contents
  router.post('/folders/index', async (req, res) => {
    try {
      const { path: folderPath, recursive = true, filter } = req.body;
      if (!folderPath || !path.isAbsolute(folderPath)) {
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

      async function scanDir(dirPath: string) {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory() && recursive) {
            await scanDir(fullPath);
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
