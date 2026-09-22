/**
 * agents-query-stats-ownership.test.ts — the last two unguarded per-agent routes.
 *
 * routes/agents.ts guards ownership by calling loadOwnedAgent() INSIDE each handler
 * rather than as mounted middleware, because /agents/templates, /agents/route,
 * /agents/remote/* and /agents/public/* all sit under the same prefix and a
 * router.use('/agents/:id', …) would capture them with id='templates'. That is a sound
 * choice and it has the failure mode you would expect: twelve handlers called the
 * helper and two did not.
 *
 *   POST /agents/:id/query — the worse of the two by a distance. A query runs the
 *   agent's system prompt AND its connectors, so unguarded it executed another tenant's
 *   rest_api and database connectors through the vault credentials those connectors
 *   resolve, and returned the output. Reading the config was the lesser half.
 *
 *   GET /agents/:id/stats — token spend, message counts, escalation rates for anyone's
 *   agent.
 *
 * A third defect surfaced while checking those two. routeQuery(query, scope) documents
 * itself: "the authenticated route (POST /api/agents/route) passes it so a team-mode
 * user is not routed onto another tenant's agent". The route passed nothing. The
 * docstring described the intent and the call site never implemented it — so /agents/route
 * handed back another tenant's agent name and id, which is the enumeration listAgents
 * refuses, reached by the side door.
 *
 * The storefront (/agents/public/route) passes no scope deliberately and must keep
 * doing so; a case below pins that, because "add the scope everywhere" would break the
 * one place instance-wide is the product.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { DatabaseAdapter } from '../../server/db/database.js';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return undefined;
  const m = readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m);
  return m ? m[1].trim() : undefined;
}

const DATABASE_URL = resolveDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

d('agents — :id/query and :id/stats are owner-scoped', () => {
  let db: DatabaseAdapter;
  let app: Express;
  let current: { id: string; role: string } | null = null;

  const alice = `u_test_alice_${randomUUID()}`;
  const bob = `u_test_bob_${randomUUID()}`;
  const bobsAgent = `ag_test_${randomUUID()}`;
  const alicesAgent = `ag_test_${randomUUID()}`;
  const KEYWORD = `zzqx${randomUUID().slice(0, 8)}`;

  let originalMode: string | undefined;
  let originalKey: string | undefined;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    // agent_profiles.created_by has no FK, so no users rows are needed here.
    // Required columns, from information_schema: id, name, slug, role_description,
    // system_prompt.
    // Both answer to the same made-up keyword, but Bob's scores HIGHER on it: routeQuery
    // computes 0.4 + matched/total * 0.5, so his single-keyword agent beats Alice's
    // three-keyword one (0.9 vs 0.57). That asymmetry is deliberate — with an unscoped
    // routeQuery, Alice's own query returns BOB'S agent every time rather than depending
    // on which row the tie-break happened to reach first, so the case below fails for the
    // right reason instead of by luck.
    const KEYWORDS: Record<string, string[]> = {
      [bobsAgent]: [KEYWORD],
      [alicesAgent]: [KEYWORD, `${KEYWORD}-b`, `${KEYWORD}-c`],
    };
    for (const [id, owner, label] of [[bobsAgent, bob, 'bob'], [alicesAgent, alice, 'alice']]) {
      await db.run(
        `INSERT INTO agent_profiles
           (id, name, slug, role_description, system_prompt, status, created_by, routing_keywords)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
        id, `${label}s agent`, `${label}-${id.slice(-8)}`, 'test', 'you are a test agent',
        owner, JSON.stringify(KEYWORDS[id]));
    }

    const routes = await import('../../server/routes/agents.js');
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (current) (req as unknown as { user: unknown }).user = current;
      next();
    });
    app.use('/api', await routes.createAgentRoutes(db));
  });

  afterAll(async () => {
    for (const id of [bobsAgent, alicesAgent]) {
      await db.run('DELETE FROM agent_conversations WHERE agent_id = ?', id).catch(() => {});
      await db.run('DELETE FROM agent_profiles WHERE id = ?', id).catch(() => {});
    }
    await db.close();
  });

  beforeEach(() => {
    originalMode = process.env.DEPLOYMENT_MODE;
    process.env.DEPLOYMENT_MODE = 'team';
    // A query that gets PAST the guard would otherwise make a real, billable model call.
    // With no key the processor fails fast and locally, which is all these cases need:
    // they are about which requests reach the processor at all.
    originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = originalMode;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  async function call(method: string, path: string, as: { id: string; role: string } | null, body?: unknown) {
    current = as;
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const port = (server.address() as { port: number }).port;
    try {
      const sendsBody = body !== undefined && method !== 'GET' && method !== 'HEAD';
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: sendsBody ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let parsed: unknown = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      return { status: res.status, body: parsed as Record<string, unknown> | null };
    } finally {
      await new Promise((r) => server.close(r));
    }
  }

  const ALICE = { id: alice, role: 'analyst' };
  const BOB = { id: bob, role: 'analyst' };
  const ADMIN = { id: 'root_test', role: 'admin' };

  // ── POST /agents/:id/query ───────────────────────────────────────────────

  it('Alice cannot query Bob\'s agent, and the processor never runs', async () => {
    const res = await call('POST', `/api/agents/${bobsAgent}/query`, ALICE, { message: 'hello' });
    expect(res.status).toBe(404);
    // The status alone would not prove the connectors were not executed: a conversation
    // row is what processQuery creates first.
    const convos = await db.all<{ id: string }>(
      'SELECT id FROM agent_conversations WHERE agent_id = ?', bobsAgent);
    expect(convos.length, 'the query reached the processor despite the 404').toBe(0);
  });

  it('Alice is not locked out of querying her own agent', async () => {
    const res = await call('POST', `/api/agents/${alicesAgent}/query`, ALICE, { message: 'hello' });
    // Past the guard. With no API key the processor then fails on its own terms —
    // anything but 404-Agent-not-found means ownership let her through.
    expect(res.status).not.toBe(404);
  });

  // ── GET /agents/:id/stats ────────────────────────────────────────────────

  it('Alice cannot read stats for Bob\'s agent', async () => {
    const res = await call('GET', `/api/agents/${bobsAgent}/stats`, ALICE);
    expect(res.status).toBe(404);
  });

  it('Alice can read stats for her own', async () => {
    const res = await call('GET', `/api/agents/${alicesAgent}/stats`, ALICE);
    expect(res.status).toBe(200);
  });

  it('"not yours" is indistinguishable from "no such agent"', async () => {
    const notYours = await call('GET', `/api/agents/${bobsAgent}/stats`, ALICE);
    const noSuch = await call('GET', '/api/agents/ag_does_not_exist/stats', ALICE);
    expect(notYours.status).toBe(noSuch.status);
    expect(notYours.body).toEqual(noSuch.body);
  });

  // ── POST /agents/route — the docstring that was not implemented ──────────

  it('routing never names another tenant\'s agent', async () => {
    // Bob's agent scores higher on this keyword, so an unscoped routeQuery returns HIS
    // id here. Scoped, the only agent Alice can be routed to is her own — asserted
    // positively rather than as "not Bob's", so a null match cannot pass either.
    const res = await call('POST', '/api/agents/route', ALICE, { query: `please handle ${KEYWORD}` });
    expect(res.status).toBe(200);
    expect((res.body?.match as { agentId: string } | null)?.agentId).toBe(alicesAgent);
  });

  it('and Bob is still routed to his', async () => {
    const res = await call('POST', '/api/agents/route', BOB, { query: `please handle ${KEYWORD}` });
    expect((res.body?.match as { agentId: string } | null)?.agentId).toBe(bobsAgent);
  });

  it('the public storefront stays instance-wide — scoping it would be the bug', async () => {
    // /agents/public/route is the one caller that must NOT be scoped. If a future change
    // adds ownerFilter there "for consistency", cross-instance discovery stops working
    // and this case is what says so.
    const res = await call('POST', '/api/agents/public/route', ALICE, { query: `please handle ${KEYWORD}` });
    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
  });

  // ── The modes that must not change ───────────────────────────────────────

  it('an admin reaches any agent', async () => {
    expect((await call('GET', `/api/agents/${bobsAgent}/stats`, ADMIN)).status).toBe(200);
  });

  it('solo mode is unscoped', async () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    const res = await call('GET', `/api/agents/${bobsAgent}/stats`, { id: 'solo', role: 'admin' });
    expect(res.status, 'the solo operator was locked out of their own agent').toBe(200);
  });
});
