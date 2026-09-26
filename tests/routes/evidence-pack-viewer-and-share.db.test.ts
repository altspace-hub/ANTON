/**
 * evidence-pack-viewer-and-share.db.test.ts — project packs need an editing
 * role, and a pack's stored scope is re-checked against its creator whenever it
 * is shown or shared (round-2 gaps "verify2:projects-2").
 *
 * 1. A 'viewer' member of a project could pack the project (or an engagement
 *    filed under it): every colleague's transcript, thinking and — with
 *    includePrompts — composed prompt, which carries their own atoms, profile
 *    layer and uploaded documents. A project or engagement root now needs an
 *    editing role (owner / admin / member); a viewer gets the same 404 as for
 *    a missing root and packs their own sessions instead.
 * 2. A pack created before scope roots were checked could still be read: GET
 *    /evidence-pack/:id returned its stored item summaries, and a share's
 *    index, item and download routes served it to someone outside the
 *    instance. Now the stored roots are re-checked — against the caller for the
 *    internal view, against the pack's creator for a share — and a pack that
 *    fails answers like a missing one; the refused share access is logged.
 *
 * Negative controls: an editing member, the owner, an admin and solo mode pack
 * the project; a viewer packs their own session; a share of a pack whose roots
 * its creator can read, one created by an admin, and any share in solo mode are
 * served as before.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

interface Caller { id: string; role: 'admin' | 'analyst' | 'viewer' }
interface Reply { status: number; body: Record<string, unknown>; text: string; type: string }

d('evidence packs — viewers, stored scopes and shares (team mode)', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';
  let current: Caller | null = null;
  const originalMode = process.env.DEPLOYMENT_MODE;

  const tag = randomUUID().slice(0, 8);
  const BOB: Caller = { id: `u_epv_bob_${tag}`, role: 'analyst' };     // project owner
  const VAL: Caller = { id: `u_epv_val_${tag}`, role: 'analyst' };     // project 'viewer'
  const MEL: Caller = { id: `u_epv_mel_${tag}`, role: 'analyst' };     // project 'member'
  const ROOT: Caller = { id: `u_epv_root_${tag}`, role: 'admin' };
  const USERS = [BOB, VAL, MEL, ROOT].map((u) => u.id);

  const p = `p_epv_${tag}`;
  const sBob = `s_epv_bob_${tag}`;
  const sVal = `s_epv_val_${tag}`;
  const eBob = `e_epv_bob_${tag}`;
  const BOB_SECRET = `BOB-PROMPT-SECRET-${tag}`;
  const VAL_TEXT = `VAL-OWN-TEXT-${tag}`;
  const packs: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || `test-secret-evidence-pack-viewer-${tag}-0123456789`;
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });

    for (const u of [BOB, VAL, MEL, ROOT]) {
      await db.run('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)', u.id, u.id, 'x', u.role);
    }
    await db.run('INSERT INTO projects (id, name, user_id) VALUES (?, ?, ?)', p, `EPV ${tag}`, BOB.id);
    for (const [user, role] of [[BOB.id, 'owner'], [VAL.id, 'viewer'], [MEL.id, 'member']] as const) {
      await db.run('INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)', randomUUID(), p, user, role);
    }
    for (const [id, owner] of [[sBob, BOB.id], [sVal, VAL.id]] as const) {
      await db.run("INSERT INTO sessions (id, module_id, title, user_id, project_id) VALUES (?, 'open-chat', 'epv', ?, ?)", id, owner, p);
    }
    await db.run("INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, 'user', ?)", `msg_epv_b_${tag}`, sBob, BOB_SECRET);
    await db.run("INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, 'user', ?)", `msg_epv_v_${tag}`, sVal, VAL_TEXT);
    await db.run("INSERT INTO engagements (id, title, user_id, project_id) VALUES (?, 'epv', ?, ?)", eBob, BOB.id, p);

    const { createEvidencePackRoutes, createSharedPackRoutes } = await import('../../server/routes/evidence-pack.js');
    const app = express();
    app.use(express.json());
    // The public share routes are mounted before auth in index.ts: no req.user.
    app.use('/api', createSharedPackRoutes(db));
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
    const created = await db.all<{ id: string }>(`SELECT id FROM evidence_packs WHERE created_by IN (${inUsers})`, ...USERS).catch(() => []);
    for (const { id } of [...created, ...packs.map((id) => ({ id }))]) {
      await db.run('DELETE FROM evidence_pack_access_log WHERE pack_id = ?', id).catch(() => {});
      await db.run('DELETE FROM evidence_pack_shares WHERE pack_id = ?', id).catch(() => {});
      await db.run('DELETE FROM evidence_packs WHERE id = ?', id).catch(() => {});
    }
    await db.run('DELETE FROM engagements WHERE id = ?', eBob).catch(() => {});
    await db.run('DELETE FROM sessions WHERE id IN (?, ?)', sBob, sVal).catch(() => {});
    await db.run('DELETE FROM projects WHERE id = ?', p).catch(() => {});
    await db.run(`DELETE FROM users WHERE id IN (${inUsers})`, ...USERS).catch(() => {});
    await db.close();
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  });

  function team(): void { process.env.DEPLOYMENT_MODE = 'team'; }
  function solo(): void { delete process.env.DEPLOYMENT_MODE; }

  async function call(method: string, path: string, as: Caller | null, body?: unknown): Promise<Reply> {
    current = as;
    const r = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const text = buf.toString('utf8');
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { /* an export */ }
    return { status: r.status, body: parsed, text, type: r.headers.get('content-type') ?? '' };
  }

  const createPack = (as: Caller, scope: Record<string, unknown>) =>
    call('POST', '/evidence-pack', as, { title: `EPV ${tag}`, scope });

  /** A pack row written straight to the table — as one created before these checks. */
  async function storedPack(owner: string, scope: Record<string, unknown>): Promise<string> {
    const id = `EP-epv-${randomUUID().slice(0, 12)}`;
    packs.push(id);
    await db.run(
      `INSERT INTO evidence_packs (id, title, scope_type, scope_ref, created_by) VALUES (?, 'stored', ?, ?::jsonb, ?)`,
      id, String(scope.type), JSON.stringify(scope), owner,
    );
    await db.run(
      `INSERT INTO evidence_pack_items (pack_id, item_type, item_table, item_id, item_hash, item_summary, item_order)
       VALUES (?, 'message', 'messages', ?, ?, ?, 0)`,
      id, `msg_epv_b_${tag}`, 'h'.repeat(64), `Message quoting ${BOB_SECRET}`,
    );
    return id;
  }

  /** A live, password-less, downloadable share of a pack. */
  async function share(packId: string, createdBy: string): Promise<string> {
    const token = randomBytes(24).toString('base64url');
    await db.run(
      `INSERT INTO evidence_pack_shares (pack_id, access_token, recipient_name, recipient_organisation, purpose, created_by, expires_at)
       VALUES (?, ?, 'Regulator', 'FSA', 'inspection', ?, NOW() + interval '7 days')`,
      packId, token, createdBy,
    );
    return token;
  }

  // ── 1. Viewers cannot pack a project or an engagement ─────────────────────

  it('a viewer gets the same 404 for the project and its engagement as for missing ones, and no pack is written', async () => {
    team();
    const count = async () => Number((await db.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM evidence_packs WHERE created_by = ?', VAL.id))?.n ?? 0);
    const before = await count();
    for (const [scope, missing] of [
      [{ type: 'project', projectId: p, includePrompts: true }, { type: 'project', projectId: `missing_${tag}` }],
      [{ type: 'engagement', engagementId: eBob, includePrompts: true }, { type: 'engagement', engagementId: `missing_${tag}` }],
    ] as const) {
      const a = await createPack(VAL, scope);
      const b = await createPack(VAL, missing);
      expect(a.status, scope.type).toBe(404);
      expect(a.body, scope.type).toEqual({ error: 'Scope not found' });
      expect(b.body, scope.type).toEqual(a.body);
    }
    expect(await count()).toBe(before);
  });

  it('a viewer packs her own session, but cannot add the project to it later', async () => {
    team();
    const created = await createPack(VAL, { type: 'session', sessionId: sVal });
    expect(created.status).toBe(201);
    const id = String((created.body.pack as { id: string }).id);
    const added = await call('POST', `/evidence-pack/${id}/scope/add`, VAL, { scope: { type: 'project', projectId: p, includePrompts: true } });
    expect(added.status).toBe(404);
    const exported = await call('POST', `/evidence-pack/${id}/export`, VAL, { format: 'jsonl' });
    expect(exported.status).toBe(200);
    expect(exported.text).toContain(VAL_TEXT);
    expect(exported.text).not.toContain(BOB_SECRET);
  });

  it("a viewer's project pack created before this check is refused at view, collect and export", async () => {
    team();
    const id = await storedPack(VAL.id, { type: 'project', projectId: p, includePrompts: true });
    for (const [method, path, body] of [
      ['GET', `/evidence-pack/${id}`, undefined],
      ['POST', `/evidence-pack/${id}/collect`, undefined],
      ['POST', `/evidence-pack/${id}/export`, { format: 'jsonl' }],
    ] as const) {
      const r = await call(method, path, VAL, body);
      expect(r.status, path).toBe(404);
      expect(r.body, path).toEqual({ error: 'Scope not found' });
      expect(r.text, path).not.toContain(BOB_SECRET);
    }
  });

  it('negative controls: an editing member, the owner and an admin pack the project; solo packs it for anyone', async () => {
    team();
    for (const as of [MEL, BOB, ROOT]) {
      const created = await createPack(as, { type: 'project', projectId: p });
      expect(created.status, as.id).toBe(201);
      const id = String((created.body.pack as { id: string }).id);
      expect((await call('POST', `/evidence-pack/${id}/collect`, as)).status, as.id).toBe(200);
      expect((await call('GET', `/evidence-pack/${id}`, as)).status, as.id).toBe(200);
    }
    expect((await createPack(MEL, { type: 'engagement', engagementId: eBob })).status).toBe(201);
    solo();
    expect((await createPack(VAL, { type: 'project', projectId: p })).status).toBe(201);
  });

  // ── 2. Shares re-check the stored scope against the pack's creator ────────

  it("a share of a viewer's stored project pack answers like a missing pack on every public route, and the refusal is logged", async () => {
    team();
    const id = await storedPack(VAL.id, { type: 'project', projectId: p, includePrompts: true });
    const token = await share(id, VAL.id);
    for (const path of [`/shared-pack/${token}`, `/shared-pack/${token}/item/msg_epv_b_${tag}`, `/shared-pack/${token}/download`]) {
      const r = await call('GET', path, null);
      expect(r.status, path).toBe(404);
      expect(r.body, path).toEqual({ error: 'Pack not found' });
      expect(r.text, path).not.toContain(BOB_SECRET);
    }
    const log = await db.all<{ success: boolean; error_reason: string | null }>(
      'SELECT success, error_reason FROM evidence_pack_access_log WHERE pack_id = ?', id,
    );
    expect(log.length).toBe(3);
    expect(log.every((l) => l.success === false && l.error_reason === 'scope_not_readable_by_creator')).toBe(true);
  });

  it('negative controls: shares whose roots the creator can read, created by an admin, or in solo mode are served', async () => {
    team();
    const own = await storedPack(BOB.id, { type: 'session', sessionId: sBob });
    // The internal view serves the stored summaries when the roots are readable.
    const view = await call('GET', `/evidence-pack/${own}`, BOB);
    expect(view.status).toBe(200);
    expect(view.text).toContain(BOB_SECRET);
    const ownToken = await share(own, BOB.id);
    const index = await call('GET', `/shared-pack/${ownToken}`, null);
    expect(index.status).toBe(200);
    const download = await call('GET', `/shared-pack/${ownToken}/download`, null);
    expect(download.status).toBe(200);
    expect(download.type).toContain('application/octet-stream');

    const byAdmin = await storedPack(ROOT.id, { type: 'project', projectId: p });
    expect((await call('GET', `/shared-pack/${await share(byAdmin, ROOT.id)}`, null)).status).toBe(200);

    const viewers = await storedPack(VAL.id, { type: 'project', projectId: p });
    const viewersToken = await share(viewers, VAL.id);
    solo();
    expect((await call('GET', `/shared-pack/${viewersToken}`, null)).status).toBe(200);
    expect((await call('GET', `/shared-pack/${viewersToken}/download`, null)).status).toBe(200);
  });
});
