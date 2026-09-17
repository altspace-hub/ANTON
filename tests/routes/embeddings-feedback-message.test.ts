/**
 * embeddings-feedback-message.test.ts — GET /api/embeddings/feedback/:sessionId
 * narrows to one answer with ?messageId= (Wave 4: retrieval_feedback.message_id).
 *
 * Against a fake adapter that answers the route's own statement by SQL shape
 * (no database): without a messageId the whole session comes back, each row
 * carrying its message_id; with one, only that answer's atoms; an unknown id
 * is an empty list, not an error. The negative control at the end proves the
 * filter is the SQL and not the fake.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createEmbeddingRoutes } from '../../server/routes/embeddings.js';

const SESSION = 'sess-1';
const OTHER_SESSION = 'sess-2';

interface FeedbackRow {
  session_id: string; atom_id: string; retrieval_method: string; retrieval_score: number;
  injected_at: string; was_relevant: number | null; message_id: string | null;
}

const ROWS: FeedbackRow[] = [
  { session_id: SESSION, atom_id: 'atom-a', retrieval_method: 'hybrid', retrieval_score: 0.61, injected_at: '2026-09-17T09:00:00Z', was_relevant: null, message_id: 'msg-1' },
  { session_id: SESSION, atom_id: 'atom-b', retrieval_method: 'hybrid', retrieval_score: 0.42, injected_at: '2026-09-17T09:00:00Z', was_relevant: 1, message_id: 'msg-1' },
  { session_id: SESSION, atom_id: 'atom-c', retrieval_method: 'sql_fallback', retrieval_score: 0.9, injected_at: '2026-09-17T10:00:00Z', was_relevant: null, message_id: 'msg-2' },
  { session_id: SESSION, atom_id: 'atom-old', retrieval_method: 'hybrid', retrieval_score: 0.3, injected_at: '2026-05-01T10:00:00Z', was_relevant: null, message_id: null },
  { session_id: OTHER_SESSION, atom_id: 'atom-x', retrieval_method: 'hybrid', retrieval_score: 0.8, injected_at: '2026-09-17T10:00:00Z', was_relevant: null, message_id: 'msg-1' },
];

const state = { calls: [] as Array<{ sql: string; params: unknown[] }> };

function makeFakeDb(): DatabaseAdapter {
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string): Promise<T | undefined> {
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      state.calls.push({ sql, params });
      if (!/FROM retrieval_feedback rf/.test(sql)) throw new Error(`fake db: unexpected all(): ${sql.slice(0, 80)}`);
      const bySession = /rf\.session_id = \?/.test(sql);
      const byMessage = /rf\.message_id = \?/.test(sql);
      if (!bySession) throw new Error('the statement must filter on the session');
      const [sessionId, messageId] = params as [string, string | undefined];
      const rows = ROWS
        .filter((r) => r.session_id === sessionId && (!byMessage || r.message_id === messageId))
        .sort((a, b) => b.retrieval_score - a.retrieval_score)
        .map((r) => ({ ...r, content: `content of ${r.atom_id}`, atom_type: 'insight', category: 'observation', confidence: 0.8 }));
      return rows as T[];
    },
    async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 }; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return db;
}

interface Body { sessionId: string; messageId: string | null; injectedAtoms: Array<{ atom_id: string; message_id: string | null }>; total: number }

describe('GET /api/embeddings/feedback/:sessionId?messageId=', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/embeddings', await createEmbeddingRoutes(makeFakeDb()));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  async function get(path: string): Promise<{ status: number; json: Body }> {
    const res = await fetch(`${base}${path}`);
    return { status: res.status, json: (await res.json()) as Body };
  }

  it('without a messageId returns the whole session, each row carrying its message_id', async () => {
    const { status, json } = await get(`/api/embeddings/feedback/${SESSION}`);
    expect(status).toBe(200);
    expect(json.messageId).toBeNull();
    expect(json.total).toBe(4);
    expect(json.injectedAtoms.map((r) => r.atom_id)).toEqual(['atom-c', 'atom-a', 'atom-b', 'atom-old']);
    expect(json.injectedAtoms.map((r) => r.message_id)).toEqual(['msg-2', 'msg-1', 'msg-1', null]);
  });

  it('with a messageId returns only the atoms injected into that answer', async () => {
    const { status, json } = await get(`/api/embeddings/feedback/${SESSION}?messageId=msg-1`);
    expect(status).toBe(200);
    expect(json.messageId).toBe('msg-1');
    expect(json.total).toBe(2);
    expect(json.injectedAtoms.map((r) => r.atom_id)).toEqual(['atom-a', 'atom-b']);
    // The filter is in the statement, bound as a parameter.
    const last = state.calls[state.calls.length - 1];
    expect(last.sql).toMatch(/rf\.session_id = \? AND rf\.message_id = \?/);
    expect(last.params).toEqual([SESSION, 'msg-1']);
  });

  it('an answer nobody injected into is an empty list, not an error', async () => {
    const { status, json } = await get(`/api/embeddings/feedback/${SESSION}?messageId=msg-none`);
    expect(status).toBe(200);
    expect(json.injectedAtoms).toEqual([]);
    expect(json.total).toBe(0);
  });

  it('a blank messageId is ignored (same as none)', async () => {
    const { json } = await get(`/api/embeddings/feedback/${SESSION}?messageId=%20`);
    expect(json.messageId).toBeNull();
    expect(json.total).toBe(4);
  });

  it("another session's rows for the same message id never come back", async () => {
    const { json } = await get(`/api/embeddings/feedback/${OTHER_SESSION}?messageId=msg-1`);
    expect(json.injectedAtoms.map((r) => r.atom_id)).toEqual(['atom-x']);
  });

  it('negative control: the unfiltered statement carries no message predicate', async () => {
    await get(`/api/embeddings/feedback/${SESSION}`);
    const last = state.calls[state.calls.length - 1];
    expect(last.sql).not.toMatch(/rf\.message_id = \?/);
    expect(last.params).toEqual([SESSION]);
  });
});
