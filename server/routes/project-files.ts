import { Router, Request, Response, NextFunction, type RequestHandler } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { randomUUID } from 'crypto';
import { getProjectWorkspace } from '../services/workspace.js';
import { scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';
import { safeError, publicErrorMessage } from '../lib/error-response.js';
import {
  isDemoVisitor, quotaRefusal, removeFileInside, workspacesRoot, isInside,
} from '../services/rag/demo-storage.js';
import { demoVisitorUploadRefusal } from '../services/demo-upload-guard.js';

/**
 * Project files: stored in WORKSPACES_DIR/<project id>/uploads, listed in
 * project_files. Sessions filed under the project read the newest ten with
 * each answer (routes/claude.ts), so on a public demo they go to the model
 * with the visitor's question.
 *
 * Public demo (DEMO_MODE=true), for a non-admin: the files count toward the
 * one account quota with run attachments and Knowledge Base documents
 * (rag/demo-storage.ts accountStoredUsage), only document and image types
 * are taken, and each file's content must match its extension and a
 * .docx/.xlsx must not expand past the ZIP limit (services/demo-upload-guard.ts)
 * — checked in the staging folder, before the file is kept: a session filed
 * under the project extracts it with every answer. demo-retention removes an
 * expired account's workspaces (removeAccountStoredFiles).
 */

/** What a demo visitor may store in a project: the types a run can read. */
const DEMO_ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.xls', '.csv', '.html',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
]);
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** A refusal written for the person uploading (multer passes it to next()); shown in production too. */
class UploadRefused extends Error {
  readonly publicMessage: string;
  constructor(text: string) {
    super(text);
    this.publicMessage = text;
  }
}

/** Where multer writes before the file is moved into the project's workspace. */
function stagingDir(): string {
  return path.resolve(process.env.UPLOAD_DIR || './uploads');
}

export async function createProjectFilesRoutes(db: DatabaseAdapter) {
  const router = Router();

  // ── Team-mode membership gate ──────────────────────────────────────────────────
  // Project files are addressed by :id (the project). Require membership here so
  // files can't be listed / uploaded / downloaded / deleted cross-tenant by UUID
  // (round-2 finding #21). No-op in solo mode / for admins.
  // A non-member gets 404, like a project that does not exist: the 403 this
  // answered confirmed the id, which projects.ts and project-collaboration.ts
  // no longer do (see ownership.ts).
  router.param('id', async (req: Request, res: Response, next: NextFunction, id: string) => {
    try {
      if (!scopesToOwner(req)) return next();
      const user = (req as { user?: { id?: string; role?: string } }).user;
      const member = await db.get(
        'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?', String(id), user?.id ?? 'solo',
      );
      if (!member) { res.status(404).json({ error: 'Project not found' }); return; }
      next();
    } catch (err) {
      next(err);
    }
  });

  // Configure multer for project-scoped uploads
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      // Staged in UPLOAD_DIR, then moved into the project's workspace below.
      try {
        const dir = stagingDir();
        fs.ensureDirSync(dir);
        cb(null, dir);
      } catch (err) {
        cb(err as Error, '');
      }
    },
    filename: (_req, file, cb) => {
      const safeName = file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 200);
      cb(null, `${Date.now()}_${randomUUID().slice(0, 8)}_${safeName}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_BYTES },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (isDemoVisitor(req as OwnedRequest) && !DEMO_ALLOWED_EXTENSIONS.has(ext)) {
        cb(new UploadRefused(`File type ${ext || '(none)'} is not taken in this demo. Allowed: ${[...DEMO_ALLOWED_EXTENSIONS].join(', ')}`));
        return;
      }
      cb(null, true);
    },
  });

  /** Runs multer and answers its refusals as JSON the page can show. */
  const receive: RequestHandler = (req, res, next) => {
    upload.array('files', 20)(req, res, (err?: unknown) => {
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

  /** Refused before multer writes anything: the account's files plus this request must fit the demo quota. */
  const quotaPrecheck: RequestHandler = async (req, res, next) => {
    try {
      const refusal = await quotaRefusal(db, req as OwnedRequest, Number(req.headers['content-length']) || 0, 1);
      if (refusal) { res.status(413).json(refusal); return; }
      next();
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  };

  // GET /api/projects/:id/files — list project files
  router.get('/projects/:id/files', async (req, res) => {
    try {
      const files = await db.all<Record<string, unknown>>(
        'SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at DESC'
      , req.params.id);
      // The server path stays on the server for a team non-admin.
      res.json(scopesToOwner(req as OwnedRequest) ? files.map(({ file_path: _omit, ...f }) => f) : files);
    } catch (err) {
      console.error('[project-files] list error:', err instanceof Error ? err.message : 'error');
      res.status(500).json({ error: 'Failed to list files' });
    }
  });

  // POST /api/projects/:id/files — upload file(s)
  router.post('/projects/:id/files', quotaPrecheck, receive, async (req, res) => {
    const files: Express.Multer.File[] = Array.isArray(req.files) ? req.files : [];
    const staging = stagingDir();
    const discardStaged = async () => { for (const f of files) await removeFileInside(staging, f.path).catch(() => false); };
    try {
      const projectId = req.params.id as string;

      // Verify project exists
      const project = await db.get('SELECT id, name FROM projects WHERE id = ?', projectId) as { id: string; name: string } | undefined;
      if (!project) {
        await discardStaged();
        return res.status(404).json({ error: 'Project not found' });
      }

      if (files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      // A demo visitor's files: the content matches the extension and nothing
      // expands past the ZIP limit, before anything is kept.
      const content = await demoVisitorUploadRefusal(req as OwnedRequest, files);
      if (content) {
        await discardStaged();
        return res.status(400).json(content);
      }

      // The demo quota with the real sizes, before anything is kept.
      const refusal = await quotaRefusal(db, req as OwnedRequest, files.reduce((sum, f) => sum + f.size, 0), files.length);
      if (refusal) {
        await discardStaged();
        return res.status(413).json(refusal);
      }

      // Get workspace uploads dir
      const workspace = await getProjectWorkspace(projectId);
      await fs.ensureDir(workspace.uploads);

      const userId = (req as unknown as { user?: { id?: string; display_name?: string } }).user?.id ?? 'default';
      const inserted: Array<Record<string, unknown>> = [];
      const kept: Array<{ id: string; path: string }> = [];

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
        kept.push({ id: fileId, path: destPath });

        inserted.push({
          id: fileId,
          project_id: projectId,
          filename: file.filename,
          original_name: file.originalname,
          file_size: file.size,
          mime_type: file.mimetype,
          extension: ext,
          uploaded_by: userId,
        });
      }

      // The quota again, now that the files are on record: of uploads racing
      // past the earlier checks, none that stays takes the account over it.
      const late = await quotaRefusal(db, req as OwnedRequest, 0, 0);
      if (late) {
        for (const k of kept) {
          await db.run('DELETE FROM project_files WHERE id = ?', k.id).catch(() => undefined);
          await removeFileInside(workspacesRoot(), k.path).catch(() => false);
        }
        return res.status(413).json(late);
      }

      // Auto-register as knowledge source folder if not already registered.
      // A team non-admin's entry carries their id, so it is theirs (and goes
      // with their account); otherwise the shared 'default' as before.
      const existing = await db.get('SELECT id FROM registered_folders WHERE path = ?'
      , workspace.uploads);
      if (!existing) {
        const folderOwner = scopesToOwner(req as OwnedRequest) ? userId : 'default';
        await db.run('INSERT INTO registered_folders (path, label, file_count, project_id, user_id) VALUES (?, ?, ?, ?, ?)'
        ,
          workspace.uploads,
          `Project: ${project.name}`,
          inserted.length,
          projectId,
          folderOwner
        );
      } else {
        // Update file count
        const totalFiles = await db.get('SELECT COUNT(*) as c FROM project_files WHERE project_id = ?'
        , projectId) as { c: number };
        await db.run('UPDATE registered_folders SET file_count = ? WHERE path = ?'
        , totalFiles.c, workspace.uploads);
      }

      res.json(inserted);
    } catch (err) {
      await discardStaged();
      console.error('[project-files] upload error:', err instanceof Error ? err.message : 'error');
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

      // Path traversal protection: only a file inside WORKSPACES_DIR.
      if (!isInside(workspacesRoot(), file.file_path)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.download(path.resolve(file.file_path), file.original_name);
    } catch (err) {
      console.error('[project-files] download error:', err instanceof Error ? err.message : 'error');
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

      // Delete from disk: only inside WORKSPACES_DIR, whatever the row says.
      try {
        await removeFileInside(workspacesRoot(), file.file_path);
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
      console.error('[project-files] delete error:', err instanceof Error ? err.message : 'error');
      res.status(500).json({ error: 'Failed to delete file' });
    }
  });

  return router;
}
