/**
 * orchestration-owner-scope.db.test.ts — the Orchestration dashboard's own
 * rows stay their owner's on a team server (public showcase, 2026-10-02).
 *
 * Before:
 *   - GET, PUT and DELETE /api/continuity/profiles/:id took any id: a visitor
 *     could read, rewrite or delete a colleague's key-person profile;
 *   - PATCH /api/insights/:id/read and /dismiss took any id (and were not
 *     awaited);
 *   - POST /api/insights/generate read every user's knowledge atoms and quoted
 *     200 characters of two of them into the caller's insight — and named two
 *     columns the PostgreSQL schema does not have (knowledge_atoms.
 *     source_session_id, sessions.area_id), so it failed for everyone.
 *
 * Now the owner check is in the SQL (ownerFilter / atomOwnerSql), a
 * colleague's row answers the same 404 as a missing one and is untouched, and
 * generation runs.
 *
 * Negative controls: the owner still reads, changes and deletes their own; an
 * admin on the team server and the solo user reach the other person's rows;
 * Bob's own generation quotes his atoms.
 *
 * Runs the real routes on the test database (tests/setup/db-guard.ts decides
 * which); skips without one.
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

d('Orchestration rows — owner scope against the real schema', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';
  let current: Caller | null = null;
  const originalMode = process.env.DEPLOYMENT_MODE;

  const tag = randomUUID().slice(0, 8);
  const alice = `u_orch_alice_${tag}`;
  const bob = `u_orch_bob_${tag}`;
  const ALICE: Caller = { id: alice, role: 'analyst' };
  const BOB: Caller = { id: bob, role: 'analyst' };
  const ADMIN: Caller = { id: `u_orch_admin_${tag}`, role: 'admin' };
  const SOLO: Caller = { id: 'solo', role: 'admin' };

  const profA = `cp_a_${tag}`;
  const profB = `cp_b_${tag}`;
  const insA = `pi_a_${tag}`;
  const insB = `pi_b_${tag}`;
  const insB2 = `pi_b2_${tag}`;
  const atomB1 = `ka_b1_${tag}`;
  const atomB2 = `ka_b2_${tag}`;
  const secretB = `BOB-SECRET-${tag}`;

  function mode(m: 'team' | 'solo'): void {
    if (m === 'team') process.env.DEPLOYMENT_MODE = 'team'; else delete process.env.DEPLOYMENT_MODE;
  }

  async function send(method: string, path: string, who: Caller, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    current = who;
    const r = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }
    return { status: r.status, body: parsed };
  }

  async function profile(id: string): Promise<{ profile_name: string; user_id: string } | undefined> {
    return db.get('SELECT profile_name, user_id FROM continuity_profiles WHERE id = ?', id);
  }

  async function insight(id: string): Promise<{ read: number; dismissed: number } | undefined> {
    return db.get('SELECT read, dismissed FROM proactive_insights WHERE id = ?', id);
  }

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });

    for (const [id, user] of [[profA, alice], [profB, bob]]) {
      await db.run(
        "INSERT INTO continuity_profiles (id, profile_name, role, user_id) VALUES (?, ?, 'Head of Compliance', ?)",
        id, `profile of ${user}`, user,
      );
    }
    for (const [id, user] of [[insA, alice], [insB, bob], [insB2, bob]]) {
      await db.run(
        "INSERT INTO proactive_insights (id, insight_type, title, body, user_id) VALUES (?, 'risk', 'seeded', 'seeded', ?)",
        id, user,
      );
    }
    // Two of Bob's conclusions in one category from different runs: the
    // "conflicting conclusions" pattern quotes both.
    for (const [id, exec] of [[atomB1, `exec_b1_${tag}`], [atomB2, `exec_b2_${tag}`]]) {
      await db.run(
        `INSERT INTO knowledge_atoms (id, source_workflow_id, source_execution_id, content, atom_type, category, owner_user_id, is_active)
         VALUES (?, 'module-run', ?, ?, 'conclusion', ?, ?, 1)`,
        id, exec, `${secretB} ${id}`, `cat_orch_${tag}`, bob,
      );
    }

    const { createContinuityRoutes } = await import('../../server/routes/continuity.js');
    const { createInsightsRoutes } = await import('../../server/routes/insights.js');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (current) req.user = { id: current.id, username: current.id, role: current.role as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    app.use('/api', await createContinuityRoutes(db));
    app.use('/api', await createInsightsRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(() => { current = null; });

  afterAll(async () => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
    if (db) {
      await db.run('DELETE FROM continuity_profiles WHERE id IN (?, ?)', [profA, profB]);
      await db.run('DELETE FROM proactive_insights WHERE user_id IN (?, ?)', [alice, bob]);
      await db.run('DELETE FROM knowledge_atoms WHERE id IN (?, ?)', [atomB1, atomB2]);
      await db.close();
    }
  });

  // ── Continuity profiles ────────────────────────────────────────────────────

  it('team mode: Alice gets 404 for Bob\'s profile on GET, PUT and DELETE, and it is untouched', async () => {
    mode('team');
    expect((await send('GET', `/continuity/profiles/${profB}`, ALICE)).status).toBe(404);
    expect((await send('PUT', `/continuity/profiles/${profB}`, ALICE, { profile_name: 'hijacked' })).status).toBe(404);
    expect((await send('DELETE', `/continuity/profiles/${profB}`, ALICE)).status).toBe(404);
    expect(await profile(profB)).toEqual({ profile_name: `profile of ${bob}`, user_id: bob });
    // Same answer as an id that does not exist.
    const missing = await send('GET', `/continuity/profiles/cp_missing_${tag}`, ALICE);
    expect(missing).toEqual({ status: 404, body: { error: 'Profile not found' } });
  });

  it('team mode: Alice\'s list holds her own profile only', async () => {
    mode('team');
    const r = await send('GET', '/continuity/profiles', ALICE);
    const ids = (r.body.profiles as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(profA);
    expect(ids).not.toContain(profB);
  });

  it('negative control: Alice reads and changes her own; an admin and solo reach Bob\'s', async () => {
    mode('team');
    expect((await send('GET', `/continuity/profiles/${profA}`, ALICE)).status).toBe(200);
    const put = await send('PUT', `/continuity/profiles/${profA}`, ALICE, { profile_name: 'renamed by alice' });
    expect(put.status).toBe(200);
    expect((put.body.profile as { profile_name: string }).profile_name).toBe('renamed by alice');

    const adminGet = await send('GET', `/continuity/profiles/${profB}`, ADMIN);
    expect(adminGet.status).toBe(200);
    expect((adminGet.body.profile as { user_id: string }).user_id).toBe(bob);
    expect((await send('PUT', `/continuity/profiles/${profB}`, ADMIN, { handover_notes: 'admin note' })).status).toBe(200);

    mode('solo');
    expect((await send('GET', `/continuity/profiles/${profB}`, SOLO)).status).toBe(200);
  });

  it('the owner deletes their own profile (and Bob\'s outlives Alice\'s attempt)', async () => {
    mode('team');
    expect((await send('DELETE', `/continuity/profiles/${profA}`, ALICE)).status).toBe(200);
    expect(await profile(profA)).toBeUndefined();
    expect(await profile(profB)).toBeDefined();
  });

  // ── Proactive insights ─────────────────────────────────────────────────────

  it('team mode: Alice cannot mark or dismiss Bob\'s insight (404, unchanged); her own works', async () => {
    mode('team');
    expect((await send('PATCH', `/insights/${insB}/read`, ALICE)).status).toBe(404);
    expect((await send('PATCH', `/insights/${insB}/dismiss`, ALICE, { action_taken: 'x' })).status).toBe(404);
    expect(await insight(insB)).toEqual({ read: 0, dismissed: 0 });

    expect((await send('PATCH', `/insights/${insA}/read`, ALICE)).status).toBe(200);
    expect((await send('PATCH', `/insights/${insA}/dismiss`, ALICE, {})).status).toBe(200);
    expect(await insight(insA)).toEqual({ read: 1, dismissed: 1 });
  });

  it('negative control: an admin marks Bob\'s insight read; solo dismisses one', async () => {
    mode('team');
    expect((await send('PATCH', `/insights/${insB}/read`, ADMIN)).status).toBe(200);
    expect((await insight(insB))?.read).toBe(1);
    mode('solo');
    expect((await send('PATCH', `/insights/${insB2}/dismiss`, SOLO, {})).status).toBe(200);
    expect((await insight(insB2))?.dismissed).toBe(1);
  });

  it('team mode: Alice\'s generation never quotes Bob\'s atoms; Bob\'s does (and the route runs on PostgreSQL)', async () => {
    mode('team');
    const a = await send('POST', '/insights/generate', ALICE);
    expect(a.status).toBe(200);
    const aliceRows = await db.all<{ body: string; source_atom_ids: string }>(
      'SELECT body, source_atom_ids FROM proactive_insights WHERE user_id = ?', [alice],
    );
    for (const row of aliceRows) {
      expect(row.body).not.toContain(secretB);
      expect(row.source_atom_ids).not.toContain(atomB1);
    }

    const b = await send('POST', '/insights/generate', BOB);
    expect(b.status).toBe(200);
    const bobRows = await db.all<{ body: string; source_atom_ids: string }>(
      "SELECT body, source_atom_ids FROM proactive_insights WHERE user_id = ? AND insight_type = 'conflict'", [bob],
    );
    expect(bobRows.some((r) => r.body.includes(secretB) && r.source_atom_ids.includes(atomB1))).toBe(true);
  });
});
