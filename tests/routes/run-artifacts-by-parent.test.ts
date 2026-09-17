/**
 * run-artifacts-by-parent.test.ts — the run record v2 read API (Wave 5).
 *
 * Against a fake adapter that answers the routes' own statements by shape
 * (no database):
 *
 *   - GET /api/run-artifacts/by-parent/:kind/:id lists a parent's records in
 *     creation order, without composed_prompt unless ?includePrompt=1, and
 *     for gap_batch / task_step the assessment / task id alone lists every
 *     batch / step under it;
 *   - ownership: the parent's owner and an admin see the records, anyone
 *     else is refused (403), a caller with no user gets 401;
 *   - GET /api/run-artifacts/:id/tool-calls comes back in seq order with a
 *     capped preview, and ?full=1 adds the stored text;
 *   - GET /api/run-artifacts/:id carries the transcript.
 *
 * The negative control at the end proves the fake is reached: with the
 * records removed the owner gets an empty list, not the fixture.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createRunArtifactRoutes, RUN_ARTIFACT_SQL, TOOL_OUTPUT_PREVIEW_CHARS } from '../../server/routes/run-artifacts.js';

interface Row { [k: string]: unknown; id: string; parent_kind: string; parent_id: string | null; message_id: string | null; session_id: string | null; created_at: string; composed_prompt: string; transcript: string[] | null }
interface ToolRow { id: string; run_artifact_id: string; seq: number; tool_name: string; input: Record<string, unknown> | null; output_text: string; output_sha256: string; output_chars: number; is_error: boolean; duration_ms: number | null; created_at: string }

const LONG_OUTPUT = 'L'.repeat(TOOL_OUTPUT_PREVIEW_CHARS + 250);

function record(over: Partial<Row> & { id: string; parent_kind: string; parent_id: string | null }): Row {
  return {
    message_id: null, session_id: null, engine: 'anthropic_sdk', engine_version: '0.3.229',
    model_requested: 'sdk:claude-opus-5', model_served: null, request_params: { thinking: 'think_hard', turns: 3 },
    prompt_sha256: 'p'.repeat(64), prompt_chars: 12, truncated: false, user_message_sha256: 'u'.repeat(64),
    history_sha256: null, output_sha256: 'o'.repeat(64), thinking_sha256: null,
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
    cost_usd: '0.0125', cost_basis: 'plan_usage', status: 'completed', rerun_of: null, rerun_mode: null,
    layer_summary: [], source_manifest: [], created_at: '2026-09-17T09:00:00Z', finished_at: '2026-09-17T09:01:00Z',
    composed_prompt: 'THE PROMPT', transcript: ['first turn', 'final'],
    ...over,
  };
}

interface FakeState { records: Row[]; toolCalls: ToolRow[] }

function makeFakeDb(): { db: DatabaseAdapter; state: FakeState } {
  const state: FakeState = {
    records: [
      record({ id: 'run-b1', parent_kind: 'gap_batch', parent_id: 'ga-1:amlr-2024:1', created_at: '2026-09-17T09:05:00Z' }),
      record({ id: 'run-b0', parent_kind: 'gap_batch', parent_id: 'ga-1:amlr-2024:0', created_at: '2026-09-17T09:00:00Z' }),
      record({ id: 'run-other-ga', parent_kind: 'gap_batch', parent_id: 'ga-1x:amlr-2024:0' }),
      record({ id: 'run-t0', parent_kind: 'task_step', parent_id: 'task-1:0' }),
      record({ id: 'run-t0-retry', parent_kind: 'task_step', parent_id: 'task-1:0', created_at: '2026-09-17T09:10:00Z' }),
      record({ id: 'run-e1', parent_kind: 'engagement_step', parent_id: 'it-1', session_id: 'sess-bridged' }),
      record({ id: 'run-m1', parent_kind: 'message', parent_id: null, message_id: 'msg-1', session_id: 'sess-1' }),
    ],
    toolCalls: [
      { id: 'tc-2', run_artifact_id: 'run-t0', seq: 2, tool_name: 'search_knowledge', input: { query: 'Art 20' }, output_text: 'hits', output_sha256: 'h'.repeat(64), output_chars: 4, is_error: true, duration_ms: 40, created_at: '2026-09-17T09:00:02Z' },
      { id: 'tc-1', run_artifact_id: 'run-t0', seq: 1, tool_name: 'read_document', input: { name: 'policy.pdf' }, output_text: LONG_OUTPUT, output_sha256: 'r'.repeat(64), output_chars: 90_000, is_error: false, duration_ms: 812, created_at: '2026-09-17T09:00:01Z' },
      { id: 'tc-x', run_artifact_id: 'run-b0', seq: 1, tool_name: 'read_evidence', input: {}, output_text: 'ev', output_sha256: 'e'.repeat(64), output_chars: 2, is_error: false, duration_ms: 5, created_at: '2026-09-17T09:00:01Z' },
    ],
  };
  const owners = {
    sessions: { 'sess-1': 'alice', 'sess-bridged': 'carol' } as Record<string, string>,
    gaps: { 'ga-1': 'alice', 'ga-1x': 'bob' } as Record<string, string>,
    tasks: { 'task-1': 'bob' } as Record<string, string>,
    iterations: { 'it-1': 'carol' } as Record<string, string>,
  };
  const project = (r: Row, sql: string): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...r };
    if (!/ra\.composed_prompt/.test(sql)) delete out.composed_prompt;
    if (!/ra\.transcript(?!\))/.test(sql.replace(/jsonb_typeof\(ra\.transcript\)|jsonb_array_length\(ra\.transcript\)/g, ''))) delete out.transcript;
    out.transcript_turns = Array.isArray(r.transcript) ? r.transcript.length : 0;
    out.tool_call_count = state.toolCalls.filter((t) => t.run_artifact_id === r.id).length;
    return out;
  };
  const byCreated = (a: Row, b: Row) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1);

  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql === RUN_ARTIFACT_SQL.sessionOwner) { const u = owners.sessions[String(params[0])]; return u ? ({ user_id: u } as T) : undefined; }
      if (sql === RUN_ARTIFACT_SQL.gapOwner) { const u = owners.gaps[String(params[0])]; return u ? ({ user_id: u } as T) : undefined; }
      if (sql === RUN_ARTIFACT_SQL.taskOwner) { const u = owners.tasks[String(params[0])]; return u ? ({ user_id: u } as T) : undefined; }
      if (sql === RUN_ARTIFACT_SQL.engagementOwner) { const u = owners.iterations[String(params[0])]; return u ? ({ user_id: u } as T) : undefined; }
      if (/FROM run_artifacts ra WHERE ra\.id = \?/.test(sql)) {
        const r = state.records.find((x) => x.id === String(params[0]));
        return r ? (project(r, sql) as T) : undefined;
      }
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 90)}`);
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (/FROM run_artifacts ra WHERE ra\.message_id = \?/.test(sql)) {
        return state.records.filter((r) => r.message_id === String(params[0])).sort(byCreated).map((r) => project(r, sql)) as T[];
      }
      if (/FROM run_artifacts ra WHERE ra\.parent_kind = \? AND \(ra\.parent_id = \? OR ra\.parent_id LIKE \? ESCAPE/.test(sql)) {
        const [kind, exact, like] = params as [string, string, string];
        expect(like).toBe(`${exact}:%`);
        return state.records
          .filter((r) => r.parent_kind === kind && (r.parent_id === exact || (r.parent_id ?? '').startsWith(`${exact}:`)))
          .sort(byCreated).map((r) => project(r, sql)) as T[];
      }
      if (/FROM run_artifacts ra WHERE ra\.parent_kind = \? AND ra\.parent_id = \? ORDER/.test(sql)) {
        const [kind, exact] = params as [string, string];
        return state.records.filter((r) => r.parent_kind === kind && r.parent_id === exact).sort(byCreated).map((r) => project(r, sql)) as T[];
      }
      if (sql === RUN_ARTIFACT_SQL.toolCalls) {
        return state.toolCalls.filter((t) => t.run_artifact_id === String(params[0])).sort((a, b) => a.seq - b.seq) as T[];
      }
      throw new Error(`fake db: unexpected all(): ${sql.slice(0, 90)}`);
    },
    async run(): Promise<RunResult> { throw new Error('fake db: the read routes must not write'); },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, state };
}

describe('GET /api/run-artifacts — records by parent, tool calls, one record', () => {
  let server: Server;
  let base: string;
  let state: FakeState;
  /** The user the fake auth middleware attaches; null = no user. */
  let currentUser: { id: string; role: string } | null = { id: 'alice', role: 'analyst' };

  beforeAll(async () => {
    const fake = makeFakeDb();
    state = fake.state;
    const app = express();
    app.use((req, _res, next) => {
      if (currentUser) (req as unknown as { user: unknown }).user = { ...currentUser };
      next();
    });
    app.use('/api', createRunArtifactRoutes(fake.db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  beforeEach(() => { currentUser = { id: 'alice', role: 'analyst' }; });

  async function get(path: string): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`${base}/api${path}`);
    return { status: res.status, json: await res.json() };
  }

  it('lists every batch of an assessment for its owner, in creation order, without the prompt', async () => {
    const { status, json } = await get('/run-artifacts/by-parent/gap_batch/ga-1');
    expect(status).toBe(200);
    const rows = json as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.id)).toEqual(['run-b0', 'run-b1']);
    expect(rows[0]).not.toHaveProperty('composed_prompt');
    expect(rows[0]).not.toHaveProperty('transcript');
    expect(rows[0].transcript_turns).toBe(2);
    expect(rows[0].tool_call_count).toBe(1);
    expect(rows[1].tool_call_count).toBe(0);
    // NUMERIC arrives as text from pg; the client gets a number.
    expect(rows[0].cost_usd).toBe(0.0125);
    expect(rows[0].request_params).toEqual({ thinking: 'think_hard', turns: 3 });
    expect(rows[0].parent_id).toBe('ga-1:amlr-2024:0');
  });

  it('?includePrompt=1 adds the composed prompt; ?includeTranscript=1 adds the turns', async () => {
    const { json } = await get('/run-artifacts/by-parent/gap_batch/ga-1?includePrompt=1');
    expect((json as Array<Record<string, unknown>>)[0].composed_prompt).toBe('THE PROMPT');
    const withTranscript = await get('/run-artifacts/by-parent/gap_batch/ga-1?includeTranscript=1');
    expect((withTranscript.json as Array<Record<string, unknown>>)[0].transcript).toEqual(['first turn', 'final']);
    expect((withTranscript.json as Array<Record<string, unknown>>)[0]).not.toHaveProperty('composed_prompt');
  });

  it('an exact composite id returns that one batch', async () => {
    const { json } = await get('/run-artifacts/by-parent/gap_batch/ga-1%3Aamlr-2024%3A1');
    expect((json as Array<Record<string, unknown>>).map((r) => r.id)).toEqual(['run-b1']);
  });

  it('refuses another user (403), passes an admin, and needs a user at all (401)', async () => {
    currentUser = { id: 'bob', role: 'analyst' };
    expect((await get('/run-artifacts/by-parent/gap_batch/ga-1')).status).toBe(403);
    // bob owns task-1 — its steps are his, both attempts of step 0.
    const steps = await get('/run-artifacts/by-parent/task_step/task-1');
    expect(steps.status).toBe(200);
    expect((steps.json as Array<Record<string, unknown>>).map((r) => r.id)).toEqual(['run-t0', 'run-t0-retry']);

    currentUser = { id: 'zed', role: 'admin' };
    expect((await get('/run-artifacts/by-parent/gap_batch/ga-1')).status).toBe(200);

    currentUser = null;
    expect((await get('/run-artifacts/by-parent/gap_batch/ga-1')).status).toBe(401);
  });

  it('an engagement iteration is owned through its engagement; a message record through its session', async () => {
    currentUser = { id: 'carol', role: 'analyst' };
    const it = await get('/run-artifacts/by-parent/engagement_step/it-1');
    expect(it.status).toBe(200);
    expect((it.json as Array<Record<string, unknown>>).map((r) => r.id)).toEqual(['run-e1']);
    expect((await get('/run-artifacts/by-parent/message/msg-1')).status).toBe(403);

    currentUser = { id: 'alice', role: 'analyst' };
    const msg = await get('/run-artifacts/by-parent/message/msg-1');
    expect(msg.status).toBe(200);
    expect((msg.json as Array<Record<string, unknown>>).map((r) => r.id)).toEqual(['run-m1']);
  });

  it('an unknown parent kind is a 400; a parent nobody owns is a 403', async () => {
    expect((await get('/run-artifacts/by-parent/mission_task/x')).status).toBe(400);
    expect((await get('/run-artifacts/by-parent/gap_batch/ga-nope')).status).toBe(403);
  });

  it('tool calls come back in seq order with a capped preview; ?full=1 adds the stored text', async () => {
    currentUser = { id: 'bob', role: 'analyst' };
    const { status, json } = await get('/run-artifacts/run-t0/tool-calls');
    expect(status).toBe(200);
    const calls = json as Array<Record<string, unknown>>;
    expect(calls.map((c) => c.seq)).toEqual([1, 2]);
    expect(calls.map((c) => c.tool_name)).toEqual(['read_document', 'search_knowledge']);
    expect(calls[0].input).toEqual({ name: 'policy.pdf' });
    expect(calls[0].duration_ms).toBe(812);
    expect(calls[0].is_error).toBe(false);
    expect(calls[1].is_error).toBe(true);
    // The preview is capped; the full length and the stored length are both stated.
    expect((calls[0].output_preview as string).length).toBe(TOOL_OUTPUT_PREVIEW_CHARS);
    expect(calls[0].output_preview_truncated).toBe(true);
    expect(calls[0].output_chars).toBe(90_000);
    expect(calls[0].stored_chars).toBe(LONG_OUTPUT.length);
    expect(calls[0]).not.toHaveProperty('output_text');
    expect(calls[1].output_preview).toBe('hits');
    expect(calls[1].output_preview_truncated).toBe(false);

    const full = await get('/run-artifacts/run-t0/tool-calls?full=1');
    expect((full.json as Array<Record<string, unknown>>)[0].output_text).toBe(LONG_OUTPUT);
  });

  it('tool calls of a run one does not own are refused; an unknown run is a 404', async () => {
    expect((await get('/run-artifacts/run-t0/tool-calls')).status).toBe(403);
    expect((await get('/run-artifacts/run-nope/tool-calls')).status).toBe(404);
  });

  it('one record carries its transcript, and the prompt only on request', async () => {
    const one = await get('/run-artifacts/run-b0');
    expect(one.status).toBe(200);
    const row = one.json as Record<string, unknown>;
    expect(row.id).toBe('run-b0');
    expect(row.transcript).toEqual(['first turn', 'final']);
    expect(row).not.toHaveProperty('composed_prompt');
    const withPrompt = await get('/run-artifacts/run-b0?includePrompt=1');
    expect((withPrompt.json as Record<string, unknown>).composed_prompt).toBe('THE PROMPT');
    currentUser = { id: 'bob', role: 'analyst' };
    expect((await get('/run-artifacts/run-b0')).status).toBe(403);
  });

  it('negative control: with the records gone the owner gets an empty list', async () => {
    const kept = state.records.splice(0, state.records.length);
    try {
      const { status, json } = await get('/run-artifacts/by-parent/gap_batch/ga-1');
      expect(status).toBe(200);
      expect(json).toEqual([]);
    } finally {
      state.records.push(...kept);
    }
  });
});
