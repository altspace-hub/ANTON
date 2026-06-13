/**
 * coding-studio-orchestrator-git.test.ts — ANTON Studio P6 REAL GIT wiring.
 *
 * Asserts the orchestrator drives the INJECTED git seams in the right order and
 * that git is NON-FATAL bookkeeping:
 *   - gitEnsureRepo runs ONCE (at the first build advance, before the START gate)
 *   - gitCheckoutRelease runs when entering the release (the branch-per-release)
 *   - gitCommitTask runs AFTER a task goes done (the commit-per-task), and the
 *     calls are ordered ensureRepo → checkoutRelease → commitTask
 *   - a git seam that THROWS does NOT abort the loop (the run still reaches done;
 *     a git_error appears in the step log)
 *   - a nothingToCommit no-op is logged honestly (still a git_commit entry)
 *
 * A separate test file from the existing orchestrator suite (by request, to
 * avoid collision). Same DB-backed pattern: needs DATABASE_URL (real schema)
 * and skips otherwise. Every other external seam (LLM/exec/panel/integration)
 * is injected — no live anything.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  createStudioOrchestrator,
  type OrchestratorDeps,
} from '../../server/services/coding-studio-orchestrator.js';
import {
  computeRollup,
  CORE_TEAM_ROLES,
  type RunPanelResult,
  type ExpertReview,
  type PanelGate,
} from '../../server/services/core-team-panel.js';
import { resetCodingModelStrategyForTests } from '../../server/services/coding-model-resolver.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

// ── env: force Mistral so resolveCodingModel is deterministic ────────────────
const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let savedEnv: Record<string, string | undefined>;
function onlyMistral(): void {
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  process.env.MISTRAL_API_KEY = 'test-key';
}
function restoreEnv(): void {
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
}

// ── A clean (all-endorse) panel result so gates always pass. ─────────────────
function makeResult(gate: PanelGate): RunPanelResult {
  const mandatory = new Set(
    gate === 'start' ? ['project_manager', 'business_expert', 'product_designer']
    : gate === 'build' ? ['solution_architect', 'devsecops_expert', 'engineering_expert']
    : gate === 'testing' ? ['ux_expert', 'devsecops_expert', 'engineering_expert']
    : CORE_TEAM_ROLES.map((r) => r.id),
  );
  const experts: ExpertReview[] = CORE_TEAM_ROLES.map((r) => ({
    role: r.id, roleLabel: r.label, verdict: 'endorse',
    concerns: [], required_change: null, rationale: `${r.label} view`,
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

describeOrSkip('orchestrator REAL GIT wiring (injected seams)', () => {
  let db: DatabaseAdapter;
  const projectsRowId = randomUUID();
  const codingProjectId = randomUUID();

  // Ordered record of git seam calls (the order assertion reads this).
  let gitOrder: string[];
  let ensureRepoCalls: number;
  let checkoutCalls: Array<{ releaseNumber: number; releaseName: string }>;
  let commitCalls: Array<{ taskNumber: number | string; title: string }>;
  // Knobs to force git failures / no-op commits.
  let failEnsureRepo: boolean;
  let failCommit: boolean;
  let commitNoOp: boolean;

  function deps(): OrchestratorDeps {
    return {
      callPlanner: async () => ({
        releaseName: 'MVP', summary: 'build it',
        tasks: [{ title: 'Task A', description: 'do A', files: ['src/a.ts'] }],
      }),
      callCodegen: async () => '```ts\n// FILE: src/a.ts\nexport const a = 1;\n```',
      runPanel: async (_db, opts) => makeResult(opts.gate),
      validateWorkspace: async () => ({ ok: true, resolved: '/fake/ws' }),
      readWorkspaceFile: async () => null,
      applyFiles: async () => ({ written: 1, unchanged: 0, backupDir: '' }),
      runTests: async () => ({ ran: true, exitCode: 0, durationMs: 5, timedOut: false, stdoutTail: '1 passed', stderrTail: '', outputTruncated: false }),
      resolveProjectDsn: async () => null,
      // ── The injected git seams (what this suite asserts on) ──
      gitEnsureRepo: async (_ws, _d, _pid) => {
        gitOrder.push('ensureRepo');
        ensureRepoCalls++;
        if (failEnsureRepo) throw new Error('simulated git init failure');
        return { initialized: true, alreadyRepo: false };
      },
      gitCheckoutRelease: async (_ws, releaseNumber, releaseName, _d, _rid) => {
        gitOrder.push('checkoutRelease');
        checkoutCalls.push({ releaseNumber, releaseName });
        return { branch: `studio/r0${releaseNumber}-mvp`, switchedExisting: false };
      },
      gitCommitTask: async (_ws, task, _d, _tid) => {
        gitOrder.push('commitTask');
        commitCalls.push({ taskNumber: task.taskNumber, title: task.title });
        if (failCommit) throw new Error('simulated git commit failure');
        return commitNoOp
          ? { committed: false, hash: null, nothingToCommit: true }
          : { committed: true, hash: 'abc123def456', nothingToCommit: false };
      },
      integration: {
        captureTestResult: () => {},
        captureReviewFlag: () => {},
        captureDependencyCve: () => {},
        captureTechDebt: () => {},
        captureArchDecision: () => {},
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
    await db.run('INSERT INTO projects (id, name) VALUES (?, ?)', projectsRowId, 'studio-git-test');
    await db.run(
      "INSERT INTO coding_projects (id, project_id, name, tier, discovery_summary, test_command) VALUES (?, ?, ?, 'large', ?, ?)",
      codingProjectId, projectsRowId, 'Git-wired build', '# Charter\n\nBuild a tiny module.', JSON.stringify(['node', '--run', 'test']),
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
    gitOrder = [];
    ensureRepoCalls = 0;
    checkoutCalls = [];
    commitCalls = [];
    failEnsureRepo = false;
    failCommit = false;
    commitNoOp = false;
    resetCodingModelStrategyForTests();
    await db.run('DELETE FROM coding_test_runs WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_workspace_applications WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM knowledge_atoms WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_panel_decisions WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_reviews WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_tasks WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_releases WHERE coding_project_id = ?', codingProjectId);
    await db.run('DELETE FROM coding_studio_runs WHERE coding_project_id = ?', codingProjectId);
  });

  it('calls the git seams in order: ensureRepo → checkoutRelease → commitTask', async () => {
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId });
    await orch.advance(codingProjectId);          // → awaiting_plan
    await orch.approvePlan(codingProjectId);       // → running → done
    const run = await orch.getRun(codingProjectId);
    expect(run?.status).toBe('done');

    // ensureRepo runs exactly once; checkout + commit each at least once.
    expect(ensureRepoCalls).toBe(1);
    expect(checkoutCalls.length).toBe(1);
    expect(commitCalls.length).toBe(1);

    // Order: ensureRepo BEFORE checkoutRelease BEFORE commitTask.
    const iEnsure = gitOrder.indexOf('ensureRepo');
    const iCheckout = gitOrder.indexOf('checkoutRelease');
    const iCommit = gitOrder.indexOf('commitTask');
    expect(iEnsure).toBeGreaterThanOrEqual(0);
    expect(iEnsure).toBeLessThan(iCheckout);
    expect(iCheckout).toBeLessThan(iCommit);

    // The release branch used the real release number + name.
    expect(checkoutCalls[0]).toEqual({ releaseNumber: 1, releaseName: 'MVP' });
    // The commit carried the 1-based task number + title.
    expect(commitCalls[0]).toEqual({ taskNumber: 1, title: 'Task A' });

    // A git_commit step-log entry recorded the hash.
    expect(run?.stepLog.some((e) => e.kind === 'git_init')).toBe(true);
    expect(run?.stepLog.some((e) => e.kind === 'git_branch')).toBe(true);
    expect(run?.stepLog.some((e) => e.kind === 'git_commit')).toBe(true);
  });

  it('a git ensureRepo failure does NOT abort the loop (run still reaches done)', async () => {
    failEnsureRepo = true;
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId });
    await orch.advance(codingProjectId);
    await orch.approvePlan(codingProjectId);
    const run = await orch.getRun(codingProjectId);
    // Git failed but the build is the product — the run completes.
    expect(run?.status).toBe('done');
    // A non-fatal git_error was logged.
    expect(run?.stepLog.some((e) => e.kind === 'git_error')).toBe(true);
    // The loop still went on to checkout + commit (git failures are independent).
    expect(checkoutCalls.length).toBe(1);
    expect(commitCalls.length).toBe(1);
  });

  it('a git commit failure does NOT abort the loop and logs git_error', async () => {
    failCommit = true;
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId });
    await orch.advance(codingProjectId);
    await orch.approvePlan(codingProjectId);
    const run = await orch.getRun(codingProjectId);
    expect(run?.status).toBe('done');
    expect(run?.stepLog.some((e) => e.kind === 'git_error')).toBe(true);
    // The task still completed (commit is bookkeeping).
    expect(run?.plan?.tasks[0].status).toBe('done');
  });

  it('a nothingToCommit no-op is logged honestly (still a git_commit entry)', async () => {
    commitNoOp = true;
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId });
    await orch.advance(codingProjectId);
    await orch.approvePlan(codingProjectId);
    const run = await orch.getRun(codingProjectId);
    expect(run?.status).toBe('done');
    const commitEntry = run?.stepLog.find((e) => e.kind === 'git_commit');
    expect(commitEntry).toBeTruthy();
    expect(commitEntry?.message).toMatch(/No changes to commit/i);
  });
});
