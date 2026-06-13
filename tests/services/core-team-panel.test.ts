/**
 * core-team-panel.test.ts — ANTON Studio P2 (the enforced 7-expert gate).
 *
 * NO live LLM: the expert/chair model calls are injected stubs (callExpert /
 * callChair / extractDissent). Covers:
 *   - parsePanelVerdict tolerance (garbage/partial → dropped, never invented)
 *   - the CODE-COMPUTED worst-of rollup + blocking = mandatory-role dissent
 *   - runCoreTeamPanel's three modes + which model id each uses
 *     (expert = Mistral Medium; chair = Mistral Large via resolveCodingModel)
 *   - persistence writes 7 coding_reviews rows + 1 coding_panel_decisions row
 *   - the gate guard (isGateBlocked / assertGatePassed) blocks when blocking
 *
 * The pure-logic + model-id tests run with a fake DB (always). The persistence
 * + gate-guard tests need DATABASE_URL and skip otherwise (council-dissent
 * route-test pattern).
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parsePanelVerdict,
  computeRollup,
  runCoreTeamPanel,
  persistPanelDecision,
  getGateStatus,
  isGateBlocked,
  assertGatePassed,
  GateBlockedError,
  buildPanelSystemPrompt,
  CORE_TEAM_ROLES,
  GATE_MANDATORY_ROLES,
  type ExpertReview,
  type PanelGate,
} from '../../server/services/core-team-panel.js';
import { resetCodingModelStrategyForTests } from '../../server/services/coding-model-resolver.js';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

// ── env: force a single provider so resolveCodingModel is deterministic ─────
const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let saved: Record<string, string | undefined>;

function onlyMistral(): void {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.MISTRAL_API_KEY = 'test-key';
}

function noopDb(): DatabaseAdapter {
  return {
    dialect: 'sqlite',
    async get() { return undefined; },
    async all() { return []; },
    async run() { return { changes: 0, lastInsertRowid: 0 } as RunResult; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(noopDb()); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
}

// A full, well-formed panel response (all 7 roles, all endorse) → easy to mutate.
function panelJson(overrides: Record<string, 'endorse' | 'flag' | 'dissent'> = {}): string {
  const experts = CORE_TEAM_ROLES.map((r) => ({
    role: r.label,
    verdict: overrides[r.id] ?? 'endorse',
    concerns: overrides[r.id] === 'dissent' ? [{ point: 'fundamental issue', severity: 'high' }] : [],
    required_change: overrides[r.id] ? 'fix it' : null,
    rationale: `${r.label} view`,
  }));
  return '```json\n' + JSON.stringify({
    gate: 'start',
    experts,
    agreements: ['the plan is coherent'],
    dissents: Object.keys(overrides).length ? ['budget untested'] : [],
    open_questions: ['who owns rollback?'],
    synthesis: 'chair markdown here',
  }) + '\n```';
}

beforeEach(() => {
  saved = {}; for (const k of ENV_KEYS) { saved[k] = process.env[k]; }
  resetCodingModelStrategyForTests();
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  resetCodingModelStrategyForTests();
});

// ── Pure parser ─────────────────────────────────────────────────────────────

describe('parsePanelVerdict (tolerant — never invents)', () => {
  it('parses a clean 7-expert response', () => {
    const parsed = parsePanelVerdict(panelJson(), 'start');
    expect(parsed).not.toBeNull();
    expect(parsed!.experts).toHaveLength(7);
    expect(parsed!.synthesis).toBe('chair markdown here');
    expect(parsed!.agreements).toContain('the plan is coherent');
  });

  it('takes the LAST fenced json block (model thought out loud first)', () => {
    const text = '```json\n{"experts":"garbage"}\n```\nthinking...\n' + panelJson();
    const parsed = parsePanelVerdict(text, 'start');
    expect(parsed!.experts).toHaveLength(7);
  });

  it('drops experts with an unknown role or missing/garbage verdict — never invents', () => {
    const text = '```json\n' + JSON.stringify({
      experts: [
        { role: 'Project Manager', verdict: 'endorse', concerns: [] },
        { role: 'Wizard', verdict: 'endorse' },           // unknown role → dropped
        { role: 'UX Expert', verdict: 'banana' },          // garbage verdict → dropped
        { role: 'Business Expert' },                       // no verdict → dropped
        { role: 'DevSecOps Expert', verdict: 'dissent', concerns: [{ point: 'x', severity: 'high' }] },
      ],
    }) + '\n```';
    const parsed = parsePanelVerdict(text, 'start');
    expect(parsed).not.toBeNull();
    const ids = parsed!.experts.map((e) => e.role).sort();
    expect(ids).toEqual(['devsecops_expert', 'project_manager']); // only the two valid rows
  });

  it('dedupes a repeated role (keeps the first)', () => {
    const text = '```json\n' + JSON.stringify({
      experts: [
        { role: 'Project Manager', verdict: 'endorse', rationale: 'first' },
        { role: 'Project Manager', verdict: 'dissent', rationale: 'second' },
      ],
    }) + '\n```';
    const parsed = parsePanelVerdict(text, 'start');
    expect(parsed!.experts).toHaveLength(1);
    expect(parsed!.experts[0].verdict).toBe('endorse');
  });

  it('returns null on no JSON / non-object / no usable experts (honest failure)', () => {
    expect(parsePanelVerdict('the panel could not run', 'start')).toBeNull();
    expect(parsePanelVerdict('```json\n[1,2,3]\n```', 'start')).toBeNull();
    expect(parsePanelVerdict('```json\n{"experts":[]}\n```', 'start')).toBeNull();
    expect(parsePanelVerdict('```json\n{"experts":[{"role":"nobody","verdict":"endorse"}]}\n```', 'start')).toBeNull();
  });

  it('marks mandatory roles per gate', () => {
    const parsed = parsePanelVerdict(panelJson(), 'build')!;
    const arch = parsed.experts.find((e) => e.role === 'solution_architect')!;
    const pm = parsed.experts.find((e) => e.role === 'project_manager')!;
    expect(arch.mandatory).toBe(true);  // architect is mandatory at the build gate
    expect(pm.mandatory).toBe(false);   // PM is not mandatory at the build gate
  });
});

// ── Code-computed rollup (the gate is decided in code) ──────────────────────

function reviews(spec: Array<[string, 'endorse' | 'flag' | 'dissent', boolean]>): ExpertReview[] {
  return spec.map(([role, verdict, mandatory]) => ({
    role, roleLabel: role, verdict, concerns: [], required_change: null, rationale: null, mandatory,
  }));
}

describe('computeRollup (worst-of + blocking = mandatory dissent)', () => {
  it('all endorse → endorse, not blocking', () => {
    const r = computeRollup(reviews([['a', 'endorse', true], ['b', 'endorse', false]]));
    expect(r.panel_verdict).toBe('endorse');
    expect(r.blocking).toBe(false);
  });

  it('flags only → flag, not blocking', () => {
    const r = computeRollup(reviews([['a', 'flag', true], ['b', 'endorse', true]]));
    expect(r.panel_verdict).toBe('flag');
    expect(r.blocking).toBe(false);
  });

  it('one dissent → dissent (worst-of)', () => {
    const r = computeRollup(reviews([['a', 'endorse', false], ['b', 'dissent', false]]));
    expect(r.panel_verdict).toBe('dissent');
  });

  it('blocking iff a MANDATORY role dissents (non-mandatory dissent does not block)', () => {
    const nonMandatory = computeRollup(reviews([['a', 'dissent', false], ['b', 'endorse', true]]));
    expect(nonMandatory.panel_verdict).toBe('dissent');
    expect(nonMandatory.blocking).toBe(false);

    const mandatory = computeRollup(reviews([['a', 'dissent', true], ['b', 'endorse', false]]));
    expect(mandatory.blocking).toBe(true);
  });
});

// ── runCoreTeamPanel: modes + the model id each uses (no live LLM) ──────────

describe('runCoreTeamPanel (mocked model — modes + model ids)', () => {
  it('fast mode: one expert call on Mistral Medium, no chair', async () => {
    onlyMistral();
    let calledModel = '';
    const result = await runCoreTeamPanel(noopDb(), {
      projectId: 'p1', gate: 'start', artifact: 'a real plan to review',
      mode: 'fast',
      callExpert: async ({ model }) => { calledModel = model; return panelJson(); },
    });
    expect(calledModel).toBe('mistral-medium-latest'); // resolveCodingModel('expert')
    expect(result.expertModel).toBe('mistral-medium-latest');
    expect(result.chairModel).toBeNull();
    expect(result.verdict.experts).toHaveLength(7);
    expect(result.verdict.panel_verdict).toBe('endorse');
    expect(result.verdict.blocking).toBe(false);
  });

  it('thorough mode: chair synthesis runs on Mistral Large and overrides synthesis', async () => {
    onlyMistral();
    let chairModel = '';
    const result = await runCoreTeamPanel(noopDb(), {
      projectId: 'p1', gate: 'finish', artifact: 'final artifact for sign-off',
      mode: 'thorough',
      callExpert: async () => panelJson(),
      callChair: async ({ model }) => { chairModel = model; return 'CHAIR SYNTHESIS (Large)'; },
    });
    expect(chairModel).toBe('mistral-large-latest'); // resolveCodingModel('orchestrator')
    expect(result.chairModel).toBe('mistral-large-latest');
    expect(result.verdict.synthesis).toBe('CHAIR SYNTHESIS (Large)');
  });

  it('balanced mode: a dissent-extraction pass produces a ledger (gate still code-computed)', async () => {
    onlyMistral();
    const result = await runCoreTeamPanel(noopDb(), {
      projectId: 'p1', gate: 'build', artifact: 'build artifact',
      mode: 'balanced',
      callExpert: async () => panelJson({ solution_architect: 'dissent' }),
      extractDissent: async () => ({
        status: 'extracted',
        ledger: { agreements: [], dissents: [{ member: 'Architect', position: 'scale risk', severity: 'high', round: null }], openQuestions: [] },
        model: 'stub-utility',
      }),
    });
    expect(result.dissentLedger?.dissents[0].member).toBe('Architect');
    // architect is mandatory at build → blocking computed in code
    expect(result.verdict.blocking).toBe(true);
    expect(result.verdict.panel_verdict).toBe('dissent');
  });

  it('throws (no fabricated verdict) when the model output is unparseable', async () => {
    onlyMistral();
    await expect(runCoreTeamPanel(noopDb(), {
      projectId: 'p1', gate: 'start', artifact: 'x',
      mode: 'fast',
      callExpert: async () => 'the model refused',
    })).rejects.toThrow(/no parseable verdict/i);
  });
});

// ── Block-confirmation re-vote (calibration: cut single-sample false blocks) ──
describe('runCoreTeamPanel block-confirmation re-vote', () => {
  // callExpert that returns a fixed sequence of responses (one per call).
  function seq(responses: string[]): { fn: () => Promise<string>; calls: { n: number } } {
    let i = 0;
    const calls = { n: 0 };
    return {
      calls,
      fn: async () => { calls.n++; const r = responses[Math.min(i, responses.length - 1)]; i++; return r; },
    };
  }

  it('first vote passes → NO re-vote (one call), blockConfirmation null', async () => {
    onlyMistral();
    const s = seq([panelJson()]); // all endorse
    const result = await runCoreTeamPanel(noopDb(), {
      projectId: 'p', gate: 'start', artifact: 'a', callExpert: s.fn,
    });
    expect(s.calls.n).toBe(1);
    expect(result.verdict.blocking).toBe(false);
    expect(result.blockConfirmation).toBeNull();
  });

  it('a single blocking vote among non-blocking re-votes is DOWNGRADED (gate not blocked)', async () => {
    onlyMistral();
    // start gate: project_manager is mandatory. Vote 1 dissents (blocks), re-votes endorse.
    const s = seq([panelJson({ project_manager: 'dissent' }), panelJson(), panelJson()]);
    const result = await runCoreTeamPanel(noopDb(), {
      projectId: 'p', gate: 'start', artifact: 'a', callExpert: s.fn,
    });
    expect(s.calls.n).toBe(3); // 1 + DEFAULT_BLOCK_CONFIRM(2)
    expect(result.blockConfirmation).toEqual({ votes: 3, blocked: 1 });
    expect(result.verdict.blocking).toBe(false); // 1/3 < majority → NOT blocked
  });

  it('a MAJORITY of blocking votes KEEPS the block', async () => {
    onlyMistral();
    const s = seq([panelJson({ project_manager: 'dissent' }), panelJson({ project_manager: 'dissent' }), panelJson()]);
    const result = await runCoreTeamPanel(noopDb(), {
      projectId: 'p', gate: 'start', artifact: 'a', callExpert: s.fn,
    });
    expect(result.blockConfirmation).toEqual({ votes: 3, blocked: 2 });
    expect(result.verdict.blocking).toBe(true); // 2/3 → blocked
  });

  it('blockConfirmationVotes:0 disables the re-vote (single shot still blocks)', async () => {
    onlyMistral();
    const s = seq([panelJson({ project_manager: 'dissent' })]);
    const result = await runCoreTeamPanel(noopDb(), {
      projectId: 'p', gate: 'start', artifact: 'a', callExpert: s.fn, blockConfirmationVotes: 0,
    });
    expect(s.calls.n).toBe(1);
    expect(result.verdict.blocking).toBe(true);
    expect(result.blockConfirmation).toBeNull();
  });
});

describe('buildPanelSystemPrompt calibration', () => {
  it('raises the dissent bar and pins per-gate context', () => {
    const start = buildPanelSystemPrompt('start');
    expect(start).toContain('GATE CONTEXT (start)');
    expect(start).toMatch(/RESERVED for a genuine BLOCKER/);
    expect(start).toMatch(/THIS IS THE DEFAULT verdict for a concern/);
    const testing = buildPanelSystemPrompt('testing');
    expect(testing).toContain('GATE CONTEXT (testing)');
    expect(testing).toMatch(/already PASSED its acceptance tests/);
  });
});

// ── System prompt sanity (pure) ─────────────────────────────────────────────

describe('buildPanelSystemPrompt', () => {
  it('enumerates all seven roles, marks the gate-mandatory ones, and forbids the model setting the gate', () => {
    const sys = buildPanelSystemPrompt('build');
    for (const r of CORE_TEAM_ROLES) expect(sys).toContain(r.label);
    expect(sys).toMatch(/MANDATORY for this gate/);
    expect(sys).toMatch(/computed downstream by code/i);
    // architect is mandatory at build → tagged; PM is not
    const archLine = sys.split('\n').find((l) => l.includes('IT/Solution Architect'))!;
    expect(archLine).toContain('MANDATORY');
  });
});

// ── Persistence + gate guard (PG-backed; skips without DATABASE_URL) ─────────

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

describeOrSkip('persistence + the enforced gate guard', () => {
  let db: DatabaseAdapter;
  const projectsRowId = randomUUID();
  const codingProjectId = randomUUID();

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    // A projects row + a coding_projects row to satisfy the FK.
    await db.run(`INSERT INTO projects (id, name) VALUES (?, ?)`, projectsRowId, 'ct-panel-test');
    await db.run(
      `INSERT INTO coding_projects (id, project_id, name) VALUES (?, ?, ?)`,
      codingProjectId, projectsRowId, 'ct-panel-coding',
    );
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM coding_panel_decisions WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_reviews WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_projects WHERE id = ?', codingProjectId);
      await db.run('DELETE FROM projects WHERE id = ?', projectsRowId);
    } finally {
      await db.close();
    }
  });

  it('persists 7 coding_reviews rows + 1 coding_panel_decisions record', async () => {
    onlyMistral();
    const result = await runCoreTeamPanel(db, {
      projectId: codingProjectId, gate: 'start', artifact: 'a plan to review',
      mode: 'fast',
      callExpert: async () => panelJson(),
    });
    const decision = await persistPanelDecision(db, result, codingProjectId);
    expect(decision.panel_verdict).toBe('endorse');
    expect(decision.blocking).toBe(false);

    const rows = await db.all<{ verdict: string; gate: string }>(
      'SELECT verdict, gate FROM coding_reviews WHERE coding_project_id = ? AND gate = ?',
      codingProjectId, 'start',
    );
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.gate === 'start')).toBe(true);

    const dec = await db.get<{ blocking: boolean; model: string }>(
      'SELECT blocking, model FROM coding_panel_decisions WHERE coding_project_id = ? AND gate = ?',
      codingProjectId, 'start',
    );
    expect(dec!.model).toBe('mistral-medium-latest');
  });

  it('a re-run UPSERTs the decision (one record per gate) and replaces the 7 rows', async () => {
    onlyMistral();
    const result = await runCoreTeamPanel(db, {
      projectId: codingProjectId, gate: 'start', artifact: 'a revised plan',
      mode: 'fast',
      callExpert: async () => panelJson({ project_manager: 'flag' }),
    });
    await persistPanelDecision(db, result, codingProjectId);
    const rows = await db.all('SELECT id FROM coding_reviews WHERE coding_project_id = ? AND gate = ?', codingProjectId, 'start');
    expect(rows).toHaveLength(7); // replaced, not accumulated
    const decs = await db.all('SELECT id FROM coding_panel_decisions WHERE coding_project_id = ? AND gate = ?', codingProjectId, 'start');
    expect(decs).toHaveLength(1); // upserted
  });

  it('the gate guard blocks when a mandatory role dissents', async () => {
    onlyMistral();
    // PM is mandatory at the START gate → a PM dissent must block.
    const result = await runCoreTeamPanel(db, {
      projectId: codingProjectId, gate: 'start', artifact: 'a plan with a fatal flaw',
      mode: 'fast',
      callExpert: async () => panelJson({ project_manager: 'dissent' }),
    });
    expect(result.verdict.blocking).toBe(true);
    await persistPanelDecision(db, result, codingProjectId);

    expect(await isGateBlocked(db, codingProjectId, 'start')).toBe(true);
    await expect(assertGatePassed(db, codingProjectId, 'start')).rejects.toBeInstanceOf(GateBlockedError);

    const status = await getGateStatus(db, codingProjectId, 'start');
    expect(status.decided).toBe(true);
    expect(status.blocking).toBe(true);
  });

  it('a non-blocking decision lets the guard pass; an un-reviewed gate is not blocked', async () => {
    onlyMistral();
    const result = await runCoreTeamPanel(db, {
      projectId: codingProjectId, gate: 'testing', artifact: 'tests all green',
      mode: 'fast',
      callExpert: async () => panelJson(),
    });
    await persistPanelDecision(db, result, codingProjectId);
    await expect(assertGatePassed(db, codingProjectId, 'testing')).resolves.toBeUndefined();

    // 'finish' was never reviewed → not blocked, but requireDecision throws.
    expect(await isGateBlocked(db, codingProjectId, 'finish')).toBe(false);
    await expect(assertGatePassed(db, codingProjectId, 'finish')).resolves.toBeUndefined();
    await expect(assertGatePassed(db, codingProjectId, 'finish', { requireDecision: true }))
      .rejects.toBeInstanceOf(GateBlockedError);
  });
});

// ── GATE_MANDATORY_ROLES sanity ─────────────────────────────────────────────

describe('GATE_MANDATORY_ROLES', () => {
  it('FINISH makes every role mandatory (nothing ships past a single dissent)', () => {
    expect(GATE_MANDATORY_ROLES.finish).toHaveLength(CORE_TEAM_ROLES.length);
  });
  it('every mandatory id is a real role', () => {
    const ids = new Set(CORE_TEAM_ROLES.map((r) => r.id));
    for (const gate of ['start', 'build', 'testing', 'finish'] as PanelGate[]) {
      for (const id of GATE_MANDATORY_ROLES[gate]) expect(ids.has(id)).toBe(true);
    }
  });
});
