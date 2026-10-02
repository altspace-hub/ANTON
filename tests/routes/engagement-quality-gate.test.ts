/**
 * engagement-quality-gate.test.ts — the quality gate keeps what it has, and an
 * engagement can be completed.
 *
 * Before: eight serial engine calls with one INSERT at the end — a check that
 * failed after minutes of engine time saved nothing — and nothing ever set an
 * engagement to 'completed', so the progress bar topped out at 86% and the
 * benchmark library stayed empty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';

const callChatMock = vi.fn(async (opts: { system?: string; messages: Array<{ content: string }> }) => {
  const system = String(opts.system ?? '');
  if (/perspective of a Regulatory/.test(system)) throw new Error('SDK engine busy');
  if (/executive summaries/.test(system)) return { text: 'Executive summary text.', thinking: '', inputTokens: 1, outputTokens: 1 };
  if (/perspective of a/.test(system)) return { text: '{"verdict":"positive","key_points":["ok"],"top_concern":""}', thinking: '', inputTokens: 1, outputTokens: 1 };
  if (/Assess whether/.test(opts.messages[0].content)) return { text: '{"score": 90, "addressed": ["A"], "partial": [], "missing": [], "notes": ""}', thinking: '', inputTokens: 1, outputTokens: 1 };
  return { text: '{"score": 85, "conflicts": [], "notes": ""}', thinking: '', inputTokens: 1, outputTokens: 1 };
});
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: (opts: { system?: string; messages: Array<{ content: string }> }) => callChatMock(opts),
  streamChat: vi.fn(),
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => 'sdk:claude-sonnet-5',
}));
vi.mock('../../server/services/default-model-store.js', () => ({ getEffectiveDefaultModel: () => 'sdk:claude-opus-5' }));
vi.mock('../../server/services/rag/indexer.js', () => ({ indexFolder: vi.fn() }));
vi.mock('../../server/services/rag/retriever.js', () => ({ retrieveChunks: vi.fn(async () => []) }));
vi.mock('../../server/services/engagement-session-bridge.js', () => ({ bridgeIterationToSession: vi.fn() }));

import { createEngagementsRoutes } from '../../server/routes/engagements.js';

type Handler = (req: unknown, res: unknown) => Promise<void>;

async function handler(db: DatabaseAdapter, path: string): Promise<Handler> {
  const router = await createEngagementsRoutes(db);
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === path && l.route.methods.post);
  if (!layer?.route) throw new Error(`route not mounted: ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headersSent: false,
    frames: [] as string[],
    setHeader() { this.headersSent = true; },
    write(s: string) { this.frames.push(s); return true; },
    end() { /* closed */ },
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res;
}

const frames = (res: ReturnType<typeof mockRes>) =>
  res.frames.map((f) => f.replace(/^data: /, '').trim()).filter(Boolean).map((f) => JSON.parse(f) as Record<string, unknown> & { type: string });

interface Fixture { status?: string; iteration?: boolean; gate?: Record<string, unknown> | null }

function fakeDb(fx: Fixture = {}) {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const engagement = { id: 'eng-1', status: fx.status ?? 'review', title: 'AML review', quality_blueprint: '{}', user_id: 'alice', project_id: null };
  const iteration = fx.iteration === false ? undefined : { id: 'it-1', engagement_id: 'eng-1', status: 'approved', iteration_number: 1, output_content: 'The deliverable text.' };
  const db = {
    dialect: 'postgresql',
    get: vi.fn(async (sql: string) => {
      if (/FROM engagements WHERE id/.test(sql)) return engagement;
      if (/FROM engagement_iterations/.test(sql)) return iteration;
      if (/FROM engagement_quality_gates/.test(sql)) return fx.gate === undefined ? undefined : fx.gate ?? undefined;
      return undefined;
    }),
    all: vi.fn(async (sql: string) => {
      if (/FROM engagement_scope_items/.test(sql)) return [{ title: 'A' }];
      if (/FROM engagement_boundaries/.test(sql)) return [{ boundary_type: 'assumption', description: 'Data as provided' }];
      return [];
    }),
    run: vi.fn(async (sql: string, ...params: unknown[]) => { runs.push({ sql, params }); return { changes: 1, lastInsertRowid: 0 }; }),
    exec: vi.fn(async () => undefined),
    transaction: vi.fn(async (fn: (d: unknown) => unknown) => fn(db)),
    close: vi.fn(async () => undefined),
  } as unknown as DatabaseAdapter;
  return { db, runs };
}

const req = (body: Record<string, unknown> = {}) => ({ params: { id: 'eng-1' }, body, user: { id: 'alice', role: 'admin' } });

beforeEach(() => { callChatMock.mockClear(); delete process.env.DEPLOYMENT_MODE; });

describe('POST /engagements/:id/quality-gate/run', () => {
  it('creates the gate row first, persists every check as it finishes, and survives one failing lens', async () => {
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await handler(db, '/:id/quality-gate/run'))(req(), res);

    // Row exists before any check result is stored.
    const insertIdx = runs.findIndex((r) => /INSERT INTO engagement_quality_gates/.test(r.sql));
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(runs[insertIdx].sql).toContain("'running'");
    const firstCheckUpdate = runs.findIndex((r) => /UPDATE engagement_quality_gates SET scope_completeness/.test(r.sql));
    expect(firstCheckUpdate).toBeGreaterThan(insertIdx);

    // Each check column is written on its own.
    for (const col of ['scope_completeness', 'blueprint_alignment', 'cross_consistency', 'assumptions_section', 'executive_summary', 'expert_reviews']) {
      expect(runs.some((r) => new RegExp(`UPDATE engagement_quality_gates SET ${col} = \\?`).test(r.sql))).toBe(true);
    }

    // The Regulatory lens failed: reported, recorded, and the run went on.
    const evts = frames(res);
    const failed = evts.find((e) => e.type === 'check_error');
    expect(failed?.check).toBe('8F-regulatory');
    expect(evts.filter((e) => e.type === 'check_done').map((e) => e.check)).toEqual(expect.arrayContaining(['8A', '8C', '8D', '8E', '8F-devil_advocate', '8F-client_perspective', '8F-pragmatist']));
    const expertWrite = [...runs].reverse().find((r) => /SET expert_reviews = \?/.test(r.sql));
    const expert = JSON.parse(String(expertWrite!.params[0])) as Record<string, { verdict?: string; error?: string }>;
    expect(expert.regulatory.error).toBeDefined();
    expect(expert.pragmatist.verdict).toBe('positive');

    // A gate with a failed check is partial and never release-ready.
    const final = runs.find((r) => /UPDATE engagement_quality_gates SET overall_score/.test(r.sql));
    expect(final!.params[3]).toBe('partial');
    expect(final!.params[1]).toBe(0);
    const done = evts.find((e) => e.type === 'done');
    expect(done?.failed_checks).toEqual(['8F-regulatory']);
    expect(done?.status).toBe('partial');
    // Score still computed from the checks that ran: (90 + 85) / 2.
    expect(done?.overall_score).toBe(87.5);
  });

  it('is completed and release-ready when every check passes', async () => {
    callChatMock.mockImplementation(async (opts: { system?: string; messages: Array<{ content: string }> }) => {
      const system = String(opts.system ?? '');
      if (/executive summaries/.test(system)) return { text: 'Summary.', thinking: '', inputTokens: 1, outputTokens: 1 };
      if (/perspective of a/.test(system)) return { text: '{"verdict":"positive","key_points":[],"top_concern":""}', thinking: '', inputTokens: 1, outputTokens: 1 };
      if (/Assess whether/.test(opts.messages[0].content)) return { text: '{"score": 92, "addressed": ["A"], "partial": [], "missing": [], "notes": ""}', thinking: '', inputTokens: 1, outputTokens: 1 };
      return { text: '{"score": 88, "conflicts": [], "notes": ""}', thinking: '', inputTokens: 1, outputTokens: 1 };
    });
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await handler(db, '/:id/quality-gate/run'))(req(), res);
    const final = runs.find((r) => /UPDATE engagement_quality_gates SET overall_score/.test(r.sql));
    expect(final!.params[3]).toBe('completed');
    expect(final!.params[1]).toBe(1);
    expect(frames(res).some((e) => e.type === 'check_error')).toBe(false);
  });
});

/**
 * Replies of the showcase's models (GLM, DeepSeek, Kimi): fenced, wrapped in a
 * sentence, or cut off at the token limit. Before 2026-10-02 a reply with no
 * readable JSON was stored as { raw } and counted as passed — left out of the
 * failed checks and of the score — so a cut-off scope check dropped out and
 * the gate could say release-ready with the scope never checked.
 */
describe('quality gate replies from weaker models', () => {
  const FENCE = '```';
  const GOOD_SCOPE = '{"score": 92, "addressed": ["A"], "partial": [], "missing": [], "notes": ""}';
  const GOOD_CONSISTENCY = '{"score": 88, "conflicts": [], "notes": ""}';
  const GOOD_LENS = '{"verdict":"positive","key_points":["ok"],"top_concern":""}';

  function replies(over: { scope?: string; consistency?: string; lens?: string } = {}): void {
    callChatMock.mockImplementation(async (opts: { system?: string; messages: Array<{ content: string }> }) => {
      const system = String(opts.system ?? '');
      const reply = (text: string) => ({ text, thinking: '', inputTokens: 1, outputTokens: 1 });
      if (/executive summaries/.test(system)) return reply('Summary.');
      if (/perspective of a Pragmatist/.test(system)) return reply(over.lens ?? GOOD_LENS);
      if (/perspective of a/.test(system)) return reply(GOOD_LENS);
      if (/Assess whether/.test(opts.messages[0].content)) return reply(over.scope ?? GOOD_SCOPE);
      return reply(over.consistency ?? GOOD_CONSISTENCY);
    });
  }

  const UNREADABLE = "The reviewer's answer could not be read — re-run this check.";

  it('a scope check cut off mid-answer is a failed check: the gate is partial, never release-ready', async () => {
    replies({ scope: `${FENCE}json\n{"score": 40, "addressed": ["Scope 1", "Scope 2"], "partial": [], "missing": ["Sanctions screening calibr` });
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await handler(db, '/:id/quality-gate/run'))(req(), res);

    const evts = frames(res);
    const scopeError = evts.find((e) => e.type === 'check_error' && e.check === '8A');
    expect(scopeError?.error).toBe(UNREADABLE);
    expect(evts.some((e) => e.type === 'check_done' && e.check === '8A')).toBe(false);
    const done = evts.find((e) => e.type === 'done');
    expect(done?.release_ready).toBe(false);
    expect(done?.failed_checks).toEqual(['8A']);
    expect(done?.status).toBe('partial');
    // The score is the checks that were read: 8C alone.
    expect(done?.overall_score).toBe(88);
    const final = runs.find((r) => /UPDATE engagement_quality_gates SET overall_score/.test(r.sql));
    expect(final!.params[1]).toBe(0);
    expect(final!.params[3]).toBe('partial');
    const stored = runs.find((r) => /SET scope_completeness = \?/.test(r.sql));
    expect(JSON.parse(String(stored!.params[0]))).toEqual({ error: UNREADABLE });

    // The scope check asks for JSON and has room for a long list of titles.
    const scopeCall = callChatMock.mock.calls.find(([o]) => /Assess whether/.test(o.messages[0].content))![0] as unknown as { jsonMode?: boolean; maxTokens?: number };
    expect(scopeCall.jsonMode).toBe(true);
    expect(scopeCall.maxTokens).toBeGreaterThanOrEqual(4096);
  });

  it('a check whose answer has no numeric score from 0 to 100 is failed too', async () => {
    for (const scope of ['{"score": "high", "missing": []}', '{"score": 140, "missing": []}', 'The deliverable covers every item well.']) {
      replies({ scope });
      const { db } = fakeDb();
      const res = mockRes();
      await (await handler(db, '/:id/quality-gate/run'))(req(), res);
      const done = frames(res).find((e) => e.type === 'done');
      expect(done?.release_ready, scope).toBe(false);
      expect(done?.failed_checks, scope).toEqual(['8A']);
    }
  });

  it('reads a fenced or sentence-wrapped reply, and is release-ready when every check reads well (negative control)', async () => {
    replies({
      scope: `Here is my assessment.\n${FENCE}json\n${GOOD_SCOPE}\n${FENCE}\nAll items are covered.`,
      consistency: `Assessment: ${GOOD_CONSISTENCY}`,
      lens: `${FENCE}json\n${GOOD_LENS}\n${FENCE}`,
    });
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await handler(db, '/:id/quality-gate/run'))(req(), res);
    const done = frames(res).find((e) => e.type === 'done');
    expect(done?.failed_checks).toEqual([]);
    expect(done?.release_ready).toBe(true);
    expect(done?.overall_score).toBe(90);
    const final = runs.find((r) => /UPDATE engagement_quality_gates SET overall_score/.test(r.sql));
    expect(final!.params[3]).toBe('completed');
  });

  it('a lens whose review cannot be read is a failed check, not an empty card on a passed gate', async () => {
    replies({ lens: '{"verdict": "concerns", "key_points": ["The timeline assumes' });
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await handler(db, '/:id/quality-gate/run'))(req(), res);
    const evts = frames(res);
    expect(evts.find((e) => e.type === 'check_error' && e.check === '8F-pragmatist')?.error).toBe(UNREADABLE);
    const done = evts.find((e) => e.type === 'done');
    expect(done?.failed_checks).toEqual(['8F-pragmatist']);
    expect(done?.release_ready).toBe(false);
    const expertWrite = [...runs].reverse().find((r) => /SET expert_reviews = \?/.test(r.sql));
    const expert = JSON.parse(String(expertWrite!.params[0])) as Record<string, { verdict?: string; error?: string }>;
    expect(expert.pragmatist).toEqual({ error: UNREADABLE });
    expect(expert.devil_advocate.verdict).toBe('positive');
  });

  it('a missing-items answer that is not a list does not break the gate', async () => {
    replies({ scope: '{"score": 95, "addressed": ["A"], "missing": "none"}' });
    const { db } = fakeDb();
    const res = mockRes();
    await (await handler(db, '/:id/quality-gate/run'))(req(), res);
    const done = frames(res).find((e) => e.type === 'done');
    expect(done?.blockers).toEqual([]);
    expect(done?.release_ready).toBe(true);
  });
});

describe('POST /engagements/:id/complete and /reopen', () => {
  it('refuses without an iteration', async () => {
    const { db } = fakeDb({ iteration: false });
    const res = mockRes();
    await (await handler(db, '/:id/complete'))(req(), res);
    expect(res.statusCode).toBe(409);
  });

  it('asks for force when the latest gate is not release-ready, then completes when forced', async () => {
    const { db, runs } = fakeDb({ gate: { id: 'qg-1', release_ready: 0, overall_score: 70, blockers: '["Missing scope: B"]', status: 'completed' } });
    const first = mockRes();
    await (await handler(db, '/:id/complete'))(req(), first);
    expect(first.statusCode).toBe(409);
    expect((first.body as { needs_force?: boolean }).needs_force).toBe(true);
    expect(runs.some((r) => /status = 'completed'/.test(r.sql))).toBe(false);

    const forced = mockRes();
    await (await handler(db, '/:id/complete'))(req({ force: true }), forced);
    expect(forced.statusCode).toBe(200);
    const update = runs.find((r) => /UPDATE engagements SET status = 'completed', completed_at = NOW\(\)/.test(r.sql));
    expect(update).toBeDefined();
    const log = runs.find((r) => /INSERT INTO engagement_changelog/.test(r.sql) && r.params.some((p) => typeof p === 'string' && /forced by the user/.test(p)));
    expect(log).toBeDefined();
  });

  it('completes without force when the gate is release-ready, and reopens', async () => {
    const { db, runs } = fakeDb({ gate: { id: 'qg-1', release_ready: 1, overall_score: 91, blockers: '[]', status: 'completed' } });
    const res = mockRes();
    await (await handler(db, '/:id/complete'))(req(), res);
    expect(res.statusCode).toBe(200);
    expect(runs.some((r) => /status = 'completed'/.test(r.sql))).toBe(true);

    const { db: doneDb, runs: doneRuns } = fakeDb({ status: 'completed' });
    const reopened = mockRes();
    await (await handler(doneDb, '/:id/reopen'))(req(), reopened);
    expect(reopened.statusCode).toBe(200);
    expect(doneRuns.some((r) => /status = 'review', completed_at = NULL/.test(r.sql))).toBe(true);

    const notDone = mockRes();
    await (await handler(db, '/:id/reopen'))(req(), notDone);
    expect(notDone.statusCode).toBe(409);
  });
});
