/**
 * session-resume-gap.test.ts — the resume block is for coming back later
 * (Wave 4, track C).
 *
 * shouldInjectResume: a snapshot must exist AND the previous answer must be
 * older than RESUME_GAP_MINUTES. buildResumeContextIfDue: reads the latest
 * snapshot and the newest ASSISTANT message — routes/claude.ts persists the
 * incoming user message before the prompt is built, so anchoring on all
 * messages would make the block never due. No database: a fake adapter
 * answers the two SELECTs.
 */
import { describe, it, expect } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  RESUME_GAP_MINUTES,
  shouldInjectResume,
  buildResumeContextIfDue,
  renderResumeContext,
  createSessionResumeService,
  type SessionSnapshot,
} from '../../server/services/session-resume.js';

const NOW = new Date('2026-09-17T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

// ── shouldInjectResume ───────────────────────────────────────────────────────

describe('shouldInjectResume', () => {
  it('exports the documented gap', () => {
    expect(RESUME_GAP_MINUTES).toBe(30);
  });

  it.each([
    ['no snapshot, old message', { hasSnapshot: false, lastMessageAt: minutesAgo(600) }, false],
    ['no snapshot, no message', { hasSnapshot: false, lastMessageAt: null }, false],
    ['snapshot, message 1 min ago', { hasSnapshot: true, lastMessageAt: minutesAgo(1) }, false],
    ['snapshot, message 29 min ago', { hasSnapshot: true, lastMessageAt: minutesAgo(29) }, false],
    ['snapshot, message exactly 30 min ago', { hasSnapshot: true, lastMessageAt: minutesAgo(30) }, true],
    ['snapshot, message 31 min ago', { hasSnapshot: true, lastMessageAt: minutesAgo(31) }, true],
    ['snapshot, message yesterday', { hasSnapshot: true, lastMessageAt: minutesAgo(24 * 60) }, true],
    ['snapshot, no previous message', { hasSnapshot: true, lastMessageAt: null }, true],
    ['snapshot, message in the future (clock skew)', { hasSnapshot: true, lastMessageAt: minutesAgo(-5) }, false],
    ['snapshot, ISO string 2 hours ago', { hasSnapshot: true, lastMessageAt: minutesAgo(120).toISOString() }, true],
    ['snapshot, ISO string 5 min ago', { hasSnapshot: true, lastMessageAt: minutesAgo(5).toISOString() }, false],
    ['snapshot, unparseable timestamp', { hasSnapshot: true, lastMessageAt: 'not a date' }, false],
  ] as Array<[string, { hasSnapshot: boolean; lastMessageAt: string | Date | null }, boolean]>)(
    '%s → %s', (_label, input, expected) => {
      expect(shouldInjectResume({ ...input, now: NOW })).toBe(expected);
    },
  );

  it('defaults now to the wall clock', () => {
    expect(shouldInjectResume({ hasSnapshot: true, lastMessageAt: new Date(Date.now() - 60 * 60_000) })).toBe(true);
    expect(shouldInjectResume({ hasSnapshot: true, lastMessageAt: new Date() })).toBe(false);
  });
});

// ── buildResumeContextIfDue ──────────────────────────────────────────────────

interface FakeOpts {
  snapshot?: Record<string, unknown> | null;
  /** Newest-first messages of the session. */
  messages?: Array<{ role: string; created_at: string | Date }>;
  throws?: boolean;
}

function makeFakeDb(opts: FakeOpts): { db: DatabaseAdapter; gets: string[] } {
  const gets: string[] = [];
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      gets.push(sql);
      if (opts.throws) throw new Error('connection refused');
      if (sql.includes('FROM session_snapshots')) {
        expect(params[0]).toBe('sess-1');
        return (opts.snapshot ?? undefined) as T | undefined;
      }
      if (sql.includes('FROM messages')) {
        expect(sql).toMatch(/role = 'assistant'/);
        const newest = (opts.messages ?? []).filter((m) => m.role === 'assistant')[0];
        return newest ? ({ created_at: newest.created_at } as T) : undefined;
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
  message_id: 'a9',
  created_at: '2026-09-17T09:00:00Z',
};

const HEADER = 'You are resuming this session after a break. Here is what was concluded so far:';

describe('buildResumeContextIfDue', () => {
  it('no snapshot → not due, nothing rendered, and the messages table is not consulted', async () => {
    const { db, gets } = makeFakeDb({ snapshot: null });
    const out = await buildResumeContextIfDue(db, 'sess-1', NOW);
    expect(out).toEqual({ text: '', due: false, snapshotId: null, gapMinutes: null });
    expect(gets.filter((s) => s.includes('FROM messages'))).toHaveLength(0);
  });

  it('snapshot + answer 5 minutes ago → not due (the history carries the context), snapshot still reported', async () => {
    const { db } = makeFakeDb({ snapshot: SNAPSHOT_ROW, messages: [{ role: 'assistant', created_at: minutesAgo(5) }] });
    const out = await buildResumeContextIfDue(db, 'sess-1', NOW);
    expect(out.due).toBe(false);
    expect(out.text).toBe('');
    expect(out.snapshotId).toBe('snap-1');
    expect(out.gapMinutes).toBe(5);
  });

  it('snapshot + answer 2 hours ago → due, renders the conclusion with the new header', async () => {
    const { db } = makeFakeDb({ snapshot: SNAPSHOT_ROW, messages: [{ role: 'assistant', created_at: minutesAgo(120).toISOString() }] });
    const out = await buildResumeContextIfDue(db, 'sess-1', NOW);
    expect(out.due).toBe(true);
    expect(out.snapshotId).toBe('snap-1');
    expect(out.gapMinutes).toBe(120);
    expect(out.text).toContain('## SESSION RESUME CONTEXT');
    expect(out.text).toContain(HEADER);
    expect(out.text).not.toContain('This session was paused');
    expect(out.text).toContain('**Session:** AMLR threshold review');
    expect(out.text).toContain('**Session Summary:** The threshold is 25% or more');
    expect(out.text).toContain('**Key Decisions Made:**\n1. Apply the 25% threshold');
    expect(out.text).toContain('**Open Questions (not yet resolved):**\n1. Trust in scope?');
    expect(out.text).toContain('**Planned Next Steps:**\n1. Draft the memo');
  });

  it('the user message persisted for THIS turn does not suppress the block — the anchor is the last answer', async () => {
    // routes/claude.ts inserts the user message before the prompt layers are
    // built. If MAX(created_at) over all messages were the anchor, this would
    // never be due.
    const { db } = makeFakeDb({
      snapshot: SNAPSHOT_ROW,
      messages: [
        { role: 'user', created_at: minutesAgo(0) },
        { role: 'assistant', created_at: minutesAgo(90) },
      ],
    });
    const out = await buildResumeContextIfDue(db, 'sess-1', NOW);
    expect(out.due).toBe(true);
    expect(out.gapMinutes).toBe(90);
  });

  it('snapshot but no answer yet → due (nothing recent carries the context), gap unknown', async () => {
    const { db } = makeFakeDb({ snapshot: SNAPSHOT_ROW, messages: [{ role: 'user', created_at: minutesAgo(0) }] });
    const out = await buildResumeContextIfDue(db, 'sess-1', NOW);
    expect(out.due).toBe(true);
    expect(out.gapMinutes).toBeNull();
    expect(out.text).toContain(HEADER);
  });

  it('a database failure means "not due", never a throw', async () => {
    const { db } = makeFakeDb({ snapshot: SNAPSHOT_ROW, throws: true });
    const out = await buildResumeContextIfDue(db, 'sess-1', NOW);
    expect(out).toEqual({ text: '', due: false, snapshotId: null, gapMinutes: null });
  });

  it('renders exactly what the service factory\'s buildResumeContext renders (one renderer)', async () => {
    const { db } = makeFakeDb({ snapshot: SNAPSHOT_ROW, messages: [{ role: 'assistant', created_at: minutesAgo(600) }] });
    const out = await buildResumeContextIfDue(db, 'sess-1', NOW);
    const service = await createSessionResumeService(db);
    const snapshot: SessionSnapshot = {
      ...SNAPSHOT_ROW,
      snapshot_type: 'auto',
      key_decisions: ['Apply the 25% threshold'],
      open_questions: ['Trust in scope?'],
      next_steps: ['Draft the memo'],
      context_state: {},
    };
    expect(out.text).toBe(service.buildResumeContext(snapshot));
    expect(out.text).toBe(renderResumeContext(snapshot));
  });

  it('omits the title line and empty lists', () => {
    const text = renderResumeContext({
      id: 's', session_id: 'x', snapshot_type: 'manual', title: null, summary: 'Only a summary.',
      key_decisions: [], open_questions: [], next_steps: [], context_state: {}, token_count: 0,
      user_id: 'default', message_id: null, created_at: '2026-09-17T00:00:00Z',
    });
    expect(text).not.toContain('**Session:**');
    expect(text).not.toContain('Key Decisions');
    expect(text).not.toContain('Open Questions');
    expect(text).not.toContain('Next Steps');
    expect(text).toContain('**Session Summary:** Only a summary.');
  });
});
