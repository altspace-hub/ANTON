/**
 * project-invitation-after-removal.db.test.ts — a person removed from a project
 * cannot walk back in through an invitation (round-2 gap "verify2:projects-2").
 *
 * Before: an owner could invite their own address as 'owner', be removed by a
 * co-owner, then open GET /api/projects/invitations/accept/<token> and be added
 * back as owner — the accept route never asked whether the sender could still
 * give that role. Two fixes, exercised against the real schema:
 *   - removing a member (or taking them out of the owner role) revokes, in the
 *     same transaction, the project's pending invitations they SENT and the ones
 *     ADDRESSED to them (team mode);
 *   - acceptance re-checks the sender: only a current owner of the project, or
 *     an instance admin, can still vouch for an invitation. That also covers
 *     invitations left pending by removals made before the first fix.
 *
 * Signing in accepts the pending invitations addressed to the account's email
 * (auth.ts acceptPendingInvitations — password sign-in, SSO and registration).
 * It applies the same sender re-check: one whose sender can no longer give the
 * role is revoked, not accepted.
 *
 * Negative controls: an invitation from a current owner, and one from an
 * instance admin, are still accepted; solo mode revokes nothing and accepts as
 * before.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import type { Server } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

// Sign-in issues a session token (the /auth/login case below).
vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-project-invitation-after-removal';
});

vi.mock('../../server/services/email.js', () => ({ sendProjectInvitationEmail: vi.fn(async () => undefined) }));

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const tag = randomUUID().slice(0, 8);
const ALICE = `u-pia-alice-${tag}`;   // owner who gets removed
const BOB = `u-pia-bob-${tag}`;       // co-owner who stays
const CAROL = `u-pia-carol-${tag}`;   // someone being invited
const DAVE = `u-pia-dave-${tag}`;     // someone being invited
const ROOT = `u-pia-root-${tag}`;     // instance admin, not a member
const EVE = `u-pia-eve-${tag}`;       // signs in with invitations waiting (no other test invites her)
const USERS = [ALICE, BOB, CAROL, DAVE, ROOT, EVE];
const email = (u: string) => `${u}@example.test`;

const originalMode = process.env.DEPLOYMENT_MODE;

let db: DatabaseAdapter;
let server: Server;
let base = '';
const projects: string[] = [];

type Access = 'ok' | 'not_found' | 'forbidden';
let resolveProjectAccess: (db: DatabaseAdapter, input: { projectId: string; userId: string; userRole?: string | null; teamMode: boolean }) => Promise<Access>;

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

/** Opens the accept link the way a browser would, without following the redirect. */
async function accept(token: string): Promise<string> {
  const r = await fetch(`${base}/api/projects/invitations/accept/${token}`, { redirect: 'manual' });
  expect(r.status).toBe(302);
  return r.headers.get('location') ?? '';
}

async function newProject(members: Array<[string, string]>): Promise<string> {
  const id = randomUUID();
  projects.push(id);
  await db.run('INSERT INTO projects (id, name, user_id) VALUES (?, ?, ?)', id, `PIA ${id.slice(0, 6)}`, members[0]?.[0] ?? 'default');
  for (const [user, role] of members) {
    await db.run('INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)', randomUUID(), id, user, role);
  }
  return id;
}

/** A pending invitation written straight to the table — as one sent before these fixes. */
async function storedInvitation(projectId: string, to: string, role: string, invitedBy: string): Promise<string> {
  const token = randomBytes(16).toString('hex');
  await db.run(
    `INSERT INTO project_invitations (id, project_id, email, role, invited_by, token, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW() + interval '7 days')`,
    randomUUID(), projectId, email(to), role, invitedBy, token,
  );
  return token;
}

async function memberId(projectId: string, userId: string): Promise<string> {
  const row = await db.get<{ id: string }>('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?', projectId, userId);
  if (!row) throw new Error('no such member');
  return row.id;
}

async function roleIn(projectId: string, userId: string): Promise<string | null> {
  return (await db.get<{ role: string }>('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', projectId, userId))?.role ?? null;
}

async function invitationStatus(token: string): Promise<string | undefined> {
  return (await db.get<{ status: string }>('SELECT status FROM project_invitations WHERE token = ?', token))?.status;
}

d('an invitation cannot bring a removed person back', () => {
  beforeAll(async () => {
    team();
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    for (const u of USERS) {
      await db.run('INSERT INTO users (id, username, password_hash, email, role) VALUES (?, ?, ?, ?, ?)',
        u, u, 'x', email(u), u === ROOT ? 'admin' : 'analyst');
    }
    ({ resolveProjectAccess } = await import('../../server/services/project-context.js'));
    const { createProjectCollaborationRoutes } = await import('../../server/routes/project-collaboration.js');
    const { createAuthRoutes } = await import('../../server/routes/auth.js');
    const app = express();
    app.use(express.json());
    app.use(rateLimit({ windowMs: 60_000, limit: 100_000 }));
    app.use((req, _res, next) => {
      const id = req.header('x-test-user');
      if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    app.use('/api', await createProjectCollaborationRoutes(db));
    app.use('/api', await createAuthRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(() => { team(); });

  afterAll(async () => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
    if (db) {
      for (const id of projects) await db.run('DELETE FROM projects WHERE id = ?', id).catch(() => {});
      await db.run('DELETE FROM user_sessions WHERE user_id = ?', EVE).catch(() => {});
      await db.run('DELETE FROM login_attempts WHERE username = ?', EVE).catch(() => {});
      for (const u of USERS) await db.run('DELETE FROM users WHERE id = ?', u).catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  });

  it('self-invite, get removed, accept: the invitation was revoked and she stays out', async () => {
    const p = await newProject([[ALICE, 'owner'], [BOB, 'owner']]);
    const sent = await call('POST', `/api/projects/${p}/invitations`, ALICE, 'analyst', { email: email(ALICE), role: 'owner' });
    expect(sent.status).toBe(200);
    const token = String((sent.body as { token: string }).token);

    expect((await call('DELETE', `/api/projects/${p}/members/${await memberId(p, ALICE)}`, BOB, 'analyst')).status).toBe(200);
    expect(await invitationStatus(token)).toBe('revoked');
    expect(await accept(token)).toContain('error=invitation_invalid_or_expired');
    expect(await roleIn(p, ALICE)).toBeNull();
    expect(await resolveProjectAccess(db, { projectId: p, userId: ALICE, userRole: 'analyst', teamMode: true })).toBe('forbidden');
  });

  it('acceptance re-checks the sender: an invitation left pending by an earlier removal is refused and retired', async () => {
    // As left by a removal made before revocation existed: the row is simply gone.
    const p = await newProject([[BOB, 'owner'], [ALICE, 'owner']]);
    const self = await storedInvitation(p, ALICE, 'owner', ALICE);
    const forCarol = await storedInvitation(p, CAROL, 'owner', ALICE);
    await db.run('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', p, ALICE);

    expect(await accept(self)).toContain('error=invitation_invalid_or_expired');
    expect(await roleIn(p, ALICE)).toBeNull();
    expect(await invitationStatus(self)).toBe('revoked');
    // Nor can she hand out what she no longer holds.
    expect(await accept(forCarol)).toContain('error=invitation_invalid_or_expired');
    expect(await roleIn(p, CAROL)).toBeNull();
  });

  it('demotion from owner revokes the invitations she sent; a demoted sender cannot vouch at acceptance', async () => {
    const p = await newProject([[ALICE, 'owner'], [BOB, 'owner']]);
    const sent = await call('POST', `/api/projects/${p}/invitations`, ALICE, 'analyst', { email: email(CAROL), role: 'owner' });
    const token = String((sent.body as { token: string }).token);
    const r = await call('PATCH', `/api/projects/${p}/members/${await memberId(p, ALICE)}`, BOB, 'analyst', { role: 'member' });
    expect(r.status).toBe(200);
    expect(await invitationStatus(token)).toBe('revoked');
    expect(await accept(token)).toContain('error=invitation_invalid_or_expired');
    expect(await roleIn(p, CAROL)).toBeNull();

    // One written directly (pre-fix) by the now-member Alice is refused at acceptance too.
    const legacy = await storedInvitation(p, DAVE, 'owner', ALICE);
    expect(await accept(legacy)).toContain('error=invitation_invalid_or_expired');
    expect(await roleIn(p, DAVE)).toBeNull();
  });

  it('negative control: an invitation from a current owner is accepted with its role', async () => {
    const p = await newProject([[ALICE, 'owner'], [BOB, 'owner']]);
    const sent = await call('POST', `/api/projects/${p}/invitations`, BOB, 'analyst', { email: email(CAROL), role: 'member' });
    expect(sent.status).toBe(200);
    const token = String((sent.body as { token: string }).token);
    // Removing someone else leaves Bob's invitation alone.
    expect((await call('DELETE', `/api/projects/${p}/members/${await memberId(p, ALICE)}`, BOB, 'analyst')).status).toBe(200);
    expect(await invitationStatus(token)).toBe('pending');
    expect(await accept(token)).toContain('invitation_accepted=true');
    expect(await roleIn(p, CAROL)).toBe('member');
    expect(await invitationStatus(token)).toBe('accepted');
  });

  it('negative control: an instance admin who is not a member can still invite', async () => {
    const p = await newProject([[BOB, 'owner']]);
    const sent = await call('POST', `/api/projects/${p}/invitations`, ROOT, 'admin', { email: email(DAVE), role: 'viewer' });
    expect(sent.status).toBe(200);
    expect(await accept(String((sent.body as { token: string }).token))).toContain('invitation_accepted=true');
    expect(await roleIn(p, DAVE)).toBe('viewer');
  });

  it('solo mode: removal revokes nothing and acceptance does not re-check the sender, as before', async () => {
    solo();
    const p = await newProject([[ALICE, 'owner'], [BOB, 'owner']]);
    const self = await storedInvitation(p, ALICE, 'owner', ALICE);
    const r = await call('DELETE', `/api/projects/${p}/members/${await memberId(p, ALICE)}`, 'solo', 'admin');
    expect(r.status).toBe(200);
    expect(await invitationStatus(self)).toBe('pending');
    expect(await accept(self)).toContain('invitation_accepted=true');
    expect(await roleIn(p, ALICE)).toBe('owner');
  });

  it('signing in applies the same rule: a stale invitation is revoked, a valid one is accepted', async () => {
    const stale = await newProject([[BOB, 'owner'], [ALICE, 'owner']]);
    const valid = await newProject([[BOB, 'owner']]);
    const fromRemoved = await storedInvitation(stale, EVE, 'owner', ALICE);
    const fromOwner = await storedInvitation(valid, EVE, 'member', BOB);
    await db.run('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', stale, ALICE);

    const bcrypt = await import('bcryptjs');
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.default.hash('Secret123!', 4), EVE);
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: EVE, password: 'Secret123!' }),
    });
    expect(login.status).toBe(200);

    // Sign-in accepts invitations after it answers (fire-and-forget): wait for both.
    for (let i = 0; i < 50 && ((await invitationStatus(fromRemoved)) === 'pending' || (await invitationStatus(fromOwner)) === 'pending'); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(await invitationStatus(fromRemoved)).toBe('revoked');
    expect(await roleIn(stale, EVE)).toBeNull();
    // Negative control: the current owner's invitation is accepted at the same sign-in.
    expect(await invitationStatus(fromOwner)).toBe('accepted');
    expect(await roleIn(valid, EVE)).toBe('member');
  });
});
