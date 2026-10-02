/**
 * demo-storage.ts — what one account keeps on disk through the Knowledge Base
 * (collections and their documents) and Projects (project files), for the
 * public demo's upload quota and for deleting an account (2026-10-02).
 *
 * Four stores hold a visitor's files:
 *   - file_uploads    — attachments to a run (routes/files.ts) and Engagement
 *                       Task files (services/engagement-uploads.ts), in UPLOAD_DIR;
 *   - rag_documents   — Knowledge Base documents (routes/documents.ts), in
 *                       UPLOAD_DIR/rag-documents (ragUploadDir);
 *   - project_files   — files of a project (routes/project-files.ts), in
 *                       WORKSPACES_DIR/<project id>/uploads (workspacesRoot);
 *   - anton_tasks.task_files — Task Agent attachments (routes/task-agent.ts):
 *                       the extracted text, kept on the task.
 * One demo quota (DEMO_USER_UPLOAD_MB / DEMO_USER_UPLOAD_FILES) covers all
 * four: accountStoredUsage sums them, and every upload path checks it.
 * What a file's content may be is checked by services/demo-upload-guard.ts.
 *
 * removeAccountStoredFiles deletes, for one account, the Knowledge Base and
 * project files on disk and the rows that list them. demo-retention.ts calls
 * it before its generic owner pass: that pass deletes rag_documents,
 * knowledge_collections and projects by owner column, but not the files the
 * rows point at, and a collection's CASCADE would also take documents someone
 * else put in it while leaving their files behind.
 *
 * Paths: a file is removed only when it resolves inside its store's root, and
 * a project workspace only when the project id is a plain directory name
 * directly under WORKSPACES_DIR. Logs carry counts, never an id or a name.
 */
import path from 'node:path';
import fs from 'fs-extra';
import type { DatabaseAdapter } from '../../db/database.js';
import type { EmbeddingAdapter } from '../embedding-adapter.js';
import { getEmbeddingAdapter } from '../embedding-adapter.js';
import { isDemoMode, demoUserUploadQuota, type UploadQuota } from '../../middleware/demo-mode.js';
import { RAG_CHUNK_CONTENT_TYPE } from './chunk-embedder.js';

type Env = Record<string, string | undefined>;

interface RequestLike {
  user?: { id?: string; role?: string };
}

// ── Where the files live ─────────────────────────────────────────────────────

/** UPLOAD_DIR/rag-documents: where Knowledge Base documents are stored. Default ./uploads/rag-documents (as before). */
export function ragUploadDir(env: Env = process.env): string {
  return path.resolve(env.UPLOAD_DIR || './uploads', 'rag-documents');
}

/** WORKSPACES_DIR: a project's files are in <root>/<project id>/uploads (services/workspace.ts). */
export function workspacesRoot(env: Env = process.env): string {
  return path.resolve(env.WORKSPACES_DIR || './workspaces');
}

/** True when `candidate` resolves to a path strictly inside `root`. */
export function isInside(root: string, candidate: string): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  const r = path.resolve(root);
  const c = path.resolve(candidate);
  return c.startsWith(r + path.sep);
}

/** Removes one file when it lies inside `root`. True when something was removed. */
export async function removeFileInside(root: string, filePath: string | null | undefined): Promise<boolean> {
  if (!filePath || !isInside(root, filePath)) return false;
  const resolved = path.resolve(filePath);
  if (!(await fs.pathExists(resolved))) return false;
  await fs.remove(resolved);
  return true;
}

/** A project id that can name a workspace directory: server-generated UUIDs, never '.', '..' or a path. */
const PLAIN_ID = /^[A-Za-z0-9_-]+$/;

/** Removes WORKSPACES_DIR/<projectId>. True when a directory was removed. */
export async function removeProjectWorkspaceDir(root: string, projectId: string): Promise<boolean> {
  const id = String(projectId ?? '');
  if (!PLAIN_ID.test(id) || path.basename(id) !== id) return false;
  const base = path.resolve(root);
  const dir = path.join(base, id);
  if (path.dirname(dir) !== base) return false;
  if (!(await fs.pathExists(dir))) return false;
  await fs.remove(dir);
  return true;
}

// ── Who is a visitor ─────────────────────────────────────────────────────────

/** A non-admin on a public demo (DEMO_MODE=true): held to the quota, the caps and keyword-only search. */
export function isDemoVisitor(req: RequestLike, env: Env = process.env): boolean {
  return isDemoMode(env) && !!req.user && req.user.role !== 'admin';
}

// ── The upload quota ─────────────────────────────────────────────────────────

/** The quota that applies to this caller, or null: a demo visitor only, and only when a cap is set. */
export function storageQuotaFor(req: RequestLike, env: Env = process.env): UploadQuota | null {
  if (!isDemoVisitor(req, env)) return null;
  const quota = demoUserUploadQuota(env);
  return quota.maxBytes > 0 || quota.maxFiles > 0 ? quota : null;
}

/**
 * A task's attachments (anton_tasks.task_files, a JSON array of
 * {size, text, ...}): routes/task-agent.ts keeps the extracted text on the
 * task, not the file, and each counts at the size uploaded. Params: the user id.
 */
const TASK_ATTACHMENTS = `SELECT COALESCE(SUM(COALESCE((f->>'size')::bigint, 0)), 0) AS bytes, COUNT(f) AS files
  FROM anton_tasks t
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN t.task_files IS NULL OR t.task_files = '' THEN '[]'::jsonb ELSE t.task_files::jsonb END
  ) AS f
  WHERE t.user_id = ?`;

/**
 * What an account keeps in every store: run attachments and Engagement Task
 * files (file_uploads), Knowledge Base documents, project files and Task
 * Agent attachments. One demo quota (DEMO_USER_UPLOAD_MB /
 * DEMO_USER_UPLOAD_FILES) is checked against this sum on every upload path,
 * so it is one total, not one per store. One query, one parameter array.
 */
export async function accountStoredUsage(db: DatabaseAdapter, userId: string): Promise<{ bytes: number; files: number }> {
  const row = await db.get<{ bytes: string | number | null; files: string | number | null }>(
    `SELECT
       (SELECT COALESCE(SUM(size_bytes), 0) FROM file_uploads WHERE uploaded_by = ?)
     + (SELECT COALESCE(SUM(file_size), 0) FROM rag_documents WHERE uploaded_by = ?)
     + (SELECT COALESCE(SUM(file_size), 0) FROM project_files WHERE uploaded_by = ?)
     + (SELECT ta.bytes FROM (${TASK_ATTACHMENTS}) ta) AS bytes,
       (SELECT COUNT(*) FROM file_uploads WHERE uploaded_by = ?)
     + (SELECT COUNT(*) FROM rag_documents WHERE uploaded_by = ?)
     + (SELECT COUNT(*) FROM project_files WHERE uploaded_by = ?)
     + (SELECT ta.files FROM (${TASK_ATTACHMENTS}) ta) AS files`,
    [userId, userId, userId, userId, userId, userId, userId, userId],
  );
  return { bytes: Number(row?.bytes ?? 0), files: Number(row?.files ?? 0) };
}

export function overQuota(quota: UploadQuota, bytes: number, files: number): boolean {
  return (quota.maxBytes > 0 && bytes > quota.maxBytes) || (quota.maxFiles > 0 && files > quota.maxFiles);
}

/** The one sentence every upload path sends, so the limit reads as one limit wherever it is hit. */
export function quotaMessage(quota: UploadQuota): string {
  const parts: string[] = [];
  if (quota.maxBytes > 0) parts.push(`${Math.round(quota.maxBytes / (1024 * 1024))} MB`);
  if (quota.maxFiles > 0) parts.push(`${quota.maxFiles} files`);
  return `This demo account has reached its upload limit (${parts.join(' or ')}).`;
}

export const UPLOAD_QUOTA_CODE = 'UPLOAD_QUOTA';

/**
 * Whether storing `incomingBytes` in `incomingFiles` more files would take
 * the caller past its quota. Null when the caller has no quota or it fits;
 * otherwise the 413 body to send.
 */
export async function quotaRefusal(
  db: DatabaseAdapter,
  req: RequestLike,
  incomingBytes: number,
  incomingFiles: number,
): Promise<{ error: string; code: string } | null> {
  const quota = storageQuotaFor(req);
  if (!quota || !req.user?.id) return null;
  const used = await accountStoredUsage(db, req.user.id);
  return overQuota(quota, used.bytes + incomingBytes, used.files + incomingFiles)
    ? { error: quotaMessage(quota), code: UPLOAD_QUOTA_CODE }
    : null;
}

// ── Caps on what a visitor can create ────────────────────────────────────────

/**
 * Per-account caps for a demo visitor. The demo write limiter bounds the
 * rate; these bound the total, since every project makes a directory tree on
 * disk and every note and collection is a row in the database the demo
 * shares with everyone.
 */
export const DEMO_MAX_PROJECTS = 25;
export const DEMO_MAX_COLLECTIONS = 25;
export const DEMO_MAX_PROJECT_NOTES = 200;

// ── Keyword-only search ──────────────────────────────────────────────────────

/**
 * An embedding adapter that never sends text anywhere: every vector is zeros,
 * so collection search runs by keyword (searchCollections reports
 * method 'keyword'). A demo visitor's documents and queries are not embedded:
 * the demo has no local embedder, and an embedding service would be a
 * recipient the privacy notice does not name. The labels are the configured
 * adapter's, so diagnostics still say which model was not used.
 */
export function keywordOnlyEmbeddingAdapter(base: EmbeddingAdapter = getEmbeddingAdapter()): EmbeddingAdapter {
  const zeros = (): number[] => new Array<number>(base.dimensions).fill(0);
  return {
    provider: base.provider,
    model: base.model,
    dimensions: base.dimensions,
    embed: async () => zeros(),
    embedBatch: async (texts: string[]) => texts.map(() => zeros()),
  };
}

// ── Deleting an account's Knowledge Base and project files ───────────────────

export interface AccountFilesResult {
  /** Knowledge Base document files and project files removed from disk. */
  filesRemoved: number;
  /** Project workspace directories removed (WORKSPACES_DIR/<id>). */
  workspacesRemoved: number;
  /** Rows removed (or, for sessions, unlinked) per table. */
  rowsByTable: Record<string, number>;
  /** Tables (or 'files') where a step failed, with the database's error code. */
  errors: Array<{ table: string; code: string }>;
}

/** The account's collections, the documents in them and the documents it uploaded elsewhere. Params: the user id, twice. */
const ACCOUNT_DOCUMENTS = `SELECT d.id, d.file_path FROM rag_documents d
  WHERE d.uploaded_by = ? OR d.collection_id IN (SELECT id FROM knowledge_collections WHERE created_by = ?)`;

/** Params: the user id. */
const ACCOUNT_PROJECTS = 'SELECT id FROM projects WHERE user_id = ?';

/**
 * The database steps, in order. Params: the user id at every `?`. Exported so
 * a test can run them against the real schema.
 *   - chunk vectors first: embeddings has no foreign key to rag_chunks;
 *   - documents and collections (chunks go with them by CASCADE);
 *   - sessions anyone filed under the account's projects are unlinked (the
 *     foreign key has no ON DELETE), registered_folders rows that list the
 *     projects' upload folders go, then the projects (members, invitations,
 *     notes and file rows go with them by CASCADE);
 *   - project files and notes it left in projects that are not its own.
 */
export const ACCOUNT_FILE_STEPS: ReadonlyArray<{ table: string; sql: string }> = [
  {
    table: 'embeddings (rag chunks)',
    sql: `DELETE FROM embeddings WHERE content_type = '${RAG_CHUNK_CONTENT_TYPE}' AND content_id IN (
            SELECT c.id FROM rag_chunks c JOIN rag_documents d ON d.id = c.document_id
             WHERE d.uploaded_by = ? OR d.collection_id IN (SELECT id FROM knowledge_collections WHERE created_by = ?))`,
  },
  { table: 'rag_documents', sql: 'DELETE FROM rag_documents WHERE uploaded_by = ?' },
  { table: 'knowledge_collections', sql: 'DELETE FROM knowledge_collections WHERE created_by = ?' },
  { table: 'sessions (unlinked from projects)', sql: `UPDATE sessions SET project_id = NULL WHERE project_id IN (${ACCOUNT_PROJECTS})` },
  { table: 'registered_folders', sql: `DELETE FROM registered_folders WHERE project_id IN (${ACCOUNT_PROJECTS})` },
  { table: 'projects', sql: 'DELETE FROM projects WHERE user_id = ?' },
  { table: 'project_files', sql: 'DELETE FROM project_files WHERE uploaded_by = ?' },
  { table: 'project_notes', sql: 'DELETE FROM project_notes WHERE user_id = ?' },
];

function errorCode(err: unknown): string {
  const code = (err as { code?: unknown })?.code;
  return typeof code === 'string' ? code : 'error';
}

/**
 * Deletes one account's Knowledge Base and project files from disk, then the
 * rows that list them (ACCOUNT_FILE_STEPS). Every step stands alone: one that
 * fails is recorded and the rest go on, so the caller's own passes still run.
 */
export async function removeAccountStoredFiles(
  db: DatabaseAdapter,
  userId: string,
  opts: { env?: Env } = {},
): Promise<AccountFilesResult> {
  const env = opts.env ?? process.env;
  const result: AccountFilesResult = { filesRemoved: 0, workspacesRemoved: 0, rowsByTable: {}, errors: [] };
  const ragRoot = ragUploadDir(env);
  const wsRoot = workspacesRoot(env);

  // Knowledge Base documents: the file of every document the account uploaded
  // or that sits in one of its collections.
  const documents = await db.all<{ id: string; file_path: string | null }>(ACCOUNT_DOCUMENTS, [userId, userId])
    .catch((err: unknown) => { result.errors.push({ table: 'rag_documents (read)', code: errorCode(err) }); return [] as Array<{ id: string; file_path: string | null }>; });
  for (const doc of documents) {
    try {
      if (await removeFileInside(ragRoot, doc.file_path)) result.filesRemoved++;
    } catch {
      result.errors.push({ table: 'files', code: 'unlink' });
    }
  }

  // Projects it owns: the whole workspace directory.
  const projects = await db.all<{ id: string }>(ACCOUNT_PROJECTS, [userId])
    .catch((err: unknown) => { result.errors.push({ table: 'projects (read)', code: errorCode(err) }); return [] as Array<{ id: string }>; });
  for (const project of projects) {
    try {
      if (await removeProjectWorkspaceDir(wsRoot, project.id)) result.workspacesRemoved++;
    } catch {
      result.errors.push({ table: 'files', code: 'unlink' });
    }
  }

  // Files it added to projects that are not its own.
  const elsewhere = await db.all<{ file_path: string | null }>(
    `SELECT file_path FROM project_files WHERE uploaded_by = ? AND project_id NOT IN (${ACCOUNT_PROJECTS})`,
    [userId, userId],
  ).catch((err: unknown) => { result.errors.push({ table: 'project_files (read)', code: errorCode(err) }); return [] as Array<{ file_path: string | null }>; });
  for (const file of elsewhere) {
    try {
      if (await removeFileInside(wsRoot, file.file_path)) result.filesRemoved++;
    } catch {
      result.errors.push({ table: 'files', code: 'unlink' });
    }
  }

  for (const step of ACCOUNT_FILE_STEPS) {
    const params = (step.sql.match(/\?/g) ?? []).map(() => userId);
    try {
      const r = await db.run(step.sql, params);
      if (r.changes > 0) result.rowsByTable[step.table] = (result.rowsByTable[step.table] ?? 0) + r.changes;
    } catch (err) {
      result.errors.push({ table: step.table, code: errorCode(err) });
    }
  }
  return result;
}
