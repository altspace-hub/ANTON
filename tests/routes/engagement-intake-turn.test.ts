/**
 * engagement-intake-turn.test.ts — ANTON interviews the consultant for Scope
 * and Client Intelligence, and what the consultant confirms lands in the same
 * rows the forms edit.
 *
 * Before: Phase 2 was a checklist and Phase 2a a 16-field form, and every
 * March engagement on this instance stalled there. The intake route reads the
 * letter and what is already known, asks the next questions, and applies the
 * trailing <intake_update> block — client fields merged, new scope items
 * confirmed, boundaries recorded — while the reader never sees the block.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';

const REPLY_VISIBLE = 'Thanks — the letter names the FSA as supervisor. Two questions: which products are in scope, and what triggered the engagement?';
const REPLY_BLOCK = `<intake_update>
{"client_intelligence": {"regulatory_supervisors": ["Finansinspektionen", "ECB"], "engagement_trigger": "2025 FSA inspection findings", "scale_indicators": {"customers": "1.2m"}},
 "scope_items": [{"title": "Transaction monitoring review", "category": "analysis"}, {"title": "Sanctions screening calibration", "description": "Threshold review", "category": "analysis"}],
 "boundaries": [{"type": "exclusion", "description": "Retail lending is out of scope"}, {"type": "risk", "description": "not a supported type"}],
 "done": false}
</intake_update>`;

const streamChatMock = vi.fn(async (opts: Record<string, unknown>, res: { write: (s: string) => void }) => {
  const text = `${REPLY_VISIBLE}\n\n${REPLY_BLOCK}`;
  res.write(`data: ${JSON.stringify({ type: 'text_delta', content: text })}\n\n`);
  return { text, thinking: '', inputTokens: 1, outputTokens: 1, model: String(opts.model) };
});
vi.mock('../../server/services/provider-router.js', () => ({
  streamChat: (opts: Record<string, unknown>, res: { write: (s: string) => void }) => streamChatMock(opts, res),
  callChat: vi.fn(),
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/default-model-store.js', () => ({
  getEffectiveDefaultModel: () => 'sdk:claude-opus-5',
}));
vi.mock('../../server/services/rag/indexer.js', () => ({ indexFolder: vi.fn() }));
vi.mock('../../server/services/rag/retriever.js', () => ({ retrieveChunks: vi.fn(async () => []) }));
vi.mock('../../server/services/engagement-session-bridge.js', () => ({ bridgeIterationToSession: vi.fn() }));

import { createEngagementsRoutes } from '../../server/routes/engagements.js';

type Handler = (req: unknown, res: unknown) => Promise<void>;

async function intakeHandler(db: DatabaseAdapter): Promise<Handler> {
  const router = await createEngagementsRoutes(db);
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === '/:id/intake/turn' && l.route.methods.post);
  if (!layer?.route) throw new Error('route not mounted');
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
    end() { /* stream closed */ },
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res;
}

interface Fixture { intel?: Record<string, unknown>; conversation?: string; scope?: Array<Record<string, unknown>> }

function fakeDb(fx: Fixture = {}) {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const engagement = {
    id: 'eng-1', title: 'AML framework review', engagement_type: 'full', your_organisation: 'Nordic Advisory',
    client_name: 'Baltic Bank', engagement_brief: '{"summary":"AML review after FSA inspection"}', exec_model: null,
    intake_conversation: fx.conversation ?? '[]',
  };
  const scope = fx.scope ?? [{ title: 'Transaction Monitoring Review', description: 'TM scenarios', category: 'analysis', status: 'confirmed' }];
  const db = {
    dialect: 'postgresql',
    get: vi.fn(async (sql: string) => {
      if (/FROM engagements WHERE id/.test(sql)) return engagement;
      if (/FROM engagement_client_intelligence/.test(sql)) return fx.intel;
      if (/FROM engagement_documents/.test(sql)) return { extracted_content: 'Engagement letter: review of the AML framework at Baltic Bank following the 2025 FSA inspection.' };
      return undefined;
    }),
    all: vi.fn(async (sql: string) => {
      if (/FROM engagement_scope_items/.test(sql)) return scope;
      return [];
    }),
    run: vi.fn(async (sql: string, ...params: unknown[]) => { runs.push({ sql, params }); return { changes: 1, lastInsertRowid: 0 }; }),
    exec: vi.fn(async () => undefined),
    transaction: vi.fn(async (fn: (d: unknown) => unknown) => fn(db)),
    close: vi.fn(async () => undefined),
  } as unknown as DatabaseAdapter;
  return { db, runs };
}

const req = (over: Record<string, unknown> = {}) => ({
  params: { id: 'eng-1' },
  body: { message: '' },
  user: { id: 'alice', role: 'admin' },
  ...over,
});

beforeEach(() => { streamChatMock.mockClear(); delete process.env.DEPLOYMENT_MODE; });

describe('POST /engagements/:id/intake/turn', () => {
  it('opens the interview from the letter and what is already known, on the routed default model', async () => {
    const { db } = fakeDb();
    const res = mockRes();
    await (await intakeHandler(db))(req(), res);

    expect(streamChatMock).toHaveBeenCalledTimes(1);
    const opts = streamChatMock.mock.calls[0][0];
    expect(opts.model).toBe('sdk:claude-opus-5');
    expect(opts.thinkingLevel).toBe('think');
    expect(opts.tools).toBeUndefined();
    const system = String(opts.system);
    expect(system).toContain('following the 2025 FSA inspection');
    expect(system).toContain('Transaction Monitoring Review');
    expect(system).toMatch(/still unknown: .*regulatory_supervisors/);
    expect(system).toContain('Online research is NOT authorised');
    const messages = opts.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toMatch(/Start the intake/);
  });

  it('applies the confirmed values to the rows the forms edit and hides the block from the reader', async () => {
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await intakeHandler(db))(req(), res);

    // Client intelligence: no row yet → created, then the confirmed fields set.
    expect(runs.some((r) => /INSERT INTO engagement_client_intelligence/.test(r.sql) && r.params[2] === 'Baltic Bank')).toBe(true);
    const ciUpdate = runs.find((r) => /UPDATE engagement_client_intelligence SET/.test(r.sql));
    expect(ciUpdate).toBeDefined();
    expect(ciUpdate!.sql).toContain('engagement_trigger = ?');
    expect(ciUpdate!.sql).toContain('regulatory_supervisors = ?');
    expect(ciUpdate!.sql).toContain('scale_indicators = ?');
    expect(ciUpdate!.params).toContain('2025 FSA inspection findings');
    expect(ciUpdate!.params).toContain(JSON.stringify(['Finansinspektionen', 'ECB']));

    // Scope: the item already present (case-insensitively) is skipped, the new one is confirmed.
    const scopeInserts = runs.filter((r) => /INSERT INTO engagement_scope_items/.test(r.sql));
    expect(scopeInserts).toHaveLength(1);
    expect(scopeInserts[0].params).toContain('Sanctions screening calibration');
    expect(scopeInserts[0].sql).toContain("'confirmed'");

    // Boundaries: only the supported types are written.
    const boundaryInserts = runs.filter((r) => /INSERT INTO engagement_boundaries/.test(r.sql));
    expect(boundaryInserts).toHaveLength(1);
    expect(boundaryInserts[0].params).toContain('exclusion');
    expect(boundaryInserts[0].params).toContain('Retail lending is out of scope');

    // The conversation is persisted without the machine block.
    const convo = runs.find((r) => /UPDATE engagements SET intake_conversation/.test(r.sql));
    expect(convo).toBeDefined();
    const turns = JSON.parse(String(convo!.params[0])) as Array<{ role: string; content: string }>;
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe('assistant');
    expect(turns[0].content).toBe(REPLY_VISIBLE);
    expect(turns[0].content).not.toContain('intake_update');

    // The browser is told what was saved.
    const update = res.frames.map((f) => f.replace(/^data: /, '').trim()).filter(Boolean).map((f) => JSON.parse(f) as { type: string; applied?: Record<string, unknown> })
      .find((f) => f.type === 'intake_update');
    expect(update?.applied).toEqual({ client_intelligence: 3, scope_items: 1, boundaries: 1, done: false });
  });

  it('continues the stored conversation, merges arrays into the existing row, and searches when research is authorised', async () => {
    const stored = JSON.stringify([
      { role: 'user', content: 'Start' },
      { role: 'assistant', content: 'Which supervisors are involved?' },
    ]);
    const { db, runs } = fakeDb({
      conversation: stored,
      intel: { id: 'ci-1', engagement_id: 'eng-1', client_name: 'Baltic Bank', regulatory_supervisors: '["Finansinspektionen"]', online_research_authorised: 1, products_in_scope: '[]' },
    });
    const res = mockRes();
    await (await intakeHandler(db))(req({ body: { message: 'FI and the ECB. The trigger was the 2025 inspection.' } }), res);

    const opts = streamChatMock.mock.calls[0][0];
    const messages = opts.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(3);
    expect(messages[2]).toEqual({ role: 'user', content: 'FI and the ECB. The trigger was the 2025 inspection.' });
    expect(opts.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search' }]);
    expect(String(opts.system)).toContain('Online research is AUTHORISED');
    expect(String(opts.system)).toContain('- regulatory_supervisors: ["Finansinspektionen"]');

    expect(runs.some((r) => /INSERT INTO engagement_client_intelligence/.test(r.sql))).toBe(false);
    const ciUpdate = runs.find((r) => /UPDATE engagement_client_intelligence SET/.test(r.sql));
    expect(ciUpdate!.params).toContain(JSON.stringify(['Finansinspektionen', 'ECB']));

    const convo = runs.find((r) => /UPDATE engagements SET intake_conversation/.test(r.sql));
    const turns = JSON.parse(String(convo!.params[0])) as Array<{ role: string }>;
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('reports an engine failure as a stream error frame instead of a hung request', async () => {
    streamChatMock.mockImplementationOnce(async () => { throw new Error('SDK engine busy'); });
    const { db, runs } = fakeDb();
    const res = mockRes();
    await (await intakeHandler(db))(req(), res);

    expect(res.frames.some((f) => /"type":"error"/.test(f))).toBe(true);
    expect(runs.some((r) => /UPDATE engagements SET intake_conversation/.test(r.sql))).toBe(false);
  });
});
