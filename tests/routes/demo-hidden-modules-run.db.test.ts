/**
 * demo-hidden-modules-run.db.test.ts — what a visitor's Work run may reach on
 * the public demo (privacy review H3 / D13 and H4 / D8).
 *
 *   - H3: a run of a module kept off the demo (DEMO_HIDDEN_AREAS /
 *     DEMO_HIDDEN_MODULES) is refused with 403 before anything is saved or
 *     sent. The area checked is the one sent and the module's own, so a hidden
 *     module sent with another area id, or with none, is still refused.
 *   - H4: a visitor's online references are not fetched. The server fetched
 *     every URL a visitor named, and the pages' text went to the model host.
 *     The run record says what the run used (online references off).
 *
 * Negative controls: an admin on the demo, and a visitor outside demo mode,
 * still run hidden modules and still have their online references fetched.
 *
 * Drives the real Work route on the test database; the model is a fake
 * OpenAI-compatible server, and the URL fetcher is a spy (the real one refuses
 * local addresses, and the question is only whether it is called).
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http, { type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-demo-hidden-modules-run';
});

const fetchSpy = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock('../../server/services/url-fetcher.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/services/url-fetcher.js')>()),
  fetchUrl: async (url: string) => {
    fetchSpy.urls.push(url);
    return { url, title: 'Fetched page', text: 'Text of a page about someone.', tokenEstimate: 8 };
  },
}));

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);
const SLUG = `thid${tag}`;
const MODEL = `compat:${SLUG}:fake-model`;
const OPEN_MODULE = 'business-wide-risk-assessment'; // area fcp, on no list here
const REFERENCE_URL = `https://example.org/page-${tag}`;

function startFake(): Promise<{ server: Server; baseUrl: string; calls: () => number }> {
  let calls = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
    req.on('end', () => {
      calls += 1;
      const parsed = JSON.parse(body || '{}') as { stream?: boolean };
      const usage = { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 };
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `Short answer ${tag}.` } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage })}\n\n`);
        res.end('data: [DONE]\n\n');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      calls: () => calls,
    }));
  });
}

d('a visitor\'s Work run on the public demo: hidden modules and online references', () => {
  let db: DatabaseAdapter;
  let fake: Awaited<ReturnType<typeof startFake>>;
  let app: Server;
  let base = '';
  const sessions: string[] = [];
  const users = { visitor: randomUUID(), admin: randomUUID() };
  const ENV = ['DEMO_MODE', 'DEMO_OFFERED_MODELS', 'DEMO_HIDDEN_AREAS', 'DEMO_HIDDEN_MODULES', 'DEMO_POST_ANSWER_CALLS', 'DEPLOYMENT_MODE'] as const;
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]])) as Record<(typeof ENV)[number], string | undefined>;
  let setDefault: (db: DatabaseAdapter, model: string | null) => Promise<unknown>;

  beforeAll(async () => {
    delete process.env.DEPLOYMENT_MODE;
    // Nothing after the answer calls the model.
    process.env.DEMO_POST_ANSWER_CALLS = 'none';
    fake = await startFake();
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    await db.run(
      `INSERT INTO custom_model_endpoints (slug, display_name, base_url, default_model, enabled) VALUES (?, 'Fake', ?, 'fake-model', TRUE)`,
      SLUG, fake.baseUrl,
    );
    for (const [kind, id] of Object.entries(users)) {
      await db.run(`INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'x', ?)`, id, `hid_${kind}_${tag}`, kind === 'admin' ? 'admin' : 'analyst');
    }
    const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
    setRouterDb(db);
    const store = await import('../../server/services/default-model-store.js');
    setDefault = store.setPersistedDefaultModel as typeof setDefault;
    await setDefault(db, MODEL);
    const { createClaudeRoutes } = await import('../../server/routes/claude.js');
    const e = express();
    e.use(express.json());
    e.use((req: Request, _res: Response, next: NextFunction) => {
      const id = String(req.headers['x-test-user'] ?? '');
      (req as Request & { user?: { id: string; username: string; role: string } }).user = { id, username: id, role: String(req.headers['x-test-role'] ?? 'analyst') };
      next();
    });
    e.use('/api', await createClaudeRoutes(db));
    await new Promise<void>((resolve) => { app = e.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const k of ['DEMO_MODE', 'DEMO_OFFERED_MODELS', 'DEMO_HIDDEN_AREAS', 'DEMO_HIDDEN_MODULES'] as const) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    fetchSpy.urls.length = 0;
  });

  afterAll(async () => {
    for (const k of ['DEMO_POST_ANSWER_CALLS', 'DEPLOYMENT_MODE'] as const) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    await new Promise((r) => setTimeout(r, 1000));
    if (db) {
      await setDefault(db, null).catch(() => {});
      for (const s of sessions) {
        for (const t of ['llm_spend_ledger', 'session_snapshots', 'run_artifacts', 'workflow_outputs', 'quality_scores', 'audit_log', 'messages']) {
          await db.run(`DELETE FROM ${t} WHERE ${t === 'workflow_outputs' ? 'execution_id' : 'session_id'} = ?`, s).catch(() => {});
        }
        await db.run('DELETE FROM versions WHERE entity_id = ?', s).catch(() => {});
        await db.run('DELETE FROM sessions WHERE id = ?', s).catch(() => {});
      }
      for (const id of Object.values(users)) {
        for (const t of ['apprentice_profiles', 'audit_log', 'user_monthly_usage', 'llm_spend_ledger']) {
          await db.run(`DELETE FROM ${t} WHERE user_id = ?`, id).catch(() => {});
        }
        await db.run('DELETE FROM users WHERE id = ?', id).catch(() => {});
      }
      await db.run('DELETE FROM llm_spend_ledger WHERE model = ?', MODEL).catch(() => {});
      await db.run('DELETE FROM custom_model_endpoints WHERE slug = ?', SLUG).catch(() => {});
      const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
      setRouterDb(null);
      await db.close();
    }
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
    await new Promise<void>((resolve) => { fake?.server.close(() => resolve()); });
  });

  function demo(on: boolean): void {
    if (on) process.env.DEMO_MODE = 'true'; else delete process.env.DEMO_MODE;
    process.env.DEMO_OFFERED_MODELS = MODEL;
    process.env.DEMO_HIDDEN_AREAS = 'healthcare';
    process.env.DEMO_HIDDEN_MODULES = 'credit-risk';
  }

  /** One run in a fresh session; answers the status and, for a 200, the stream's text. */
  async function run(userId: string, role: string, body: Record<string, unknown>): Promise<{ status: number; text: string; sessionId: string }> {
    const sessionId = randomUUID();
    sessions.push(sessionId);
    const moduleId = typeof body.moduleId === 'string' ? body.moduleId : 'general';
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, ?, 'hidden', '{}', ?)`, sessionId, moduleId, userId);
    const res = await fetch(`${base}/api/claude/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': userId, 'x-test-role': role },
      body: JSON.stringify({ userMessage: 'Please help.', model: MODEL, sessionId, thinking: 'quick', systemPrompt: 'You help.', ...body }),
      signal: AbortSignal.timeout(20_000),
    });
    return { status: res.status, text: await res.text(), sessionId };
  }

  const messageCount = async (sessionId: string) =>
    Number((await db.get<{ n: string | number }>('SELECT COUNT(*) AS n FROM messages WHERE session_id = ?', sessionId))?.n ?? 0);

  /** The knowledge sources the stored assistant message says the run used. */
  async function recordedSources(sessionId: string): Promise<{ modes?: { onlineReference?: { enabled?: boolean } } } | null> {
    for (let i = 0; i < 40; i++) {
      const row = await db.get<{ config_snapshot: string | null }>(
        "SELECT config_snapshot FROM messages WHERE session_id = ? AND role = 'assistant'", sessionId,
      );
      if (row?.config_snapshot) {
        return (JSON.parse(row.config_snapshot) as { knowledgeSources?: { modes?: { onlineReference?: { enabled?: boolean } } } }).knowledgeSources ?? null;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }

  // ── H3: hidden modules ──

  it.each([
    ['a hidden module', { moduleId: 'credit-risk', areaId: 'banking' }],
    ['a hidden module, in other letter case', { moduleId: 'Credit-Risk', areaId: 'banking' }],
    ['a module of a hidden area', { moduleId: 'clinical-protocol', areaId: 'healthcare' }],
    ['a module of a hidden area sent with another area id', { moduleId: 'clinical-protocol', areaId: 'fcp' }],
    ['a module of a hidden area sent with no area id', { moduleId: 'clinical-protocol' }],
    ['a hidden area with no module', { areaId: 'healthcare' }],
  ])('demo visitor: %s is refused before anything is saved or sent', async (_label, body) => {
    demo(true);
    const before = fake.calls();
    const r = await run(users.visitor, 'analyst', body);
    expect(r.status).toBe(403);
    expect(JSON.parse(r.text)).toMatchObject({ code: 'MODULE_NOT_OFFERED', error: expect.stringMatching(/not available in this demo/) });
    expect(await messageCount(r.sessionId)).toBe(0);
    expect(fake.calls()).toBe(before);
  });

  it('demo visitor: a module on neither list runs', async () => {
    demo(true);
    const r = await run(users.visitor, 'analyst', { moduleId: OPEN_MODULE, areaId: 'fcp' });
    expect(r.status).toBe(200);
    expect(r.text).toContain(`Short answer ${tag}.`);
  });

  it('negative control: an admin on the demo runs a hidden module', async () => {
    demo(true);
    const r = await run(users.admin, 'admin', { moduleId: 'credit-risk', areaId: 'banking' });
    expect(r.status).toBe(200);
    expect(r.text).toContain(`Short answer ${tag}.`);
  });

  it('negative control: outside demo mode the lists change nothing', async () => {
    demo(false);
    const r = await run(users.visitor, 'analyst', { moduleId: 'clinical-protocol', areaId: 'healthcare' });
    expect(r.status).toBe(200);
    expect(r.text).toContain(`Short answer ${tag}.`);
  });

  // ── H4: online references ──

  const withReference = {
    moduleId: OPEN_MODULE,
    areaId: 'fcp',
    knowledgeSources: { modes: { onlineReference: { enabled: true, urls: [REFERENCE_URL], fetchDepth: 'full' } } },
  };

  it('demo visitor: online references are not fetched, and the record says so', async () => {
    demo(true);
    const r = await run(users.visitor, 'analyst', withReference);
    expect(r.status).toBe(200);
    expect(fetchSpy.urls).toEqual([]);
    expect((await recordedSources(r.sessionId))?.modes?.onlineReference?.enabled).toBe(false);
  });

  it('negative control: an admin\'s online references on the demo are fetched', async () => {
    demo(true);
    const r = await run(users.admin, 'admin', withReference);
    expect(r.status).toBe(200);
    expect(fetchSpy.urls).toEqual([REFERENCE_URL]);
    expect((await recordedSources(r.sessionId))?.modes?.onlineReference?.enabled).toBe(true);
  });

  it('negative control: outside demo mode a visitor\'s online references are fetched', async () => {
    demo(false);
    const r = await run(users.visitor, 'analyst', withReference);
    expect(r.status).toBe(200);
    expect(fetchSpy.urls).toEqual([REFERENCE_URL]);
  });
});
