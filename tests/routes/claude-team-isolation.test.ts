/**
 * claude-team-isolation.test.ts — the chat routes keep each person's data their
 * own on a shared (DEPLOYMENT_MODE=team) server. TEAM_SERVER_READINESS 2026-09-23,
 * Part 2: B2, B3, B4 and the attachment half of B5.
 *
 * Before:
 *   - B2: POST /api/claude/message (and /deliberate, /preview-prompt) took any
 *     sessionId — it wrote messages into that session and read its resume
 *     snapshot and project documents into the caller's prompt;
 *   - B3: GET /api/revelation-chains/:chainId returned anyone's chain, thinking
 *     and output included;
 *   - B4: every run's Layer-0 block was the one shared user_profiles row;
 *   - B5: uploadedFileIds attached any file in the upload directory by name.
 *
 * Against a fake adapter that answers only the statements these checks issue.
 * The prompt composer is mocked to record what it was given and then stop the
 * run, so "reached the composer" is the observable proof a request got past a
 * gate; nothing here calls a model. Every closed leak has a negative control:
 * the owner, an admin, or solo mode still gets through.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import path from 'node:path';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { PROJECT_CONTEXT_SQL } from '../../server/services/project-context.js';

// ── Seams ──────────────────────────────────────────────────────────────────────

interface ComposerCall { userProfile: Record<string, unknown> | null | undefined }
const composerCalls: ComposerCall[] = [];
const resolverCalls: string[][] = [];
let onResolver: (() => void) | null = null;

vi.mock('../../server/services/prompt-composer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/prompt-composer.js')>();
  const stop = (config: { userProfile?: Record<string, unknown> | null }): never => {
    composerCalls.push({ userProfile: config.userProfile });
    throw new Error('composer-reached');
  };
  return {
    ...actual,
    composeSystemPrompt: vi.fn(async (config: { userProfile?: Record<string, unknown> | null }) => stop(config)),
    composeSystemPromptParts: vi.fn(async (config: { userProfile?: Record<string, unknown> | null }) => stop(config)),
  };
});

vi.mock('../../server/services/knowledge-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/knowledge-resolver.js')>();
  return {
    ...actual,
    resolveKnowledgeSources: vi.fn(async (_sources: unknown, filePaths: string[]) => {
      resolverCalls.push([...filePaths]);
      onResolver?.();
      return { systemPromptAdditions: '', contextDocuments: '', tools: [], tokenEstimate: 0, sourceManifest: [], sourceDetails: [] };
    }),
  };
});

// The per-user budget has its own tests; here it must simply let requests through.
vi.mock('../../server/services/budget-manager.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/budget-manager.js')>();
  return { ...actual, checkBudgetBeforeApiCall: async () => ({ allowed: true }) };
});

import { createClaudeRoutes } from '../../server/routes/claude.js';

// ── Fake database ──────────────────────────────────────────────────────────────

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const PROJECT = 'proj-orion';

interface FakeState {
  sessions: Map<string, { user_id: string | null; project_id?: string }>;
  uploads: Map<string, string | null>;
  profiles: Map<string, Record<string, unknown>>;
  chains: Map<string, { session_id: string | null }>;
  members: Set<string>;
  gets: Array<{ sql: string; params: unknown[] }>;
  alls: Array<{ sql: string; params: unknown[] }>;
  runs: Array<{ sql: string; params: unknown[] }>;
}

function makeFakeDb(): { db: DatabaseAdapter; state: FakeState } {
  const state: FakeState = {
    sessions: new Map([
      ['s-alice', { user_id: 'alice' }],
      ['s-alice-matter', { user_id: 'alice', project_id: PROJECT }],
    ]),
    uploads: new Map([
      ['u1-alice.pdf', 'alice'],
      ['u2-bob.pdf', 'bob'],
      ['u3-legacy.pdf', null],
    ]),
    profiles: new Map([
      ['default', { id: 'default', display_name: 'Original Owner', brand_config: '{"palette":["#000000"]}' }],
      ['alice', { id: 'alice', display_name: 'Alice' }],
      ['bob', { id: 'bob', display_name: 'Bob' }],
    ]),
    chains: new Map([
      ['chain-alice', { session_id: 's-alice' }],
      ['chain-markets', { session_id: null }],
    ]),
    members: new Set(),
    gets: [], alls: [], runs: [],
  };
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      state.gets.push({ sql, params });
      if (/FROM sessions WHERE id = \? AND user_id = \?/.test(sql)) {
        return (state.sessions.get(String(params[0]))?.user_id === params[1] ? { ok: 1 } : undefined) as T | undefined;
      }
      if (/FROM user_profiles WHERE id = \?/.test(sql)) return state.profiles.get(String(params[0])) as T | undefined;
      if (/FROM revelation_chains c\s+JOIN sessions s/.test(sql)) {
        const chain = state.chains.get(String(params[0]));
        const owner = chain?.session_id ? state.sessions.get(chain.session_id)?.user_id : undefined;
        return (chain && owner && owner === params[1] ? { ok: 1 } : undefined) as T | undefined;
      }
      if (sql === 'SELECT * FROM revelation_chains WHERE id = ?') {
        const chain = state.chains.get(String(params[0]));
        return (chain ? { id: params[0], session_id: chain.session_id, message_id: null, thinking_level: 'investigate' } : undefined) as T | undefined;
      }
      if (/FROM sessions s JOIN projects p ON p\.id = s\.project_id WHERE s\.id = \?/.test(sql)) {
        const s = state.sessions.get(String(params[0]));
        return (s?.project_id ? { id: s.project_id, name: 'Orion acquisition' } : undefined) as T | undefined;
      }
      if (sql === PROJECT_CONTEXT_SQL.project) {
        return (params[0] === PROJECT ? { id: PROJECT, name: 'Orion acquisition', description: null, project_goal: null, user_id: 'carol' } : undefined) as T | undefined;
      }
      if (sql === PROJECT_CONTEXT_SQL.membership) {
        return (state.members.has(`${String(params[0])}:${String(params[1])}`) ? { ok: 1 } : undefined) as T | undefined;
      }
      return undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      state.alls.push({ sql, params });
      if (/FROM file_uploads WHERE uploaded_by = \? AND id IN/.test(sql)) {
        const [owner, ...ids] = params;
        return ids.filter((id) => state.uploads.get(String(id)) === owner).map((id) => ({ id })) as T[];
      }
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      state.runs.push({ sql, params });
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, state };
}

// ── Server ─────────────────────────────────────────────────────────────────────

let server: Server;
let base: string;
let state: FakeState;
const originalMode = process.env.DEPLOYMENT_MODE;
const originalKey = process.env.ANTHROPIC_API_KEY;

beforeAll(async () => {
  const fake = makeFakeDb();
  state = fake.state;
  const app = express();
  app.use(express.json());
  // The caller, as middleware/auth.ts would have set it (solo stamps id 'solo', role admin).
  app.use((req, _res, next) => {
    const id = req.header('x-test-user');
    if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
    next();
  });
  app.use('/api', await createClaudeRoutes(fake.db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  base = `http://127.0.0.1:${addr.port}`;
}, 60_000);

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  state.gets.length = 0; state.alls.length = 0; state.runs.length = 0;
  state.members.clear();
  composerCalls.length = 0; resolverCalls.length = 0; onResolver = null;
});
afterEach(() => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalKey;
});

type Caller = [user: string, role: 'admin' | 'analyst' | 'viewer'];
const ALICE: Caller = ['alice', 'analyst'];
const BOB: Caller = ['bob', 'analyst'];
const ADMIN: Caller = ['root', 'admin'];
const SOLO: Caller = ['solo', 'admin'];

async function post(route: string, caller: Caller, body: Record<string, unknown>, signal?: AbortSignal) {
  return fetch(`${base}/api${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-user': caller[0], 'x-test-role': caller[1] },
    body: JSON.stringify(body),
    signal,
  });
}

async function postJson(route: string, caller: Caller, body: Record<string, unknown>) {
  const r = await post(route, caller, body);
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

// A local model id keeps the run away from any API-key or engine check; the
// composer mock ends it before any adapter is called.
const RUN = { userMessage: 'Summarise the matter for me.', model: 'ollama:test-model' };

const messageInserts = () => state.runs.filter((r) => /INSERT INTO messages/.test(r.sql));
const reachedComposer = (r: { status: number; body: Record<string, unknown> }) =>
  r.status === 500 && r.body.error === 'composer-reached' && composerCalls.length > 0;

// ── B2: session ownership ──────────────────────────────────────────────────────

describe('B2 — a run may only touch a session its caller owns', () => {
  it('team: another user\'s sessionId answers 404 before anything is read or written', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await postJson('/claude/message', BOB, { ...RUN, sessionId: 's-alice' });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Session not found' });
    expect(state.runs).toEqual([]);
    expect(composerCalls).toEqual([]);
    // Nothing keyed on the session was read either: only the ownership check.
    const sessionKeyed = [...state.gets, ...state.alls].filter((c) => c.params.includes('s-alice'));
    expect(sessionKeyed.map((c) => c.sql)).toEqual([expect.stringMatching(/FROM sessions WHERE id = \? AND user_id = \?/)]);
  });

  it('team: a session that does not exist answers the same 404', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await postJson('/claude/message', BOB, { ...RUN, sessionId: 'no-such-session' });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Session not found' });
  });

  it('negative control — team: the owner and an admin still run in the session', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    for (const caller of [ALICE, ADMIN]) {
      state.runs.length = 0; composerCalls.length = 0;
      const r = await postJson('/claude/message', caller, { ...RUN, sessionId: 's-alice' });
      expect(reachedComposer(r), caller[0]).toBe(true);
      expect(messageInserts().map((m) => m.params[1]), caller[0]).toEqual(['s-alice']);
    }
  });

  it('negative control — solo: no ownership query, and even an unknown session still runs (as before)', async () => {
    delete process.env.DEPLOYMENT_MODE;
    const r = await postJson('/claude/message', SOLO, { ...RUN, sessionId: 'unowned-legacy-session' });
    expect(reachedComposer(r)).toBe(true);
    expect(state.gets.some((g) => /FROM sessions WHERE id = \? AND user_id = \?/.test(g.sql))).toBe(false);
    expect(messageInserts().map((m) => m.params[1])).toEqual(['unowned-legacy-session']);
  });

  it('team: /claude/deliberate refuses another user\'s session; the owner gets through', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
    const denied = await postJson('/claude/deliberate', BOB, { userMessage: 'Decide.', sessionId: 's-alice' });
    expect(denied.status).toBe(404);
    expect(denied.body).toEqual({ error: 'Session not found' });
    expect(composerCalls).toEqual([]);
    expect(state.runs).toEqual([]);

    const allowed = await postJson('/claude/deliberate', ALICE, { userMessage: 'Decide.', sessionId: 's-alice' });
    expect(reachedComposer(allowed)).toBe(true);
  });

  it('team: /claude/preview-prompt refuses another user\'s session; the owner gets through', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const denied = await postJson('/claude/preview-prompt', BOB, { userMessage: 'Preview.', sessionId: 's-alice' });
    expect(denied.status).toBe(404);
    expect(denied.body).toEqual({ error: 'Session not found' });
    expect(composerCalls).toEqual([]);
    expect(state.gets.some((g) => /session_snapshots/.test(g.sql))).toBe(false);

    const allowed = await postJson('/claude/preview-prompt', ALICE, { userMessage: 'Preview.', sessionId: 's-alice' });
    expect(reachedComposer(allowed)).toBe(true);
  });

  it('team: the owner\'s session in a project they no longer belong to does not read its files', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const readsFiles = () => state.alls.some((a) => /FROM project_files/.test(a.sql));

    const r = await postJson('/claude/message', ALICE, { ...RUN, sessionId: 's-alice-matter' });
    expect(reachedComposer(r)).toBe(true);
    expect(state.gets.some((g) => g.sql === PROJECT_CONTEXT_SQL.membership)).toBe(true);
    expect(readsFiles()).toBe(false);

    // Negative control: as a member, the project's documents ride along again.
    state.alls.length = 0; composerCalls.length = 0;
    state.members.add(`${PROJECT}:alice`);
    const member = await postJson('/claude/message', ALICE, { ...RUN, sessionId: 's-alice-matter' });
    expect(reachedComposer(member)).toBe(true);
    expect(readsFiles()).toBe(true);
  });

  it('negative control — solo: project documents are read with no membership question', async () => {
    delete process.env.DEPLOYMENT_MODE;
    const r = await postJson('/claude/message', SOLO, { ...RUN, sessionId: 's-alice-matter' });
    expect(reachedComposer(r)).toBe(true);
    expect(state.alls.some((a) => /FROM project_files/.test(a.sql))).toBe(true);
    expect(state.gets.some((g) => g.sql === PROJECT_CONTEXT_SQL.membership)).toBe(false);
  });
});

// ── B3: revelation chains ─────────────────────────────────────────────────────

describe('B3 — a revelation chain is visible only to its session\'s owner', () => {
  async function getChain(id: string, caller: Caller) {
    const r = await fetch(`${base}/api/revelation-chains/${id}`, { headers: { 'x-test-user': caller[0], 'x-test-role': caller[1] } });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  }

  it('team: another user gets the same 404 as for a missing chain, and the chain is never loaded', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const theirs = await getChain('chain-alice', BOB);
    const missing = await getChain('chain-nope', BOB);
    expect(theirs).toEqual({ status: 404, body: { error: 'Revelation chain not found' } });
    expect(missing).toEqual(theirs);
    expect(state.gets.some((g) => g.sql === 'SELECT * FROM revelation_chains WHERE id = ?')).toBe(false);
    expect(state.alls.some((a) => /revelation_steps/.test(a.sql))).toBe(false);
  });

  it('team: a chain with no session is admin-only', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    expect((await getChain('chain-markets', ALICE)).status).toBe(404);
    expect((await getChain('chain-markets', ADMIN)).status).toBe(200);
  });

  it('negative control — the owner, an admin and solo mode read the chain', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    for (const caller of [ALICE, ADMIN]) {
      const r = await getChain('chain-alice', caller);
      expect(r.status, caller[0]).toBe(200);
      expect(r.body.id, caller[0]).toBe('chain-alice');
    }
    delete process.env.DEPLOYMENT_MODE;
    for (const id of ['chain-alice', 'chain-markets']) {
      const r = await getChain(id, SOLO);
      expect(r.status, id).toBe(200);
    }
  });
});

// ── B4: Layer-0 profile ───────────────────────────────────────────────────────

describe('B4 — each run carries its own caller\'s profile', () => {
  it('team: alice and bob each get their own row, never the shared one', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    await postJson('/claude/message', ALICE, RUN);
    await postJson('/claude/message', BOB, RUN);
    expect(composerCalls.map((c) => c.userProfile?.display_name)).toEqual(['Alice', 'Bob']);
  });

  it('team: a person with no profile yet gets none — not the original owner\'s', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    await postJson('/claude/message', ['dora', 'viewer'], RUN);
    expect(composerCalls).toHaveLength(1);
    expect(composerCalls[0].userProfile ?? null).toBeNull();
  });

  it('team: /claude/message-sync, /deliberate and /preview-prompt read the caller\'s row too', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
    await postJson('/claude/message-sync', BOB, { userMessage: 'Hi' });
    await postJson('/claude/deliberate', BOB, { userMessage: 'Hi' });
    await postJson('/claude/preview-prompt', BOB, { userMessage: 'Hi' });
    expect(composerCalls.map((c) => c.userProfile?.display_name)).toEqual(['Bob', 'Bob', 'Bob']);
  });

  it('negative control — solo: the run still carries the single \'default\' profile', async () => {
    delete process.env.DEPLOYMENT_MODE;
    await postJson('/claude/message', SOLO, RUN);
    expect(composerCalls.map((c) => c.userProfile?.display_name)).toEqual(['Original Owner']);
  });
});

// ── B5: attachments ───────────────────────────────────────────────────────────

describe('B5 — only the caller\'s own uploads are attached', () => {
  const ALL = ['u1-alice.pdf', 'u2-bob.pdf', 'u3-legacy.pdf', 'rag-documents/other.pdf'];
  const inUploads = (ids: string[]) => ids.map((id) => path.join(UPLOAD_DIR, id));
  const KS = { knowledgeSources: { modes: { claudeKnowledge: { enabled: true } } } };

  it('team: preview-prompt drops another user\'s file, an unattributed file and a sub-path', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    await postJson('/claude/preview-prompt', BOB, { userMessage: 'x', uploadedFileIds: ALL, ...KS });
    expect(resolverCalls).toEqual([inUploads(['u2-bob.pdf'])]);
  });

  it('team: deliberate drops them too', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
    await postJson('/claude/deliberate', ALICE, { userMessage: 'x', uploadedFileIds: ALL, ...KS });
    expect(resolverCalls).toEqual([inUploads(['u1-alice.pdf'])]);
  });

  it('team: /claude/message attaches nothing that is not the caller\'s', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await postJson('/claude/message', BOB, { ...RUN, uploadedFileIds: ['u1-alice.pdf', 'u3-legacy.pdf'], ...KS });
    expect(reachedComposer(r)).toBe(true);
    expect(resolverCalls).toEqual([[]]);
  });

  it('negative control — team: /claude/message attaches the caller\'s own file', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    // An attached document opens the SSE stream early, so the run cannot answer
    // with a JSON error once the composer mock stops it: abort once the files
    // were resolved.
    const resolved = new Promise<void>((resolve) => { onResolver = resolve; });
    const ac = new AbortController();
    const pending = post('/claude/message', BOB, { ...RUN, uploadedFileIds: ['u2-bob.pdf', 'u1-alice.pdf'], ...KS }, ac.signal).catch(() => null);
    await resolved;
    ac.abort();
    await pending;
    expect(resolverCalls).toEqual([inUploads(['u2-bob.pdf'])]);
  });

  it('negative control — an admin and solo mode keep the list exactly as sent', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    await postJson('/claude/preview-prompt', ADMIN, { userMessage: 'x', uploadedFileIds: ALL, ...KS });
    delete process.env.DEPLOYMENT_MODE;
    await postJson('/claude/preview-prompt', SOLO, { userMessage: 'x', uploadedFileIds: ALL, ...KS });
    expect(resolverCalls).toEqual([inUploads(ALL), inUploads(ALL)]);
    expect(state.alls.some((a) => /file_uploads/.test(a.sql))).toBe(false);
  });
});
