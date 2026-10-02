/**
 * demo-upload-guard.db.test.ts — every upload path a demo visitor reaches
 * checks the file's content before anything opens it, and counts against one
 * upload quota (2026-10-02).
 *
 * Before: Knowledge Base uploads (POST /documents/upload, /upload-multiple),
 * project files (POST /projects/:id/files) and Task Agent attachments
 * (POST /task-agent/tasks/:id/upload) took a .docx/.xlsx without the
 * content-type and ZIP-expansion check routes/files.ts and
 * engagement-uploads.ts had: a few kilobytes that inflate to gigabytes went
 * straight to mammoth or SheetJS, in the Node process every visitor shares.
 * And the quota was not one limit: run attachments and Engagement Task files
 * counted only file_uploads, the Task Agent only file_uploads and its own
 * attachments, so an account full of Knowledge Base documents could still
 * upload there.
 *
 * Now (services/demo-upload-guard.ts, rag/demo-storage.ts accountStoredUsage):
 *   - each path refuses a visitor's bomb with 400 and keeps nothing (no file
 *     on disk, no row, no attachment); an admin's same upload goes on as before;
 *   - DEMO_USER_UPLOAD_FILES is one total: Knowledge Base documents fill it
 *     for an Engagement Task file, a run attachment, a project file and a
 *     task attachment alike, and task attachments fill it for the Knowledge
 *     Base. An admin is not limited.
 *
 * Against the real schema; skips without a test database.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { docxBomb, buildDocx, PNG_BYTES } from '../helpers/zip-fixtures';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-demo-upload-guard';
});

// Nothing here may reach an embedder: an admin's Knowledge Base document is
// indexed, and its chunks go to this spy.
vi.mock('../../server/services/rag/chunk-embedder.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/rag/chunk-embedder.js')>();
  return {
    ...actual,
    embedRagChunks: async (_db: unknown, chunks: Array<{ id: string }>) => ({
      embedded: 0, skipped: chunks.length, provider: 'ollama', model: 'fake-embed', dimensions: 4,
      skippedReasons: { empty: 0, zeroVector: chunks.length, dimensionMismatch: 0, storeError: 0 },
    }),
  };
});
vi.mock('../../server/services/embedding-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/embedding-adapter.js')>();
  const fake = {
    provider: 'ollama' as const, model: 'fake-embed', dimensions: 4,
    embed: async () => [0.1, 0.2, 0.3, 0.4],
    embedBatch: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3, 0.4]),
  };
  return { ...actual, getEmbeddingAdapter: () => fake };
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const TAG = randomUUID().slice(0, 8);
const VISITOR = `u-ug-visitor-${TAG}`;
const FULL = `u-ug-full-${TAG}`;     // a visitor whose Knowledge Base fills the quota
const TASKS = `u-ug-tasks-${TAG}`;   // a visitor whose task attachments fill it
const ADMIN = `u-ug-admin-${TAG}`;
const USERS = [VISITOR, FULL, TASKS, ADMIN];
const ENV_KEYS = ['DEMO_MODE', 'DEPLOYMENT_MODE', 'DEMO_USER_UPLOAD_MB', 'DEMO_USER_UPLOAD_FILES', 'UPLOAD_DIR', 'WORKSPACES_DIR'] as const;

type Who = { id: string; role: string };
interface Json { [k: string]: unknown }

d('demo upload guard: one content check, one quota, on every upload path', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';
  let uploadDir = '';
  let workspaces = '';
  const saved: Record<string, string | undefined> = {};

  const ragDir = () => path.join(uploadDir, 'rag-documents');
  const count = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile()).length : 0);

  beforeAll(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-ug-uploads-'));
    workspaces = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-ug-ws-'));
    // files.ts and workspace.ts read these when they load.
    process.env.UPLOAD_DIR = uploadDir;
    process.env.WORKSPACES_DIR = workspaces;
    process.env.DEPLOYMENT_MODE = 'team';
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    for (const u of USERS) {
      await db.run("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'x', ?)", [u, u, u === ADMIN ? 'admin' : 'analyst']);
    }
    const { createDocumentsRouter } = await import('../../server/routes/documents.js');
    const { createProjectFilesRoutes } = await import('../../server/routes/project-files.js');
    const { createTaskAgentRoutes } = await import('../../server/routes/task-agent.js');
    const { createFilesRoutes } = await import('../../server/routes/files.js');
    const { engagementUploadMiddleware } = await import('../../server/services/engagement-uploads.js');
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const id = req.header('x-test-user');
      if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    app.use('/api', await createDocumentsRouter(db));
    app.use('/api', await createProjectFilesRoutes(db));
    app.use('/api/task-agent', await createTaskAgentRoutes(db));
    app.use('/api', createFilesRoutes(db));
    // The middleware every Engagement Task upload route runs (routes/engagements.ts).
    app.post('/api/engagement-upload', engagementUploadMiddleware(db), (req: Request, res: Response) => {
      res.json({ stored: req.file?.filename ?? null });
    });
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  beforeEach(() => {
    process.env.DEPLOYMENT_MODE = 'team';
    process.env.DEMO_MODE = 'true';
    delete process.env.DEMO_USER_UPLOAD_MB;
    delete process.env.DEMO_USER_UPLOAD_FILES;
  });

  afterEach(() => {
    for (const k of ['DEMO_MODE', 'DEMO_USER_UPLOAD_MB', 'DEMO_USER_UPLOAD_FILES'] as const) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  });

  afterAll(async () => {
    if (db) {
      await db.run('DELETE FROM rag_documents WHERE uploaded_by IN (?, ?, ?, ?)', USERS).catch(() => undefined);
      await db.run('DELETE FROM knowledge_collections WHERE created_by IN (?, ?, ?, ?)', USERS).catch(() => undefined);
      await db.run('DELETE FROM file_uploads WHERE uploaded_by IN (?, ?, ?, ?)', USERS).catch(() => undefined);
      await db.run('DELETE FROM anton_tasks WHERE user_id IN (?, ?, ?, ?)', USERS).catch(() => undefined);
      await db.run('DELETE FROM registered_folders WHERE project_id IN (SELECT id FROM projects WHERE user_id IN (?, ?, ?, ?))', USERS).catch(() => undefined);
      await db.run('DELETE FROM projects WHERE user_id IN (?, ?, ?, ?)', USERS).catch(() => undefined);
      await db.run('DELETE FROM users WHERE id IN (?, ?, ?, ?)', USERS).catch(() => undefined);
      await db.close();
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    fs.rmSync(uploadDir, { recursive: true, force: true });
    fs.rmSync(workspaces, { recursive: true, force: true });
  });

  const visitor: Who = { id: VISITOR, role: 'analyst' };
  const admin: Who = { id: ADMIN, role: 'admin' };

  async function send(who: Who, url: string, field: string, files: Array<{ name: string; bytes: Buffer }>, fields: Record<string, string> = {}): Promise<{ status: number; body: Json }> {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const f of files) form.append(field, new Blob([new Uint8Array(f.bytes)]), f.name);
    const res = await fetch(`${base}${url}`, {
      method: 'POST', body: form, headers: { 'x-test-user': who.id, 'x-test-role': who.role }, signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    let body: Json = {};
    try { body = JSON.parse(text) as Json; } catch { body = { raw: text }; }
    return { status: res.status, body };
  }

  async function collectionOf(owner: string): Promise<string> {
    const id = `ug-col-${randomUUID().slice(0, 8)}-${TAG}`;
    await db.run('INSERT INTO knowledge_collections (id, name, display_name, created_by) VALUES (?, ?, ?, ?)', [id, id, id, owner]);
    return id;
  }

  async function projectOf(owner: string): Promise<string> {
    const id = randomUUID();
    await db.run('INSERT INTO projects (id, name, user_id) VALUES (?, ?, ?)', [id, `Matter ${TAG}`, owner]);
    await db.run("INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, 'owner')", [randomUUID(), id, owner]);
    return id;
  }

  async function taskOf(owner: string): Promise<string> {
    const id = randomUUID();
    await db.run("INSERT INTO anton_tasks (id, user_id, title, description, status) VALUES (?, ?, 'Policy', 'Draft a policy', 'clarifying')", [id, owner]);
    return id;
  }

  const bomb = () => ({ name: 'policy.docx', bytes: docxBomb() });
  const note = (name = 'notes.txt') => ({ name, bytes: Buffer.from('A made-up policy note for the demo, nothing real in it.') });

  // ── The content check ──────────────────────────────────────────────────────

  it('Knowledge Base, one document: a visitor\'s bomb is refused before indexing and nothing stays; an admin\'s is indexed', async () => {
    const col = await collectionOf(VISITOR);
    const before = count(ragDir());
    const r = await send(visitor, '/api/documents/upload', 'file', [bomb()], { collectionId: col });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('ZIP_BOMB_DETECTED');
    expect(String(r.body.error)).toMatch(/^"policy\.docx" was refused: it expands to more than/);
    expect(count(ragDir())).toBe(before);
    expect(await db.get('SELECT 1 FROM rag_documents WHERE collection_id = ?', [col])).toBeUndefined();

    // A visitor's file whose content is not its type is refused the same way.
    const png = await send(visitor, '/api/documents/upload', 'file', [{ name: 'scan.pdf', bytes: PNG_BYTES }], { collectionId: col });
    expect(png.status).toBe(400);
    expect(png.body.code).toBe('UPLOAD_CONTENT');

    // Negative controls: the visitor's ordinary document, and the admin's same bomb, are indexed.
    expect((await send(visitor, '/api/documents/upload', 'file', [{ name: 'policy.docx', bytes: buildDocx('A short policy text.') }], { collectionId: col })).status).toBe(200);
    const adminCol = await collectionOf(ADMIN);
    const a = await send(admin, '/api/documents/upload', 'file', [bomb()], { collectionId: adminCol });
    expect(a.status).toBe(200);
    expect(Number(a.body.chunkCount)).toBeGreaterThan(0);
  }, 60_000);

  it('Knowledge Base, several documents: one bomb refuses the request and removes every file; an admin\'s goes through', async () => {
    const col = await collectionOf(VISITOR);
    const before = count(ragDir());
    const r = await send(visitor, '/api/documents/upload-multiple', 'files', [note(), bomb()], { collectionId: col });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('ZIP_BOMB_DETECTED');
    expect(count(ragDir())).toBe(before);
    expect(await db.get('SELECT 1 FROM rag_documents WHERE collection_id = ?', [col])).toBeUndefined();

    // Negative control: the admin.
    const adminCol = await collectionOf(ADMIN);
    const a = await send(admin, '/api/documents/upload-multiple', 'files', [note(), bomb()], { collectionId: adminCol });
    expect(a.status).toBe(200);
    expect(a.body.successful).toBe(2);
  }, 60_000);

  it('project files: a visitor\'s bomb is refused while staged and never reaches the workspace; an admin\'s is kept', async () => {
    const id = await projectOf(VISITOR);
    const staged = count(uploadDir);
    const r = await send(visitor, `/api/projects/${id}/files`, 'files', [note(), bomb()]);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('ZIP_BOMB_DETECTED');
    expect(count(uploadDir)).toBe(staged); // nothing left in staging
    expect(count(path.join(workspaces, id, 'uploads'))).toBe(0);
    expect(await db.get('SELECT 1 FROM project_files WHERE project_id = ?', [id])).toBeUndefined();

    // Negative controls: the visitor's ordinary file, and the admin's bomb, are kept.
    expect((await send(visitor, `/api/projects/${id}/files`, 'files', [note()])).status).toBe(200);
    const adminProject = await projectOf(ADMIN);
    const a = await send(admin, `/api/projects/${adminProject}/files`, 'files', [bomb()]);
    expect(a.status).toBe(200);
    expect(count(path.join(workspaces, adminProject, 'uploads'))).toBe(1);
  }, 60_000);

  it('Task Agent attachments: a visitor\'s bomb is refused before extraction and not attached; an admin\'s is extracted', async () => {
    const task = await taskOf(VISITOR);
    const r = await send(visitor, `/api/task-agent/tasks/${task}/upload`, 'file', [bomb()]);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('ZIP_BOMB_DETECTED');
    const row = await db.get<{ task_files: string | null }>('SELECT task_files FROM anton_tasks WHERE id = ?', [task]);
    expect(JSON.parse(row?.task_files || '[]')).toEqual([]);

    // Negative controls: the visitor's ordinary file, and the admin's bomb, are attached.
    expect((await send(visitor, `/api/task-agent/tasks/${task}/upload`, 'file', [note()])).status).toBe(200);
    const adminTask = await taskOf(ADMIN);
    const a = await send(admin, `/api/task-agent/tasks/${adminTask}/upload`, 'file', [bomb()]);
    expect(a.status).toBe(200);
    const adminRow = await db.get<{ task_files: string }>('SELECT task_files FROM anton_tasks WHERE id = ?', [adminTask]);
    expect((JSON.parse(adminRow!.task_files) as Array<{ text: string }>)[0].text).toContain('A short policy text.');
  }, 60_000);

  it('run attachments and Engagement Task files keep their check through the shared helper', async () => {
    // files.ts checks every caller, as it did; engagement uploads check a visitor.
    for (const who of [visitor, admin]) {
      const r = await send(who, '/api/files/upload', 'file', [bomb()]);
      expect({ who: who.id, status: r.status, code: r.body.code }).toEqual({ who: who.id, status: 400, code: 'ZIP_BOMB_DETECTED' });
    }
    const e = await send(visitor, '/api/engagement-upload', 'file', [bomb()]);
    expect(e.status).toBe(400);
    expect(e.body.code).toBe('ZIP_BOMB_DETECTED');
    // Negative control: an admin's engagement file is not checked, as before.
    expect((await send(admin, '/api/engagement-upload', 'file', [bomb()])).status).toBe(200);
  }, 60_000);

  // ── One quota ──────────────────────────────────────────────────────────────

  it('Knowledge Base documents fill the one quota: an Engagement Task file, a run attachment, a project file and a task attachment are refused', async () => {
    process.env.DEMO_USER_UPLOAD_FILES = '2';
    const full: Who = { id: FULL, role: 'analyst' };
    const col = await collectionOf(FULL);
    expect((await send(full, '/api/documents/upload', 'file', [note('a.txt')], { collectionId: col })).status).toBe(200);
    expect((await send(full, '/api/documents/upload', 'file', [note('b.txt')], { collectionId: col })).status).toBe(200);

    const engDir = count(uploadDir);
    const eng = await send(full, '/api/engagement-upload', 'file', [note()]);
    expect({ path: 'engagement', status: eng.status, code: eng.body.code }).toEqual({ path: 'engagement', status: 413, code: 'UPLOAD_QUOTA' });
    const run = await send(full, '/api/files/upload', 'file', [note()]);
    expect({ path: 'run attachment', status: run.status, code: run.body.code }).toEqual({ path: 'run attachment', status: 413, code: 'UPLOAD_QUOTA' });
    const project = await projectOf(FULL);
    const pf = await send(full, `/api/projects/${project}/files`, 'files', [note()]);
    expect({ path: 'project file', status: pf.status, code: pf.body.code }).toEqual({ path: 'project file', status: 413, code: 'UPLOAD_QUOTA' });
    const task = await taskOf(FULL);
    const ta = await send(full, `/api/task-agent/tasks/${task}/upload`, 'file', [note()]);
    expect({ path: 'task attachment', status: ta.status, code: ta.body.code }).toEqual({ path: 'task attachment', status: 413, code: 'UPLOAD_QUOTA' });
    expect(String(ta.body.error)).toMatch(/upload limit \(.*2 files\)/);
    expect(count(uploadDir)).toBe(engDir);
    expect(await db.get('SELECT 1 FROM file_uploads WHERE uploaded_by = ?', [FULL])).toBeUndefined();

    // Negative control: an admin with as many documents uploads on every path.
    const adminCol = await collectionOf(ADMIN);
    for (const n of ['a.txt', 'b.txt']) expect((await send(admin, '/api/documents/upload', 'file', [note(n)], { collectionId: adminCol })).status).toBe(200);
    expect((await send(admin, '/api/engagement-upload', 'file', [note()])).status).toBe(200);
    expect((await send(admin, '/api/files/upload', 'file', [note()])).status).toBe(200);
    expect((await send(admin, `/api/projects/${await projectOf(ADMIN)}/files`, 'files', [note()])).status).toBe(200);
    expect((await send(admin, `/api/task-agent/tasks/${await taskOf(ADMIN)}/upload`, 'file', [note()])).status).toBe(200);
  }, 60_000);

  it('task attachments count toward the same total: the Knowledge Base is refused once they fill it', async () => {
    process.env.DEMO_USER_UPLOAD_FILES = '2';
    const tasks: Who = { id: TASKS, role: 'analyst' };
    const task = await taskOf(TASKS);
    expect((await send(tasks, `/api/task-agent/tasks/${task}/upload`, 'file', [note('a.txt')])).status).toBe(200);
    expect((await send(tasks, `/api/task-agent/tasks/${task}/upload`, 'file', [note('b.txt')])).status).toBe(200);
    const col = await collectionOf(TASKS);
    const before = count(ragDir());
    const kb = await send(tasks, '/api/documents/upload', 'file', [note()], { collectionId: col });
    expect(kb.status).toBe(413);
    expect(kb.body.code).toBe('UPLOAD_QUOTA');
    expect(count(ragDir())).toBe(before);

    // Negative control: off the demo the same account is not limited.
    delete process.env.DEMO_MODE;
    expect((await send(tasks, '/api/documents/upload', 'file', [note()], { collectionId: col })).status).toBe(200);
  }, 60_000);
});
