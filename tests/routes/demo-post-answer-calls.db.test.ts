/**
 * demo-post-answer-calls.db.test.ts — on a public demo, an answer is followed by
 * at most the session conclusion (DEMO_POST_ANSWER_CALLS, default 'conclusion'),
 * or with 'scored' also the quality score — the Trust Score under the answer —
 * made by QUALITY_SCORER_MODEL when set, but never the structured extraction.
 *
 * Every other install follows an answer with three utility calls: a quality
 * score, the structured extraction and the session conclusion. A live run on
 * 2026-09-25 (GLM 5.3 Flash on the EU provider pin) showed what that means for
 * a demo: the three fire together right after the answer, cost more than the
 * answer, and all three were refused 429 by the pinned provider. The Transform
 * panel the extraction feeds is not open to visitors.
 *
 * Drives the real Work route on the test database, with the Settings default on
 * a compat model so the utility calls go to a fake OpenAI-compatible server
 * that reports a cost; which calls were made is read from the spend ledger.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http, { type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-demo-post-answer-calls';
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);
const SLUG = `tpost${tag}`;
const MODEL = `compat:${SLUG}:fake-model`;
/** A second model on the same endpoint: the one that rates the first one's answer. */
const SCORER = `compat:${SLUG}:scorer-model`;
const LONG_ANSWER = `Answer ${tag}. ` + 'The controls are adequate but the monitoring needs work. '.repeat(12);

function startFake(): Promise<{ server: Server; baseUrl: string }> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}') as { stream?: boolean };
      const usage = { prompt_tokens: 100, completion_tokens: 50, cost: 0.0001 };
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: LONG_ANSWER } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage })}\n\n`);
        res.end('data: [DONE]\n\n');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: '{"overall": 8, "summary": "ok"}' }, finish_reason: 'stop' }], usage }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` }));
  });
}

d('after-answer model calls on a public demo', () => {
  let db: DatabaseAdapter;
  let fake: Awaited<ReturnType<typeof startFake>>;
  let app: Server;
  let base = '';
  const sessions: string[] = [];
  const saved = { demo: process.env.DEMO_MODE, post: process.env.DEMO_POST_ANSWER_CALLS, mode: process.env.DEPLOYMENT_MODE, scorer: process.env.QUALITY_SCORER_MODEL };
  let setDefault: (db: DatabaseAdapter, model: string | null) => Promise<unknown>;

  beforeAll(async () => {
    delete process.env.DEPLOYMENT_MODE;
    fake = await startFake();
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    await db.run(
      `INSERT INTO custom_model_endpoints (slug, display_name, base_url, default_model, enabled) VALUES (?, 'Fake', ?, 'fake-model', TRUE)`,
      SLUG, fake.baseUrl,
    );
    const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
    setRouterDb(db);
    const store = await import('../../server/services/default-model-store.js');
    setDefault = store.setPersistedDefaultModel as typeof setDefault;
    await setDefault(db, MODEL);
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
    for (const [k, v] of [['DEMO_MODE', saved.demo], ['DEMO_POST_ANSWER_CALLS', saved.post], ['DEPLOYMENT_MODE', saved.mode], ['QUALITY_SCORER_MODEL', saved.scorer]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    await new Promise((r) => setTimeout(r, 1500));
    if (db) {
      await setDefault(db, null).catch(() => {});
      for (const s of sessions) {
        for (const t of ['llm_spend_ledger', 'session_snapshots', 'run_artifacts', 'workflow_outputs', 'quality_scores', 'versions', 'messages']) {
          await db.run(`DELETE FROM ${t} WHERE session_id = ?`, s).catch(() => {});
        }
        await db.run('DELETE FROM sessions WHERE id = ?', s).catch(() => {});
      }
      // The utility calls carry no session id here, so their ledger rows go by model.
      await db.run('DELETE FROM llm_spend_ledger WHERE model IN (?, ?)', MODEL, SCORER).catch(() => {});
      await db.run('DELETE FROM custom_model_endpoints WHERE slug = ?', SLUG).catch(() => {});
      const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
      setRouterDb(null);
      await db.close();
    }
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
    await new Promise<void>((resolve) => { fake?.server.close(() => resolve()); });
  });

  /** One Work run in a fresh session; the ledger purposes it produced within `waitMs`. */
  async function purposesOfOneRun(waitMs = 4000): Promise<string[]> {
    return (await oneRun(waitMs)).purposes;
  }

  async function oneRun(waitMs = 4000): Promise<{ sessionId: string; purposes: string[] }> {
    const sessionId = `sess-post-${tag}-${sessions.length}`;
    sessions.push(sessionId);
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, 'general', 'post-answer', '{}', 'solo')`, sessionId);
    // Utility calls carry no session id here (no request-context middleware is
    // mounted), so they are told apart by time: only rows written after this run began.
    await new Promise((r) => setTimeout(r, 2000)); // let an earlier run's calls finish
    const since = (await db.get<{ t: string }>('SELECT NOW()::text AS t'))!.t;
    const res = await fetch(`${base}/api/claude/message`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userMessage: 'Assess our AML controls.', model: MODEL, sessionId, thinking: 'quick' }),
      signal: AbortSignal.timeout(20_000),
    });
    expect(res.status).toBe(200);
    await res.text();
    await new Promise((r) => setTimeout(r, waitMs));
    const rows = await db.all<{ purpose: string }>(
      // This test's own model only: other DB tests running at the same time
      // write rows with no session too (a citation check, a review).
      "SELECT purpose FROM llm_spend_ledger WHERE session_id = ? OR (session_id IS NULL AND model IN (?, ?) AND created_at >= ?::timestamptz AND purpose <> 'work-run')",
      sessionId, MODEL, SCORER, since,
    );
    return { sessionId, purposes: [...new Set(rows.map((r) => r.purpose))].sort() };
  }

  it('on a demo, only the session conclusion follows the answer', async () => {
    process.env.DEMO_MODE = 'true';
    delete process.env.DEMO_POST_ANSWER_CALLS;
    const purposes = await purposesOfOneRun();
    expect(purposes).toContain('work-run');
    expect(purposes).not.toContain('quality-score');
    expect(purposes).not.toContain('structured-extraction');
  }, 30_000);

  it('DEMO_POST_ANSWER_CALLS=scored: the conclusion and the quality score follow the answer, the extraction does not', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_POST_ANSWER_CALLS = 'scored';
    delete process.env.QUALITY_SCORER_MODEL;
    const { sessionId, purposes } = await oneRun();
    expect(purposes).toContain('work-run');
    expect(purposes).toContain('quality-score');
    expect(purposes).toContain('session-conclusion');
    expect(purposes).not.toContain('structured-extraction');
    // With no QUALITY_SCORER_MODEL the routed utility model scores: here the Settings default.
    const row = await db.get<{ model_used: string }>('SELECT model_used FROM quality_scores WHERE session_id = ?', sessionId);
    expect(row?.model_used).toBe(MODEL);
  }, 30_000);

  it('QUALITY_SCORER_MODEL: a second model scores the answer, and quality_scores names it', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_POST_ANSWER_CALLS = 'scored';
    process.env.QUALITY_SCORER_MODEL = SCORER;
    const { sessionId } = await oneRun();
    const row = await db.get<{ model_used: string; score_overall: number }>('SELECT model_used, score_overall FROM quality_scores WHERE session_id = ?', sessionId);
    expect(row?.model_used).toBe(SCORER);
    expect(Number(row?.score_overall)).toBe(8);
    const ledger = await db.all<{ model: string }>("SELECT model FROM llm_spend_ledger WHERE purpose = 'quality-score' AND model = ?", SCORER);
    expect(ledger.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('DEMO_POST_ANSWER_CALLS=none: nothing follows the answer', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_POST_ANSWER_CALLS = 'none';
    const purposes = await purposesOfOneRun();
    expect(purposes.filter((p) => p !== 'work-run')).toEqual([]);
  }, 30_000);

  it('negative control: outside a demo the quality score still runs after the answer', async () => {
    delete process.env.DEMO_MODE;
    delete process.env.DEMO_POST_ANSWER_CALLS;
    const purposes = await purposesOfOneRun();
    expect(purposes).toContain('quality-score');
  }, 30_000);
});
