/**
 * projects-presentations-team-isolation.test.ts — H7 and H9 of the team-server
 * readiness audit (2026-09-23), against a real PostgreSQL database.
 *
 * H7. PATCH and DELETE /api/projects/:id had no membership check, and DELETE
 *     also removed the project's folder on disk. Inside a project nothing kept
 *     at least one owner.
 * H9. Presentations had no owner at all: the list returned every person's decks,
 *     any file downloaded by name, PATCH / DELETE / generate worked by id.
 *
 * Every refusal is paired with a negative control — the owner, a member, an
 * admin or solo mode doing the same thing successfully — because a guard that
 * refuses everyone is an outage, not a fix. Real SQL matters here: the
 * last-owner rule relies on row locks, and ownership is checked in SQL.
 *
 * Needs ANTON_TEST_DATABASE_URL (tests/setup/db-guard.ts); skips without it.
 * Migration 285 is applied in beforeAll — it is idempotent (IF NOT EXISTS), the
 * same statement the runner would execute, so a test database one migration
 * behind still exercises the owner column.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import http, { type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

const { deleteProjectWorkspace } = vi.hoisted(() => ({ deleteProjectWorkspace: vi.fn(async (_id: string) => undefined) }));
vi.mock('../../server/services/workspace.js', () => ({
  createProjectWorkspace: vi.fn(async (id: string) => ({ projectId: id, root: `/tmp/ws/${id}` })),
  deleteProjectWorkspace,
}));
vi.mock('../../server/services/email.js', () => ({ sendProjectInvitationEmail: vi.fn(async () => undefined) }));
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: vi.fn(async () => ({ text: '## SLIDE 1: Title\nType: title\nTitle: Test' })),
  streamChat: vi.fn(),
  setSSEHeaders: vi.fn(),
}));
vi.mock('../../server/services/export-pptx.js', () => ({
  generatePptx: vi.fn(async () => Buffer.from('PPTX-BYTES')),
  resolveBrand: vi.fn(() => ({ companyName: 'Test' })),
}));

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const tag = randomUUID().slice(0, 8);
const ALICE = `u-alice-${tag}`;   // project owner, presentation owner
const BOB = `u-bob-${tag}`;       // project member
const VIC = `u-vic-${tag}`;       // project viewer
const CAROL = `u-carol-${tag}`;   // not in the project
const ROOT = `u-root-${tag}`;     // instance admin, not in the project
const X = `u-x-${tag}`;
const Y = `u-y-${tag}`;
const USERS = [ALICE, BOB, VIC, CAROL, ROOT, X, Y];

const originalMode = process.env.DEPLOYMENT_MODE;
const originalOutput = process.env.OUTPUT_DIR;

let db: DatabaseAdapter;
let server: Server;
let base = '';
let outputDir = '';
const projects: string[] = [];
const presentations: string[] = [];

function team(): void { process.env.DEPLOYMENT_MODE = 'team'; }
function solo(): void { delete process.env.DEPLOYMENT_MODE; }

async function call(
  method: string, url: string, user: string, role: string, body?: unknown,
): Promise<{ status: number; body: unknown; text: string }> {
  const r = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user': user, 'x-test-role': role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* a download */ }
  return { status: r.status, body: parsed, text };
}

async function newProject(members: Array<[string, string]>): Promise<string> {
  const id = randomUUID();
  projects.push(id);
  await db.run('INSERT INTO projects (id, name, user_id) VALUES (?, ?, ?)', id, `Project ${id.slice(0, 6)}`, members[0]?.[0] ?? 'default');
  for (const [user, role] of members) {
    await db.run('INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)', randomUUID(), id, user, role);
  }
  return id;
}

async function memberId(projectId: string, userId: string): Promise<string> {
  const row = await db.get<{ id: string }>('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?', projectId, userId);
  if (!row) throw new Error('no such member');
  return row.id;
}

async function roleOf(projectId: string, userId: string): Promise<string | undefined> {
  return (await db.get<{ role: string }>('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', projectId, userId))?.role;
}

async function newDeck(owner: string | null, withFile = true): Promise<{ id: string; filename: string; filePath: string }> {
  const id = randomUUID();
  presentations.push(id);
  const filename = `presentation_${randomUUID()}.pptx`;
  const filePath = path.join(outputDir, filename);
  if (withFile) fs.writeFileSync(filePath, `deck-of-${owner ?? 'nobody'}`);
  await db.run(
    `INSERT INTO presentations (id, user_id, title, status, file_path, filename) VALUES (?, ?, ?, 'ready', ?, ?)`,
    id, owner, `Deck ${id.slice(0, 6)}`, filePath, filename,
  );
  return { id, filename, filePath };
}

d('team isolation: projects (H7) and presentations (H9)', () => {
  beforeAll(async () => {
    // presentations.ts resolves OUTPUT_DIR at import, so set it first.
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-pres-'));
    process.env.OUTPUT_DIR = outputDir;
    team();

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    await db.exec(fs.readFileSync(path.join(process.cwd(), 'server/db/migrations-pg/285_presentations_owner.sql'), 'utf8'));
    for (const u of USERS) {
      await db.run('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)', u, u, 'x');
    }

    const { createProjectRoutes } = await import('../../server/routes/projects.js');
    const { createProjectCollaborationRoutes } = await import('../../server/routes/project-collaboration.js');
    const { createPresentationsRoutes } = await import('../../server/routes/presentations.js');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const id = req.header('x-test-user');
      if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    app.use('/api', await createProjectRoutes(db));
    app.use('/api', await createProjectCollaborationRoutes(db));
    app.use('/api', await createPresentationsRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(() => { team(); deleteProjectWorkspace.mockClear(); });

  afterAll(async () => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
    if (originalOutput === undefined) delete process.env.OUTPUT_DIR; else process.env.OUTPUT_DIR = originalOutput;
    if (db) {
      for (const id of presentations) await db.run('DELETE FROM presentations WHERE id = ?', id).catch(() => {});
      for (const id of projects) await db.run('DELETE FROM projects WHERE id = ?', id).catch(() => {});
      for (const u of USERS) await db.run('DELETE FROM users WHERE id = ?', u).catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  // ── H7: projects ───────────────────────────────────────────────────────────

  describe('PATCH / DELETE /api/projects/:id', () => {
    it('a non-member gets 404 on PATCH — indistinguishable from a missing project — and nothing changes', async () => {
      const p = await newProject([[ALICE, 'owner'], [BOB, 'member']]);
      const real = await call('PATCH', `/api/projects/${p}`, CAROL, 'analyst', { name: 'pwned' });
      const missing = await call('PATCH', `/api/projects/${randomUUID()}`, CAROL, 'analyst', { name: 'pwned' });
      expect(real.status).toBe(404);
      expect(real.body).toEqual(missing.body);
      expect(real.body).toEqual({ error: 'Project not found' });
      const row = await db.get<{ name: string }>('SELECT name FROM projects WHERE id = ?', p);
      expect(row?.name).not.toBe('pwned');
    });

    it('a non-member gets 404 on DELETE; the row and the folder survive', async () => {
      const p = await newProject([[ALICE, 'owner']]);
      const r = await call('DELETE', `/api/projects/${p}`, CAROL, 'analyst');
      expect(r.status).toBe(404);
      expect(await db.get('SELECT id FROM projects WHERE id = ?', p)).toBeTruthy();
      expect(deleteProjectWorkspace).not.toHaveBeenCalled();
    });

    it('negative control: a member renames; a viewer cannot', async () => {
      const p = await newProject([[ALICE, 'owner'], [BOB, 'member'], [VIC, 'viewer']]);
      expect((await call('PATCH', `/api/projects/${p}`, BOB, 'analyst', { name: 'Renamed by Bob' })).status).toBe(200);
      expect((await db.get<{ name: string }>('SELECT name FROM projects WHERE id = ?', p))?.name).toBe('Renamed by Bob');
      const v = await call('PATCH', `/api/projects/${p}`, VIC, 'viewer', { name: 'Renamed by Vic' });
      expect(v.status).toBe(403);
      expect((await db.get<{ name: string }>('SELECT name FROM projects WHERE id = ?', p))?.name).toBe('Renamed by Bob');
    });

    it("a member cannot soft-delete through status; the owner can archive", async () => {
      const p = await newProject([[ALICE, 'owner'], [BOB, 'member']]);
      const r = await call('PATCH', `/api/projects/${p}`, BOB, 'analyst', { status: 'deleted' });
      expect(r.status).toBe(403);
      expect((await db.get<{ status: string }>('SELECT status FROM projects WHERE id = ?', p))?.status).toBe('active');
      expect((await call('PATCH', `/api/projects/${p}`, ALICE, 'analyst', { status: 'archived' })).status).toBe(200);
      expect((await db.get<{ status: string }>('SELECT status FROM projects WHERE id = ?', p))?.status).toBe('archived');
    });

    it('a member cannot DELETE (owner only); the owner can, and the folder goes with it', async () => {
      const p = await newProject([[ALICE, 'owner'], [BOB, 'member']]);
      expect((await call('DELETE', `/api/projects/${p}`, BOB, 'analyst')).status).toBe(403);
      expect(await db.get('SELECT id FROM projects WHERE id = ?', p)).toBeTruthy();
      expect(deleteProjectWorkspace).not.toHaveBeenCalled();

      expect((await call('DELETE', `/api/projects/${p}`, ALICE, 'analyst')).status).toBe(200);
      expect(await db.get('SELECT id FROM projects WHERE id = ?', p)).toBeUndefined();
      expect(deleteProjectWorkspace).toHaveBeenCalledWith(p);
    });

    it('an admin who is not a member can still rename and delete (support path)', async () => {
      const p = await newProject([[ALICE, 'owner']]);
      expect((await call('PATCH', `/api/projects/${p}`, ROOT, 'admin', { name: 'Admin rename' })).status).toBe(200);
      expect((await call('DELETE', `/api/projects/${p}`, ROOT, 'admin')).status).toBe(200);
      expect(await db.get('SELECT id FROM projects WHERE id = ?', p)).toBeUndefined();
    });

    it('solo mode is unscoped, exactly as before: the solo user renames and deletes a project with no members', async () => {
      solo();
      const p = await newProject([]);
      expect((await call('PATCH', `/api/projects/${p}`, 'solo', 'admin', { name: 'Solo rename' })).status).toBe(200);
      expect((await db.get<{ name: string }>('SELECT name FROM projects WHERE id = ?', p))?.name).toBe('Solo rename');
      expect((await call('DELETE', `/api/projects/${p}`, 'solo', 'admin')).status).toBe(200);
      expect(deleteProjectWorkspace).toHaveBeenCalledWith(p);
    });

    it("DELETE /projects/%2E%2E never reaches the disk, even in solo mode", async () => {
      solo();
      // Raw http with an explicit `path`, not fetch or a URL string: the WHATWG URL
      // parser folds %2E%2E into a '..' segment and would send DELETE /api/ —
      // never reaching the route at all.
      const { port } = new URL(base);
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1', port: Number(port), path: '/api/projects/%2E%2E', method: 'DELETE',
          headers: { 'x-test-user': 'solo', 'x-test-role': 'admin' },
        }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)); });
        req.on('error', reject);
        req.end();
      });
      expect(status).toBe(404);
      expect(deleteProjectWorkspace).not.toHaveBeenCalled();
    });

    it('POST /api/projects records the creator in projects.user_id and as owner', async () => {
      const r = await call('POST', '/api/projects', ALICE, 'analyst', { name: 'Attributed' });
      expect(r.status).toBe(200);
      const id = (r.body as { id: string }).id;
      projects.push(id);
      expect((await db.get<{ user_id: string }>('SELECT user_id FROM projects WHERE id = ?', id))?.user_id).toBe(ALICE);
      expect(await roleOf(id, ALICE)).toBe('owner');
    });
  });

  // ── H7: project collaboration ──────────────────────────────────────────────

  describe('/api/projects/:id/members', () => {
    it('a non-member gets 404, not 403 — same body as a missing project', async () => {
      const p = await newProject([[ALICE, 'owner']]);
      const real = await call('GET', `/api/projects/${p}/members`, CAROL, 'analyst');
      const missing = await call('GET', `/api/projects/${randomUUID()}/members`, CAROL, 'analyst');
      expect(real.status).toBe(404);
      expect(real.body).toEqual(missing.body);
      // negative control: a member lists them
      const ok = await call('GET', `/api/projects/${p}/members`, ALICE, 'analyst');
      expect(ok.status).toBe(200);
      expect((ok.body as unknown[]).length).toBe(1);
    });

    it('a plain member cannot add members, change roles or remove the owner', async () => {
      const p = await newProject([[ALICE, 'owner'], [BOB, 'member']]);
      expect((await call('POST', `/api/projects/${p}/members`, BOB, 'analyst', { userId: CAROL, role: 'owner' })).status).toBe(403);
      expect(await roleOf(p, CAROL)).toBeUndefined();
      expect((await call('PATCH', `/api/projects/${p}/members/${await memberId(p, BOB)}`, BOB, 'analyst', { role: 'owner' })).status).toBe(403);
      expect(await roleOf(p, BOB)).toBe('member');
      expect((await call('DELETE', `/api/projects/${p}/members/${await memberId(p, ALICE)}`, BOB, 'analyst')).status).toBe(403);
      expect(await roleOf(p, ALICE)).toBe('owner');
    });

    it('the owner cannot demote or remove the LAST owner — nor can an admin', async () => {
      const p = await newProject([[ALICE, 'owner'], [BOB, 'member']]);
      const alice = await memberId(p, ALICE);
      const demote = await call('PATCH', `/api/projects/${p}/members/${alice}`, ALICE, 'analyst', { role: 'member' });
      expect(demote.status).toBe(409);
      expect((await call('DELETE', `/api/projects/${p}/members/${alice}`, ALICE, 'analyst')).status).toBe(409);
      expect((await call('DELETE', `/api/projects/${p}/members/${alice}`, ROOT, 'admin')).status).toBe(409);
      expect(await roleOf(p, ALICE)).toBe('owner');
    });

    it('negative control: with a second owner, the first can step down and then be removed', async () => {
      const p = await newProject([[ALICE, 'owner'], [BOB, 'member']]);
      expect((await call('PATCH', `/api/projects/${p}/members/${await memberId(p, BOB)}`, ALICE, 'analyst', { role: 'owner' })).status).toBe(200);
      expect((await call('PATCH', `/api/projects/${p}/members/${await memberId(p, ALICE)}`, ALICE, 'analyst', { role: 'member' })).status).toBe(200);
      expect(await roleOf(p, ALICE)).toBe('member');
      expect((await call('DELETE', `/api/projects/${p}/members/${await memberId(p, ALICE)}`, BOB, 'analyst')).status).toBe(200);
      expect(await roleOf(p, ALICE)).toBeUndefined();
      expect(await roleOf(p, BOB)).toBe('owner');
    });

    it('two concurrent demotions of the only two owners leave exactly one owner', async () => {
      const p = await newProject([[X, 'owner'], [Y, 'owner']]);
      const [mx, my] = [await memberId(p, X), await memberId(p, Y)];
      const results = await Promise.all([
        call('PATCH', `/api/projects/${p}/members/${mx}`, ROOT, 'admin', { role: 'member' }),
        call('PATCH', `/api/projects/${p}/members/${my}`, ROOT, 'admin', { role: 'member' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const owners = await db.all("SELECT id FROM project_members WHERE project_id = ? AND role = 'owner'", p);
      expect(owners).toHaveLength(1);
    });

    it('an unknown role is 400 and an unknown member is 404', async () => {
      const p = await newProject([[ALICE, 'owner'], [BOB, 'member']]);
      expect((await call('PATCH', `/api/projects/${p}/members/${await memberId(p, BOB)}`, ALICE, 'analyst', { role: 'superuser' })).status).toBe(400);
      expect((await call('POST', `/api/projects/${p}/members`, ALICE, 'analyst', { userId: CAROL, role: 'superuser' })).status).toBe(400);
      expect((await call('PATCH', `/api/projects/${p}/members/${randomUUID()}`, ALICE, 'analyst', { role: 'member' })).status).toBe(404);
      expect((await call('DELETE', `/api/projects/${p}/members/${randomUUID()}`, ALICE, 'analyst')).status).toBe(404);
    });

    it('the invitation list no longer hands every member the acceptance token', async () => {
      const p = await newProject([[ALICE, 'owner'], [BOB, 'member']]);
      await db.run(
        `INSERT INTO project_invitations (id, project_id, email, role, invited_by, token, expires_at)
         VALUES (?, ?, ?, 'member', ?, ?, NOW() + INTERVAL '1 day')`,
        randomUUID(), p, `guest-${tag}@example.test`, ALICE, `tok-${randomUUID()}`,
      );
      const r = await call('GET', `/api/projects/${p}/invitations`, BOB, 'analyst');
      expect(r.status).toBe(200);
      const rows = r.body as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe(`guest-${tag}@example.test`);
      expect(rows[0]).not.toHaveProperty('token');
    });
  });

  // ── H9: presentations ──────────────────────────────────────────────────────

  describe('/api/presentations', () => {
    it("POST records the creator, and the list shows each user only their own decks", async () => {
      const created = await call('POST', '/api/presentations', ALICE, 'analyst', { title: `Alice deck ${tag}` });
      expect(created.status).toBe(200);
      const id = (created.body as { id: string; user_id: string }).id;
      presentations.push(id);
      expect((created.body as { user_id: string }).user_id).toBe(ALICE);

      const bobs = await call('GET', '/api/presentations', BOB, 'analyst');
      expect((bobs.body as Array<{ id: string }>).map((r) => r.id)).not.toContain(id);
      // negative control: Alice sees hers
      const alices = await call('GET', '/api/presentations', ALICE, 'analyst');
      expect((alices.body as Array<{ id: string }>).map((r) => r.id)).toContain(id);
    });

    it("another user's PATCH and DELETE are 404; the owner's succeed", async () => {
      const deck = await newDeck(ALICE);
      const p = await call('PATCH', `/api/presentations/${deck.id}`, BOB, 'analyst', { title: 'pwned' });
      const missing = await call('PATCH', `/api/presentations/${randomUUID()}`, BOB, 'analyst', { title: 'pwned' });
      expect(p.status).toBe(404);
      expect(p.body).toEqual(missing.body);
      expect((await call('DELETE', `/api/presentations/${deck.id}`, BOB, 'analyst')).status).toBe(404);
      expect(await db.get('SELECT id FROM presentations WHERE id = ?', deck.id)).toBeTruthy();
      expect(fs.existsSync(deck.filePath)).toBe(true);

      expect((await call('PATCH', `/api/presentations/${deck.id}`, ALICE, 'analyst', { title: 'Alice edit' })).status).toBe(200);
      expect((await call('DELETE', `/api/presentations/${deck.id}`, ALICE, 'analyst')).status).toBe(200);
      expect(await db.get('SELECT id FROM presentations WHERE id = ?', deck.id)).toBeUndefined();
      expect(fs.existsSync(deck.filePath)).toBe(false);
    });

    it("a download by file name cannot reach another user's deck; the owner and an admin can", async () => {
      const deck = await newDeck(ALICE);
      const bob = await call('GET', `/api/presentations/download/${deck.filename}`, BOB, 'analyst');
      const nothing = await call('GET', `/api/presentations/download/presentation_${randomUUID()}.pptx`, BOB, 'analyst');
      expect(bob.status).toBe(404);
      expect(bob.body).toEqual(nothing.body);
      expect(bob.text).not.toContain('deck-of');

      const alice = await call('GET', `/api/presentations/download/${deck.filename}`, ALICE, 'analyst');
      expect(alice.status).toBe(200);
      expect(alice.text).toBe(`deck-of-${ALICE}`);
      expect((await call('GET', `/api/presentations/download/${deck.filename}`, ROOT, 'admin')).status).toBe(200);
    });

    it("a user cannot point their own row at someone else's file and download it through that", async () => {
      const alices = await newDeck(ALICE);
      const bobs = await newDeck(BOB, false);
      const r = await call('PATCH', `/api/presentations/${bobs.id}`, BOB, 'analyst', { filename: alices.filename, filePath: alices.filePath });
      expect(r.status).toBe(400);
      expect((await db.get<{ filename: string }>('SELECT filename FROM presentations WHERE id = ?', bobs.id))?.filename).toBe(bobs.filename);
      expect((await call('GET', `/api/presentations/download/${alices.filename}`, BOB, 'analyst')).status).toBe(404);
    });

    it("generate refuses another user's row, and a scoped caller without a row; the owner generates", async () => {
      const alices = await newDeck(ALICE, false);
      const brief = { title: 'T', purpose: 'P', audience: 'A', coreMessage: 'C', keyMessages: ['k'], tone: 't', style: 's', slideCount: 3, timeMinutes: 5, suggestedStructure: [] };
      const bob = await call('POST', '/api/presentations/generate', BOB, 'analyst', { id: alices.id, brief });
      expect(bob.status).toBe(404);
      expect((await db.get<{ filename: string; status: string }>('SELECT filename, status FROM presentations WHERE id = ?', alices.id))?.filename).toBe(alices.filename);
      expect((await call('POST', '/api/presentations/generate', BOB, 'analyst', { brief })).status).toBe(400);

      const alice = await call('POST', '/api/presentations/generate', ALICE, 'analyst', { id: alices.id, brief });
      expect(alice.status).toBe(200);
      const filename = (alice.body as { filename: string }).filename;
      const row = await db.get<{ filename: string; status: string }>('SELECT filename, status FROM presentations WHERE id = ?', alices.id);
      expect(row).toEqual({ filename, status: 'ready' });
      expect((await call('GET', `/api/presentations/download/${filename}`, ALICE, 'analyst')).text).toBe('PPTX-BYTES');
    });

    it('a legacy row with no owner is admin-only in team mode', async () => {
      const legacy = await newDeck(null);
      const bob = await call('GET', '/api/presentations', BOB, 'analyst');
      expect((bob.body as Array<{ id: string }>).map((r) => r.id)).not.toContain(legacy.id);
      expect((await call('GET', `/api/presentations/download/${legacy.filename}`, BOB, 'analyst')).status).toBe(404);
      const admin = await call('GET', '/api/presentations', ROOT, 'admin');
      expect((admin.body as Array<{ id: string }>).map((r) => r.id)).toContain(legacy.id);
    });

    it('solo mode is unscoped: every deck — legacy, Alice\'s, Bob\'s — is listed and downloadable', async () => {
      const legacy = await newDeck(null);
      const alices = await newDeck(ALICE);
      const bobs = await newDeck(BOB);
      solo();
      const list = await call('GET', '/api/presentations', 'solo', 'admin');
      const ids = (list.body as Array<{ id: string }>).map((r) => r.id);
      for (const deck of [legacy, alices, bobs]) {
        expect(ids).toContain(deck.id);
        expect((await call('GET', `/api/presentations/download/${deck.filename}`, 'solo', 'admin')).status).toBe(200);
      }
      // A deck generated with no row still downloads by name in solo, as before.
      const orphan = `presentation_${randomUUID()}.pptx`;
      fs.writeFileSync(path.join(outputDir, orphan), 'orphan');
      expect((await call('GET', `/api/presentations/download/${orphan}`, 'solo', 'admin')).status).toBe(200);
    });

    it('DELETE removes the file only when it lies inside OUTPUT_DIR', async () => {
      solo();
      const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'anton-outside-')), 'keep.txt');
      fs.writeFileSync(outside, 'must survive');
      const deck = await newDeck('solo', false);
      expect((await call('PATCH', `/api/presentations/${deck.id}`, 'solo', 'admin', { filePath: outside })).status).toBe(200);
      expect((await call('DELETE', `/api/presentations/${deck.id}`, 'solo', 'admin')).status).toBe(200);
      expect(await db.get('SELECT id FROM presentations WHERE id = ?', deck.id)).toBeUndefined();
      expect(fs.existsSync(outside)).toBe(true);
      fs.rmSync(path.dirname(outside), { recursive: true, force: true });
    });
  });
});
