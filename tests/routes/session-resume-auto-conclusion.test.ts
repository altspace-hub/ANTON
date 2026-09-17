/**
 * session-resume-auto-conclusion.test.ts — POST /sessions/:id/snapshots/auto
 * concludes through the one writer (Wave 4b, track 3).
 *
 * The route used to run a heuristic nobody called (the first 300 chars of the
 * last answer). It now hands the session's latest assistant message to
 * writeSessionConclusion — the same writer that runs after every answer — and
 * returns the latest snapshot row after the call.
 *
 * No database: a fake adapter answers the three SELECTs the route makes and
 * the ownership gate's existence check; session-conclusion is mocked so the
 * assertion is on WHAT the route asks the writer to conclude, not on an LLM.
 * The router is mounted in a real express app so the router.param ownership
 * gate is on the path too.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const { writeSessionConclusion } = vi.hoisted(() => ({ writeSessionConclusion: vi.fn() }));
vi.mock('../../server/services/session-conclusion.js', () => ({ writeSessionConclusion }));

import { createSessionResumeRoutes } from '../../server/routes/session-resume.js';

interface MessageRow { id: string; role: string; content: string; created_at: string }

interface FakeState {
  sessions: Record<string, { module_id: string | null }>;
  /** Newest-first per session, as the route's ORDER BY … DESC would return. */
  messages: Record<string, MessageRow[]>;
  latestSnapshot: Record<string, Record<string, unknown> | undefined>;
}

function makeFakeDb(state: FakeState): { db: DatabaseAdapter; gets: string[] } {
  const gets: string[] = [];
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      gets.push(sql);
      const sessionId = String(params[0]);
      // Ownership gate (assertOwned, solo mode): does the session exist?
      if (/SELECT 1 AS ok FROM sessions/.test(sql)) {
        return (state.sessions[sessionId] ? { ok: 1 } : undefined) as T | undefined;
      }
      if (/FROM messages/.test(sql)) {
        expect(sql).toMatch(/role = 'assistant'/);
        expect(sql).toMatch(/ORDER BY created_at DESC/);
        const newest = (state.messages[sessionId] ?? []).find((m) => m.role === 'assistant');
        return (newest ? { id: newest.id, content: newest.content } : undefined) as T | undefined;
      }
      if (/SELECT module_id FROM sessions/.test(sql)) {
        return state.sessions[sessionId] as T | undefined;
      }
      if (/FROM session_snapshots/.test(sql)) {
        expect(sql).toMatch(/ORDER BY created_at DESC/);
        return state.latestSnapshot[sessionId] as T | undefined;
      }
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 }; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, gets };
}

const LONG_ANSWER = 'The beneficial-ownership threshold under AMLR is 25% or more of shares or voting rights. '.repeat(4);

const SNAPSHOT_ROW = {
  id: 'snap-1',
  session_id: 'sess-1',
  snapshot_type: 'auto',
  title: 'AMLR threshold review',
  summary: 'The threshold is 25% or more; the register must be refiled.',
  key_decisions: JSON.stringify(['Apply the 25% threshold']),
  open_questions: JSON.stringify(['Trust in scope?']),
  next_steps: JSON.stringify(['Draft the memo']),
  context_state: '{}',
  token_count: 0,
  user_id: 'default',
  message_id: 'a2',
  created_at: '2026-09-17T09:00:00Z',
};

const state: FakeState = { sessions: {}, messages: {}, latestSnapshot: {} };

let server: import('http').Server;
let base = '';
let originalMode: string | undefined;

beforeAll(async () => {
  originalMode = process.env.DEPLOYMENT_MODE;
  delete process.env.DEPLOYMENT_MODE;   // solo: the gate only checks the row exists
  const { db } = makeFakeDb(state);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string; role: string } }).user = { id: 'solo', role: 'admin' };
    next();
  });
  app.use('/api', await createSessionResumeRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('No server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = originalMode;
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

beforeEach(() => {
  writeSessionConclusion.mockReset();
  state.sessions = { 'sess-1': { module_id: 'amlr-bo-check' } };
  state.messages = {};
  state.latestSnapshot = {};
});

async function post(sessionId: string) {
  return fetch(`${base}/api/sessions/${sessionId}/snapshots/auto`, { method: 'POST' });
}

describe('POST /sessions/:sessionId/snapshots/auto', () => {
  it('404s a session with no assistant message, without calling the writer', async () => {
    state.messages['sess-1'] = [{ id: 'u1', role: 'user', content: 'Hello?', created_at: '2026-09-17T08:00:00Z' }];
    const res = await post('sess-1');
    expect(res.status).toBe(404);
    expect(writeSessionConclusion).not.toHaveBeenCalled();
  });

  it('404s a session that does not exist — the ownership gate is on this route too', async () => {
    const res = await post('sess-unknown');
    expect(res.status).toBe(404);
    expect(writeSessionConclusion).not.toHaveBeenCalled();
  });

  it('hands the LATEST assistant message (id + text) to writeSessionConclusion and returns the new snapshot', async () => {
    state.messages['sess-1'] = [
      { id: 'u3', role: 'user', content: 'And the register?', created_at: '2026-09-17T08:03:00Z' },
      { id: 'a2', role: 'assistant', content: LONG_ANSWER, created_at: '2026-09-17T08:02:00Z' },
      { id: 'u2', role: 'user', content: 'What threshold?', created_at: '2026-09-17T08:01:00Z' },
      { id: 'a1', role: 'assistant', content: 'An earlier, shorter answer.', created_at: '2026-09-17T08:00:30Z' },
    ];
    writeSessionConclusion.mockImplementation(async () => {
      state.latestSnapshot['sess-1'] = SNAPSHOT_ROW;
      return { written: true, snapshotId: 'snap-1' };
    });

    const res = await post('sess-1');
    expect(res.status).toBe(200);

    expect(writeSessionConclusion).toHaveBeenCalledTimes(1);
    const [, input] = writeSessionConclusion.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input.sessionId).toBe('sess-1');
    expect(input.messageId).toBe('a2');
    expect(input.assistantText).toBe(LONG_ANSWER);
    expect(input.userId).toBe('solo');
    expect(input.moduleId).toBe('amlr-bo-check');

    const body = await res.json() as { written: boolean; reason: string | null; snapshot: Record<string, unknown> | null };
    expect(body.written).toBe(true);
    expect(body.reason).toBeNull();
    expect(body.snapshot).toMatchObject({
      id: 'snap-1',
      session_id: 'sess-1',
      title: 'AMLR threshold review',
      summary: 'The threshold is 25% or more; the register must be refiled.',
      message_id: 'a2',
      key_decisions: ['Apply the 25% threshold'],
      open_questions: ['Trust in scope?'],
      next_steps: ['Draft the memo'],
    });
  });

  it('a refused write still answers 200 with the reason and the running conclusion', async () => {
    state.messages['sess-1'] = [{ id: 'a2', role: 'assistant', content: LONG_ANSWER, created_at: '2026-09-17T08:02:00Z' }];
    state.latestSnapshot['sess-1'] = SNAPSHOT_ROW;
    writeSessionConclusion.mockResolvedValue({ written: false, reason: 'already written', snapshotId: 'snap-1' });

    const res = await post('sess-1');
    expect(res.status).toBe(200);
    const body = await res.json() as { written: boolean; reason: string | null; snapshot: { id: string } | null };
    expect(body.written).toBe(false);
    expect(body.reason).toBe('already written');
    expect(body.snapshot?.id).toBe('snap-1');
  });

  it('a refused write with no conclusion yet returns snapshot null, not 404', async () => {
    state.messages['sess-1'] = [{ id: 'a9', role: 'assistant', content: 'Short.', created_at: '2026-09-17T08:02:00Z' }];
    writeSessionConclusion.mockResolvedValue({ written: false, reason: 'too short' });

    const res = await post('sess-1');
    expect(res.status).toBe(200);
    const body = await res.json() as { written: boolean; reason: string | null; snapshot: unknown };
    expect(body).toEqual({ written: false, reason: 'too short', snapshot: null });
    const [, input] = writeSessionConclusion.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input.messageId).toBe('a9');
    expect(input.assistantText).toBe('Short.');
  });
});
