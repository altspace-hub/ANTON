import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { randomUUID } from 'crypto';
import { getProjectWorkspace } from '../services/workspace.js';

export async function createProjectFilesRoutes(db: DatabaseAdapter) {
  const router = Router();

  // Configure multer for project-scoped uploads
  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      // Destination is set per-request in the route handler
      cb(null, './uploads'); // fallback — overridden below
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const safeName = file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 200);
      cb(null, `${Date.now()}_${safeName}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });

  // GET /api/projects/:id/files — list project files
  router.get('/projects/:id/files', async (req, res) => {
    try {
      const files = await db.all(
        'SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at DESC'
      , req.params.id);
      res.json(files);
    } catch (err) {
      console.error('[project-files] list error:', err);
      res.status(500).json({ error: 'Failed to list files' });
    }
  });

  // POST /api/projects/:id/files — upload file(s)
  router.post('/projects/:id/files', upload.array('files', 20), async (req, res) => {
    try {
      const projectId = req.params.id as string;

      // Verify project exists
      const project = await db.get('SELECT id, name, workspace_path FROM projects WHERE id = ?', projectId) as { id: string; name: string; workspace_path: string } | undefined;
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Get workspace uploads dir
      const workspace = await getProjectWorkspace(projectId);
      await fs.ensureDir(workspace.uploads);

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      const userId = (req as unknown as { user?: { id?: string; display_name?: string } }).user?.id ?? 'default';
      const inserted: Array<Record<string, unknown>> = [];

      for (const file of files) {
        // Move file from temp upload to project workspace
        const destPath = path.join(workspace.uploads, file.filename);
        await fs.move(file.path, destPath, { overwrite: true });

        const fileId = randomUUID();
        const ext = path.extname(file.originalname).toLowerCase();

        await db.run(`
          INSERT INTO project_files (id, project_id, filename, original_name, file_path, file_size, mime_type, extension, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, 
          fileId,
          projectId,
          file.filename,
          file.originalname,
          destPath,
          file.size,
          file.mimetype,
          ext,
          userId
        );

        inserted.push({
          id: fileId,
          project_id: projectId,
          filename: file.filename,
          original_name: file.originalname,
          file_path: destPath,
          file_size: file.size,
          mime_type: file.mimetype,
          extension: ext,
          uploaded_by: userId,
        });
      }

      // Auto-register as knowledge source folder if not already registered
      const existing = await db.get('SELECT id FROM registered_folders WHERE path = ?'
      , workspace.uploads);
      if (!existing) {
        await db.run('INSERT INTO registered_folders (path, label, file_count, project_id) VALUES (?, ?, ?, ?)'
        , 
          workspace.uploads,
          `Project: ${project.name}`,
          inserted.length,
          projectId
        );
        console.log(`[project-files] Auto-registered folder as knowledge source: ${workspace.uploads}`);
      } else {
        // Update file count
        const totalFiles = await db.get('SELECT COUNT(*) as c FROM project_files WHERE project_id = ?'
        , projectId) as { c: number };
        await db.run('UPDATE registered_folders SET file_count = ? WHERE path = ?'
        , totalFiles.c, workspace.uploads);
      }

      res.json(inserted);
    } catch (err) {
      console.error('[project-files] upload error:', err);
      res.status(500).json({ error: 'Failed to upload files' });
    }
  });

  // GET /api/projects/:id/files/:fileId/download — download file
  router.get('/projects/:id/files/:fileId/download', async (req, res) => {
    try {
      const file = await db.get('SELECT * FROM project_files WHERE id = ? AND project_id = ?'
      , req.params.fileId, req.params.id) as { file_path: string; original_name: string } | undefined;

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Path traversal protection
      const resolvedPath = path.resolve(file.file_path);
      const workspacesRoot = path.resolve(process.env.WORKSPACES_DIR || './workspaces');
      if (!resolvedPath.startsWith(workspacesRoot)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.download(resolvedPath, file.original_name);
    } catch (err) {
      console.error('[project-files] download error:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });

  // DELETE /api/projects/:id/files/:fileId — delete file
  router.delete('/projects/:id/files/:fileId', async (req, res) => {
    try {
      const file = await db.get(
        'SELECT * FROM project_files WHERE id = ? AND project_id = ?'
      , req.params.fileId, req.params.id) as { id: string; file_path: string; project_id: string } | undefined;

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Delete from disk
      try {
        await fs.remove(file.file_path);
      } catch {
        // File may already be gone
      }

      // Delete from DB
      await db.run('DELETE FROM project_files WHERE id = ?', file.id);

      // Update registered folder file count
      const workspace = await getProjectWorkspace(file.project_id);
      const totalFiles = await db.get('SELECT COUNT(*) as c FROM project_files WHERE project_id = ?'
      , file.project_id) as { c: number };
      await db.run('UPDATE registered_folders SET file_count = ? WHERE path = ?'
      , totalFiles.c, workspace.uploads);

      res.json({ ok: true });
    } catch (err) {
      console.error('[project-files] delete error:', err);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  });

  return router;
}
