/**
 * work-run-non-claude-stream.db.test.ts — a Work run on a model that is not
 * Claude streams its answer and ends.
 *
 * Since 2026-09-08 (73b5b4c8) POST /api/claude/message sends the SSE headers
 * early, for the "context used" frame. The non-Claude branch then called
 * res.writeHead a second time, unguarded; Node throws ERR_HTTP_HEADERS_SENT,
 * the outer catch cannot answer once headers are out, and the response was
 * never ended. Every Ollama, OpenAI, Mistral, Gemini, Azure and compat:
 * (OpenAI-compatible, e.g. OpenRouter) run hung after its first frame. No test
 * reached that branch, so nothing failed.
 *
 * This drives the real route end to end on the test database: a compat:
 * endpoint row points at a fake OpenAI-compatible server started here, and the
 * run must stream the fake model's words and finish. Skips without a test
 * database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http, { type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-work-run-non-claude-stream';
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const tag = randomUUID().slice(0, 8);
const SLUG = `tfake${tag}`;
const SESSION = `sess-fake-${tag}`;
const ANSWER_WORDS = ['The fake model ', 'answers ', `run ${tag}.`];

/** A minimal OpenAI-compatible server: streams ANSWER_WORDS, answers non-streamed calls with "{}". */
function startFakeModel(): Promise<{ server: Server; baseUrl: string; calls: Array<{ stream: boolean }> }> {
  const calls: Array<{ stream: boolean }> = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
        res.writeHead(404).end();
        return;
      }
      const parsed = JSON.parse(body || '{}') as { stream?: boolean };
      calls.push({ stream: !!parsed.stream });
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        for (const w of ANSWER_WORDS) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 42, completion_tokens: 7 } })}\n\n`);
        res.end('data: [DONE]\n\n');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/v1`, calls });
    });
  });
}

d('Work run on an OpenAI-compatible model', () => {
  let db: DatabaseAdapter;
  let fake: Awaited<ReturnType<typeof startFakeModel>>;
  let app: Server;
  let base = '';
  const savedMode = process.env.DEPLOYMENT_MODE;

  beforeAll(async () => {
    delete process.env.DEPLOYMENT_MODE;
    fake = await startFakeModel();
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    await db.run(
      `INSERT INTO custom_model_endpoints (slug, display_name, base_url, default_model, enabled)
       VALUES (?, 'Fake model', ?, 'fake-model', TRUE)`,
      SLUG, fake.baseUrl,
    );
    await db.run(`INSERT INTO sessions (id, module_id, title, config) VALUES (?, 'general', 'non-claude stream', '{}')`, SESSION);

    const { createClaudeRoutes } = await import('../../server/routes/claude.js');
    const expressApp = express();
    expressApp.use(express.json());
    expressApp.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: { id: string; username: string; role: string } }).user = { id: 'solo', username: 'solo', role: 'admin' };
      next();
    });
    expressApp.use('/api', await createClaudeRoutes(db));
    await new Promise<void>((resolve) => { app = expressApp.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = savedMode;
    // Background work after an answer (title, conclusion, …) may still be writing.
    await new Promise((r) => setTimeout(r, 500));
    if (db) {
      for (const table of ['session_snapshots', 'run_artifacts', 'workflow_outputs', 'messages']) {
        await db.run(`DELETE FROM ${table} WHERE session_id = ?`, SESSION).catch(() => {});
      }
      await db.run('DELETE FROM sessions WHERE id = ?', SESSION).catch(() => {});
      await db.run('DELETE FROM custom_model_endpoints WHERE slug = ?', SLUG).catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
    await new Promise<void>((resolve) => { fake?.server.close(() => resolve()); });
  });

  it('streams the model\'s answer and ends the response', async () => {
    const res = await fetch(`${base}/api/claude/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userMessage: 'Say something.', model: `compat:${SLUG}:fake-model`, sessionId: SESSION, thinking: 'quick' }),
      // A hang is the bug: fail in bounded time instead of stalling the suite.
      signal: AbortSignal.timeout(20_000),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const body = await res.text();   // resolves only when the server ends the response

    const deltas = body.split('\n')
      .filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
      .map((l) => { try { return JSON.parse(l.slice(6)) as { type?: string; content?: string }; } catch { return {}; } })
      .filter((e) => e.type === 'text_delta')
      .map((e) => e.content)
      .join('');
    expect(deltas).toBe(ANSWER_WORDS.join(''));
    expect(body).toContain('data: [DONE]');
    expect(fake.calls.some((c) => c.stream)).toBe(true);
  }, 30_000);
});
