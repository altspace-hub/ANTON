/**
 * screening-quality-owner-scope.db.test.ts — team isolation, round 3
 * ("verify2:prompts-sessions" gaps, TEAM_ISOLATION_ROUND2_GAPS 2026-09-23),
 * against the real schema.
 *
 *   - GET /quality/trend/:moduleId returned every user's score reasoning,
 *     session id and notes for a module (module ids are public).
 *   - GET /quality/feedback/stats/:moduleId returned other users' free-text
 *     rating comments.
 *   - Dow Jones / Roaring: entity_screens and entity_monitoring had no owner
 *     (migration 287 adds one), so the monitoring list and both recent-screen
 *     lists were everyone's, any user could pause or delete any registration,
 *     and /screen, /profile and /monitor accepted a colleague's sessionId.
 *   - GET /rerun/quality/:messageId read any message's scores.
 *   - POST /export/with-template used any user's brand template.
 *
 * Each case runs through the production adapter and the real route, as Bob
 * (non-admin) against Alice's rows, with negative controls: the owner, an admin
 * and solo mode still get what they always got. Dow Jones and Roaring run in
 * their mock mode (no API key); no model is called.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express, { Router } from 'express';
import type { Server } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

interface Caller { id: string; role: 'admin' | 'analyst' | 'viewer' }
interface Reply { status: number; json: unknown; text: string }

d('screening, quality trend/stats, rerun quality and template export — owner scope', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base: string;
  let current: Caller | null = null;
  const originalMode = process.env.DEPLOYMENT_MODE;
  const originalDj = process.env.DOWJONES_API_KEY;
  const originalRoaring = process.env.ROARING_API_KEY;

  const tag = randomUUID().slice(0, 8);
  const alice = `u_scr_alice_${tag}`;
  const bob = `u_scr_bob_${tag}`;
  const admin = `u_scr_admin_${tag}`;
  const sA = `s_scr_a_${tag}`;
  const sB = `s_scr_b_${tag}`;
  const mA = `m_scr_a_${tag}`;
  const atlasA = `atl_scr_a_${tag}`;
  const moduleId = `mod-scr-${tag}`;
  const orgNumber = `55${tag.replace(/[^0-9]/g, '7').padEnd(8, '7').slice(0, 8)}`;
  const aliceContent = `Alice answer ${tag}`;

  const mon = { alice: `mon_a_${tag}`, bob: `mon_b_${tag}`, legacy: `mon_l_${tag}`, aliceDel: `mon_ad_${tag}` };
  const scr = { djA: `scr_dja_${tag}`, djB: `scr_djb_${tag}`, djL: `scr_djl_${tag}`, roA: `scr_roa_${tag}`, roB: `scr_rob_${tag}`, roL: `scr_rol_${tag}` };
  const tpl = { alice: `tpl_a_${tag}`, bob: `tpl_b_${tag}` };

  const ALICE: Caller = { id: alice, role: 'analyst' };
  const BOB: Caller = { id: bob, role: 'analyst' };
  const VIEWER: Caller = { id: bob, role: 'viewer' };
  const ADMIN: Caller = { id: admin, role: 'admin' };
  const SOLO: Caller = { id: 'solo', role: 'admin' };

  beforeAll(async () => {
    // quality.ts imports the auth middleware, which refuses to load without one.
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-screening-quality-owner-scope';
    // Mock mode for both connectors: no provider is ever called.
    delete process.env.DOWJONES_API_KEY;
    delete process.env.ROARING_API_KEY;

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });

    for (const u of [alice, bob]) {
      await db.run('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)', u, u, 'x');
    }
    await db.run("INSERT INTO sessions (id, module_id, title, user_id) VALUES (?, ?, 'scr A', ?)", sA, moduleId, alice);
    await db.run("INSERT INTO sessions (id, module_id, title, user_id) VALUES (?, ?, 'scr B', ?)", sB, moduleId, bob);
    await db.run("INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, 'assistant', ?)", mA, sA, aliceContent);

    // Quality scores: Alice's, Bob's and one with no session.
    const hash = createHash('sha256').update(aliceContent.slice(0, 5000)).digest('hex').slice(0, 16);
    await db.run(
      `INSERT INTO quality_scores (session_id, module_id, content_hash, score_overall, score_reasoning, notes)
       VALUES (?, ?, ?, 8.1, ?, ?)`,
      sA, moduleId, hash, JSON.stringify({ weaknesses: [`ALICE-WEAKNESS-${tag}`] }), `ALICE-NOTE-${tag}`);
    await db.run(
      `INSERT INTO quality_scores (session_id, module_id, content_hash, score_overall, score_reasoning)
       VALUES (?, ?, ?, 6.2, ?)`,
      sB, moduleId, `hb_${tag}`, JSON.stringify({ weaknesses: [`BOB-WEAKNESS-${tag}`] }));
    await db.run(
      `INSERT INTO quality_scores (session_id, module_id, content_hash, score_overall, score_reasoning)
       VALUES (NULL, ?, ?, 5.0, ?)`,
      moduleId, `hn_${tag}`, JSON.stringify({ weaknesses: [`NOSESSION-WEAKNESS-${tag}`] }));
    // A board-pack score on Alice's Risk Atlas carries the atlas id as session_id.
    await db.run("INSERT INTO risk_atlases (id, name, owner_user_id) VALUES (?, 'scr atlas', ?)", atlasA, alice);
    await db.run(
      `INSERT INTO quality_scores (session_id, module_id, content_hash, score_overall, score_reasoning)
       VALUES (?, ?, ?, 7.7, ?)`,
      atlasA, moduleId, `ha_${tag}`, JSON.stringify({ weaknesses: [`ALICE-ATLAS-WEAKNESS-${tag}`] }));
    await db.run(
      'INSERT INTO quality_baselines (module_id, baseline_score, sample_size) VALUES (?, 7.0, 3)', moduleId);

    // Star ratings with comments: Alice's, Bob's and an unattributed one.
    for (const [who, rating] of [[alice, 5], [bob, 2], [null, 3]] as const) {
      await db.run(
        'INSERT INTO output_feedback (id, module_id, rating, comment, user_id) VALUES (?, ?, ?, ?, ?)',
        `fb_scr_${randomUUID().slice(0, 12)}`, moduleId, rating, `${who === alice ? 'ALICE' : who === bob ? 'BOB' : 'LEGACY'}-COMMENT-${tag}`, who);
    }

    // Dow Jones monitoring registrations.
    for (const [id, who] of [[mon.alice, alice], [mon.bob, bob], [mon.legacy, null], [mon.aliceDel, alice]] as const) {
      await db.run(
        "INSERT INTO entity_monitoring (id, entity_id, entity_name, connector, user_id) VALUES (?, ?, ?, 'dowjones', ?)",
        id, `ent_${id}`, `MON-${id}`, who);
    }
    // Screens for both connectors: Alice's, Bob's, legacy (no owner).
    const screen = (id: string, connector: string, who: string | null, session: string | null, org: string | null, result: string) =>
      db.run(
        `INSERT INTO entity_screens (id, session_id, entity_name, org_number, connector, result, risk_score, hit_count, cached_until, user_id)
         VALUES (?, ?, ?, ?, ?, ?, 'HIGH', 1, (NOW() + INTERVAL '1 hour')::text, ?)`,
        id, session, `ENTITY-${id}`, org, connector, result, who);
    await screen(scr.djA, 'dowjones', alice, sA, null, JSON.stringify({ hits: [`ALICE-HIT-${tag}`] }));
    await screen(scr.djB, 'dowjones', bob, sB, null, JSON.stringify({ hits: [] }));
    await screen(scr.djL, 'dowjones', null, null, null, JSON.stringify({ hits: [] }));
    await screen(scr.roA, 'roaring', alice, sA, orgNumber, JSON.stringify({ company: { name: `ALICE-CACHE-${tag}` } }));
    await screen(scr.roB, 'roaring', bob, sB, `${orgNumber}9`, JSON.stringify({ company: { name: 'bob' } }));
    await screen(scr.roL, 'roaring', null, null, `${orgNumber}8`, JSON.stringify({ company: { name: 'legacy' } }));

    // Brand templates whose files are not on disk: an owner who gets past the
    // ownership check sees "file missing", anyone else "Template not found".
    for (const [id, who] of [[tpl.alice, alice], [tpl.bob, bob]] as const) {
      await db.run(
        "INSERT INTO brand_templates (id, name, type, file_path, user_id) VALUES (?, 'scr test', 'docx', ?, ?)",
        id, `/nonexistent/scr-${id}.docx`, who);
    }

    const { createQualityRoutes } = await import('../../server/routes/quality.js');
    const { createDowJonesRoutes } = await import('../../server/routes/dowjones.js');
    const { createRoaringRoutes } = await import('../../server/routes/roaring.js');
    const { createRerunRoutes } = await import('../../server/routes/rerun.js');
    const { createExportRouter } = await import('../../server/routes/export.js');

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (current) req.user = { id: current.id, username: current.id, role: current.role };
      next();
    });
    app.use('/api', await createQualityRoutes(db));
    app.use('/api', await createDowJonesRoutes(db));
    app.use('/api', await createRoaringRoutes(db));
    app.use('/api', createRerunRoutes(db, Router()));
    app.use('/api', await createExportRouter(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (originalDj === undefined) delete process.env.DOWJONES_API_KEY; else process.env.DOWJONES_API_KEY = originalDj;
    if (originalRoaring === undefined) delete process.env.ROARING_API_KEY; else process.env.ROARING_API_KEY = originalRoaring;
    if (!db) return;
    await db.run('DELETE FROM brand_templates WHERE id IN (?, ?)', tpl.alice, tpl.bob);
    await db.run(`DELETE FROM entity_screens WHERE id LIKE ? OR session_id IN (?, ?) OR org_number LIKE ?`, `scr_%_${tag}`, sA, sB, `${orgNumber}%`);
    await db.run('DELETE FROM entity_screens WHERE entity_name = ?', `SCREEN-${tag}`);
    await db.run(`DELETE FROM entity_monitoring WHERE id LIKE ? OR entity_id LIKE ?`, `mon_%_${tag}`, `ent_new_${tag}%`);
    await db.run('DELETE FROM output_feedback WHERE module_id = ?', moduleId);
    await db.run('DELETE FROM quality_baselines WHERE module_id = ?', moduleId);
    await db.run('DELETE FROM quality_scores WHERE module_id = ?', moduleId);
    await db.run('DELETE FROM messages WHERE session_id IN (?, ?)', sA, sB);
    await db.run('DELETE FROM risk_atlases WHERE id = ?', atlasA);
    await db.run('DELETE FROM sessions WHERE id IN (?, ?)', sA, sB);
    await db.run('DELETE FROM users WHERE id IN (?, ?)', alice, bob);
    await db.close();
  });

  afterEach(() => {
    current = null;
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  });

  const team = () => { process.env.DEPLOYMENT_MODE = 'team'; };
  const solo = () => { delete process.env.DEPLOYMENT_MODE; };

  async function call(caller: Caller, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', route: string, body?: unknown): Promise<Reply> {
    current = caller;
    const r = await fetch(`${base}/api${route}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, json, text };
  }

  const ids = (rows: unknown): string[] => (Array.isArray(rows) ? rows.map((r) => String((r as { id: unknown }).id)) : []);

  // ── Quality trend ─────────────────────────────────────────────────────────

  it('quality trend: a non-admin sees only scores on their own sessions; the baseline stays', async () => {
    team();
    for (const caller of [BOB, VIEWER]) {
      const r = await call(caller, 'GET', `/quality/trend/${moduleId}`);
      expect(r.status).toBe(200);
      const body = r.json as { scores: Array<{ session_id: string }>; baseline: { baseline_score: number } | null };
      expect(body.scores.map((s) => s.session_id)).toEqual([sB]);
      expect(r.text).not.toContain(`ALICE-WEAKNESS-${tag}`);
      expect(r.text).not.toContain(`ALICE-NOTE-${tag}`);
      expect(r.text).not.toContain(sA);
      expect(r.text).not.toContain(`NOSESSION-WEAKNESS-${tag}`);
      expect(r.text).not.toContain(`ALICE-ATLAS-WEAKNESS-${tag}`);
      expect(Number(body.baseline?.baseline_score)).toBeCloseTo(7.0);
    }
  });

  it('negative control — quality trend: the owner sees hers (session and atlas), an admin and solo see every row', async () => {
    team();
    const own = await call(ALICE, 'GET', `/quality/trend/${moduleId}`);
    expect(own.text).toContain(`ALICE-WEAKNESS-${tag}`);
    expect(own.text).toContain(`ALICE-ATLAS-WEAKNESS-${tag}`);
    expect((own.json as { scores: unknown[] }).scores).toHaveLength(2);
    const adm = await call(ADMIN, 'GET', `/quality/trend/${moduleId}`);
    expect((adm.json as { scores: unknown[] }).scores).toHaveLength(4);
    expect(adm.text).toContain(`ALICE-WEAKNESS-${tag}`);
    solo();
    const s = await call(SOLO, 'GET', `/quality/trend/${moduleId}`);
    expect((s.json as { scores: unknown[] }).scores).toHaveLength(4);
    expect(s.text).toContain(`NOSESSION-WEAKNESS-${tag}`);
  });

  // ── Feedback stats ────────────────────────────────────────────────────────

  it('feedback stats: counts stay instance-wide, a non-admin gets only their own comments', async () => {
    team();
    const r = await call(BOB, 'GET', `/quality/feedback/stats/${moduleId}`);
    expect(r.status).toBe(200);
    const body = r.json as { count: number; recentComments: Array<{ comment: string }> };
    expect(body.count).toBe(3);
    expect(body.recentComments.map((c) => c.comment)).toEqual([`BOB-COMMENT-${tag}`]);
    expect(r.text).not.toContain(`ALICE-COMMENT-${tag}`);
    expect(r.text).not.toContain(`LEGACY-COMMENT-${tag}`);
  });

  it('negative control — feedback stats: an admin and solo see every comment', async () => {
    team();
    const own = await call(ALICE, 'GET', `/quality/feedback/stats/${moduleId}`);
    expect((own.json as { recentComments: Array<{ comment: string }> }).recentComments.map((c) => c.comment)).toEqual([`ALICE-COMMENT-${tag}`]);
    const adm = await call(ADMIN, 'GET', `/quality/feedback/stats/${moduleId}`);
    expect((adm.json as { recentComments: unknown[] }).recentComments).toHaveLength(3);
    solo();
    const s = await call(SOLO, 'GET', `/quality/feedback/stats/${moduleId}`);
    expect((s.json as { recentComments: unknown[] }).recentComments).toHaveLength(3);
  });

  // ── Dow Jones monitoring ──────────────────────────────────────────────────

  it('dow jones monitoring: a non-admin lists only their own registrations', async () => {
    team();
    const r = await call(VIEWER, 'GET', '/dowjones/monitoring');
    expect(r.status).toBe(200);
    const listed = ids((r.json as { monitoring: unknown }).monitoring);
    expect(listed).toContain(mon.bob);
    expect(listed).not.toContain(mon.alice);
    expect(listed).not.toContain(mon.legacy);
  });

  it('dow jones monitoring: PATCH / DELETE of a colleague\'s or an unowned registration answers 404 and changes nothing', async () => {
    team();
    const missing = await call(BOB, 'PATCH', `/dowjones/monitor/mon_missing_${tag}`, { status: 'paused' });
    for (const id of [mon.alice, mon.legacy]) {
      const p = await call(BOB, 'PATCH', `/dowjones/monitor/${id}`, { status: 'cancelled' });
      expect(p.status).toBe(404);
      expect(p.json).toEqual(missing.json);           // same answer as a missing id
      const del = await call(VIEWER, 'DELETE', `/dowjones/monitor/${id}`);
      expect(del.status).toBe(404);
      const row = await db.get<{ status: string }>('SELECT status FROM entity_monitoring WHERE id = ?', id);
      expect(row?.status).toBe('active');
    }
  });

  it('negative control — dow jones monitoring: the owner, an admin and solo still manage registrations', async () => {
    team();
    expect((await call(ALICE, 'PATCH', `/dowjones/monitor/${mon.alice}`, { status: 'paused' })).status).toBe(200);
    expect((await db.get<{ status: string }>('SELECT status FROM entity_monitoring WHERE id = ?', mon.alice))?.status).toBe('paused');
    expect((await call(ALICE, 'DELETE', `/dowjones/monitor/${mon.aliceDel}`)).status).toBe(200);
    expect(await db.get('SELECT 1 AS ok FROM entity_monitoring WHERE id = ?', mon.aliceDel)).toBeUndefined();
    expect((await call(ADMIN, 'PATCH', `/dowjones/monitor/${mon.legacy}`, { status: 'paused' })).status).toBe(200);
    const adm = ids(((await call(ADMIN, 'GET', '/dowjones/monitoring')).json as { monitoring: unknown }).monitoring);
    expect(adm).toEqual(expect.arrayContaining([mon.alice, mon.bob, mon.legacy]));
    solo();
    expect((await call(SOLO, 'PATCH', `/dowjones/monitor/${mon.bob}`, { status: 'paused' })).status).toBe(200);
    const s = ids(((await call(SOLO, 'GET', '/dowjones/monitoring')).json as { monitoring: unknown }).monitoring);
    expect(s).toEqual(expect.arrayContaining([mon.alice, mon.bob, mon.legacy]));
  });

  it('dow jones monitor: a colleague\'s sessionId answers 404; one\'s own registers under one\'s own id', async () => {
    team();
    const planted = await call(BOB, 'POST', '/dowjones/monitor', { entityId: `ent_new_${tag}_x`, entityName: 'X', sessionId: sA });
    expect(planted.status).toBe(404);
    expect(await db.get('SELECT 1 AS ok FROM entity_monitoring WHERE entity_id = ?', `ent_new_${tag}_x`)).toBeUndefined();

    const own = await call(BOB, 'POST', '/dowjones/monitor', { entityId: `ent_new_${tag}_b`, entityName: 'B', sessionId: sB });
    expect(own.status).toBe(200);
    const row = await db.get<{ user_id: string | null }>('SELECT user_id FROM entity_monitoring WHERE entity_id = ?', `ent_new_${tag}_b`);
    expect(row?.user_id).toBe(bob);
  });

  // ── Screens (both connectors) ─────────────────────────────────────────────

  it('screens/recent: a non-admin lists only their own screens on both connectors', async () => {
    team();
    const dj = await call(VIEWER, 'GET', '/dowjones/screens/recent?limit=100');
    const djIds = ids((dj.json as { screens: unknown }).screens);
    expect(djIds).toContain(scr.djB);
    expect(djIds).not.toContain(scr.djA);
    expect(djIds).not.toContain(scr.djL);
    expect(dj.text).not.toContain(`ALICE-HIT-${tag}`);
    const ro = await call(VIEWER, 'GET', '/roaring/screens/recent?limit=100');
    const roIds = ids((ro.json as { screens: unknown }).screens);
    expect(roIds).toContain(scr.roB);
    expect(roIds).not.toContain(scr.roA);
    expect(roIds).not.toContain(scr.roL);
  });

  it('negative control — screens/recent: an admin and solo see every row, legacy included', async () => {
    team();
    const own = ids(((await call(ALICE, 'GET', '/dowjones/screens/recent?limit=100')).json as { screens: unknown }).screens);
    expect(own).toContain(scr.djA);
    for (const [caller, mode] of [[ADMIN, team], [SOLO, solo]] as const) {
      mode();
      const dj = ids(((await call(caller, 'GET', '/dowjones/screens/recent?limit=100')).json as { screens: unknown }).screens);
      expect(dj).toEqual(expect.arrayContaining([scr.djA, scr.djB, scr.djL]));
      const ro = ids(((await call(caller, 'GET', '/roaring/screens/recent?limit=100')).json as { screens: unknown }).screens);
      expect(ro).toEqual(expect.arrayContaining([scr.roA, scr.roB, scr.roL]));
    }
  });

  it('screen / profile: a colleague\'s sessionId answers 404 before anything is written', async () => {
    team();
    const before = await db.get<{ n: number | string }>('SELECT COUNT(*) AS n FROM entity_screens WHERE session_id = ?', sA);
    const dj = await call(BOB, 'POST', `/dowjones/screen?sessionId=${sA}`, { name: `SCREEN-${tag}` });
    expect(dj.status).toBe(404);
    expect((await call(BOB, 'GET', `/roaring/screen/${orgNumber}?sessionId=${sA}`)).status).toBe(404);
    expect((await call(BOB, 'GET', `/roaring/profile/${orgNumber}?sessionId=${sA}`)).status).toBe(404);
    const after = await db.get<{ n: number | string }>('SELECT COUNT(*) AS n FROM entity_screens WHERE session_id = ?', sA);
    expect(Number(after?.n)).toBe(Number(before?.n));
  });

  it('negative control — screen: the owner screens into her session and the row is hers', async () => {
    team();
    const r = await call(ALICE, 'POST', `/dowjones/screen?sessionId=${sA}`, { name: `SCREEN-${tag}` });
    expect(r.status).toBe(200);
    const row = await db.get<{ user_id: string | null; session_id: string | null }>(
      "SELECT user_id, session_id FROM entity_screens WHERE entity_name = ? AND connector = 'dowjones'", `SCREEN-${tag}`);
    expect(row).toEqual({ user_id: alice, session_id: sA });
  });

  it('roaring profile cache: a colleague\'s cached lookup is not served (or revealed) to a non-admin', async () => {
    team();
    const r = await call(BOB, 'GET', `/roaring/profile/${orgNumber}`);
    expect(r.status).toBe(200);
    expect((r.json as { cached: boolean }).cached).toBe(false);
    expect(r.text).not.toContain(`ALICE-CACHE-${tag}`);
    const own = await db.get<{ user_id: string | null }>(
      "SELECT user_id FROM entity_screens WHERE org_number = ? AND connector = 'roaring' AND user_id = ?", orgNumber, bob);
    expect(own?.user_id).toBe(bob);                    // Bob's fresh lookup is cached as his
  });

  it('negative control — roaring profile cache: the owner and an admin get the cached row', async () => {
    team();
    const own = await call(ALICE, 'GET', `/roaring/profile/${orgNumber}`);
    expect((own.json as { cached: boolean }).cached).toBe(true);
    expect(own.text).toContain(`ALICE-CACHE-${tag}`);
    const adm = await call(ADMIN, 'GET', `/roaring/profile/${orgNumber}8`);   // the legacy row
    expect((adm.json as { cached: boolean }).cached).toBe(true);
    solo();
    const s = await call(SOLO, 'GET', `/roaring/profile/${orgNumber}8`);
    expect((s.json as { cached: boolean }).cached).toBe(true);
  });

  // ── Rerun quality ─────────────────────────────────────────────────────────

  it('rerun quality: a colleague\'s message answers the same 404 as a missing one', async () => {
    team();
    const theirs = await call(BOB, 'GET', `/rerun/quality/${mA}`);
    const missing = await call(BOB, 'GET', `/rerun/quality/m_missing_${tag}`);
    expect(theirs.status).toBe(404);
    expect(theirs.json).toEqual(missing.json);
  });

  it('negative control — rerun quality: the owner, an admin and solo get the score', async () => {
    team();
    for (const caller of [ALICE, ADMIN]) {
      const r = await call(caller, 'GET', `/rerun/quality/${mA}`);
      expect(r.status).toBe(200);
      expect((r.json as { score: { overall: number } | null }).score?.overall).toBeCloseTo(8.1);
    }
    solo();
    const s = await call(SOLO, 'GET', `/rerun/quality/${mA}`);
    expect((s.json as { score: { overall: number } | null }).score?.overall).toBeCloseTo(8.1);
  });

  // ── Export with a brand template ──────────────────────────────────────────

  it('export with-template: a colleague\'s template answers "Template not found"', async () => {
    team();
    const r = await call(BOB, 'POST', '/export/with-template', { templateId: tpl.alice, content: '# x', format: 'docx' });
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ error: 'Template not found' });
  });

  it('negative control — export with-template: the owner, an admin and solo get past the ownership check', async () => {
    team();
    // The seeded file is not on disk, so getting past the check shows as "file missing".
    const past = { error: 'Template file missing from disk' };
    expect((await call(BOB, 'POST', '/export/with-template', { templateId: tpl.bob, content: '# x', format: 'docx' })).json).toEqual(past);
    expect((await call(ALICE, 'POST', '/export/with-template', { templateId: tpl.alice, content: '# x', format: 'docx' })).json).toEqual(past);
    expect((await call(ADMIN, 'POST', '/export/with-template', { templateId: tpl.alice, content: '# x', format: 'docx' })).json).toEqual(past);
    solo();
    expect((await call(SOLO, 'POST', '/export/with-template', { templateId: tpl.alice, content: '# x', format: 'docx' })).json).toEqual(past);
  });
});
