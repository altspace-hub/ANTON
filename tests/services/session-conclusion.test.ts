/**
 * session-conclusion.test.ts — writeSessionConclusion (Wave 4, track C).
 *
 * Runs without a database: the adapter is a recording fake that models the
 * three statements the writer issues (the idempotency SELECT, the snapshot
 * UPSERT with RETURNING id, the sessions.summary UPDATE) and the messages
 * read. provider-router, utility-model and parse-telemetry are mocked so the
 * model reply is under the test's control.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const { callChatMock, parseOutcomes } = vi.hoisted(() => ({
  callChatMock: vi.fn(),
  parseOutcomes: [] as Array<{ service: string; model: string; ok: boolean; note?: string }>,
}));

vi.mock('../../server/services/provider-router.js', () => ({
  callChat: (cfg: unknown) => callChatMock(cfg),
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => 'utility-model',
}));
vi.mock('../../server/services/parse-telemetry.js', () => ({
  recordParseOutcome: async (_db: unknown, service: string, model: string, ok: boolean, note?: string) => {
    parseOutcomes.push({ service, model, ok, note });
  },
}));

import {
  writeSessionConclusion,
  resetSessionConclusionForTests,
  parseJsonObjectTolerant,
  normaliseConclusion,
  buildConclusionTranscript,
  CONCLUSION_MIN_CHARS,
  CONCLUSION_MESSAGE_CAP,
  CONCLUSION_MESSAGE_WINDOW,
} from '../../server/services/session-conclusion.js';

// ── Fake database ────────────────────────────────────────────────────────────

interface MessageRow { id: string; role: string; content: string; created_at: string }
interface SnapshotRow {
  id: string; session_id: string; title: string | null; summary: string;
  key_decisions: string; open_questions: string; next_steps: string;
  user_id: string; module_id: string | null; model_id: string; message_id: string;
}

interface FakeState {
  messages: MessageRow[];
  snapshots: SnapshotRow[];
  sessionSummary: string | null;
  runs: Array<{ sql: string; params: unknown[] }>;
  gets: Array<{ sql: string; params: unknown[] }>;
  upsertSql: string | null;
  /** Make the snapshot UPSERT throw. */
  upsertThrows?: boolean;
}

function makeFakeDb(state: FakeState): DatabaseAdapter {
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      state.gets.push({ sql, params });
      if (sql.includes('FROM session_snapshots') && sql.includes('message_id = ?')) {
        const hit = state.snapshots.find((s) => s.session_id === params[0] && s.message_id === params[1]);
        return hit ? ({ id: hit.id } as T) : undefined;
      }
      if (sql.trim().startsWith('INSERT INTO session_snapshots')) {
        if (state.upsertThrows) throw new Error('relation "session_snapshots" does not exist');
        state.upsertSql = sql;
        const [id, session_id, title, summary, key_decisions, open_questions, next_steps, user_id, module_id, model_id, message_id] = params as [
          string, string, string | null, string, string, string, string, string, string | null, string, string,
        ];
        const row: SnapshotRow = { id, session_id, title, summary, key_decisions, open_questions, next_steps, user_id, module_id, model_id, message_id };
        // Migration 276: one row per answer — a plain INSERT, never a replace.
        state.snapshots.push(row);
        return { id: row.id } as T;
      }
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('FROM messages')) {
        const limit = Number(params[1]);
        return [...state.messages]
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, limit) as unknown as T[];
      }
      throw new Error(`fake db: unexpected all(): ${sql.slice(0, 80)}`);
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      state.runs.push({ sql, params });
      if (sql.startsWith('UPDATE sessions SET summary')) state.sessionSummary = String(params[0]);
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return db;
}

function freshState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    messages: [
      { id: 'u1', role: 'user', content: 'first question about the AMLR threshold', created_at: '2026-09-16T10:00:00Z' },
      { id: 'a1', role: 'assistant', content: 'first answer: the beneficial-ownership threshold is 25% or more', created_at: '2026-09-16T10:01:00Z' },
      { id: 'u2', role: 'user', content: 'second question about the deadline', created_at: '2026-09-16T10:02:00Z' },
    ],
    snapshots: [],
    sessionSummary: null,
    runs: [],
    gets: [],
    upsertSql: null,
    ...overrides,
  };
}

const LONG_ANSWER = 'The obliged entity must apply the 25%-or-more threshold from 10 July 2027; the register filing is due within the transition window. '.repeat(3);

const GOOD = {
  title: 'AMLR beneficial-ownership threshold',
  summary: 'The beneficial-ownership threshold under AMLR is 25% or more, applying from 10 July 2027. The client must refile the register within the transition window.',
  key_decisions: ['Apply the 25%-or-more threshold', 'Refile the register in the transition window'],
  open_questions: ['Whether the trust structure is in scope'],
  next_steps: ['Draft the refiling memo'],
};

function reply(text: string) {
  return { text, thinking: '', inputTokens: 10, outputTokens: 20 };
}

const baseInput = {
  sessionId: 'sess-1',
  messageId: 'a2',
  userId: 'user-1',
  moduleId: 'gap-analysis',
  areaId: 'fcp',
  assistantText: LONG_ANSWER,
};

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetSessionConclusionForTests();
  callChatMock.mockReset();
  parseOutcomes.length = 0;
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

// ── Guards ───────────────────────────────────────────────────────────────────

describe('writeSessionConclusion — guards', () => {
  it('refuses an answer under CONCLUSION_MIN_CHARS without touching the database or the model', async () => {
    expect(LONG_ANSWER.length).toBeGreaterThanOrEqual(CONCLUSION_MIN_CHARS);
    const state = freshState();
    const result = await writeSessionConclusion(makeFakeDb(state), { ...baseInput, assistantText: 'Done.' });
    expect(result).toEqual({ written: false, reason: 'too short' });
    expect(state.gets).toHaveLength(0);
    expect(state.runs).toHaveLength(0);
    expect(callChatMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('refuses an overlapping turn on the same session while the first is in flight, then clears the guard', async () => {
    const state = freshState();
    const db = makeFakeDb(state);
    let release: (() => void) | undefined;
    callChatMock.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve(reply(JSON.stringify(GOOD)));
    }));

    const first = writeSessionConclusion(db, baseInput);
    const second = await writeSessionConclusion(db, { ...baseInput, messageId: 'a3' });
    expect(second).toEqual({ written: false, reason: 'in flight' });

    // Another session is not blocked by this one's guard.
    callChatMock.mockResolvedValueOnce(reply(JSON.stringify(GOOD)));
    const other = await writeSessionConclusion(db, { ...baseInput, sessionId: 'sess-2', messageId: 'b1' });
    expect(other.written).toBe(true);

    expect(release).toBeDefined();
    release!();
    const firstResult = await first;
    expect(firstResult.written).toBe(true);

    // Guard released: the same session can be concluded again.
    callChatMock.mockResolvedValueOnce(reply(JSON.stringify(GOOD)));
    const again = await writeSessionConclusion(db, { ...baseInput, messageId: 'a3' });
    expect(again.written).toBe(true);
  });

  it('is idempotent on message_id — a second call for the same answer does not call the model', async () => {
    const state = freshState();
    const db = makeFakeDb(state);
    callChatMock.mockResolvedValueOnce(reply(JSON.stringify(GOOD)));
    const first = await writeSessionConclusion(db, baseInput);
    expect(first.written).toBe(true);

    const second = await writeSessionConclusion(db, baseInput);
    expect(second).toEqual({ written: false, reason: 'already written', snapshotId: first.snapshotId });
    expect(callChatMock).toHaveBeenCalledTimes(1);
    expect(state.snapshots).toHaveLength(1);
  });
});

// ── Happy path ───────────────────────────────────────────────────────────────

describe('writeSessionConclusion — happy path', () => {
  it('inserts the snapshot row and mirrors the summary onto sessions.summary', async () => {
    const state = freshState();
    callChatMock.mockResolvedValueOnce(reply(JSON.stringify(GOOD)));

    const result = await writeSessionConclusion(makeFakeDb(state), baseInput);
    expect(result.written).toBe(true);
    expect(result.snapshotId).toBeTruthy();

    expect(state.snapshots).toHaveLength(1);
    const row = state.snapshots[0];
    expect(row.id).toBe(result.snapshotId);
    expect(row.session_id).toBe('sess-1');
    expect(row.message_id).toBe('a2');
    expect(row.title).toBe(GOOD.title);
    expect(row.summary).toBe(GOOD.summary);
    expect(JSON.parse(row.key_decisions)).toEqual(GOOD.key_decisions);
    expect(JSON.parse(row.open_questions)).toEqual(GOOD.open_questions);
    expect(JSON.parse(row.next_steps)).toEqual(GOOD.next_steps);
    expect(row.user_id).toBe('user-1');
    expect(row.module_id).toBe('gap-analysis');
    expect(row.model_id).toBe('utility-model');

    // Migration 276: a plain INSERT per answer (no ON CONFLICT), typed 'auto'.
    expect(state.upsertSql).not.toMatch(/ON CONFLICT/);
    expect(state.upsertSql).toMatch(/INSERT INTO session_snapshots/);
    expect(state.upsertSql).toMatch(/'auto'/);
    expect(state.upsertSql).toMatch(/RETURNING id/);

    expect(state.sessionSummary).toBe(GOOD.summary);
    const update = state.runs.find((r) => r.sql.startsWith('UPDATE sessions SET summary'));
    expect(update?.params).toEqual([GOOD.summary, 'sess-1']);

    expect(parseOutcomes).toEqual([{ service: 'session-conclusion', model: 'utility-model', ok: true, note: undefined }]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('calls the utility model as background JSON work with the transcript oldest-first and the current answer appended', async () => {
    const state = freshState();
    callChatMock.mockResolvedValueOnce(reply(JSON.stringify(GOOD)));
    await writeSessionConclusion(makeFakeDb(state), baseInput);

    expect(callChatMock).toHaveBeenCalledTimes(1);
    const cfg = callChatMock.mock.calls[0][0] as {
      model: string; background: boolean; jsonMode: boolean; maxTokens: number; system: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(cfg.model).toBe('utility-model');
    expect(cfg.background).toBe(true);
    expect(cfg.jsonMode).toBe(true);
    expect(cfg.maxTokens).toBe(700);
    expect(cfg.system).toMatch(/CONCLUDED/);
    expect(cfg.messages).toHaveLength(1);
    const prompt = cfg.messages[0].content;
    const iFirst = prompt.indexOf('first question');
    const iSecond = prompt.indexOf('second question');
    const iAnswer = prompt.indexOf('25%-or-more threshold from 10 July 2027');
    expect(iFirst).toBeGreaterThan(-1);
    expect(iFirst).toBeLessThan(iSecond);
    expect(iSecond).toBeLessThan(iAnswer);
    // The answer being concluded was not in the messages table yet — it was appended.
    expect(prompt).toContain('[assistant]: The obliged entity');
  });

  it('second conclusion on the same session adds a new row that points at the new message (history kept)', async () => {
    const state = freshState();
    const db = makeFakeDb(state);
    callChatMock.mockResolvedValueOnce(reply(JSON.stringify(GOOD)));
    const first = await writeSessionConclusion(db, baseInput);

    const later = { ...GOOD, summary: 'Later conclusion: the trust structure is in scope and the memo was drafted for review.' };
    callChatMock.mockResolvedValueOnce(reply(JSON.stringify(later)));
    const second = await writeSessionConclusion(db, { ...baseInput, messageId: 'a3' });

    expect(second.written).toBe(true);
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(state.snapshots).toHaveLength(2);
    expect(state.snapshots[1].message_id).toBe('a3');
    expect(state.snapshots[1].summary).toBe(later.summary);
    expect(state.sessionSummary).toBe(later.summary);
  });

  it('accepts fenced JSON with prose around it', async () => {
    const state = freshState();
    callChatMock.mockResolvedValueOnce(reply(`Here is the conclusion:\n\`\`\`json\n${JSON.stringify(GOOD, null, 2)}\n\`\`\`\nLet me know if you need more.`));
    const result = await writeSessionConclusion(makeFakeDb(state), baseInput);
    expect(result.written).toBe(true);
    expect(state.snapshots[0].summary).toBe(GOOD.summary);
    expect(parseOutcomes[0].ok).toBe(true);
  });

  it('drops list items beyond five and non-string entries, and keeps only the summary as mandatory', async () => {
    const state = freshState();
    callChatMock.mockResolvedValueOnce(reply(JSON.stringify({
      summary: GOOD.summary,
      key_decisions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      open_questions: [1, null, 'real question', ''],
      next_steps: 'not a list',
    })));
    const result = await writeSessionConclusion(makeFakeDb(state), baseInput);
    expect(result.written).toBe(true);
    const row = state.snapshots[0];
    expect(row.title).toBeNull();
    expect(JSON.parse(row.key_decisions)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(JSON.parse(row.open_questions)).toEqual(['real question']);
    expect(JSON.parse(row.next_steps)).toEqual([]);
  });
});

// ── Failure paths ────────────────────────────────────────────────────────────

describe('writeSessionConclusion — failures never throw and never log content', () => {
  it('LLM call failure → written:false, nothing written, one warn line naming only the session', async () => {
    const state = freshState();
    callChatMock.mockRejectedValueOnce(new Error('503 upstream unavailable'));
    const result = await writeSessionConclusion(makeFakeDb(state), baseInput);

    expect(result.written).toBe(false);
    expect(result.reason).toMatch(/^llm call failed/);
    expect(state.snapshots).toHaveLength(0);
    expect(state.sessionSummary).toBeNull();
    expect(parseOutcomes).toHaveLength(0);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = String(warnSpy.mock.calls[0][0]);
    expect(line).toContain('sess-1');
    expect(line).not.toContain('AMLR');
    expect(line).not.toContain('first question');
  });

  it('unparseable reply → written:false and a parse failure recorded against the model', async () => {
    const state = freshState();
    callChatMock.mockResolvedValueOnce(reply('I am not able to produce that.'));
    const result = await writeSessionConclusion(makeFakeDb(state), baseInput);
    expect(result).toEqual({ written: false, reason: 'unparseable response' });
    expect(state.snapshots).toHaveLength(0);
    expect(parseOutcomes).toEqual([{ service: 'session-conclusion', model: 'utility-model', ok: false, note: 'no JSON object in reply' }]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('JSON without a usable summary → written:false, parse failure recorded', async () => {
    const state = freshState();
    callChatMock.mockResolvedValueOnce(reply(JSON.stringify({ title: 'x', summary: '', key_decisions: [] })));
    const result = await writeSessionConclusion(makeFakeDb(state), baseInput);
    expect(result).toEqual({ written: false, reason: 'unusable conclusion' });
    expect(parseOutcomes[0].ok).toBe(false);
  });

  it('database failure on the upsert → written:false with a write reason, and the guard is released', async () => {
    const state = freshState({ upsertThrows: true });
    const db = makeFakeDb(state);
    callChatMock.mockResolvedValueOnce(reply(JSON.stringify(GOOD)));
    const result = await writeSessionConclusion(db, baseInput);
    expect(result.written).toBe(false);
    expect(result.reason).toMatch(/^write failed/);
    expect(state.sessionSummary).toBeNull();

    state.upsertThrows = false;
    callChatMock.mockResolvedValueOnce(reply(JSON.stringify(GOOD)));
    const retry = await writeSessionConclusion(db, baseInput);
    expect(retry.written).toBe(true);
  });
});

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('parseJsonObjectTolerant', () => {
  const obj = { summary: 'ok', key_decisions: ['a'] };
  it.each([
    ['plain', JSON.stringify(obj)],
    ['fenced', `\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``],
    ['fenced without language', `\`\`\`\n${JSON.stringify(obj)}\n\`\`\``],
    ['prose before and after', `Sure:\n${JSON.stringify(obj)}\nDone.`],
    ['trailing prose with braces', `${JSON.stringify(obj)}\nNote: {this} is not JSON.`],
    ['brace inside a string value', JSON.stringify({ ...obj, summary: 'uses {braces} and "quotes"' })],
  ])('%s', (_label, text) => {
    const parsed = parseJsonObjectTolerant(text);
    expect(parsed).not.toBeNull();
    expect(parsed?.key_decisions).toEqual(['a']);
  });

  it.each([
    ['empty', ''],
    ['no braces', 'nothing here'],
    ['array root', '[1,2,3]'],
    ['unbalanced', '{"summary": "x"'],
  ])('%s → null', (_label, text) => {
    expect(parseJsonObjectTolerant(text)).toBeNull();
  });
});

describe('normaliseConclusion', () => {
  it('rejects a summary under 20 characters and caps a title at 120', () => {
    expect(normaliseConclusion({ summary: 'too short' })).toBeNull();
    const long = 't'.repeat(200);
    const out = normaliseConclusion({ summary: 'This is a summary long enough to count as one.', title: long });
    expect(out?.title).toHaveLength(120);
  });
});

describe('buildConclusionTranscript', () => {
  it('keeps the last CONCLUSION_MESSAGE_WINDOW messages, oldest first, each capped', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`, role: i % 2 ? 'assistant' : 'user', content: `msg ${i} ` + 'x'.repeat(CONCLUSION_MESSAGE_CAP + 50),
    }));
    const out = buildConclusionTranscript(history, { messageId: 'm19', assistantText: 'ignored' });
    const blocks = out.split('\n\n');
    expect(blocks).toHaveLength(CONCLUSION_MESSAGE_WINDOW);
    expect(blocks[0]).toMatch(/^\[user\]: msg 8 /);
    expect(blocks[blocks.length - 1]).toMatch(/^\[assistant\]: msg 19 /);
    // Ordinary messages: head only, capped.
    expect(blocks[0].length).toBeLessThanOrEqual('[user]: '.length + CONCLUSION_MESSAGE_CAP + 2);
  });

  it('keeps head and tail of the answer being concluded so the closing section survives', () => {
    const answer = 'HEAD ' + 'x'.repeat(CONCLUSION_MESSAGE_CAP * 3) + ' TAIL-CONCLUSION';
    const out = buildConclusionTranscript([], { messageId: 'a', assistantText: answer });
    expect(out).toContain('HEAD');
    expect(out).toContain('TAIL-CONCLUSION');
    expect(out).toContain('[…]');
  });
});
