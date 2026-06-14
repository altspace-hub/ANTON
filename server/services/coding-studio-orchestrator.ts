// ── ANTON Studio — Iterate-to-finish ORCHESTRATOR (Studio P5) ──────────────
//
// The SERVER-SIDE autonomous build loop that drives a Studio project from its
// charter to finish, within the user's MORE-AUTONOMOUS budget
// (CODING_STUDIO_DESIGN_2026-06-13.md §B / §C-req6 / §D.2 / §F-P5 +
//  LOCKED DECISION 6).
//
// It adopts a JOB-RUNNER pattern (a coding_studio_runs row the UI polls + an
// in-process resumable `advance` tick — mirroring the mission-runner approach;
// the design notes Missions lack a background runner, so a simple resumable
// tick driven by the route is fine). The loop:
//
//   1. charter → a release + task PLAN (resolveCodingModel('orchestrator') =
//      Mistral Large; PM/architecture). The plan is the human checkpoint
//      (status=awaiting_plan → approvePlan()).
//   2. At each GATE run the P2 core-team panel (runCoreTeamPanel):
//        START  before kickoff       (mode fast)
//        BUILD  before implementing   (mode fast)
//        TESTING after impl           (mode fast)
//        FINISH before done           (mode THOROUGH)
//      After each panel → assertGatePassed. A GateBlockedError HALTS the run
//      (status=blocked) with the blocking verdict surfaced — NEVER auto-overridden.
//   3. For each task (post plan-approval, autonomy=more: write+run+revise across
//      tasks WITHOUT asking per-edit):
//        codegen  = resolveCodingModel('codegen') = Devstral (NON-thinking; if
//                   reasoning is needed escalate to 'orchestrator'/Large) →
//        anton-coding-file-blocks/v1 → P3 parseFileBlocks → diff →
//        applyFilesToWorkspace (writes with backups) → P3 runProjectTests →
//        on FAIL: feed the failure + the project's atoms (P4 buildAtomLayer with
//        codingProjectId → the "## LESSONS FROM THIS PROJECT" header) into a
//        REVISE codegen, RE-RUN, iterate to green up to the REVISE-ROUND CAP
//        (configurable, default 4). Mint atoms each step (P4 captureTestResult).
//   4. Advance task-by-task; a STOP control is ALWAYS available (stop_requested
//      checked each tick); the panel gates + the revise cap are ALWAYS enforced
//      regardless of autonomy.
//   5. WIRE the two deferred P4 hooks: after a panel returns flag/dissent experts
//      → captureReviewFlag for each; after a dependency audit (when the run does
//      one) → captureDependencyCve. (One coding-integration instance per run.)
//
// EVERYTHING external is INJECTABLE so tests mock it (no live LLM, no real exec,
// no real DB-create): the codegen call, the test runner, the apply step, the
// panel runner, and the integration. The deterministic loop logic is what the
// tests exercise.

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import {
  resolveCodingModel,
  providerForCodingModel,
  codingRoleSupportsThinking,
  type CodingRole,
} from './coding-model-resolver.js';
import {
  runCoreTeamPanel,
  persistPanelDecision,
  assertGatePassed,
  GateBlockedError,
  type PanelGate,
  type PanelMode,
  type RunPanelOptions,
  type RunPanelResult,
} from './core-team-panel.js';
import {
  parseFileBlocks,
  buildFileDiff,
  buildApplicationRecord,
  applyFilesToWorkspace,
  validateWorkspacePath,
  resolveTargetPath,
  runProjectTests,
  parseTestSummary,
  validateTestArgv,
  FILE_BLOCK_FORMAT_VERSION,
  type ApplicationFileEntry,
  type FileDiff,
  type TestRunResult,
  type ExecFileImpl,
} from './coding-workspace.js';
import { createCodingIntegration } from './coding-integration.js';
import { buildAtomLayer } from './prompt-builder.js';
import { resolveScopedDsn } from './coding-studio-provisioner.js';
import { callChat } from './provider-router.js';
import {
  ensureRepo as gitEnsureRepoImpl,
  checkoutReleaseBranch as gitCheckoutReleaseImpl,
  commitTask as gitCommitTaskImpl,
  type EnsureRepoResult,
  type CheckoutBranchResult,
  type CommitTaskResult,
} from './coding-git.js';
import { readFile } from 'node:fs/promises';

// ── Public types ────────────────────────────────────────────────────────────

export type StudioRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_plan'
  | 'awaiting_gate'
  | 'blocked'
  | 'done'
  | 'stopped'
  | 'failed';

export type StudioAutonomy = 'more' | 'ask';

/** A single task in the orchestrator-produced plan (a coding_tasks row id + meta). */
export interface PlanTask {
  taskId: string;
  releaseId: string;
  title: string;
  description: string;
  /** Workspace-relative files the task is expected to touch (a hint for codegen). */
  files: string[];
  /** Which charter goal ids this task addresses ([] = infra/unmapped). */
  goalIds: string[];
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  /** Revise rounds spent on this task (capped at revise_cap). */
  reviseRounds: number;
  /** Whether this task's tests ran GREEN (false for a done-but-unverified task). */
  verified?: boolean;
}

export interface StudioPlan {
  releaseId: string;
  releaseName: string;
  summary: string;
  tasks: PlanTask[];
}

/** A measurable charter goal (mirrors CharterGoal — persisted on coding_projects.goals). */
export interface StudioGoal {
  id: string;
  statement: string;
  priority: 'mvp' | 'later';
}

/**
 * Parse the JSON-stored coding_projects.goals into a clean StudioGoal[].
 * Tolerant: drops malformed entries, never invents (mirrors the workshop's
 * tolerant parse). Exported for the FINISH-gate snapshot + tests.
 */
export function parseProjectGoals(raw: string | null | undefined): StudioGoal[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const out: StudioGoal[] = [];
  for (const g of parsed) {
    if (!g || typeof g !== 'object') continue;
    const rec = g as Record<string, unknown>;
    const statement = typeof rec.statement === 'string' ? rec.statement.trim() : '';
    if (!statement) continue;
    out.push({
      id: typeof rec.id === 'string' && rec.id ? rec.id : statement.slice(0, 40),
      statement,
      priority: rec.priority === 'later' ? 'later' : 'mvp',
    });
  }
  return out;
}

export interface StudioRun {
  id: string;
  codingProjectId: string;
  status: StudioRunStatus;
  currentTask: string | null;
  autonomy: StudioAutonomy;
  reviseCap: number;
  stopRequested: boolean;
  plan: StudioPlan | null;
  awaitingGate: PanelGate | null;
  lastError: string | null;
  stepLog: StudioStepLogEntry[];
}

export interface StudioStepLogEntry {
  at: string;
  kind:
    | 'plan'
    | 'gate'
    | 'gate_blocked'
    | 'codegen'
    | 'apply'
    | 'test'
    | 'revise'
    | 'atom'
    | 'task_done'
    | 'task_failed'
    | 'dependency_audit'
    | 'git_init'
    | 'git_branch'
    | 'git_commit'
    | 'git_error'
    | 'stop'
    | 'done'
    | 'error';
  taskId?: string | null;
  gate?: PanelGate | null;
  message: string;
}

// ── Injectable seams (so tests mock the LLM + exec + panel + DB-create) ──────

export interface CodegenInput {
  /** The concrete codegen model id (resolveCodingModel('codegen') = Devstral). */
  model: string;
  system: string;
  user: string;
}

/** Codegen seam return — a plain string (back-compat) OR text + real token usage. */
export type CodegenResult =
  | string
  | { text: string; inputTokens?: number; outputTokens?: number; costUsd?: number };

/** One revise-attempt record — persisted to coding_tasks.progress_log (last 5),
 *  and fed back (condensed) so a revise does not repeat a failed approach (GAP 1). */
interface AttemptRecord {
  round: number;
  kind: 'initial' | 'revision';
  at: string;
  files_changed: string[];
  test_exit_code: number | null;
  failure_summary: string;
}

/** Normalize a CodegenResult into text + numeric token usage (NaN/undefined → 0). */
export function normalizeCodegenResult(
  result: CodegenResult,
): { text: string; inputTokens: number; outputTokens: number; costUsd: number } {
  if (typeof result === 'string') {
    return { text: result, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
  if (result && typeof result === 'object' && 'text' in result) {
    const num = (v: unknown): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      text: String((result as { text?: unknown }).text ?? ''),
      inputTokens: num((result as { inputTokens?: unknown }).inputTokens),
      outputTokens: num((result as { outputTokens?: unknown }).outputTokens),
      costUsd: num((result as { costUsd?: unknown }).costUsd),
    };
  }
  return { text: '', inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

/** Condense the attempt history into a bounded revise-prompt section (~600 chars). */
export function formatAttemptHistory(attempts: AttemptRecord[]): string {
  if (attempts.length === 0) return '';
  const lines = attempts.map((a) => {
    const files = a.files_changed.length
      ? a.files_changed.slice(0, 3).join(', ') + (a.files_changed.length > 3 ? `, +${a.files_changed.length - 3} more` : '')
      : '(no files)';
    const err = a.failure_summary.replace(/\s+/g, ' ').slice(0, 120);
    return `- Round ${a.round} (${a.kind}): changed [${files}] -> failed: ${err}`;
  });
  let body = lines.join('\n');
  if (body.length > 600) body = body.slice(0, 597) + '...';
  return body;
}

export interface OrchestratorPlanInput {
  /** resolveCodingModel('orchestrator') = Mistral Large. */
  model: string;
  charter: string;
  projectName: string;
  /** The charter's measurable goals — the planner maps each task to the goal ids it serves. */
  goals?: StudioGoal[];
}

/** What the LLM plan step returns (parsed into a StudioPlan with real task ids). */
export interface RawPlanTask {
  title: string;
  description?: string;
  files?: string[];
  /** Charter goal ids this task addresses (the planner maps tasks → goals). */
  goalIds?: string[];
}

export interface OrchestratorDeps {
  /**
   * Test seam — the PLAN step (charter → release/task plan). Returns the raw
   * task list; the orchestrator persists real coding_releases/coding_tasks rows
   * and assigns ids. Default = a live orchestrator(Large) call.
   */
  callPlanner?: (input: OrchestratorPlanInput) => Promise<{ releaseName: string; summary: string; tasks: RawPlanTask[] }>;
  /**
   * Test seam — the CODEGEN step (devstral). Returns the raw
   * anton-coding-file-blocks/v1 text — EITHER a plain string OR an object
   * carrying real token usage. Backward-compatible: existing stubs return a
   * string; the live default returns { text, inputTokens, outputTokens } so the
   * orchestrator can persist real per-task tokens_consumed. Default = a live
   * codegen(Devstral) call.
   */
  callCodegen?: (input: CodegenInput) => Promise<CodegenResult>;
  /** Test seam — the P2 panel run. Default = runCoreTeamPanel. */
  runPanel?: (db: DatabaseAdapter, opts: RunPanelOptions) => Promise<RunPanelResult>;
  /**
   * Test seam — read a workspace file's current content (for the diff). Default
   * reads from disk. In tests an in-memory map avoids a real FS.
   */
  readWorkspaceFile?: (workspaceAbs: string, relPath: string) => Promise<string | null>;
  /**
   * Test seam — apply parsed files. Default = applyFilesToWorkspace (real FS
   * write with backups). In tests a stub records the write without touching disk.
   */
  applyFiles?: (params: { workspaceAbs: string; files: Array<{ path: string; content: string }>; applicationId: string }) => Promise<{ written: number; unchanged: number; backupDir: string }>;
  /**
   * Test seam — run the project's test command. Default = runProjectTests
   * (real execFile). In tests a stub returns canned pass/fail.
   */
  runTests?: (params: {
    argv: string[];
    cwd: string;
    projectDatabaseUrl?: string | null;
    // Studio P6 — container isolation. When the project opted into docker mode,
    // the orchestrator passes containerMode='docker' so the test step runs inside
    // `docker run` (runProjectTests decides the REAL mode honestly + falls back to
    // local if docker is unavailable/disabled). Omitted in tests → local path.
    containerMode?: 'docker' | 'local' | null;
    language?: string | null;
  }) => Promise<TestRunResult>;
  /**
   * Test seam — resolve the project's scoped DSN (PROJECT_DATABASE_URL). Default
   * = resolveScopedDsn. Never logged.
   */
  resolveProjectDsn?: (db: DatabaseAdapter, codingProjectId: string) => Promise<string | null>;
  /**
   * Test seam — validate + resolve the bound workspace dir. Default =
   * validateWorkspacePath. In tests returns a stub resolved dir (no real FS).
   */
  validateWorkspace?: (dir: string | null | undefined) => Promise<{ ok: boolean; resolved?: string; error?: string }>;
  /**
   * Test seam — the coding-integration instance (atom capture + the two deferred
   * P4 hooks). Default = createCodingIntegration(db). One per run.
   */
  integration?: Awaited<ReturnType<typeof createCodingIntegration>>;
  /**
   * Test seam — REAL GIT (Studio P6). Defaults wire coding-git.ts. A git failure
   * is NON-FATAL bookkeeping: the orchestrator logs git_error and continues (the
   * build is the product). Persistence is done inside coding-git via db.
   *   - gitEnsureRepo: init the repo + author + .gitignore (idempotent).
   *   - gitCheckoutRelease: create/switch studio/r<NN>-<slug>.
   *   - gitCommitTask: add -A + commit; nothingToCommit is an honest no-op.
   */
  gitEnsureRepo?: (workspaceAbs: string, db: DatabaseAdapter, codingProjectId: string) => Promise<EnsureRepoResult>;
  gitCheckoutRelease?: (workspaceAbs: string, releaseNumber: number, releaseName: string, db: DatabaseAdapter, releaseId: string) => Promise<CheckoutBranchResult>;
  gitCommitTask?: (workspaceAbs: string, task: { taskNumber: number | string; title: string }, db: DatabaseAdapter, taskId: string) => Promise<CommitTaskResult>;
}

// ── Limits ───────────────────────────────────────────────────────────────────

const MAX_STEP_LOG = 200;
const MAX_TASKS = 40;
const CODEGEN_MAX_TOKENS = 8_000;
const PLAN_MAX_TOKENS = 4_000;
const MAX_CODEGEN_CHARS = 200_000;
const DEFAULT_REVISE_CAP = 4;

// ── Row mapping ──────────────────────────────────────────────────────────────

interface StudioRunRow {
  id: string;
  coding_project_id: string;
  status: string;
  current_task: string | null;
  autonomy: string;
  revise_cap: number | string;
  stop_requested: boolean | number | string;
  plan: unknown;
  awaiting_gate: string | null;
  last_error: string | null;
  step_log: unknown;
}

function asBool(v: boolean | number | string | null | undefined): boolean {
  return v === true || v === 1 || v === '1' || v === 't' || v === 'true';
}

function parseJsonish<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'object') return v as T;
  if (typeof v === 'string') {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return fallback;
}

function mapRow(row: StudioRunRow): StudioRun {
  return {
    id: row.id,
    codingProjectId: row.coding_project_id,
    status: row.status as StudioRunStatus,
    currentTask: row.current_task,
    autonomy: (row.autonomy as StudioAutonomy) ?? 'more',
    reviseCap: Number(row.revise_cap) || DEFAULT_REVISE_CAP,
    stopRequested: asBool(row.stop_requested),
    plan: parseJsonish<StudioPlan | null>(row.plan, null),
    awaitingGate: (row.awaiting_gate as PanelGate) ?? null,
    lastError: row.last_error,
    stepLog: parseJsonish<StudioStepLogEntry[]>(row.step_log, []),
  };
}

// ── The orchestrator (factory — one coding-integration instance per run) ─────

export function createStudioOrchestrator(db: DatabaseAdapter, deps: OrchestratorDeps = {}) {
  const callPlanner = deps.callPlanner ?? defaultCallPlanner;
  const callCodegen = deps.callCodegen ?? defaultCallCodegen;
  const runPanel = deps.runPanel ?? runCoreTeamPanel;
  const applyFiles = deps.applyFiles ?? (async (p) => {
    const r = await applyFilesToWorkspace(p);
    return { written: r.written, unchanged: r.unchanged, backupDir: r.backupDir };
  });
  const runTests = deps.runTests ?? ((p) => runProjectTests({
    argv: p.argv,
    cwd: p.cwd,
    projectDatabaseUrl: p.projectDatabaseUrl,
    containerMode: p.containerMode ?? null,
    // runProjectTests' language is string|undefined (not null) — coerce.
    language: p.language ?? undefined,
  }));
  const resolveProjectDsn = deps.resolveProjectDsn ?? resolveScopedDsn;
  const validateWorkspace = deps.validateWorkspace
    ?? (async (dir) => { const v = await validateWorkspacePath(dir); return { ok: v.ok, resolved: v.resolved, error: v.error }; });
  const readWorkspaceFile = deps.readWorkspaceFile ?? (async (ws, rel) => {
    const target = resolveTargetPath(ws, rel);
    if (!target) return null;
    try { return await readFile(target, 'utf8'); } catch { return null; }
  });

  // REAL GIT seams (P6). Defaults call coding-git.ts; persistence happens there.
  const gitEnsureRepo = deps.gitEnsureRepo
    ?? ((ws: string, d: DatabaseAdapter, pid: string) => gitEnsureRepoImpl(ws, undefined, d, pid));
  const gitCheckoutRelease = deps.gitCheckoutRelease
    ?? ((ws: string, num: number, name: string, d: DatabaseAdapter, rid: string) => gitCheckoutReleaseImpl(ws, num, name, undefined, d, rid));
  const gitCommitTask = deps.gitCommitTask
    ?? ((ws: string, t: { taskNumber: number | string; title: string }, d: DatabaseAdapter, tid: string) => gitCommitTaskImpl(ws, t, undefined, d, tid));

  // The coding-integration instance is created ONCE per orchestrator (per run) —
  // the orchestrator "holds the integration" (the deferred P4 hooks live here).
  let integrationPromise: Promise<Awaited<ReturnType<typeof createCodingIntegration>>> | null = null;
  async function getIntegration() {
    if (deps.integration) return deps.integration;
    if (!integrationPromise) integrationPromise = createCodingIntegration(db);
    return integrationPromise;
  }

  // ── Run CRUD ──────────────────────────────────────────────────────────────

  async function getRun(codingProjectId: string): Promise<StudioRun | null> {
    const row = await db.get<StudioRunRow>(
      'SELECT * FROM coding_studio_runs WHERE coding_project_id = ?',
      codingProjectId,
    );
    return row ? mapRow(row) : null;
  }

  /** Create the run row, or RESUME an existing one (one row per project). */
  async function startOrResume(params: {
    codingProjectId: string;
    autonomy?: StudioAutonomy;
    reviseCap?: number;
    createdBy?: string | null;
  }): Promise<StudioRun> {
    const existing = await getRun(params.codingProjectId);
    if (existing) {
      // A stopped/failed/blocked run resumes (status → pending) keeping its plan;
      // a live run is returned as-is.
      if (['stopped', 'failed', 'blocked'].includes(existing.status)) {
        await db.run(
          `UPDATE coding_studio_runs
             SET status = 'pending', stop_requested = FALSE, last_error = NULL, updated_at = NOW()
           WHERE coding_project_id = ?`,
          params.codingProjectId,
        );
        return (await getRun(params.codingProjectId))!;
      }
      return existing;
    }
    const id = randomUUID();
    const reviseCap = clampReviseCap(params.reviseCap);
    const autonomy: StudioAutonomy = params.autonomy === 'ask' ? 'ask' : 'more';
    await db.run(
      `INSERT INTO coding_studio_runs
         (id, coding_project_id, status, autonomy, revise_cap, stop_requested, step_log, created_by, started_at)
       VALUES (?, ?, 'pending', ?, ?, FALSE, '[]', ?, NOW())`,
      id, params.codingProjectId, autonomy, reviseCap, params.createdBy ?? 'system',
    );
    return (await getRun(params.codingProjectId))!;
  }

  /** The STOP control — sets the flag the loop checks each tick. */
  async function requestStop(codingProjectId: string): Promise<StudioRun | null> {
    await db.run(
      'UPDATE coding_studio_runs SET stop_requested = TRUE, updated_at = NOW() WHERE coding_project_id = ?',
      codingProjectId,
    );
    return getRun(codingProjectId);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  async function patch(codingProjectId: string, fields: Partial<{
    status: StudioRunStatus;
    current_task: string | null;
    plan: StudioPlan | null;
    awaiting_gate: PanelGate | null;
    last_error: string | null;
    finished_at: boolean;
  }>): Promise<void> {
    const sets: string[] = ['updated_at = NOW()'];
    const args: unknown[] = [];
    if (fields.status !== undefined) { sets.push('status = ?'); args.push(fields.status); }
    if (fields.current_task !== undefined) { sets.push('current_task = ?'); args.push(fields.current_task); }
    if (fields.plan !== undefined) { sets.push('plan = ?'); args.push(fields.plan === null ? null : JSON.stringify(fields.plan)); }
    if (fields.awaiting_gate !== undefined) { sets.push('awaiting_gate = ?'); args.push(fields.awaiting_gate); }
    if (fields.last_error !== undefined) { sets.push('last_error = ?'); args.push(fields.last_error); }
    if (fields.finished_at) sets.push('finished_at = NOW()');
    args.push(codingProjectId);
    await db.run(`UPDATE coding_studio_runs SET ${sets.join(', ')} WHERE coding_project_id = ?`, ...args);
  }

  async function log(codingProjectId: string, entry: Omit<StudioStepLogEntry, 'at'>): Promise<void> {
    const run = await getRun(codingProjectId);
    if (!run) return;
    const next = [...run.stepLog, { ...entry, at: new Date().toISOString() }].slice(-MAX_STEP_LOG);
    await db.run(
      'UPDATE coding_studio_runs SET step_log = ?, updated_at = NOW() WHERE coding_project_id = ?',
      JSON.stringify(next), codingProjectId,
    );
  }

  /** Read the project's charter goals (the FINISH-gate yardstick). */
  async function loadProjectGoals(codingProjectId: string): Promise<StudioGoal[]> {
    const row = await db.get<{ goals: string | null }>(
      'SELECT goals FROM coding_projects WHERE id = ?',
      codingProjectId,
    ).catch(() => undefined);
    return parseProjectGoals(row?.goals);
  }

  /** Read the bound workspace + the project's test argv + scoped DSN. */
  async function loadWorkspaceContext(codingProjectId: string): Promise<{
    workspaceAbs: string;
    testArgv: string[] | null;
    projectDatabaseUrl: string | null;
    environmentMode: string | null;
    language: string | null;
  } | { error: string }> {
    const project = await db.get<{
      directory_path: string | null;
      test_command: string | null;
      environment_mode: string | null;
      studio_language: string | null;
    }>(
      'SELECT directory_path, test_command, environment_mode, studio_language FROM coding_projects WHERE id = ?',
      codingProjectId,
    );
    if (!project) return { error: 'Coding project not found' };
    const validation = await validateWorkspace(project.directory_path);
    if (!validation.ok || !validation.resolved) {
      return { error: `Workspace not available: ${validation.error ?? 'unbound'}. Provision/bind the workspace first.` };
    }
    let testArgv: string[] | null = null;
    if (project.test_command) {
      const parsed = parseJsonish<unknown>(project.test_command, null);
      const v = validateTestArgv(parsed);
      if (v.ok) testArgv = v.argv;
    }
    const projectDatabaseUrl = await resolveProjectDsn(db, codingProjectId).catch(() => null);
    return {
      workspaceAbs: validation.resolved,
      testArgv,
      projectDatabaseUrl,
      environmentMode: project.environment_mode ?? null,
      language: project.studio_language ?? null,
    };
  }

  // ── Step 1: the PLAN (charter → release + task plan) ────────────────────────

  /**
   * Produce a release + task plan from the charter and persist real
   * coding_releases / coding_tasks rows. Sets status=awaiting_plan (the
   * plan-approval human checkpoint). Idempotent: returns the existing plan if
   * one was already produced.
   */
  async function plan(codingProjectId: string): Promise<StudioRun> {
    const run = await getRun(codingProjectId);
    if (!run) throw new Error('No studio run — call startOrResume first');
    if (run.plan && run.plan.tasks.length > 0) return run;

    const project = await db.get<{ name: string; discovery_summary: string | null; goals: string | null }>(
      'SELECT name, discovery_summary, goals FROM coding_projects WHERE id = ?',
      codingProjectId,
    );
    if (!project) throw new Error('Coding project not found');

    const goals = parseProjectGoals(project.goals);
    const validGoalIds = new Set(goals.map((g) => g.id));

    const orchestratorModel = resolveCodingModel('orchestrator');
    let raw: { releaseName: string; summary: string; tasks: RawPlanTask[] };
    try {
      raw = await callPlanner({
        model: orchestratorModel,
        charter: project.discovery_summary ?? project.name,
        projectName: project.name,
        goals,
      });
    } catch (err) {
      await patch(codingProjectId, { status: 'failed', last_error: err instanceof Error ? err.message : 'planning failed' });
      throw err;
    }

    const tasks = (raw.tasks ?? []).slice(0, MAX_TASKS).filter((t) => t && typeof t.title === 'string' && t.title.trim());
    if (tasks.length === 0) {
      await patch(codingProjectId, { status: 'failed', last_error: 'planner produced no tasks' });
      throw new Error('Planner produced no usable tasks');
    }

    const releaseId = randomUUID();
    const planTasks: PlanTask[] = [];
    await db.transaction(async (tx) => {
      const maxRel = await tx.get<{ max: number | null }>(
        'SELECT MAX(release_number) as max FROM coding_releases WHERE coding_project_id = ?',
        codingProjectId,
      );
      const releaseNumber = (maxRel?.max ?? 0) + 1;
      await tx.run(
        `INSERT INTO coding_releases (id, coding_project_id, release_number, name, description, status)
         VALUES (?, ?, ?, ?, ?, 'planned')`,
        releaseId, codingProjectId, releaseNumber, raw.releaseName || 'Release 1', raw.summary || '',
      );
      let sort = 0;
      for (const t of tasks) {
        const taskId = randomUUID();
        // Keep only goal ids that exist on the charter (drop hallucinated ids).
        const taskGoalIds = Array.isArray(t.goalIds)
          ? [...new Set(t.goalIds.filter((g): g is string => typeof g === 'string' && validGoalIds.has(g)))]
          : [];
        await tx.run(
          `INSERT INTO coding_tasks
             (id, coding_release_id, coding_project_id, task_number, title, description, sort_order, status, goal_ids)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
          taskId, releaseId, codingProjectId, String(sort + 1), t.title.trim(), (t.description ?? '').slice(0, 4000), sort,
          JSON.stringify(taskGoalIds),
        );
        planTasks.push({
          taskId,
          releaseId,
          title: t.title.trim(),
          description: (t.description ?? '').slice(0, 4000),
          files: Array.isArray(t.files) ? t.files.filter((f): f is string => typeof f === 'string').slice(0, 20) : [],
          goalIds: taskGoalIds,
          status: 'pending',
          reviseRounds: 0,
        });
      }
    });

    const studioPlan: StudioPlan = {
      releaseId,
      releaseName: raw.releaseName || 'Release 1',
      summary: raw.summary || '',
      tasks: planTasks,
    };
    await patch(codingProjectId, { status: 'awaiting_plan', plan: studioPlan });
    await log(codingProjectId, { kind: 'plan', message: `Planned ${planTasks.length} task(s) in "${studioPlan.releaseName}". Awaiting plan approval.` });
    return (await getRun(codingProjectId))!;
  }

  /**
   * The plan-approval checkpoint — moves the run from awaiting_plan to running
   * and DRIVES the build loop (advance). This is the ONE human checkpoint the
   * MORE-autonomy budget keeps; approving it kicks off the iterate-to-finish loop.
   * Idempotent-ish: a run already past planning is advanced as-is.
   */
  async function approvePlan(codingProjectId: string): Promise<StudioRun> {
    const run = await getRun(codingProjectId);
    if (!run) throw new Error('No studio run');
    if (run.status === 'awaiting_plan') {
      await patch(codingProjectId, { status: 'running' });
      await log(codingProjectId, { kind: 'plan', message: 'Plan approved — build loop is running.' });
    }
    return advance(codingProjectId);
  }

  // ── Gate runner (P2 panel + the enforced gate guard + deferred-hook wiring) ─

  /**
   * Run the core-team panel at a gate over an artifact, persist it, WIRE the
   * deferred captureReviewFlag hook for every flag/dissent expert, then
   * assertGatePassed. A GateBlockedError sets status=blocked and surfaces the
   * verdict — never auto-overridden. Returns true if the gate PASSED.
   */
  async function runGate(
    codingProjectId: string,
    gate: PanelGate,
    artifact: string,
    mode: PanelMode = 'fast',
  ): Promise<boolean> {
    const result = await runPanel(db, { projectId: codingProjectId, gate, artifact, mode });
    await persistPanelDecision(db, result, codingProjectId);

    // ── Deferred P4 hook #1: captureReviewFlag for each flag/dissent expert. ──
    const integration = await getIntegration();
    for (const expert of result.verdict.experts) {
      if (expert.verdict === 'flag' || expert.verdict === 'dissent') {
        integration.captureReviewFlag({
          projectId: codingProjectId,
          gate,
          role: expert.roleLabel,
          verdict: expert.verdict,
          requiredChange: expert.required_change,
        });
        await log(codingProjectId, { kind: 'atom', gate, message: `Atom: ${expert.roleLabel} ${expert.verdict} at ${gate} gate.` });
      }
    }

    await log(codingProjectId, {
      kind: 'gate',
      gate,
      message: `${gate} gate panel (${mode}): ${result.verdict.panel_verdict}${result.verdict.blocking ? ' — BLOCKING' : ''}.`,
    });

    try {
      await assertGatePassed(db, codingProjectId, gate);
    } catch (err) {
      if (err instanceof GateBlockedError) {
        await patch(codingProjectId, { status: 'blocked', awaiting_gate: gate, last_error: err.message });
        await log(codingProjectId, { kind: 'gate_blocked', gate, message: err.message });
        return false;
      }
      throw err;
    }
    return true;
  }

  // ── Step 3: one TASK (codegen → apply → test → revise to green / cap) ───────

  interface TaskOutcome {
    status: 'done' | 'failed' | 'stopped';
    reviseRounds: number;
    error?: string;
    /** TRUE only when the task's tests actually ran GREEN. A no-test-command task
     * is 'done' but verified=false (applied, not proven) — honesty for the goal
     * coverage rollup, which must not count an unverified task as "covered". */
    verified?: boolean;
  }

  async function runTask(
    codingProjectId: string,
    task: PlanTask,
    ctx: {
      workspaceAbs: string;
      testArgv: string[] | null;
      projectDatabaseUrl: string | null;
      reviseCap: number;
      containerMode?: 'docker' | 'local' | null;
      language?: string | null;
    },
  ): Promise<TaskOutcome> {
    const integration = await getIntegration();
    const codegenModel = resolveCodingModel('codegen'); // Devstral — NON-thinking
    // Devstral cannot carry reasoning; the orchestrator role escalates if needed.
    const codegenSupportsThinking = codingRoleSupportsThinking('codegen'); // false
    void codegenSupportsThinking;

    let reviseRound = 0;
    let lastFailureTail = '';
    // GAP 2: accumulate REAL codegen tokens across revises. GAP 1: the attempt
    // history. Both persisted at the single task-exit via `finish`.
    const taskTokens = { input: 0, output: 0, cost: 0 };
    const attempts: AttemptRecord[] = [];
    const finish = async (o: TaskOutcome): Promise<TaskOutcome> => {
      await recordTaskCompletion(codingProjectId, task, o, taskTokens, attempts);
      return o;
    };

    // The first pass is 'initial'; every retry is a 'revision' (the revise-round
    // cap counts revisions). The cap is ALWAYS enforced regardless of autonomy.
    for (;;) {
      if (await isStopRequested(codingProjectId)) return finish({ status: 'stopped', reviseRounds: reviseRound });

      const isRevision = reviseRound > 0;
      // On a revision, inject the project's OWN atoms (P4) as a LESSONS header so
      // the loop learns from this project's failures. Holdout tasks (A/B) get NO
      // injection — the measurement honesty lever (coding-atom-stats). We honour
      // it by only injecting on injected-arm tasks.
      let lessons = '';
      if (isRevision) {
        try {
          lessons = await buildAtomLayer(
            db, 'coding', null,
            `${task.title}\n${lastFailureTail}`,
            null,
            codingProjectId,
          );
        } catch { lessons = ''; }
      }

      const system = buildCodegenSystem(isRevision);
      const user = buildCodegenUser(
        task, isRevision ? lastFailureTail : null, lessons,
        isRevision ? formatAttemptHistory(attempts) : '',
      );

      let rawCode: string;
      try {
        const norm = normalizeCodegenResult(await callCodegen({ model: codegenModel, system, user }));
        rawCode = norm.text;
        taskTokens.input += norm.inputTokens;
        taskTokens.output += norm.outputTokens;
        taskTokens.cost += norm.costUsd;
      } catch (err) {
        return finish({ status: 'failed', reviseRounds: reviseRound, error: err instanceof Error ? err.message : 'codegen failed' });
      }
      await log(codingProjectId, {
        kind: isRevision ? 'revise' : 'codegen',
        taskId: task.taskId,
        message: `${isRevision ? `Revise round ${reviseRound}` : 'Codegen'} on "${task.title}" via ${codegenModel} (${providerForCodingModel(codegenModel)}).`,
      });

      // Parse → diff → apply (writes with backups). The apply step is the write;
      // autonomy=more means we write+run WITHOUT a per-edit checkpoint.
      const parsed = parseFileBlocks(rawCode.slice(0, MAX_CODEGEN_CHARS));
      const writable = parsed.files;
      const appliedFiles = writable.map((f) => f.path);
      if (writable.length === 0) {
        // No files produced — treat as a failed round (counts toward the cap).
        lastFailureTail = 'Codegen produced no applicable file blocks.';
      } else {
        // Persist a coding_workspace_applications row (kind initial|revision) so
        // the A/B revise-round metric (coding-atom-stats) can count it.
        const applicationId = await recordApplication(codingProjectId, task, ctx.workspaceAbs, parsed, isRevision);
        try {
          await applyFiles({
            workspaceAbs: ctx.workspaceAbs,
            files: writable.map((f) => ({ path: f.path, content: f.content })),
            applicationId,
          });
          await markApplicationApplied(applicationId);
          await log(codingProjectId, { kind: 'apply', taskId: task.taskId, message: `Applied ${writable.length} file(s) for "${task.title}".` });
        } catch (err) {
          await markApplicationFailed(applicationId, err instanceof Error ? err.message : 'apply failed');
          return finish({ status: 'failed', reviseRounds: reviseRound, error: err instanceof Error ? err.message : 'apply failed' });
        }
      }

      if (await isStopRequested(codingProjectId)) return finish({ status: 'stopped', reviseRounds: reviseRound });

      // Run the tests (the verification). No test command → we can't verify;
      // honestly treat a missing test command as "applied, not verified" = done
      // (verified=false; the panel TESTING gate still reviews the impl).
      if (!ctx.testArgv) {
        await log(codingProjectId, { kind: 'test', taskId: task.taskId, message: 'No test command configured — applied but not verified (TESTING gate still reviews).' });
        return finish({ status: 'done', reviseRounds: reviseRound, verified: false });
      }

      const testResult = await runTests({
        argv: ctx.testArgv,
        cwd: ctx.workspaceAbs,
        projectDatabaseUrl: ctx.projectDatabaseUrl,
        containerMode: ctx.containerMode ?? null,
        language: ctx.language ?? null,
      });
      const combinedTail = [testResult.stdoutTail, testResult.stderrTail].filter(Boolean).join('\n');
      const summary = parseTestSummary(combinedTail);
      void summary;
      const passed = testResult.ran && testResult.exitCode === 0 && !testResult.timedOut;

      // Mint atoms each step (P4 captureTestResult): a fail → test.failed; a pass
      // after a revision → pattern.works.
      integration.captureTestResult({
        projectId: codingProjectId,
        taskId: task.taskId,
        passed,
        afterRevision: isRevision,
        argv: ctx.testArgv,
        outputTail: combinedTail,
      });
      await persistTestRun(codingProjectId, task.taskId, ctx.testArgv, testResult, combinedTail);

      if (passed) {
        await log(codingProjectId, { kind: 'test', taskId: task.taskId, message: `Tests GREEN on "${task.title}" (exit 0, ${testResult.durationMs} ms).` });
        return finish({ status: 'done', reviseRounds: reviseRound, verified: true });
      }

      // RED. Iterate — but enforce the revise cap (ALWAYS on).
      lastFailureTail = combinedTail.slice(-2000) || `tests failed (exit ${testResult.exitCode ?? '?'}${testResult.timedOut ? ', timed out' : ''})`;
      await log(codingProjectId, { kind: 'test', taskId: task.taskId, message: `Tests RED on "${task.title}" (exit ${testResult.exitCode ?? '?'}${testResult.timedOut ? ', timed out' : ''}).` });

      // GAP 1: record this attempt (what changed + why it failed) so the next
      // revise codegen sees it and does not repeat the approach. Bounded to 5.
      attempts.push({
        round: reviseRound,
        kind: isRevision ? 'revision' : 'initial',
        at: new Date().toISOString(),
        files_changed: appliedFiles,
        test_exit_code: testResult.exitCode ?? null,
        failure_summary: lastFailureTail.slice(0, 200),
      });
      if (attempts.length > 5) attempts.splice(0, attempts.length - 5);

      reviseRound += 1;
      if (reviseRound > ctx.reviseCap) {
        await log(codingProjectId, { kind: 'task_failed', taskId: task.taskId, message: `Gave up on "${task.title}" after ${ctx.reviseCap} revise round(s) — still red. Marked failed (honest).` });
        return finish({ status: 'failed', reviseRounds: reviseRound - 1, error: `revise cap (${ctx.reviseCap}) exhausted — tests still failing` });
      }
    }
  }

  // ── Optional dependency audit (wires the second deferred P4 hook) ────────────

  /**
   * Run a dependency audit over the project's coding_dependencies rows (already
   * recorded by the lifecycle); for any with vulnerability_count > 0, wire the
   * deferred captureDependencyCve hook. Pure read — no network. Returns the
   * count of CVE atoms minted. Called once per run before FINISH.
   */
  async function dependencyAudit(codingProjectId: string): Promise<number> {
    let rows: Array<{ package_name: string; current_version: string | null; vulnerability_count: number | string }>;
    try {
      rows = await db.all(
        `SELECT package_name, current_version, vulnerability_count
           FROM coding_dependencies
          WHERE coding_project_id = ? AND vulnerability_count > 0`,
        codingProjectId,
      ) as Array<{ package_name: string; current_version: string | null; vulnerability_count: number | string }>;
    } catch {
      return 0; // table missing or no audit data — honest no-op
    }
    if (rows.length === 0) return 0;
    const integration = await getIntegration();
    for (const r of rows) {
      integration.captureDependencyCve({
        projectId: codingProjectId,
        packageName: r.package_name,
        currentVersion: r.current_version,
        vulnerabilityCount: Number(r.vulnerability_count) || 0,
      });
    }
    await log(codingProjectId, { kind: 'dependency_audit', message: `Dependency audit: ${rows.length} package(s) with known vulnerabilities → CVE atoms minted.` });
    return rows.length;
  }

  // ── REAL GIT (P6) — non-fatal wrappers (git is bookkeeping, not the product) ─

  /**
   * Run a git seam, NEVER letting it abort the build loop. On success → log a
   * non-fatal entry; on failure → log a git_error entry and swallow. Returns the
   * seam result, or null on failure.
   */
  async function tryGit<T>(
    codingProjectId: string,
    label: string,
    fn: () => Promise<T>,
    onOk: (result: T) => Omit<StudioStepLogEntry, 'at'>,
  ): Promise<T | null> {
    try {
      const result = await fn();
      await log(codingProjectId, onOk(result));
      return result;
    } catch (err) {
      await log(codingProjectId, {
        kind: 'git_error',
        message: `${label} failed (non-fatal — build continues): ${err instanceof Error ? err.message : 'git error'}`,
      });
      return null;
    }
  }

  // ── The advancer (resumable tick — drives the whole loop) ───────────────────

  /**
   * Advance the run as far as the autonomy budget allows in one call:
   *   - no plan yet            → plan() (→ awaiting_plan checkpoint)
   *   - awaiting_plan          → STOP here (human approves via approvePlan)
   *   - running                → START gate → each task → TESTING gate → FINISH gate → done
   * The STOP flag is checked between every step. The panel gates + revise cap
   * are ALWAYS enforced. A BLOCKING gate halts with status=blocked.
   */
  /**
   * SAFETY NET — never leave a run stuck in 'running'. Drive the build via
   * advanceInner; if it throws an UNEXPECTED error (e.g. a DB write failed mid-
   * loop), record the run as 'failed' with the reason instead of bubbling out
   * (which would leave the row in 'running' forever). A re-run (startOrResume)
   * can then resume. The "no run / call startOrResume first" throw is preserved
   * (re-thrown when there is no run to mark).
   */
  async function advance(codingProjectId: string): Promise<StudioRun> {
    try {
      return await advanceInner(codingProjectId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unexpected orchestrator error';
      const existing = await getRun(codingProjectId).catch(() => null);
      if (!existing) throw err; // nothing to mark (e.g. startOrResume not called)
      await patch(codingProjectId, { status: 'failed', last_error: msg }).catch(() => { /* best-effort */ });
      await log(codingProjectId, { kind: 'error', message: `Run halted on an unexpected error: ${msg}` }).catch(() => { /* best-effort */ });
      return (await getRun(codingProjectId).catch(() => null)) ?? existing;
    }
  }

  async function advanceInner(codingProjectId: string): Promise<StudioRun> {
    let run = await getRun(codingProjectId);
    if (!run) throw new Error('No studio run — call startOrResume first');

    if (run.stopRequested) { await stop(codingProjectId); return (await getRun(codingProjectId))!; }

    // Terminal states are left alone.
    if (['done', 'stopped', 'failed', 'blocked'].includes(run.status)) return run;

    // 1. Plan if needed.
    if (!run.plan || run.plan.tasks.length === 0) {
      run = await plan(codingProjectId);
    }
    // 2. The plan-approval checkpoint — stop here until approved.
    if (run.status === 'awaiting_plan') return run;

    const ws = await loadWorkspaceContext(codingProjectId);
    if ('error' in ws) {
      await patch(codingProjectId, { status: 'failed', last_error: ws.error });
      await log(codingProjectId, { kind: 'error', message: ws.error });
      return (await getRun(codingProjectId))!;
    }

    const plan_ = run.plan!;
    const charterArtifact = buildPlanArtifact(plan_);

    // 2b. REAL GIT (P6): ensure the repo once (idempotent), then create/switch to
    // the release branch (branch-per-release). Both are NON-FATAL — a git failure
    // logs git_error and the build proceeds (git is bookkeeping, not the product).
    await tryGit(
      codingProjectId,
      'git ensureRepo',
      () => gitEnsureRepo(ws.workspaceAbs, db, codingProjectId),
      (r) => ({ kind: 'git_init', message: r.initialized ? 'Initialized a git repository for the workspace.' : 'Workspace already a git repository.' }),
    );
    // The release number lives on coding_releases (the plan carries name + id).
    const relRow = await db.get<{ release_number: number | string | null }>(
      'SELECT release_number FROM coding_releases WHERE id = ?',
      plan_.releaseId,
    ).catch(() => undefined);
    const releaseNumber = Number(relRow?.release_number) || 1;
    await tryGit(
      codingProjectId,
      'git checkoutReleaseBranch',
      () => gitCheckoutRelease(ws.workspaceAbs, releaseNumber, plan_.releaseName, db, plan_.releaseId),
      (r) => ({ kind: 'git_branch', message: `On release branch ${r.branch}${r.switchedExisting ? ' (switched to existing)' : ' (created)'}.` }),
    );

    // 3. START gate (before kickoff) — only if not yet decided this run.
    if (await isStopRequested(codingProjectId)) { await stop(codingProjectId); return (await getRun(codingProjectId))!; }
    if (!(await runGate(codingProjectId, 'start', charterArtifact, 'fast'))) {
      return (await getRun(codingProjectId))!; // blocked
    }

    // 4. BUILD gate (before implementing).
    if (await isStopRequested(codingProjectId)) { await stop(codingProjectId); return (await getRun(codingProjectId))!; }
    if (!(await runGate(codingProjectId, 'build', charterArtifact, 'fast'))) {
      return (await getRun(codingProjectId))!; // blocked
    }

    // 5. Each task — write+run+revise across tasks WITHOUT asking per-edit (more).
    for (const task of plan_.tasks) {
      if (task.status === 'done' || task.status === 'failed') continue;
      if (await isStopRequested(codingProjectId)) { await stop(codingProjectId); return (await getRun(codingProjectId))!; }

      await patch(codingProjectId, { current_task: task.taskId });
      await db.run("UPDATE coding_tasks SET status = 'in_progress', started_at = NOW(), updated_at = NOW() WHERE id = ?", task.taskId);

      const outcome = await runTask(codingProjectId, task, {
        workspaceAbs: ws.workspaceAbs,
        testArgv: ws.testArgv,
        projectDatabaseUrl: ws.projectDatabaseUrl,
        reviseCap: run.reviseCap,
        // Studio P6 — honor the project's opt-in docker mode in the autonomous
        // test step. runProjectTests resolves the REAL mode (docker only when the
        // flag + a live daemon are present) and falls back to local honestly.
        containerMode: ws.environmentMode === 'docker' ? 'docker' : null,
        language: ws.language,
      });

      task.reviseRounds = outcome.reviseRounds;
      task.verified = outcome.verified === true;
      if (outcome.status === 'stopped') {
        task.status = 'pending';
        await syncPlan(codingProjectId, plan_);
        await stop(codingProjectId);
        return (await getRun(codingProjectId))!;
      }
      if (outcome.status === 'done') {
        task.status = 'done';
        // Record the per-task goal-alignment (which goals this task advanced) —
        // deterministic (the goal_ids the planner mapped + a green-tests note).
        // This is the raw material the FINISH-gate goal×coverage snapshot rolls up.
        const taskGoalIds = Array.isArray(task.goalIds) ? task.goalIds : [];
        // HONEST note: only claim "tests green" when the task was actually VERIFIED.
        const doneNote = outcome.verified
          ? `Completed with tests GREEN after ${outcome.reviseRounds} revise round(s).`
          : 'Applied WITHOUT test verification (no test command) — not proven.';
        const goalAlignment = JSON.stringify({
          goalIds: taskGoalIds,
          verified: outcome.verified === true,
          note: taskGoalIds.length ? doneNote : 'Infrastructure/support task (no charter goal directly mapped).',
          at: new Date().toISOString(),
        });
        await db.run(
          "UPDATE coding_tasks SET status = 'completed', completed_at = NOW(), goal_alignment = ?, updated_at = NOW() WHERE id = ?",
          goalAlignment, task.taskId,
        );
        await log(codingProjectId, { kind: 'task_done', taskId: task.taskId, message: `Task done: "${task.title}".` });
        // REAL GIT (P6): commit-per-task. NON-FATAL — a git failure logs git_error
        // and the loop continues. A no-op task (no diff) honestly makes no commit.
        const taskNumber = plan_.tasks.indexOf(task) + 1;
        await tryGit(
          codingProjectId,
          'git commitTask',
          () => gitCommitTask(ws.workspaceAbs, { taskNumber, title: task.title }, db, task.taskId),
          (r) => ({
            kind: 'git_commit',
            taskId: task.taskId,
            message: r.nothingToCommit
              ? `No changes to commit for "${task.title}" (no-op task — honest).`
              : `Committed "${task.title}" as ${r.hash ? r.hash.slice(0, 8) : '(unknown)'}.`,
          }),
        );
      } else {
        task.status = 'failed';
        await db.run("UPDATE coding_tasks SET status = 'blocked', updated_at = NOW() WHERE id = ?", task.taskId);
        await log(codingProjectId, { kind: 'task_failed', taskId: task.taskId, message: `Task failed: "${task.title}" — ${outcome.error ?? 'unknown'}.` });
      }
      await syncPlan(codingProjectId, plan_);
    }

    await patch(codingProjectId, { current_task: null });

    // 6. TESTING gate (after impl).
    if (await isStopRequested(codingProjectId)) { await stop(codingProjectId); return (await getRun(codingProjectId))!; }
    if (!(await runGate(codingProjectId, 'testing', buildPlanArtifact(plan_), 'fast'))) {
      return (await getRun(codingProjectId))!; // blocked
    }

    // 6b. Optional dependency audit (wires captureDependencyCve) before FINISH.
    await dependencyAudit(codingProjectId);

    // 7. FINISH gate (before done — THOROUGH mode = chair synthesis on Large).
    // The artifact is the GOAL-ALIGNMENT SNAPSHOT (built-vs-intended): the panel
    // reviews the charter goals × the tasks that landed them, with any uncovered
    // MVP goal surfaced first. The gate verdict stays code-computed (worst-of).
    if (await isStopRequested(codingProjectId)) { await stop(codingProjectId); return (await getRun(codingProjectId))!; }
    const finishGoals = await loadProjectGoals(codingProjectId);
    const uncoveredMvp = computeGoalCoverage(finishGoals, plan_).filter(
      (c) => c.goal.priority === 'mvp' && c.status !== 'covered',
    );
    if (uncoveredMvp.length) {
      await log(codingProjectId, {
        kind: 'gate',
        gate: 'finish',
        message: `Goal-alignment: ${uncoveredMvp.length} MVP goal(s) not covered — surfaced to the FINISH panel.`,
      });
    }
    if (!(await runGate(codingProjectId, 'finish', buildGoalAlignmentArtifact(finishGoals, plan_), 'thorough'))) {
      return (await getRun(codingProjectId))!; // blocked
    }

    // Done. Honest: report whether any task failed.
    const anyFailed = plan_.tasks.some((t) => t.status === 'failed');
    await patch(codingProjectId, {
      status: 'done',
      finished_at: true,
      last_error: anyFailed ? 'completed with one or more failed tasks (revise cap exhausted)' : null,
    });
    await log(codingProjectId, { kind: 'done', message: anyFailed ? 'Run finished — some tasks failed (revise cap exhausted).' : 'Run finished — all tasks green, all gates passed.' });
    return (await getRun(codingProjectId))!;
  }

  // ── helpers used by the loop ────────────────────────────────────────────────

  async function isStopRequested(codingProjectId: string): Promise<boolean> {
    const row = await db.get<{ stop_requested: boolean | number | string }>(
      'SELECT stop_requested FROM coding_studio_runs WHERE coding_project_id = ?',
      codingProjectId,
    );
    return asBool(row?.stop_requested);
  }

  async function stop(codingProjectId: string): Promise<void> {
    const run = await getRun(codingProjectId);
    if (run && ['done', 'failed'].includes(run.status)) return; // already terminal
    await patch(codingProjectId, { status: 'stopped', current_task: null });
    await log(codingProjectId, { kind: 'stop', message: 'STOP requested — run halted. Restart to resume.' });
  }

  async function syncPlan(codingProjectId: string, plan_: StudioPlan): Promise<void> {
    await patch(codingProjectId, { plan: plan_ });
  }

  async function recordApplication(
    codingProjectId: string,
    task: PlanTask,
    workspaceAbs: string,
    parsed: ReturnType<typeof parseFileBlocks>,
    isRevision: boolean,
  ): Promise<string> {
    // Build the deterministic diff + record (mirrors the apply/preview route).
    const oldContents = new Map<string, string | null>();
    const diffs: FileDiff[] = [];
    for (const file of parsed.files) {
      const old = await readWorkspaceFile(workspaceAbs, file.path);
      oldContents.set(file.path, old);
      diffs.push(buildFileDiff(file.path, old, file.content));
    }
    const record = buildApplicationRecord(parsed.files, diffs, oldContents);
    const applicationId = randomUUID();
    await db.run(
      `INSERT INTO coding_workspace_applications
         (id, coding_project_id, coding_task_id, status, kind, format_version,
          workspace_path, files, rejected_blocks, diff_summary, created_by)
       VALUES (?, ?, ?, 'proposed', ?, ?, ?, ?, ?, ?, 'orchestrator')`,
      applicationId, codingProjectId, task.taskId,
      isRevision ? 'revision' : 'initial', FILE_BLOCK_FORMAT_VERSION,
      workspaceAbs, JSON.stringify(record.files),
      JSON.stringify(parsed.rejected), JSON.stringify(record.diff_summary),
    );
    return applicationId;
  }

  async function markApplicationApplied(applicationId: string): Promise<void> {
    // Strip the staged content (consumed) when marking applied.
    const row = await db.get<{ files: string }>('SELECT files FROM coding_workspace_applications WHERE id = ?', applicationId);
    const files = (parseJsonish<ApplicationFileEntry[]>(row?.files, [])).map((f) => ({
      path: f.path, action: f.action, bytes: f.bytes, hash_new: f.hash_new, hash_before: f.hash_before, hash_after: f.hash_after,
    }));
    await db.run(
      "UPDATE coding_workspace_applications SET status = 'applied', applied_at = NOW(), files = ? WHERE id = ?",
      JSON.stringify(files), applicationId,
    );
  }

  async function markApplicationFailed(applicationId: string, error: string): Promise<void> {
    await db.run(
      "UPDATE coding_workspace_applications SET status = 'failed', error_message = ? WHERE id = ?",
      error, applicationId,
    );
  }

  async function persistTestRun(
    codingProjectId: string,
    taskId: string,
    argv: string[],
    result: TestRunResult,
    combinedTail: string,
  ): Promise<void> {
    const summary = parseTestSummary(combinedTail);
    await db.run(
      `INSERT INTO coding_test_runs
         (id, coding_project_id, coding_task_id, test_type, test_suite_name,
          results, pass_count, fail_count, skip_count, total_count, duration_ms,
          executed, command, exit_code, timed_out, output_tail, run_by)
       VALUES (?, ?, ?, 'unit', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'orchestrator')`,
      randomUUID(), codingProjectId, taskId, argv.join(' '),
      JSON.stringify({ executed: true, argv, exit_code: result.exitCode, timed_out: result.timedOut, summary_recognized: summary.recognized }),
      summary.pass_count, summary.fail_count, summary.skip_count,
      summary.pass_count + summary.fail_count + summary.skip_count,
      result.durationMs, JSON.stringify(argv), result.exitCode, result.timedOut ? 1 : 0, combinedTail,
    ).catch(() => { /* test-run persistence must never break the loop */ });
  }

  /** GAP 2 — the per-task file manifest, read back from the applied workspace
   *  applications. { path: { action, bytes?, hash_before?, hash_after? } }. */
  async function buildFileManifest(
    codingProjectId: string,
    taskId: string,
  ): Promise<Record<string, { action: string; bytes?: number; hash_before?: string | null; hash_after?: string | null }>> {
    const manifest: Record<string, { action: string; bytes?: number; hash_before?: string | null; hash_after?: string | null }> = {};
    try {
      const rows = await db.all(
        `SELECT files FROM coding_workspace_applications
          WHERE coding_project_id = ? AND coding_task_id = ? AND status = 'applied'`,
        codingProjectId, taskId,
      ) as Array<{ files: string }>;
      for (const r of rows) {
        const files = parseJsonish<ApplicationFileEntry[]>(r.files, []);
        for (const f of files) {
          if (!f || typeof f.path !== 'string') continue;
          manifest[f.path] = {
            action: typeof f.action === 'string' ? f.action : 'write',
            bytes: typeof f.bytes === 'number' ? f.bytes : undefined,
            hash_before: f.hash_before ?? null,
            hash_after: f.hash_after ?? null,
          };
        }
      }
    } catch { /* manifest may be incomplete — honest, never breaks the loop */ }
    return manifest;
  }

  /** GAP 1 + GAP 2 — at every task exit, persist the durable per-task record:
   *  execution_plan (approach + target files), completion_record (status +
   *  revise rounds + verified), file_manifest (applied files), tokens_consumed
   *  (REAL accumulated codegen tokens), progress_log (the attempt history).
   *  ONE UPDATE. Wrapped so a failure NEVER breaks the build loop. */
  async function recordTaskCompletion(
    codingProjectId: string,
    task: PlanTask,
    outcome: TaskOutcome,
    tokens: { input: number; output: number; cost: number },
    attempts: AttemptRecord[],
  ): Promise<void> {
    try {
      const manifest = await buildFileManifest(codingProjectId, task.taskId);
      const executionPlan = {
        approach: `${task.title}${task.description ? ' — ' + task.description : ''}`,
        targetFiles: Array.isArray(task.files) ? task.files : [],
      };
      const completion = {
        finalStatus: outcome.status,
        verified: outcome.verified === true,
        reviseRounds: outcome.reviseRounds,
        completedAt: new Date().toISOString(),
      };
      await db.run(
        `UPDATE coding_tasks SET
           execution_plan = ?,
           completion_record = ?,
           file_manifest = ?,
           tokens_consumed = ?,
           progress_log = ?,
           updated_at = NOW()
         WHERE id = ?`,
        JSON.stringify(executionPlan),
        JSON.stringify(completion),
        JSON.stringify(manifest),
        JSON.stringify({ input: tokens.input, output: tokens.output, cost_usd: tokens.cost }),
        JSON.stringify(attempts),
        task.taskId,
      );
    } catch { /* metrics persistence must NEVER break the build loop */ }
  }

  return {
    getRun,
    startOrResume,
    requestStop,
    plan,
    approvePlan,
    advance,
    // exposed for fine-grained tests / the export path
    runGate,
    dependencyAudit,
  };
}

export type StudioOrchestrator = ReturnType<typeof createStudioOrchestrator>;

// ── Pure helpers (no DB / no LLM — unit-testable) ───────────────────────────

export function clampReviseCap(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_REVISE_CAP;
  return Math.max(1, Math.min(20, Math.floor(v)));
}

/** The artifact handed to the panel at a gate — the plan + per-task status. */
export function buildPlanArtifact(plan: StudioPlan): string {
  const lines: string[] = [];
  lines.push(`# Release: ${plan.releaseName}`, '');
  if (plan.summary) lines.push(plan.summary, '');
  lines.push('## Tasks');
  for (const t of plan.tasks) {
    lines.push(`- [${t.status}] ${t.title}${t.reviseRounds ? ` (${t.reviseRounds} revise round(s))` : ''}`);
    if (t.description) lines.push(`  - ${t.description.slice(0, 200)}`);
  }
  return lines.join('\n');
}

/** One goal's coverage row in the FINISH-gate snapshot. */
export interface GoalCoverage {
  goal: StudioGoal;
  /** Titles of VERIFIED completed tasks mapped to this goal (tests ran green). */
  doneTasks: string[];
  /** Titles of done-but-UNVERIFIED tasks (applied, no test command) — not proven. */
  unverifiedTasks: string[];
  /** Titles of failed tasks mapped to this goal (revise cap exhausted). */
  failedTasks: string[];
  /**
   * Coverage verdict (DETERMINISTIC — code-computed, not the LLM):
   *   covered      — at least one mapped task completed (tests green)
   *   at_risk      — every mapped task failed (mapped but nothing landed)
   *   unaddressed  — no task mapped to this goal at all
   */
  status: 'covered' | 'at_risk' | 'unaddressed';
}

/**
 * Compute the deterministic goal×coverage rollup the FINISH gate reviews —
 * goals on one axis, the completed/failed tasks that mapped to them on the
 * other. The LLM never decides the gate; this just hands the panel the
 * built-vs-intended table so its experts (and the code-computed worst-of
 * rollup) judge a grounded artifact. Pure + unit-testable.
 */
export function computeGoalCoverage(goals: StudioGoal[], plan: StudioPlan): GoalCoverage[] {
  return goals.map((goal) => {
    // Guard: a plan persisted before the goals model lacks goalIds — treat as [].
    const mapped = plan.tasks.filter((t) => Array.isArray(t.goalIds) && t.goalIds.includes(goal.id));
    // HONESTY: a done task counts as "covered" only when its tests actually ran
    // (verified !== false). A no-test "done" task (verified === false) is applied
    // but NOT proven — it lands in unverifiedTasks, NOT covered.
    const doneTasks = mapped.filter((t) => t.status === 'done' && t.verified !== false).map((t) => t.title);
    const unverifiedTasks = mapped.filter((t) => t.status === 'done' && t.verified === false).map((t) => t.title);
    const failedTasks = mapped.filter((t) => t.status === 'failed').map((t) => t.title);
    let status: GoalCoverage['status'];
    if (mapped.length === 0) status = 'unaddressed';
    else if (doneTasks.length > 0) status = 'covered';
    else status = 'at_risk'; // only failed and/or unverified tasks mapped — not proven covered
    return { goal, doneTasks, unverifiedTasks, failedTasks, status };
  });
}

/**
 * The FINISH-gate artifact: the plan status PLUS the goal-alignment snapshot
 * (built-vs-intended). When the charter has no goals it falls back to the plan
 * artifact (honest — nothing to align against). MVP goals that are unaddressed
 * or at-risk are surfaced first so the panel cannot miss a coverage gap.
 */
export function buildGoalAlignmentArtifact(goals: StudioGoal[], plan: StudioPlan): string {
  if (goals.length === 0) return buildPlanArtifact(plan);
  const coverage = computeGoalCoverage(goals, plan);
  const lines: string[] = [];
  lines.push('# Goal-alignment snapshot (built vs. intended)', '');

  const gaps = coverage.filter((c) => c.goal.priority === 'mvp' && c.status !== 'covered');
  if (gaps.length) {
    lines.push('## ⚠ MVP goals NOT yet covered');
    for (const c of gaps) lines.push(`- [${c.status}] ${c.goal.statement}`);
    lines.push('');
  }

  lines.push('## Goal coverage');
  for (const c of coverage) {
    const tag = `${c.goal.priority}/${c.status}`;
    lines.push(`- [${tag}] ${c.goal.statement}`);
    if (c.doneTasks.length) lines.push(`  - done (verified): ${c.doneTasks.join('; ')}`);
    if (c.unverifiedTasks.length) lines.push(`  - applied but UNVERIFIED: ${c.unverifiedTasks.join('; ')}`);
    if (c.failedTasks.length) lines.push(`  - failed: ${c.failedTasks.join('; ')}`);
  }
  lines.push('');
  lines.push(buildPlanArtifact(plan));
  return lines.join('\n');
}

function buildCodegenSystem(isRevision: boolean): string {
  return `You are ANTON Studio's code-generation engine. You write working, complete code for ONE task at a time.

OUTPUT CONTRACT (${FILE_BLOCK_FORMAT_VERSION}): emit each file as a fenced code block whose FIRST non-blank line is a FILE header comment carrying the EXACT workspace-relative path, e.g.:
\`\`\`js
// FILE: slugify.cjs
module.exports = () => {};
\`\`\`
PATHS ARE EXACT AND LITERAL: write each file at PRECISELY the path the task asks for. If the task names a file at the workspace ROOT (no folder — e.g. \`index.js\`, \`slugify.cjs\`), write it AT THE ROOT — do NOT prepend \`src/\` or any directory the task did not ask for. Use a subfolder ONLY when the requested path already contains one. Use the comment style of the file's language (// , # , <!-- -->, /* */, -- for SQL). Output ONLY file blocks — no prose between them. Paths are workspace-relative; never absolute, never with '..'.

${isRevision
  ? 'This is a REVISION: the previous attempt FAILED its tests. Read the failure output and the "LESSONS FROM THIS PROJECT" below, then emit the CORRECTED file(s). Re-emit the full content of each file you change.'
  : 'Write the complete file(s) the task needs.'}`;
}

function buildCodegenUser(
  task: PlanTask,
  failureTail: string | null,
  lessons: string,
  attemptHistory: string = '',
): string {
  const parts: string[] = [];
  if (lessons.trim()) parts.push(lessons.trim(), '');
  // GAP 1 — on a revision, show what EARLIER attempts already tried (and failed)
  // so the model does not repeat a failed approach. Bounded by formatAttemptHistory.
  if (failureTail && attemptHistory.trim()) {
    parts.push('## Earlier attempts (do NOT repeat these — they failed):', attemptHistory.trim(), '');
  }
  parts.push(`## Task: ${task.title}`);
  if (task.description) parts.push(task.description);
  if (task.files.length) parts.push('', `Write EXACTLY these files at EXACTLY these paths (verbatim — do not add or change directories): ${task.files.join(', ')}`);
  if (failureTail) {
    parts.push('', '## Previous test failure (fix this):', '```', failureTail.slice(-2000), '```');
  }
  return parts.join('\n');
}

// ── Default live calls (real provider — only used when not injected) ─────────

async function defaultCallPlanner(input: OrchestratorPlanInput): Promise<{ releaseName: string; summary: string; tasks: RawPlanTask[] }> {
  const goals = input.goals ?? [];
  const goalBlock = goals.length
    ? `\n\nThe project's MEASURABLE GOALS (success-criteria the build is held to). Map EACH task to the goal ids it advances via "goalIds" (use these exact ids; [] for pure-infrastructure tasks):\n${goals.map((g) => `- ${g.id} [${g.priority}]: ${g.statement}`).join('\n')}\nTogether the tasks MUST cover every 'mvp' goal — do not leave an MVP goal unaddressed.`
    : '';
  const system = `You are ANTON Studio's lead Project Manager / architect. Given a project charter, produce a SINGLE first release broken into a short, ordered list of buildable tasks (each a self-contained unit a coder can complete and test). Output ONLY a fenced \`json\` block:
\`\`\`json
{ "releaseName": "...", "summary": "...", "tasks": [ { "title": "...", "description": "...", "files": ["src/..."], "goalIds": ["..."] } ] }
\`\`\`
Use as FEW tasks as the scope genuinely needs: a single small file = 1 task; a typical MVP = 3 to 7; only go higher for genuinely larger scope. CRITICAL: each task must leave the project's test suite PASSING when it is done — so do NOT split one file's implementation across several tasks (the tests only go green once that file is fully correct, which would make the earlier sub-tasks fail spuriously). Do not invent scope beyond the charter.${goalBlock}`;
  const chat = await callChat({
    model: input.model,
    system,
    messages: [{ role: 'user', content: `Project: ${input.projectName}\n\nCharter:\n${input.charter}` }],
    maxTokens: PLAN_MAX_TOKENS,
    temperature: 0.3,
    jsonMode: true,
  });
  const text = chat.text ?? '';
  const m = text.match(/```json\s*\n([\s\S]*?)\n```/);
  const json = m ? m[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const parsed = JSON.parse(json) as { releaseName?: string; summary?: string; tasks?: RawPlanTask[] };
  return {
    releaseName: typeof parsed.releaseName === 'string' ? parsed.releaseName : 'Release 1',
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
  };
}

async function defaultCallCodegen(input: CodegenInput): Promise<CodegenResult> {
  // Devstral is NON-thinking — no extended reasoning is requested here (the
  // caveat: a thinking request would silently run without reasoning; codegen is
  // gated to non-thinking by resolveCodingModel's role mapping).
  const chat = await callChat({
    model: input.model,
    system: input.system,
    messages: [{ role: 'user', content: input.user }],
    maxTokens: CODEGEN_MAX_TOKENS,
    temperature: 0.2,
  });
  // Return REAL token usage so the orchestrator can persist tokens_consumed (GAP 2).
  return { text: chat.text ?? '', inputTokens: chat.inputTokens, outputTokens: chat.outputTokens, costUsd: 0 };
}
