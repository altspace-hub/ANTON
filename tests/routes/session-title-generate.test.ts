/**
 * session-title-generate.test.ts — the session title is a small background
 * utility call on the server, not a module-run turn from the browser.
 *
 * Before: useClaude streamed a title request through /claude/message — every
 * knowledge layer assembled, an interactive engine slot taken right after the
 * first answer (the subscription engine has two), and a prompt that called
 * every chat an "FCP compliance consultation". The follow-up the user typed in
 * that window bounced with "SDK engine busy".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';

const callChatMock = vi.fn(async (_opts: Record<string, unknown>) => ({ text: '"Kickoff agenda for the Q4 review."\n', thinking: '', inputTokens: 1, outputTokens: 1 }));
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: (opts: Record<string, unknown>) => callChatMock(opts),
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => 'sdk:claude-sonnet-5',
}));

import { createSessionRoutes } from '../../server/routes/sessions.js';

type Handler = (req: unknown, res: unknown) => Promise<void>;

/** Pull one route handler out of the Express router without listening on a port. */
async function titleHandler(db: DatabaseAdapter): Promise<Handler> {
  const router = await createSessionRoutes(db);
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === '/sessions/:id/title/generate' && l.route.methods.post);
  if (!layer?.route) throw new Error('route not mounted');
  return layer.route.stack[0].handle;
}

function mockRes() {
  const res: { statusCode: number; body: unknown; status: (c: number) => typeof res; json: (b: unknown) => typeof res } = {
    statusCode: 200,
    body: undefined,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res;
}

function fakeDb(sessionRow: { id: string } | undefined) {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    dialect: 'postgresql',
    get: vi.fn(async () => sessionRow),
    all: vi.fn(async () => []),
    run: vi.fn(async (sql: string, ...params: unknown[]) => { runs.push({ sql, params }); return { changes: 1, lastInsertRowid: 0 }; }),
    exec: vi.fn(async () => undefined),
    transaction: vi.fn(async (fn: (d: unknown) => unknown) => fn(db)),
    close: vi.fn(async () => undefined),
  } as unknown as DatabaseAdapter;
  return { db, runs };
}

const req = (over: Record<string, unknown> = {}) => ({
  params: { id: 'sess-1' },
  body: { userMessage: 'Draft a kickoff agenda for the Q4 review', responsePreview: 'Here is an agenda…' },
  user: { id: 'alice', role: 'user' },
  ...over,
});

beforeEach(() => { callChatMock.mockClear(); });

describe('POST /sessions/:id/title/generate', () => {
  it('runs a background utility call and writes the cleaned title', async () => {
    const { db, runs } = fakeDb({ id: 'sess-1' });
    const res = mockRes();
    await (await titleHandler(db))(req(), res);

    expect(callChatMock).toHaveBeenCalledTimes(1);
    const opts = callChatMock.mock.calls[0][0];
    expect(opts.background).toBe(true);
    expect(opts.model).toBe('sdk:claude-sonnet-5');
    expect(String(opts.system)).not.toMatch(/FCP|compliance/i);
    expect(res.body).toEqual({ title: 'Kickoff agenda for the Q4 review' });
    expect(runs.some((r) => /UPDATE sessions SET title/.test(r.sql) && r.params[0] === 'Kickoff agenda for the Q4 review')).toBe(true);
  });

  it('is scoped to the caller\'s own session (404, no engine call)', async () => {
    const { db } = fakeDb(undefined);
    const res = mockRes();
    await (await titleHandler(db))(req(), res);
    expect(res.statusCode).toBe(404);
    expect(callChatMock).not.toHaveBeenCalled();
  });

  it('degrades to a null title when the engine is busy — never an error to the caller', async () => {
    callChatMock.mockRejectedValueOnce(new Error('SDK engine busy'));
    const { db, runs } = fakeDb({ id: 'sess-1' });
    const res = mockRes();
    await (await titleHandler(db))(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ title: null });
    expect(runs.some((r) => /UPDATE sessions SET title/.test(r.sql))).toBe(false);
  });

  it('rejects an empty request without touching the engine', async () => {
    const { db } = fakeDb({ id: 'sess-1' });
    const res = mockRes();
    await (await titleHandler(db))(req({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(callChatMock).not.toHaveBeenCalled();
  });
});
