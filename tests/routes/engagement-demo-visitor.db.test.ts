/**
 * engagement-demo-visitor.db.test.ts — Engagement Tasks on the public demo
 * (2026-10-02): each visitor sees only their own engagements, runs only the
 * demo's models, pays from their own budget, cannot search the web silently,
 * cannot reach a folder on the server, and stores files the account deletion
 * removes.
 *
 * Found before the fix (routes/engagements.ts):
 *   - an id from another engagement, inside the caller's own, reached that
 *     row: PATCH …/iterations/:itId, …/resources/:resId, …/workstreams/:wsId,
 *     …/team/:memberId updated (and returned) another person's row; the
 *     quality gate and the export took any iteration_id — someone else's
 *     deliverable went to the model or into the caller's file; execute took
 *     any workstream_id into its prompt;
 *   - another person's engagement answered 403, confirming it exists;
 *   - the peer library listed every opted-in engagement on the instance —
 *     on a demo, strangers' — and from-internal copied their gate findings;
 *   - exec_model took any id; model calls were not charged to the budget;
 *     web search on a compat model was dropped without a word;
 *   - uploads bypassed the demo quota and had no file_uploads row, so the
 *     account deletion left the files on disk.
 *
 * Real routes on the test database; the model is a fake OpenAI-compatible
 * server that records what it was sent. Every visitor rule has its negative
 * control: the owner, an administrator, or a server that is not a demo.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http, { type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-engagement-demo';
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);
const SLUG = `teng${tag}`;
const DEFAULT = `compat:${SLUG}:glm-fake`;
const OFFERED = `compat:${SLUG}:kimi-fake`;
const A = { id: `u-eng-a-${tag}`, role: 'analyst' };
const B = { id: `u-eng-b-${tag}`, role: 'analyst' };
const ADMIN = { id: `u-eng-admin-${tag}`, role: 'admin' };
type Who = { id: string; role: string };

interface Sent { model: string; stream: boolean; hasTools: boolean; system: string; user: string }

function startFake(seen: Sent[]): Promise<{ server: Server; baseUrl: string }> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}') as { model?: string; stream?: boolean; tools?: unknown[]; messages?: Array<{ role: string; content: unknown }> };
      const text = (role: string) => (parsed.messages ?? []).filter((m) => m.role === role).map((m) => String(m.content)).join('\n');
      seen.push({ model: String(parsed.model), stream: !!parsed.stream, hasTools: Array.isArray(parsed.tools) && parsed.tools.length > 0, system: text('system'), user: text('user') });
      const usage = { prompt_tokens: 120, completion_tokens: 30 };
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `Deliverable by ${String(parsed.model)}.` } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage })}\n\n`);
        res.end('data: [DONE]\n\n');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '{"gaps":[],"overall_assessment":"ok","confidence":"high"}' }, finish_reason: 'stop' }], usage }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` }));
  });
}

const sseFrames = (body: string): Array<Record<string, unknown>> => body.split('\n')
  .filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
  .map((l) => { try { return JSON.parse(l.slice(6)) as Record<string, unknown>; } catch { return {}; } });

d('Engagement Tasks for a public-demo visitor', () => {
  let db: DatabaseAdapter;
  const seen: Sent[] = [];
  let fake: Awaited<ReturnType<typeof startFake>>;
  let app: Server;
  let base = '';
  let uploadDir = '';
  let setDefault: (db: DatabaseAdapter, model: string | null) => Promise<unknown>;
  const ENV = ['DEMO_MODE', 'DEPLOYMENT_MODE', 'DEMO_OFFERED_MODELS', 'DEMO_POST_ANSWER_CALLS', 'UPLOAD_DIR', 'DEMO_USER_UPLOAD_MB', 'DEMO_USER_UPLOAD_FILES'] as const;
  const saved: Record<string, string | undefined> = {};
  // Engagements and rows seeded per run.
  let EA = ''; let EB = ''; let EADMIN = '';
  const IA = `it-a-${tag}`; const IB = `it-b-${tag}`; const RA = `res-a-${tag}`; const WA = `ws-a-${tag}`; const MA = `mem-a-${tag}`;

  const demoEnv = () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEPLOYMENT_MODE = 'team';
    process.env.DEMO_OFFERED_MODELS = `${DEFAULT},${OFFERED}`;
    process.env.DEMO_POST_ANSWER_CALLS = 'none';
    process.env.UPLOAD_DIR = uploadDir;
  };

  const call = (who: Who, method: string, p: string, body?: unknown) => fetch(`${base}/api/engagements${p}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-test-user': who.id, 'x-test-role': who.role },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const upload = (who: Who, p: string, name: string, bytes: number, fields: Record<string, string>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('file', new Blob([Buffer.alloc(bytes, 'a')], { type: 'text/plain' }), name);
    return fetch(`${base}/api/engagements${p}`, { method: 'POST', body: form, headers: { 'x-test-user': who.id, 'x-test-role': who.role }, signal: AbortSignal.timeout(30_000) });
  };

  const usage = async (userId: string): Promise<number> => Number((await db.get<{ t: number | string }>(
    'SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS t FROM user_monthly_usage WHERE user_id = ? AND year_month = ?',
    userId, new Date().toISOString().slice(0, 7),
  ))?.t ?? 0);

  beforeAll(async () => {
    for (const k of ENV) saved[k] = process.env[k];
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-eng-demo-uploads-'));
    fake = await startFake(seen);
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    await db.run(
      `INSERT INTO custom_model_endpoints (slug, display_name, base_url, default_model, enabled) VALUES (?, 'Fake', ?, 'glm-fake', TRUE)`,
      SLUG, fake.baseUrl,
    );
    for (const who of [A, B]) {
      await db.run(`INSERT INTO users (id, username, password_hash, role, monthly_token_budget, demo_expires_at) VALUES (?, ?, 'x', ?, 0, NOW() + INTERVAL '30 days')`, who.id, who.id, who.role);
    }
    await db.run(`INSERT INTO users (id, username, password_hash, role, monthly_token_budget) VALUES (?, ?, 'x', 'admin', 0)`, ADMIN.id, ADMIN.id);
    const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
    setRouterDb(db);
    const store = await import('../../server/services/default-model-store.js');
    setDefault = store.setPersistedDefaultModel as typeof setDefault;
    await setDefault(db, DEFAULT);

    const { createEngagementsRoutes } = await import('../../server/routes/engagements.js');
    const e = express();
    e.use(express.json({ limit: '50mb' }));
    e.use((req: Request, _res: Response, next: NextFunction) => {
      const id = req.header('x-test-user');
      if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    e.use('/api/engagements', await createEngagementsRoutes(db));
    await new Promise<void>((resolve) => { app = e.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;

    demoEnv();
    const create = async (who: Who, title: string) => ((await (await call(who, 'POST', '', { title })).json()) as { id: string }).id;
    EA = await create(A, `Alice engagement ${tag}`);
    EB = await create(B, `Bob engagement ${tag}`);
    EADMIN = await create(ADMIN, `Admin engagement ${tag}`);
    await db.run(`INSERT INTO engagement_workstreams (id, engagement_id, title, description) VALUES (?, ?, 'Alice workstream', 'SECRET-A workstream brief')`, WA, EA);
    await db.run(`INSERT INTO engagement_iterations (id, engagement_id, iteration_number, output_content, status) VALUES (?, ?, 1, 'SECRET-A deliverable text', 'draft')`, IA, EA);
    await db.run(`INSERT INTO engagement_iterations (id, engagement_id, iteration_number, output_content, status) VALUES (?, ?, 1, 'Bob deliverable text', 'draft')`, IB, EB);
    await db.run(`INSERT INTO engagement_resources (id, engagement_id, category, title, status, extracted_content) VALUES (?, ?, 'documents', 'Alice policy', 'reviewed', 'SECRET-A policy')`, RA, EA);
    await db.run(`INSERT INTO engagement_stakeholders (id, engagement_id, name, stakeholder_type) VALUES (?, ?, 'Alice Secret Contact', 'client_contact')`, MA, EA);
  });

  beforeEach(() => { demoEnv(); seen.length = 0; });

  afterEach(() => {
    for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  });

  afterAll(async () => {
    if (db) {
      const { deleteDemoAccountNow } = await import('../../server/services/demo-retention.js');
      for (const who of [A, B]) await deleteDemoAccountNow(db, who.id, { uploadDir }).catch(() => {});
      const adminFiles = await db.all<{ id: string }>('SELECT id FROM file_uploads WHERE uploaded_by = ?', ADMIN.id).catch(() => [] as Array<{ id: string }>);
      await db.run('DELETE FROM file_uploads WHERE uploaded_by = ?', ADMIN.id).catch(() => {});
      await db.run('DELETE FROM engagements WHERE user_id = ?', ADMIN.id).catch(() => {});
      await db.run('DELETE FROM sessions WHERE user_id = ?', ADMIN.id).catch(() => {});
      await db.run('DELETE FROM user_monthly_usage WHERE user_id = ?', ADMIN.id).catch(() => {});
      await db.run('DELETE FROM users WHERE id IN (?, ?, ?)', A.id, B.id, ADMIN.id).catch(() => {});
      await db.run('DELETE FROM llm_spend_ledger WHERE model LIKE ?', `compat:${SLUG}:%`).catch(() => {});
      await db.run('DELETE FROM custom_model_endpoints WHERE slug = ?', SLUG).catch(() => {});
      await setDefault(db, null).catch(() => {});
      const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
      setRouterDb(null);
      await db.close();
      void adminFiles;
    }
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
    await new Promise<void>((resolve) => { fake?.server.close(() => resolve()); });
    for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  it('another visitor\'s engagement answers 404 — as a missing one does — on every route; the owner and an admin still open it', async () => {
    for (const [method, p, body] of [
      ['GET', `/${EA}`, undefined], ['PATCH', `/${EA}`, { title: 'hijacked' }], ['DELETE', `/${EA}`, undefined],
      ['GET', `/${EA}/iterations`, undefined], ['GET', `/${EA}/changelog`, undefined], ['GET', `/${EA}/team`, undefined],
      ['POST', `/${EA}/execute`, {}], ['POST', `/${EA}/export`, { format: 'md' }], ['POST', `/${EA}/quality-gate/run`, {}],
    ] as Array<[string, string, unknown]>) {
      const res = await call(B, method, p, body);
      expect(res.status, `${method} ${p}`).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found' });
    }
    // A missing engagement answers the same.
    expect((await call(B, 'GET', `/missing-${tag}`)).status).toBe(404);
    expect(seen).toHaveLength(0);
    const row = await db.get<{ title: string; status: string }>('SELECT title, status FROM engagements WHERE id = ?', EA);
    expect(row).toMatchObject({ title: `Alice engagement ${tag}` });
    expect(row!.status).not.toBe('archived');
    // B's list does not name it.
    const list = await (await call(B, 'GET', '')).json() as Array<{ id: string }>;
    expect(list.map((e) => e.id)).toContain(EB);
    expect(list.map((e) => e.id)).not.toContain(EA);

    // Negative controls: the owner and an administrator.
    const own = await call(A, 'GET', `/${EA}`);
    expect(own.status).toBe(200);
    expect(((await own.json()) as { iterations: Array<{ id: string }> }).iterations.map((i) => i.id)).toContain(IA);
    expect((await call(ADMIN, 'GET', `/${EA}`)).status).toBe(200);
  });

  it('an id from another engagement, inside the visitor\'s own, is absent: nothing read, nothing changed, nothing sent', async () => {
    expect((await call(B, 'PATCH', `/${EB}/iterations/${IA}`, { status: 'approved' })).status).toBe(404);
    expect((await call(B, 'PATCH', `/${EB}/resources/${RA}`, { status: 'not_available' })).status).toBe(404);
    expect((await call(B, 'PATCH', `/${EB}/workstreams/${WA}`, { title: 'taken' })).status).toBe(404);
    expect((await call(B, 'PATCH', `/${EB}/team/${MA}`, { name: 'taken' })).status).toBe(404);
    expect((await call(B, 'DELETE', `/${EB}/team/${MA}`)).status).toBe(200);
    const exported = await call(B, 'POST', `/${EB}/export`, { format: 'md', iteration_id: IA });
    expect(exported.status).toBe(404);
    expect(await exported.text()).not.toContain('SECRET-A');
    expect((await call(B, 'POST', `/${EB}/quality-gate/run`, { iteration_id: IA })).status).toBe(404);
    expect((await call(B, 'POST', `/${EB}/execute`, { workstream_id: WA })).status).toBe(404);
    const scope = await (await call(B, 'POST', `/${EB}/scope-items`, { title: 'Transaction monitoring' })).json() as { id: string };
    expect((await call(B, 'PATCH', `/${EB}/scope-items/${scope.id}`, { workstream_id: WA })).status).toBe(404);
    expect((await call(B, 'POST', `/${EB}/resources`, { url: 'https://example.org/a', workstream_id: WA })).status).toBe(404);
    expect(seen).toHaveLength(0);

    expect(await db.get('SELECT status FROM engagement_iterations WHERE id = ?', IA)).toEqual({ status: 'draft' });
    expect(await db.get('SELECT status FROM engagement_resources WHERE id = ?', RA)).toEqual({ status: 'reviewed' });
    expect(await db.get('SELECT title FROM engagement_workstreams WHERE id = ?', WA)).toEqual({ title: 'Alice workstream' });
    expect(await db.get('SELECT name FROM engagement_stakeholders WHERE id = ?', MA)).toEqual({ name: 'Alice Secret Contact' });
    const bLog = await db.all<{ description: string }>('SELECT description FROM engagement_changelog WHERE engagement_id = ?', EB);
    expect(bLog.map((r) => r.description).join('\n')).not.toContain('Alice Secret');

    // Negative controls: the owner reaches her rows through her engagement, and so does an admin.
    const ownExport = await call(A, 'POST', `/${EA}/export`, { format: 'md', iteration_id: IA });
    expect(ownExport.status).toBe(200);
    expect(await ownExport.text()).toContain('SECRET-A deliverable text');
    expect((await call(A, 'PATCH', `/${EA}/workstreams/${WA}`, { description: 'SECRET-A workstream brief' })).status).toBe(200);
    expect((await call(ADMIN, 'POST', `/${EA}/export`, { format: 'md', iteration_id: IA })).status).toBe(200);
  });

  it('a resource link is http(s) only', async () => {
    const bad = await call(B, 'POST', `/${EB}/resources`, { category: 'regulations', url: 'javascript:alert(document.cookie)' });
    expect(bad.status).toBe(400);
    const good = await call(B, 'POST', `/${EB}/resources`, { category: 'regulations', url: 'https://eur-lex.europa.eu/eli/reg/2024/1624/oj' });
    expect(good.status).toBe(200);
    expect(((await good.json()) as { url: string }).url).toBe('https://eur-lex.europa.eu/eli/reg/2024/1624/oj');
  });

  it('a visitor\'s peer library holds only their own engagements; outside a demo an owner\'s opt-in is shared', async () => {
    await db.run("UPDATE engagements SET status = 'completed', enable_as_benchmark = 1 WHERE id = ?", EA);
    const ids = async (who: Who) => ((await (await call(who, 'GET', '/peer-library')).json()) as Array<{ id: string }>).map((e) => e.id);
    expect(await ids(B)).not.toContain(EA);
    expect((await call(B, 'POST', `/${EB}/peer-benchmarks/from-internal/${EA}`, {})).status).toBe(404);
    // Negative controls: the owner sees it, and outside demo mode the opt-in reaches a colleague.
    expect(await ids(A)).toContain(EA);
    delete process.env.DEMO_MODE;
    expect(await ids(B)).toContain(EA);
    await db.run("UPDATE engagements SET status = 'review', enable_as_benchmark = 0 WHERE id = ?", EA);
  });

  it('a visitor pins only a model the demo offers, never an engine; an admin pins any', async () => {
    let res = await call(B, 'PATCH', `/${EB}`, { exec_model: 'claude-opus-5-5' });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('MODEL_NOT_OFFERED');
    // Even an offered subscription engine: its execution is the agentic runner.
    process.env.DEMO_OFFERED_MODELS = `${DEFAULT},${OFFERED},sdk:claude-opus-5-5`;
    expect((await call(B, 'PATCH', `/${EB}`, { exec_model: 'sdk:claude-opus-5-5' })).status).toBe(403);
    expect((await call(B, 'PATCH', `/${EB}`, { exec_model: OFFERED })).status).toBe(200);
    expect((await call(B, 'PATCH', `/${EB}`, { exec_model: null })).status).toBe(200);
    // Negative control: an administrator.
    res = await call(ADMIN, 'PATCH', `/${EADMIN}`, { exec_model: 'claude-opus-5-5' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { exec_model: string }).exec_model).toBe('claude-opus-5-5');
  });

  it('execute: web search on a model that cannot search is refused with what to change; without it the run goes to the offered model, sends no tools and is charged', async () => {
    expect((await call(B, 'PATCH', `/${EB}`, { exec_model: OFFERED, knowledge_config: { webSearchEnabled: true } })).status).toBe(200);
    const refused = await call(B, 'POST', `/${EB}/execute`, {});
    expect(refused.status).toBe(409);
    const body = await refused.json() as { code: string; error: string };
    expect(body.code).toBe('WEB_SEARCH_UNAVAILABLE');
    expect(body.error).toContain(OFFERED);
    expect(body.error).toMatch(/Switch web search off/);
    expect(seen).toHaveLength(0);

    // Negative control: the same engagement with web search off runs.
    await call(B, 'PATCH', `/${EB}`, { knowledge_config: {} });
    const before = await usage(B.id);
    const run = await call(B, 'POST', `/${EB}/execute`, {});
    expect(run.status).toBe(200);
    const frames = sseFrames(await run.text());
    expect(frames.some((f) => f.type === 'text_delta' && String(f.content).includes('Deliverable by kimi-fake'))).toBe(true);
    expect(frames.some((f) => f.type === 'done')).toBe(true);
    expect(seen.map((s) => s.model)).toEqual(['kimi-fake']);
    expect(seen[0].hasTools).toBe(false);
    expect(await usage(B.id) - before).toBe(150);
    const its = await db.all('SELECT id FROM engagement_iterations WHERE engagement_id = ?', EB);
    expect(its.length).toBe(2);
  });

  it('a visitor over the monthly budget is refused before any model call; within it the call is made and charged', async () => {
    const month = new Date().toISOString().slice(0, 7);
    await db.run('UPDATE users SET monthly_token_budget = 100 WHERE id = ?', B.id);
    await db.run(`INSERT INTO user_monthly_usage (id, user_id, year_month, input_tokens, output_tokens) VALUES (?, ?, ?, 400, 100)
      ON CONFLICT (user_id, year_month) DO UPDATE SET input_tokens = user_monthly_usage.input_tokens + 400, output_tokens = user_monthly_usage.output_tokens + 100`, randomUUID(), B.id, month);
    const over = await call(B, 'POST', `/${EB}/iterations/${IB}/gap-analysis`, { lens: 'scope' });
    expect(over.status).toBe(429);
    expect(((await over.json()) as { code: string }).code).toBe('BUDGET_EXCEEDED');
    expect((await call(B, 'POST', `/${EB}/intake/turn`, { message: 'hello' })).status).toBe(429);
    expect(seen).toHaveLength(0);

    // Negative control: no budget set (unlimited) — the same request runs, on the demo's model, and is charged.
    await db.run('UPDATE users SET monthly_token_budget = 0 WHERE id = ?', B.id);
    const before = await usage(B.id);
    const ok = await call(B, 'POST', `/${EB}/iterations/${IB}/gap-analysis`, { lens: 'scope' });
    expect(ok.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].model).toBe('glm-fake');
    expect(await usage(B.id) - before).toBe(150);
  });

  it('intake: research authorised on a model that cannot search asks instead, tells the model so and tells the person why', async () => {
    await db.run(`INSERT INTO engagement_client_intelligence (id, engagement_id, client_name, online_research_authorised) VALUES (?, ?, 'Acme Bank', 1)`, randomUUID(), EB);
    let res = await call(B, 'POST', `/${EB}/intake/turn`, { message: 'We are a Nordic bank.' });
    expect(res.status).toBe(200);
    let frames = sseFrames(await res.text());
    expect(frames.find((f) => f.type === 'notice')).toMatchObject({ code: 'WEB_SEARCH_UNAVAILABLE' });
    expect(String(frames.find((f) => f.type === 'intake_update')?.notice ?? '')).toMatch(/cannot search the web/);
    expect(seen).toHaveLength(1);
    expect(seen[0].hasTools).toBe(false);
    expect(seen[0].system).toMatch(/You cannot search the web/);
    expect(seen[0].system).not.toMatch(/use the web_search tool/);

    // Negative control: research not authorised — no notice, the ordinary instruction.
    seen.length = 0;
    await db.run('UPDATE engagement_client_intelligence SET online_research_authorised = 0 WHERE engagement_id = ?', EB);
    res = await call(B, 'POST', `/${EB}/intake/turn`, { message: 'Supervised by Finansinspektionen.' });
    frames = sseFrames(await res.text());
    expect(frames.some((f) => f.type === 'notice')).toBe(false);
    expect(seen[0].system).toMatch(/Online research is NOT authorised/);
  });

  it('the server-folder RAG directory is not offered to a visitor; an admin still reaches it', async () => {
    for (const [method, p] of [['POST', `/${EB}/rag-directory`], ['DELETE', `/${EB}/rag-directory`], ['POST', `/${EB}/rag-directory/reindex`]] as const) {
      const res = await call(B, method, p, method === 'POST' ? { folderPath: uploadDir } : undefined);
      expect(res.status, `${method} ${p}`).toBe(404);
    }
    // Negative control: an administrator reaches the handler (which then judges the folder).
    expect((await call(ADMIN, 'POST', `/${EADMIN}/rag-directory`, { folderPath: 'relative/folder' })).status).toBe(400);
    expect((await call(ADMIN, 'DELETE', `/${EADMIN}/rag-directory`)).status).toBe(200);
  });

  it('a visitor\'s JSON write is capped; an admin\'s is not', async () => {
    const huge = 'x'.repeat(300 * 1024);
    const res = await call(B, 'PATCH', `/${EB}`, { engagement_brief: { text: huge } });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { code: string }).code).toBe('DEMO_WRITE_TOO_LARGE');
    expect((await call(ADMIN, 'PATCH', `/${EADMIN}`, { engagement_brief: { text: huge } })).status).toBe(200);
  });

  it('a visitor\'s engagement holds at most 200 scope items, 50 workstreams and 50 team members; an admin\'s has no cap', async () => {
    // Table and column names are this test's literals.
    const fill = async (engagementId: string, table: string, nameColumn: string, n: number) => db.run(
      `INSERT INTO ${table} (id, engagement_id, ${nameColumn})
       SELECT ?::text || g::text, ?, 'Seeded ' || g::text FROM generate_series(1, ?::int) AS g`,
      `cap-${table}-${engagementId}-`, engagementId, n,
    );
    const count = async (engagementId: string, table: string) => Number((await db.get<{ n: number | string }>(`SELECT COUNT(*) AS n FROM ${table} WHERE engagement_id = ?`, engagementId))?.n ?? 0);
    const ECAP = ((await (await call(B, 'POST', '', { title: `Caps ${tag}` })).json()) as { id: string }).id;
    const ECAP_ADMIN = ((await (await call(ADMIN, 'POST', '', { title: `Admin caps ${tag}` })).json()) as { id: string }).id;
    for (const e of [ECAP, ECAP_ADMIN]) {
      await fill(e, 'engagement_scope_items', 'title', 200);
      await fill(e, 'engagement_workstreams', 'title', 49);
      await fill(e, 'engagement_stakeholders', 'name', 50);
    }

    // The 50th workstream is still allowed; the 51st is not.
    expect((await call(B, 'POST', `/${ECAP}/workstreams`, { title: 'Workstream 50' })).status).toBe(200);
    for (const [p, body, table, says] of [
      ['scope-items', { title: 'Scope 201' }, 'engagement_scope_items', /up to 200 scope items/],
      ['workstreams', { title: 'Workstream 51' }, 'engagement_workstreams', /up to 50 workstreams/],
      ['team', { name: 'Contact 51' }, 'engagement_stakeholders', /up to 50 team members/],
    ] as Array<[string, Record<string, string>, string, RegExp]>) {
      const before = await count(ECAP, table);
      const refused = await call(B, 'POST', `/${ECAP}/${p}`, body);
      expect(refused.status, p).toBe(409);
      const answer = await refused.json() as { error: string; code: string };
      expect(answer.error, p).toMatch(says);
      expect(answer.code, p).toBe('DEMO_ROW_LIMIT');
      expect(await count(ECAP, table), p).toBe(before);
    }
    // Deleting a workstream makes room again.
    const [ws] = await db.all<{ id: string }>('SELECT id FROM engagement_workstreams WHERE engagement_id = ? LIMIT 1', ECAP);
    expect((await call(B, 'DELETE', `/${ECAP}/workstreams/${ws.id}`)).status).toBe(200);
    expect((await call(B, 'POST', `/${ECAP}/workstreams`, { title: 'Workstream again' })).status).toBe(200);

    // Negative controls: an administrator at the same counts, and the visitor on a server that is not a demo.
    expect((await call(ADMIN, 'POST', `/${ECAP_ADMIN}/scope-items`, { title: 'Scope 201' })).status).toBe(200);
    expect((await call(ADMIN, 'POST', `/${ECAP_ADMIN}/team`, { name: 'Contact 51' })).status).toBe(200);
    process.env.DEMO_MODE = 'false';
    expect((await call(B, 'POST', `/${ECAP}/team`, { name: 'Contact 51' })).status).toBe(200);
    expect(seen).toHaveLength(0);
  });

  it('uploads count against the demo quota, are recorded for the account, and go with it; an admin is not limited', async () => {
    process.env.DEMO_USER_UPLOAD_FILES = '2';
    const onDisk = () => fs.readdirSync(uploadDir).length;
    const doc = await upload(A, `/${EA}/documents`, 'letter.txt', 1024, { document_type: 'engagement_letter' });
    expect(doc.status).toBe(200);
    const docRow = await doc.json() as { file_path: string };
    // A visitor is told the stored file's name, never the server's path.
    expect(docRow.file_path).toBe(path.basename(docRow.file_path));
    expect(path.isAbsolute(docRow.file_path)).toBe(false);
    const rec = await db.get<{ uploaded_by: string; size_bytes: string | number }>('SELECT uploaded_by, size_bytes FROM file_uploads WHERE id = ?', path.basename(docRow.file_path));
    expect(rec?.uploaded_by).toBe(A.id);
    expect(Number(rec?.size_bytes)).toBe(1024);
    expect((await upload(A, `/${EA}/resources`, 'data.csv', 512, { category: 'data' })).status).toBe(200);
    const filled = onDisk();
    const third = await upload(A, `/${EA}/resources`, 'more.txt', 512, { category: 'documents' });
    expect(third.status).toBe(413);
    expect(((await third.json()) as { code: string }).code).toBe('UPLOAD_QUOTA');
    expect(onDisk()).toBe(filled);

    // A type the extractor cannot read is refused for a visitor, before anything is kept.
    delete process.env.DEMO_USER_UPLOAD_FILES;
    const exe = await upload(B, `/${EB}/resources`, 'tool.exe', 256, { category: 'code' });
    expect(exe.status).toBe(400);
    expect(((await exe.json()) as { code: string }).code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(onDisk()).toBe(filled);

    // Negative control: an administrator keeps any type, unlimited, and on record.
    process.env.DEMO_USER_UPLOAD_FILES = '1';
    const adminDoc = await upload(ADMIN, `/${EADMIN}/resources`, 'tool.exe', 256, { category: 'code' });
    expect(adminDoc.status).toBe(200);
    expect((await upload(ADMIN, `/${EADMIN}/resources`, 'tool2.exe', 256, { category: 'code' })).status).toBe(200);
    const adminPath = ((await adminDoc.json()) as { file_path: string }).file_path;
    expect(path.isAbsolute(adminPath)).toBe(true); // the row as stored
    const adminFile = path.basename(adminPath);
    expect(await db.get('SELECT uploaded_by FROM file_uploads WHERE id = ?', adminFile)).toEqual({ uploaded_by: ADMIN.id });

    // The account deletion (demo-retention.ts) finds the visitor's engagement files by that record.
    const aFiles = (await db.all<{ id: string }>('SELECT id FROM file_uploads WHERE uploaded_by = ?', A.id)).map((r) => r.id);
    expect(aFiles).toHaveLength(2);
    const { deleteDemoAccountNow } = await import('../../server/services/demo-retention.js');
    const result = await deleteDemoAccountNow(db, A.id, { uploadDir });
    expect(result.deleted).toBe(1);
    for (const f of aFiles) expect(fs.existsSync(path.join(uploadDir, f))).toBe(false);
    expect(await db.get('SELECT id FROM engagements WHERE id = ?', EA)).toBeUndefined();
    expect(await db.get('SELECT id FROM engagement_iterations WHERE id = ?', IA)).toBeUndefined();
    // Negative controls: the admin's file and the other visitor's engagement stay.
    expect(fs.existsSync(path.join(uploadDir, adminFile))).toBe(true);
    expect(await db.get('SELECT id FROM engagements WHERE id = ?', EB)).toEqual({ id: EB });
  });
});
