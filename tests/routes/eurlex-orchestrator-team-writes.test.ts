/**
 * eurlex-orchestrator-team-writes.test.ts — two small team-server writes
 * (round-1 verifier gaps, 2026-09-23).
 *
 *   1. POST /api/eurlex/validate-pack appended a validation stamp to any
 *      knowledge pack's description and spent the instance's model budget, for
 *      any user. Packs are instance-wide (H10 made their routes admin-only), so
 *      it is requireAdminOrSolo now: a team non-admin gets 403 before the
 *      database is touched; an admin and the solo user reach the handler.
 *   2. Orchestrator approvals wrote workflow_runs.user_id = the USERNAME. The
 *      audit trail and work timeline match that column on req.user.id, so a
 *      team member's own approval runs belonged to no one they could see. It is
 *      req.user.id now ('solo' in solo); the proposal's decided_by keeps the
 *      display name, as before.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

// middleware/auth.ts throws at import without JWT_SECRET; vi.hoisted runs before the imports below.
vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-eurlex-orchestrator-team-writes';
});

vi.mock('node-cron', () => ({ validate: () => true, schedule: () => ({ stop: () => undefined }) }));
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: vi.fn(),
  streamChat: vi.fn(async () => ({ text: '' })),
  mapModelToProvider: (m: string) => m,
  resolveModel: (tier: string) => (tier === 'large' ? 'sdk:claude-opus-5' : 'sdk:claude-sonnet-5'),
}));
vi.mock('../../server/services/claude-engine-availability.js', () => ({
  hasClaudeEngine: () => true,
  NO_CLAUDE_ENGINE_MESSAGE: 'no engine',
}));
vi.mock('../../server/services/model-adapter.js', () => ({ getProviderFromModelId: () => 'anthropic_sdk' }));
vi.mock('../../server/services/audit-queue.js', () => ({ enqueueAudit: () => undefined }));
vi.mock('../../server/services/notification-service.js', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('../../server/services/sdk-engine-store.js', () => ({ isSdkEngineEnabled: () => false }));

import { createEurLexRoutes } from '../../server/routes/eurlex.js';
import { createOrchestratorRoutes } from '../../server/routes/orchestrator.js';

interface Caller { id: string; username: string; role: string }

const PROPOSAL = { id: 'prop-1', status: 'pending', proposed_action: 'Do X', action_type: 'wf-action', confidence_score: 0.9 };

function recordingDb() {
  const gets: string[] = [];
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      gets.push(sql);
      if (sql.includes('FROM orchestrator_proposals') && params[0] === PROPOSAL.id) return PROPOSAL as T;
      if (sql.includes('FROM orchestrator_stage')) return { current_stage: 2 } as T;
      if (sql.includes('FROM orchestrator_executions')) return { id: 'exec-1' } as T;
      if (sql.includes('COUNT(')) return { c: '0' } as T;
      return undefined;   // knowledge_packs: no such pack → 404 once past the guard
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      runs.push({ sql, params });
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, gets, runs };
}

const TEAM_ANALYST: Caller = { id: 'u-alice-id', username: 'alice.name', role: 'analyst' };
const TEAM_ADMIN: Caller = { id: 'u-root-id', username: 'root.name', role: 'admin' };
const SOLO: Caller = { id: 'solo', username: 'solo', role: 'admin' };

let server: Server;
let base = '';
let rec: ReturnType<typeof recordingDb>;
let current: Caller = SOLO;
const originalMode = process.env.DEPLOYMENT_MODE;

beforeAll(async () => {
  rec = recordingDb();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: Caller }).user = current; next(); });
  // A non-null client object: the route's engine check passes and the guard is what decides.
  app.use('/api', await createEurLexRoutes(rec.db, {} as never));
  app.use('/api', await createOrchestratorRoutes(rec.db, null));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
});

afterEach(() => {
  rec.gets.length = 0;
  rec.runs.length = 0;
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
});

async function post(path: string, as: Caller, body: unknown) {
  current = as;
  const r = await fetch(`${base}/api${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* SSE */ }
  return { status: r.status, body: parsed };
}

describe('POST /api/eurlex/validate-pack is admin-only on a team server', () => {
  it('a team non-admin gets 403 and the pack is never read or written', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await post('/eurlex/validate-pack', TEAM_ANALYST, { packId: 'pack-1', celexNumber: '32024R1624' });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'Admin access required' });
    expect(rec.gets.some((s) => s.includes('knowledge_packs'))).toBe(false);
    expect(rec.runs).toEqual([]);
  });

  it('negative control: a team admin and the solo user reach the handler (unknown pack → 404)', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const admin = await post('/eurlex/validate-pack', TEAM_ADMIN, { packId: 'pack-1', celexNumber: '32024R1624' });
    expect(admin.status).toBe(404);
    expect(admin.body).toEqual({ error: 'Knowledge pack not found' });
    delete process.env.DEPLOYMENT_MODE;
    const solo = await post('/eurlex/validate-pack', SOLO, { packId: 'pack-1', celexNumber: '32024R1624' });
    expect(solo.status).toBe(404);
    // Solo: even a caller not labelled admin is let through, exactly as before.
    const soloAnalyst = await post('/eurlex/validate-pack', TEAM_ANALYST, { packId: 'pack-1', celexNumber: '32024R1624' });
    expect(soloAnalyst.status).toBe(404);
  });
});

describe('POST /api/orchestrator/proposals/:id/approve attributes the run by user id', () => {
  const workflowRunOwner = () => rec.runs.find((r) => r.sql.includes('INSERT INTO workflow_runs'))?.params[2];
  const decidedBy = () => rec.runs.find((r) => r.sql.includes('UPDATE orchestrator_proposals'))?.params[0];

  it('team mode: workflow_runs.user_id is the id, not the username', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const r = await post(`/orchestrator/proposals/${PROPOSAL.id}/approve`, TEAM_ANALYST, {});
    expect(r.status).toBe(201);
    expect(workflowRunOwner()).toBe(TEAM_ANALYST.id);
    // decided_by keeps the display name it always carried.
    expect(decidedBy()).toBe(TEAM_ANALYST.username);
  });

  it("negative control: solo still writes 'solo'", async () => {
    delete process.env.DEPLOYMENT_MODE;
    const r = await post(`/orchestrator/proposals/${PROPOSAL.id}/approve`, SOLO, {});
    expect(r.status).toBe(201);
    expect(workflowRunOwner()).toBe('solo');
  });
});
