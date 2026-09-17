/**
 * legal-research-matter.test.ts — a Counsel's Desk session is about a matter:
 * ANTON takes instructions at intake, documents can be attached, and every
 * research turn works from both.
 *
 * Before: a session opened on a blank textarea, with no way to attach the
 * contract the question was about, and answered on a hard-coded Claude-4
 * API id whatever model the user had chosen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';

const INTAKE_VISIBLE = 'The SPA names Baltic Holdings as buyer and Orion AB as seller, governed by Swedish law. Two questions: what has the seller disclosed about the FSA inspection, and by when does the client need to decide on the warranty claim?';
const INTAKE_BLOCK = `<matter_update>
{"matter": {"parties": "Baltic Holdings (buyer) v Orion AB (seller)", "jurisdiction": "Swedish law; SCC arbitration", "instruments": "SPA dated 2025-03-01", "facts": ""},
 "suggested_mode": "opinion", "suggested_role": "ma-counsel", "done": false}
</matter_update>`;

let replyText = `${INTAKE_VISIBLE}\n\n${INTAKE_BLOCK}`;
const streamChatMock = vi.fn(async (opts: Record<string, unknown>, res: { write: (s: string) => void }) => {
  res.write(`data: ${JSON.stringify({ type: 'text_delta', content: replyText })}\n\n`);
  return { text: replyText, thinking: '', inputTokens: 1, outputTokens: 1, model: String(opts.model) };
});
vi.mock('../../server/services/provider-router.js', () => ({
  streamChat: (opts: Record<string, unknown>, res: { write: (s: string) => void }) => streamChatMock(opts, res),
  callChat: vi.fn(),
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/default-model-store.js', () => ({
  getEffectiveDefaultModel: () => 'sdk:claude-opus-5',
}));
vi.mock('../../server/services/claude-engine-availability.js', () => ({
  hasClaudeEngine: () => true,
  NO_CLAUDE_ENGINE_MESSAGE: 'no engine',
}));
vi.mock('../../server/services/prompt-builder.js', () => ({
  buildOrgContextLayer: async () => '',
}));
vi.mock('../../server/services/framework-text-retrieval.js', () => ({
  retrieveGroundingText: async () => null,
}));

import { createLegalResearchRoutes } from '../../server/routes/legal-research.js';

type Handler = (req: unknown, res: unknown) => Promise<void>;

async function handler(db: DatabaseAdapter, path: string, method: 'post' | 'patch'): Promise<Handler> {
  const router = await createLegalResearchRoutes(db);
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`route not mounted: ${method} ${path}`);
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
  res.frames.map((f) => f.replace(/^data: /, '').trim()).filter((f) => f && f !== '[DONE]').map((f) => JSON.parse(f) as { type: string; applied?: Record<string, unknown> });

function fakeDb(sessionOver: Record<string, unknown> = {}) {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const session = {
    id: 'ls-1', user_id: 'alice', title: 'Orion SPA warranty claim', mode: 'deep-dive', expert_role: 'eu-regulatory-lawyer',
    research_questions: '[]', pinned_findings: '[]', citations: '[]', active_knowledge_packs: '[]',
    documents: '[]', matter_brief: '{}', intake_conversation: '[]',
    ...sessionOver,
  };
  const db = {
    dialect: 'postgresql',
    get: vi.fn(async (sql: string) => (/FROM legal_research_sessions/.test(sql) ? session : undefined)),
    all: vi.fn(async () => []),
    run: vi.fn(async (sql: string, ...params: unknown[]) => { runs.push({ sql, params }); return { changes: 1, lastInsertRowid: 0 }; }),
    exec: vi.fn(async () => undefined),
    transaction: vi.fn(async (fn: (d: unknown) => unknown) => fn(db)),
    close: vi.fn(async () => undefined),
  } as unknown as DatabaseAdapter;
  return { db, runs };
}

const req = (body: Record<string, unknown>) => ({ params: { id: 'ls-1' }, body, user: { id: 'alice', role: 'admin' } });

beforeEach(() => { streamChatMock.mockClear(); replyText = `${INTAKE_VISIBLE}\n\n${INTAKE_BLOCK}`; });

describe('POST /legal-research/:id/intake/turn', () => {
  it('takes instructions from the attached documents on the routed default model', async () => {
    const { db } = fakeDb({
      documents: JSON.stringify([{ id: 'f1', name: 'SPA 2025-03-01.pdf', text: 'SHARE PURCHASE AGREEMENT between Baltic Holdings and Orion AB…' }]),
    });
    const res = mockRes();
    await (await handler(db, '/legal-research/:id/intake/turn', 'post'))(req({ message: '' }), res);

    const opts = streamChatMock.mock.calls[0][0];
    expect(opts.model).toBe('sdk:claude-opus-5');
    expect(opts.thinkingLevel).toBe('think');
    const system = String(opts.system);
    expect(system).toContain('SHARE PURCHASE AGREEMENT between Baltic Holdings');
    expect(system).toContain('still unknown: client, parties, facts');
    expect(system).toMatch(/opinion = Legal Opinion Draft/);
    const messages = opts.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toMatch(/Take instructions/);
  });

  it('merges the confirmed fields into the brief, keeps the conversation, and relays the suggestions', async () => {
    const { db, runs } = fakeDb({ matter_brief: JSON.stringify({ client: 'Baltic Holdings' }) });
    const res = mockRes();
    await (await handler(db, '/legal-research/:id/intake/turn', 'post'))(req({ message: 'It is an SPA warranty claim.' }), res);

    const update = runs.find((r) => /UPDATE legal_research_sessions SET matter_brief/.test(r.sql));
    expect(update).toBeDefined();
    const brief = JSON.parse(String(update!.params[0])) as Record<string, string>;
    // Existing field kept, three new ones added, the empty one ignored.
    expect(brief).toEqual({
      client: 'Baltic Holdings',
      parties: 'Baltic Holdings (buyer) v Orion AB (seller)',
      jurisdiction: 'Swedish law; SCC arbitration',
      instruments: 'SPA dated 2025-03-01',
    });
    const convo = JSON.parse(String(update!.params[1])) as Array<{ role: string; content: string }>;
    expect(convo.map((t) => t.role)).toEqual(['user', 'assistant']);
    expect(convo[1].content).toBe(INTAKE_VISIBLE);
    expect(convo[1].content).not.toContain('matter_update');

    const frame = frames(res).find((f) => f.type === 'matter_update');
    expect(frame?.applied).toEqual({ fields: 3, done: false, suggested_mode: 'opinion', suggested_role: 'ma-counsel' });
  });

  it('drops a suggestion that is not a real mode or role', async () => {
    replyText = 'Noted.\n<matter_update>{"matter": {}, "suggested_mode": "made-up", "suggested_role": "deep-dive", "done": true}</matter_update>';
    const { db } = fakeDb();
    const res = mockRes();
    await (await handler(db, '/legal-research/:id/intake/turn', 'post'))(req({ message: 'ok' }), res);
    const frame = frames(res).find((f) => f.type === 'matter_update');
    expect(frame?.applied).toEqual({ fields: 0, done: true, suggested_mode: null, suggested_role: null });
  });
});

describe('POST /legal-research/:id/message with a matter', () => {
  it('injects the brief and the attached documents, on the routed default model', async () => {
    replyText = 'Under clause 9.2 of the SPA…';
    const { db } = fakeDb({
      matter_brief: JSON.stringify({ parties: 'Baltic Holdings v Orion AB', question: 'Is the warranty claim time-barred?' }),
      documents: JSON.stringify([
        { id: 'f1', name: 'SPA 2025-03-01.pdf', text: 'Clause 9.2: claims must be notified within 18 months of Completion.' },
        { id: 'f2', name: 'Disclosure letter.docx', text: '' },
      ]),
    });
    const res = mockRes();
    await (await handler(db, '/legal-research/:id/message', 'post'))(req({ messages: [{ role: 'user', content: 'Is the claim time-barred?' }] }), res);

    const opts = streamChatMock.mock.calls[0][0];
    expect(opts.model).toBe('sdk:claude-opus-5');
    const system = String(opts.system);
    expect(system).toContain('## THE MATTER');
    expect(system).toContain('- Parties: Baltic Holdings v Orion AB');
    expect(system).toContain('- The question: Is the warranty claim time-barred?');
    expect(system).toContain('## MATTER DOCUMENTS (2)');
    expect(system).toContain('### DOCUMENT: SPA 2025-03-01.pdf\nClause 9.2');
    expect(system).toContain('### DOCUMENT: Disclosure letter.docx');
  });

  it('says nothing about a matter when none was taken', async () => {
    replyText = 'In general…';
    const { db } = fakeDb();
    const res = mockRes();
    await (await handler(db, '/legal-research/:id/message', 'post'))(req({ messages: [{ role: 'user', content: 'What is AMLR Art. 20?' }] }), res);
    const system = String(streamChatMock.mock.calls[0][0].system);
    expect(system).not.toContain('## THE MATTER');
    expect(system).not.toContain('## MATTER DOCUMENTS');
  });
});

describe('PATCH /legal-research/:id documents', () => {
  it('stores a bounded, typed document list and rejects a malformed one', async () => {
    const { db, runs } = fakeDb();
    const patch = await handler(db, '/legal-research/:id', 'patch');

    const ok = mockRes();
    await patch(req({ documents: [{ id: 'f1', name: ' SPA.pdf ', text: 'x'.repeat(400_000), extra: 'ignored' }] }), ok);
    const update = runs.find((r) => /UPDATE legal_research_sessions SET documents/.test(r.sql));
    expect(update).toBeDefined();
    const stored = JSON.parse(String(update!.params[0])) as Array<{ id: string; name: string; text: string }>;
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('SPA.pdf');
    expect(stored[0].text).toHaveLength(300_000);
    expect(Object.keys(stored[0])).toEqual(['id', 'name', 'text']);

    const bad = mockRes();
    await patch(req({ documents: [{ name: 'no id' }] }), bad);
    expect(bad.statusCode).toBe(400);
  });
});
