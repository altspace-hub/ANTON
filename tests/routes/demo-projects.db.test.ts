/**
 * demo-projects.db.test.ts — Projects are safe for public-demo visitors
 * (2026-10-02).
 *
 * Projects were already membership-scoped in team mode (404 for a project
 * the caller is not in). What a demo adds:
 *   - no sharing: a visitor cannot add another account to a project or send
 *     an invitation (which mails an address they type) — the server refuses,
 *     whatever the page shows;
 *   - project files count toward the one demo upload quota (with run
 *     attachments and Knowledge Base documents), and only document and image
 *     types are taken;
 *   - caps on a visitor's projects and notes (each project is a directory
 *     tree on the shared disk, each note a row in the shared database);
 *   - no server paths in responses (workspace_path, file_path) — and without
 *     workspace_path the Open Chat project picker lists Work projects again;
 *   - deleting a project removes its folder and its registered-folder entry;
 *     removeAccountStoredFiles deletes an account's workspaces and project
 *     rows (unlinking anyone's sessions filed there), never another account's.
 *
 * Every refusal has its negative control: the owner, an admin, or a team
 * server that is not a demo doing the same thing. Against the real schema;
 * skips without a test database.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

const mail = vi.hoisted(() => ({ sent: vi.fn(async () => undefined) }));
vi.mock('../../server/services/email.js', () => ({ sendProjectInvitationEmail: mail.sent }));

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const TAG = randomUUID().slice(0, 8);
const ALICE = `u-dp-alice-${TAG}`;   // demo visitor
const BOB = `u-dp-bob-${TAG}`;       // another demo visitor
const ROOT = `u-dp-root-${TAG}`;     // instance admin
const USERS = [ALICE, BOB, ROOT];
const ENV_KEYS = ['DEMO_MODE', 'DEMO_USER_UPLOAD_MB', 'DEMO_USER_UPLOAD_FILES'] as const;

interface Json { [k: string]: unknown }

d('Projects on a public demo', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';
  let workspaces = '';
  let uploads = '';
  const saved: Record<string, string | undefined> = {};
  const savedDirs = { WORKSPACES_DIR: process.env.WORKSPACES_DIR, UPLOAD_DIR: process.env.UPLOAD_DIR, DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE };
  let removeAccountStoredFiles: typeof import('../../server/services/rag/demo-storage.js').removeAccountStoredFiles;

  beforeAll(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    workspaces = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-dp-ws-'));
    uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-dp-up-'));
    // workspace.ts reads WORKSPACES_DIR when it loads; the routers read team mode when made.
    process.env.WORKSPACES_DIR = workspaces;
    process.env.UPLOAD_DIR = uploads;
    process.env.DEPLOYMENT_MODE = 'team';
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    for (const u of USERS) {
      await db.run('INSERT INTO users (id, username, password_hash, email, role) VALUES (?, ?, ?, ?, ?)',
        [u, u, 'x', `${u}@example.test`, u === ROOT ? 'admin' : 'analyst']);
    }
    const { createProjectRoutes } = await import('../../server/routes/projects.js');
    const { createProjectFilesRoutes } = await import('../../server/routes/project-files.js');
    const { createProjectCollaborationRoutes } = await import('../../server/routes/project-collaboration.js');
    ({ removeAccountStoredFiles } = await import('../../server/services/rag/demo-storage.js'));
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const id = req.header('x-test-user');
      if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    app.use('/api', await createProjectRoutes(db));
    app.use('/api', await createProjectFilesRoutes(db));
    app.use('/api', await createProjectCollaborationRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    mail.sent.mockClear();
  });

  afterAll(async () => {
    if (db) {
      const like = `%-${TAG}`;
      await db.run('UPDATE sessions SET project_id = NULL WHERE project_id IN (SELECT id FROM projects WHERE user_id LIKE ?)', [like]).catch(() => undefined);
      await db.run('DELETE FROM sessions WHERE user_id LIKE ?', [like]).catch(() => undefined);
      await db.run('DELETE FROM registered_folders WHERE project_id IN (SELECT id FROM projects WHERE user_id LIKE ?)', [like]).catch(() => undefined);
      await db.run('DELETE FROM projects WHERE user_id LIKE ?', [like]).catch(() => undefined);
      await db.run('DELETE FROM users WHERE id LIKE ?', [like]).catch(() => undefined);
      await db.close();
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
    for (const [k, v] of Object.entries(savedDirs)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    fs.rmSync(workspaces, { recursive: true, force: true });
    fs.rmSync(uploads, { recursive: true, force: true });
  });

  const demo = () => { process.env.DEMO_MODE = 'true'; };
  const notDemo = () => { delete process.env.DEMO_MODE; };

  async function call(method: string, url: string, user: string, role = 'analyst', body?: unknown): Promise<{ status: number; body: Json & { [i: number]: Json } }> {
    const res = await fetch(`${base}/api${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-test-user': user, 'x-test-role': role },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: Json = {};
    try { parsed = JSON.parse(text) as Json; } catch { parsed = { raw: text }; }
    return { status: res.status, body: parsed as Json & { [i: number]: Json } };
  }

  async function newProject(user: string, role = 'analyst'): Promise<string> {
    const r = await call('POST', '/projects', user, role, { name: `Matter ${randomUUID().slice(0, 6)}` });
    expect(r.status).toBe(200);
    return String(r.body.id);
  }

  async function uploadFile(user: string, projectId: string, name = 'brief.txt', role = 'analyst'): Promise<{ status: number; body: Json }> {
    const form = new FormData();
    form.append('files', new Blob(['The engagement letter sets out the scope of the review.'], { type: 'text/plain' }), name);
    const res = await fetch(`${base}/api/projects/${projectId}/files`, { method: 'POST', body: form, headers: { 'x-test-user': user, 'x-test-role': role } });
    return { status: res.status, body: await res.json() as Json };
  }

  const workspaceOf = (id: string) => path.join(workspaces, id);
  const filesIn = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).length : 0);

  it("a visitor's project is theirs: another visitor gets 404 everywhere, and no server path is sent", async () => {
    demo();
    const created = await call('POST', '/projects', ALICE, 'analyst', { name: 'Acme review' });
    expect(created.status).toBe(200);
    expect(created.body).not.toHaveProperty('workspace_path');
    const id = String(created.body.id);
    expect(fs.existsSync(workspaceOf(id))).toBe(true);

    const mine = (await call('GET', '/projects', ALICE)).body as unknown as Json[];
    expect(mine.map((p) => p.id)).toContain(id);
    expect(mine.every((p) => !('workspace_path' in p))).toBe(true);
    expect(((await call('GET', '/projects', BOB)).body as unknown as Json[]).map((p) => p.id)).not.toContain(id);

    for (const [method, url] of [
      ['GET', `/projects/${id}`], ['GET', `/projects/${id}/stats`], ['PATCH', `/projects/${id}`], ['DELETE', `/projects/${id}`],
      ['GET', `/projects/${id}/files`], ['GET', `/projects/${id}/notes`], ['POST', `/projects/${id}/notes`],
    ] as const) {
      const r = await call(method, url, BOB, 'analyst', method === 'GET' || method === 'DELETE' ? undefined : { name: 'x', content: 'x' });
      expect({ method, url, status: r.status }).toEqual({ method, url, status: 404 });
    }
    // Negative controls: the owner and an admin read it.
    expect((await call('GET', `/projects/${id}`, ALICE)).status).toBe(200);
    expect((await call('GET', `/projects/${id}`, ROOT, 'admin')).status).toBe(200);
  });

  it('a visitor cannot add a member or send an invitation — on a team server that is not a demo, the owner can', async () => {
    demo();
    const id = await newProject(ALICE);
    const add = await call('POST', `/projects/${id}/members`, ALICE, 'analyst', { userId: BOB, role: 'member' });
    expect(add.status).toBe(403);
    expect(String(add.body.error)).toMatch(/not available in this demo/);
    expect(await db.get('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?', [id, BOB])).toBeUndefined();

    const invite = await call('POST', `/projects/${id}/invitations`, ALICE, 'analyst', { email: 'someone@example.test' });
    expect(invite.status).toBe(403);
    expect(await db.get('SELECT 1 FROM project_invitations WHERE project_id = ?', [id])).toBeUndefined();
    expect(mail.sent).not.toHaveBeenCalled();

    // Bob never became a member, so his view is unchanged.
    expect((await call('GET', `/projects/${id}`, BOB)).status).toBe(404);

    // Negative control: an admin on the demo can.
    expect((await call('POST', `/projects/${id}/invitations`, ROOT, 'admin', { email: 'colleague@example.test' })).status).toBe(200);
    expect(mail.sent).toHaveBeenCalledTimes(1);

    // Negative control: the same owner on a team server that is not a demo.
    notDemo();
    expect((await call('POST', `/projects/${id}/members`, ALICE, 'analyst', { userId: BOB, role: 'viewer' })).status).toBe(200);
    expect((await call('POST', `/projects/${id}/invitations`, ALICE, 'analyst', { email: 'other@example.test' })).status).toBe(200);
  });

  it('project files count toward the one demo quota, take document types only, and keep their path on the server', async () => {
    demo();
    process.env.DEMO_USER_UPLOAD_FILES = '2';
    const visitor = `u-dp-files-${TAG}`;
    await db.run('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)', [visitor, visitor, 'x']);
    const id = await newProject(visitor);
    const dir = path.join(workspaceOf(id), 'uploads');

    const first = await uploadFile(visitor, id);
    expect(first.status).toBe(200);
    expect(filesIn(dir)).toBe(1);
    const listed = (await call('GET', `/projects/${id}/files`, visitor)).body as unknown as Json[];
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('file_path');
    // The knowledge-source entry for the folder is the visitor's, so it goes with the account.
    expect((await db.get<{ user_id: string }>('SELECT user_id FROM registered_folders WHERE project_id = ?', [id]))?.user_id).toBe(visitor);

    // A type a run cannot read is refused for a visitor.
    const exe = await uploadFile(visitor, id, 'tool.exe');
    expect(exe.status).toBe(400);
    expect(String(exe.body.error)).toMatch(/not taken in this demo/);

    // A run attachment on record counts toward the same quota: the next file is one too many.
    await db.run('INSERT INTO file_uploads (id, original_name, extension, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)',
      [`dpq-${TAG}-${randomUUID()}`, 'a.txt', '.txt', 10, visitor]);
    const staged = filesIn(uploads);
    const over = await uploadFile(visitor, id);
    expect(over.status).toBe(413);
    expect(over.body.code).toBe('UPLOAD_QUOTA');
    expect(filesIn(dir)).toBe(1);
    expect(filesIn(uploads)).toBe(staged);
    await db.run('DELETE FROM file_uploads WHERE uploaded_by = ?', [visitor]);

    // Negative controls: an admin is not limited and may store any type.
    expect((await uploadFile(ROOT, id, 'tool.exe', 'admin')).status).toBe(200);
    expect((await uploadFile(ROOT, id, 'notes.txt', 'admin')).status).toBe(200);
  });

  it("caps a visitor's projects and notes — not a team member off the demo", async () => {
    demo();
    const capped = `u-dp-cap-${TAG}`;
    await db.run('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)', [capped, capped, 'x']);
    await db.run(
      "INSERT INTO projects (id, name, user_id) SELECT 'dpcap-' || ? || '-' || g, 'filler', ? FROM generate_series(1, 25) g",
      [TAG, capped],
    );
    const refused = await call('POST', '/projects', capped, 'analyst', { name: 'one too many' });
    expect(refused.status).toBe(409);
    expect(String(refused.body.error)).toMatch(/limit of 25 projects/);

    const id = await newProject(ALICE);
    await db.run(
      "INSERT INTO project_notes (id, project_id, user_id, content) SELECT 'dpnote-' || ? || '-' || g, ?, ?, 'n' FROM generate_series(1, 200) g",
      [TAG, id, ALICE],
    );
    const note = await call('POST', `/projects/${id}/notes`, ALICE, 'analyst', { content: 'one more' });
    expect(note.status).toBe(409);
    // A note is bounded for everyone.
    expect((await call('POST', `/projects/${id}/notes`, ROOT, 'admin', { content: 'x'.repeat(20_001) })).status).toBe(400);

    // Negative controls: off the demo neither cap applies.
    notDemo();
    expect((await call('POST', '/projects', capped, 'analyst', { name: 'fine here' })).status).toBe(200);
    expect((await call('POST', `/projects/${id}/notes`, ALICE, 'analyst', { content: 'fine here' })).status).toBe(200);
  });

  it('deleting a project removes its folder and its knowledge-source entry', async () => {
    demo();
    const id = await newProject(ALICE);
    expect((await uploadFile(ALICE, id)).status).toBe(200);
    expect(await db.get('SELECT 1 FROM registered_folders WHERE project_id = ?', [id])).toBeDefined();

    expect((await call('DELETE', `/projects/${id}`, ALICE)).status).toBe(200);
    expect(fs.existsSync(workspaceOf(id))).toBe(false);
    expect(await db.get('SELECT 1 FROM registered_folders WHERE project_id = ?', [id])).toBeUndefined();
    expect(await db.get('SELECT 1 FROM projects WHERE id = ?', [id])).toBeUndefined();
  });

  it("removeAccountStoredFiles takes an account's projects and folders — never another account's", async () => {
    demo();
    const leaver = `u-dp-leaver-${TAG}`;
    const stayer = `u-dp-stayer-${TAG}`;
    for (const u of [leaver, stayer]) await db.run('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)', [u, u, 'x']);
    const gone = await newProject(leaver);
    const kept = await newProject(stayer);
    expect((await uploadFile(leaver, gone)).status).toBe(200);
    expect((await uploadFile(stayer, kept)).status).toBe(200);
    // Someone else's session filed under the leaver's project (an admin can do that).
    const session = `s-dp-${randomUUID().slice(0, 12)}`;
    await db.run("INSERT INTO sessions (id, module_id, title, user_id, project_id) VALUES (?, 'open-chat', 'x', ?, ?)", [session, stayer, gone]);

    const result = await removeAccountStoredFiles(db, leaver);
    expect(result.errors).toEqual([]);
    expect(result.workspacesRemoved).toBe(1);
    expect(fs.existsSync(workspaceOf(gone))).toBe(false);
    expect(await db.get('SELECT 1 FROM projects WHERE id = ?', [gone])).toBeUndefined();
    expect(await db.get('SELECT 1 FROM registered_folders WHERE project_id = ?', [gone])).toBeUndefined();
    expect((await db.get<{ project_id: string | null }>('SELECT project_id FROM sessions WHERE id = ?', [session]))?.project_id).toBeNull();

    // Negative control: the other account's project, files and folder stay.
    expect(fs.existsSync(path.join(workspaceOf(kept), 'uploads'))).toBe(true);
    expect(filesIn(path.join(workspaceOf(kept), 'uploads'))).toBe(1);
    expect(await db.get('SELECT 1 FROM projects WHERE id = ?', [kept])).toBeDefined();
  });
});
