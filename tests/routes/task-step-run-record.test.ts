/**
 * task-step-run-record.test.ts — a Task Agent step on the agentic engine
 * writes a run record per attempt (Wave 5).
 *
 * The step used to keep 300-character previews of its tool calls and nothing
 * else of the run. Now each attempt writes a record under parent 'task_step',
 * id `<taskId>:<stepIndex>`: the system prompt as sent, the hash of the user
 * prompt, the output and the thinking, the engine, the transcript and every
 * tool call in full — while the step's stored previews stay as they were.
 * A quality-gate retry is a second record under the same parent.
 *
 * The route handler runs for real inside the real job registry; the runner,
 * the model router and the prompt lookups are stubbed, and the writer's insert
 * is a spy while its pure record builder stays real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { AgenticRunConfig, AgenticEvent } from '../../server/services/sdk-agentic-runner.js';
import type { RunArtifactInput } from '../../server/services/run-artifact-writer.js';

const runAgenticMock = vi.fn();
vi.mock('../../server/services/sdk-agentic-runner.js', () => ({
  runAgentic: (config: AgenticRunConfig, onEvent: (e: AgenticEvent) => void) => runAgenticMock(config, onEvent),
}));
const gateScores: number[] = [];
vi.mock('../../server/services/provider-router.js', () => ({
  mapModelToProvider: () => 'sdk:claude-opus-5',
  streamChat: vi.fn(async () => { throw new Error('streamChat must not be used on the agentic path'); }),
  callChat: vi.fn(async () => {
    const overall = gateScores.length > 0 ? gateScores.shift()! : 9;
    return { text: JSON.stringify({ completeness: overall, grounding: overall, structure: overall, actionability: overall, overall, critique: 'ok' }), thinking: '', inputTokens: 1, outputTokens: 1 };
  }),
}));
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'sdk:claude-sonnet-5' }));
vi.mock('../../server/services/module-loader.js', () => ({ getModule: vi.fn(), getModuleSystemPrompt: async () => null }));
vi.mock('../../server/services/framework-text-retrieval.js', () => ({ retrieveGroundingText: async () => null }));
vi.mock('../../server/services/module-recommendation.js', () => ({ findCandidateModules: async () => [] }));
const writeV2 = vi.fn(async (): Promise<{ id: string } | null> => ({ id: 'run-1' }));
vi.mock('../../server/services/run-artifact-writer.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../server/services/run-artifact-writer.js')>();
  return { ...original, writeRunArtifactV2: (db: DatabaseAdapter, input: RunArtifactInput) => writeV2(db, input) };
});

import { createTaskAgentRoutes } from '../../server/routes/task-agent.js';
import { getStepJob, resetStepJobsForTests } from '../../server/services/step-job-registry.js';
import { sha256Hex } from '../../server/services/run-artifact-writer.js';

type Handler = (req: unknown, res: unknown) => Promise<unknown>;

async function executeStepHandler(db: DatabaseAdapter): Promise<Handler> {
  const router = await createTaskAgentRoutes(db, {} as never);
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === '/tasks/:id/execute-step' && l.route.methods.post);
  if (!layer?.route) throw new Error('route not mounted: /tasks/:id/execute-step');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function sseRes() {
  return {
    headersSent: false,
    statusCode: 200,
    body: undefined as unknown,
    frames: [] as string[],
    writeHead() { this.headersSent = true; },
    setHeader() { /* noop */ },
    write(s: string) { this.frames.push(s); return true; },
    end() { /* closed */ },
    on() { /* noop */ },
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
}

async function waitForJob(key: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    const job = getStepJob(key);
    if (job && job.status !== 'running') return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`job ${key} did not finish`);
}

const TASK = {
  id: 'task-1', user_id: 'alice', title: 'CDD gap memo', description: 'Assess CDD against AMLR Arts 20–40',
  status: 'clarifying', conversation: '[]', chosen_approach_id: 'appr-1', chosen_approach_config: null,
  intake_answers: '{"Entity":"Retail bank"}', task_files: '[]', active_knowledge_packs: '[]',
  execution_results: '[]', current_step: 0, intake_ready: 1,
};
const APPROACH = {
  id: 'appr-1', capability_ids: '[]',
  execution_steps: JSON.stringify([
    { step: 1, name: 'CDD gap matrix', description: 'Article-by-article matrix' },
    { step: 2, name: 'Remediation memo' },
  ]),
};

function fakeDb() {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    dialect: 'postgresql',
    async get(sql: string) {
      if (/FROM anton_tasks WHERE id=\? AND user_id=\?/.test(sql)) return { ...TASK };
      if (/FROM anton_approaches WHERE id=\?/.test(sql)) return { ...APPROACH };
      return undefined;
    },
    async all() { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> { runs.push({ sql, params }); return { changes: 1, lastInsertRowid: 0 }; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  };
  return { db: db as unknown as DatabaseAdapter, runs };
}

const USAGE = { inputTokens: 5000, outputTokens: 1200, cacheReadTokens: 3000, cacheCreationTokens: 0 };
const LONG_READ = 'Policy text. '.repeat(100); // > 300 chars: the stored preview is cut, the record is not

function agenticResult(text: string, thinking: string) {
  return {
    ok: true, text, thinking, transcript: ['Reading the policy first.', text],
    toolCalls: [
      { id: 1, name: 'read_document', input: { name: 'policy.pdf' }, output: LONG_READ, isError: false, ms: 210 },
      { id: 2, name: 'search_knowledge', input: { query: 'AMLR Article 26' }, output: 'no hits', isError: true, ms: 15 },
    ],
    webSources: [], turns: 3, usage: USAGE,
  };
}

beforeEach(() => {
  resetStepJobsForTests();
  runAgenticMock.mockReset();
  writeV2.mockClear();
  gateScores.length = 0;
});

describe('POST /tasks/:id/execute-step — the run record', () => {
  it('writes one record under <taskId>:<stepIndex> with the prompt as sent, the hashes, the transcript and the full tool calls', async () => {
    runAgenticMock.mockImplementation(async () => agenticResult('# CDD gap matrix\nArt. 20 — partial.', 'weighing article 20'));
    const { db, runs } = fakeDb();
    const res = sseRes();
    await (await executeStepHandler(db))({ params: { id: 'task-1' }, body: {}, user: { id: 'alice', role: 'analyst' } }, res as unknown as Response);
    await waitForJob('task-step:task-1');

    expect(runAgenticMock).toHaveBeenCalledTimes(1);
    const config = runAgenticMock.mock.calls[0][0] as AgenticRunConfig;
    expect(writeV2).toHaveBeenCalledTimes(1);
    const [writtenDb, input] = writeV2.mock.calls[0] as unknown as [DatabaseAdapter, RunArtifactInput];
    expect(writtenDb).toBe(db);

    expect(input.parentKind).toBe('task_step');
    expect(input.parentId).toBe('task-1:0');
    expect(input.messageId).toBeNull();
    expect(input.sessionId).toBeNull();
    expect(input.composedPrompt).toBe(config.system);
    expect(input.composedPrompt).toContain('## TASK');
    expect(input.userMessageSha256).toBe(sha256Hex(config.prompt));
    expect(input.outputSha256).toBe(sha256Hex('# CDD gap matrix\nArt. 20 — partial.'));
    expect(input.thinkingSha256).toBe(sha256Hex('weighing article 20'));
    expect(input.engine).toBe('anthropic_sdk');
    expect(input.modelRequested).toBe('sdk:claude-opus-5');
    expect(input.costBasis).toBe('plan_usage');
    expect(input.status).toBe('completed');
    expect(input.usage).toEqual(USAGE);
    expect(input.transcript).toEqual(['Reading the policy first.', '# CDD gap matrix\nArt. 20 — partial.']);
    expect(input.toolCalls?.map((c) => [c.seq, c.name, c.isError])).toEqual([[1, 'read_document', false], [2, 'search_knowledge', true]]);
    // The record keeps the tool output in full.
    expect(input.toolCalls?.[0].output).toBe(LONG_READ);
    expect(input.requestParams).toMatchObject({
      thinking: 'think', maxTurns: 12, permissionMode: 'dontAsk', turns: 3,
      tools: ['read_document', 'search_knowledge', 'list_expert_modules', 'consult_expert_module'],
      attempt: 1, thinkingLevel: 'think', stepName: 'CDD gap matrix', retry: false,
    });

    // Existing behaviour intact: the step still stores 300-character previews.
    const save = runs.find((r) => /UPDATE anton_tasks SET execution_results=\?/.test(r.sql));
    expect(save).toBeDefined();
    const stored = JSON.parse(String(save!.params[0])) as Array<{ tool_calls?: Array<{ output_preview: string }> }>;
    expect(stored[0].tool_calls).toHaveLength(2);
    expect(stored[0].tool_calls![0].output_preview).toBe(LONG_READ.slice(0, 300));
  });

  it('a quality-gate retry writes a second record under the same parent, marked attempt 2', async () => {
    gateScores.push(6, 9);
    runAgenticMock
      .mockImplementationOnce(async () => agenticResult('first draft', ''))
      .mockImplementationOnce(async () => agenticResult('second draft', 'deeper'));
    const { db } = fakeDb();
    await (await executeStepHandler(db))({ params: { id: 'task-1' }, body: {}, user: { id: 'alice', role: 'analyst' } }, sseRes() as unknown as Response);
    await waitForJob('task-step:task-1');

    expect(writeV2).toHaveBeenCalledTimes(2);
    const [first, second] = writeV2.mock.calls.map((c) => (c as unknown as [DatabaseAdapter, RunArtifactInput])[1]);
    expect(first.parentId).toBe('task-1:0');
    expect(second.parentId).toBe('task-1:0');
    expect(first.outputSha256).toBe(sha256Hex('first draft'));
    expect(first.thinkingSha256).toBeNull();
    expect(second.outputSha256).toBe(sha256Hex('second draft'));
    expect(first.requestParams).toMatchObject({ attempt: 1, retry: false, thinkingLevel: 'think' });
    expect(second.requestParams).toMatchObject({ attempt: 2, retry: true, thinkingLevel: 'think_hard' });
    // The retry prompt carries the critique — and its hash says so.
    const secondConfig = runAgenticMock.mock.calls[1][0] as AgenticRunConfig;
    expect(second.userMessageSha256).toBe(sha256Hex(secondConfig.prompt));
    expect(second.userMessageSha256).not.toBe(first.userMessageSha256);
  });

  it('a failed run is recorded as failed before the step reports the error', async () => {
    runAgenticMock.mockImplementation(async () => ({
      ok: false, error: 'The run was cancelled or timed out.', text: '', thinking: '', transcript: [],
      toolCalls: [], webSources: [], turns: 0, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    }));
    const { db, runs } = fakeDb();
    const res = sseRes();
    await (await executeStepHandler(db))({ params: { id: 'task-1' }, body: {}, user: { id: 'alice', role: 'analyst' } }, res as unknown as Response);
    await waitForJob('task-step:task-1');

    expect(writeV2).toHaveBeenCalledTimes(1);
    const input = writeV2.mock.calls[0][1] as unknown as RunArtifactInput;
    expect(input.status).toBe('failed');
    expect(input.parentId).toBe('task-1:0');
    expect(input.outputSha256).toBeNull();
    expect(input.requestParams).toMatchObject({ error: 'The run was cancelled or timed out.' });
    expect(res.frames.some((f) => f.includes('"type":"error"'))).toBe(true);
    expect(runs.some((r) => /UPDATE anton_tasks SET execution_results=\?/.test(r.sql))).toBe(false);
  });
});
