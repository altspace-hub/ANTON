/**
 * human-oversight-evidence-pack-owner.db.test.ts — a sign-off can cite only an
 * evidence pack its author may open (round-2 gap "verify2:projects-2").
 *
 * POST /api/oversight/reviews checked an optional evidencePackId with
 * `SELECT id FROM evidence_packs WHERE id = ?` — any pack. A missing id answered
 * 400 and any existing one was accepted, so a team member could test pack ids
 * (which evidence-pack.ts hides behind a 404) and bind a colleague's pack to
 * their own sign-off. Now, in team mode, a non-admin's lookup is scoped to packs
 * they created, and someone else's pack gets exactly the missing-pack answer.
 *
 * Negative controls: the author's own pack is accepted; an admin may cite any
 * pack; solo mode is not scoped.
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

d('oversight sign-off — evidence pack reference is owner-scoped (team mode)', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';
  let current: Caller = { id: 'solo', role: 'admin' };
  const originalMode = process.env.DEPLOYMENT_MODE;

  const tag = randomUUID().slice(0, 8);
  const ALICE: Caller = { id: `u_hoe_alice_${tag}`, role: 'analyst' };
  const BOB: Caller = { id: `u_hoe_bob_${tag}`, role: 'analyst' };
  const ROOT: Caller = { id: `u_hoe_root_${tag}`, role: 'admin' };
  const USERS = [ALICE, BOB, ROOT];
  const sessionOf = (u: Caller) => `s_hoe_${u.id}`;
  const answerOf = (u: Caller) => `m_hoe_${u.id}`;
  const ALICE_PACK = `EP-hoe-alice-${tag}`;
  const BOB_PACK = `EP-hoe-bob-${tag}`;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    for (const u of USERS) {
      await db.run('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)', u.id, u.id, 'x', u.role);
      await db.run("INSERT INTO sessions (id, module_id, title, user_id) VALUES (?, 'gap-analysis', 'hoe', ?)", sessionOf(u), u.id);
      await db.run("INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, 'assistant', 'Gap analysis output')", answerOf(u), sessionOf(u));
    }
    for (const [id, owner] of [[ALICE_PACK, ALICE.id], [BOB_PACK, BOB.id]] as const) {
      await db.run(
        `INSERT INTO evidence_packs (id, title, scope_type, scope_ref, created_by) VALUES (?, 'hoe', 'session', '{}'::jsonb, ?)`,
        id, owner,
      );
    }
    const { createHumanOversightRoutes } = await import('../../server/routes/human-oversight.js');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: current.id, username: current.id, role: current.role }; next(); });
    app.use('/api', await createHumanOversightRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (!db) return;
    for (const u of USERS) {
      await db.run('DELETE FROM human_oversight_reviews WHERE session_id = ?', sessionOf(u)).catch(() => {});
      await db.run('DELETE FROM sessions WHERE id = ?', sessionOf(u)).catch(() => {});
    }
    await db.run('DELETE FROM evidence_packs WHERE id IN (?, ?)', ALICE_PACK, BOB_PACK).catch(() => {});
    for (const u of USERS) await db.run('DELETE FROM users WHERE id = ?', u.id).catch(() => {});
    await db.close();
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  });

  async function signOff(as: Caller, evidencePackId: string): Promise<{ status: number; body: Record<string, unknown> }> {
    current = as;
    const r = await fetch(`${base}/api/oversight/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionOf(as), module_id: 'gap-analysis', reviewer_name: 'Reviewer',
        verdict: 'approved', messageId: answerOf(as), evidencePackId,
      }),
    });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  }

  it("a colleague's pack gets the same 400 as a missing one, and nothing is stored", async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const foreign = await signOff(ALICE, BOB_PACK);
    const missing = await signOff(ALICE, `EP-hoe-missing-${tag}`);
    expect(foreign.status).toBe(400);
    expect(foreign.body).toEqual({ error: 'evidencePackId does not name an evidence pack' });
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual(foreign.body);
    const stored = await db.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM human_oversight_reviews WHERE session_id = ?', sessionOf(ALICE));
    expect(Number(stored?.n)).toBe(0);
  });

  it('negative controls: her own pack is accepted; an admin cites any pack; solo is not scoped', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const own = await signOff(ALICE, ALICE_PACK);
    expect(own.status).toBe(201);
    expect((own.body.review as { evidence_pack_id: string }).evidence_pack_id).toBe(ALICE_PACK);
    expect((await signOff(ROOT, BOB_PACK)).status).toBe(201);
    delete process.env.DEPLOYMENT_MODE;
    expect((await signOff(ALICE, BOB_PACK)).status).toBe(201);
  });
});
