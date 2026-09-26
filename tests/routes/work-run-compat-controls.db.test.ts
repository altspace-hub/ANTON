/**
 * work-run-compat-controls.db.test.ts — a Work run on an OpenRouter-style
 * compat model, end to end on the test database, against a fake
 * OpenAI-compatible server started here (no paid API is called).
 *
 * What a public showcase on one OpenRouter key needs from POST /api/claude/message:
 *   - the endpoint's extra body (EU / zero-retention provider pin), reasoning
 *     effort from the thinking level, include_usage and a hashed user id reach
 *     the endpoint;
 *   - the reported cost lands on the message, the run record and the spend
 *     ledger (a compat run recorded NULL before, so no cap could trip);
 *   - a model outside the endpoint's allowed list, and a run past the daily
 *     spend cap, are refused before anything is saved or sent;
 *   - web search, which does not run on this path, is recorded as not run and
 *     the page is told; a cut-off answer and a mid-stream error are shown;
 *   - an image goes to a vision model as an image part and is refused, with a
 *     clear message, for a model that cannot read images.
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http, { type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-work-run-compat-controls';
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const tag = randomUUID().slice(0, 8);
const SLUG = `tor${tag}`;
const SESSION = `sess-compat-${tag}`;
const CAP_MARKER_MODEL = `cap-marker-${tag}`;
const EU_PIN = { provider: { only: ['inceptron', 'nextbit'], allow_fallbacks: false, zdr: true, data_collection: 'deny' } };
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

interface FakeCall { model: string; stream: boolean; body: Record<string, unknown> }

/** An OpenRouter-shaped fake: the model name picks the behaviour. */
function startFakeOpenRouter(): Promise<{ server: Server; baseUrl: string; calls: FakeCall[] }> {
  const calls: FakeCall[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c.toString('utf8'); });
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) { res.writeHead(404).end(); return; }
      const body = JSON.parse(raw || '{}') as Record<string, unknown>;
      const model = String(body.model);
      calls.push({ model, stream: !!body.stream, body });
      if (!body.stream) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      if (model === 'trunc-model') {
        send({ choices: [{ delta: { content: 'Section 1. Section 2. Sect' } }] });
        send({ choices: [{ delta: {}, finish_reason: 'length' }], usage: { prompt_tokens: 50, completion_tokens: 20, cost: 0.0001 } });
      } else if (model === 'err-model') {
        send({ choices: [{ delta: { content: 'Half an ans' } }] });
        send({ error: { code: 502, message: 'Provider disconnected' }, choices: [{ delta: {}, finish_reason: 'error' }] });
      } else {
        send({ choices: [{ delta: { reasoning: 'Weighing the controls. ' } }] });
        send({ choices: [{ delta: { content: 'The answer ' } }] });
        send({ choices: [{ delta: { content: `for ${tag}.` } }] });
        send({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1200, completion_tokens: 300, cost: 0.0042, completion_tokens_details: { reasoning_tokens: 120 } } });
      }
      res.end('data: [DONE]\n\n');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/v1`, calls });
    });
  });
}

interface Frame { type?: string; code?: string; message?: string; content?: string; thinkingTokens?: number; context?: { webSearch?: boolean; effort?: string | null } }

function framesOf(body: string): Frame[] {
  return body.split('\n')
    .filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
    .map((l) => { try { return JSON.parse(l.slice(6)) as Frame; } catch { return {}; } });
}

d('Work run on an OpenRouter-style compat model', () => {
  let db: DatabaseAdapter;
  let fake: Awaited<ReturnType<typeof startFakeOpenRouter>>;
  let app: Server;
  let base = '';
  let uploadDir = '';
  const saved: Record<string, string | undefined> = {};
  const ENV = ['DEPLOYMENT_MODE', 'UPLOAD_DIR', 'LLM_DAILY_SPEND_CAP_USD', 'LLM_USER_DAILY_SPEND_CAP_USD'];

  beforeAll(async () => {
    for (const k of ENV) saved[k] = process.env[k];
    delete process.env.DEPLOYMENT_MODE;
    delete process.env.LLM_DAILY_SPEND_CAP_USD;
    delete process.env.LLM_USER_DAILY_SPEND_CAP_USD;
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), `anton-compat-uploads-${tag}-`));
    process.env.UPLOAD_DIR = uploadDir;
    fs.writeFileSync(path.join(uploadDir, `img-${tag}.png`), Buffer.from(PNG_B64, 'base64'));

    fake = await startFakeOpenRouter();
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    await db.run(
      `INSERT INTO custom_model_endpoints
         (slug, display_name, base_url, default_model, enabled, extra_body, allowed_models, model_meta)
       VALUES (?, 'Fake OpenRouter', ?, 'glm-model', TRUE, ?::jsonb, ?::jsonb, ?::jsonb)`,
      SLUG, fake.baseUrl,
      JSON.stringify(EU_PIN),
      JSON.stringify(['glm-model', 'vl-model', 'trunc-model', 'err-model']),
      JSON.stringify({
        'glm-model': { inputModalities: ['text'], reasoning: { mandatory: true, supportedEfforts: ['low', 'high', 'max'] } },
        'vl-model': { inputModalities: ['text', 'image'] },
      }),
    );
    await db.run(`INSERT INTO sessions (id, module_id, title, config) VALUES (?, 'general', 'compat controls', '{}')`, SESSION);

    const { invalidateCustomEndpointCache } = await import('../../server/services/custom-endpoint-resolver.js');
    invalidateCustomEndpointCache();
    const { requestContextMiddleware } = await import('../../server/lib/request-context.js');
    const { createClaudeRoutes } = await import('../../server/routes/claude.js');
    const expressApp = express();
    expressApp.use(express.json({ limit: '5mb' }));
    expressApp.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: { id: string; username: string; role: string } }).user = { id: 'solo', username: 'solo', role: 'admin' };
      next();
    });
    expressApp.use(requestContextMiddleware);
    expressApp.use('/api', await createClaudeRoutes(db));
    await new Promise<void>((resolve) => { app = expressApp.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    await new Promise((r) => setTimeout(r, 500));
    if (db) {
      for (const table of ['session_snapshots', 'run_artifacts', 'workflow_outputs', 'messages', 'llm_spend_ledger']) {
        await db.run(`DELETE FROM ${table} WHERE session_id = ?`, SESSION).catch(() => {});
      }
      await db.run('DELETE FROM llm_spend_ledger WHERE model = ?', CAP_MARKER_MODEL).catch(() => {});
      await db.run('DELETE FROM sessions WHERE id = ?', SESSION).catch(() => {});
      await db.run('DELETE FROM custom_model_endpoints WHERE slug = ?', SLUG).catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
    await new Promise<void>((resolve) => { fake?.server.close(() => resolve()); });
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  beforeEach(() => { fake.calls.length = 0; });

  async function run(body: Record<string, unknown>): Promise<{ status: number; text: string }> {
    const res = await fetch(`${base}/api/claude/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userMessage: 'Assess our AML controls.', sessionId: SESSION, thinking: 'quick', ...body }),
      signal: AbortSignal.timeout(20_000),
    });
    return { status: res.status, text: await res.text() };
  }

  async function userMessageCount(): Promise<number> {
    const row = await db.get<{ c: number | string }>(`SELECT COUNT(*) AS c FROM messages WHERE session_id = ? AND role = 'user'`, SESSION);
    return Number(row?.c ?? 0);
  }

  it('sends the EU provider pin, reasoning effort, include_usage and a hashed user, and records the reported cost everywhere', async () => {
    const { status, text } = await run({ model: `compat:${SLUG}:glm-model` });
    expect(status).toBe(200);
    const frames = framesOf(text);
    expect(frames.filter((f) => f.type === 'text_delta').map((f) => f.content).join('')).toBe(`The answer for ${tag}.`);
    expect(frames.filter((f) => f.type === 'thinking_delta').map((f) => f.content).join('')).toBe('Weighing the controls. ');
    expect(frames.find((f) => f.type === 'usage')?.thinkingTokens).toBe(120);
    expect(frames.find((f) => f.type === 'context_used')?.context?.effort).toBe('low');

    const call = fake.calls.find((c) => c.stream && c.model === 'glm-model');
    expect(call).toBeTruthy();
    expect(call!.body.provider).toEqual(EU_PIN.provider);
    expect(call!.body.reasoning).toEqual({ effort: 'low' });
    expect(call!.body.stream_options).toEqual({ include_usage: true });
    expect(typeof call!.body.user).toBe('string');
    expect(String(call!.body.user)).not.toContain('solo');

    await new Promise((r) => setTimeout(r, 300));
    const msg = await db.get<{ cost: number | null; config_snapshot: string }>(
      `SELECT cost, config_snapshot FROM messages WHERE session_id = ? AND role = 'assistant' AND content LIKE ?`, SESSION, `%${tag}%`);
    expect(msg?.cost).toBeCloseTo(0.0042);
    const snapshot = JSON.parse(msg!.config_snapshot) as { costBasis?: string; engineCostUsd?: number };
    expect(snapshot.costBasis).toBe('reported');
    expect(snapshot.engineCostUsd).toBeCloseTo(0.0042);

    const ledger = await db.all<{ user_id: string | null; cost_usd: number; reasoning_tokens: number; cost_source: string; purpose: string }>(
      `SELECT user_id, cost_usd, reasoning_tokens, cost_source, purpose FROM llm_spend_ledger WHERE session_id = ? AND purpose = 'work-run'`, SESSION);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ user_id: 'solo', reasoning_tokens: 120, cost_source: 'reported' });
    expect(ledger[0].cost_usd).toBeCloseTo(0.0042);
  }, 30_000);

  it('refuses a model outside the endpoint\'s allowed list before anything is saved or sent', async () => {
    const before = await userMessageCount();
    const { status, text } = await run({ model: `compat:${SLUG}:openai/o5-pro` });
    expect(status).toBe(403);
    expect(JSON.parse(text)).toMatchObject({ code: 'MODEL_NOT_ALLOWED' });
    expect(fake.calls).toHaveLength(0);
    expect(await userMessageCount()).toBe(before);
  }, 30_000);

  it('refuses a run once today\'s spend has reached the instance cap', async () => {
    await db.run(
      `INSERT INTO llm_spend_ledger (user_id, model, cost_usd, cost_source) VALUES (NULL, ?, 1000, 'reported')`,
      CAP_MARKER_MODEL,
    );
    process.env.LLM_DAILY_SPEND_CAP_USD = '0.01';
    try {
      const before = await userMessageCount();
      const { status, text } = await run({ model: `compat:${SLUG}:glm-model` });
      expect(status).toBe(402);
      expect(JSON.parse(text).error).toMatch(/Today's AI budget for this demo is used up/);
      expect(fake.calls).toHaveLength(0);
      expect(await userMessageCount()).toBe(before);
    } finally {
      delete process.env.LLM_DAILY_SPEND_CAP_USD;
      await db.run('DELETE FROM llm_spend_ledger WHERE model = ?', CAP_MARKER_MODEL);
    }
  }, 30_000);

  it('records web search as not run and tells the page', async () => {
    const { status, text } = await run({
      model: `compat:${SLUG}:glm-model`,
      knowledgeSources: { modes: { claudeKnowledge: { enabled: true, webSearchEnabled: true } } },
    });
    expect(status).toBe(200);
    const frames = framesOf(text);
    expect(frames.find((f) => f.type === 'notice' && f.code === 'web_search_unavailable')).toBeTruthy();
    const contexts = frames.filter((f) => f.type === 'context_used');
    expect(contexts[contexts.length - 1].context?.webSearch).toBe(false);
  }, 30_000);

  it('says the deepest level and multi-agent ran as a single call', async () => {
    const { text } = await run({ model: `compat:${SLUG}:glm-model`, thinking: 'deep_investigate', multiAgentEnabled: true });
    const codes = framesOf(text).filter((f) => f.type === 'notice').map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['single_call', 'multi_agent_unavailable']));
    // …and the model got max effort, the most GLM offers.
    expect(fake.calls.find((c) => c.stream)?.body.reasoning).toEqual({ effort: 'max' });
  }, 30_000);

  it('shows a cut-off answer as a notice and a mid-stream error as an error', async () => {
    const cut = framesOf((await run({ model: `compat:${SLUG}:trunc-model` })).text);
    expect(cut.find((f) => f.type === 'notice' && f.code === 'output_truncated')).toBeTruthy();
    expect(cut.find((f) => f.type === 'stream_end')).toBeTruthy();

    const broken = framesOf((await run({ model: `compat:${SLUG}:err-model` })).text);
    expect(broken.find((f) => f.type === 'error')?.message).toMatch(/Provider disconnected/);
    expect(broken.find((f) => f.type === 'stream_end')).toBeUndefined();
  }, 30_000);

  it('sends an image to a vision model as an image part', async () => {
    const { status } = await run({ model: `compat:${SLUG}:vl-model`, uploadedFileIds: [`img-${tag}.png`] });
    expect(status).toBe(200);
    const call = fake.calls.find((c) => c.stream && c.model === 'vl-model');
    const messages = call!.body.messages as Array<{ role: string; content: unknown }>;
    const last = messages[messages.length - 1];
    expect(Array.isArray(last.content)).toBe(true);
    const parts = last.content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.find((p) => p.type === 'image_url')?.image_url?.url).toBe(`data:image/png;base64,${PNG_B64}`);
    // The base64 is in the image part only, never in the text of the prompt.
    expect(JSON.stringify(messages.filter((m) => typeof m.content === 'string'))).not.toContain(PNG_B64.slice(0, 40));
  }, 30_000);

  it('refuses an image for a model that cannot read images, before anything is saved or sent', async () => {
    const before = await userMessageCount();
    const { status, text } = await run({ model: `compat:${SLUG}:glm-model`, uploadedFileIds: [`img-${tag}.png`] });
    expect(status).toBe(400);
    expect(JSON.parse(text)).toMatchObject({ code: 'IMAGE_NOT_SUPPORTED' });
    expect(fake.calls).toHaveLength(0);
    expect(await userMessageCount()).toBe(before);
  }, 30_000);
});
