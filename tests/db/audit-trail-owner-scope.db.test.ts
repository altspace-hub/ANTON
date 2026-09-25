/**
 * audit-trail-owner-scope.db.test.ts — the audit-trail owner predicates select the
 * right rows in the real schema (team-server audit 2026-09-23, B3).
 *
 * Seeds two users' trails across every kind the aggregator merges, then calls the
 * real routes through the production PostgreSQL adapter:
 *
 *   - team mode, Alice (analyst): her IRE chain, workflow run, evidence pack and
 *     rendered artifacts — including one with no created_by on her own session,
 *     and one she rendered from Bob's session — and nothing else. Not Bob's rows,
 *     not the session-less chain, not the instance's signed delivery entry.
 *   - the detail route answers 404 for each of Bob's rows and 200 for her own.
 *   - negative controls: Bob sees his own; an admin on the team server and the
 *     solo user see every seeded row, the session-less chain and the signed entry
 *     included.
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

interface Caller { id: string; role: string }
interface Entry { id: string; sessionId: string | null }

d('audit trail — owner scope against the real schema', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base: string;
  let current: Caller | null = null;
  const originalMode = process.env.DEPLOYMENT_MODE;

  const tag = randomUUID().slice(0, 8);
  const alice = `u_trail_alice_${tag}`;
  const bob = `u_trail_bob_${tag}`;
  const sA = `s_trail_a_${tag}`;
  const sB = `s_trail_b_${tag}`;
  const chA = `ch_trail_a_${tag}`;
  const chB = `ch_trail_b_${tag}`;
  const chNone = `ch_trail_none_${tag}`;
  const wfA = `wf_trail_a_${tag}`;
  const wfB = `wf_trail_b_${tag}`;
  const epA = `EP-trail-a-${tag}`;
  const epB = `EP-trail-b-${tag}`;
  const renderer = `r_trail_${tag}`;
  const signedB = `ste_trail_${tag}`;
  const art: Record<'aliceOwn' | 'aliceUnattributed' | 'bobOwn' | 'aliceOnBobs', string> = {
    aliceOwn: '', aliceUnattributed: '', bobOwn: '', aliceOnBobs: '',
  };
  // Every seeded row is newer than this, so `from` keeps other suites' rows out of
  // the admin/solo views without affecting what the scope decides.
  const from = new Date(Date.now() - 5 * 60_000).toISOString();

  const ALICE: Caller = { id: alice, role: 'analyst' };
  const BOB: Caller = { id: bob, role: 'analyst' };
  const ADMIN: Caller = { id: `u_trail_admin_${tag}`, role: 'admin' };
  const SOLO: Caller = { id: 'solo', role: 'admin' };

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });

    for (const u of [alice, bob]) {
      await db.run('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)', u, u, 'x');
    }
    await db.run("INSERT INTO sessions (id, module_id, title, user_id) VALUES (?, 'open-chat', 'trail test', ?)", sA, alice);
    await db.run("INSERT INTO sessions (id, module_id, title, user_id) VALUES (?, 'open-chat', 'trail test', ?)", sB, bob);
    for (const [id, session] of [[chA, sA], [chB, sB], [chNone, null]] as const) {
      await db.run("INSERT INTO revelation_chains (id, session_id, thinking_level) VALUES (?, ?, 'investigate')", id, session);
    }
    for (const [id, user] of [[wfA, alice], [wfB, bob]]) {
      await db.run("INSERT INTO workflow_runs (id, workflow_id, status, user_id) VALUES (?, 'wf-trail-test', 'completed', ?)", id, user);
    }
    for (const [id, user] of [[epA, alice], [epB, bob]]) {
      await db.run("INSERT INTO evidence_packs (id, title, scope_type, created_by) VALUES (?, 'trail test', 'session', ?)", id, user);
    }
    await db.run("INSERT INTO renderers (id, label, category, renderer_module) VALUES (?, 'Trail test', 'package', 'trail-test')", renderer);
    const addArtifact = async (session: string, createdBy: string | null): Promise<string> => {
      const row = await db.get<{ id: string | number }>(
        `INSERT INTO rendered_artifacts (session_id, renderer_id, file_path, file_type, mime_type, created_by)
         VALUES (?, ?, 'trail-test.md', 'md', 'text/markdown', ?) RETURNING id`,
        session, renderer, createdBy);
      return String(row!.id);
    };
    art.aliceOwn = await addArtifact(sA, alice);
    art.aliceUnattributed = await addArtifact(sA, null);   // written before created_by was set
    art.bobOwn = await addArtifact(sB, bob);
    art.aliceOnBobs = await addArtifact(sB, alice);       // e.g. a project member rendering Bob's session
    await db.run(
      `INSERT INTO community_signed_trail_entries
         (id, trail_id, task_id, entry_index, entry_type, content, content_hash, entry_hash, signature, signer_hash, signer_public_key)
       VALUES (?, ?, ?, 0, 'task_created', 'trail test', 'h', 'h', 'unsigned:h', 'signer', '')`,
      signedB, `trail_${tag}`, `task_${tag}`);

    const { createAuditTrailRoutes } = await import('../../server/routes/audit-trail.js');
    const app = express();
    app.use((req, _res, next) => {
      if (current) req.user = { id: current.id, username: current.id, role: current.role as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    app.use('/api/audit-trail', createAuditTrailRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (!db) return;
    const ids = Object.values(art).filter(Boolean);
    if (ids.length) await db.run(`DELETE FROM rendered_artifacts WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).catch(() => {});
    await db.run('DELETE FROM renderers WHERE id = ?', renderer).catch(() => {});
    await db.run('DELETE FROM revelation_chains WHERE id IN (?, ?, ?)', chA, chB, chNone).catch(() => {});
    await db.run('DELETE FROM workflow_runs WHERE id IN (?, ?)', wfA, wfB).catch(() => {});
    await db.run('DELETE FROM evidence_packs WHERE id IN (?, ?)', epA, epB).catch(() => {});
    await db.run('DELETE FROM community_signed_trail_entries WHERE id = ?', signedB).catch(() => {});
    await db.run('DELETE FROM sessions WHERE id IN (?, ?)', sA, sB).catch(() => {});
    await db.run('DELETE FROM users WHERE id IN (?, ?)', alice, bob).catch(() => {});
    await db.close();
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  });

  async function get(path: string, as: Caller) {
    current = as;
    const r = await fetch(`${base}/api/audit-trail${path}`);
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  }

  /** The seeded ids visible to `as` in the list, sorted. */
  async function listIds(as: Caller, extra = ''): Promise<string[]> {
    const r = await get(`/?limit=200&from=${encodeURIComponent(from)}${extra}`, as);
    expect(r.status).toBe(200);
    return (r.body.entries as Entry[]).map((e) => e.id).sort();
  }

  const aliceSees = () => [`ire:${chA}`, `wf:${wfA}`, `ep:${epA}`, `rend:${art.aliceOwn}`, `rend:${art.aliceUnattributed}`, `rend:${art.aliceOnBobs}`].sort();
  const bobSees = () => [`ire:${chB}`, `wf:${wfB}`, `ep:${epB}`, `rend:${art.bobOwn}`, `rend:${art.aliceOnBobs}`].sort();
  const everything = () => [...new Set([...aliceSees(), ...bobSees(), `ire:${chNone}`, `signed:${signedB}`])].sort();

  it('team mode: Alice lists exactly her own trails', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    // Her id is unique to this run, so anything else in the list would be a leak.
    expect(await listIds(ALICE)).toEqual(aliceSees());
  });

  it('team mode: a sessionId or userId filter naming Bob returns none of his rows to Alice', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    expect(await listIds(ALICE, `&kinds=ire_revelation&sessionId=${sB}`)).toEqual([]);
    expect(await listIds(ALICE, `&kinds=workflow_run,evidence_pack&userId=${bob}`)).toEqual([]);
  });

  it('team mode: the detail route is 404 for each of Bob\'s rows and the instance\'s signed entry, 200 for Alice\'s own', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    for (const id of [`ire:${chB}`, `ire:${chNone}`, `wf:${wfB}`, `ep:${epB}`, `rend:${art.bobOwn}`, `signed:${signedB}`]) {
      const r = await get(`/${encodeURIComponent(id)}`, ALICE);
      expect(r.status, id).toBe(404);
      expect(r.body, id).toEqual({ error: 'Trail not found' });
    }
    for (const id of aliceSees()) {
      const r = await get(`/${encodeURIComponent(id)}`, ALICE);
      expect(r.status, id).toBe(200);
      expect(r.body.id, id).toBe(id);
    }
    const chain = await get(`/${encodeURIComponent(`ire:${chA}`)}`, ALICE);
    expect(chain.body.sessionId).toBe(sA);
  });

  it('negative control — team mode: Bob sees his own, and the artifact Alice rendered from his session', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    expect(await listIds(BOB)).toEqual(bobSees());
    expect((await get(`/${encodeURIComponent(`rend:${art.bobOwn}`)}`, BOB)).status).toBe(200);
  });

  it('negative control — team mode admin: every seeded row, the session-less chain and the signed entry included', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const ids = await listIds(ADMIN);
    for (const id of everything()) expect(ids, id).toContain(id);
    for (const id of [`ire:${chB}`, `signed:${signedB}`]) {
      expect((await get(`/${encodeURIComponent(id)}`, ADMIN)).status, id).toBe(200);
    }
  });

  it('negative control — solo mode: nothing disappears', async () => {
    delete process.env.DEPLOYMENT_MODE;
    const ids = await listIds(SOLO);
    for (const id of everything()) expect(ids, id).toContain(id);
    for (const id of [`ire:${chB}`, `rend:${art.bobOwn}`, `signed:${signedB}`]) {
      expect((await get(`/${encodeURIComponent(id)}`, SOLO)).status, id).toBe(200);
    }
  });
});
