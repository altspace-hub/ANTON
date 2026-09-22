/**
 * rerun-replay.test.ts — POST /api/rerun mode 'replay' (Wave 5 track B):
 * verbatim replay against the served model, with hash equality reported.
 *
 * No live database: a fake adapter holds sessions / messages / run_artifacts
 * in memory and answers the route's queries by SQL shape, recording every
 * write. The provider router is mocked at the route's seam (callChat), so the
 * assertions read exactly what the model would have received — the stored
 * prompt as `system`, byte-for-byte, and the rebuilt history in order.
 *
 * The recompose path (mode omitted) still dispatches into the claude router;
 * a fake router stands in for it here, as tests/routes/rerun.test.ts does.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHash, randomUUID } from 'crypto';
import express, { Router } from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const callChatMock = vi.fn();

vi.mock('../../server/services/provider-router.js', () => ({
  callChat: (...args: unknown[]) => callChatMock(...args),
  streamChat: vi.fn(),
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/model-adapter.js', () => ({
  getProviderFromModelId: (id: string) => {
    if (id.startsWith('sdk:')) return 'anthropic_sdk';
    if (id.startsWith('claude-')) return 'anthropic';
    if (id.startsWith('mistral-')) return 'mistral';
    if (id.startsWith('ollama:')) return 'ollama';
    throw new Error(`Cannot determine provider for model: ${id}`);
  },
}));
vi.mock('../../server/services/sdk-engine-store.js', () => ({ isSdkEngineEnabled: () => true }));

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

// ── Fake database ─────────────────────────────────────────────────────────────

interface Msg {
  id: string; session_id: string; role: string; content: string; thinking_content: string | null;
  token_count: number | null; cost: number | null; model_id: string | null; config_snapshot: string | null;
  rerun_of: string | null; created_at: string;
}
interface Artifact extends Record<string, unknown> {
  id: string; message_id: string; session_id: string | null; composed_prompt: string | null; prompt_sha256: string;
  prompt_chars: number; truncated: boolean; layer_summary: string; source_manifest: string; created_at: string;
}
interface Store {
  sessions: Array<{ id: string; module_id: string; config: string | null }>;
  messages: Msg[];
  artifacts: Artifact[];
  writes: Array<{ sql: string; params: unknown[] }>;
}

const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();

function createFakeDb(store: Store): DatabaseAdapter {
  const byCreated = (a: Msg, b: Msg) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
  const db: DatabaseAdapter = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...p: unknown[]): Promise<T | undefined> {
      const s = norm(sql);
      if (s.includes('FROM sessions WHERE id = ?')) {
        return store.sessions.find((x) => x.id === p[0]) as T | undefined;
      }
      if (s.includes("FROM messages WHERE id = ? AND session_id = ? AND role = 'assistant'")) {
        return store.messages.find((m) => m.id === p[0] && m.session_id === p[1] && m.role === 'assistant') as T | undefined;
      }
      if (s.includes("role = 'assistant' AND rerun_of IS NULL ORDER BY created_at DESC")) {
        return [...store.messages].filter((m) => m.session_id === p[0] && m.role === 'assistant' && m.rerun_of === null).sort(byCreated).pop() as T | undefined;
      }
      if (s.includes("role = 'assistant' AND created_at > ? AND id <> ? AND rerun_of IS NULL")) {
        return [...store.messages].filter((m) => m.session_id === p[0] && m.role === 'assistant' && m.created_at > String(p[1]) && m.id !== p[2] && m.rerun_of === null).sort(byCreated).pop() as T | undefined;
      }
      if (s.includes("role = 'user' AND created_at <= ?")) {
        return [...store.messages].filter((m) => m.session_id === p[0] && m.role === 'user' && m.created_at <= String(p[1])).sort(byCreated).pop() as T | undefined;
      }
      if (s.includes('FROM run_artifacts WHERE message_id = ?')) {
        return store.artifacts.find((a) => a.message_id === p[0]) as T | undefined;
      }
      if (s.includes('FROM app_settings')) return undefined;
      throw new Error(`fake db.get: unhandled SQL: ${s}`);
    },
    async all<T>(sql: string, ...p: unknown[]): Promise<T[]> {
      const s = norm(sql);
      if (s.includes('created_at <= ? AND id <> ? AND rerun_of IS NULL ORDER BY created_at ASC')) {
        return [...store.messages].filter((m) => m.session_id === p[0] && m.created_at <= String(p[1]) && m.id !== p[2] && m.rerun_of === null).sort(byCreated) as T[];
      }
      if (s.includes('created_at < ? AND rerun_of IS NULL AND id <> ? ORDER BY created_at ASC')) {
        return [...store.messages].filter((m) => m.session_id === p[0] && m.created_at < String(p[1]) && m.rerun_of === null && m.id !== p[2]).sort(byCreated) as T[];
      }
      throw new Error(`fake db.all: unhandled SQL: ${s}`);
    },
    async run(sql: string, ...p: unknown[]): Promise<RunResult> {
      const s = norm(sql);
      store.writes.push({ sql: s, params: p });
      if (s.startsWith('INSERT INTO messages (id, session_id, role, content, thinking_content, token_count, cost, model_id, config_snapshot, rerun_of, created_at)')) {
        store.messages.push({
          id: String(p[0]), session_id: String(p[1]), role: 'assistant', content: String(p[2]),
          thinking_content: p[3] as string | null, token_count: p[4] as number | null, cost: p[5] as number | null,
          model_id: p[6] as string | null, config_snapshot: p[7] as string | null, rerun_of: p[8] as string | null, created_at: String(p[9]),
        });
        return { changes: 1, lastInsertRowid: 0 };
      }
      if (s.startsWith('INSERT INTO run_artifacts')) {
        if (store.artifacts.some((a) => a.message_id === p[1])) return { changes: 0, lastInsertRowid: 0 };
        store.artifacts.push({
          id: String(p[0]), message_id: String(p[1]), session_id: p[2] as string | null, composed_prompt: p[3] as string,
          prompt_sha256: String(p[4]), prompt_chars: Number(p[5]), truncated: Boolean(p[6]), layer_summary: String(p[7]),
          source_manifest: String(p[8]), created_at: String(p[9]),
        });
        return { changes: 1, lastInsertRowid: 0 };
      }
      if (s.startsWith("UPDATE run_artifacts SET rerun_of = ?, rerun_mode = 'replay'")) {
        const a = store.artifacts.find((x) => x.message_id === p[p.length - 1]);
        if (a) {
          Object.assign(a, {
            rerun_of: p[0], rerun_mode: 'replay', model_requested: p[1], model_served: p[2], output_sha256: p[3],
            user_message_sha256: p[4], history_sha256: p[5], request_params: p[6], engine: p[7], usage: p[8],
            cost_usd: p[9], cost_basis: p[10], status: 'completed',
          });
        }
        return { changes: a ? 1 : 0, lastInsertRowid: 0 };
      }
      if (s.startsWith("UPDATE run_artifacts SET rerun_of = ?, rerun_mode = 'recompose'")) {
        const a = store.artifacts.find((x) => x.message_id === p[2]);
        if (a) Object.assign(a, { rerun_of: p[0], rerun_mode: 'recompose', output_sha256: a.output_sha256 ?? p[1] });
        return { changes: a ? 1 : 0, lastInsertRowid: 0 };
      }
      if (s.startsWith('UPDATE messages SET rerun_of = ? WHERE id = ?')) {
        const m = store.messages.find((x) => x.id === p[1]);
        if (m) m.rerun_of = String(p[0]);
        return { changes: m ? 1 : 0, lastInsertRowid: 0 };
      }
      if (s.startsWith('DELETE FROM messages WHERE id IN')) {
        const victim = [...store.messages].filter((m) => m.session_id === p[0] && m.role === 'user' && m.created_at > String(p[1]) && m.content === p[2] && m.id !== p[3]).sort(byCreated).pop();
        if (victim) store.messages.splice(store.messages.indexOf(victim), 1);
        return { changes: victim ? 1 : 0, lastInsertRowid: 0 };
      }
      throw new Error(`fake db.run: unhandled SQL: ${s}`);
    },
    async exec() { /* unused */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* unused */ },
  };
  return db;
}

// ── Fixture ───────────────────────────────────────────────────────────────────

const t = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
const COMPOSED_PROMPT = '# ANTON\n\nYou are the AMLR expert.\n\n## Sources\n- policy.md (sha bbb222)\n\nÅngström — bytes matter ✓';
const ORIGINAL_OUTPUT = 'ORIGINAL OUTPUT from claude-opus-4-8';

const snapshot = {
  model: 'claude-opus-4-8',
  thinking: 'investigate',
  effort: 'xhigh',
  engine: 'anthropic',
  modelServed: 'claude-opus-4-8',
  creativity: 'balanced',
  selectedOutputFormats: ['executive-summary'],
  knowledgeSources: { modes: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } },
  contextUsed: { model: 'claude-opus-4-8', engine: 'anthropic', modelServed: 'claude-opus-4-8', webSearch: false },
};

interface Seeded { sessionId: string; user1: string; assistant1: string; user2: string; original: string; siblingRerun: string; user3: string; assistant3: string }

function seed(store: Store, opts: {
  artifact?: Partial<Artifact> | null;
  manifest?: unknown[];
  originalModelId?: string;
  originalSnapshot?: Record<string, unknown> | null;
} = {}): Seeded {
  const ids: Seeded = {
    sessionId: randomUUID(), user1: randomUUID(), assistant1: randomUUID(), user2: randomUUID(),
    original: randomUUID(), siblingRerun: randomUUID(), user3: randomUUID(), assistant3: randomUUID(),
  };
  const msg = (id: string, role: 'user' | 'assistant', content: string, createdAt: string, extra: Partial<Msg> = {}): Msg => ({
    id, session_id: ids.sessionId, role, content, thinking_content: null, token_count: null, cost: null,
    model_id: null, config_snapshot: null, rerun_of: null, created_at: createdAt, ...extra,
  });
  store.sessions.push({ id: ids.sessionId, module_id: 'gap-analysis', config: JSON.stringify({ moduleInputs: { scope: 'EU' } }) });
  store.messages.push(
    msg(ids.user1, 'user', 'First question', t(90_000)),
    msg(ids.assistant1, 'assistant', 'First answer', t(80_000), { model_id: 'claude-opus-4-8' }),
    msg(ids.user2, 'user', 'Assess our AMLR Article 16 readiness please.', t(70_000)),
    msg(ids.original, 'assistant', ORIGINAL_OUTPUT, t(60_000), {
      model_id: opts.originalModelId ?? 'claude-opus-4-8',
      token_count: 1234, cost: 0.42,
      config_snapshot: opts.originalSnapshot === null ? null : JSON.stringify(opts.originalSnapshot ?? snapshot),
    }),
    // A sibling "Rerun with…" answer persisted later — must never enter the replay history.
    msg(ids.siblingRerun, 'assistant', 'SIBLING RERUN', t(50_000), { model_id: 'mistral-large-latest', rerun_of: ids.original }),
    // A later turn — after the original, so not part of what produced it.
    msg(ids.user3, 'user', 'Follow-up question', t(40_000)),
    msg(ids.assistant3, 'assistant', 'Follow-up answer', t(30_000), { model_id: 'claude-opus-4-8' }),
  );
  if (opts.artifact !== null) {
    store.artifacts.push({
      id: randomUUID(), message_id: ids.original, session_id: ids.sessionId,
      composed_prompt: COMPOSED_PROMPT, prompt_sha256: sha(COMPOSED_PROMPT), prompt_chars: COMPOSED_PROMPT.length,
      truncated: false, layer_summary: JSON.stringify([{ layer: 'composed_full', chars: COMPOSED_PROMPT.length, sha256: sha(COMPOSED_PROMPT) }]),
      source_manifest: JSON.stringify(opts.manifest ?? [{ type: 'local_file', name: 'policy.md', sha256: 'bbb222', charCount: 500, contentHashed: true }]),
      created_at: t(60_000),
      model_requested: 'claude-opus-4-8', model_served: 'claude-opus-4-8', engine: 'anthropic',
      output_sha256: sha(ORIGINAL_OUTPUT),
      ...(opts.artifact ?? {}),
    });
  }
  return ids;
}

// ── Harness ───────────────────────────────────────────────────────────────────

const store: Store = { sessions: [], messages: [], artifacts: [], writes: [] };
const dispatched: Array<Record<string, unknown>> = [];
let server: Server;
let base: string;

/** Stand-in for the claude router the recompose path dispatches into. */
function createFakeClaudeRouter(): Router {
  const router = Router();
  router.post('/claude/message', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    dispatched.push(body);
    const now = new Date().toISOString();
    store.messages.push({
      id: randomUUID(), session_id: String(body.sessionId), role: 'user', content: String(body.userMessage), thinking_content: null,
      token_count: null, cost: null, model_id: null, config_snapshot: null, rerun_of: null, created_at: now,
    });
    const assistantId = randomUUID();
    store.messages.push({
      id: assistantId, session_id: String(body.sessionId), role: 'assistant', content: `RECOMPOSED by ${String(body.model)}`, thinking_content: null,
      token_count: 321, cost: 0.0123, model_id: String(body.model), config_snapshot: JSON.stringify({ ...snapshot, model: body.model, modelServed: null, contextUsed: { modelServed: null } }),
      rerun_of: null, created_at: new Date(Date.now() + 1).toISOString(),
    });
    store.artifacts.push({
      id: randomUUID(), message_id: assistantId, session_id: String(body.sessionId), composed_prompt: 'RECOMPOSED PROMPT',
      prompt_sha256: sha('RECOMPOSED PROMPT'), prompt_chars: 17, truncated: false, layer_summary: '[]',
      source_manifest: JSON.stringify([{ type: 'local_file', name: 'policy.md', sha256: 'bbb999', charCount: 600, contentHashed: true }]),
      created_at: now,
    });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ type: 'stream_start', messageId: assistantId })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'stream_end' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
  return router;
}

async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`${base}/api/rerun`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}

const savedEnv = { key: process.env.ANTHROPIC_API_KEY, mode: process.env.DEPLOYMENT_MODE };

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key-for-preflight';
  delete process.env.DEPLOYMENT_MODE;
  const { createRerunRoutes } = await import('../../server/routes/rerun.js');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string; username: string; role: string } }).user = { id: 'solo', username: 'solo', role: 'admin' };
    next();
  });
  app.use('/api', createRerunRoutes(createFakeDb(store), createFakeClaudeRouter()));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('No server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (savedEnv.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedEnv.key;
  if (savedEnv.mode !== undefined) process.env.DEPLOYMENT_MODE = savedEnv.mode;
  await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  store.sessions.length = 0; store.messages.length = 0; store.artifacts.length = 0; store.writes.length = 0;
  dispatched.length = 0;
  callChatMock.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/rerun mode=replay — refusals persist nothing', () => {
  it('404s when the message has no run record', async () => {
    const ids = seed(store, { artifact: null });
    const { status, json } = await post({ sessionId: ids.sessionId, messageId: ids.original, mode: 'replay' });
    expect(status).toBe(404);
    expect(String(json.error)).toMatch(/run record/i);
    expect(callChatMock).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
  });

  it('409s "Prompt too large to replay verbatim" when the stored prompt was truncated', async () => {
    const ids = seed(store, { artifact: { truncated: true } });
    const { status, json } = await post({ sessionId: ids.sessionId, messageId: ids.original, mode: 'replay' });
    expect(status).toBe(409);
    expect(json.error).toBe('Prompt too large to replay verbatim');
    expect(callChatMock).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
  });

  it('409s and persists nothing when the engine refuses the model', async () => {
    const ids = seed(store);
    const before = { messages: store.messages.length, artifacts: store.artifacts.length };
    callChatMock.mockRejectedValueOnce(new Error('404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-opus-4-8"}}'));
    const { status, json } = await post({ sessionId: ids.sessionId, messageId: ids.original, mode: 'replay' });
    expect(status).toBe(409);
    expect(json.error).toBe('Model claude-opus-4-8 is no longer served; replay fails closed. Use recompose.');
    expect(callChatMock).toHaveBeenCalledTimes(1);
    expect(store.messages.length).toBe(before.messages);
    expect(store.artifacts.length).toBe(before.artifacts);
    expect(store.writes).toEqual([]);
  });

  it('409s before any call when newModelId is not a model this instance can dispatch', async () => {
    const ids = seed(store);
    const { status, json } = await post({ sessionId: ids.sessionId, messageId: ids.original, mode: 'replay', newModelId: 'gpt-99-retired' });
    expect(status).toBe(409);
    expect(json.error).toBe('Model gpt-99-retired is no longer served; replay fails closed. Use recompose.');
    expect(callChatMock).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
  });

  it('502s (not 409) on a non-model failure, still persisting nothing', async () => {
    const ids = seed(store);
    callChatMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    const { status, json } = await post({ sessionId: ids.sessionId, messageId: ids.original, mode: 'replay' });
    expect(status).toBe(502);
    expect(String(json.error)).toMatch(/Replay failed: ECONNRESET/);
    expect(store.writes).toEqual([]);
  });

  it('400s on an unknown mode; recompose still requires newModelId; replay does not', async () => {
    const ids = seed(store);
    expect((await post({ sessionId: ids.sessionId, mode: 'bogus' })).status).toBe(400);
    const recompose = await post({ sessionId: ids.sessionId, messageId: ids.original });
    expect(recompose.status).toBe(400);
    expect(String(recompose.json.error)).toMatch(/newModelId is required/);
    expect(callChatMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/rerun mode=replay — happy path', () => {
  it('sends the stored prompt byte-for-byte, the history in order, no tools, and persists message + artifact with hashes', async () => {
    const ids = seed(store);
    callChatMock.mockResolvedValueOnce({ text: 'REPLAYED OUTPUT', thinking: 'thought', inputTokens: 1000, outputTokens: 50 });

    const { status, json } = await post({ sessionId: ids.sessionId, messageId: ids.original, mode: 'replay' });
    expect(status).toBe(200);

    // ── What the model received
    expect(callChatMock).toHaveBeenCalledTimes(1);
    const config = callChatMock.mock.calls[0][0] as Record<string, unknown>;
    expect(config.system).toBe(COMPOSED_PROMPT);
    expect(Buffer.from(config.system as string, 'utf8').equals(Buffer.from(COMPOSED_PROMPT, 'utf8'))).toBe(true);
    expect(config.messages).toEqual([
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Assess our AMLR Article 16 readiness please.' },
    ]);
    expect(config.model).toBe('claude-opus-4-8');            // the served id
    expect(config.thinkingLevel).toBe('investigate');         // from the snapshot
    expect('tools' in config).toBe(false);                    // none recorded → none granted

    // ── Response contract
    expect(json.mode).toBe('replay');
    expect(json.originalMessageId).toBe(ids.original);
    expect(typeof json.rerunMessageId).toBe('string');
    expect(json.model).toEqual({ requested: 'claude-opus-4-8', served: 'claude-opus-4-8', equalsOriginal: true });
    expect(json.prompt).toEqual({ sha256: sha(COMPOSED_PROMPT), equalsOriginal: true });
    expect(json.output).toEqual({
      sha256: sha('REPLAYED OUTPUT'), originalSha256: sha(ORIGINAL_OUTPUT), equalsOriginal: false,
      chars: 'REPLAYED OUTPUT'.length, originalChars: ORIGINAL_OUTPUT.length,
    });
    expect(json.usage).toEqual({ inputTokens: 1000, outputTokens: 50 });
    const { REPLAY_NOTE } = await import('../../server/routes/rerun.js');
    expect(json.note).toBe(REPLAY_NOTE);                      // nothing to add on a clean replay
    expect(String(json.note)).toMatch(/sampling can differ even with identical inputs/i);
    expect((json.rerun as Record<string, unknown>).rerunOf).toBe(ids.original);
    expect((json.rerun as Record<string, unknown>).content).toBe('REPLAYED OUTPUT');
    expect((json.original as Record<string, unknown>).messageId).toBe(ids.original);
    expect(json.sourceDriftAvailable).toBe(false);

    // ── Persisted message
    const rerunId = String(json.rerunMessageId);
    const row = store.messages.find((m) => m.id === rerunId);
    expect(row).toBeDefined();
    expect(row!.role).toBe('assistant');
    expect(row!.rerun_of).toBe(ids.original);
    expect(row!.model_id).toBe('claude-opus-4-8');
    expect(row!.thinking_content).toBe('thought');
    expect(row!.token_count).toBe(50);
    expect(typeof row!.cost).toBe('number');                  // claude-opus-4-8 has list pricing
    expect(row!.cost).toBeGreaterThan(0);
    const snap = JSON.parse(row!.config_snapshot!) as Record<string, unknown>;
    expect(snap.rerun).toEqual({ mode: 'replay', of: ids.original, modelRequested: 'claude-opus-4-8', modelServed: 'claude-opus-4-8' });
    expect(snap.thinking).toBe('investigate');                // the original snapshot travels
    expect(snap.selectedOutputFormats).toEqual(['executive-summary']);

    // ── Persisted run record (writeRunArtifact + the v2 UPDATE)
    const art = store.artifacts.find((a) => a.message_id === rerunId);
    expect(art).toBeDefined();
    expect(art!.composed_prompt).toBe(COMPOSED_PROMPT);
    expect(art!.prompt_sha256).toBe(sha(COMPOSED_PROMPT));
    expect(art!.rerun_mode).toBe('replay');
    expect(art!.rerun_of).toBe(ids.original);
    expect(art!.model_requested).toBe('claude-opus-4-8');
    expect(art!.model_served).toBe('claude-opus-4-8');
    expect(art!.output_sha256).toBe(sha('REPLAYED OUTPUT'));
    expect(art!.user_message_sha256).toBe(sha('Assess our AMLR Article 16 readiness please.'));
    expect(art!.history_sha256).toBe(sha(JSON.stringify([
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
    ])));
    expect(art!.engine).toBe('anthropic');
    expect(art!.status).toBe('completed');
    expect(art!.cost_basis).toBe('list');
    expect(JSON.parse(String(art!.usage))).toEqual({ inputTokens: 1000, outputTokens: 50 });
    const params = JSON.parse(String(art!.request_params)) as Record<string, unknown>;
    expect(params.mode).toBe('replay');
    expect(params.tools).toEqual([]);
    expect(params.thinkingLevel).toBe('investigate');
    expect(params.effort).toBe('xhigh');                      // the ladder on the dispatched model…
    expect(params.originalEffort).toBe('xhigh');              // …matches what the original recorded
    expect(params.thinkingParamsResolved).toBe(true);
    expect(params.servedSnapshot).toBeNull();
    // The original's pinned sources travel with the replay (same prompt → same sources).
    expect(JSON.parse(art!.source_manifest)).toEqual([{ type: 'local_file', name: 'policy.md', sha256: 'bbb222', charCount: 500, contentHashed: true }]);

    // The UPDATE hit the replay's row and named its mode + parent.
    const update = store.writes.find((w) => w.sql.startsWith("UPDATE run_artifacts SET rerun_of = ?, rerun_mode = 'replay'"));
    expect(update).toBeDefined();
    expect(update!.params[0]).toBe(ids.original);
    expect(update!.params[update!.params.length - 1]).toBe(rerunId);
    expect(update!.sql).toMatch(/status = 'completed', finished_at = NOW\(\) WHERE message_id = \?/);
  });

  it('reports output equality when the model returns the identical text', async () => {
    const ids = seed(store);
    callChatMock.mockResolvedValueOnce({ text: ORIGINAL_OUTPUT, thinking: '', inputTokens: 10, outputTokens: 5 });
    const { status, json } = await post({ sessionId: ids.sessionId, messageId: ids.original, mode: 'replay' });
    expect(status).toBe(200);
    expect((json.output as Record<string, unknown>).equalsOriginal).toBe(true);
    expect((json.output as Record<string, unknown>).sha256).toBe(sha(ORIGINAL_OUTPUT));
  });

  it('grants the web tool only when the record shows the original reached the web', async () => {
    const ids = seed(store, { manifest: [
      { type: 'local_file', name: 'policy.md', sha256: 'bbb222', contentHashed: true },
      { type: 'web_fetch', name: 'EBA guidelines — https://eba.example/gl', url: 'https://eba.example/gl', sha256: 'eee', contentHashed: true },
    ] });
    callChatMock.mockResolvedValueOnce({ text: 'x', thinking: '', inputTokens: 1, outputTokens: 1 });
    const { status } = await post({ sessionId: ids.sessionId, messageId: ids.original, mode: 'replay' });
    expect(status).toBe(200);
    const config = callChatMock.mock.calls[0][0] as Record<string, unknown>;
    expect(config.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search' }]);
    const art = store.artifacts.find((a) => a.rerun_mode === 'replay');
    expect((JSON.parse(String(art!.request_params)) as Record<string, unknown>).tools).toEqual(['web_search']);
  });

  it('pins a dated served id the capability tables know, not the alias that was asked for', async () => {
    const ids = seed(store, {
      originalModelId: 'claude-sonnet-4-5',
      originalSnapshot: { ...snapshot, model: 'claude-sonnet-4-5', modelServed: 'claude-sonnet-4-5-20250929', contextUsed: { modelServed: 'claude-sonnet-4-5-20250929', webSearch: false } },
      artifact: { model_requested: 'claude-sonnet-4-5', model_served: 'claude-sonnet-4-5-20250929', engine: 'anthropic' },
    });
    callChatMock.mockResolvedValueOnce({ text: 'pinned', thinking: '', inputTokens: 1, outputTokens: 1 });
    const { status, json } = await post({ sessionId: ids.sessionId, messageId: ids.original, mode: 'replay' });
    expect(status).toBe(200);
    expect((callChatMock.mock.calls[0][0] as Record<string, unknown>).model).toBe('claude-sonnet-4-5-20250929');
    expect(json.model).toEqual({ requested: 'claude-sonnet-4-5-20250929', served: 'claude-sonnet-4-5-20250929', equalsOriginal: true });
    const art = store.artifacts.find((a) => a.rerun_mode === 'replay');
    expect(art!.cost_basis).toBe('list');
  });

  it('sends an unlisted engine snapshot through its alias so thinking resolves, and does not claim model equality', async () => {
    // The subscription engine reports a dated snapshot (claude-opus-5-20260601);
    // the capability tables know only claude-opus-5. Dispatching the snapshot id
    // would drop the adaptive-thinking parameters the original ran with.
    const ids = seed(store, {
      originalModelId: 'sdk:claude-opus-5',
      originalSnapshot: { ...snapshot, model: 'sdk:claude-opus-5', engine: 'anthropic_sdk', modelServed: 'claude-opus-5-20260601', contextUsed: { modelServed: 'claude-opus-5-20260601', webSearch: false } },
      artifact: { model_requested: 'sdk:claude-opus-5', model_served: 'claude-opus-5-20260601', engine: 'anthropic_sdk' },
    });
    callChatMock.mockResolvedValueOnce({ text: 'y', thinking: '', inputTokens: 1, outputTokens: 1 });
    const { status, json } = await post({ sessionId: ids.sessionId, messageId: ids.original, mode: 'replay' });
    expect(status).toBe(200);
    const config = callChatMock.mock.calls[0][0] as Record<string, unknown>;
    expect(config.model).toBe('sdk:claude-opus-5');
    expect(config.thinkingLevel).toBe('investigate');
    expect(json.model).toEqual({ requested: 'sdk:claude-opus-5', served: 'claude-opus-5', equalsOriginal: false });
    expect(String(json.note)).toMatch(/through its alias sdk:claude-opus-5/);
    expect((json.prompt as Record<string, unknown>).equalsOriginal).toBe(true);
    const art = store.artifacts.find((a) => a.rerun_mode === 'replay');
    expect(art!.engine).toBe('anthropic_sdk');
    expect(art!.cost_basis).toBe('plan');
    expect(art!.cost_usd).toBeNull();
    const params = JSON.parse(String(art!.request_params)) as Record<string, unknown>;
    expect(params.servedSnapshot).toBe('claude-opus-5-20260601');
    expect(params.thinkingParamsResolved).toBe(true);
    expect(params.effort).toBe('xhigh');
  });

  it('re-qualifies an unknown served id with its engine and says the thinking parameters cannot resolve', async () => {
    const ids = seed(store, {
      originalModelId: 'sdk:claude-next-preview',
      originalSnapshot: { ...snapshot, model: 'sdk:claude-next-preview', engine: 'anthropic_sdk', modelServed: 'claude-next-preview', contextUsed: { modelServed: 'claude-next-preview', webSearch: false } },
      artifact: { model_requested: 'sdk:claude-next-preview', model_served: 'claude-next-preview', engine: 'anthropic_sdk' },
    });
    callChatMock.mockResolvedValueOnce({ text: 'n', thinking: '', inputTokens: 1, outputTokens: 1 });
    const { status, json } = await post({ sessionId: ids.sessionId, messageId: ids.original, mode: 'replay' });
    expect(status).toBe(200);
    expect((callChatMock.mock.calls[0][0] as Record<string, unknown>).model).toBe('sdk:claude-next-preview');
    expect(json.model).toEqual({ requested: 'sdk:claude-next-preview', served: 'claude-next-preview', equalsOriginal: true });
    expect(String(json.note)).toMatch(/cannot resolve thinking parameters/);
    const params = JSON.parse(String(store.artifacts.find((a) => a.rerun_mode === 'replay')!.request_params)) as Record<string, unknown>;
    expect(params.thinkingParamsResolved).toBe(false);
    expect(params.effort).toBeNull();
  });

  it('honours newModelId and reports the model as different from the original', async () => {
    const ids = seed(store);
    callChatMock.mockResolvedValueOnce({ text: 'z', thinking: '', inputTokens: 1, outputTokens: 1 });
    const { status, json } = await post({ sessionId: ids.sessionId, messageId: ids.original, mode: 'replay', newModelId: 'sdk:claude-sonnet-5' });
    expect(status).toBe(200);
    expect((callChatMock.mock.calls[0][0] as Record<string, unknown>).model).toBe('sdk:claude-sonnet-5');
    expect((callChatMock.mock.calls[0][0] as Record<string, unknown>).system).toBe(COMPOSED_PROMPT);
    expect(json.model).toEqual({ requested: 'sdk:claude-sonnet-5', served: 'claude-sonnet-5', equalsOriginal: false });
    expect((json.prompt as Record<string, unknown>).equalsOriginal).toBe(true);
  });

  it('falls back to the latest non-rerun assistant message when messageId is omitted', async () => {
    const ids = seed(store);
    callChatMock.mockResolvedValueOnce({ text: 'latest', thinking: '', inputTokens: 1, outputTokens: 1 });
    // assistant3 is the latest non-rerun answer, but it has no run record → 404.
    const { status } = await post({ sessionId: ids.sessionId, mode: 'replay' });
    expect(status).toBe(404);
    expect(callChatMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/rerun — recompose is unchanged (mode default)', () => {
  it('still dispatches into the claude router, flags rerun_of, diffs sources, and now names its mode + output hashes', async () => {
    const ids = seed(store);
    const { status, json } = await post({ sessionId: ids.sessionId, messageId: ids.original, newModelId: 'mistral-large-latest', areaId: 'fcp' });
    expect(status).toBe(200);
    expect(callChatMock).not.toHaveBeenCalled();             // recompose never goes through callChat
    expect(dispatched.length).toBe(1);
    expect(dispatched[0].model).toBe('mistral-large-latest');
    expect(dispatched[0].rerunOf).toBe(ids.original);
    expect(dispatched[0].thinking).toBe('investigate');
    expect(dispatched[0].userMessage).toBe('Assess our AMLR Article 16 readiness please.');

    expect(json.mode).toBe('recompose');
    expect(json.originalMessageId).toBe(ids.original);
    const rerun = json.rerun as Record<string, unknown>;
    expect(rerun.rerunOf).toBe(ids.original);
    expect(rerun.modelId).toBe('mistral-large-latest');
    expect(json.output).toEqual({
      sha256: sha('RECOMPOSED by mistral-large-latest'), originalSha256: sha(ORIGINAL_OUTPUT), equalsOriginal: false,
      chars: 'RECOMPOSED by mistral-large-latest'.length, originalChars: ORIGINAL_OUTPUT.length,
    });
    expect(json.prompt).toEqual({ sha256: sha('RECOMPOSED PROMPT'), originalSha256: sha(COMPOSED_PROMPT), equalsOriginal: false });
    expect((json.model as Record<string, unknown>).requested).toBe('mistral-large-latest');
    expect((json.model as Record<string, unknown>).equalsOriginal).toBe(false);
    // Drift view intact: policy.md changed hash.
    expect(json.sourceDriftAvailable).toBe(true);
    expect(json.sourceDriftDetected).toBe(true);
    expect(json.sourceDrift).toEqual([{ name: 'policy.md', type: 'local_file', changed: true, status: 'changed' }]);
    // The duplicate user row the pipeline saved is gone; the ledger names the mode.
    expect(store.messages.filter((m) => m.role === 'user' && m.content === 'Assess our AMLR Article 16 readiness please.').length).toBe(1);
    const art = store.artifacts.find((a) => a.message_id === rerun.messageId);
    expect(art!.rerun_mode).toBe('recompose');
    expect(art!.rerun_of).toBe(ids.original);
  });
});

describe('pure helpers', () => {
  it('rebuildReplayMessages trims trailing assistant turns and keeps order', async () => {
    const { rebuildReplayMessages } = await import('../../server/routes/rerun.js');
    const out = rebuildReplayMessages([
      { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'stray' },
    ]);
    expect(out).toEqual({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }], userMessage: 'c' });
    expect(rebuildReplayMessages([{ role: 'assistant', content: 'only' }])).toBeNull();
  });

  it('dispatchableModelId re-prefixes bare served ids by engine and leaves qualified ids alone', async () => {
    const { dispatchableModelId } = await import('../../server/routes/rerun.js');
    expect(dispatchableModelId('claude-opus-5-20260301', 'anthropic_sdk')).toBe('sdk:claude-opus-5-20260301');
    expect(dispatchableModelId('claude-sonnet-4-5-20250929', 'anthropic')).toBe('claude-sonnet-4-5-20250929');
    expect(dispatchableModelId('sdk:claude-opus-5', 'anthropic_sdk')).toBe('sdk:claude-opus-5');
    expect(dispatchableModelId('ollama:qwen3', null)).toBe('ollama:qwen3');
  });

  it('resolveReplayModel: caller pick, then a resolvable served id, then an alias, then the served id flagged', async () => {
    const { resolveReplayModel } = await import('../../server/routes/rerun.js');
    expect(resolveReplayModel({ newModelId: 'mistral-large-latest', servedRaw: 'claude-opus-5', engine: 'anthropic_sdk', aliases: [] }))
      .toEqual({ dispatch: 'mistral-large-latest', viaAlias: false, thinkingResolves: true });
    expect(resolveReplayModel({ newModelId: null, servedRaw: 'claude-opus-5', engine: 'anthropic_sdk', aliases: ['sdk:claude-opus-5'] }))
      .toEqual({ dispatch: 'sdk:claude-opus-5', viaAlias: false, thinkingResolves: true });
    expect(resolveReplayModel({ newModelId: null, servedRaw: 'claude-opus-5-20260601', engine: 'anthropic_sdk', aliases: [null, 'sdk:claude-opus-5'] }))
      .toEqual({ dispatch: 'sdk:claude-opus-5', viaAlias: true, thinkingResolves: true });
    // An alias that is not a prefix of the snapshot never stands in for it.
    expect(resolveReplayModel({ newModelId: null, servedRaw: 'claude-opus-5-20260601', engine: 'anthropic_sdk', aliases: ['sdk:claude-sonnet-5'] }))
      .toEqual({ dispatch: 'sdk:claude-opus-5-20260601', viaAlias: false, thinkingResolves: false });
    // Non-Anthropic ids do not depend on the capability tables.
    expect(resolveReplayModel({ newModelId: null, servedRaw: 'ollama:qwen3', engine: 'ollama', aliases: [] }))
      .toEqual({ dispatch: 'ollama:qwen3', viaAlias: false, thinkingResolves: true });
    expect(resolveReplayModel({ newModelId: null, servedRaw: null, engine: null, aliases: ['claude-opus-4-8'] })).toBeNull();
  });

  it('isModelRefusal separates "model gone" from other failures', async () => {
    const { isModelRefusal } = await import('../../server/routes/rerun.js');
    expect(isModelRefusal('not_found_error: model: claude-3-opus')).toBe(true);
    expect(isModelRefusal('Unknown model: foo')).toBe(true);
    expect(isModelRefusal('Model claude-x is no longer available')).toBe(true);
    expect(isModelRefusal('ECONNRESET')).toBe(false);
    expect(isModelRefusal('Budget cap reached')).toBe(false);
  });

  it('recordUsedWebTools reads the manifest first, then the snapshot flag', async () => {
    const { recordUsedWebTools } = await import('../../server/routes/rerun.js');
    expect(recordUsedWebTools('[{"type":"web_search","name":"search: x"}]', null)).toBe(true);
    expect(recordUsedWebTools([], { contextUsed: { webSearch: true } })).toBe(true);
    expect(recordUsedWebTools([{ type: 'url', name: 'a' }], { contextUsed: { webSearch: false } })).toBe(false);
  });
});

describe('describeReplayability — the import-run handler\'s replay/recompose decision', () => {
  it('says replay, with the id it would send, when prompt + hash travelled and the model is dispatchable', async () => {
    const { describeReplayability } = await import('../../server/routes/rerun.js');
    const ids = seed(store);
    const plan = await describeReplayability(createFakeDb(store), ids.sessionId, ids.original);
    expect(plan.mode).toBe('replay');
    expect(plan.model).toBe('claude-opus-4-8');
    expect(plan.reason).toMatch(/mode "replay"/);
    expect(store.writes).toEqual([]);                        // advice only — nothing written
  });

  it('names the alias for an unlisted engine snapshot, exactly as the replay would dispatch it', async () => {
    const { describeReplayability } = await import('../../server/routes/rerun.js');
    const ids = seed(store, {
      originalModelId: 'sdk:claude-opus-5',
      artifact: { model_requested: 'sdk:claude-opus-5', model_served: 'claude-opus-5-20260601', engine: 'anthropic_sdk' },
    });
    const plan = await describeReplayability(createFakeDb(store), ids.sessionId, ids.original);
    expect(plan).toMatchObject({ mode: 'replay', model: 'sdk:claude-opus-5' });
  });

  it('falls back to recompose, and says why, when the prompt was truncated or did not travel', async () => {
    const { describeReplayability } = await import('../../server/routes/rerun.js');
    const truncated = seed(store, { artifact: { truncated: true } });
    const a = await describeReplayability(createFakeDb(store), truncated.sessionId, truncated.original);
    expect(a.mode).toBe('recompose');
    expect(a.reason).toMatch(/truncated/);

    const noRecord = seed(store, { artifact: null });
    const b = await describeReplayability(createFakeDb(store), noRecord.sessionId, noRecord.original);
    expect(b.mode).toBe('recompose');
    expect(b.reason).toMatch(/did not carry the composed prompt/);
  });

  it('falls back to recompose when the served model is not dispatchable here', async () => {
    const { describeReplayability } = await import('../../server/routes/rerun.js');
    const ids = seed(store, {
      originalModelId: 'gpt-99-retired',
      originalSnapshot: { ...snapshot, model: 'gpt-99-retired', engine: 'openai', modelServed: 'gpt-99-retired', contextUsed: { modelServed: 'gpt-99-retired' } },
      artifact: { model_requested: 'gpt-99-retired', model_served: 'gpt-99-retired', engine: 'openai' },
    });
    const plan = await describeReplayability(createFakeDb(store), ids.sessionId, ids.original);
    expect(plan.mode).toBe('recompose');
    expect(plan.model).toBe('gpt-99-retired');
    expect(plan.reason).toMatch(/falling back to recompose/);
  });
});
