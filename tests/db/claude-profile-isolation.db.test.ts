/**
 * claude-profile-isolation.db.test.ts — the team-isolation checks in the chat
 * routes and the per-person profile run as valid SQL against the real schema
 * (team-server audit 2026-09-23, B2/B3/B4/B5).
 *
 * The fake-DB suites (tests/routes/claude-team-isolation.test.ts and
 * tests/routes/profile-per-user.test.ts) pin the decisions; this one proves the
 * statements behind them — the session owner check, the revelation_chains →
 * sessions join, the file_uploads IN list and the two user_profiles upserts —
 * do what they say on PostgreSQL, through the production adapter and the real
 * routes. No model is called: the preview route composes a prompt and returns it.
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

d('chat routes and profile — team isolation against the real schema', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base: string;
  let current: Caller | null = null;
  const originalMode = process.env.DEPLOYMENT_MODE;
  let originalBrand: string | null = null;
  let hadDefaultRow = false;

  const tag = randomUUID().slice(0, 8);
  const alice = `u_iso_alice_${tag}`;
  const bob = `u_iso_bob_${tag}`;
  const admin = `u_iso_admin_${tag}`;
  const sA = `s_iso_a_${tag}`;
  const chA = `ch_iso_a_${tag}`;
  const upA = `${randomUUID()}-iso-alice.pdf`;
  const upB = `${randomUUID()}-iso-bob.pdf`;

  const ALICE: Caller = { id: alice, role: 'analyst' };
  const BOB: Caller = { id: bob, role: 'analyst' };
  const ADMIN: Caller = { id: admin, role: 'admin' };
  const SOLO: Caller = { id: 'solo', role: 'admin' };

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });

    for (const u of [alice, bob]) {
      await db.run('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)', u, u, 'x');
    }
    await db.run("INSERT INTO sessions (id, module_id, title, user_id) VALUES (?, 'open-chat', 'isolation test', ?)", sA, alice);
    await db.run("INSERT INTO revelation_chains (id, session_id, thinking_level) VALUES (?, ?, 'investigate')", chA, sA);
    for (const [id, owner] of [[upA, alice], [upB, bob]]) {
      await db.run('INSERT INTO file_uploads (id, original_name, extension, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)', id, 'x.pdf', '.pdf', 1, owner);
    }
    const def = await db.get<{ brand_config: string | null }>("SELECT brand_config FROM user_profiles WHERE id = 'default'");
    hadDefaultRow = !!def;
    originalBrand = def?.brand_config ?? null;

    const { createClaudeRoutes } = await import('../../server/routes/claude.js');
    const { createProfileRoutes } = await import('../../server/routes/profile.js');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (current) req.user = { id: current.id, username: current.id, role: current.role };
      next();
    });
    app.use('/api', await createProfileRoutes(db));
    app.use('/api', await createClaudeRoutes(db));
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
    if (!db) return;
    if (hadDefaultRow) await db.run("UPDATE user_profiles SET brand_config = ? WHERE id = 'default'", originalBrand);
    else await db.run("DELETE FROM user_profiles WHERE id = 'default'");
    await db.run('DELETE FROM user_profiles WHERE id IN (?, ?, ?)', alice, bob, admin);
    await db.run('DELETE FROM file_uploads WHERE id IN (?, ?)', upA, upB);
    await db.run('DELETE FROM revelation_chains WHERE id = ?', chA);
    await db.run('DELETE FROM messages WHERE session_id = ?', sA);
    await db.run('DELETE FROM sessions WHERE id = ?', sA);
    await db.run('DELETE FROM users WHERE id IN (?, ?)', alice, bob);
    await db.close();
  });

  afterEach(() => {
    current = null;
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  });

  async function as(caller: Caller, method: 'GET' | 'PUT' | 'POST', route: string, body?: Record<string, unknown>) {
    current = caller;
    const r = await fetch(`${base}/api${route}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  }

  it('B4: each person saves and reads their own profile; the brand stays on the instance row', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    expect((await as(ALICE, 'PUT', '/profile', { display_name: 'Alice Iso', jurisdiction: 'Sweden' })).status).toBe(200);
    expect((await as(BOB, 'PUT', '/profile', { display_name: 'Bob Iso' })).status).toBe(200);

    expect((await as(ALICE, 'GET', '/profile')).body).toMatchObject({ id: alice, display_name: 'Alice Iso', jurisdiction: 'Sweden' });
    expect((await as(BOB, 'GET', '/profile')).body).toMatchObject({ id: bob, display_name: 'Bob Iso', jurisdiction: '' });

    // A non-admin cannot move the brand; an admin can, on the instance row only.
    const brand = `{"palette":["#${tag.slice(0, 6)}"]}`;
    const refused = await as(BOB, 'PUT', '/profile', { display_name: 'Bob Iso', brand_config: brand });
    expect(refused.status).toBe(403);
    const ok = await as(ADMIN, 'PUT', '/profile', { display_name: 'Admin Iso', brand_config: brand });
    expect(ok.status).toBe(200);
    const rows = await db.all<{ id: string; brand_config: string | null }>(
      'SELECT id, brand_config FROM user_profiles WHERE id IN (?, ?, ?, ?)', 'default', alice, bob, admin);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.brand_config]));
    expect(byId).toEqual({ default: brand, [alice]: null, [bob]: null, [admin]: null });
    expect((await as(BOB, 'GET', '/profile')).body.brand_config).toBe(brand);
  });

  it('negative control — solo: the profile is the single default row', async () => {
    delete process.env.DEPLOYMENT_MODE;
    const r = await as(SOLO, 'GET', '/profile');
    expect(r.status).toBe(200);
    expect(r.body.id).toBe('default');
  });

  it('B3: the chain → session owner join admits the owner and an admin, 404 for anyone else', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    expect(await as(BOB, 'GET', `/revelation-chains/${chA}`)).toEqual({ status: 404, body: { error: 'Revelation chain not found' } });
    expect((await as(ALICE, 'GET', `/revelation-chains/${chA}`)).body.id).toBe(chA);
    expect((await as(ADMIN, 'GET', `/revelation-chains/${chA}`)).status).toBe(200);
  });

  it('B2 + B5: preview-prompt checks the session owner and the upload owner in SQL', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const body = { userMessage: 'Isolation preview', sessionId: sA, uploadedFileIds: [upA, upB] };
    expect(await as(BOB, 'POST', '/claude/preview-prompt', body)).toEqual({ status: 404, body: { error: 'Session not found' } });
    const own = await as(ALICE, 'POST', '/claude/preview-prompt', body);
    expect(own.status).toBe(200);
    // Her Layer-0 block is hers (saved in the first test), not the shared row's.
    expect(String(own.body.prompt)).toContain('Alice Iso');
  });
});
