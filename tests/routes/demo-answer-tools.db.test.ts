/**
 * demo-answer-tools.db.test.ts — the answer tools opened to demo visitors run
 * on the showcase's only engine, an OpenAI-compatible endpoint (2026-10-01).
 *
 *   - Explain for (POST /claude/explain-for) was bound to the Anthropic API
 *     and answered 500 with no Anthropic key. It now streams through
 *     provider-router with the frames /claude/message sends; a visitor gets
 *     the model asked for only when the demo offers it, else the default; the
 *     tokens are charged to the visitor's monthly budget; a refusal after the
 *     stream began is an error frame and the stream still ends.
 *   - The citation check (POST /claude/verify-citations) was refused by a
 *     Claude-only gate, and asked for a bare JSON array, which JSON mode
 *     (response_format json_object) cannot return: it now asks for
 *     {"citations": [...]} and reads either shape.
 *   - Find the right module (POST /modules/smart-search) never offers a
 *     visitor a module the demo keeps off — not in the candidates sent to the
 *     model, not in the answer.
 *   - Review (POST /reviews) was refused by a gate that listed API keys only;
 *     it now runs on the compat engine, on the reviewer the visitor picked
 *     when the demo offers it (a second model checking the first), else the
 *     default, and ends its stream on a refusal.
 *
 * Drives the real routes on the test database against a fake
 * OpenAI-compatible server that records what it was sent. Every visitor rule
 * has its negative control: the same request from an administrator.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http, { type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-demo-answer-tools';
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);
const SLUG = `ttools${tag}`;
const DEFAULT = `compat:${SLUG}:glm-fake`;
const OFFERED = `compat:${SLUG}:kimi-fake`;
const NOT_OFFERED = `compat:${SLUG}:other-fake`;
const BROKEN = `compat:${SLUG}:broken`;
const VISITOR = `u-tools-visitor-${tag}`;
const ADMIN = `u-tools-admin-${tag}`;

interface Sent { model: string; stream: boolean; system: string; user: string }

/** What the fake answers a module-recommender call with; set per test. */
const smart = { reply: '[]' };

function startFake(seen: Sent[]): Promise<{ server: Server; baseUrl: string }> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}') as { model?: string; stream?: boolean; messages?: Array<{ role: string; content: unknown }> };
      const text = (role: string) => (parsed.messages ?? []).filter((m) => m.role === role).map((m) => String(m.content)).join('\n');
      const sent: Sent = { model: String(parsed.model), stream: !!parsed.stream, system: text('system'), user: text('user') };
      seen.push(sent);
      const usage = { prompt_tokens: 120, completion_tokens: 30, cost: 0.0001 };
      if (sent.model === 'broken') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'model refused by the provider' } }));
        return;
      }
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `Rewritten by ${sent.model}.` } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage })}\n\n`);
        res.end('data: [DONE]\n\n');
        return;
      }
      let content = '{}';
      if (/citation verifier/i.test(sent.system)) {
        // The object JSON mode allows, as a provider that enforces it returns.
        content = JSON.stringify({ citations: [
          { citation: 'Article 3', verified: true, comment: 'Defines obliged entities.', sourceMatch: 'ai_knowledge' },
          { citation: 'AMLR', verified: true, comment: 'Regulation (EU) 2024/1624.', sourceMatch: 'ai_knowledge' },
        ] });
      } else if (/module recommender/i.test(sent.system)) {
        content = smart.reply;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` }));
  });
}

/** The SSE frames of a response, [DONE] as the string. */
async function frames(res: globalThis.Response): Promise<Array<Record<string, unknown> | '[DONE]'>> {
  const body = await res.text();
  return body.split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => l.slice(6).trim())
    .map((data) => (data === '[DONE]' ? '[DONE]' as const : JSON.parse(data) as Record<string, unknown>));
}

d('the answer tools on an OpenAI-compatible engine', () => {
  let db: DatabaseAdapter;
  const seen: Sent[] = [];
  let fake: Awaited<ReturnType<typeof startFake>>;
  let app: Server;
  let base = '';
  let caller: { id: string; role: string } = { id: VISITOR, role: 'analyst' };
  const ENV = ['DEMO_MODE', 'DEMO_OFFERED_MODELS', 'DEPLOYMENT_MODE', 'DEMO_HIDDEN_AREAS', 'DEMO_HIDDEN_MODULES'] as const;
  const saved: Record<string, string | undefined> = {};
  let setDefault: (db: DatabaseAdapter, model: string | null) => Promise<unknown>;

  beforeAll(async () => {
    for (const k of ENV) saved[k] = process.env[k];
    fake = await startFake(seen);
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    await db.run(
      `INSERT INTO custom_model_endpoints (slug, display_name, base_url, default_model, enabled) VALUES (?, 'Fake', ?, 'glm-fake', TRUE)`,
      SLUG, fake.baseUrl,
    );
    for (const [id, role] of [[VISITOR, 'analyst'], [ADMIN, 'admin']] as const) {
      await db.run(`INSERT INTO users (id, username, password_hash, role, monthly_token_budget) VALUES (?, ?, 'x', ?, 0)`, id, id, role);
    }
    const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
    setRouterDb(db);
    const store = await import('../../server/services/default-model-store.js');
    setDefault = store.setPersistedDefaultModel as typeof setDefault;
    await setDefault(db, DEFAULT);
    const { createClaudeRoutes } = await import('../../server/routes/claude.js');
    const { createReviewRoutes } = await import('../../server/routes/reviews.js');
    const e = express();
    e.use(express.json());
    e.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: { id: string; username: string; role: string } }).user = { ...caller, username: caller.id };
      next();
    });
    e.use('/api', await createClaudeRoutes(db));
    e.use('/api', await createReviewRoutes(db));
    await new Promise<void>((resolve) => { app = e.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    caller = { id: VISITOR, role: 'analyst' };
    seen.length = 0;
  });

  afterAll(async () => {
    if (db) {
      await setDefault(db, null).catch(() => {});
      await db.run('DELETE FROM llm_spend_ledger WHERE model LIKE ?', `compat:${SLUG}:%`).catch(() => {});
      await db.run('DELETE FROM audit_log WHERE user_id IN (?, ?)', VISITOR, ADMIN).catch(() => {});
      await db.run('DELETE FROM user_monthly_usage WHERE user_id IN (?, ?)', VISITOR, ADMIN).catch(() => {});
      await db.run('DELETE FROM users WHERE id IN (?, ?)', VISITOR, ADMIN).catch(() => {});
      await db.run('DELETE FROM custom_model_endpoints WHERE slug = ?', SLUG).catch(() => {});
      const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
      setRouterDb(null);
      await db.close();
    }
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
    await new Promise<void>((resolve) => { fake?.server.close(() => resolve()); });
  });

  const demo = () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEPLOYMENT_MODE = 'team';
    process.env.DEMO_OFFERED_MODELS = `${DEFAULT},${OFFERED}`;
  };
  const post = (p: string, body: unknown) => fetch(`${base}/api${p}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  const explain = (model?: string) => post('/claude/explain-for', {
    content: 'The controls are adequate but the monitoring needs work.', audience: 'board', ...(model ? { model } : {}),
  });

  it('explain-for streams stream_start, text_delta, stream_end and [DONE] from the model the visitor picked', async () => {
    demo();
    const res = await explain(OFFERED);
    expect(res.status).toBe(200);
    const f = await frames(res);
    expect(f[0]).toMatchObject({ type: 'stream_start', model: OFFERED });
    expect(f.some((x) => x !== '[DONE]' && x.type === 'text_delta' && String(x.content).includes('Rewritten by kimi-fake'))).toBe(true);
    expect(f[f.length - 2]).toMatchObject({ type: 'stream_end' });
    expect(f[f.length - 1]).toBe('[DONE]');
    expect(seen.map((s) => s.model)).toEqual(['kimi-fake']);
  });

  it('a visitor asking for a model the demo does not offer gets the default; an admin gets the one asked for', async () => {
    demo();
    let f = await frames(await explain(NOT_OFFERED));
    expect(f[0]).toMatchObject({ type: 'stream_start', model: DEFAULT });
    expect(seen.map((s) => s.model)).toEqual(['glm-fake']);

    // Negative control: the same request from an administrator.
    seen.length = 0;
    caller = { id: ADMIN, role: 'admin' };
    f = await frames(await explain(NOT_OFFERED));
    expect(f[0]).toMatchObject({ type: 'stream_start', model: NOT_OFFERED });
    expect(seen.map((s) => s.model)).toEqual(['other-fake']);
  });

  it('charges the rewrite to the visitor\'s monthly token budget', async () => {
    demo();
    const month = new Date().toISOString().slice(0, 7);
    const before = await db.get<{ t: number }>('SELECT COALESCE(SUM(input_tokens + output_tokens), 0)::int AS t FROM user_monthly_usage WHERE user_id = ? AND year_month = ?', VISITOR, month);
    await frames(await explain(OFFERED));
    const after = await db.get<{ t: number }>('SELECT COALESCE(SUM(input_tokens + output_tokens), 0)::int AS t FROM user_monthly_usage WHERE user_id = ? AND year_month = ?', VISITOR, month);
    expect(after!.t - before!.t).toBe(150);
  });

  it('a refusal after the stream began is an error frame, and the stream still ends', async () => {
    demo();
    caller = { id: ADMIN, role: 'admin' };
    const res = await explain(BROKEN);
    expect(res.status).toBe(200);
    const f = await frames(res);
    expect(f[0]).toMatchObject({ type: 'stream_start' });
    const error = f.find((x) => x !== '[DONE]' && x.type === 'error') as Record<string, unknown> | undefined;
    expect(error).toBeDefined();
    expect(typeof error!.message).toBe('string');
    expect(f[f.length - 1]).toBe('[DONE]');
  });

  it('verify-citations runs on the compat engine and reads the {"citations": [...]} object JSON mode returns', async () => {
    demo();
    const res = await post('/claude/verify-citations', { text: 'Under Article 3 of the AMLR an obliged entity must assess its risks.' });
    expect(res.status).toBe(200);
    const body = await res.json() as { citations: Array<{ citation: string; verified: boolean; comment: string }> };
    expect(body.citations.length).toBeGreaterThanOrEqual(2);
    expect(body.citations.every((c) => c.verified)).toBe(true);
    expect(body.citations.some((c) => /unexpected response/.test(c.comment))).toBe(false);
    // The prompt asks for the object, not a bare array.
    expect(seen.some((s) => /"citations" field is an array/.test(s.user))).toBe(true);
  });

  const review = (model: string) => post('/reviews', {
    modeId: 'red-team', content: 'Our AML controls are adequate; monitoring needs work.', model,
  });

  it('a review runs on the reviewer the visitor picked when the demo offers it, else the default; an admin gets any', async () => {
    const { REVIEW_MODES } = await import('../../server/services/review-engine.js');
    expect(REVIEW_MODES.some((m) => m.id === 'red-team')).toBe(true);
    demo();
    let res = await review(OFFERED);
    expect(res.status).toBe(200);
    let f = await frames(res);
    expect(f.some((x) => x !== '[DONE]' && x.type === 'text_delta' && String(x.content).includes('kimi-fake'))).toBe(true);
    expect(f[f.length - 1]).toBe('[DONE]');
    expect(seen.map((s) => s.model)).toEqual(['kimi-fake']);

    seen.length = 0;
    await frames(await review(NOT_OFFERED));
    expect(seen.map((s) => s.model)).toEqual(['glm-fake']);

    // Negative control: an administrator reviews on the model named.
    seen.length = 0;
    caller = { id: ADMIN, role: 'admin' };
    await frames(await review(NOT_OFFERED));
    expect(seen.map((s) => s.model)).toEqual(['other-fake']);

    // A refusal from the provider is an error frame, and the stream ends.
    res = await review(BROKEN);
    f = await frames(res);
    expect(f.some((x) => x !== '[DONE]' && x.type === 'error')).toBe(true);
    expect(f[f.length - 1]).toBe('[DONE]');
  });

  it('smart-search never offers a visitor a module the demo keeps off; an admin still gets it', async () => {
    const { getAllModules } = await import('../../server/services/module-loader.js');
    const all = await getAllModules();
    const hiddenModule = all.find((m) => (m as { areaId?: string }).areaId === 'healthcare');
    const visible = all.find((m) => (m as { areaId?: string }).areaId === 'financial-crime-prevention') ?? all.find((m) => !['healthcare', 'community-health', 'hr', 'workers-rights'].includes((m as { areaId?: string }).areaId ?? ''));
    expect(hiddenModule, 'a healthcare module in the catalogue').toBeDefined();
    expect(visible).toBeDefined();
    smart.reply = JSON.stringify([
      { moduleId: hiddenModule!.id, label: 'Hidden', reason: 'Matches.' },
      { moduleId: visible!.id, label: 'Visible', reason: 'Matches.' },
    ]);
    const query = { query: `${hiddenModule!.label} ${hiddenModule!.description ?? ''}`.slice(0, 300) };

    demo();
    let res = await post('/modules/smart-search', query);
    expect(res.status).toBe(200);
    let ids = (await res.json() as Array<{ moduleId: string }>).map((m) => m.moduleId);
    expect(ids).toContain(visible!.id);
    expect(ids).not.toContain(hiddenModule!.id);
    // Not even offered to the model as a candidate.
    expect(seen.some((s) => s.user.includes(`- ${hiddenModule!.id}:`))).toBe(false);

    // Negative control: an administrator sees every module.
    seen.length = 0;
    caller = { id: ADMIN, role: 'admin' };
    res = await post('/modules/smart-search', query);
    ids = (await res.json() as Array<{ moduleId: string }>).map((m) => m.moduleId);
    expect(ids).toContain(hiddenModule!.id);
    expect(seen.some((s) => s.user.includes(`- ${hiddenModule!.id}:`))).toBe(true);
  });
});
