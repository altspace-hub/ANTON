/**
 * human-oversight-binding.test.ts — a sign-off is bound to the run it reviewed
 * (Wave 3, POST /api/oversight/reviews).
 *
 * What the route must do, against a fake adapter that answers the route's own
 * statements by SQL shape (no database):
 *
 *   - refuse (400) a sign-off with no messageId, or whose messageId is not an
 *     assistant message of that session — nothing is inserted;
 *   - compute output_sha256 from the STORED message content and take
 *     prompt_sha256 from run_artifacts, ignoring any hash the client sends;
 *   - store both with the review, and stamp the run's audit_log row
 *     (review_status='reviewed', reviewed_by=<user>) through the message-bound
 *     heuristic — best effort, so an audit failure does not lose the sign-off;
 *   - record a null prompt hash (not a refusal) for an answer with no run record.
 *
 * The negative control at the end proves the fake is reached: the same request
 * against a fake that returns no message must 400.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createHumanOversightRoutes, OVERSIGHT_SQL } from '../../server/routes/human-oversight.js';

const SESSION = 'sess-1';
const OTHER_SESSION = 'sess-2';
const ASSISTANT_MSG = 'msg-assistant-1';
const USER_MSG = 'msg-user-1';
const OTHER_SESSION_MSG = 'msg-assistant-other';
const NO_ARTIFACT_MSG = 'msg-assistant-no-artifact';
const CONTENT = '# Gap analysis\n\nArticle 16 BWRA: partially compliant.';
const PROMPT_SHA = 'p'.repeat(64);
const EXPECTED_OUTPUT_SHA = createHash('sha256').update(CONTENT, 'utf8').digest('hex');

interface FakeState {
  inserts: unknown[][];
  insertSql: string[];
  auditUpdates: unknown[][];
  auditUpdateSql: string[];
  reviews: Map<number, Record<string, unknown>>;
  /** When true, every UPDATE audit_log throws (simulates a missing column / DB error). */
  auditThrows: boolean;
  /** Which message ids the fake treats as assistant messages of SESSION. */
  messages: Record<string, { session_id: string; role: 'user' | 'assistant'; content: string }>;
  artifacts: Record<string, string>;
}

function makeFakeDb(): { db: DatabaseAdapter; state: FakeState } {
  const state: FakeState = {
    inserts: [], insertSql: [], auditUpdates: [], auditUpdateSql: [], reviews: new Map(), auditThrows: false,
    messages: {
      [ASSISTANT_MSG]: { session_id: SESSION, role: 'assistant', content: CONTENT },
      [USER_MSG]: { session_id: SESSION, role: 'user', content: 'please assess' },
      [OTHER_SESSION_MSG]: { session_id: OTHER_SESSION, role: 'assistant', content: 'other' },
      [NO_ARTIFACT_MSG]: { session_id: SESSION, role: 'assistant', content: 'older answer' },
    },
    artifacts: { [ASSISTANT_MSG]: PROMPT_SHA, [OTHER_SESSION_MSG]: 'o'.repeat(64) },
  };
  let nextId = 1;
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.startsWith(OVERSIGHT_SQL.assistantMessage)) {
        // The real statement: message must exist, belong to the session, and be an assistant message.
        const [messageId, sessionId] = params as [string, string];
        const m = state.messages[messageId];
        if (!m || m.session_id !== sessionId || m.role !== 'assistant') return undefined;
        return { id: messageId, content: m.content, created_at: new Date('2026-09-16T10:00:00Z') } as T;
      }
      if (sql === OVERSIGHT_SQL.runArtifactHash) {
        const sha = state.artifacts[String(params[0])];
        return sha ? ({ prompt_sha256: sha } as T) : undefined;
      }
      if (sql === OVERSIGHT_SQL.evidencePack) {
        return params[0] === 'EP-20260916-ABC123' ? ({ id: params[0] } as T) : undefined;
      }
      if (sql.includes('FROM human_oversight_reviews WHERE id = ?')) {
        return state.reviews.get(Number(params[0])) as T | undefined;
      }
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (/INSERT INTO human_oversight_reviews/i.test(sql)) {
        state.insertSql.push(sql);
        state.inserts.push(params);
        const id = nextId++;
        const [session_id, module_id, user_id, reviewer_name, reviewer_role, attestation, verdict, notes, export_blocked,
          message_id, prompt_sha256, output_sha256, evidence_pack_id] = params;
        state.reviews.set(id, {
          id, session_id, module_id, user_id, reviewer_name, reviewer_role, attestation, verdict, notes, export_blocked,
          message_id, prompt_sha256, output_sha256, evidence_pack_id, created_at: '2026-09-16T10:05:00Z',
        });
        return { changes: 1, lastInsertRowid: id };
      }
      if (/UPDATE audit_log/i.test(sql)) {
        if (state.auditThrows) throw new Error('column "review_status" does not exist');
        state.auditUpdateSql.push(sql);
        state.auditUpdates.push(params);
        return { changes: 1, lastInsertRowid: 0 };
      }
      throw new Error(`fake db: unexpected run(): ${sql.slice(0, 80)}`);
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, state };
}

const VALID_BODY = {
  session_id: SESSION,
  module_id: 'gap-analysis',
  reviewer_name: 'Ada Reviewer',
  reviewer_role: 'MLRO',
  verdict: 'approved',
  notes: 'Checked against the BWRA.',
  messageId: ASSISTANT_MSG,
};

describe('POST /api/oversight/reviews — sign-off bound to the run', () => {
  let server: Server;
  let base: string;
  let state: FakeState;

  beforeAll(async () => {
    const fake = makeFakeDb();
    state = fake.state;
    const app = express();
    app.use(express.json());
    // Solo mode: no req.user → the route records user 'default'.
    app.use('/api', await createHumanOversightRoutes(fake.db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  beforeEach(() => {
    state.inserts.length = 0;
    state.insertSql.length = 0;
    state.auditUpdates.length = 0;
    state.auditUpdateSql.length = 0;
    state.auditThrows = false;
  });

  async function post(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
    const res = await fetch(`${base}/api/oversight/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  it('stores the server-computed hashes with the review and returns them', async () => {
    const { status, json } = await post(VALID_BODY);
    expect(status).toBe(201);
    const review = json.review as Record<string, unknown>;
    expect(review.message_id).toBe(ASSISTANT_MSG);
    expect(review.prompt_sha256).toBe(PROMPT_SHA);
    expect(review.output_sha256).toBe(EXPECTED_OUTPUT_SHA);
    expect(review.evidence_pack_id).toBeNull();
    expect(review.verdict).toBe('approved');
    expect(review.export_blocked).toBe(0);
    // The attestation names what was signed, not just the session.
    expect(String(review.attestation)).toContain(ASSISTANT_MSG);
    expect(String(review.attestation)).toContain(EXPECTED_OUTPUT_SHA);

    expect(state.inserts).toHaveLength(1);
    expect(state.insertSql[0]).toMatch(/message_id,\s*prompt_sha256,\s*output_sha256,\s*evidence_pack_id/);
    const params = state.inserts[0];
    expect(params.slice(9, 13)).toEqual([ASSISTANT_MSG, PROMPT_SHA, EXPECTED_OUTPUT_SHA, null]);
  });

  it('ignores hashes the client sends — the stored values are the server\'s own', async () => {
    const { status } = await post({
      ...VALID_BODY,
      prompt_sha256: 'f'.repeat(64),
      output_sha256: 'e'.repeat(64),
      promptSha256: 'd'.repeat(64),
      outputSha256: 'c'.repeat(64),
    });
    expect(status).toBe(201);
    const params = state.inserts[0];
    expect(params[10]).toBe(PROMPT_SHA);
    expect(params[11]).toBe(EXPECTED_OUTPUT_SHA);
  });

  it('marks the run\'s audit_log row reviewed by the signing user, through the message-bound heuristic', async () => {
    const { status, json } = await post(VALID_BODY);
    expect(status).toBe(201);
    expect(json.auditRowsMarked).toBe(1);
    expect(state.auditUpdates).toHaveLength(1);
    expect(state.auditUpdates[0]).toEqual(['default', ASSISTANT_MSG]);
    const sql = state.auditUpdateSql[0];
    expect(sql).toMatch(/review_status = 'reviewed'/);
    expect(sql).toMatch(/reviewed_by = \?/);
    expect(sql).toMatch(/reviewed_at = NOW\(\)/);
    // The row is chosen at/after the message and before the next assistant message —
    // the audit row lands AFTER the message (claude.ts inserts the message first).
    expect(sql).toContain(OVERSIGHT_SQL.auditRowForMessage);
    expect(OVERSIGHT_SQL.auditRowForMessage).toMatch(/a\.timestamp >= m\.created_at - interval '5 seconds'/);
    expect(OVERSIGHT_SQL.auditRowForMessage).toMatch(/n\.created_at > m\.created_at/);
    expect(OVERSIGHT_SQL.auditRowForMessage).toMatch(/ORDER BY a\.timestamp ASC/);
  });

  it('keeps the sign-off when the audit stamp fails', async () => {
    state.auditThrows = true;
    const { status, json } = await post(VALID_BODY);
    expect(status).toBe(201);
    expect(json.auditRowsMarked).toBe(0);
    expect(state.inserts).toHaveLength(1);
  });

  it('refuses a sign-off without a messageId', async () => {
    const { messageId: _omit, ...body } = VALID_BODY;
    void _omit;
    const { status, json } = await post(body);
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/messageId is required/);
    expect(state.inserts).toHaveLength(0);
  });

  it('accepts the snake_case spelling of the message id', async () => {
    const { messageId, ...body } = VALID_BODY;
    const { status } = await post({ ...body, message_id: messageId });
    expect(status).toBe(201);
    expect(state.inserts[0][9]).toBe(ASSISTANT_MSG);
  });

  it.each([
    ['a user message of the session', USER_MSG],
    ['an assistant message of another session', OTHER_SESSION_MSG],
    ['an id the server never persisted', 'msg-minted-in-browser'],
  ])('refuses (400) a sign-off on %s and inserts nothing', async (_label, messageId) => {
    const { status, json } = await post({ ...VALID_BODY, messageId });
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/not an assistant message of this session/);
    expect(state.inserts).toHaveLength(0);
    expect(state.auditUpdates).toHaveLength(0);
  });

  it('records a null prompt hash (not a refusal) for an answer with no run record', async () => {
    const { status, json } = await post({ ...VALID_BODY, messageId: NO_ARTIFACT_MSG });
    expect(status).toBe(201);
    const review = json.review as Record<string, unknown>;
    expect(review.prompt_sha256).toBeNull();
    expect(review.output_sha256).toBe(createHash('sha256').update('older answer', 'utf8').digest('hex'));
  });

  it('stores an evidence pack reference only when the pack exists', async () => {
    const ok = await post({ ...VALID_BODY, evidencePackId: 'EP-20260916-ABC123' });
    expect(ok.status).toBe(201);
    expect((ok.json.review as Record<string, unknown>).evidence_pack_id).toBe('EP-20260916-ABC123');

    const bad = await post({ ...VALID_BODY, evidencePackId: 'EP-nope' });
    expect(bad.status).toBe(400);
    expect(String(bad.json.error)).toMatch(/evidencePackId/);
    expect(state.inserts).toHaveLength(1);
  });

  it('a rejected verdict still binds to the run and flags export_blocked', async () => {
    const { status, json } = await post({ ...VALID_BODY, verdict: 'rejected' });
    expect(status).toBe(201);
    const review = json.review as Record<string, unknown>;
    expect(review.export_blocked).toBe(1);
    expect(review.output_sha256).toBe(EXPECTED_OUTPUT_SHA);
  });

  it('negative control: the same request with the message removed from the fake is refused', async () => {
    const saved = state.messages[ASSISTANT_MSG];
    delete state.messages[ASSISTANT_MSG];
    try {
      const { status } = await post(VALID_BODY);
      expect(status).toBe(400);
      expect(state.inserts).toHaveLength(0);
    } finally {
      state.messages[ASSISTANT_MSG] = saved;
    }
  });
});
