/**
 * project-creator-removal.db.test.ts — a person removed from a project loses it,
 * even the person who created it (round-1 verifier gap, 2026-09-23,
 * "verify:projects").
 *
 * H7 made POST /api/projects record the creator in projects.user_id. But
 * resolveProjectAccess and buildProjectContext read that column as a permanent
 * owner, so a creator whom the other owners removed still filed sessions into
 * the project and got its files, colleagues' answers and briefs in their
 * prompts. Two fixes, both exercised here against the real schema:
 *   - project-context.ts: membership decides; projects.user_id counts only for
 *     a project with no members at all (Code Studio / workshop projects);
 *   - project-collaboration.ts: removing or demoting the member projects.user_id
 *     names hands the column to a remaining owner, in the same transaction.
 *
 * Also the 404 contract for PATCH /api/sessions/:id/project and the
 * project-files gate (a 403 confirmed that an id existed).
 *
 * Every refusal has a negative control: the remaining owner, a member, an admin
 * or solo mode doing the same thing successfully.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.mock('../../server/services/workspace.js', () => ({
  createProjectWorkspace: vi.fn(async (id: string) => ({ projectId: id, root: `/tmp/ws/${id}` })),
  deleteProjectWorkspace: vi.fn(async () => undefined),
  getProjectWorkspace: vi.fn(async (id: string) => ({ projectId: id, root: `/tmp/ws/${id}`, uploads: `/tmp/ws/${id}/uploads` })),
}));
vi.mock('../../server/services/email.js', () => ({ sendProjectInvitationEmail: vi.fn(async () => undefined) }));

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const tag = randomUUID().slice(0, 8);
const ALICE = `u-pcr-alice-${tag}`;   // creates the project
const BOB = `u-pcr-bob-${tag}`;       // co-owner
const CAROL = `u-pcr-carol-${tag}`;   // never in the project
const ROOT = `u-pcr-root-${tag}`;     // instance admin
const USERS = [ALICE, BOB, CAROL, ROOT];

const originalMode = process.env.DEPLOYMENT_MODE;

let db: DatabaseAdapter;
let server: Server;
let base = '';
const projects: string[] = [];
const sessions: string[] = [];

type Access = 'ok' | 'not_found' | 'forbidden';
let resolveProjectAccess: (db: DatabaseAdapter, input: { projectId: string; userId: string; userRole?: string | null; teamMode: boolean }) => Promise<Access>;
let buildProjectContext: (db: DatabaseAdapter, input: { projectId: string; userId: string; userRole?: string | null; teamMode: boolean }) => Promise<{ denied: boolean; text: string }>;

function team(): void { process.env.DEPLOYMENT_MODE = 'team'; }
function solo(): void { delete process.env.DEPLOYMENT_MODE; }

async function call(method: string, url: string, user: string, role: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const r = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user': user, 'x-test-role': role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: parsed };
}

async function newProject(ownerColumn: string, members: Array<[string, string]>): Promise<string> {
  const id = randomUUID();
  projects.push(id);
  await db.run('INSERT INTO projects (id, name, user_id) VALUES (?, ?, ?)', id, `PCR ${id.slice(0, 6)}`, ownerColumn);
  for (const [user, role] of members) {
    await db.run('INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)', randomUUID(), id, user, role);
  }
  return id;
}

async function newSession(owner: string | null): Promise<string> {
  const id = `s-pcr-${randomUUID().slice(0, 12)}`;
  sessions.push(id);
  await db.run("INSERT INTO sessions (id, module_id, title, user_id) VALUES (?, 'open-chat', 'pcr', ?)", id, owner);
  return id;
}

async function memberId(projectId: string, userId: string): Promise<string> {
  const row = await db.get<{ id: string }>('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?', projectId, userId);
  if (!row) throw new Error('no such member');
  return row.id;
}

async function recordedOwner(projectId: string): Promise<string | undefined> {
  return (await db.get<{ user_id: string }>('SELECT user_id FROM projects WHERE id = ?', projectId))?.user_id;
}

const access = (projectId: string, userId: string, userRole = 'analyst') =>
  resolveProjectAccess(db, { projectId, userId, userRole, teamMode: true });

d('a removed project creator loses the project', () => {
  beforeAll(async () => {
    team();
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    for (const u of USERS) await db.run('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)', u, u, 'x');

    ({ resolveProjectAccess, buildProjectContext } = await import('../../server/services/project-context.js'));
    const { createProjectRoutes } = await import('../../server/routes/projects.js');
    const { createProjectCollaborationRoutes } = await import('../../server/routes/project-collaboration.js');
    const { createProjectFilesRoutes } = await import('../../server/routes/project-files.js');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const id = req.header('x-test-user');
      if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    app.use('/api', await createProjectRoutes(db));
    app.use('/api', await createProjectCollaborationRoutes(db));
    app.use('/api', await createProjectFilesRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(() => { team(); });

  afterAll(async () => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
    if (db) {
      for (const id of sessions) await db.run('DELETE FROM sessions WHERE id = ?', id).catch(() => {});
      for (const id of projects) await db.run('DELETE FROM projects WHERE id = ?', id).catch(() => {});
      for (const u of USERS) await db.run('DELETE FROM users WHERE id = ?', u).catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  });

  it('the creator removed by a co-owner is denied everywhere; the co-owner inherits projects.user_id', async () => {
    const created = await call('POST', '/api/projects', ALICE, 'analyst', { name: `Removal ${tag}` });
    expect(created.status).toBe(200);
    const p = String((created.body as { id: string }).id);
    projects.push(p);
    expect(await recordedOwner(p)).toBe(ALICE);
    expect((await call('POST', `/api/projects/${p}/members`, ALICE, 'analyst', { userId: BOB, role: 'owner' })).status).toBe(200);
    expect(await access(p, ALICE)).toBe('ok');   // before removal

    const removed = await call('DELETE', `/api/projects/${p}/members/${await memberId(p, ALICE)}`, BOB, 'analyst');
    expect(removed.status).toBe(200);
    expect(await recordedOwner(p)).toBe(BOB);

    expect(await access(p, ALICE)).toBe('forbidden');
    const ctx = await buildProjectContext(db, { projectId: p, userId: ALICE, userRole: 'analyst', teamMode: true });
    expect(ctx.denied).toBe(true);
    expect(ctx.text).toBe('');
    // She can no longer file her sessions into it, and the answer does not confirm the id.
    const own = await newSession(ALICE);
    const filed = await call('PATCH', `/api/sessions/${own}/project`, ALICE, 'analyst', { projectId: p });
    const missing = await call('PATCH', `/api/sessions/${own}/project`, ALICE, 'analyst', { projectId: randomUUID() });
    expect(filed.status).toBe(404);
    expect(filed.body).toEqual({ error: 'Project not found' });
    expect(missing.body).toEqual(filed.body);

    // Negative controls: the remaining owner and an admin keep full access.
    expect(await access(p, BOB)).toBe('ok');
    expect(await access(p, ROOT, 'admin')).toBe('ok');
    const bobCtx = await buildProjectContext(db, { projectId: p, userId: BOB, userRole: 'analyst', teamMode: true });
    expect(bobCtx.denied).toBe(false);
    expect(bobCtx.text).toContain('## PROJECT');
  });

  it('backstop: projects.user_id alone never grants a project that has members', async () => {
    // As left by a removal made before the hand-over existed.
    const p = await newProject(ALICE, [[BOB, 'owner']]);
    expect(await access(p, ALICE)).toBe('forbidden');
    expect((await buildProjectContext(db, { projectId: p, userId: ALICE, userRole: 'analyst', teamMode: true })).denied).toBe(true);
    expect(await access(p, BOB)).toBe('ok');
  });

  it('negative control: the recorded owner of a project with no members (Code Studio) keeps it', async () => {
    const p = await newProject(ALICE, []);
    expect(await access(p, ALICE)).toBe('ok');
    expect(await access(p, CAROL)).toBe('forbidden');
  });

  it('demoting the creator hands projects.user_id over; she stays a member with member access', async () => {
    const p = await newProject(ALICE, [[ALICE, 'owner'], [BOB, 'owner']]);
    const r = await call('PATCH', `/api/projects/${p}/members/${await memberId(p, ALICE)}`, BOB, 'analyst', { role: 'member' });
    expect(r.status).toBe(200);
    expect(await recordedOwner(p)).toBe(BOB);
    expect(await access(p, ALICE)).toBe('ok');
  });

  it('negative control: removing someone else leaves projects.user_id alone', async () => {
    const p = await newProject(ALICE, [[ALICE, 'owner'], [BOB, 'member']]);
    expect((await call('DELETE', `/api/projects/${p}/members/${await memberId(p, BOB)}`, ALICE, 'analyst')).status).toBe(200);
    expect(await recordedOwner(p)).toBe(ALICE);
    expect(await access(p, BOB)).toBe('forbidden');
    expect(await access(p, ALICE)).toBe('ok');
  });

  it('solo mode: removal hands over the same way and access is not scoped', async () => {
    solo();
    const p = await newProject(ALICE, [[ALICE, 'owner'], [BOB, 'owner']]);
    const r = await call('DELETE', `/api/projects/${p}/members/${await memberId(p, ALICE)}`, 'solo', 'admin');
    expect(r.status).toBe(200);
    expect(await recordedOwner(p)).toBe(BOB);
    expect(await resolveProjectAccess(db, { projectId: p, userId: ALICE, teamMode: false })).toBe('ok');
  });

  // ── PATCH /api/sessions/:sessionId/project ─────────────────────────────────

  it("another user's session and an unowned session answer 404 like a missing one; owner and admin succeed", async () => {
    const p = await newProject(ALICE, [[ALICE, 'owner'], [CAROL, 'member']]);
    const alices = await newSession(ALICE);
    const unowned = await newSession(null);
    const foreign = await call('PATCH', `/api/sessions/${alices}/project`, CAROL, 'analyst', { projectId: p });
    const missing = await call('PATCH', `/api/sessions/s-pcr-missing-${tag}/project`, CAROL, 'analyst', { projectId: p });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: 'Session not found' });
    expect(missing.body).toEqual(foreign.body);
    const claim = await call('PATCH', `/api/sessions/${unowned}/project`, CAROL, 'analyst', { projectId: p });
    expect(claim.status).toBe(404);
    const row = await db.get<{ project_id: string | null }>('SELECT project_id FROM sessions WHERE id = ?', unowned);
    expect(row?.project_id).toBeNull();

    expect((await call('PATCH', `/api/sessions/${alices}/project`, ALICE, 'analyst', { projectId: p })).status).toBe(200);
    expect((await call('PATCH', `/api/sessions/${unowned}/project`, ROOT, 'admin', { projectId: p })).status).toBe(200);
  });

  // ── project-files gate ─────────────────────────────────────────────────────

  it('project files: a non-member gets the same 404 as for a missing project; members and admins list', async () => {
    const p = await newProject(ALICE, [[ALICE, 'owner'], [BOB, 'member']]);
    const foreign = await call('GET', `/api/projects/${p}/files`, CAROL, 'analyst');
    const missing = await call('GET', `/api/projects/${randomUUID()}/files`, CAROL, 'analyst');
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: 'Project not found' });
    expect(missing.body).toEqual(foreign.body);
    expect((await call('GET', `/api/projects/${p}/files`, BOB, 'analyst')).status).toBe(200);
    expect((await call('GET', `/api/projects/${p}/files`, ROOT, 'admin')).status).toBe(200);
    solo();
    expect((await call('GET', `/api/projects/${p}/files`, 'solo', 'admin')).status).toBe(200);
  });
});
