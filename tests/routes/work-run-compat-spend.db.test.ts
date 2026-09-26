/**
 * work-run-compat-spend.db.test.ts — the 2026-09-25 review fixes on the Work
 * route (POST /api/claude/message, and /api/claude/preview-prompt), end to end
 * on the test database against a fake OpenAI-compatible server started here
 * (no paid API is called).
 *
 *   C1/C9  a run the visitor closes part-way was billed by the provider but
 *          wrote no spend row and charged no monthly tokens — every cap could
 *          be passed by closing the connection. Two runs started together both
 *          passed a cap only one fitted under. The idle timer was armed before
 *          the first frames, so a level's time-to-first-token ceiling became
 *          the short idle window at once.
 *   C3     client-sent history went to the model whole, past the 128k a compat
 *          run is capped at; the monthly token budget was charged only when a
 *          sessionId was sent.
 *   C5     in demo mode a visitor could run any model the server had a key
 *          for; DEMO_OFFERED_MODELS was enforced only in the picker.
 *   L3     a visitor's preview fetched any number of URLs and returned the text.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http, { type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-work-run-compat-spend';
});

// Online references are fetched by the URL fetcher; record the fetches instead
// of making them (the real one refuses loopback addresses anyway).
const fetchedUrls: string[] = [];
vi.mock('../../server/services/url-fetcher.js', () => ({
  fetchUrl: async (url: string) => {
    fetchedUrls.push(url);
    return { url, title: 'Fetched page', text: 'PAGE-TEXT-MARKER from the fetched page.', wordCount: 6, tokenEstimate: 8 };
  },
}));

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const tag = randomUUID().slice(0, 8);
const SLUG = `spend${tag}`;
const VISITOR = `visitor-${tag}`;
const RACER = `racer-${tag}`;
const OWNER = `owner-${tag}`;
const SESSION = `sess-spend-${tag}`;
const GLM = `compat:${SLUG}:glm-model`;
const PRICING = { inputPerMillion: 0.165, outputPerMillion: 0.55 };

interface FakeCall { model: string; body: Record<string, unknown> }
const held: ServerResponse[] = [];

function startFake(): Promise<{ server: Server; baseUrl: string; calls: FakeCall[] }> {
  const calls: FakeCall[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c.toString('utf8'); });
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) { res.writeHead(404).end(); return; }
      const body = JSON.parse(raw || '{}') as Record<string, unknown>;
      const model = String(body.model);
      calls.push({ model, body });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      const finish = () => {
        send({ id: `gen-${model}`, choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1200, completion_tokens: 300, cost: 0.0042 } });
        res.end('data: [DONE]\n\n');
      };
      if (model === 'slow-model') {
        // An answer that is still being written when the page is closed.
        send({ id: 'gen-slow', choices: [{ delta: { content: 'The first part of a long answer' } }] });
        held.push(res);
        return;
      }
      if (model === 'late-model') {
        // Says nothing for a while (a reasoning phase that streams nothing), then answers.
        setTimeout(() => { send({ id: 'gen-late', choices: [{ delta: { content: `Late answer ${tag}.` } }] }); finish(); }, 1_200);
        return;
      }
      if (model === 'stall-model') {
        send({ id: 'gen-stall', choices: [{ delta: { content: 'Starts, then stalls' } }] });
        held.push(res);
        return;
      }
      send({ id: `gen-${model}`, choices: [{ delta: { content: `The answer for ${tag}.` } }] });
      finish();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, calls });
    });
  });
}

interface Frame { type?: string; code?: string; message?: string; content?: string }

function framesOf(body: string): Frame[] {
  return body.split('\n')
    .filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
    .map((l) => { try { return JSON.parse(l.slice(6)) as Frame; } catch { return {}; } });
}

d('Work run spend and limits on a compat model', () => {
  let db: DatabaseAdapter;
  let fake: Awaited<ReturnType<typeof startFake>>;
  let app: Server;
  let base = '';
  let setWorkRunTimeoutsForTests: (o: { firstTokenMs?: number; idleMs?: number } | null) => void;
  const saved: Record<string, string | undefined> = {};
  const ENV = ['DEPLOYMENT_MODE', 'DEMO_MODE', 'DEMO_OFFERED_MODELS', 'OPENAI_API_KEY', 'LLM_DAILY_SPEND_CAP_USD', 'LLM_USER_DAILY_SPEND_CAP_USD'];

  beforeAll(async () => {
    for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
    process.env.DEPLOYMENT_MODE = 'team';

    fake = await startFake();
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 6 });
    for (const [id, role] of [[VISITOR, 'analyst'], [RACER, 'analyst'], [OWNER, 'admin']] as const) {
      await db.run('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)', id, id, 'x', role);
    }
    const meta = Object.fromEntries(['glm-model', 'other-model', 'slow-model', 'late-model', 'stall-model', 'small-model', 'tiny-model']
      .map((m) => [m, { pricing: PRICING }]));
    await db.run(
      `INSERT INTO custom_model_endpoints
         (slug, display_name, base_url, default_model, enabled, allowed_models, model_meta)
       VALUES (?, 'Fake OpenRouter', ?, 'glm-model', TRUE, '[]'::jsonb, ?::jsonb)`,
      SLUG, fake.baseUrl, JSON.stringify(meta),
    );
    // Two more endpoints with a small stated window, for the whole-input checks.
    for (const [slug, window] of [[`${SLUG}w40`, 40_000], [`${SLUG}w20`, 20_000]] as const) {
      await db.run(
        `INSERT INTO custom_model_endpoints (slug, display_name, base_url, default_model, enabled, context_window, model_meta)
         VALUES (?, 'Fake small window', ?, 'small-model', TRUE, ?, ?::jsonb)`,
        slug, fake.baseUrl, window, JSON.stringify(meta),
      );
    }
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, 'general', 'compat spend', '{}', ?)`, SESSION, VISITOR);

    const { invalidateCustomEndpointCache } = await import('../../server/services/custom-endpoint-resolver.js');
    invalidateCustomEndpointCache();
    const { requestContextMiddleware } = await import('../../server/lib/request-context.js');
    const claude = await import('../../server/routes/claude.js');
    setWorkRunTimeoutsForTests = claude.setWorkRunTimeoutsForTests;
    const expressApp = express();
    expressApp.use(express.json({ limit: '10mb' }));
    expressApp.use((req: Request, _res: Response, next: NextFunction) => {
      const id = String(req.headers['x-test-user'] ?? OWNER);
      const role = String(req.headers['x-test-role'] ?? 'admin');
      (req as Request & { user?: { id: string; username: string; role: string } }).user = { id, username: id, role };
      next();
    });
    expressApp.use(requestContextMiddleware);
    expressApp.use('/api', await claude.createClaudeRoutes(db));
    await new Promise<void>((resolve) => { app = expressApp.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    for (const r of held.splice(0)) r.destroy();
    await new Promise((r) => setTimeout(r, 500));
    if (db) {
      for (const table of ['session_snapshots', 'run_artifacts', 'workflow_outputs', 'messages']) {
        await db.run(`DELETE FROM ${table} WHERE session_id = ?`, SESSION).catch(() => {});
      }
      await db.run('DELETE FROM llm_spend_ledger WHERE user_id IN (?, ?, ?)', VISITOR, RACER, OWNER).catch(() => {});
      await db.run('DELETE FROM llm_spend_ledger WHERE model LIKE ?', `compat:${SLUG}%`).catch(() => {});
      await db.run('DELETE FROM sessions WHERE id = ?', SESSION).catch(() => {});
      await db.run('DELETE FROM custom_model_endpoints WHERE slug LIKE ?', `${SLUG}%`).catch(() => {});
      await db.run('DELETE FROM user_monthly_usage WHERE user_id IN (?, ?, ?)', VISITOR, RACER, OWNER).catch(() => {});
      await db.run('DELETE FROM users WHERE id IN (?, ?, ?)', VISITOR, RACER, OWNER).catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
    await new Promise<void>((resolve) => { fake?.server.close(() => resolve()); });
  });

  beforeEach(() => { fake.calls.length = 0; fetchedUrls.length = 0; });
  afterEach(() => {
    setWorkRunTimeoutsForTests(null);
    for (const r of held.splice(0)) r.destroy();
    delete process.env.DEMO_MODE;
    delete process.env.DEMO_OFFERED_MODELS;
    delete process.env.OPENAI_API_KEY;
    delete process.env.LLM_USER_DAILY_SPEND_CAP_USD;
  });

  const as = (user: string, role: string) => ({ 'content-type': 'application/json', 'x-test-user': user, 'x-test-role': role });

  async function run(body: Record<string, unknown>, user = VISITOR, role = 'analyst'): Promise<{ status: number; text: string }> {
    const res = await fetch(`${base}/api/claude/message`, {
      method: 'POST',
      headers: as(user, role),
      body: JSON.stringify({ userMessage: 'Assess our AML controls.', thinking: 'quick', ...body }),
      signal: AbortSignal.timeout(20_000),
    });
    return { status: res.status, text: await res.text() };
  }

  async function monthlyTokens(user: string): Promise<number> {
    const row = await db.get<{ total: number | string | null }>(
      'SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total FROM user_monthly_usage WHERE user_id = ?', user);
    return Number(row?.total ?? 0);
  }

  async function waitFor<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 5_000): Promise<T> {
    const until = Date.now() + ms;
    for (;;) {
      const v = await read();
      if (ok(v) || Date.now() > until) return v;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // ── C1/C9: a run closed part-way ──────────────────────────────────────────

  it('a run the visitor closes part-way still writes its spend row and charges the monthly tokens', async () => {
    const before = await monthlyTokens(VISITOR);
    const ac = new AbortController();
    const res = await fetch(`${base}/api/claude/message`, {
      method: 'POST',
      headers: as(VISITOR, 'analyst'),
      body: JSON.stringify({ userMessage: 'Assess our AML controls.', thinking: 'quick', sessionId: SESSION, model: `compat:${SLUG}:slow-model` }),
      signal: ac.signal,
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let seen = '';
    while (!seen.includes('text_delta')) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += decoder.decode(value, { stream: true });
    }
    ac.abort();   // the visitor closes the page

    const ledger = await waitFor(
      () => db.all<{ cost_usd: number; cost_source: string; user_id: string }>(
        `SELECT cost_usd, cost_source, user_id FROM llm_spend_ledger WHERE session_id = ? AND model = ?`, SESSION, `compat:${SLUG}:slow-model`),
      (rows) => rows.length === 1 && rows[0].cost_source !== 'reserved',
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0].cost_source).toBe('estimated');
    expect(ledger[0].user_id).toBe(VISITOR);
    expect(Number(ledger[0].cost_usd)).toBeGreaterThan(0);
    const after = await waitFor(() => monthlyTokens(VISITOR), (n) => n > before);
    expect(after).toBeGreaterThan(before);
  }, 30_000);

  it('negative control: a finished run writes exactly one row, at the reported cost, and charges once', async () => {
    const before = await monthlyTokens(VISITOR);
    const { status, text } = await run({ model: GLM, sessionId: SESSION });
    expect(status).toBe(200);
    expect(framesOf(text).find((f) => f.type === 'stream_end')).toBeTruthy();
    const rows = await waitFor(
      () => db.all<{ cost_usd: number; cost_source: string }>(
        `SELECT cost_usd, cost_source FROM llm_spend_ledger WHERE session_id = ? AND model = ?`, SESSION, GLM),
      (r) => r.length === 1 && r[0].cost_source === 'reported',
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].cost_usd)).toBeCloseTo(0.0042);
    const after = await waitFor(() => monthlyTokens(VISITOR), (n) => n >= before + 1500);
    expect(after - before).toBe(1500);
  }, 30_000);

  it('two runs started together cannot both pass a per-user cap only one fits under', async () => {
    await db.run(`INSERT INTO llm_spend_ledger (user_id, model, cost_usd, cost_source) VALUES (?, 'seed', 0.2499, 'reported')`, RACER);
    process.env.LLM_USER_DAILY_SPEND_CAP_USD = '0.25';
    const results = await Promise.all([run({ model: GLM }, RACER), run({ model: GLM }, RACER)]);
    const dispatched = fake.calls.filter((c) => c.model === 'glm-model').length;
    expect(dispatched).toBeLessThanOrEqual(1);
    const refused = results.filter((r) => /You have used today's AI budget/.test(r.text));
    expect(refused.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('negative control: with no cap both runs go through', async () => {
    const results = await Promise.all([run({ model: GLM }, RACER), run({ model: GLM }, RACER)]);
    expect(results.every((r) => r.status === 200 && framesOf(r.text).some((f) => f.type === 'stream_end'))).toBe(true);
    expect(fake.calls.filter((c) => c.model === 'glm-model')).toHaveLength(2);
  }, 30_000);

  it('a model that is silent at first gets the level\'s first-token ceiling, not the idle window', async () => {
    setWorkRunTimeoutsForTests({ firstTokenMs: 4_000, idleMs: 400 });
    const { text } = await run({ model: `compat:${SLUG}:late-model` }, OWNER, 'admin');
    const frames = framesOf(text);
    expect(frames.find((f) => f.type === 'error')).toBeUndefined();
    expect(frames.filter((f) => f.type === 'text_delta').map((f) => f.content).join('')).toBe(`Late answer ${tag}.`);
  }, 30_000);

  it('negative control: once output flows, a stall is still cut off at the idle window — and billed', async () => {
    setWorkRunTimeoutsForTests({ firstTokenMs: 4_000, idleMs: 400 });
    const started = Date.now();
    const { text } = await run({ model: `compat:${SLUG}:stall-model` }, OWNER, 'admin');
    expect(Date.now() - started).toBeLessThan(3_500);
    expect(framesOf(text).find((f) => f.type === 'error')).toBeTruthy();
    const rows = await waitFor(
      () => db.all<{ cost_source: string }>(`SELECT cost_source FROM llm_spend_ledger WHERE user_id = ? AND model = ?`, OWNER, `compat:${SLUG}:stall-model`),
      (r) => r.length === 1 && r[0].cost_source !== 'reserved',
    );
    expect(rows.map((r) => r.cost_source)).toEqual(['estimated']);
  }, 30_000);

  // ── C3: the whole input, and runs with no session ─────────────────────────

  it('charges the monthly token budget for a run sent with no sessionId', async () => {
    const before = await monthlyTokens(RACER);
    const { status } = await run({ model: GLM }, RACER);
    expect(status).toBe(200);
    const after = await waitFor(() => monthlyTokens(RACER), (n) => n >= before + 1500);
    expect(after - before).toBe(1500);
  }, 30_000);

  it('drops the oldest turns of a history too long for the window, and says so', async () => {
    const long = (n: number) => `Turn ${n}. ${'lorem ipsum dolor sit amet '.repeat(1_150)}`;   // ~31k characters each
    const history = [
      { role: 'user', content: long(1) }, { role: 'assistant', content: long(2) },
      { role: 'user', content: long(3) }, { role: 'assistant', content: long(4) },
    ];
    const { status, text } = await run({ model: `compat:${SLUG}w40:small-model`, history }, OWNER, 'admin');
    expect(status).toBe(200);
    const sent = fake.calls.find((c) => c.model === 'small-model')!.body.messages as Array<{ role: string; content: string }>;
    // system + the two newest history turns + the new message
    expect(sent).toHaveLength(4);
    expect(sent[1].content.startsWith('Turn 3.')).toBe(true);
    expect(sent[1].role).toBe('user');
    expect(framesOf(text).find((f) => f.type === 'notice' && f.code === 'history_trimmed')?.message).toMatch(/2 oldest messages/);
  }, 30_000);

  it('negative control: a history that fits is sent whole, with no notice', async () => {
    const history = [{ role: 'user', content: 'Earlier question.' }, { role: 'assistant', content: 'Earlier answer.' }];
    const { text } = await run({ model: `compat:${SLUG}w40:small-model`, history }, OWNER, 'admin');
    const sent = fake.calls.find((c) => c.model === 'small-model')!.body.messages as unknown[];
    expect(sent).toHaveLength(4);
    expect(framesOf(text).find((f) => f.code === 'history_trimmed')).toBeUndefined();
  }, 30_000);

  it('refuses, before anything is sent, a message too large for the window', async () => {
    const { status, text } = await run({ model: `compat:${SLUG}w20:small-model`, userMessage: 'word '.repeat(18_000) }, OWNER, 'admin');
    expect(status).toBe(400);
    expect(JSON.parse(text)).toMatchObject({ code: 'CONTEXT_TOO_LARGE' });
    expect(fake.calls).toHaveLength(0);
  }, 30_000);

  // ── C5: demo mode offers only its models ──────────────────────────────────

  it('in demo mode refuses a visitor\'s model outside DEMO_OFFERED_MODELS, before anything is sent', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_OFFERED_MODELS = GLM;
    process.env.OPENAI_API_KEY = 'sk-test-not-used';
    const other = await run({ model: `compat:${SLUG}:other-model` });
    expect(other.status).toBe(403);
    expect(JSON.parse(other.text)).toMatchObject({ code: 'MODEL_NOT_OFFERED' });
    // A registry model on a key the server holds.
    const openai = await run({ model: 'gpt-6-astra' });
    expect(openai.status).toBe(403);
    expect(fake.calls).toHaveLength(0);
  }, 30_000);

  it('negative control: the offered model runs for a visitor, and an admin is not restricted', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_OFFERED_MODELS = GLM;
    expect((await run({ model: GLM })).status).toBe(200);
    expect((await run({ model: `compat:${SLUG}:other-model` }, OWNER, 'admin')).status).toBe(200);
    expect(fake.calls.map((c) => c.model).sort()).toEqual(['glm-model', 'other-model']);
  }, 30_000);

  it('in demo mode with no offered list, a visitor runs compat models only', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.OPENAI_API_KEY = 'sk-test-not-used';
    expect((await run({ model: 'gpt-6-astra' })).status).toBe(403);
    expect((await run({ model: GLM })).status).toBe(200);
  }, 30_000);

  // ── L3: previews do not fetch pages for visitors ──────────────────────────

  async function preview(body: Record<string, unknown>, user: string, role: string) {
    const res = await fetch(`${base}/api/claude/preview-prompt`, {
      method: 'POST', headers: as(user, role), body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
    });
    return { status: res.status, json: await res.json() as { prompt?: string; code?: string } };
  }

  const withUrls = (n: number) => ({
    userMessage: 'q',
    knowledgeSources: { modes: { onlineReference: { enabled: true, urls: Array.from({ length: n }, (_, i) => `https://example.org/page-${i}`), fetchDepth: 'full' } } },
  });

  it('in demo mode a visitor\'s preview does not fetch online references', async () => {
    process.env.DEMO_MODE = 'true';
    const { status, json } = await preview(withUrls(2), VISITOR, 'analyst');
    expect(status).toBe(200);
    expect(fetchedUrls).toHaveLength(0);
    expect(json.prompt).not.toContain('PAGE-TEXT-MARKER');
  }, 30_000);

  it('negative control: an admin\'s preview (and one outside demo mode) still fetches them', async () => {
    process.env.DEMO_MODE = 'true';
    const admin = await preview(withUrls(2), OWNER, 'admin');
    expect(admin.json.prompt).toContain('PAGE-TEXT-MARKER');
    delete process.env.DEMO_MODE;
    fetchedUrls.length = 0;
    const team = await preview(withUrls(2), VISITOR, 'analyst');
    expect(team.json.prompt).toContain('PAGE-TEXT-MARKER');
    expect(fetchedUrls).toHaveLength(2);
  }, 30_000);

  it('refuses more than 20 online references, in a preview and in a run, without fetching any', async () => {
    const p = await preview(withUrls(21), OWNER, 'admin');
    expect(p.status).toBe(400);
    expect(p.json.code).toBe('TOO_MANY_ONLINE_REFERENCES');
    const r = await run({ model: GLM, ...withUrls(21) }, OWNER, 'admin');
    expect(r.status).toBe(400);
    expect(fetchedUrls).toHaveLength(0);
    expect(fake.calls).toHaveLength(0);
    // negative control: 20 is fine
    expect((await preview(withUrls(20), OWNER, 'admin')).status).toBe(200);
  }, 30_000);
});
