/**
 * demo-work-run-privacy.db.test.ts — what a Work run keeps about a visitor on
 * the public demo (privacy review G4: F1, F3, answer embeddings; M9).
 *
 *   - F1: the automatic copy of an answer (versions) was written with no
 *     owner, so the account's deletion never reached it. It now carries the
 *     caller's id — in every mode.
 *   - F3: a visitor's edited module prompt became a system_prompts row with
 *     no owner, which nothing deleted. On the demo a visitor's edit gets no
 *     row; the module's own prompt, sent unedited, is versioned as 'system'.
 *   - The answer is not embedded on the demo (nothing a visitor can open
 *     searches the embeddings).
 *   - No apprentice profile on the demo (/apprentice is closed to visitors).
 *
 * Negative controls: outside the demo each of these still happens, and an
 * administrator's edited prompt on the demo is still versioned.
 *
 * Drives the real Work route on the test database, the model a fake
 * OpenAI-compatible server. The embedder is replaced by a spy: the real one
 * needs an embedding model, and the question is only whether it is called.
 *
 * The demo runs use a module the demo offers, with the hidden lists that
 * .env.demo.example recommends in force (DEMO_HIDDEN_AREAS /
 * DEMO_HIDDEN_MODULES): a hidden module would be refused before any of this
 * happens (the file once used alert-investigation, which is on that list).
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http, { type Server } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-demo-work-run-privacy';
});

const embedSpy = vi.hoisted(() => ({ calls: [] as Array<{ sessionId: string }> }));
vi.mock('../../server/services/session-output-embedder.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/services/session-output-embedder.js')>()),
  embedSessionOutput: async (_db: unknown, input: { sessionId: string }) => {
    embedSpy.calls.push({ sessionId: input.sessionId });
    return true;
  },
}));

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);
const SLUG = `tpriv${tag}`;
const MODEL = `compat:${SLUG}:fake-model`;
/** A module the demo offers (strategy is not a hidden area; the module is not on the hidden list). */
const MODULE = 'competitive-analysis';
const AREA = 'strategy';
/** On the recommended hidden list: the refusal control below runs it. */
const HIDDEN_MODULE = 'alert-investigation';
const LONG_ANSWER = `Answer ${tag}. ` + 'The three competitors differ mainly in price, reach and service levels. '.repeat(10);

/** The hidden lists .env.demo.example recommends, as the demo would set them. */
function recommendedHiddenLists(): { areas: string; modules: string } {
  const text = readFileSync(join(process.cwd(), '.env.demo.example'), 'utf8');
  const value = (key: string): string => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
  return { areas: value('DEMO_HIDDEN_AREAS'), modules: value('DEMO_HIDDEN_MODULES') };
}
const HIDDEN = recommendedHiddenLists();

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

const sha256 = (s: string): string => createHash('sha256').update(s.trim(), 'utf8').digest('hex');

d('a Work run on the public demo keeps nothing a visitor cannot delete', () => {
  let db: DatabaseAdapter;
  let fake: Awaited<ReturnType<typeof startFake>>;
  let app: Server;
  let base = '';
  let modulePrompt = '';
  const sessions: string[] = [];
  const users = { visitor: randomUUID(), plain: randomUUID(), admin: randomUUID() };
  const saved = {
    demo: process.env.DEMO_MODE, offered: process.env.DEMO_OFFERED_MODELS, post: process.env.DEMO_POST_ANSWER_CALLS, mode: process.env.DEPLOYMENT_MODE,
    hiddenAreas: process.env.DEMO_HIDDEN_AREAS, hiddenModules: process.env.DEMO_HIDDEN_MODULES,
  };
  /** The demo as .env.demo.example sets it up: this model offered, the recommended modules hidden. */
  const enterDemo = (): void => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_OFFERED_MODELS = MODEL;
    process.env.DEMO_HIDDEN_AREAS = HIDDEN.areas;
    process.env.DEMO_HIDDEN_MODULES = HIDDEN.modules;
  };
  let setDefault: (db: DatabaseAdapter, model: string | null) => Promise<unknown>;

  beforeAll(async () => {
    delete process.env.DEPLOYMENT_MODE;
    // Nothing after the answer calls the model: the test reads only local rows.
    process.env.DEMO_POST_ANSWER_CALLS = 'none';
    fake = await startFake();
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    await db.run(
      `INSERT INTO custom_model_endpoints (slug, display_name, base_url, default_model, enabled) VALUES (?, 'Fake', ?, 'fake-model', TRUE)`,
      SLUG, fake.baseUrl,
    );
    for (const [kind, id] of Object.entries(users)) {
      await db.run(`INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'x', ?)`, id, `wpriv_${kind}_${tag}`, kind === 'admin' ? 'admin' : 'analyst');
    }
    const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
    setRouterDb(db);
    const store = await import('../../server/services/default-model-store.js');
    setDefault = store.setPersistedDefaultModel as typeof setDefault;
    await setDefault(db, MODEL);
    const { getModuleSystemPrompt } = await import('../../server/services/module-loader.js');
    modulePrompt = (await getModuleSystemPrompt(MODULE)) ?? '';
    const { createClaudeRoutes } = await import('../../server/routes/claude.js');
    const e = express();
    e.use(express.json());
    e.use((req: Request, _res: Response, next: NextFunction) => {
      const id = String(req.headers['x-test-user'] ?? '');
      const role = String(req.headers['x-test-role'] ?? 'analyst') === 'admin' ? 'admin' : 'analyst';
      req.user = { id, username: id, role };
      next();
    });
    e.use('/api', await createClaudeRoutes(db));
    await new Promise<void>((resolve) => { app = e.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const [k, v] of [
      ['DEMO_MODE', saved.demo], ['DEMO_OFFERED_MODELS', saved.offered],
      ['DEMO_HIDDEN_AREAS', saved.hiddenAreas], ['DEMO_HIDDEN_MODULES', saved.hiddenModules],
    ] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  afterAll(async () => {
    for (const [k, v] of [['DEMO_POST_ANSWER_CALLS', saved.post], ['DEPLOYMENT_MODE', saved.mode]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
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
      await db.run("DELETE FROM system_prompts WHERE module_id = ? AND content LIKE ?", MODULE, `%EDIT-${tag}%`).catch(() => {});
      for (const id of Object.values(users)) {
        await db.run('DELETE FROM apprentice_profiles WHERE user_id = ?', id).catch(() => {});
        await db.run('DELETE FROM audit_log WHERE user_id = ?', id).catch(() => {});
        await db.run('DELETE FROM user_monthly_usage WHERE user_id = ?', id).catch(() => {});
        await db.run('DELETE FROM llm_spend_ledger WHERE user_id = ?', id).catch(() => {});
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

  /** A module run request in a fresh session of `moduleId`; returns the session id and the response. */
  async function post(userId: string, role: string, systemPrompt: string, moduleId: string, areaId: string): Promise<{ sessionId: string; res: globalThis.Response }> {
    const sessionId = randomUUID();
    sessions.push(sessionId);
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, ?, 'privacy', '{}', ?)`, sessionId, moduleId, userId);
    const res = await fetch(`${base}/api/claude/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': userId, 'x-test-role': role },
      body: JSON.stringify({ userMessage: 'Compare these three competitors.', model: MODEL, sessionId, moduleId, areaId, thinking: 'quick', systemPrompt }),
      signal: AbortSignal.timeout(20_000),
    });
    return { sessionId, res };
  }

  /** One module run in a fresh session; resolves once the answer's copy is written (onComplete finished). */
  async function run(userId: string, role: string, systemPrompt: string): Promise<string> {
    const { sessionId, res } = await post(userId, role, systemPrompt, MODULE, AREA);
    expect(res.status).toBe(200);
    await res.text();
    for (let i = 0; i < 40; i++) {
      if (await db.get('SELECT id FROM versions WHERE entity_type = ? AND entity_id = ?', 'session', sessionId)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    // The apprentice upsert and the embedder call follow the copy in the same callback.
    await new Promise((r) => setTimeout(r, 500));
    return sessionId;
  }

  const promptRows = async (text: string) =>
    await db.all<{ author: string }>('SELECT author FROM system_prompts WHERE module_id = ? AND content_hash = ?', MODULE, sha256(text));
  const apprenticeRows = async (userId: string) =>
    Number((await db.get<{ n: string | number }>('SELECT COUNT(*) AS n FROM apprentice_profiles WHERE user_id = ? AND module_id = ?', userId, MODULE))?.n ?? 0);
  const configOf = async (sessionId: string) =>
    JSON.parse((await db.get<{ config: string }>('SELECT config FROM sessions WHERE id = ?', sessionId))?.config ?? '{}') as { modulePromptVersionId?: string | null; modulePromptSha256?: string | null };

  it('the module these runs use is one the recommended hidden lists leave on the demo', async () => {
    // Guards the setup: with empty lists every module is offered and the
    // refusal below would prove nothing.
    expect(HIDDEN.modules.split(',').map((s) => s.trim())).toContain(HIDDEN_MODULE);
    const { demoModuleHidden } = await import('../../server/middleware/demo-mode.js');
    const { resolveModuleAreaId } = await import('../../server/routes/module-access.js');
    const env = { DEMO_MODE: 'true', DEMO_HIDDEN_AREAS: HIDDEN.areas, DEMO_HIDDEN_MODULES: HIDDEN.modules };
    expect(await resolveModuleAreaId(db, MODULE)).toBe(AREA);
    expect(demoModuleHidden(MODULE, AREA, env)).toBe(false);
    expect(demoModuleHidden(HIDDEN_MODULE, 'fcp', env)).toBe(true);
  });

  it('negative control: with those lists set, a visitor\'s run of a hidden module is refused before anything is sent', async () => {
    enterDemo();
    const before = await db.get<{ n: string | number }>('SELECT COUNT(*) AS n FROM llm_spend_ledger WHERE model = ?', MODEL);
    const { sessionId, res } = await post(users.visitor, 'analyst', `EDIT-${tag}-hidden: be brief.`, HIDDEN_MODULE, 'fcp');
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe('MODULE_NOT_OFFERED');
    expect(await db.get('SELECT id FROM messages WHERE session_id = ?', sessionId)).toBeUndefined();
    const after = await db.get<{ n: string | number }>('SELECT COUNT(*) AS n FROM llm_spend_ledger WHERE model = ?', MODEL);
    expect(Number(after?.n ?? 0)).toBe(Number(before?.n ?? 0));
  }, 40_000);

  it('on the demo: the copy is the visitor\'s, the edited prompt gets no row, no embedding, no apprentice profile', async () => {
    enterDemo();
    embedSpy.calls.length = 0;
    const edited = `EDIT-${tag}-demo: answer only in haiku.`;
    const sessionId = await run(users.visitor, 'analyst', edited);

    const copy = await db.get<{ user_id: string | null }>('SELECT user_id FROM versions WHERE entity_type = ? AND entity_id = ?', 'session', sessionId);
    expect.soft(copy).toEqual({ user_id: users.visitor });
    expect.soft(await promptRows(edited)).toEqual([]);
    const config = await configOf(sessionId);
    expect.soft(config.modulePromptVersionId).toBeNull();
    // What was run is still on record, in the session the account owns.
    expect.soft(config.modulePromptSha256).toBe(sha256(edited));
    expect.soft(embedSpy.calls.filter((c) => c.sessionId === sessionId)).toEqual([]);
    expect.soft(await apprenticeRows(users.visitor)).toBe(0);
  }, 40_000);

  it('on the demo: the module\'s own prompt, sent unedited, is versioned as the system text', async () => {
    expect(modulePrompt.length).toBeGreaterThan(0);
    enterDemo();
    const sessionId = await run(users.visitor, 'analyst', modulePrompt);
    const config = await configOf(sessionId);
    expect(config.modulePromptVersionId).toBeTruthy();
    const row = await db.get<{ content_hash: string }>('SELECT content_hash FROM system_prompts WHERE id = ?', config.modulePromptVersionId);
    expect(row?.content_hash).toBe(sha256(modulePrompt));
  }, 40_000);

  it('negative control: an administrator\'s edited prompt on the demo is versioned', async () => {
    enterDemo();
    const edited = `EDIT-${tag}-admin: be brief.`;
    await run(users.admin, 'admin', edited);
    expect((await promptRows(edited)).map((r) => r.author)).toEqual(['user-override']);
  }, 40_000);

  it('negative control: outside the demo the copy is owned too, and the edit, the embedding and the apprentice profile happen as before', async () => {
    delete process.env.DEMO_MODE;
    embedSpy.calls.length = 0;
    const edited = `EDIT-${tag}-plain: use tables.`;
    const sessionId = await run(users.plain, 'analyst', edited);

    const copy = await db.get<{ user_id: string | null }>('SELECT user_id FROM versions WHERE entity_type = ? AND entity_id = ?', 'session', sessionId);
    expect.soft(copy).toEqual({ user_id: users.plain });
    expect.soft((await promptRows(edited)).map((r) => r.author)).toEqual(['user-override']);
    expect.soft((await configOf(sessionId)).modulePromptVersionId).toBeTruthy();
    expect.soft(embedSpy.calls.filter((c) => c.sessionId === sessionId)).toHaveLength(1);
    expect.soft(await apprenticeRows(users.plain)).toBe(1);
  }, 40_000);
});
