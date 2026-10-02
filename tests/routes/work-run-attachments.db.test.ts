/**
 * work-run-attachments.db.test.ts — a Work run reads its attached files even
 * when the request carries no knowledge settings.
 *
 * The route resolved knowledge only when `knowledgeSources` was present, and
 * uploaded documents are resolved there, so a run without it (an API client, a
 * script) dropped every upload without a word. Found by the live check on the
 * demo (scripts/demo-smoke.ts, 2026-10-01): the model answered that no supplier
 * register had been supplied.
 *
 * Drives the real Work route on the test database against a fake
 * OpenAI-compatible server that records what it was sent.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http, { type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

const H = vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-work-run-attachments';
  // Read when routes/claude.ts loads.
  const dir = `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/anton-attach-${Date.now()}`;
  process.env.UPLOAD_DIR = dir;
  return { dir };
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);
const SLUG = `tattach${tag}`;
const MODEL = `compat:${SLUG}:fake-model`;
const MARKER = `DataPipe-${tag} Inc - analytics - US - no DPA on file`;
const FILE_ID = `register-${tag}.txt`;

function startFake(seen: string[]): Promise<{ server: Server; baseUrl: string }> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
    req.on('end', () => {
      seen.push(body);
      const parsed = JSON.parse(body || '{}') as { stream?: boolean };
      const usage = { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 };
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Noted.' } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage })}\n\n`);
        res.end('data: [DONE]\n\n');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }], usage }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` }));
  });
}

d('a Work run and its attached files', () => {
  let db: DatabaseAdapter;
  const seen: string[] = [];
  let fake: Awaited<ReturnType<typeof startFake>>;
  let app: Server;
  let base = '';
  const sessions: string[] = [];
  const savedMode = process.env.DEPLOYMENT_MODE;

  beforeAll(async () => {
    delete process.env.DEPLOYMENT_MODE;
    fs.mkdirSync(H.dir, { recursive: true });
    fs.writeFileSync(path.join(H.dir, FILE_ID), `Supplier register (fictional)\n${MARKER}\n`);
    fake = await startFake(seen);
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    await db.run(
      `INSERT INTO custom_model_endpoints (slug, display_name, base_url, default_model, enabled) VALUES (?, 'Fake', ?, 'fake-model', TRUE)`,
      SLUG, fake.baseUrl,
    );
    const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
    setRouterDb(db);
    const { createClaudeRoutes } = await import('../../server/routes/claude.js');
    const e = express();
    e.use(express.json());
    e.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: { id: string; username: string; role: string } }).user = { id: 'solo', username: 'solo', role: 'admin' };
      next();
    });
    e.use('/api', await createClaudeRoutes(db));
    await new Promise<void>((resolve) => { app = e.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = savedMode;
    await new Promise((r) => setTimeout(r, 1500));
    if (db) {
      for (const s of sessions) {
        for (const t of ['llm_spend_ledger', 'session_snapshots', 'run_artifacts', 'workflow_outputs', 'quality_scores', 'versions', 'messages']) {
          await db.run(`DELETE FROM ${t} WHERE session_id = ?`, s).catch(() => {});
        }
        await db.run('DELETE FROM sessions WHERE id = ?', s).catch(() => {});
      }
      await db.run('DELETE FROM llm_spend_ledger WHERE model = ?', MODEL).catch(() => {});
      await db.run('DELETE FROM custom_model_endpoints WHERE slug = ?', SLUG).catch(() => {});
      const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
      setRouterDb(null);
      await db.close();
    }
    fs.rmSync(H.dir, { recursive: true, force: true });
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
    await new Promise<void>((resolve) => { fake?.server.close(() => resolve()); });
  });

  async function run(extra: Record<string, unknown>): Promise<string> {
    const sessionId = `sess-attach-${tag}-${sessions.length}`;
    sessions.push(sessionId);
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, 'general', 'attach', '{}', 'solo')`, sessionId);
    const before = seen.length;
    const res = await fetch(`${base}/api/claude/message`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userMessage: 'Which suppliers need a transfer assessment?', model: MODEL, sessionId, thinking: 'quick', ...extra }),
      signal: AbortSignal.timeout(20_000),
    });
    expect(res.status).toBe(200);
    await res.text();
    // The Work call is the streamed one; after-answer calls are not.
    return seen.slice(before).filter((b) => (JSON.parse(b) as { stream?: boolean }).stream).join('\n');
  }

  it('sends the attached file to the model when the request carries no knowledge settings', async () => {
    const sent = await run({ uploadedFileIds: [FILE_ID] });
    expect(sent).toContain(MARKER);
  }, 30_000);

  it('and still when it does (the web client always sends them)', async () => {
    const sent = await run({
      uploadedFileIds: [FILE_ID],
      knowledgeSources: { modes: { claudeKnowledge: { enabled: true, webSearchEnabled: false } } },
    });
    expect(sent).toContain(MARKER);
  }, 30_000);

  it('negative control: without the attachment the text is not there', async () => {
    const sent = await run({});
    expect(sent).not.toContain(MARKER);
  }, 30_000);
});
