/**
 * coding-studio-orchestrator-compat.db.test.ts — the Studio build loop on an
 * OpenAI-compatible model (compat:<slug>:<model>, e.g. OpenRouter GLM), with
 * the REAL planner and codegen calls.
 *
 * A fake OpenAI-compatible server started here plays the model; the endpoint
 * row lives on the test database. What each case pins:
 *   - the planner and codegen calls reach a compat model at all: they passed
 *     no `db` to callChat, and a compat id resolves its endpoint through it;
 *   - a planner reply with no readable plan gets ONE retry with a JSON-only
 *     nudge (the first reply goes back as the assistant turn) instead of
 *     failing the run;
 *   - codegen on a compat model asks for more output than 8,000 tokens, which
 *     a reasoning model shares with its thinking;
 *   - a rewrite that elides code ("// ... rest of the file unchanged") or keeps
 *     a sliver of the existing file is NOT written: the round is refused, the
 *     model is asked again and told why, and only the whole file is applied;
 *   - a round that applies some files and refuses others is not done — with
 *     the tests green or with no test command — until the refused file comes
 *     back whole (showcase review C15).
 *
 * Exec, git, the panel and the filesystem are injected seams. Skips without a
 * test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import {
  createStudioOrchestrator,
  PLANNER_JSON_NUDGE,
  type OrchestratorDeps,
} from '../../server/services/coding-studio-orchestrator.js';
import { computeRollup, CORE_TEAM_ROLES, type RunPanelResult, type PanelGate } from '../../server/services/core-team-panel.js';
import { resetCodingModelStrategyForTests } from '../../server/services/coding-model-resolver.js';
import { invalidateCustomEndpointCache } from '../../server/services/custom-endpoint-resolver.js';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const tag = randomUUID().slice(0, 8);
const SLUG = `tstudio${tag}`;
const fence = '```';

interface Seen { kind: 'planner' | 'codegen'; model: string; maxTokens: number | undefined; messages: Array<{ role: string; content: string }> }

const ORIGINAL = Array.from({ length: 40 }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n';
const FULL = Array.from({ length: 45 }, (_, i) => `export const v${i} = ${i};`).join('\n');
const PLAN = { releaseName: 'MVP', summary: 'grow it', tasks: [{ title: 'Grow big.ts', description: 'add five exports', files: ['src/big.ts'] }] };

/** Replies are queued per kind; the planner and codegen are told apart by their system prompts. */
function startFakeModel(): Promise<{
  server: Server; baseUrl: string; seen: Seen[];
  plannerReplies: string[]; codegenReplies: string[];
}> {
  const seen: Seen[] = [];
  const plannerReplies: string[] = [];
  const codegenReplies: string[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
        res.writeHead(404).end();
        return;
      }
      const parsed = JSON.parse(body || '{}') as { model?: string; max_tokens?: number; messages?: Array<{ role: string; content: unknown }> };
      const messages = (parsed.messages ?? []).map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }));
      const system = messages.find((m) => m.role === 'system')?.content ?? '';
      const kind = system.includes('lead Project Manager') ? 'planner' : 'codegen';
      seen.push({ kind, model: parsed.model ?? '', maxTokens: parsed.max_tokens, messages: messages.filter((m) => m.role !== 'system') });
      const queue = kind === 'planner' ? plannerReplies : codegenReplies;
      const content = queue.length > 0 ? queue.shift()! : '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/v1`, seen, plannerReplies, codegenReplies });
    });
  });
}

function endorse(gate: PanelGate): RunPanelResult {
  const experts = CORE_TEAM_ROLES.map((r) => ({
    role: r.id, roleLabel: r.label, verdict: 'endorse' as const, concerns: [],
    required_change: null, rationale: 'ok', mandatory: false,
  }));
  const { panel_verdict, blocking } = computeRollup(experts);
  return {
    verdict: { gate, experts, agreements: [], dissents: [], open_questions: [], synthesis: 'ok', panel_verdict, blocking },
    mode: 'fast', expertModel: 'stub', chairModel: null, dissentLedger: null, blockConfirmation: null,
  };
}

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL', 'DEPLOYMENT_MODE'] as const;
const savedEnv: Record<string, string | undefined> = {};

d('Studio build loop on a compat: model (real planner + codegen calls)', () => {
  let db: DatabaseAdapter;
  let fake: Awaited<ReturnType<typeof startFakeModel>>;
  const projectsRowId = randomUUID();
  const codingProjectId = randomUUID();
  let applied: Array<{ path: string; content: string }>;
  let testRuns: number;

  function deps(): OrchestratorDeps {
    return {
      // callPlanner / callCodegen deliberately NOT injected — the live calls run.
      runPanel: async (_db, opts) => endorse(opts.gate),
      validateWorkspace: async () => ({ ok: true, resolved: '/fake/ws' }),
      readWorkspaceFile: async (_ws, rel) => (rel === 'src/big.ts' ? ORIGINAL : null),
      applyFiles: async (p) => {
        applied.push(...p.files);
        return { written: p.files.length, unchanged: 0, backupDir: '' };
      },
      runTests: async () => {
        testRuns += 1;
        return { ran: true, exitCode: 0, durationMs: 5, timedOut: false, stdoutTail: '1 passed', stderrTail: '', outputTruncated: false };
      },
      resolveProjectDsn: async () => null,
      gitEnsureRepo: async () => { throw new Error('no git in this test'); },
      gitCheckoutRelease: async () => { throw new Error('no git in this test'); },
      gitCommitTask: async () => { throw new Error('no git in this test'); },
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

  async function clearRun(): Promise<void> {
    for (const table of ['coding_test_runs', 'coding_workspace_applications', 'knowledge_atoms', 'coding_panel_decisions',
      'coding_reviews', 'coding_tasks', 'coding_releases', 'coding_studio_runs']) {
      await db.run(`DELETE FROM ${table} WHERE coding_project_id = ?`, codingProjectId);
    }
  }

  beforeAll(async () => {
    for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
    // Every coding role resolves to the compat default (no Settings pick in tests).
    process.env.DEFAULT_MODEL = `compat:${SLUG}:glm-flash`;
    fake = await startFakeModel();
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    await db.run(
      `INSERT INTO custom_model_endpoints (slug, display_name, base_url, default_model, enabled)
       VALUES (?, 'Fake studio model', ?, 'glm-flash', TRUE)`,
      SLUG, fake.baseUrl,
    );
    invalidateCustomEndpointCache();
    await db.run('INSERT INTO projects (id, name) VALUES (?, ?)', projectsRowId, 'studio-compat-test');
    await db.run(
      "INSERT INTO coding_projects (id, project_id, name, tier, discovery_summary, test_command) VALUES (?, ?, ?, 'large', ?, ?)",
      codingProjectId, projectsRowId, 'Compat build', '# Charter\n\nGrow a module.', JSON.stringify(['node', '--run', 'test']),
    );
  }, 60_000);

  afterAll(async () => {
    try {
      if (db) {
        await clearRun();
        await db.run('DELETE FROM coding_projects WHERE id = ?', codingProjectId);
        await db.run('DELETE FROM projects WHERE id = ?', projectsRowId);
        await db.run('DELETE FROM custom_model_endpoints WHERE slug = ?', SLUG);
        await db.close();
      }
    } finally {
      for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
      invalidateCustomEndpointCache();
      await new Promise<void>((resolve) => { fake?.server.close(() => resolve()); });
    }
  });

  beforeEach(async () => {
    resetCodingModelStrategyForTests();
    fake.seen.length = 0;
    fake.plannerReplies.length = 0;
    fake.codegenReplies.length = 0;
    applied = [];
    testRuns = 0;
    await clearRun();
  });

  async function planAndRun(): Promise<Awaited<ReturnType<ReturnType<typeof createStudioOrchestrator>['getRun']>>> {
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId, reviseCap: 3 });
    const planned = await orch.advance(codingProjectId);
    expect(planned.status).toBe('awaiting_plan');
    await orch.approvePlan(codingProjectId);
    return orch.getRun(codingProjectId);
  }

  it('a planner reply without a plan gets one JSON-only retry, then the plan is used', async () => {
    const chatty = 'I would split this into a couple of tasks: first the helper, then its tests.';
    fake.plannerReplies.push(chatty, `${fence}json\n${JSON.stringify(PLAN)}\n${fence}`);
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId });
    const run = await orch.advance(codingProjectId);

    expect(run.status).toBe('awaiting_plan');
    expect(run.plan?.tasks.map((t) => t.title)).toEqual(['Grow big.ts']);
    const planner = fake.seen.filter((s) => s.kind === 'planner');
    expect(planner.map((s) => s.model)).toEqual(['glm-flash', 'glm-flash']);
    expect(planner[1].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(planner[1].messages[1].content).toBe(chatty);
    expect(planner[1].messages[2].content).toBe(PLANNER_JSON_NUDGE);
  });

  it('two unreadable planner replies fail the run honestly (no invented tasks)', async () => {
    fake.plannerReplies.push('Tasks: setup, build.', 'Still prose, sorry.');
    const orch = createStudioOrchestrator(db, deps());
    await orch.startOrResume({ codingProjectId });
    const run = await orch.advance(codingProjectId);
    expect(run.status).toBe('failed');
    expect(run.lastError).toMatch(/readable plan/);
    expect(fake.seen.filter((s) => s.kind === 'planner')).toHaveLength(2);
    const tasks = await db.all('SELECT id FROM coding_tasks WHERE coding_project_id = ?', codingProjectId);
    expect(tasks).toHaveLength(0);
  });

  it('an elided rewrite is refused, the model is told why, and only the whole file is written', async () => {
    fake.plannerReplies.push(`${fence}json\n${JSON.stringify(PLAN)}\n${fence}`);
    fake.codegenReplies.push(
      `${fence}ts\n// FILE: src/big.ts\nexport const v0 = 0;\n// ... rest of the file unchanged\nexport const v44 = 44;\n${fence}`,
      `${fence}ts\n// FILE: src/big.ts\n${FULL}\n${fence}`,
    );
    const run = await planAndRun();

    expect(run?.status).toBe('done');
    const codegen = fake.seen.filter((s) => s.kind === 'codegen');
    expect(codegen).toHaveLength(2);
    expect(codegen[0].model).toBe('glm-flash');
    expect(codegen[0].maxTokens).toBeGreaterThan(8_000);
    const reviseAsk = codegen[1].messages[codegen[1].messages.length - 1].content;
    expect(reviseAsk).toContain('Refused file blocks');
    expect(reviseAsk).toContain('elision');
    // Only the whole file reached the workspace, and the tests ran once, on it.
    expect(applied).toEqual([{ path: 'src/big.ts', content: `${FULL}\n` }]);
    expect(testRuns).toBe(1);
  });

  it('a rewrite that keeps a sliver of the existing file is refused the same way', async () => {
    fake.plannerReplies.push(`${fence}json\n${JSON.stringify(PLAN)}\n${fence}`);
    const sliver = Array.from({ length: 5 }, (_, i) => `export const v${i} = ${i};`).join('\n');
    fake.codegenReplies.push(
      `${fence}ts\n// FILE: src/big.ts\n${sliver}\n${fence}`,
      `${fence}ts\n// FILE: src/big.ts\n${FULL}\n${fence}`,
    );
    const run = await planAndRun();

    expect(run?.status).toBe('done');
    const codegen = fake.seen.filter((s) => s.kind === 'codegen');
    expect(codegen).toHaveLength(2);
    expect(codegen[1].messages[codegen[1].messages.length - 1].content).toMatch(/shrinks from 40 to 5/);
    expect(applied).toEqual([{ path: 'src/big.ts', content: `${FULL}\n` }]);
    expect(testRuns).toBe(1);
    const apps = await db.all<{ status: string }>(
      'SELECT status FROM coding_workspace_applications WHERE coding_project_id = ?', codingProjectId,
    );
    expect(apps.map((a) => a.status)).toEqual(['applied']);
  });

  // Showcase review C15: with one block applied and another refused, the task
  // finished done (verified, when the old tests still passed) although the
  // change it existed for was never written.
  const NEW_FILE = `${fence}ts\n// FILE: src/new.ts\nexport const n = 1;\n${fence}`;
  const ELIDED_BIG = `${fence}ts\n// FILE: src/big.ts\nexport const v0 = 0;\n// ... rest of the file unchanged\n${fence}`;
  const WHOLE_BIG = `${fence}ts\n// FILE: src/big.ts\n${FULL}\n${fence}`;

  it('a round that applies one file and refuses another is not done, even with the tests green', async () => {
    fake.plannerReplies.push(`${fence}json\n${JSON.stringify(PLAN)}\n${fence}`);
    fake.codegenReplies.push(`${NEW_FILE}\n\n${ELIDED_BIG}`, WHOLE_BIG);
    const run = await planAndRun();

    const codegen = fake.seen.filter((s) => s.kind === 'codegen');
    expect(codegen).toHaveLength(2);
    const reviseAsk = codegen[1].messages[codegen[1].messages.length - 1].content;
    expect(reviseAsk).toContain('Refused file blocks');
    expect(reviseAsk).toContain('src/big.ts');
    expect(reviseAsk).toContain('the tests pass');
    expect(reviseAsk).toContain('not done until each refused file is written whole');
    expect(applied).toEqual([
      { path: 'src/new.ts', content: 'export const n = 1;\n' },
      { path: 'src/big.ts', content: `${FULL}\n` },
    ]);
    expect(testRuns).toBe(2);
    expect(run?.plan?.tasks[0]).toMatchObject({ status: 'done', verified: true, reviseRounds: 1 });
    expect(run?.stepLog.some((e) => /Applied 1 file\(s\) .*; refused 1: src\/big\.ts/.test(e.message))).toBe(true);
  });

  it('with no test command, a partly refused round is not done either', async () => {
    await db.run('UPDATE coding_projects SET test_command = NULL WHERE id = ?', codingProjectId);
    try {
      fake.plannerReplies.push(`${fence}json\n${JSON.stringify(PLAN)}\n${fence}`);
      fake.codegenReplies.push(`${NEW_FILE}\n\n${ELIDED_BIG}`, WHOLE_BIG);
      const run = await planAndRun();

      const codegen = fake.seen.filter((s) => s.kind === 'codegen');
      expect(codegen).toHaveLength(2);
      const reviseAsk = codegen[1].messages[codegen[1].messages.length - 1].content;
      expect(reviseAsk).toContain('src/big.ts');
      expect(reviseAsk).not.toContain('the tests pass');
      expect(applied.map((f) => f.path)).toEqual(['src/new.ts', 'src/big.ts']);
      expect(testRuns).toBe(0);
      expect(run?.plan?.tasks[0]).toMatchObject({ status: 'done', verified: false, reviseRounds: 1 });
    } finally {
      await db.run('UPDATE coding_projects SET test_command = ? WHERE id = ?', JSON.stringify(['node', '--run', 'test']), codingProjectId);
    }
  });

  it('a file refused every round runs out the revise cap: failed, not done', async () => {
    fake.plannerReplies.push(`${fence}json\n${JSON.stringify(PLAN)}\n${fence}`);
    const partly = `${NEW_FILE}\n\n${ELIDED_BIG}`;
    fake.codegenReplies.push(partly, partly, partly, partly);
    const run = await planAndRun();

    expect(fake.seen.filter((s) => s.kind === 'codegen')).toHaveLength(4); // initial + revise cap 3
    expect(applied).toHaveLength(4);
    expect(applied.every((f) => f.path === 'src/new.ts')).toBe(true);
    expect(run?.plan?.tasks[0].status).toBe('failed');
    expect(run?.stepLog.some((e) => /file blocks still refused/.test(e.message))).toBe(true);
  });

  it('NEGATIVE CONTROL: two whole files in one round are done and verified at once', async () => {
    fake.plannerReplies.push(`${fence}json\n${JSON.stringify(PLAN)}\n${fence}`);
    fake.codegenReplies.push(`${NEW_FILE}\n\n${WHOLE_BIG}`);
    const run = await planAndRun();

    expect(fake.seen.filter((s) => s.kind === 'codegen')).toHaveLength(1);
    expect(applied.map((f) => f.path)).toEqual(['src/new.ts', 'src/big.ts']);
    expect(testRuns).toBe(1);
    expect(run?.plan?.tasks[0]).toMatchObject({ status: 'done', verified: true, reviseRounds: 0 });
  });

  it('refusing every round runs out the revise cap and fails the task, writing nothing', async () => {
    fake.plannerReplies.push(`${fence}json\n${JSON.stringify(PLAN)}\n${fence}`);
    const elided = `${fence}ts\n// FILE: src/big.ts\nexport const v0 = 0;\n// ...\n${fence}`;
    fake.codegenReplies.push(elided, elided, elided, elided);
    const run = await planAndRun();

    expect(fake.seen.filter((s) => s.kind === 'codegen')).toHaveLength(4); // initial + revise cap 3
    expect(applied).toEqual([]);
    expect(testRuns).toBe(0);
    expect(run?.plan?.tasks[0].status).toBe('failed');
  });
});
