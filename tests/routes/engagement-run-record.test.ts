/**
 * engagement-run-record.test.ts — an engagement execution on the agentic
 * engine writes its run record (Wave 5).
 *
 * The iteration used to keep the text and the token counts of the run. Now
 * the run writes a record under parent 'engagement_step', id = the iteration
 * id, carrying the system prompt as sent, the hashes of the prompt, output
 * and thinking, the engine, the transcript and every tool call — with the
 * bridged session when the bridge produced one. A failed run (no iteration
 * row) is still recorded, as failed.
 *
 * The route handler runs for real inside the real job registry; the runner,
 * the session bridge and the model router are stubbed, and the writer's
 * insert is a spy while its pure record builder stays real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { AgenticRunConfig, AgenticEvent } from '../../server/services/sdk-agentic-runner.js';
import type { RunArtifactInput } from '../../server/services/run-artifact-writer.js';

const order: string[] = [];
const runAgenticMock = vi.fn();
vi.mock('../../server/services/sdk-agentic-runner.js', () => ({
  runAgentic: (config: AgenticRunConfig, onEvent: (e: AgenticEvent) => void) => runAgenticMock(config, onEvent),
}));
vi.mock('../../server/services/provider-router.js', () => ({
  mapModelToProvider: (m: string) => m,
  streamChat: vi.fn(async () => { throw new Error('streamChat must not be used on the agentic path'); }),
  callChat: vi.fn(async () => ({ text: '', thinking: '', inputTokens: 0, outputTokens: 0 })),
}));
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'sdk:claude-sonnet-5' }));
vi.mock('../../server/services/default-model-store.js', () => ({ getEffectiveDefaultModel: () => 'sdk:claude-opus-5' }));
vi.mock('../../server/services/rag/indexer.js', () => ({ indexFolder: vi.fn() }));
vi.mock('../../server/services/rag/retriever.js', () => ({ retrieveChunks: vi.fn(async () => []) }));
vi.mock('../../server/services/module-loader.js', () => ({ getModuleSystemPrompt: async () => null }));
vi.mock('../../server/services/module-recommendation.js', () => ({ findCandidateModules: async () => [] }));
vi.mock('../../server/services/framework-text-retrieval.js', () => ({ retrieveGroundingText: async () => null }));
const bridgeMock = vi.fn(async (): Promise<{ sessionId: string | null }> => { order.push('bridge'); return { sessionId: 'sess-bridged' }; });
vi.mock('../../server/services/engagement-session-bridge.js', () => ({
  bridgeIterationToSession: (db: DatabaseAdapter, input: Record<string, unknown>) => (bridgeMock as unknown as (d: DatabaseAdapter, i: Record<string, unknown>) => Promise<{ sessionId: string | null }>)(db, input),
}));
const writeV2 = vi.fn(async (): Promise<{ id: string } | null> => { order.push('record'); return { id: 'run-1' }; });
vi.mock('../../server/services/run-artifact-writer.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../server/services/run-artifact-writer.js')>();
  return { ...original, writeRunArtifactV2: (db: DatabaseAdapter, input: RunArtifactInput) => writeV2(db, input) };
});

import { createEngagementsRoutes } from '../../server/routes/engagements.js';
import { getStepJob, resetStepJobsForTests } from '../../server/services/step-job-registry.js';
import { sha256Hex } from '../../server/services/run-artifact-writer.js';

type Handler = (req: unknown, res: unknown) => Promise<unknown>;

async function executeHandler(db: DatabaseAdapter): Promise<Handler> {
  const router = await createEngagementsRoutes(db);
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === '/:id/execute' && l.route.methods.post);
  if (!layer?.route) throw new Error('route not mounted: /:id/execute');
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

const events = (res: ReturnType<typeof sseRes>) =>
  res.frames.map((f) => f.replace(/^data: /, '').trim()).filter(Boolean).map((f) => JSON.parse(f) as Record<string, unknown> & { type: string });

async function waitForJob(key: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    const job = getStepJob(key);
    if (job && job.status !== 'running') return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`job ${key} did not finish`);
}

function fakeDb() {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    dialect: 'postgresql',
    async get(sql: string) {
      if (/SELECT \* FROM engagements WHERE id = \?/.test(sql)) {
        return { id: 'eng-1', title: 'AML review', user_id: 'alice', project_id: null, thinking_level: 'think_hard', exec_model: null, knowledge_config: '{}', quality_blueprint: '{}', client_name: 'Acme Bank' };
      }
      if (/MAX\(iteration_number\)/.test(sql)) return { max: 2 };
      return undefined;
    },
    async all(sql: string) {
      if (/FROM engagement_scope_items/.test(sql)) return [{ title: 'Transaction monitoring review', description: 'TM rules' }];
      if (/FROM engagement_resources/.test(sql)) return [{ id: 'r1', category: 'policy', title: 'TM policy', extracted_content: 'The TM policy text.', url: null }];
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> { runs.push({ sql, params }); return { changes: 1, lastInsertRowid: 0 }; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  };
  return { db: db as unknown as DatabaseAdapter, runs };
}

const USAGE = { inputTokens: 9000, outputTokens: 2500, cacheReadTokens: 0, cacheCreationTokens: 400 };
const req = { params: { id: 'eng-1' }, body: {}, user: { id: 'alice', role: 'admin' } };

beforeEach(() => {
  resetStepJobsForTests();
  runAgenticMock.mockReset();
  writeV2.mockClear();
  bridgeMock.mockClear();
  order.length = 0;
  delete process.env.DEPLOYMENT_MODE;
});

describe('POST /engagements/:id/execute — the run record', () => {
  it('writes the record under the iteration id, after the bridge, with the bridged session, hashes, transcript and tool calls', async () => {
    runAgenticMock.mockImplementation(async () => ({
      ok: true, text: '# TM review\nFindings…', thinking: 'reading the policy', transcript: ['Listing resources.', '# TM review\nFindings…'],
      toolCalls: [
        { id: 1, name: 'list_resources', input: {}, output: '- "TM policy" [policy]', isError: false, ms: 2 },
        { id: 2, name: 'read_resource', input: { title: 'TM policy' }, output: 'The TM policy text.', isError: false, ms: 4 },
      ],
      webSources: [], turns: 4, usage: USAGE,
    }));
    const { db, runs } = fakeDb();
    const res = sseRes();
    await (await executeHandler(db))(req, res as unknown as Response);
    await waitForJob('engagement-run:eng-1');

    const insert = runs.find((r) => /INSERT INTO engagement_iterations/.test(r.sql));
    expect(insert).toBeDefined();
    const iterationId = String(insert!.params[0]);
    const done = events(res).find((e) => e.type === 'done');
    expect(done?.iterationId).toBe(iterationId);

    expect(writeV2).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['bridge', 'record']);
    const config = runAgenticMock.mock.calls[0][0] as AgenticRunConfig;
    const [writtenDb, input] = writeV2.mock.calls[0] as unknown as [DatabaseAdapter, RunArtifactInput];
    expect(writtenDb).toBe(db);
    expect(input.parentKind).toBe('engagement_step');
    expect(input.parentId).toBe(iterationId);
    expect(input.sessionId).toBe('sess-bridged');
    expect(input.composedPrompt).toBe(config.system);
    expect(input.composedPrompt).toContain('ENGAGEMENT: AML review');
    expect(input.userMessageSha256).toBe(sha256Hex(config.prompt));
    expect(input.outputSha256).toBe(sha256Hex('# TM review\nFindings…'));
    expect(input.thinkingSha256).toBe(sha256Hex('reading the policy'));
    expect(input.engine).toBe('anthropic_sdk');
    expect(input.modelRequested).toBe('sdk:claude-opus-5');
    expect(input.costBasis).toBe('plan_usage');
    expect(input.status).toBe('completed');
    expect(input.usage).toEqual(USAGE);
    expect(input.transcript).toEqual(['Listing resources.', '# TM review\nFindings…']);
    expect(input.toolCalls?.map((c) => [c.seq, c.name])).toEqual([[1, 'list_resources'], [2, 'read_resource']]);
    expect(input.requestParams).toMatchObject({
      thinking: 'think_hard', maxTurns: 18, timeoutMs: 2_400_000, webSearch: false, permissionMode: 'dontAsk', turns: 4,
      tools: ['list_resources', 'read_resource', 'read_document', 'client_profile', 'scope_and_deliverables', 'search_knowledge', 'consult_expert_module'],
      engagementId: 'eng-1', workstreamId: null, iterationNumber: 3, thinkingLevel: 'think_hard',
    });
  });

  it('leaves the session null when the bridge produced none', async () => {
    bridgeMock.mockImplementationOnce(async () => { order.push('bridge'); throw new Error('bridge down'); });
    runAgenticMock.mockImplementation(async () => ({
      ok: true, text: 'Deliverable', thinking: '', transcript: ['Deliverable'], toolCalls: [], webSources: [], turns: 1, usage: USAGE,
    }));
    const { db } = fakeDb();
    await (await executeHandler(db))(req, sseRes() as unknown as Response);
    await waitForJob('engagement-run:eng-1');
    expect(writeV2).toHaveBeenCalledTimes(1);
    const input = writeV2.mock.calls[0][1] as unknown as RunArtifactInput;
    expect(input.sessionId).toBeNull();
    expect(input.thinkingSha256).toBeNull();
  });

  it('a failed run is recorded as failed, with no iteration written', async () => {
    runAgenticMock.mockImplementation(async () => ({
      ok: false, error: 'SDK engine run failed (error_during_execution)', text: '', thinking: '', transcript: ['partial'],
      toolCalls: [{ id: 1, name: 'list_resources', input: {}, output: 'x', isError: false, ms: 1 }],
      webSources: [], turns: 1, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    }));
    const { db, runs } = fakeDb();
    const res = sseRes();
    await (await executeHandler(db))(req, res as unknown as Response);
    await waitForJob('engagement-run:eng-1');

    expect(runs.some((r) => /INSERT INTO engagement_iterations/.test(r.sql))).toBe(false);
    expect(bridgeMock).not.toHaveBeenCalled();
    expect(writeV2).toHaveBeenCalledTimes(1);
    const input = writeV2.mock.calls[0][1] as unknown as RunArtifactInput;
    expect(input.parentKind).toBe('engagement_step');
    expect(input.parentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(input.sessionId).toBeNull();
    expect(input.status).toBe('failed');
    expect(input.transcript).toEqual(['partial']);
    expect(input.toolCalls).toHaveLength(1);
    expect(input.requestParams).toMatchObject({ error: 'SDK engine run failed (error_during_execution)', engagementId: 'eng-1' });
  });
});
