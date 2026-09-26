/**
 * evidence-pack-scope-isolation.db.test.ts — an evidence pack can only hold
 * what its creator may read (round-1 verifier gaps, 2026-09-23, "verify:projects"
 * and "verify:audit-trail").
 *
 * Before: POST /api/evidence-pack and /:id/scope/add validated a scope for shape
 * only, and the collector reads by id alone. On a team server any analyst could
 * name a colleague's session, project, assessment, engagement, task or mission,
 * then /collect and /export it — messages, thinking and composed prompts
 * verbatim. The pack-owner check also answered 403 for someone else's pack and
 * 404 for a missing one, so a pack id could be tested for existence.
 *
 * Against the real schema, through the production PostgreSQL adapter:
 *   - team mode, Alice (analyst): every foreign root type answers the same 404
 *     as a missing id, at create and at scope/add, and no pack row is written;
 *   - a pack whose stored scope names Bob's session (one created before this
 *     check) answers 404 at collect, preview and export, and none of Bob's text
 *     leaves the server;
 *   - Bob's pack answers Alice the same 404 as a missing pack id;
 *   - negative controls: Alice packs, collects and exports her own session; a
 *     project she is a member of and an engagement filed under it; Bob collects
 *     his own; an admin and solo mode pack Bob's session exactly as before.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

interface Caller { id: string; role: 'admin' | 'analyst' | 'viewer' }
interface Reply { status: number; body: Record<string, unknown>; text: string }

d('evidence packs — scope roots belong to the caller (team mode)', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';
  let current: Caller | null = null;
  const originalMode = process.env.DEPLOYMENT_MODE;

  const tag = randomUUID().slice(0, 8);
  const ALICE: Caller = { id: `u_ep_alice_${tag}`, role: 'analyst' };
  const BOB: Caller = { id: `u_ep_bob_${tag}`, role: 'analyst' };
  const ROOT: Caller = { id: `u_ep_root_${tag}`, role: 'admin' };
  const CAROL: Caller = { id: `u_ep_carol_${tag}`, role: 'analyst' };
  const USERS = [ALICE, BOB, ROOT, CAROL].map((u) => u.id);

  const sA = `s_ep_a_${tag}`;
  const sB = `s_ep_b_${tag}`;
  const sShared = `s_ep_shared_${tag}`;
  const pB = `p_ep_b_${tag}`;           // Bob's project; Alice is not in it
  const pShared = `p_ep_shared_${tag}`; // Bob owns it, Alice is a member
  const gB = `g_ep_b_${tag}`;
  const eB = `e_ep_b_${tag}`;
  const eShared = `e_ep_shared_${tag}`; // Bob's engagement, filed under pShared
  const tB = `t_ep_b_${tag}`;
  const mB = `m_ep_b_${tag}`;
  const ALICE_TEXT = `ALICE-OWN-TEXT-${tag}`;
  const BOB_SECRET = `BOB-SECRET-TEXT-${tag}`;

  beforeAll(async () => {
    // middleware/auth.ts (requireAuth) throws at import when JWT_SECRET is unset.
    process.env.JWT_SECRET = process.env.JWT_SECRET || `test-secret-evidence-pack-scope-${tag}-0123456789`;
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });

    for (const u of USERS) await db.run('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)', u, u, 'x');
    for (const id of [pB, pShared]) {
      await db.run('INSERT INTO projects (id, name, user_id) VALUES (?, ?, ?)', id, `EP project ${id}`, BOB.id);
    }
    await db.run("INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, 'owner')", randomUUID(), pB, BOB.id);
    await db.run("INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, 'owner')", randomUUID(), pShared, BOB.id);
    await db.run("INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, 'member')", randomUUID(), pShared, ALICE.id);

    for (const [id, owner, project] of [[sA, ALICE.id, null], [sB, BOB.id, pB], [sShared, BOB.id, pShared]] as const) {
      await db.run("INSERT INTO sessions (id, module_id, title, user_id, project_id) VALUES (?, 'open-chat', 'ep test', ?, ?)", id, owner, project);
    }
    await db.run("INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, 'user', ?)", `msg_a_${tag}`, sA, ALICE_TEXT);
    await db.run("INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, 'user', ?)", `msg_b_${tag}`, sB, BOB_SECRET);

    await db.run("INSERT INTO gap_assessments (id, title, user_id) VALUES (?, 'ep test', ?)", gB, BOB.id);
    await db.run("INSERT INTO engagements (id, title, user_id) VALUES (?, 'ep test', ?)", eB, BOB.id);
    await db.run("INSERT INTO engagements (id, title, user_id, project_id) VALUES (?, 'ep shared', ?, ?)", eShared, BOB.id, pShared);
    await db.run("INSERT INTO anton_tasks (id, user_id, title, description) VALUES (?, ?, 'ep test', ?)", tB, BOB.id, BOB_SECRET);
    await db.run(
      "INSERT INTO missions.missions (id, title, objective, success_criteria, created_by) VALUES (?, 'ep test', ?, 'done', ?)",
      mB, BOB_SECRET, BOB.id,
    );

    const { createEvidencePackRoutes } = await import('../../server/routes/evidence-pack.js');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (current) req.user = { id: current.id, username: current.id, role: current.role };
      next();
    });
    app.use('/api', createEvidencePackRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (!db) return;
    const inUsers = USERS.map(() => '?').join(',');
    await db.run(`DELETE FROM evidence_packs WHERE created_by IN (${inUsers})`, ...USERS).catch(() => {});
    await db.run('DELETE FROM missions.missions WHERE id = ?', mB).catch(() => {});
    await db.run('DELETE FROM anton_tasks WHERE id = ?', tB).catch(() => {});
    await db.run('DELETE FROM engagements WHERE id IN (?, ?)', eB, eShared).catch(() => {});
    await db.run('DELETE FROM gap_assessments WHERE id = ?', gB).catch(() => {});
    await db.run('DELETE FROM sessions WHERE id IN (?, ?, ?)', sA, sB, sShared).catch(() => {});
    await db.run('DELETE FROM projects WHERE id IN (?, ?)', pB, pShared).catch(() => {});
    await db.run(`DELETE FROM users WHERE id IN (${inUsers})`, ...USERS).catch(() => {});
    await db.close();
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  });

  function team(): void { process.env.DEPLOYMENT_MODE = 'team'; }
  function solo(): void { delete process.env.DEPLOYMENT_MODE; }

  async function call(method: string, path: string, as: Caller, body?: unknown): Promise<Reply> {
    current = as;
    const r = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { /* an export */ }
    return { status: r.status, body: parsed, text };
  }

  async function packCount(user: string): Promise<number> {
    const row = await db.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM evidence_packs WHERE created_by = ?', user);
    return Number(row?.n ?? 0);
  }

  async function createPack(as: Caller, scope: Record<string, unknown>): Promise<Reply> {
    return call('POST', '/evidence-pack', as, { title: `EP ${tag}`, scope });
  }

  /** A pack row written straight to the table — as one created before this check. */
  async function storedPack(owner: string, scope: Record<string, unknown>): Promise<string> {
    const id = `EP-test-${randomUUID().slice(0, 12)}`;
    await db.run(
      `INSERT INTO evidence_packs (id, title, scope_type, scope_ref, created_by) VALUES (?, 'stored', ?, ?::jsonb, ?)`,
      id, String(scope.type), JSON.stringify(scope), owner,
    );
    return id;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  const foreignRoots: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ['session', { type: 'session', sessionId: sB, includePrompts: true }, { type: 'session', sessionId: `missing_${tag}` }],
    ['project', { type: 'project', projectId: pB }, { type: 'project', projectId: `missing_${tag}` }],
    ['gap_assessment', { type: 'gap_assessment', assessmentId: gB }, { type: 'gap_assessment', assessmentId: `missing_${tag}` }],
    ['engagement', { type: 'engagement', engagementId: eB }, { type: 'engagement', engagementId: `missing_${tag}` }],
    ['task', { type: 'task', taskId: tB }, { type: 'task', taskId: `missing_${tag}` }],
    ['mission', { type: 'mission', missionId: mB }, { type: 'mission', missionId: `missing_${tag}` }],
  ];

  for (const [kind, foreign, missing] of foreignRoots) {
    it(`create: another user's ${kind} answers the same 404 as a missing one, and no pack is written`, async () => {
      team();
      const before = await packCount(ALICE.id);
      const a = await createPack(ALICE, foreign);
      const b = await createPack(ALICE, missing);
      expect(a.status, kind).toBe(404);
      expect(a.body, kind).toEqual({ error: 'Scope not found' });
      expect(b.status, kind).toBe(404);
      expect(b.body, kind).toEqual(a.body);
      expect(await packCount(ALICE.id)).toBe(before);
    });
  }

  it('create: a custom list is refused when any one entry is foreign', async () => {
    team();
    const before = await packCount(ALICE.id);
    const r = await createPack(ALICE, { type: 'custom', items: [{ table: 'sessions', id: sA }, { table: 'sessions', id: sB }] });
    expect(r.status).toBe(404);
    expect(await packCount(ALICE.id)).toBe(before);
    // A table name that only passes the schema's `in` check is refused too.
    const proto = await createPack(ALICE, { type: 'custom', items: [{ table: 'toString', id: sB }] });
    expect(proto.status).toBe(404);
  });

  // ── scope/add ─────────────────────────────────────────────────────────────

  it("scope/add: Bob's session answers 404 and the stored scope does not change", async () => {
    team();
    const created = await createPack(ALICE, { type: 'session', sessionId: sA });
    expect(created.status).toBe(201);
    const id = String((created.body.pack as { id: string }).id);
    const r = await call('POST', `/evidence-pack/${id}/scope/add`, ALICE, { scope: { type: 'session', sessionId: sB } });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Scope not found' });
    const row = await db.get<{ scope_type: string; scope_ref: unknown }>('SELECT scope_type, scope_ref FROM evidence_packs WHERE id = ?', id);
    expect(row?.scope_type).toBe('session');
    expect(JSON.stringify(row?.scope_ref)).not.toContain(sB);

    // Negative control: a project Alice is a member of is accepted.
    const ok = await call('POST', `/evidence-pack/${id}/scope/add`, ALICE, { scope: { type: 'project', projectId: pShared } });
    expect(ok.status).toBe(200);
    expect(ok.body.added).toBe(true);
  });

  // ── A stored foreign scope (a pack created before this check) ────────────

  it('collect, preview and export refuse a stored scope that names another user\'s session', async () => {
    team();
    const id = await storedPack(ALICE.id, { type: 'session', sessionId: sB, includePrompts: true });
    for (const [method, path, body] of [
      ['POST', `/evidence-pack/${id}/collect`, undefined],
      ['POST', `/evidence-pack/${id}/preview`, undefined],
      ['POST', `/evidence-pack/${id}/export`, { format: 'jsonl' }],
    ] as const) {
      const r = await call(method, path, ALICE, body);
      expect(r.status, path).toBe(404);
      expect(r.body, path).toEqual({ error: 'Scope not found' });
      expect(r.text, path).not.toContain(BOB_SECRET);
    }
    const items = await db.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM evidence_pack_items WHERE pack_id = ?', id);
    expect(Number(items?.n)).toBe(0);

    // Negative control: an admin collects the same stored pack.
    const admin = await call('POST', `/evidence-pack/${id}/collect`, ROOT);
    expect(admin.status).toBe(200);
  });

  // ── Pack owner check ─────────────────────────────────────────────────────

  it("Bob's pack answers Alice the same 404 as a missing pack id", async () => {
    team();
    const bobs = await storedPack(BOB.id, { type: 'session', sessionId: sB });
    const foreign = await call('GET', `/evidence-pack/${bobs}`, ALICE);
    const missing = await call('GET', `/evidence-pack/EP-missing-${tag}`, ALICE);
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: 'Pack not found' });
    expect(missing.body).toEqual(foreign.body);
    expect((await call('POST', `/evidence-pack/${bobs}/collect`, ALICE)).status).toBe(404);

    // Negative controls: Bob and an admin open it; Bob collects his own session.
    expect((await call('GET', `/evidence-pack/${bobs}`, BOB)).status).toBe(200);
    expect((await call('GET', `/evidence-pack/${bobs}`, ROOT)).status).toBe(200);
    const collected = await call('POST', `/evidence-pack/${bobs}/collect`, BOB);
    expect(collected.status).toBe(200);
    expect(Number(collected.body.itemCount)).toBeGreaterThan(0);
  });

  // ── Negative controls ────────────────────────────────────────────────────

  it('Alice packs, collects and exports her own session', async () => {
    team();
    const created = await createPack(ALICE, { type: 'session', sessionId: sA });
    expect(created.status).toBe(201);
    const id = String((created.body.pack as { id: string }).id);
    const collected = await call('POST', `/evidence-pack/${id}/collect`, ALICE);
    expect(collected.status).toBe(200);
    expect(Number(collected.body.itemCount)).toBeGreaterThan(0);
    const exported = await call('POST', `/evidence-pack/${id}/export`, ALICE, { format: 'jsonl' });
    expect(exported.status).toBe(200);
    expect(exported.text).toContain(ALICE_TEXT);
    expect(exported.text).not.toContain(BOB_SECRET);
  });

  it('a project Alice is a member of, and an engagement filed under it, can be packed', async () => {
    team();
    for (const scope of [{ type: 'project', projectId: pShared }, { type: 'engagement', engagementId: eShared }]) {
      const created = await createPack(ALICE, scope);
      expect(created.status, scope.type).toBe(201);
      const id = String((created.body.pack as { id: string }).id);
      expect((await call('POST', `/evidence-pack/${id}/collect`, ALICE)).status, scope.type).toBe(200);
    }
  });

  it("an admin on the team server packs Bob's session exactly as before", async () => {
    team();
    const created = await createPack(ROOT, { type: 'session', sessionId: sB });
    expect(created.status).toBe(201);
    const id = String((created.body.pack as { id: string }).id);
    expect((await call('POST', `/evidence-pack/${id}/collect`, ROOT)).status).toBe(200);
    const exported = await call('POST', `/evidence-pack/${id}/export`, ROOT, { format: 'jsonl' });
    expect(exported.status).toBe(200);
    expect(exported.text).toContain(BOB_SECRET);
  });

  it("solo mode is not scoped: any root can be packed, collected and exported", async () => {
    solo();
    const created = await createPack(CAROL, { type: 'session', sessionId: sB });
    expect(created.status).toBe(201);
    const id = String((created.body.pack as { id: string }).id);
    expect((await call('POST', `/evidence-pack/${id}/collect`, CAROL)).status).toBe(200);
    const exported = await call('POST', `/evidence-pack/${id}/export`, CAROL, { format: 'jsonl' });
    expect(exported.status).toBe(200);
    expect(exported.text).toContain(BOB_SECRET);
  });
});
