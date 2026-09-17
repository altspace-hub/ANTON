/**
 * gap-assessment-lost-run.test.ts — GET /api/gap-assessments/:id says when a
 * run was lost (Wave 5).
 *
 * Until now a server restart left an assessment 'assessing' for ever and the
 * GET answered `run_job: null` — the wizard showed "Ready to assess" as if
 * nothing had happened. Against a fake adapter and the real in-process
 * step-job registry (no database, no engine):
 *   - 'assessing' with no live job → run_job { status: 'lost', interruptedAt: null };
 *   - once recovery marked it (interrupted_at set, or status 'interrupted'
 *     where the schema admits it) → interruptedAt carries the time;
 *   - a live job wins over the row: run_job is the running summary;
 *   - every other status still answers null.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.mock('../../server/services/output-store.js', () => ({
  createOutputStore: async () => ({ storeOutput: async () => 'out_test' }),
}));
vi.mock('../../server/services/claude-engine-availability.js', () => ({
  hasClaudeEngine: () => true,
  NO_CLAUDE_ENGINE_MESSAGE: 'no engine',
}));

import { createGapAssessmentsRoutes } from '../../server/routes/gap-assessments.js';
import { startStepJob, resetStepJobsForTests } from '../../server/services/step-job-registry.js';
import { gapRunJobKey } from '../../server/services/run-recovery.js';

const ID = 'gap-lost-run-1';
const state: { assessment: Record<string, unknown> | undefined } = { assessment: undefined };

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: ID, title: 'AML readiness', frameworks: JSON.stringify(['amlr-2024']), scope_config: '{}', context_config: '{}',
    article_scores: '{}', capability_view: null, board_summary: null, roadmap: null, status: 'assessing', current_step: 4,
    user_id: 'default', interrupted_at: null, ...overrides,
  };
}

const db = {
  get: async (sql: string) => (sql.includes('FROM gap_assessments') ? state.assessment : undefined),
  all: async () => [],
  run: async () => ({ changes: 1, lastInsertRowid: 0 }),
  exec: async () => undefined,
  transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => fn(db as unknown as DatabaseAdapter),
  close: async () => undefined,
} as unknown as DatabaseAdapter;

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', await createGapAssessmentsRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('No server address');
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
});
beforeEach(() => { resetStepJobsForTests(); });
afterEach(() => { resetStepJobsForTests(); });

async function runJob(): Promise<unknown> {
  const res = await fetch(`${base}/api/gap-assessments/${ID}`);
  expect(res.status).toBe(200);
  const body = await res.json() as { assessment: { run_job: unknown } };
  return body.assessment.run_job;
}

describe('GET /gap-assessments/:id run_job', () => {
  it("'assessing' with no live job is a lost run, not null", async () => {
    state.assessment = row({ status: 'assessing' });
    expect(await runJob()).toEqual({ status: 'lost', interruptedAt: null });
  });

  it('carries the time recovery marked it — interrupted_at alone, or the interrupted status', async () => {
    state.assessment = row({ status: 'assessing', interrupted_at: new Date('2026-09-17T06:30:00Z') });
    expect(await runJob()).toEqual({ status: 'lost', interruptedAt: '2026-09-17T06:30:00.000Z' });
    state.assessment = row({ status: 'interrupted', interrupted_at: new Date('2026-09-17T06:30:00Z') });
    expect(await runJob()).toEqual({ status: 'lost', interruptedAt: '2026-09-17T06:30:00.000Z' });
  });

  it('a live job wins over the row: the running summary is returned', async () => {
    state.assessment = row({ status: 'assessing' });
    let release: () => void = () => undefined;
    startStepJob(gapRunJobKey(ID), { assessment_id: ID }, () => new Promise<void>((resolve) => { release = resolve; }));
    expect(await runJob()).toMatchObject({ status: 'running', meta: { assessment_id: ID } });
    release();
  });

  it('every other status still answers null', async () => {
    for (const status of ['draft', 'scoring', 'synthesising', 'complete', 'paused']) {
      state.assessment = row({ status, interrupted_at: new Date() });
      expect(await runJob(), status).toBeNull();
    }
  });
});
