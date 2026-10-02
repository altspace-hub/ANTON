/**
 * engagement-uploads.ts — the files an Engagement Task stores (the engagement
 * letter, project plan and good example on POST /:id/documents; a resource on
 * POST /:id/resources), stored and accounted for like every other upload.
 *
 * Before (2026-10-02) the engagement routes had their own multer: any file
 * type, 50 MB each, no count, under UPLOAD_DIR with no ownership record. On a
 * public demo that bypassed the upload quota POST /files/upload enforces
 * (routes/files.ts), and since nothing named the uploader, the daily deletion
 * of an expired demo account (services/demo-retention.ts) never found the
 * files — they would have stayed on disk after the account was gone.
 *
 * Now every engagement upload:
 *   - is written to UPLOAD_DIR as `<uuid>-<safe name>` (the basename is the id);
 *   - gets a file_uploads row (id = that basename, uploaded_by = the caller),
 *     the record demo-retention.ts deletes the file from, the quota sums, and
 *     GET /files/:id authorises the owner by;
 *   - for a demo visitor, counts against DEMO_USER_UPLOAD_MB /
 *     DEMO_USER_UPLOAD_FILES — the one total over every store an account
 *     keeps files in (rag/demo-storage.ts accountStoredUsage) — refused with
 *     413 before anything is written, and checked again once the file is on
 *     record (two uploads racing past the first check cannot keep more than
 *     the quota between them) — and is held to the types the text extractor
 *     reads, with its content checked against its extension and for ZIP
 *     expansion (services/demo-upload-guard.ts, shared with every upload path).
 * Admins and ordinary servers keep the 50 MB limit and any file type.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import type { DatabaseAdapter } from '../db/database.js';
import type { UploadQuota } from '../middleware/demo-mode.js';
import { safeError } from '../lib/error-response.js';
import {
  accountStoredUsage, isDemoVisitor, overQuota, quotaMessage, storageQuotaFor, UPLOAD_QUOTA_CODE,
} from './rag/demo-storage.js';
import { uploadContentRefusal } from './demo-upload-guard.js';

/** Read at call time: index.ts may set UPLOAD_DIR after this module loads. */
export function engagementUploadDir(): string {
  return process.env.UPLOAD_DIR || './uploads';
}

const MAX_BYTES = 50 * 1024 * 1024;

/** What a demo visitor may upload: the types services/text-extractor.ts reads. */
export const VISITOR_UPLOAD_EXTENSIONS: readonly string[] = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.csv', '.html'];

type Caller = { user?: { id?: string; role?: string } | null };

/** The quota that applies to this caller, or null: only a non-admin on a public demo is limited. */
export function engagementUploadQuota(req: Caller): UploadQuota | null {
  return storageQuotaFor({ user: req.user ?? undefined });
}

function visitorUploadRules(req: Caller): boolean {
  return isDemoVisitor({ user: req.user ?? undefined });
}

/** The demo's quota sentence (rag/demo-storage.ts quotaMessage): one limit, worded alike on every path. */
export function uploadQuotaMessage(quota: UploadQuota): string {
  return quotaMessage(quota);
}

/** A file name that can sit in a path: letters, digits, '.', '_' and '-', at most 120 characters, extension kept. */
export function safeStoredName(original: string): string {
  const base = path.basename(String(original ?? '')).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '');
  const ext = path.extname(base).slice(0, 10);
  const stem = base.slice(0, base.length - ext.length).slice(0, 110) || 'file';
  return `${stem}${ext}`;
}

class UploadRefusal extends Error {
  constructor(readonly status: number, readonly body: { error: string; code?: string }) { super(body.error); }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = engagementUploadDir();
    fs.ensureDir(dir).then(() => cb(null, dir), (err: Error) => cb(err, dir));
  },
  filename: (_req, file, cb) => cb(null, `${randomUUID()}-${safeStoredName(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!visitorUploadRules(req as Caller)) { cb(null, true); return; }
    const ext = path.extname(file.originalname).toLowerCase();
    if (VISITOR_UPLOAD_EXTENSIONS.includes(ext)) { cb(null, true); return; }
    cb(new UploadRefusal(400, {
      error: `This file type (${ext || 'none'}) cannot be uploaded here. Use one of: ${VISITOR_UPLOAD_EXTENSIONS.join(', ')}.`,
      code: 'UNSUPPORTED_FILE_TYPE',
    }));
  },
}).single('file');

/** Removes a file multer wrote, and nothing outside UPLOAD_DIR. */
async function removeStored(filePath: string | undefined): Promise<void> {
  if (!filePath) return;
  const stored = path.resolve(filePath);
  if (stored.startsWith(path.resolve(engagementUploadDir()) + path.sep)) await fs.remove(stored).catch(() => undefined);
}

/**
 * The upload middleware for an engagement route: the quota pre-check, then
 * multer (one field named `file`, optional — a URL or text resource has none),
 * then, when a file came in, the visitor content checks and the file_uploads
 * record with the quota re-check. Any refusal is a JSON answer and leaves
 * nothing on disk or on record. On success req.file is the stored file.
 */
export function engagementUploadMiddleware(db: DatabaseAdapter): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const quota = engagementUploadQuota(req);
      const userId = req.user?.id ?? null;
      // Refused before multer writes anything: what the account keeps, plus
      // this request's size, must fit. A request without a file body (a URL
      // or a note) carries no multipart content and is not counted as a file.
      if (quota && userId && /multipart\/form-data/i.test(String(req.headers['content-type'] ?? ''))) {
        const used = await accountStoredUsage(db, userId);
        const incoming = Number(req.headers['content-length']) || 0;
        if (overQuota(quota, used.bytes + incoming, used.files + 1)) {
          res.status(413).json({ error: uploadQuotaMessage(quota), code: UPLOAD_QUOTA_CODE });
          return;
        }
      }

      const multerError = await new Promise<unknown>((resolve) => { upload(req, res, (err?: unknown) => resolve(err ?? null)); });
      if (multerError) {
        await removeStored(req.file?.path);
        if (multerError instanceof UploadRefusal) { res.status(multerError.status).json(multerError.body); return; }
        if (multerError instanceof multer.MulterError) {
          const tooBig = multerError.code === 'LIMIT_FILE_SIZE';
          res.status(tooBig ? 413 : 400).json({
            error: tooBig ? `The file is larger than ${MAX_BYTES / (1024 * 1024)} MB.` : 'The upload could not be read.',
            code: tooBig ? 'FILE_TOO_LARGE' : 'UPLOAD_INVALID',
          });
          return;
        }
        res.status(500).json({ error: safeError(multerError) });
        return;
      }

      const file = req.file;
      if (!file) { next(); return; }

      if (visitorUploadRules(req)) {
        const refusal = await uploadContentRefusal(file, { visitor: true });
        if (refusal) {
          await removeStored(file.path);
          res.status(400).json(refusal);
          return;
        }
      }

      // The ownership record before anything else can name the file: the
      // daily demo deletion and the quota both read it.
      await db.run(
        'INSERT INTO file_uploads (id, original_name, extension, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)',
        file.filename, file.originalname, path.extname(file.originalname).toLowerCase(), file.size, userId,
      );

      if (quota && userId) {
        // Fails closed: a quota that cannot be read keeps nothing.
        let refusal: { status: number; body: { error: string; code?: string } } | null = null;
        try {
          const used = await accountStoredUsage(db, userId);
          if (overQuota(quota, used.bytes, used.files)) refusal = { status: 413, body: { error: uploadQuotaMessage(quota), code: UPLOAD_QUOTA_CODE } };
        } catch (err) {
          refusal = { status: 500, body: { error: safeError(err) } };
        }
        if (refusal) {
          await db.run('DELETE FROM file_uploads WHERE id = ?', file.filename).catch(() => undefined);
          await removeStored(file.path);
          res.status(refusal.status).json(refusal.body);
          return;
        }
      }
      next();
    })().catch(async (err: unknown) => {
      await removeStored(req.file?.path);
      if (req.file) await db.run('DELETE FROM file_uploads WHERE id = ?', req.file.filename).catch(() => undefined);
      if (!res.headersSent) res.status(500).json({ error: safeError(err) });
    });
  };
}

/**
 * Keeps the ownership record in step when a route renames a stored file (the
 * extract routes add a missing extension to files uploaded before names kept
 * theirs). Never throws.
 */
export async function renameUploadRecord(db: DatabaseAdapter, oldPath: string, newPath: string): Promise<void> {
  await db.run('UPDATE file_uploads SET id = ? WHERE id = ?', path.basename(newPath), path.basename(oldPath)).catch(() => undefined);
}
