/**
 * rerun-team-role.test.ts — POST /api/rerun (recompose) carries the caller's ROLE
 * into the claude pipeline (team isolation round 2, REGRESSION from round 1).
 *
 * Round 1 gave /api/claude/message a session-ownership gate (claude.ts
 * ensureOwnSession: scopesToOwner, then assertOwned on sessions.user_id). The
 * rerun dispatches a synthetic request into that router, and stamped
 * req.user = { id } with no role — so an admin, already allowed past the rerun's
 * own ownership check, was treated as a non-admin inside the pipeline and got
 * 404 'Session not found' for a colleague's session.
 *
 * The fake claude router below applies the same gate with the same helpers
 * (ownership.ts) before emulating the live route's persistence, as
 * tests/routes/rerun.test.ts does. No model is called.
 *
 * Requires DATABASE_URL (from tests/setup/db-guard.ts); skips otherwise.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import express, { Router } from 'express';
import type { Server } from 'http';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import { scopesToOwner, assertOwned } from '../../server/middleware/ownership.js';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

interface Caller { id: string; role: 'admin' | 'analyst' | 'viewer' }

d('POST /api/rerun — the caller\'s role reaches the claude pipeline', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;
  let current: Caller | null = null;
  const originalMode = process.env.DEPLOYMENT_MODE;

  const tag = randomUUID().slice(0, 8);
  const alice = `u_rr_alice_${tag}`;
  const bob = `u_rr_bob_${tag}`;
  const sessionId = `s_rr_${tag}`;
  const userMsgId = randomUUID();
  const assistantId = randomUUID();

  const ALICE: Caller = { id: alice, role: 'analyst' };
  const BOB: Caller = { id: bob, role: 'analyst' };
  const ADMIN: Caller = { id: `u_rr_admin_${tag}`, role: 'admin' };
  const SOLO: Caller = { id: 'solo', role: 'admin' };

  /** req.user as the claude router saw it, per dispatch. */
  const seen: Array<{ id?: string; role?: string } | undefined> = [];

  function createFakeClaudeRouter(): Router {
    const router = Router();
    router.post('/claude/message', async (req, res) => {
      const body = req.body as Record<string, unknown>;
      seen.push(req.user ? { ...req.user } : undefined);
      // claude.ts ensureOwnSession — the gate the regression tripped.
      if (scopesToOwner(req) && !(await assertOwned(db, req, res, {
        table: 'sessions', ownerColumn: 'user_id', id: String(body.sessionId), notFoundMessage: 'Session not found',
      }))) return;

      await db.run(
        `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`,
        randomUUID(), body.sessionId, body.userMessage, new Date().toISOString());
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      await db.run(
        `INSERT INTO messages (id, session_id, role, content, model_id, config_snapshot, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?, ?)`,
        randomUUID(), body.sessionId, `RERUN by ${String(body.model)}`, body.model,
        JSON.stringify({ model: body.model }), new Date(Date.now() + 1).toISOString());
      res.write(`data: ${JSON.stringify({ type: 'stream_end' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });
    return router;
  }

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createRerunRoutes } = await import('../../server/routes/rerun.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });

    for (const u of [alice, bob]) {
      await db.run('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)', u, u, 'x');
    }
    const t = (ms: number) => new Date(Date.now() - ms).toISOString();
    await db.run(
      `INSERT INTO sessions (id, module_id, title, user_id, created_at, updated_at) VALUES (?, 'open-chat', 'rerun role', ?, ?, ?)`,
      sessionId, alice, t(60_000), t(60_000));
    await db.run(`INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', 'Question', ?)`,
      userMsgId, sessionId, t(50_000));
    await db.run(
      `INSERT INTO messages (id, session_id, role, content, model_id, config_snapshot, created_at)
       VALUES (?, ?, 'assistant', 'Original', 'claude-opus-4-8', ?, ?)`,
      assistantId, sessionId, JSON.stringify({ model: 'claude-opus-4-8', thinking: 'think' }), t(40_000));

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (current) req.user = { id: current.id, username: current.id, role: current.role };
      next();
    });
    app.use('/api', createRerunRoutes(db, createFakeClaudeRouter()));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    try {
      if (db) {
        await db.run('DELETE FROM run_artifacts WHERE session_id = ?', sessionId).catch(() => undefined);
        await db.run('DELETE FROM quality_scores WHERE session_id = ?', sessionId);
        await db.run('DELETE FROM messages WHERE session_id = ?', sessionId);
        await db.run('DELETE FROM sessions WHERE id = ?', sessionId);
        await db.run('DELETE FROM users WHERE id IN (?, ?)', alice, bob);
      }
    } finally {
      await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
      await db?.close();
    }
  });

  afterEach(() => {
    current = null;
    seen.length = 0;
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  });

  async function rerunAs(caller: Caller, newModelId: string) {
    current = caller;
    const r = await fetch(`${base}/api/rerun`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, messageId: assistantId, newModelId }),
    });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  it('team: an admin reruns a colleague\'s session — the pipeline sees role admin and does not 404', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await rerunAs(ADMIN, 'claude-sonnet-4-6');
    expect(r.json.error).toBeUndefined();   // was: 'Session not found' from the pipeline
    expect(r.status).toBe(200);
    expect(seen).toEqual([{ id: ADMIN.id, role: 'admin' }]);
  });

  it('negative control — team: the owner (analyst) reruns their own session, and is NOT promoted', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await rerunAs(ALICE, 'claude-haiku-4-5');
    expect(r.status).toBe(200);
    expect(seen).toEqual([{ id: alice, role: 'analyst' }]);
  });

  it('negative control — team: a non-admin on someone else\'s session is refused before any dispatch', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await rerunAs(BOB, 'claude-sonnet-4-6');
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ error: 'Session not found' });
    expect(seen).toEqual([]);
  });

  it('negative control — solo: unchanged', async () => {
    delete process.env.DEPLOYMENT_MODE;
    const r = await rerunAs(SOLO, 'mistral-large-latest');
    expect(r.status).toBe(200);
    expect(seen).toEqual([{ id: 'solo', role: 'admin' }]);
  });
});
