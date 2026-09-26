/**
 * session-title-in-flight.test.ts — review L1 (2026-09-25).
 *
 * POST /api/sessions/:id/title/generate is a priced model call on a compat
 * default and sits behind no model-call limiter. One account could fire
 * hundreds of them at once; each passed the daily spend cap at the same
 * settled total. Now one title generation per user is in flight at a time (the
 * page asks once, after a session's first answer); a second answers 429 with
 * a null title, which the page already treats as "keep the first-line title".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';

let release: () => void = () => undefined;
const callChatMock = vi.fn(async (_opts: Record<string, unknown>) => {
  await new Promise<void>((resolve) => { release = resolve; });
  return { text: 'Quarterly review kickoff agenda', thinking: '', inputTokens: 1, outputTokens: 1 };
});
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: (opts: Record<string, unknown>) => callChatMock(opts),
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => 'compat:openrouter:z-ai/glm-5.3-flash',
}));

import { createSessionRoutes } from '../../server/routes/sessions.js';

type Handler = (req: unknown, res: unknown) => Promise<void>;

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

const db = {
  dialect: 'postgresql',
  get: vi.fn(async () => ({ id: 'sess-1' })),
  all: vi.fn(async () => []),
  run: vi.fn(async () => ({ changes: 1, lastInsertRowid: 0 })),
} as unknown as DatabaseAdapter;

const req = (userId: string) => ({
  params: { id: 'sess-1' },
  body: { userMessage: 'Draft a kickoff agenda for the Q4 review', responsePreview: 'Here is an agenda…' },
  user: { id: userId, role: 'analyst' },
});

beforeEach(() => { callChatMock.mockClear(); });

describe('title generation in flight per user', () => {
  it('refuses a second one while the first is running, without a model call', async () => {
    const handler = await titleHandler(db);
    const first = mockRes();
    const running = handler(req('visitor'), first);
    await vi.waitFor(() => expect(callChatMock).toHaveBeenCalledTimes(1));

    const second = mockRes();
    await handler(req('visitor'), second);
    expect(second.statusCode).toBe(429);
    expect(second.body).toMatchObject({ title: null });
    expect(callChatMock).toHaveBeenCalledTimes(1);

    release();
    await running;
    expect(first.body).toEqual({ title: 'Quarterly review kickoff agenda' });

    // Once the first has finished, the next one runs.
    const third = mockRes();
    const again = handler(req('visitor'), third);
    await vi.waitFor(() => expect(callChatMock).toHaveBeenCalledTimes(2));
    release();
    await again;
    expect(third.statusCode).toBe(200);
  });

  it('negative control: another user is not held up by someone else\'s title', async () => {
    const handler = await titleHandler(db);
    const a = mockRes();
    const runningA = handler(req('alice'), a);
    await vi.waitFor(() => expect(callChatMock).toHaveBeenCalledTimes(1));
    const releaseA = release;

    const b = mockRes();
    const runningB = handler(req('bob'), b);
    await vi.waitFor(() => expect(callChatMock).toHaveBeenCalledTimes(2));
    release();
    releaseA();
    await Promise.all([runningA, runningB]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
  });

  it('frees the slot when the model call fails', async () => {
    const handler = await titleHandler(db);
    callChatMock.mockRejectedValueOnce(new Error('upstream down'));
    const failed = mockRes();
    await handler(req('carol'), failed);
    expect(failed.body).toEqual({ title: null });

    const next = mockRes();
    const running = handler(req('carol'), next);
    await vi.waitFor(() => expect(callChatMock).toHaveBeenCalledTimes(2));
    release();
    await running;
    expect(next.statusCode).toBe(200);
  });
});
