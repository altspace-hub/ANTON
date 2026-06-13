/**
 * coding-studio-orchestrator.test.ts — ANTON Studio P5 (the iterate-to-finish
 * ORCHESTRATOR).
 *
 * NO live LLM, NO real exec, NO real DB-create: every external seam is injected
 *   (callPlanner, callCodegen, runPanel, applyFiles, runTests, validateWorkspace,
 *    readWorkspaceFile, resolveProjectDsn, integration). The DETERMINISTIC loop
 * logic is what we exercise:
 *   - plan → awaiting_plan checkpoint; approvePlan → running
 *   - the loop plans → panel(START) → panel(BUILD) → codegen → apply → test →
 *     revise-to-green within the cap → TESTING → FINISH(thorough) → done
 *   - a BLOCKING panel HALTS the run (assertGatePassed → status=blocked)
 *   - the revise cap is enforced (gives up after N, marks the task failed honestly)
 *   - STOP halts mid-loop (status=stopped)
 *   - codegen uses the DEVSTRAL id; the orchestrator/panel use Large/Medium via
 *     resolveCodingModel
 *   - captureReviewFlag fires on a panel flag; captureDependencyCve on a CVE
 *
 * The pure-logic tests (clampReviseCap / buildPlanArtifact) run with NO db. The
 * loop tests need DATABASE_URL (real schema; migration 240 applied) and skip
 * otherwise — the council-dissent / core-team route-test pattern.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  createStudioOrchestrator,
  clampReviseCap,
  buildPlanArtifact,
  parseProjectGoals,
  computeGoalCoverage,
  buildGoalAlignmentArtifact,
  type OrchestratorDeps,
  type StudioPlan,
  type StudioGoal,
} from '../../server/services/coding-studio-orchestrator.js';
import {
  computeRollup,
  CORE_TEAM_ROLES,
  type RunPanelResult,
  type ExpertReview,
  type PanelGate,
} from '../../server/services/core-team-panel.js';
import { resolveCodingModel, resetCodingModelStrategyForTests } from '../../server/services/coding-model-resolver.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

// ── env: force Mistral so resolveCodingModel is deterministic (devstral codegen) ─
const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let savedEnv: Record<string, string | undefined>;
function onlyMistral(): void {
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  process.env.MISTRAL_API_KEY = 'test-key';
}
function restoreEnv(): void {
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
}

// ── Build a RunPanelResult (verdict rolled up in code) for the injected panel ──
function makeResult(gate: PanelGate, overrides: Record<string, 'endorse' | 'flag' | 'dissent'> = {}): RunPanelResult {
  const mandatory = new Set(
    gate === 'start' ? ['project_manager', 'business_expert', 'product_designer']
    : gate === 'build' ? ['solution_architect', 'devsecops_expert', 'engineering_expert']
    : gate === 'testing' ? ['ux_expert', 'devsecops_expert', 'engineering_expert']
    : CORE_TEAM_ROLES.map((r) => r.id),
  );
  const experts: ExpertReview[] = CORE_TEAM_ROLES.map((r) => ({
    role: r.id, roleLabel: r.label,
    verdict: overrides[r.id] ?? 'endorse',
    concerns: [], required_change: overrides[r.id] ? 'fix it' : null, rationale: `${r.label} view`,
    mandatory: mandatory.has(r.id),
  }));
  const { panel_verdict, blocking } = computeRollup(experts);
  return {
    verdict: { gate, experts, agreements: [], dissents: [], open_questions: [], synthesis: 'chair', panel_verdict, blocking },
    mode: gate === 'finish' ? 'thorough' : 'fast',
    expertModel: 'mistral-medium-latest',
    chairModel: gate === 'finish' ? 'mistral-large-latest' : null,
    dissentLedger: null,
  };
}

// ── Pure-logic tests (no DB) ─────────────────────────────────────────────────
describe('orchestrator pure helpers', () => {
  it('clampReviseCap clamps to [1,20] and defaults to 4', () => {
    expect(clampReviseCap(undefined)).toBe(4);
    expect(clampReviseCap(0)).toBe(1);
    expect(clampReviseCap(100)).toBe(20);
    expect(clampReviseCap(3)).toBe(3);
    expect(clampReviseCap(NaN)).toBe(4);
  });

  it('buildPlanArtifact renders the release + per-task status', () => {
    const plan: StudioPlan = {
      releaseId: 'r', releaseName: 'MVP', summary: 'do the thing',
      tasks: [
        { taskId: 't1', releaseId: 'r', title: 'Task one', description: 'desc', files: [], status: 'done', reviseRounds: 2 },
        { taskId: 't2', releaseId: 'r', title: 'Task two', description: '', files: [], status: 'failed', reviseRounds: 0 },
      ],
    };
    const art = buildPlanArtifact(plan);
    expect(art).toContain('# Release: MVP');
    expect(art).toContain('[done] Task one (2 revise round(s))');
    expect(art).toContain('[failed] Task two');
  });

  // ── Goals model (FINISH-gate goal-alignment, pure helpers) ──────────────────
  it('parseProjectGoals is tolerant (drops garbage, defaults priority, never throws)', () => {
    expect(parseProjectGoals(null)).toEqual([]);
    expect(parseProjectGoals('{not json')).toEqual([]);
    expect(parseProjectGoals('{"not":"array"}')).toEqual([]);
    const goals = parseProjectGoals(JSON.stringify([
      { id: 'g1', statement: 'Export CSV', priority: 'mvp' },
      { id: 'g2', statement: 'Offline', priority: 'banana' }, // bad priority → mvp
      { statement: '  ' }, // blank → dropped
      { id: 'g4', statement: 'Later thing', priority: 'later' },
    ]));
    expect(goals.map((g) => g.statement)).toEqual(['Export CSV', 'Offline', 'Later thing']);
    expect(goals[1].priority).toBe('mvp');
    expect(goals[2].priority).toBe('later');
  });

  function goalPlan(): { goals: StudioGoal[]; plan: StudioPlan } {
    const goals: StudioGoal[] = [
      { id: 'g1', statement: 'Export a CSV ledger', priority: 'mvp' },
      { id: 'g2', statement: 'Runs offline', priority: 'mvp' },
      { id: 'g3', statement: 'Dark mode', priority: 'later' },
    ];
    const plan: StudioPlan = {
      releaseId: 'r', releaseName: 'MVP', summary: '',
      tasks: [
        { taskId: 't1', releaseId: 'r', title: 'CSV export', description: '', files: [], goalIds: ['g1'], status: 'done', reviseRounds: 0 },
        { taskId: 't2', releaseId: 'r', title: 'Offline cache', description: '', files: [], goalIds: ['g2'], status: 'failed', reviseRounds: 4 },
        { taskId: 't3', releaseId: 'r', title: 'Infra setup', description: '', files: [], goalIds: [], status: 'done', reviseRounds: 0 },
      ],
    };
    return { goals, plan };
  }

  it('computeGoalCoverage classifies covered / at_risk / unaddressed deterministically', () => {
    const { goals, plan } = goalPlan();
    const cov = computeGoalCoverage(goals, plan);
    expect(cov.find((c) => c.goal.id === 'g1')!.status).toBe('covered');   // done task mapped
    expect(cov.find((c) => c.goal.id === 'g2')!.status).toBe('at_risk');   // only a failed task
    expect(cov.find((c) => c.goal.id === 'g3')!.status).toBe('unaddressed'); // no task mapped
    expect(cov.find((c) => c.goal.id === 'g1')!.doneTasks).toEqual(['CSV export']);
    expect(cov.find((c) => c.goal.id === 'g2')!.failedTasks).toEqual(['Offline cache']);
  });

  it('HONESTY: a done-but-UNVERIFIED task (no test) is NOT counted as covered', () => {
    const goals: StudioGoal[] = [{ id: 'g1', statement: 'Do it', priority: 'mvp' }];
    const plan: StudioPlan = {
      releaseId: 'r', releaseName: 'R', summary: '',
      tasks: [{ taskId: 't1', releaseId: 'r', title: 'T1', description: '', files: [], goalIds: ['g1'], status: 'done', reviseRounds: 0, verified: false }],
    };
    const cov = computeGoalCoverage(goals, plan);
    expect(cov[0].status).toBe('at_risk');            // applied but unverified → not proven
    expect(cov[0].unverifiedTasks).toEqual(['T1']);
    expect(cov[0].doneTasks).toEqual([]);
    plan.tasks[0].verified = true;                    // now its tests ran green
    expect(computeGoalCoverage(goals, plan)[0].status).toBe('covered');
  });

  it('computeGoalCoverage tolerates a pre-goals plan (tasks without goalIds)', () => {
    const goals: StudioGoal[] = [{ id: 'g1', statement: 'X', priority: 'mvp' }];
    const legacyPlan = {
      releaseId: 'r', releaseName: 'L', summary: '',
      tasks: [{ taskId: 't', releaseId: 'r', title: 'old', description: '', files: [], status: 'done', reviseRounds: 0 }],
    } as unknown as StudioPlan;
    const cov = computeGoalCoverage(goals, legacyPlan);
    expect(cov[0].status).toBe('unaddressed'); // no goalIds → not mapped, but no throw
  });

  it('buildGoalAlignmentArtifact surfaces uncovered MVP goals first + falls back without goals', () => {
    const { goals, plan } = goalPlan();
    const art = buildGoalAlignmentArtifact(goals, plan);
    expect(art).toContain('Goal-alignment snapshot');
    expect(art).toContain('MVP goals NOT yet covered');
    expect(art).toContain('Runs offline');     // g2 at_risk → in the gap list
    expect(art).toContain('## Goal coverage');
    expect(art).toContain('# Release: MVP');    // still includes the plan artifact
    // No goals → identical to the plan artifact (honest: nothing to align against).
    expect(buildGoalAlignmentArtifact([], plan)).toBe(buildPlanArtifact(plan));
  });

  it('resolveCodingModel maps the roles to the locked Mistral ids', () => {
    savedEnv = {}; onlyMistral();
    resetCodingModelStrategyForTests();
    try {
      expect(resolveCodingModel('orchestrator')).toBe('mistral-large-latest');
      expect(resolveCodingModel('expert')).toBe('mistral-medium-latest');
      expect(resolveCodingModel('codegen')).toBe('devstral-medium-latest');
    } finally {
      resetCodingModelStrategyForTests();
      restoreEnv();
    }
  });
});

// ── Loop tests (real schema; injected seams) ─────────────────────────────────
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

describeOrSkip('orchestrator loop (injected LLM/exec/panel)', () => {
  let db: DatabaseAdapter;
  const projectsRowId = randomUUID();
  const codingProjectId = randomUUID();

  // Tracking for the injected seams.
  let panelByGate: Partial<Record<PanelGate, RunPanelResult>>;
  let codegenCalls: Array<{ model: string }>;
  let testOutcomeQueue: boolean[]; // pop per test run; true = pass
  let reviewFlags: Array<{ role: string; verdict: string }>;
  let cveCalls: Array<{ packageName: string }>;
  let plannerModel = '';

  function deps(): OrchestratorDeps {
    return {
      callPlanner: async (input) => {
        plannerModel = input.model;
        return { releaseName: 'MVP', summary: 'build it', tasks: [{ title: 'Task A', description: 'do A', files: ['src/a.ts'] }] };
      },
      callCodegen: async (input) => {
        codegenCalls.push({ model: input.model });
        return '```ts\n// FILE: src/a.ts\nexport const a = 1;\n```';
      },
      runPanel: async (_db, opts) => panelByGate[opts.gate] ?? makeResult(opts.gate),
      validateWorkspace: async () => ({ ok: true, resolved: '/fake/ws' }),
      readWorkspaceFile: async () => null,
      applyFiles: async () => ({ written: 1, unchanged: 0, backupDir: '' }),
      runTests: async () => {
        const pass = testOutcomeQueue.length ? testOutcomeQueue.shift()! : true;
        return { ran: true, exitCode: pass ? 0 : 1, durationMs: 5, timedOut: false, stdoutTail: pass ? '1 passed' : '1 failed', stderrTail: '', outputTruncated: false };
      },
      resolveProjectDsn: async () => null,
      integration: {
        // Only the hooks the orchestrator calls need real behaviour.
        captureTestResult: () => {},
        captureReviewFlag: (input) => { reviewFlags.push({ role: input.role, verdict: input.verdict }); },
        captureDependencyCve: (input) => { cveCalls.push({ packageName: input.packageName }); },
        captureTechDebt: () => {},
        captureArchDecision: () => {},
        // Unused by the loop but part of the type.
        mintCodingAtom: async () => null,
        scoreOutput: async () => null,
        saveVersion: async () => ({ id: 0, version_number: 1, label: null }),
        getVersionHistory: async () => [],
        diffVersions: async () => null,
        extractKnowledge: async () => {},
      } as unknown as OrchestratorDeps['integration'],
    };
  }

  beforeAll(async () => {
    savedEnv = {}; onlyMistral();
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    await db.run('INSERT INTO projects (id, name) VALUES (?, ?)', projectsRowId, 'studio-orch-test');
    await db.run(
      "INSERT INTO coding_projects (id, project_id, name, tier, discovery_summary, test_command) VALUES (?, ?, ?, 'large', ?, ?)",
      codingProjectId, projectsRowId, 'Orchestrated build', '# Charter\n\nBuild a tiny module.', JSON.stringify(['node', '--run', 'test']),
    );
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM coding_test_runs WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_workspace_applications WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM knowledge_atoms WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_panel_decisions WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_reviews WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_tasks WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_releases WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_studio_runs WHERE coding_project_id = ?', codingProjectId);
      await db.run('DELETE FROM coding_projects WHERE id = ?', codingProjectId);
      await db.run('DELETE FROM projects WHERE id = ?', projectsRowId);
    } finally {
      restoreEnv();
      await db.close();
    }
  });

  beforeEach(async () => {
    panelByGate = {};
    codegenCalls = [];
    testOutcomeQueue = [];
    reviewFlags = [];
    cveCalls = [];
    resetCodingModelStrategyForTests();
    // Reset run + derived rows between tests.
    await db.run('DELETE FROM coding_test_runs WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_workspace_applications WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM knowledge_atoms WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_panel_decisions WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_reviews WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_tasks WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_releases WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_studio_runs WHERE coding_project_id = ?', codingProjectId);
  });

  it('plans, then parks at the plan-approval checkpoint', async () => {
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId });
    const run = await orch.advance(codingProjectId);
    expect(run.status).toBe('awaiting_plan');
    expect(run.plan?.tasks).toHaveLength(1);
    expect(plannerModel).toBe('mistral-large-latest'); // orchestrator role
    // Real coding_tasks rows were persisted.
    const tasks = await db.all('SELECT id FROM coding_tasks WHERE coding_project_id = ?', codingProjectId);
    expect(tasks).toHaveLength(1);
  });

  it('runs to done: plan → START → BUILD → codegen(devstral) → apply → test green → TESTING → FINISH', async () => {
    testOutcomeQueue = [true]; // first test passes
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId });
    await orch.advance(codingProjectId);           // → awaiting_plan
    await orch.approvePlan(codingProjectId);        // → running + advance to done
    const run = await orch.getRun(codingProjectId);
    expect(run?.status).toBe('done');
    // codegen used the DEVSTRAL id (the locked codegen role).
    expect(codegenCalls.every((c) => c.model === 'devstral-medium-latest')).toBe(true);
    expect(codegenCalls.length).toBeGreaterThanOrEqual(1);
    // All 4 gates were decided.
    const decisions = await db.all('SELECT gate FROM coding_panel_decisions WHERE coding_project_id = ?', codingProjectId);
    expect(decisions.map((d: any) => d.gate).sort()).toEqual(['build', 'finish', 'start', 'testing']);
  });

  it('revises to green within the cap (an initial fail then a pass)', async () => {
    testOutcomeQueue = [false, true]; // fail, then pass after one revision
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId, reviseCap: 4 });
    await orch.advance(codingProjectId);
    await orch.approvePlan(codingProjectId);
    const run = await orch.getRun(codingProjectId);
    expect(run?.status).toBe('done');
    // One revision application was recorded (the metric the A/B reads).
    const revs = await db.all("SELECT id FROM coding_workspace_applications WHERE coding_project_id = ? AND kind = 'revision'", codingProjectId);
    expect(revs.length).toBe(1);
    expect(codegenCalls.length).toBe(2); // initial + 1 revision
  });

  it('GAP 2: persists REAL accumulated codegen tokens + completion_record per task', async () => {
    testOutcomeQueue = [false, true]; // initial fail + 1 revision = 2 codegen calls
    const d = deps();
    d.callCodegen = async (input) => {
      codegenCalls.push({ model: input.model });
      return { text: '```ts\n// FILE: src/a.ts\nexport const a = 1;\n```', inputTokens: 100, outputTokens: 50 };
    };
    const orch = createStudioOrchestrator(db, d);
    await orch.startOrResume({ codingProjectId, reviseCap: 4 });
    await orch.advance(codingProjectId);
    await orch.approvePlan(codingProjectId);
    const row = await db.get<{ tokens_consumed: string; completion_record: string; execution_plan: string }>(
      'SELECT tokens_consumed, completion_record, execution_plan FROM coding_tasks WHERE coding_project_id = ? LIMIT 1', codingProjectId);
    expect(JSON.parse(row!.tokens_consumed)).toEqual({ input: 200, output: 100, cost_usd: 0 }); // 2 calls x (100,50)
    const completion = JSON.parse(row!.completion_record);
    expect(completion.finalStatus).toBe('done');
    expect(completion.verified).toBe(true);
    expect(JSON.parse(row!.execution_plan).targetFiles).toBeDefined();
  });

  it('GAP 2: a plain-string callCodegen yields zero tokens (back-compat)', async () => {
    testOutcomeQueue = [true];
    const orch = createStudioOrchestrator(db, deps()); // default stub returns a STRING
    await orch.startOrResume({ codingProjectId });
    await orch.advance(codingProjectId);
    await orch.approvePlan(codingProjectId);
    const row = await db.get<{ tokens_consumed: string }>('SELECT tokens_consumed FROM coding_tasks WHERE coding_project_id = ? LIMIT 1', codingProjectId);
    expect(JSON.parse(row!.tokens_consumed)).toEqual({ input: 0, output: 0, cost_usd: 0 });
  });

  it('SAFETY NET: an unexpected throw marks the run failed (not stuck in running)', async () => {
    const d = deps();
    d.runTests = async () => { throw new Error('simulated DB/exec outage'); };
    const orch = createStudioOrchestrator(db, d);
    await orch.startOrResume({ codingProjectId });
    await orch.advance(codingProjectId);
    const run = await orch.approvePlan(codingProjectId); // drives the loop → runTests throws
    expect(run.status).toBe('failed');             // recorded, NOT left in 'running'
    expect(run.lastError).toContain('simulated');  // the reason is durable
  });

  it('GAP 1: the revise codegen prompt carries the earlier-attempts history; progress_log persists it', async () => {
    testOutcomeQueue = [false, true]; // fail then pass
    const prompts: string[] = [];
    const d = deps();
    d.callCodegen = async (input) => { prompts.push(input.user); return '```ts\n// FILE: src/a.ts\nexport const a = 1;\n```'; };
    const orch = createStudioOrchestrator(db, d);
    await orch.startOrResume({ codingProjectId, reviseCap: 4 });
    await orch.advance(codingProjectId);
    await orch.approvePlan(codingProjectId);
    expect(prompts.length).toBe(2);
    expect(prompts[0]).not.toContain('Earlier attempts'); // the initial pass has no history
    expect(prompts[1]).toContain('Earlier attempts');      // the revise sees the failed attempt
    const row = await db.get<{ progress_log: string }>('SELECT progress_log FROM coding_tasks WHERE coding_project_id = ? LIMIT 1', codingProjectId);
    const log = JSON.parse(row!.progress_log) as Array<{ failure_summary: string }>;
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(log[0].failure_summary).toBeTruthy();
  });

  it('enforces the revise cap: marks the task failed honestly after N rounds', async () => {
    // Always fail → cap=2 → initial + 2 revisions then give up.
    testOutcomeQueue = [false, false, false, false, false];
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId, reviseCap: 2 });
    await orch.advance(codingProjectId);
    await orch.approvePlan(codingProjectId);
    const run = await orch.getRun(codingProjectId);
    // The task failed; the run still completes the gates → done (honest, with last_error).
    expect(run?.plan?.tasks[0].status).toBe('failed');
    const revs = await db.all("SELECT id FROM coding_workspace_applications WHERE coding_project_id = ? AND kind = 'revision'", codingProjectId);
    expect(revs.length).toBe(2); // exactly the cap — never more
  });

  it('a BLOCKING panel halts the run (assertGatePassed → blocked)', async () => {
    // START gate: a mandatory role dissents → blocking.
    panelByGate.start = makeResult('start', { project_manager: 'dissent' });
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId });
    await orch.advance(codingProjectId);
    await orch.approvePlan(codingProjectId);
    const run = await orch.getRun(codingProjectId);
    expect(run?.status).toBe('blocked');
    expect(run?.awaitingGate).toBe('start');
    // No codegen happened — the loop halted at the gate before building.
    expect(codegenCalls.length).toBe(0);
  });

  it('a panel FLAG fires the deferred captureReviewFlag hook', async () => {
    panelByGate.start = makeResult('start', { ux_expert: 'flag' }); // non-mandatory at start → not blocking
    testOutcomeQueue = [true];
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId });
    await orch.advance(codingProjectId);
    await orch.approvePlan(codingProjectId);
    expect(reviewFlags.some((f) => f.verdict === 'flag')).toBe(true);
  });

  it('the dependency audit wires captureDependencyCve for vulnerable deps', async () => {
    // Seed a vulnerable dependency.
    await db.run(
      `INSERT INTO coding_dependencies (id, coding_project_id, package_name, current_version, ecosystem, vulnerability_count)
       VALUES (?, ?, 'left-pad', '1.0.0', 'npm', 3)`,
      randomUUID(), codingProjectId,
    );
    testOutcomeQueue = [true];
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId });
    await orch.advance(codingProjectId);
    await orch.approvePlan(codingProjectId);
    expect(cveCalls.some((c) => c.packageName === 'left-pad')).toBe(true);
    await db.run('DELETE FROM coding_dependencies WHERE coding_project_id = ?', codingProjectId);
  });

  it('STOP halts mid-loop (status=stopped)', async () => {
    // Stop is checked each tick; request it AFTER planning but BEFORE approving
    // so the loop's first in-tick stop-check halts it before any gate/codegen.
    testOutcomeQueue = [true];
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId });
    await orch.advance(codingProjectId);            // → awaiting_plan
    await orch.requestStop(codingProjectId);        // STOP requested
    const run = await orch.approvePlan(codingProjectId); // advance → first stop-check halts
    expect(run.status).toBe('stopped');
    expect(codegenCalls.length).toBe(0); // never reached codegen
  });
});
