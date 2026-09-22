/**
 * project-context.test.ts — the project layer (Wave 4, track D).
 *
 * buildProjectContext renders one container for the model: the project, the
 * matter brief Counsel's Desk took, the engagement, and what the sibling
 * sessions concluded. Against a fake adapter answering by exact statement:
 *
 *   - team mode: a non-member gets nothing and `denied`, and nothing past the
 *     access check is read; owner, member and admin get through; the role is
 *     looked up when the caller did not pass it;
 *   - the sections come in the documented order with the documented shapes;
 *   - a session with no written summary falls back to the opening of its last
 *     answer, marked "(no conclusion yet)"; a session with nothing said is
 *     not listed; the current session is excluded;
 *   - maxChars is a hard cap;
 *   - a database error yields '' without throwing, logging only the id.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { buildProjectContext, resolveProjectAccess, PROJECT_CONTEXT_SQL } from '../../server/services/project-context.js';

const PROJECT = 'proj-1';
const CURRENT = 'sess-current';

interface FakeState {
  project?: { id: string; name: string; description: string | null; project_goal: string | null; user_id: string | null };
  members: Set<string>;
  roles: Record<string, string>;
  matter?: { id: string; title: string; matter_brief: string; updated_at: string };
  engagement?: { id: string; title: string; client_name: string | null; engagement_type: string; status: string; engagement_brief: string; updated_at: string };
  siblings: Array<{ id: string; title: string; module_id: string; summary: string | null; updated_at: string | Date }>;
  snapshots: Record<string, string>;
  answers: Record<string, string>;
  /** Every query throws. */
  broken?: boolean;
  calls: string[];
}

function makeFakeDb(over: Partial<FakeState> = {}): { db: DatabaseAdapter; state: FakeState } {
  const state: FakeState = {
    project: { id: PROJECT, name: 'Orion acquisition', description: 'Buy-side advice on the Orion AB SPA', project_goal: 'Close by Q4', user_id: 'alice' },
    members: new Set(['bob']),
    roles: { alice: 'analyst', bob: 'analyst', carol: 'analyst', root: 'admin' },
    siblings: [],
    snapshots: {},
    answers: {},
    calls: [],
    ...over,
  };
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      state.calls.push(sql);
      if (state.broken) throw new Error('connection refused: secret-host:5432');
      if (sql === PROJECT_CONTEXT_SQL.project) return (state.project?.id === params[0] ? state.project : undefined) as T | undefined;
      if (sql === PROJECT_CONTEXT_SQL.membership) return (state.members.has(String(params[1])) && params[0] === PROJECT ? { '?column?': 1 } : undefined) as T | undefined;
      if (sql === PROJECT_CONTEXT_SQL.userRole) { const role = state.roles[String(params[0])]; return (role ? { role } : undefined) as T | undefined; }
      if (sql === PROJECT_CONTEXT_SQL.matter) return state.matter as T | undefined;
      if (sql === PROJECT_CONTEXT_SQL.engagement) return state.engagement as T | undefined;
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      state.calls.push(sql);
      if (state.broken) throw new Error('connection refused');
      if (sql === PROJECT_CONTEXT_SQL.siblings) return state.siblings.slice(0, 5) as T[];
      if (sql === PROJECT_CONTEXT_SQL.siblingsExcluding) return state.siblings.filter((s) => s.id !== params[1]).slice(0, 5) as T[];
      if (sql.startsWith('SELECT DISTINCT ON (session_id) session_id, key_decisions')) {
        return (params as string[]).filter((id) => state.snapshots[id] !== undefined).map((id) => ({ session_id: id, key_decisions: state.snapshots[id] })) as T[];
      }
      if (sql.startsWith('SELECT DISTINCT ON (session_id) session_id, content')) {
        return (params as string[]).filter((id) => state.answers[id] !== undefined).map((id) => ({ session_id: id, content: state.answers[id] })) as T[];
      }
      throw new Error(`fake db: unexpected all(): ${sql.slice(0, 80)}`);
    },
    async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 }; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, state };
}

const readsPastAccess = (calls: string[]) =>
  calls.filter((c) => c === PROJECT_CONTEXT_SQL.matter || c === PROJECT_CONTEXT_SQL.engagement || c.startsWith('SELECT id, title, module_id, summary'));

afterEach(() => { vi.restoreAllMocks(); });

describe('buildProjectContext — access in team mode', () => {
  it('denies a non-member and reads nothing past the access check', async () => {
    const { db, state } = makeFakeDb();
    const out = await buildProjectContext(db, { projectId: PROJECT, userId: 'carol', userRole: 'analyst', teamMode: true });
    expect(out).toEqual({ text: '', chars: 0, sessions: 0, hasMatter: false, hasEngagement: false, denied: true });
    expect(readsPastAccess(state.calls)).toEqual([]);
  });

  it('lets the owner, a member and an admin through', async () => {
    for (const [userId, userRole] of [['alice', 'analyst'], ['bob', 'analyst'], ['root', 'admin']] as const) {
      const { db } = makeFakeDb();
      const out = await buildProjectContext(db, { projectId: PROJECT, userId, userRole, teamMode: true });
      expect(out.denied, userId).toBe(false);
      expect(out.text, userId).toContain('## PROJECT');
    }
  });

  it('looks the role up when the caller did not pass one', async () => {
    const { db, state } = makeFakeDb();
    const out = await buildProjectContext(db, { projectId: PROJECT, userId: 'root', teamMode: true });
    expect(out.denied).toBe(false);
    expect(state.calls).toContain(PROJECT_CONTEXT_SQL.userRole);
  });

  it('a project that does not exist is denied in team mode and merely empty in solo mode', async () => {
    const { db } = makeFakeDb({ project: undefined });
    expect((await buildProjectContext(db, { projectId: 'nope', userId: 'alice', userRole: 'admin', teamMode: true })).denied).toBe(true);
    const solo = await buildProjectContext(db, { projectId: 'nope', userId: 'alice', teamMode: false });
    expect(solo.denied).toBe(false);
    expect(solo.text).toBe('');
  });

  it('solo mode never asks about membership', async () => {
    const { db, state } = makeFakeDb();
    const out = await buildProjectContext(db, { projectId: PROJECT, userId: 'carol', teamMode: false });
    expect(out.denied).toBe(false);
    expect(state.calls).not.toContain(PROJECT_CONTEXT_SQL.membership);
    expect(state.calls).not.toContain(PROJECT_CONTEXT_SQL.userRole);
  });
});

describe('resolveProjectAccess (shared with the routes)', () => {
  it('reports not_found / forbidden / ok', async () => {
    const { db } = makeFakeDb();
    expect(await resolveProjectAccess(db, { projectId: 'nope', userId: 'alice', userRole: 'admin', teamMode: true })).toBe('not_found');
    expect(await resolveProjectAccess(db, { projectId: PROJECT, userId: 'carol', userRole: 'analyst', teamMode: true })).toBe('forbidden');
    expect(await resolveProjectAccess(db, { projectId: PROJECT, userId: 'bob', userRole: 'analyst', teamMode: true })).toBe('ok');
    expect(await resolveProjectAccess(db, { projectId: PROJECT, userId: 'alice', userRole: 'analyst', teamMode: true })).toBe('ok');
    expect(await resolveProjectAccess(db, { projectId: PROJECT, userId: 'carol', userRole: 'analyst', teamMode: false })).toBe('ok');
  });
});

describe('buildProjectContext — what is rendered', () => {
  const full = () => makeFakeDb({
    matter: { id: 'ls-1', title: 'Orion SPA warranty claim', matter_brief: JSON.stringify({ parties: 'Baltic Holdings v Orion AB', question: 'Is the claim time-barred?', deadline: '' }), updated_at: '2026-09-15T10:00:00Z' },
    engagement: { id: 'eng-1', title: 'Orion due diligence', client_name: 'Baltic Holdings', engagement_type: 'full', status: 'execution', engagement_brief: JSON.stringify({ scope: 'Warranty and indemnity review' }), updated_at: '2026-09-14T10:00:00Z' },
    siblings: [
      { id: CURRENT, title: 'The run itself', module_id: 'open-chat', summary: 'must not appear', updated_at: '2026-09-17T09:00:00Z' },
      { id: 'sess-2', title: 'Limitation analysis', module_id: 'legal-opinion', summary: 'The 18-month notification window in clause 9.2 runs from Completion.', updated_at: new Date('2026-09-16T12:00:00Z') },
      { id: 'sess-3', title: 'Disclosure review', module_id: 'contract-review', summary: null, updated_at: '2026-09-15T08:00:00Z' },
      { id: 'sess-4', title: 'Empty draft', module_id: 'open-chat', summary: null, updated_at: '2026-09-14T08:00:00Z' },
    ],
    snapshots: {
      'sess-2': JSON.stringify(['Treat clause 9.2 as a condition precedent', 'Notify by 1 October', 'Reserve the indemnity route', 'A fourth one that is not shown']),
      'sess-3': '[]',
    },
    answers: { 'sess-3': Array.from({ length: 80 }, (_, i) => `w${i + 1}`).join(' ') },
  });

  it('renders project, matter, engagement and earlier sessions in that order', async () => {
    const { db } = full();
    const out = await buildProjectContext(db, { projectId: PROJECT, currentSessionId: CURRENT, userId: 'alice', teamMode: false });
    const t = out.text;
    const order = ['## PROJECT', '### Matter brief', '### Engagement', '### Earlier sessions in this project'].map((h) => t.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    expect(t).toContain('Name: Orion acquisition');
    expect(t).toContain('Description: Buy-side advice on the Orion AB SPA');
    expect(t).toContain('Goal: Close by Q4');
    expect(t).toContain('### Matter brief — Orion SPA warranty claim');
    expect(t).toContain('- parties: Baltic Holdings v Orion AB');
    expect(t).toContain('- question: Is the claim time-barred?');
    expect(t).not.toContain('- deadline');
    expect(t).toContain('Title: Orion due diligence');
    expect(t).toContain('Client: Baltic Holdings');
    expect(t).toContain('Engagement: type full, status execution');
    expect(t).toContain('- scope: Warranty and indemnity review');

    expect(out.hasMatter).toBe(true);
    expect(out.hasEngagement).toBe(true);
    expect(out.denied).toBe(false);
    expect(out.chars).toBe(t.length);
  });

  it('lists siblings newest first with their conclusion and up to three decisions, excluding the current session', async () => {
    const { db } = full();
    const { text, sessions } = await buildProjectContext(db, { projectId: PROJECT, currentSessionId: CURRENT, userId: 'alice', teamMode: false });
    expect(text).not.toContain('The run itself');
    expect(text).toContain('- 2026-09-16 Limitation analysis (legal-opinion): The 18-month notification window in clause 9.2 runs from Completion.');
    expect(text).toContain('  decisions: Treat clause 9.2 as a condition precedent; Notify by 1 October; Reserve the indemnity route');
    expect(text).not.toContain('A fourth one');
    expect(text.indexOf('Limitation analysis')).toBeLessThan(text.indexOf('Disclosure review'));
    // Nothing was ever said in the empty draft — it is not listed.
    expect(text).not.toContain('Empty draft');
    expect(sessions).toBe(2);
  });

  it('a session with no written summary shows the first 60 words of its last answer, marked as unconcluded', async () => {
    const { db } = full();
    const { text } = await buildProjectContext(db, { projectId: PROJECT, currentSessionId: CURRENT, userId: 'alice', teamMode: false });
    const line = text.split('\n').find((l) => l.includes('Disclosure review'));
    expect(line).toBeDefined();
    expect(line).toMatch(/^- 2026-09-15 Disclosure review \(contract-review\): w1 w2 /);
    expect(line).toContain('w60…');
    expect(line).not.toContain('w61');
    expect(line?.endsWith('(no conclusion yet)')).toBe(true);
  });

  it('skips an empty matter brief and says so in the flags', async () => {
    const { db } = makeFakeDb({ matter: { id: 'ls-1', title: 'Blank', matter_brief: '{}', updated_at: '2026-09-15T10:00:00Z' } });
    const out = await buildProjectContext(db, { projectId: PROJECT, userId: 'alice', teamMode: false });
    expect(out.text).not.toContain('### Matter brief');
    expect(out.hasMatter).toBe(false);
    expect(out.hasEngagement).toBe(false);
    expect(out.sessions).toBe(0);
  });

  it('caps the matter brief at 1,200 characters', async () => {
    const { db } = makeFakeDb({ matter: { id: 'ls-1', title: 'Long', matter_brief: JSON.stringify({ facts: 'x'.repeat(5000) }), updated_at: '2026-09-15T10:00:00Z' } });
    const { text } = await buildProjectContext(db, { projectId: PROJECT, userId: 'alice', teamMode: false });
    const brief = text.slice(text.indexOf('### Matter brief'));
    expect(brief.length).toBeLessThan(1300);
    expect(brief.endsWith('…')).toBe(true);
  });

  it('maxChars is a hard cap and chars reports the real length', async () => {
    const { db } = full();
    const out = await buildProjectContext(db, { projectId: PROJECT, currentSessionId: CURRENT, userId: 'alice', teamMode: false, maxChars: 300 });
    expect(out.text.length).toBeLessThanOrEqual(300);
    expect(out.chars).toBe(out.text.length);
    expect(out.text.startsWith('## PROJECT')).toBe(true);
    // The default leaves the whole thing in.
    const whole = await buildProjectContext(db, { projectId: PROJECT, currentSessionId: CURRENT, userId: 'alice', teamMode: false });
    expect(whole.chars).toBeGreaterThan(300);
    expect(whole.chars).toBeLessThanOrEqual(6000);
  });
});

describe('buildProjectContext — failure', () => {
  it('returns an empty result without throwing and logs only the project id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { db } = makeFakeDb({ broken: true });
    const out = await buildProjectContext(db, { projectId: PROJECT, userId: 'alice', teamMode: false });
    expect(out).toEqual({ text: '', chars: 0, sessions: 0, hasMatter: false, hasEngagement: false, denied: false });
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls[0].map(String).join(' ');
    expect(logged).toContain(PROJECT);
    expect(logged).not.toContain('secret-host');
  });

  it('an empty project id is a no-op', async () => {
    const { db, state } = makeFakeDb();
    const out = await buildProjectContext(db, { projectId: '  ', userId: 'alice', teamMode: true });
    expect(out.text).toBe('');
    expect(out.denied).toBe(false);
    expect(state.calls).toEqual([]);
  });
});
