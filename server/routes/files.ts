import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { extractTextFromFile } from '../services/text-extractor.js';
import { validateParams } from '../lib/validate.js';
import { FileIdParamSchema } from '../lib/schemas.js';
import { safeError } from '../lib/error-response.js';
import type { DatabaseAdapter } from '../db/database.js';
import { scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';
import {
  accountStoredUsage, isDemoVisitor, overQuota, quotaMessage, storageQuotaFor, UPLOAD_QUOTA_CODE,
} from '../services/rag/demo-storage.js';
import { uploadContentRefusal } from '../services/demo-upload-guard.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
fs.ensureDirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // The id is unguessable (randomUUID: 122 CSPRNG bits) but that is defence in
    // depth, not authorisation — GET /files/:id now checks the file_uploads
    // ownership record written on upload (migration 253). An unguessable id alone
    // is a capability URL, and capability URLs leak through everything that records
    // a URL: browser history, proxy logs, a pasted link, a screenshot.
    const unique = randomUUID();
    cb(null, `${unique}-${file.originalname}`);
  },
});

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const IMAGE_MEDIA_TYPES: Record<string, string> = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
};

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.csv', '.html', ...IMAGE_EXTENSIONS];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  },
});

/*
 * The demo upload quota (a non-admin on DEMO_MODE=true): one visitor must not
 * be able to fill the disk that uploads share with PostgreSQL; the owner is
 * not limited. It is one total over every store an account keeps files in
 * (rag/demo-storage.ts accountStoredUsage): run attachments, Engagement Task
 * files, Knowledge Base documents, project files and Task Agent attachments.
 */

export function createFilesRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // Refused before multer writes anything: what the account already keeps,
  // plus this request's size, must fit. Checked again after the write, when
  // the real size is known (two uploads at once both pass this check).
  const uploadQuotaPrecheck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const quota = storageQuotaFor(req);
    if (!quota) { next(); return; }
    try {
      const used = await accountStoredUsage(db, req.user!.id);
      const incoming = Number(req.headers['content-length']) || 0;
      if (overQuota(quota, used.bytes + incoming, used.files + 1)) {
        res.status(413).json({ error: quotaMessage(quota), code: UPLOAD_QUOTA_CODE });
        return;
      }
      next();
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  };

  // POST /api/files/upload
router.post('/files/upload', uploadQuotaPrecheck, upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  // multer wrote it under UPLOAD_DIR; nothing outside it is read.
  const stored = path.resolve(req.file.path);
  if (!stored.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
    res.status(400).json({ error: 'The upload could not be stored.' });
    return;
  }
  const fileBuffer = await fs.readFile(stored);

  // The content matches the extension, and a ZIP-based file (.docx, .xlsx)
  // does not expand past ZIP_MAX_EXPANSION_RATIO (SEC-09) — for every caller,
  // as before; a demo visitor is also held to the expansion ceiling
  // (services/demo-upload-guard.ts, shared with every upload path).
  const contentRefusal = await uploadContentRefusal(
    { originalname: req.file.originalname, size: req.file.size, path: stored, buffer: fileBuffer },
    { visitor: isDemoVisitor(req) },
  );
  if (contentRefusal) {
    await fs.remove(req.file.path);
    res.status(400).json(contentRefusal);
    return;
  }

  const isImage = IMAGE_EXTENSIONS.has(ext);

  // Record who uploaded this, so GET /files/:id can be an authorisation decision
  // rather than a guess about who holds the id. Recorded BEFORE responding, so the
  // caller can never receive an id whose owner was not written.
  await db.run(
    `INSERT INTO file_uploads (id, original_name, extension, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?)`,
    req.file.filename, req.file.originalname, ext, req.file.size, req.user?.id ?? null,
  );

  // The quota again, now that this file is on disk and on record: counted
  // after the insert, so of several uploads racing past the pre-check none
  // that stays can take the account over the limit.
  const quota = storageQuotaFor(req);
  if (quota) {
    // Fails closed: a quota that cannot be read keeps nothing.
    let refusal: { status: number; body: { error: string; code?: string } } | null = null;
    try {
      const used = await accountStoredUsage(db, req.user!.id);
      if (overQuota(quota, used.bytes, used.files)) refusal = { status: 413, body: { error: quotaMessage(quota), code: UPLOAD_QUOTA_CODE } };
    } catch (err) {
      refusal = { status: 500, body: { error: safeError(err) } };
    }
    if (refusal) {
      await db.run('DELETE FROM file_uploads WHERE id = ?', req.file.filename).catch(() => undefined);
      // multer wrote it into UPLOAD_DIR; remove nothing outside it.
      const stored = path.resolve(req.file.path);
      if (stored.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) await fs.remove(stored).catch(() => undefined);
      res.status(refusal.status).json(refusal.body);
      return;
    }
  }

  // For images: return base64 data for Claude vision API; for documents: extract text
  if (isImage) {
    const mediaType = IMAGE_MEDIA_TYPES[ext] || 'image/png';
    const base64 = fileBuffer.toString('base64');
    res.json({
      id: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      extension: ext,
      isImage: true,
      mediaType,
      base64,
    });
    return;
  }

  // Extract text content from the uploaded file
  let text = '';
  try {
    text = (await extractTextFromFile(req.file.path)) ?? '';
  } catch (err) {
    console.error('[files] Text extraction failed:', err);
  }

  res.json({
    id: req.file.filename,
    originalName: req.file.originalname,
    path: req.file.path,
    size: req.file.size,
    extension: ext,
    text,
  });
});

// GET /api/files/:id
router.get('/files/:id', validateParams(FileIdParamSchema), async (req, res) => {
  // basename() FIRST, so the same value is used for the ownership lookup and for the
  // file read — checking one id and serving another is its own bug. It also makes the
  // join provably a direct child of UPLOAD_DIR rather than relying on the realpath
  // check below to catch traversal after the fact. FileIdParamSchema already rejects
  // slashes, but a bare '..' passes it, and defence that is one regex deep is thin.
  const id = path.basename(String(req.params.id));

  // Ownership is checked BEFORE touching the filesystem, so a caller cannot use
  // response timing or a 403-vs-404 difference to learn whether an id exists.
  if (scopesToOwner(req as OwnedRequest)) {
    const row = await db.get(
      'SELECT uploaded_by FROM file_uploads WHERE id = ?', id,
    ) as { uploaded_by: string | null } | undefined;

    // No row means the file predates the ownership record (migration 253). It is
    // unattributed, not public: on a shared instance it is withheld from non-admins,
    // exactly as ownership.ts treats every other unattributed row. Solo installs and
    // admins skip this branch entirely, so nothing disappears from a single-user
    // machine — the case where breaking existing attachments would be worst.
    if (!row || row.uploaded_by !== (req as OwnedRequest).user?.id) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
  }

  const filePath = path.join(UPLOAD_DIR, id);
  // Existence check before realpath (realpath throws on missing file)
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  // Resolve symlinks then verify the real path stays inside UPLOAD_DIR.
  // Without realpathSync, a symlink could point outside the upload directory.
  let realFilePath: string;
  try {
    realFilePath = fs.realpathSync(filePath);
  } catch {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const realUploadDir = path.resolve(UPLOAD_DIR);
  if (!realFilePath.startsWith(realUploadDir + path.sep) && realFilePath !== realUploadDir) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  res.sendFile(realFilePath);
});

  return router;
}
