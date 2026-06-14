/**
 * coding-workshop-engine.test.ts — ANTON Studio P1 (the kickoff workshop).
 *
 * NO live LLM: the orchestrator model call is an injected stub (deps.callOrchestrator),
 * and the phase-4 framework auto-suggest is a stub (deps.suggestFrameworks). Covers:
 *   - parseWorkshopUpdate: the STATE_UPDATE parse (tolerant: garbage dropped,
 *     never invented) + the [PHASE_COMPLETE] phase ADVANCE through the 8 phases.
 *   - the conversation turn loop drives the engine on resolveCodingModel('orchestrator')
 *     = Mistral Large (the PM/lead).
 *   - RESUMABILITY: state round-trips through the (fake) store and the next turn
 *     resumes from the persisted phase.
 *   - the CHARTER assembles deterministically from collected state (assembleCharter).
 *   - the phase-4 framework auto-suggest IS invoked when the turn lands on the
 *     guidelines phase.
 *   - (PG-backed, skips without DATABASE_URL) finalize SEEDS a coding_project.
 *
 * Pure-logic + mocked-turn tests run with a fake in-memory DB (always). The
 * finalize-seeds-a-project test needs DATABASE_URL (core-team route-test pattern).
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  createCodingWorkshopEngine,
  createDefaultWorkshopState,
  parseWorkshopUpdate,
  assembleCharter,
  WORKSHOP_PHASES,
  type WorkshopState,
  type ChosenFramework,
} from '../../server/services/coding-workshop-engine.js';
import { resetCodingModelStrategyForTests } from '../../server/services/coding-model-resolver.js';
import { CORE_TEAM_ROLES } from '../../server/services/core-team-panel.js';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

// ── env: force Mistral so resolveCodingModel('orchestrator') is deterministic ─
const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let saved: Record<string, string | undefined>;

function onlyMistral(): void {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.MISTRAL_API_KEY = 'test-key';
}

/** A tiny in-memory store for coding_workshop_sessions so the turn loop round-trips. */
function fakeStore(): DatabaseAdapter {
  const rows = new Map<string, Record<string, unknown>>();
  const db: DatabaseAdapter = {
    dialect: 'sqlite',
    async get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (/FROM coding_workshop_sessions WHERE id = \?/.test(sql)) {
        return rows.get(params[0] as string) as T | undefined;
      }
      if (/FROM coding_projects WHERE id = \?/.test(sql)) return undefined;
      return undefined;
    },
    async all<T = Record<string, unknown>>(_sql: string): Promise<T[]> {
      return [...rows.values()] as T[];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (/INSERT INTO coding_workshop_sessions/.test(sql)) {
        const [id, user_id, tier, mode, state] = params as string[];
        rows.set(id, { id, user_id, tier, mode, state, status: 'active', coding_project_id: null, charter: null, autosave_version: 0, started_at: '', last_active_at: '' });
      } else if (/UPDATE coding_workshop_sessions\s+SET state = \?/.test(sql)) {
        const [state, id] = params as string[];
        const row = rows.get(id);
        if (row) { row.state = state; row.autosave_version = (row.autosave_version as number) + 1; }
      } else if (/UPDATE coding_workshop_sessions SET status/.test(sql)) {
        const [status, id] = params as string[];
        const row = rows.get(id); if (row) row.status = status;
      } else if (/DELETE FROM coding_workshop_sessions/.test(sql)) {
        rows.delete(params[0] as string);
      }
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return db;
}

beforeEach(() => {
  saved = {}; for (const k of ENV_KEYS) saved[k] = process.env[k];
  resetCodingModelStrategyForTests();
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  resetCodingModelStrategyForTests();
});

// ── parseWorkshopUpdate: STATE_UPDATE parse + phase advance ────────────────

describe('parseWorkshopUpdate (tolerant parse + phase advance)', () => {
  function base(): WorkshopState {
    return createDefaultWorkshopState('standard', 'project');
  }

  it('applies a well-formed STATE_UPDATE and strips the markers from the reply', () => {
    const reply = `Great — so you're building a budgeting app for freelancers. What does success look like?
[STATE_UPDATE]:{"title":"FreelanceBudget","problemStatement":"Freelancers can't see their cashflow","currentPhaseProgress":60}`;
    const { cleanResponse, updatedState, phaseChanged } = parseWorkshopUpdate(reply, base());
    expect(cleanResponse).not.toMatch(/STATE_UPDATE/);
    expect(updatedState.title).toBe('FreelanceBudget');
    expect(updatedState.problemStatement).toBe("Freelancers can't see their cashflow");
    expect(updatedState.currentPhaseProgress).toBe(60);
    expect(phaseChanged).toBe(false);
  });

  it('advances to the next phase on [PHASE_COMPLETE] and resets progress', () => {
    const reply = `We've nailed the problem. Let's talk scope next.
[PHASE_COMPLETE:problem_vision]`;
    const { updatedState, phaseChanged } = parseWorkshopUpdate(reply, base());
    expect(phaseChanged).toBe(true);
    expect(updatedState.phase).toBe('scope_mvp');
    expect(updatedState.completedPhases).toContain('problem_vision');
    expect(updatedState.currentPhaseProgress).toBe(0);
  });

  it('keeps only valid expertPanel role ids and dedupes references', () => {
    const reply = `Here's the panel and a reference.
[STATE_UPDATE]:{"expertPanel":["project_manager","wizard","solution_architect","project_manager"],"references":[{"kind":"url","value":"https://x"},{"kind":"folder","value":"./src"},{"kind":"banana","value":"nope"},{"kind":"url","value":"https://x"}]}`;
    const { updatedState } = parseWorkshopUpdate(reply, base());
    expect(updatedState.expertPanel).toEqual(['project_manager', 'solution_architect']); // 'wizard' dropped, deduped
    expect(updatedState.references).toHaveLength(2); // banana dropped, dup dropped
  });

  it('never throws on malformed STATE_UPDATE JSON (drops it)', () => {
    const reply = `ok\n[STATE_UPDATE]:{not valid json`;
    const { updatedState } = parseWorkshopUpdate(reply, base());
    expect(updatedState.title).toBe('');
  });

  it('parses measurable GOALS (tolerant: bad priority → mvp, dups dropped, blanks dropped)', () => {
    const reply = `Captured the goals.
[STATE_UPDATE]:{"goals":[{"statement":"Export a CSV ledger","priority":"mvp"},{"statement":"Runs offline","priority":"banana"},{"statement":"Export a CSV ledger","priority":"later"},{"statement":"  ","priority":"mvp"}]}`;
    const { updatedState } = parseWorkshopUpdate(reply, base());
    expect(updatedState.goals).toHaveLength(2); // dup + blank dropped
    expect(updatedState.goals[0].statement).toBe('Export a CSV ledger');
    expect(updatedState.goals[0].priority).toBe('mvp');
    expect(updatedState.goals[1].statement).toBe('Runs offline');
    expect(updatedState.goals[1].priority).toBe('mvp'); // 'banana' → default 'mvp'
    expect(updatedState.goals.every((g) => typeof g.id === 'string' && g.id.length > 0)).toBe(true);
  });

  it('accretes goals across turns without re-adding the same statement', () => {
    let s = base();
    s = parseWorkshopUpdate('[STATE_UPDATE]:{"goals":[{"statement":"A","priority":"mvp"}]}', s).updatedState;
    s = parseWorkshopUpdate('[STATE_UPDATE]:{"goals":[{"statement":"A","priority":"later"},{"statement":"B","priority":"later"}]}', s).updatedState;
    expect(s.goals.map((g) => g.statement)).toEqual(['A', 'B']);
    expect(s.goals[0].priority).toBe('mvp'); // first capture wins (dedup on statement)
  });

  it('derives canFinalize once a problem AND a scope/MVP exist', () => {
    let s = base();
    s = parseWorkshopUpdate('[STATE_UPDATE]:{"problemStatement":"a problem"}', s).updatedState;
    expect(s.canFinalize).toBe(false);
    s = parseWorkshopUpdate('[STATE_UPDATE]:{"scope":"v1 scope"}', s).updatedState;
    expect(s.canFinalize).toBe(true);
  });

  it('TOLERANT: captures a BARE JSON object (no [STATE_UPDATE] marker) and strips it from the reply', () => {
    // The exact bug: Mistral emits bare JSON, not the marker → fields were lost.
    const reply = `Got it — here is the scope.\n\n{ "scope": "Fiat tx only", "currentPhaseProgress": 30 }`;
    const { cleanResponse, updatedState } = parseWorkshopUpdate(reply, base());
    expect(updatedState.scope).toBe('Fiat tx only');
    expect(updatedState.currentPhaseProgress).toBe(30);
    expect(cleanResponse).not.toMatch(/\{/);          // raw JSON stripped from the visible reply
    expect(cleanResponse).toContain('Got it');
  });

  it('TOLERANT: captures a fenced ```json block', () => {
    const reply = 'Locked.\n\n```json\n{"mvp":"nightly batch rules","canFinalize":true}\n```';
    const { updatedState } = parseWorkshopUpdate(reply, base());
    expect(updatedState.mvp).toBe('nightly batch rules');
    expect(updatedState.canFinalize).toBe(true);
  });

  it('FALLBACK: advances the phase on currentPhaseProgress=100 even WITHOUT a [PHASE_COMPLETE] marker', () => {
    const reply = `References are complete.\n\n{ "references": [{"kind":"url","value":"https://x"}], "currentPhaseProgress": 100 }`;
    const s = base();
    s.phase = 'references';
    const { updatedState, phaseChanged } = parseWorkshopUpdate(reply, s);
    expect(phaseChanged).toBe(true);
    expect(updatedState.phase).toBe('tech_stack');          // advanced references -> tech_stack
    expect(updatedState.completedPhases).toContain('references');
    expect(updatedState.currentPhaseProgress).toBe(0);
  });

  it('MONOTONIC: a later canFinalize:false does NOT slam the gate shut', () => {
    let s = base();
    s = parseWorkshopUpdate('[STATE_UPDATE]:{"problemStatement":"p","scope":"s"}', s).updatedState;
    expect(s.canFinalize).toBe(true);
    s = parseWorkshopUpdate('[STATE_UPDATE]:{"canFinalize":false}', s).updatedState;
    expect(s.canFinalize).toBe(true); // still finalize-ready (problem + scope persist)
  });

  it('marks canFinalize after all 8 phases complete', () => {
    let s = base();
    for (const phase of WORKSHOP_PHASES) {
      s = parseWorkshopUpdate(`done\n[PHASE_COMPLETE:${phase}]`, s).updatedState;
    }
    expect(s.completedPhases).toHaveLength(WORKSHOP_PHASES.length);
    expect(s.canFinalize).toBe(true);
  });
});

// ── assembleCharter: deterministic crystallization ─────────────────────────

describe('assembleCharter (charter assembles from collected state)', () => {
  it('builds an Engagement-shaped charter from the captured fields', () => {
    const s = createDefaultWorkshopState('standard', 'project');
    s.title = 'FreelanceBudget';
    s.problemStatement = 'Freelancers cannot see cashflow';
    s.scope = 'Track income/expense, forecast runway';
    s.mvp = 'Manual entry + a runway number';
    s.jurisdiction = 'Sweden';
    s.language = 'typescript';
    s.techStack = ['react', 'postgres'];
    s.expertPanel = ['project_manager', 'engineering_expert'];
    s.chosenFrameworks = [{ id: 'gdpr', name: 'GDPR', origin: 'user' }];
    s.risks = [{ id: 'r1', description: 'bank API access', severity: 'high' }];
    s.goals = [{ id: 'g1', statement: 'User sees a runway number', priority: 'mvp' }];
    s.summary = 'A local-first freelance budgeting MVP.';

    const charter = assembleCharter(s);
    expect(charter.title).toBe('FreelanceBudget');
    expect(charter.problemStatement).toBe('Freelancers cannot see cashflow');
    expect(charter.goals).toHaveLength(1);
    expect(charter.goals[0].statement).toBe('User sees a runway number');
    expect(charter.language).toBe('typescript');
    expect(charter.techStack).toEqual(['react', 'postgres']);
    expect(charter.expertPanel).toEqual(['project_manager', 'engineering_expert']);
    expect(charter.chosenFrameworks[0].name).toBe('GDPR');
    expect(charter.risks[0].severity).toBe('high');
    expect(charter.summary).toBe('A local-first freelance budgeting MVP.');
  });

  it('defaults the panel to the full core team when none was chosen', () => {
    const s = createDefaultWorkshopState('standard', 'project');
    s.problemStatement = 'a problem';
    const charter = assembleCharter(s);
    expect(charter.expertPanel).toHaveLength(CORE_TEAM_ROLES.length);
  });

  it('falls back to a title + summary when the model never set them', () => {
    const s = createDefaultWorkshopState('lite', 'project');
    s.problemStatement = 'Build a tiny CLI to rename files in bulk';
    const charter = assembleCharter(s);
    expect(charter.title.length).toBeGreaterThan(0);
    expect(charter.summary).toContain('rename files');
  });
});

// ── Turn loop: model id, resumability, framework auto-suggest at phase 4 ────

describe('createCodingWorkshopEngine (mocked orchestrator — no live LLM)', () => {
  it('runs the turn on Mistral Large and persists/round-trips state (resumability)', async () => {
    onlyMistral();
    const db = fakeStore();
    let calledModel = '';
    const engine = createCodingWorkshopEngine(db, {
      callOrchestrator: async ({ model }) => {
        calledModel = model;
        return `Got it.\n[STATE_UPDATE]:{"problemStatement":"a real problem"}\n[PHASE_COMPLETE:problem_vision]`;
      },
    });

    const session = await engine.createSession('standard', 'project', 'user-1');
    const turn = await engine.processUserResponse(session.id, 'I want to build X');
    expect(calledModel).toBe('mistral-large-latest'); // resolveCodingModel('orchestrator')
    expect(turn.phaseChanged).toBe(true);
    expect(turn.state.phase).toBe('scope_mvp');

    // RESUMABILITY: a fresh getSession reads the persisted state at the new phase.
    const resumed = await engine.getSession(session.id);
    expect(resumed!.state.phase).toBe('scope_mvp');
    expect(resumed!.state.problemStatement).toBe('a real problem');
    expect(resumed!.state.conversationHistory.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('invokes the framework auto-suggest the first turn on the guidelines phase', async () => {
    onlyMistral();
    const db = fakeStore();
    let suggestCalled = 0;
    const stub: ChosenFramework[] = [{ id: 'gdpr', name: 'GDPR', reference: '2016/679', origin: 'suggested' }];
    const engine = createCodingWorkshopEngine(db, {
      callOrchestrator: async () => 'Which guidelines should we lean on?',
      suggestFrameworks: async () => { suggestCalled++; return stub; },
    });

    const session = await engine.createSession('standard', 'project', 'user-1');
    // Force the persisted state onto the guidelines phase, then take a turn.
    const s = (await engine.getSession(session.id))!.state;
    s.phase = 'guidelines';
    s.problemStatement = 'A regulated fintech app handling personal data';
    await engine.updateSessionState(session.id, s);

    const turn = await engine.processUserResponse(session.id, 'what should we follow?');
    expect(suggestCalled).toBe(1);
    expect(turn.state.suggestedFrameworks.map((f) => f.name)).toContain('GDPR');

    // It does NOT re-run once suggestions already exist.
    await engine.processUserResponse(session.id, 'ok keep GDPR');
    expect(suggestCalled).toBe(1);
  });

  it('startConversation seeds the opening turn without a synthetic user message', async () => {
    onlyMistral();
    const db = fakeStore();
    const engine = createCodingWorkshopEngine(db, {
      callOrchestrator: async () => 'Welcome — what are you building?',
    });
    const session = await engine.createSession('standard', 'project', null);
    const { response, state } = await engine.startConversation(session.id);
    expect(response).toBe('Welcome — what are you building?');
    expect(state.conversationHistory.some((m) => m.content === '__START_WORKSHOP__')).toBe(false);
    expect(state.conversationHistory.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });
});

// ── finalize seeds a coding_project (PG-backed; skips without DATABASE_URL) ─

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
}
const DATABASE_URL = resolveDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

describeOrSkip('finalize seeds a Studio coding_project', () => {
  let db: DatabaseAdapter;
  const created: { codingProjectId?: string; projectId?: string; sessionId?: string } = {};

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
  }, 60_000);

  afterAll(async () => {
    try {
      if (created.codingProjectId) await db.run('DELETE FROM coding_projects WHERE id = ?', created.codingProjectId);
      if (created.projectId) await db.run('DELETE FROM projects WHERE id = ?', created.projectId);
      if (created.sessionId) await db.run('DELETE FROM coding_workshop_sessions WHERE id = ?', created.sessionId);
    } finally {
      await db.close();
    }
  });

  it('assembles a charter and inserts projects + coding_projects rows, linking the session', async () => {
    onlyMistral();
    const engine = createCodingWorkshopEngine(db, {
      callOrchestrator: async () =>
        `Charter ready.\n[STATE_UPDATE]:{"title":"Workshop Seed Test","problemStatement":"prove the seed works","scope":"a minimal seed","language":"typescript","techStack":["vite"],"expertPanel":["project_manager"]}`,
    });

    const session = await engine.createSession('standard', 'project', 'user-seed');
    created.sessionId = session.id;
    await engine.processUserResponse(session.id, 'lock the charter');

    const result = await engine.finalize(session.id, 'user-seed');
    created.codingProjectId = result.codingProjectId;
    created.projectId = result.projectId;

    expect(result.charter.problemStatement).toBe('prove the seed works');

    const cp = await db.get<{ name: string; tier: string; tech_stack: string; discovery_summary: string }>(
      'SELECT name, tier, tech_stack, discovery_summary FROM coding_projects WHERE id = ?',
      result.codingProjectId,
    );
    expect(cp).toBeTruthy();
    expect(cp!.name).toBe('Workshop Seed Test');
    expect(cp!.tier).toBe('large');
    expect(JSON.parse(cp!.tech_stack)).toContain('vite');
    expect(cp!.discovery_summary).toContain('prove the seed works');

    // The session is linked + completed (so a re-finalize is idempotent).
    const ws = await db.get<{ coding_project_id: string; status: string }>(
      'SELECT coding_project_id, status FROM coding_workshop_sessions WHERE id = ?',
      session.id,
    );
    expect(ws!.coding_project_id).toBe(result.codingProjectId);
    expect(ws!.status).toBe('completed');

    // Re-finalize returns the SAME project (idempotent), not a duplicate.
    const again = await engine.finalize(session.id, 'user-seed');
    expect(again.codingProjectId).toBe(result.codingProjectId);
  });

  it('refuses to finalize without a problem statement', async () => {
    onlyMistral();
    const engine = createCodingWorkshopEngine(db, {
      callOrchestrator: async () => 'still talking',
    });
    const session = await engine.createSession('standard', 'project', 'user-empty');
    await db.run('DELETE FROM coding_workshop_sessions WHERE id = ?', session.id).catch(() => {});
    // recreate cleanly (the engine inserted it) — assert finalize throws on an empty charter.
    const fresh = await engine.createSession('standard', 'project', 'user-empty');
    await expect(engine.finalize(fresh.id)).rejects.toThrow(/problem statement/i);
    await db.run('DELETE FROM coding_workshop_sessions WHERE id = ?', fresh.id);
  });
});
