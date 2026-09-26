/**
 * engagement-rag-directory-recheck.test.ts — an engagement's stored RAG
 * directory is re-checked at run time on a team server (round-2 gap
 * "verify:files", engagement stale index).
 *
 * POST /:id/rag-directory now refuses ANTON's upload store through indexFolder,
 * but an engagement pointed there BEFORE the team storage rule kept its
 * rag_directory_path, and every run pulled that folder index — every user's
 * uploads — into its prompt. The run now skips the stored path for a scoped
 * caller unless the folder guard still allows it.
 *
 * The real execute handler runs inside the real job registry; the model runner,
 * the bridge and the retriever are stubbed. Negative controls: a team admin and
 * the solo user still retrieve from it (unscoped by policy), and a team
 * non-admin still retrieves from a whitelisted shared folder.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Response } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const retrieveChunksMock = vi.fn(async (): Promise<unknown[]> => []);
vi.mock('../../server/services/sdk-agentic-runner.js', () => ({
  runAgentic: async () => ({
    ok: true, text: 'Deliverable', thinking: '', transcript: ['Deliverable'], toolCalls: [], webSources: [], turns: 1,
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
  }),
}));
vi.mock('../../server/services/provider-router.js', () => ({
  mapModelToProvider: (m: string) => m,
  streamChat: vi.fn(async () => { throw new Error('not used on the agentic path'); }),
  callChat: vi.fn(async () => ({ text: '', thinking: '', inputTokens: 0, outputTokens: 0 })),
}));
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'sdk:claude-sonnet-5' }));
vi.mock('../../server/services/default-model-store.js', () => ({ getEffectiveDefaultModel: () => 'sdk:claude-opus-5' }));
vi.mock('../../server/services/rag/indexer.js', () => ({ indexFolder: vi.fn() }));
vi.mock('../../server/services/rag/retriever.js', () => ({
  retrieveChunks: (...args: unknown[]) => (retrieveChunksMock as unknown as (...a: unknown[]) => Promise<unknown[]>)(...args),
}));
vi.mock('../../server/services/module-loader.js', () => ({ getModuleSystemPrompt: async () => null }));
vi.mock('../../server/services/module-recommendation.js', () => ({ findCandidateModules: async () => [] }));
vi.mock('../../server/services/framework-text-retrieval.js', () => ({ retrieveGroundingText: async () => null }));
vi.mock('../../server/services/engagement-session-bridge.js', () => ({ bridgeIterationToSession: async () => ({ sessionId: null }) }));
vi.mock('../../server/services/run-artifact-writer.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../server/services/run-artifact-writer.js')>();
  return { ...original, writeRunArtifactV2: async () => ({ id: 'run-1' }) };
});

import { createEngagementsRoutes } from '../../server/routes/engagements.js';
import { getStepJob, resetStepJobsForTests } from '../../server/services/step-job-registry.js';

type Handler = (req: unknown, res: unknown) => Promise<unknown>;

let sandbox = '';
let uploads = '';
let shared = '';
const ENV_KEYS = ['DEPLOYMENT_MODE', 'UPLOAD_DIR', 'ALLOWED_FOLDER_PATHS'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

async function executeHandler(db: DatabaseAdapter): Promise<Handler> {
  const router = await createEngagementsRoutes(db);
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === '/:id/execute' && l.route.methods.post);
  if (!layer?.route) throw new Error('route not mounted: /:id/execute');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function sseRes() {
  return {
    headersSent: false, statusCode: 200, body: undefined as unknown, frames: [] as string[],
    writeHead() { this.headersSent = true; }, setHeader() { /* noop */ },
    write(s: string) { this.frames.push(s); return true; }, end() { /* closed */ }, on() { /* noop */ },
    status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; },
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

function fakeDb(ragDir: string): DatabaseAdapter {
  const db = {
    dialect: 'postgresql',
    async get(sql: string) {
      if (/SELECT \* FROM engagements WHERE id = \?/.test(sql)) {
        return {
          id: 'eng-1', title: 'AML review', user_id: 'alice', project_id: null, thinking_level: 'think_hard', exec_model: null,
          knowledge_config: '{}', quality_blueprint: '{}', client_name: 'Acme', rag_directory_path: ragDir,
        };
      }
      if (/MAX\(iteration_number\)/.test(sql)) return { max: 0 };
      return undefined;
    },
    async all(sql: string) {
      if (/FROM engagement_scope_items/.test(sql)) return [{ title: 'Transaction monitoring', description: 'TM' }];
      return [];
    },
    async run(): Promise<RunResult> { return { changes: 1, lastInsertRowid: 0 }; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  };
  return db as unknown as DatabaseAdapter;
}

async function runAs(role: string, mode: 'team' | 'solo', ragDir: string): Promise<string[][]> {
  if (mode === 'team') process.env.DEPLOYMENT_MODE = 'team';
  else delete process.env.DEPLOYMENT_MODE;
  const req = { params: { id: 'eng-1' }, body: {}, user: { id: 'alice', role } };
  await (await executeHandler(fakeDb(ragDir)))(req, sseRes() as unknown as Response);
  await waitForJob('engagement-run:eng-1');
  return retrieveChunksMock.mock.calls.map((c) => (c as unknown[])[2] as string[]);
}

beforeAll(() => {
  sandbox = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anton-eng-rag-')));
  uploads = path.join(sandbox, 'uploads');
  shared = path.join(sandbox, 'shared');
  fs.mkdirSync(uploads, { recursive: true });
  fs.mkdirSync(shared, { recursive: true });
  process.env.UPLOAD_DIR = uploads;
  // The shipped shape: the upload store AND a shared folder are whitelisted.
  process.env.ALLOWED_FOLDER_PATHS = [uploads, shared].join(',');
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  fs.rmSync(sandbox, { recursive: true, force: true });
});

beforeEach(() => {
  resetStepJobsForTests();
  retrieveChunksMock.mockClear();
});

describe('POST /engagements/:id/execute — stored RAG directory', () => {
  it('team non-admin: a stored path in the upload store is not retrieved from', async () => {
    const folders = await runAs('analyst', 'team', uploads);
    expect(folders).not.toContainEqual([uploads]);
  });

  it('negative control — team non-admin still retrieves from a whitelisted shared folder', async () => {
    expect(await runAs('analyst', 'team', shared)).toContainEqual([shared]);
  });

  it('negative controls — a team admin and the solo user are not scoped', async () => {
    expect(await runAs('admin', 'team', uploads)).toContainEqual([uploads]);
    retrieveChunksMock.mockClear();
    resetStepJobsForTests();
    expect(await runAs('admin', 'solo', uploads)).toContainEqual([uploads]);
  });
});
