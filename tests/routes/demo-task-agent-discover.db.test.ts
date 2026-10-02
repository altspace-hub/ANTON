/**
 * demo-task-agent-discover.db.test.ts — the Task Agent and Discover on the
 * co-worker showcase (DEPLOYMENT_MODE=team, DEMO_MODE=true, an
 * OpenAI-compatible engine only), 2026-10-02.
 *
 * Task Agent, for a demo visitor:
 *   - never offered, planned on or run with a module the demo keeps off: the
 *     seeded cap-sanctions-advisory runs sanctions-advisory, which the demo
 *     hides — its capability, its approach template, its catalogue entry and
 *     a plan step naming it are all left out, and a stored step naming it
 *     runs on the generic prompt;
 *   - Execute-as-mission and sync-mission answer 404 (the missions runner is
 *     forced off on a demo);
 *   - every model call is checked against and charged to the monthly budget;
 *   - the quality gate follows DEMO_POST_ANSWER_CALLS, and re-runs at most once;
 *   - task attachments count against the demo upload quota;
 *   - the instance-wide approach statistics do not move;
 *   - a deleted task takes its workflow_outputs copy with it.
 *   POST /task-agent/backfill-atoms and /ingest are admin-only on a team server.
 *
 * Discover, for a demo visitor:
 *   - the opening says, word for word, not to enter real names or personal
 *     data; the interview is told the demo's rules and not shown the hidden
 *     areas; the healthcare pack is neither listed nor accepted, from the
 *     route or from the model's state update;
 *   - insights and the report never recommend a hidden module;
 *   - follow-ups: the list is a list, and another person's follow-up cannot
 *     be rewritten (404) — the owner and an admin still can.
 *
 * Every visitor rule has its negative control: the same request from an
 * administrator (or, for the follow-ups, from the owner).
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http, { type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-demo-task-agent-discover';
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);
const SLUG = `ttask${tag}`;
const DEFAULT = `compat:${SLUG}:glm-fake`;
const VISITOR = `u-ta-visitor-${tag}`;
const OTHER = `u-ta-other-${tag}`;
const ADMIN = `u-ta-admin-${tag}`;
const USERS = [VISITOR, OTHER, ADMIN];

// Test-only catalogue rows: one capability on a hidden module, one on a visible
// one, and an approach template on each.
const CAP_HIDDEN = `cap-t-sanctions-${tag}`;
const CAP_VISIBLE = `cap-t-docs-${tag}`;
const APP_HIDDEN = `app-t-sanctions-${tag}`;
const APP_VISIBLE = `app-t-docs-${tag}`;

interface Sent { model: string; stream: boolean; system: string; user: string; kind: string }

/** What the fake answers, by kind of call; set per test. */
const replies = {
  gateOverall: 9,
  discoveryState: '{"userProfile":{"role":"compliance analyst"},"activePack":"healthcare"}',
};

function kindOf(system: string, user: string): string {
  if (/PHASE 1: PROPOSE APPROACHES/.test(system)) return 'task-intake';
  if (/## WHAT TO PRODUCE/.test(system)) return 'task-step';
  if (/strict quality assessor/.test(user)) return 'task-gate';
  if (/Discovery Guide/.test(system)) return 'discovery-turn';
  if (/analytical assistant/.test(system)) return 'discovery-insights';
  if (/generating a professional discovery report/.test(system)) return 'discovery-report';
  return 'other';
}

function replyFor(kind: string): string {
  switch (kind) {
    case 'task-intake':
      // Fenced inside the tag, as GLM writes it: read tolerantly.
      return `Here is how I would approach it.\n<approaches>\n\`\`\`json\n${JSON.stringify({
        ready: true,
        proposals: [
          {
            approach_id: APP_VISIBLE, name: 'Policy pack', summary: 's', rationale: 'r', effort: 'medium', outcome: 'o',
            execution_steps: [
              { step: 1, name: 'Sanctions brief', module_id: 'sanctions-advisory' },
              { step: 2, name: 'Policy draft', module_id: 'document-creation', capability_id: CAP_HIDDEN },
            ],
          },
          { approach_id: APP_HIDDEN, name: 'Sanctions review', summary: 's', rationale: 'r', effort: 'deep', outcome: 'o', execution_steps: [] },
        ],
      })}\n\`\`\`\n</approaches>`;
    case 'task-step':
      return '# Deliverable\nThe policy, drafted.';
    case 'task-gate':
      return JSON.stringify({ completeness: replies.gateOverall, grounding: replies.gateOverall, structure: replies.gateOverall, actionability: replies.gateOverall, overall: replies.gateOverall, critique: 'fine' });
    case 'discovery-turn':
      return `Welcome! What kind of role do you have?\n[STATE_UPDATE]:${replies.discoveryState}`;
    case 'discovery-insights':
      return JSON.stringify({
        topPainTheme: 'reporting',
        earlyModuleMatches: [
          { name: 'Clinical documentation', area: 'Healthcare', confidence: 0.9 },
          { name: 'AML policy drafting', area: 'Financial Crime Prevention', confidence: 0.8 },
        ],
        estimatedOpportunity: null, quickWinSpotted: null, phaseInsight: null,
      });
    case 'discovery-report':
      return `# Report\nFindings.\n[DISCOVERY_OUTPUT]:${JSON.stringify({
        moduleMatches: [
          { moduleId: 'sanctions-advisory', matchReason: 'a' },
          { moduleId: 'clinical-documentation-assistant', matchReason: 'b' },
          { moduleId: 'document-creation', matchReason: 'c' },
        ],
        actionPlan: [], metrics: {}, nonAiFindings: [], executiveBriefing: 'Brief.',
      })}`;
    default:
      return '{}';
  }
}

function startFake(seen: Sent[]): Promise<{ server: Server; baseUrl: string }> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}') as { model?: string; stream?: boolean; messages?: Array<{ role: string; content: unknown }> };
      const text = (role: string) => (parsed.messages ?? []).filter((m) => m.role === role).map((m) => String(m.content)).join('\n');
      const system = text('system');
      const user = text('user');
      const kind = kindOf(system, user);
      seen.push({ model: String(parsed.model), stream: !!parsed.stream, system, user, kind });
      const content = replyFor(kind);
      const usage = { prompt_tokens: 120, completion_tokens: 30, cost: 0.0001 };
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage })}\n\n`);
        res.end('data: [DONE]\n\n');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` }));
  });
}

/** The SSE data frames of a response, parsed. */
async function frames(res: globalThis.Response): Promise<Array<Record<string, unknown>>> {
  const body = await res.text();
  return body.split('\n')
    .filter((l) => l.startsWith('data: ') && l.slice(6).trim() !== '[DONE]')
    .map((l) => JSON.parse(l.slice(6).trim()) as Record<string, unknown>);
}

d('the Task Agent and Discover for demo visitors', () => {
  let db: DatabaseAdapter;
  const seen: Sent[] = [];
  let fake: Awaited<ReturnType<typeof startFake>>;
  let app: Server;
  let base = '';
  let caller: { id: string; role: string } = { id: VISITOR, role: 'analyst' };
  const ENV = [
    'DEMO_MODE', 'DEMO_OFFERED_MODELS', 'DEPLOYMENT_MODE', 'DEMO_HIDDEN_AREAS', 'DEMO_HIDDEN_MODULES',
    'DEMO_POST_ANSWER_CALLS', 'DEMO_USER_UPLOAD_FILES', 'DEMO_USER_UPLOAD_MB', 'QUALITY_SCORER_MODEL',
  ] as const;
  const saved: Record<string, string | undefined> = {};
  let setDefault: (db: DatabaseAdapter, model: string | null) => Promise<unknown>;
  let sanctionsPromptHead = '';
  let demoOpeningNotice = '';

  beforeAll(async () => {
    for (const k of ENV) saved[k] = process.env[k];
    fake = await startFake(seen);
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    await db.run(
      `INSERT INTO custom_model_endpoints (slug, display_name, base_url, default_model, enabled) VALUES (?, 'Fake', ?, 'glm-fake', TRUE)`,
      SLUG, fake.baseUrl,
    );
    for (const [id, role] of [[VISITOR, 'analyst'], [OTHER, 'analyst'], [ADMIN, 'admin']] as const) {
      await db.run(`INSERT INTO users (id, username, password_hash, role, monthly_token_budget) VALUES (?, ?, 'x', ?, 0)`, id, id, role);
    }
    for (const [id, name, moduleId] of [[CAP_HIDDEN, 'Test sanctions capability', 'sanctions-advisory'], [CAP_VISIBLE, 'Test policy capability', 'document-creation']] as const) {
      await db.run(
        `INSERT INTO anton_capabilities (id, capability_type, name, description, area, tags, route, module_id, typical_inputs, typical_outputs, effort_estimate, use_cases, active)
         VALUES (?, 'module', ?, 'Test capability', 'fcp', '[]', NULL, ?, '[]', '[]', 'medium', '[]', 1)`,
        id, name, moduleId,
      );
    }
    for (const [id, cap] of [[APP_HIDDEN, CAP_HIDDEN], [APP_VISIBLE, CAP_VISIBLE]] as const) {
      await db.run(
        `INSERT INTO anton_approaches (id, name, summary, description, task_pattern, capability_ids, execution_steps, effort, outcome, required_inputs, confidence_threshold, active)
         VALUES (?, ?, 's', 'd', '[]', ?, ?, 'medium', 'o', '[]', 0.5, 1)`,
        id, `Approach ${id}`, JSON.stringify([cap]), JSON.stringify([{ step: 1, name: 'Template step', capability_id: cap }]),
      );
    }
    const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
    setRouterDb(db);
    const store = await import('../../server/services/default-model-store.js');
    setDefault = store.setPersistedDefaultModel as typeof setDefault;
    await setDefault(db, DEFAULT);
    const { getModuleSystemPrompt } = await import('../../server/services/module-loader.js');
    sanctionsPromptHead = ((await getModuleSystemPrompt('sanctions-advisory')) ?? '').slice(0, 160);
    demoOpeningNotice = (await import('../../server/services/discovery-engine.js')).DEMO_OPENING_NOTICE;
    const { createTaskAgentRoutes } = await import('../../server/routes/task-agent.js');
    const { createDiscoveryRoutes } = await import('../../server/routes/discovery.js');
    const e = express();
    e.use(express.json());
    e.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: { id: string; username: string; role: string } }).user = { ...caller, username: caller.id };
      next();
    });
    e.use('/api/task-agent', await createTaskAgentRoutes(db));
    e.use('/api', await createDiscoveryRoutes(db));
    await new Promise<void>((resolve) => { app = e.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  }, 60_000);

  beforeEach(() => {
    process.env.DEMO_MODE = 'true';
    process.env.DEPLOYMENT_MODE = 'team';
    process.env.DEMO_OFFERED_MODELS = DEFAULT;
    for (const k of ['DEMO_HIDDEN_AREAS', 'DEMO_HIDDEN_MODULES', 'DEMO_POST_ANSWER_CALLS', 'DEMO_USER_UPLOAD_FILES', 'DEMO_USER_UPLOAD_MB', 'QUALITY_SCORER_MODEL'] as const) delete process.env[k];
  });

  afterEach(async () => {
    for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    caller = { id: VISITOR, role: 'analyst' };
    seen.length = 0;
    replies.gateOverall = 9;
    replies.discoveryState = '{"userProfile":{"role":"compliance analyst"},"activePack":"healthcare"}';
    await db.run('UPDATE users SET monthly_token_budget = 0 WHERE id IN (?, ?, ?)', USERS).catch(() => {});
    await db.run('DELETE FROM user_monthly_usage WHERE user_id IN (?, ?, ?)', USERS).catch(() => {});
  });

  afterAll(async () => {
    if (db) {
      await setDefault(db, null).catch(() => {});
      await db.run('DELETE FROM workflow_outputs WHERE created_by IN (?, ?, ?)', USERS).catch(() => {});
      await db.run('DELETE FROM anton_tasks WHERE user_id IN (?, ?, ?)', USERS).catch(() => {});
      await db.run('DELETE FROM discovery_sessions WHERE user_id IN (?, ?, ?)', USERS).catch(() => {});
      await db.run('DELETE FROM anton_approaches WHERE id IN (?, ?)', [APP_HIDDEN, APP_VISIBLE]).catch(() => {});
      await db.run('DELETE FROM anton_capabilities WHERE id IN (?, ?)', [CAP_HIDDEN, CAP_VISIBLE]).catch(() => {});
      await db.run('DELETE FROM llm_spend_ledger WHERE model LIKE ?', `compat:${SLUG}:%`).catch(() => {});
      await db.run('DELETE FROM audit_log WHERE model LIKE ? OR user_id IN (?, ?, ?)', [`compat:${SLUG}:%`, ...USERS]).catch(() => {});
      await db.run('DELETE FROM user_monthly_usage WHERE user_id IN (?, ?, ?)', USERS).catch(() => {});
      await db.run('DELETE FROM users WHERE id IN (?, ?, ?)', USERS).catch(() => {});
      await db.run('DELETE FROM custom_model_endpoints WHERE slug = ?', SLUG).catch(() => {});
      const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
      setRouterDb(null);
      await db.close();
    }
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
    await new Promise<void>((resolve) => { fake?.server.close(() => resolve()); });
  });

  const as = (id: string, role: string) => { caller = { id, role }; };
  const call = (method: string, p: string, body?: unknown) => fetch(`${base}/api${p}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const usageOf = async (userId: string): Promise<number> => {
    const row = await db.get<{ t: string | number | null }>('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS t FROM user_monthly_usage WHERE user_id = ?', userId);
    return Number(row?.t ?? 0);
  };
  const timesCompleted = async (approachId: string): Promise<number> => {
    const row = await db.get<{ n: number }>('SELECT times_completed AS n FROM anton_approaches WHERE id = ?', approachId);
    return Number(row?.n ?? 0);
  };

  /** A task straight in the database, ready to run one step that names `moduleId`. */
  async function readyTask(userId: string, moduleId: string): Promise<string> {
    const id = randomUUID();
    await db.run(
      `INSERT INTO anton_tasks (id, user_id, title, description, status, chosen_approach_id, chosen_approach_config, intake_ready, current_step)
       VALUES (?, ?, 'Sanctions policy', 'Draft a sanctions policy for a bank', 'clarifying', ?, ?, 1, 0)`,
      id, userId, APP_VISIBLE, JSON.stringify({ execution_steps: [{ step: 1, name: 'Sanctions brief', module_id: moduleId }] }),
    );
    return id;
  }

  // ── Task Agent ───────────────────────────────────────────────────────────

  it('capabilities: a visitor is not offered the hidden module\'s capability or its template; an admin is', async () => {
    const res = await call('GET', '/task-agent/capabilities');
    expect(res.status).toBe(200);
    const body = await res.json() as { capabilities: Array<{ id: string }>; approaches: Array<{ id: string }> };
    const capIds = body.capabilities.map((c) => c.id);
    const appIds = body.approaches.map((a) => a.id);
    expect(capIds).toContain(CAP_VISIBLE);
    expect(capIds).not.toContain(CAP_HIDDEN);
    expect(capIds).not.toContain('cap-sanctions-advisory');
    expect(capIds).not.toContain('cap-dj-screening');
    expect(appIds).toContain(APP_VISIBLE);
    expect(appIds).not.toContain(APP_HIDDEN);

    // Negative control: the administrator sees everything.
    as(ADMIN, 'admin');
    const admin = await (await call('GET', '/task-agent/capabilities')).json() as { capabilities: Array<{ id: string }>; approaches: Array<{ id: string }> };
    expect(admin.capabilities.map((c) => c.id)).toContain(CAP_HIDDEN);
    expect(admin.approaches.map((a) => a.id)).toContain(APP_HIDDEN);
  });

  it('tasks are the owner\'s: another visitor gets 404 and an empty list', async () => {
    const created = await call('POST', '/task-agent/tasks', { title: 'My task', description: 'Something to do' });
    expect(created.status).toBe(201);
    const { task } = await created.json() as { task: { id: string } };
    expect((await call('GET', `/task-agent/tasks/${task.id}`)).status).toBe(200);

    as(OTHER, 'analyst');
    expect((await call('GET', `/task-agent/tasks/${task.id}`)).status).toBe(404);
    expect((await call('DELETE', `/task-agent/tasks/${task.id}`)).status).toBe(404);
    const list = await (await call('GET', '/task-agent/tasks')).json() as { tasks: Array<{ id: string }> };
    expect(list.tasks.map((t) => t.id)).not.toContain(task.id);

    // Negative control: the owner still has it.
    as(VISITOR, 'analyst');
    const own = await (await call('GET', '/task-agent/tasks')).json() as { tasks: Array<{ id: string }> };
    expect(own.tasks.map((t) => t.id)).toContain(task.id);
  });

  it('intake: a visitor\'s prompt carries the demo rules and no hidden module; proposals are cleared of them; the tokens are charged', async () => {
    const { task } = await (await call('POST', '/task-agent/tasks', { title: 'Sanctions advisory', description: 'Sanctions advisory: sanctions regime briefing and sanctions screening review for a bank' })).json() as { task: { id: string } };
    const res = await call('POST', `/task-agent/tasks/${task.id}/message`, { content: 'Sanctions advisory for a bank, please.' });
    expect(res.status).toBe(200);
    const done = (await frames(res)).find((f) => f.type === 'done') as { proposals: Array<{ approach_id: string; execution_steps: Array<{ module_id?: string; capability_id?: string }> }> };
    const sent = seen.find((s) => s.kind === 'task-intake')!;
    expect(sent.model).toBe('glm-fake');
    expect(sent.system).toContain('PUBLIC DEMO RULES');
    expect(sent.system).not.toContain('module_id: sanctions-advisory');
    expect(sent.system).not.toContain(`[${CAP_HIDDEN}]`);
    expect(sent.system).not.toContain(`[${APP_HIDDEN}]`);
    expect(sent.system).not.toContain('[cap-sanctions-advisory]');
    // Read through the fence; the hidden template's proposal is gone, and so
    // are the hidden module and capability from the kept one.
    expect(done.proposals.map((p) => p.approach_id)).toEqual([APP_VISIBLE]);
    expect(done.proposals[0].execution_steps[0].module_id).toBeUndefined();
    expect(done.proposals[0].execution_steps[1]).toMatchObject({ module_id: 'document-creation' });
    expect(done.proposals[0].execution_steps[1].capability_id).toBeUndefined();
    expect(await usageOf(VISITOR)).toBe(150);

    // Negative control: the administrator's intake is unchanged.
    seen.length = 0;
    as(ADMIN, 'admin');
    const { task: adminTask } = await (await call('POST', '/task-agent/tasks', { title: 'Sanctions advisory', description: 'Sanctions advisory: sanctions regime briefing and sanctions screening review for a bank' })).json() as { task: { id: string } };
    const adminDone = (await frames(await call('POST', `/task-agent/tasks/${adminTask.id}/message`, { content: 'Sanctions advisory for a bank, please.' })))
      .find((f) => f.type === 'done') as { proposals: Array<{ approach_id: string; execution_steps: Array<{ module_id?: string }> }> };
    const adminSent = seen.find((s) => s.kind === 'task-intake')!;
    expect(adminSent.system).not.toContain('PUBLIC DEMO RULES');
    expect(adminSent.system).toContain('module_id: sanctions-advisory');
    expect(adminSent.system).toContain(`[${CAP_HIDDEN}]`);
    expect(adminDone.proposals.map((p) => p.approach_id)).toEqual([APP_VISIBLE, APP_HIDDEN]);
    expect(adminDone.proposals[0].execution_steps[0].module_id).toBe('sanctions-advisory');
  });

  it('select-approach: a visitor cannot pick the hidden template, and a hidden module is dropped from the plan; an admin keeps both', async () => {
    const { task } = await (await call('POST', '/task-agent/tasks', { title: 'T', description: 'D' })).json() as { task: { id: string } };
    expect((await call('POST', `/task-agent/tasks/${task.id}/select-approach`, { approach_id: APP_HIDDEN })).status).toBe(404);
    const ok = await call('POST', `/task-agent/tasks/${task.id}/select-approach`, {
      approach_id: APP_VISIBLE,
      execution_steps: [{ step: 1, name: 'Brief', module_id: 'sanctions-advisory' }, { step: 2, name: 'Draft', module_id: 'document-creation' }],
    });
    expect(ok.status).toBe(200);
    const stored = await db.get<{ c: string }>('SELECT chosen_approach_config AS c FROM anton_tasks WHERE id = ?', task.id);
    const steps = (JSON.parse(stored!.c) as { execution_steps: Array<{ module_id?: string }> }).execution_steps;
    expect(steps.map((s) => s.module_id)).toEqual([undefined, 'document-creation']);

    // Negative control: an administrator.
    as(ADMIN, 'admin');
    const { task: adminTask } = await (await call('POST', '/task-agent/tasks', { title: 'T', description: 'D' })).json() as { task: { id: string } };
    expect((await call('POST', `/task-agent/tasks/${adminTask.id}/select-approach`, {
      approach_id: APP_HIDDEN, execution_steps: [{ step: 1, name: 'Brief', module_id: 'sanctions-advisory' }],
    })).status).toBe(200);
    const adminStored = await db.get<{ c: string }>('SELECT chosen_approach_config AS c FROM anton_tasks WHERE id = ?', adminTask.id);
    expect((JSON.parse(adminStored!.c) as { execution_steps: Array<{ module_id?: string }> }).execution_steps[0].module_id).toBe('sanctions-advisory');
  });

  it('execute-step: a stored step on a hidden module runs on the generic prompt for a visitor, with no gate by default; the approach statistics do not move', async () => {
    expect(sanctionsPromptHead.length).toBeGreaterThan(50);
    const before = await timesCompleted(APP_VISIBLE);
    const id = await readyTask(VISITOR, 'sanctions-advisory');
    const res = await call('POST', `/task-agent/tasks/${id}/execute-step`, {});
    expect(res.status).toBe(200);
    const f = await frames(res);
    expect(f.find((x) => x.type === 'done')).toMatchObject({ status: 'completed', qualityScore: null });
    const steps = seen.filter((s) => s.kind === 'task-step');
    expect(steps).toHaveLength(1);
    expect(steps[0].model).toBe('glm-fake');
    expect(steps[0].system).not.toContain(sanctionsPromptHead);
    expect(steps[0].system).toContain('You cannot open links or search the web');
    // DEMO_POST_ANSWER_CALLS unset ('conclusion'): no quality score.
    expect(seen.filter((s) => s.kind === 'task-gate')).toHaveLength(0);
    expect(await timesCompleted(APP_VISIBLE)).toBe(before);
    expect(await usageOf(VISITOR)).toBe(150);

    // Negative control: an administrator's step runs the module's own prompt
    // and moves the statistics.
    seen.length = 0;
    as(ADMIN, 'admin');
    const adminId = await readyTask(ADMIN, 'sanctions-advisory');
    await frames(await call('POST', `/task-agent/tasks/${adminId}/execute-step`, {}));
    expect(seen.find((s) => s.kind === 'task-step')!.system).toContain(sanctionsPromptHead);
    expect(await timesCompleted(APP_VISIBLE)).toBe(before + 1);
  });

  it('execute-step with DEMO_POST_ANSWER_CALLS=scored: the gate scores, and a low score re-runs a visitor\'s step once (an admin\'s twice)', async () => {
    process.env.DEMO_POST_ANSWER_CALLS = 'scored';
    replies.gateOverall = 5;
    const id = await readyTask(VISITOR, 'document-creation');
    const f = await frames(await call('POST', `/task-agent/tasks/${id}/execute-step`, {}));
    expect(f.find((x) => x.type === 'done')).toMatchObject({ retryCount: 1, qualityScore: 5 });
    expect(seen.filter((s) => s.kind === 'task-step')).toHaveLength(2);
    expect(seen.filter((s) => s.kind === 'task-gate')).toHaveLength(2);

    // Negative control: the administrator's step is re-run twice.
    seen.length = 0;
    as(ADMIN, 'admin');
    const adminId = await readyTask(ADMIN, 'document-creation');
    const af = await frames(await call('POST', `/task-agent/tasks/${adminId}/execute-step`, {}));
    expect(af.find((x) => x.type === 'done')).toMatchObject({ retryCount: 2 });
    expect(seen.filter((s) => s.kind === 'task-step')).toHaveLength(3);
  });

  it('the monthly budget: a visitor over it gets 429 before any model call; within it, the call runs', async () => {
    await db.run('UPDATE users SET monthly_token_budget = 100 WHERE id = ?', VISITOR);
    await db.run(
      `INSERT INTO user_monthly_usage (id, user_id, year_month, input_tokens, output_tokens) VALUES (?, ?, ?, 500, 0)`,
      randomUUID(), VISITOR, new Date().toISOString().slice(0, 7),
    );
    const { task } = await (await call('POST', '/task-agent/tasks', { title: 'T', description: 'D' })).json() as { task: { id: string } };
    const res = await call('POST', `/task-agent/tasks/${task.id}/message`, { content: 'Go' });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'Budget limit exceeded' });
    const step = await call('POST', `/task-agent/tasks/${await readyTask(VISITOR, 'document-creation')}/execute-step`, {});
    expect(step.status).toBe(429);
    expect(seen).toHaveLength(0);

    // Negative control: no budget set (0 = unlimited).
    await db.run('UPDATE users SET monthly_token_budget = 0 WHERE id = ?', VISITOR);
    expect((await call('POST', `/task-agent/tasks/${task.id}/message`, { content: 'Go' })).status).toBe(200);
  });

  it('execute-as-mission and sync-mission answer 404 to a visitor; an admin reaches the route', async () => {
    const id = await readyTask(VISITOR, 'document-creation');
    for (const p of ['execute-as-mission', 'sync-mission']) {
      const res = await call('POST', `/task-agent/tasks/${id}/${p}`, {});
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: 'Not available in this demo' });
    }
    // Negative control: the administrator gets the route's own answers.
    as(ADMIN, 'admin');
    const { task } = await (await call('POST', '/task-agent/tasks', { title: 'T', description: 'D' })).json() as { task: { id: string } };
    expect(await (await call('POST', `/task-agent/tasks/${task.id}/execute-as-mission`, {})).json()).toMatchObject({ error: 'No approach selected' });
    expect(await (await call('POST', `/task-agent/tasks/${task.id}/sync-mission`, {})).json()).toMatchObject({ error: 'Task has no linked mission' });
  });

  it('backfill-atoms and ingest are admin-only on a team server', async () => {
    as(OTHER, 'analyst');
    expect((await call('POST', '/task-agent/backfill-atoms', {})).status).toBe(403);
    expect((await call('POST', '/task-agent/ingest', { source: 'jira', title: 'From Jira', description: 'Ticket' })).status).toBe(403);
    // Negative control: an administrator; an ingested task is theirs.
    as(ADMIN, 'admin');
    expect((await call('POST', '/task-agent/backfill-atoms', {})).status).toBe(200);
    const ingested = await call('POST', '/task-agent/ingest', { source: 'jira', title: 'From Jira', description: 'Ticket' });
    expect(ingested.status).toBe(201);
    const { task_id } = await ingested.json() as { task_id: string };
    expect((await db.get<{ u: string }>('SELECT user_id AS u FROM anton_tasks WHERE id = ?', task_id))?.u).toBe(ADMIN);
  });

  it('attachments count against the demo upload quota; an admin has none', async () => {
    process.env.DEMO_USER_UPLOAD_FILES = '1';
    const upload = async (taskId: string) => {
      const form = new FormData();
      form.append('file', new Blob(['A made-up policy text for the demo.'], { type: 'text/plain' }), 'policy.txt');
      return fetch(`${base}/api/task-agent/tasks/${taskId}/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
    };
    const { task } = await (await call('POST', '/task-agent/tasks', { title: 'T', description: 'D' })).json() as { task: { id: string } };
    expect((await upload(task.id)).status).toBe(200);
    const second = await upload(task.id);
    expect(second.status).toBe(413);
    expect(await second.json()).toMatchObject({ code: 'UPLOAD_QUOTA' });

    // Negative control: the administrator uploads twice.
    as(ADMIN, 'admin');
    const { task: adminTask } = await (await call('POST', '/task-agent/tasks', { title: 'T', description: 'D' })).json() as { task: { id: string } };
    expect((await upload(adminTask.id)).status).toBe(200);
    expect((await upload(adminTask.id)).status).toBe(200);
  });

  it('a deleted task takes its workflow_outputs copy with it on a demo, and nobody else\'s', async () => {
    const { task } = await (await call('POST', '/task-agent/tasks', { title: 'T', description: 'D' })).json() as { task: { id: string } };
    const mine = `wo_t_${tag}_mine`;
    const theirs = `wo_t_${tag}_theirs`;
    for (const [id, owner] of [[mine, VISITOR], [theirs, OTHER]] as const) {
      await db.run(
        `INSERT INTO workflow_outputs (id, execution_id, workflow_id, step_index, step_type, output_data, output_summary, created_by, workflow_name, step_name)
         VALUES (?, ?, ?, 0, 'task_completion', '{}', 's', ?, 'w', 's')`,
        id, task.id, `task-${task.id}`, owner,
      );
    }
    expect((await call('DELETE', `/task-agent/tasks/${task.id}`)).status).toBe(200);
    expect(await db.get('SELECT id FROM workflow_outputs WHERE id = ?', mine)).toBeUndefined();
    // Negative control: a row another account wrote stays.
    expect(await db.get('SELECT id FROM workflow_outputs WHERE id = ?', theirs)).toBeDefined();
  });

  // ── Discover ─────────────────────────────────────────────────────────────

  async function newSession(tier = 'lite'): Promise<string> {
    const res = await call('POST', '/discovery/sessions', { tier });
    expect(res.status).toBe(200);
    return (await res.json() as { id: string }).id;
  }

  it('the opening: a visitor is told, word for word, not to enter real names; the interview has the demo rules and no hidden area; the model cannot set the healthcare pack', async () => {
    const id = await newSession();
    const res = await call('GET', `/discovery/sessions/${id}/start`);
    expect(res.status).toBe(200);
    const body = await res.json() as { response: string; state: { activePack: string | null; userProfile: { role: string } } };
    expect(body.response.startsWith(demoOpeningNotice)).toBe(true);
    expect(body.state.activePack).toBeNull();
    expect(body.state.userProfile.role).toBe('compliance analyst');
    const sent = seen.find((s) => s.kind === 'discovery-turn')!;
    expect(sent.model).toBe('glm-fake');
    expect(sent.system).toContain('PUBLIC DEMO RULES');
    expect(sent.system).not.toContain('AREA: Healthcare');
    expect(sent.system).not.toContain('AREA: HR');
    expect(sent.system).not.toContain('health-tech');
    expect(await usageOf(VISITOR)).toBe(150);

    // Negative control: the administrator's interview.
    seen.length = 0;
    as(ADMIN, 'admin');
    const adminId = await newSession();
    const admin = await (await call('GET', `/discovery/sessions/${adminId}/start`)).json() as { response: string; state: { activePack: string | null } };
    expect(admin.response.startsWith(demoOpeningNotice)).toBe(false);
    expect(admin.state.activePack).toBe('healthcare');
    const adminSent = seen.find((s) => s.kind === 'discovery-turn')!;
    expect(adminSent.system).not.toContain('PUBLIC DEMO RULES');
    expect(adminSent.system).toContain('AREA: Healthcare');
  });

  it('packs: a visitor is neither shown nor given the healthcare pack; an admin is', async () => {
    const list = await (await call('GET', '/discovery/packs')).json() as Array<{ id: string }>;
    expect(list.map((p) => p.id)).not.toContain('healthcare');
    expect(list.map((p) => p.id)).toContain('fcp');
    const id = await newSession('expert');
    expect((await call('POST', `/discovery/sessions/${id}/pack`, { packId: 'healthcare' })).status).toBe(404);
    expect((await call('POST', `/discovery/sessions/${id}/pack`, { packId: 'fcp' })).status).toBe(200);
    // The client-state write that could set it is closed to a visitor.
    expect((await call('PUT', `/discovery/sessions/${id}`, { state: { activePack: 'healthcare' } })).status).toBe(404);

    // Negative control: an administrator.
    as(ADMIN, 'admin');
    expect((await (await call('GET', '/discovery/packs')).json() as Array<{ id: string }>).map((p) => p.id)).toContain('healthcare');
    const adminId = await newSession('expert');
    expect((await call('POST', `/discovery/sessions/${adminId}/pack`, { packId: 'healthcare' })).status).toBe(200);
    // Not a built-in pack: refused for everyone.
    expect((await call('POST', `/discovery/sessions/${adminId}/pack`, { packId: 'bogus' })).status).toBe(404);
  });

  it('insights and the report never point a visitor at a hidden module; an admin gets them all', async () => {
    const id = await newSession();
    const insights = await (await call('GET', `/discovery/sessions/${id}/insights`)).json() as { earlyModuleMatches: Array<{ area: string }> };
    expect(insights.earlyModuleMatches.map((m) => m.area)).toEqual(['Financial Crime Prevention']);
    const report = await call('POST', `/discovery/sessions/${id}/generate`, {});
    expect(report.status).toBe(200);
    const out = await report.json() as { moduleMatches: Array<{ moduleId: string }> };
    expect(out.moduleMatches.map((m) => m.moduleId)).toEqual(['document-creation']);
    const reportSent = seen.find((s) => s.kind === 'discovery-report')!;
    expect(reportSent.user).toContain('PUBLIC DEMO');
    expect(reportSent.user).not.toMatch(/^- sanctions-advisory:/m);

    // Negative control: an administrator.
    as(ADMIN, 'admin');
    const adminId = await newSession();
    const adminInsights = await (await call('GET', `/discovery/sessions/${adminId}/insights`)).json() as { earlyModuleMatches: unknown[] };
    expect(adminInsights.earlyModuleMatches).toHaveLength(2);
    const adminOut = await (await call('POST', `/discovery/sessions/${adminId}/generate`, {})).json() as { moduleMatches: Array<{ moduleId: string }> };
    expect(adminOut.moduleMatches.map((m) => m.moduleId)).toEqual(['sanctions-advisory', 'clinical-documentation-assistant', 'document-creation']);
  });

  it('respond: a visitor over the monthly budget gets 429 before the model is called', async () => {
    const id = await newSession();
    await db.run('UPDATE users SET monthly_token_budget = 100 WHERE id = ?', VISITOR);
    await db.run(
      `INSERT INTO user_monthly_usage (id, user_id, year_month, input_tokens, output_tokens) VALUES (?, ?, ?, 500, 0)`,
      randomUUID(), VISITOR, new Date().toISOString().slice(0, 7),
    );
    expect((await call('POST', `/discovery/sessions/${id}/respond`, { message: 'I review policies.' })).status).toBe(429);
    expect(seen).toHaveLength(0);
    // Negative control: within budget it runs.
    await db.run('UPDATE users SET monthly_token_budget = 0 WHERE id = ?', VISITOR);
    expect((await call('POST', `/discovery/sessions/${id}/respond`, { message: 'I review policies.' })).status).toBe(200);
  });

  it('follow-ups: the pending list is a list of the caller\'s own; another person cannot rewrite one (404), the owner and an admin can', async () => {
    const id = await newSession();
    expect((await call('POST', `/discovery/sessions/${id}/followup`, { type: 'bogus' })).status).toBe(400);
    const a = await (await call('POST', `/discovery/sessions/${id}/followup`, { type: '30_day', scheduledDate: '2026-11-01' })).json() as { id: string };
    const b = await (await call('POST', `/discovery/sessions/${id}/followup`, { type: '60_day', scheduledDate: '2026-12-01' })).json() as { id: string };
    const pending = await (await call('GET', '/discovery/followups/pending')).json() as Array<{ id: string }>;
    expect(Array.isArray(pending)).toBe(true);
    expect(pending.map((f) => f.id)).toEqual(expect.arrayContaining([a.id, b.id]));

    as(OTHER, 'analyst');
    const theirs = await (await call('GET', '/discovery/followups/pending')).json() as Array<{ id: string }>;
    expect(theirs.map((f) => f.id)).not.toContain(a.id);
    const refused = await call('PUT', `/discovery/followups/${a.id}`, { follow_up_notes: 'overwritten', status: 'skipped' });
    expect(refused.status).toBe(404);
    const row = await db.get<{ n: string | null; s: string }>('SELECT follow_up_notes AS n, status AS s FROM discovery_followups WHERE id = ?', a.id);
    expect(row).toMatchObject({ n: null, s: 'pending' });

    // Negative controls: the owner, and an administrator.
    as(VISITOR, 'analyst');
    expect((await call('PUT', `/discovery/followups/${a.id}`, { follow_up_notes: 'mine' })).status).toBe(200);
    as(ADMIN, 'admin');
    expect((await call('PUT', `/discovery/followups/${b.id}`, { status: 'completed' })).status).toBe(200);
    const after = await db.get<{ n: string | null }>('SELECT follow_up_notes AS n FROM discovery_followups WHERE id = ?', a.id);
    expect(after?.n).toBe('mine');
  });
});
