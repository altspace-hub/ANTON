/**
 * orchestrator-limits-readonly.test.ts — the limits are served, never set.
 *
 * Whitepaper §16 says the orchestrator's hard limits are "not exposed through
 * any API". GET /api/orchestrator/limits exposes them read-only, behind auth
 * like every sibling route, and now says so in its body; PATCH /config has no
 * path to them. GET /status carries the heartbeat's honest state for the page.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

// middleware/auth.ts throws at import without JWT_SECRET; vi.hoisted runs before the imports below.
vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-orchestrator-limits-readonly';
});

vi.mock('node-cron',() => ({ validate: () => true, schedule: () => ({ stop: () => undefined }) }));
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: vi.fn(),
  mapModelToProvider: (m: string) => m,
  resolveModel: (tier: string) => (tier === 'large' ? 'sdk:claude-opus-5' : 'sdk:claude-sonnet-5'),
}));
vi.mock('../../server/services/model-adapter.js', () => ({ getProviderFromModelId: () => 'anthropic_sdk' }));
vi.mock('../../server/services/audit-queue.js', () => ({ enqueueAudit: () => undefined }));
vi.mock('../../server/services/notification-service.js', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('../../server/services/sdk-engine-store.js', () => ({ isSdkEngineEnabled: () => false }));
vi.mock('fs-extra', () => ({ default: { ensureDir: vi.fn(async () => undefined), writeFile: vi.fn(async () => undefined) } }));

import { createOrchestratorRoutes } from '../../server/routes/orchestrator.js';
import { ORCHESTRATOR_HARD_LIMITS } from '../../server/services/orchestrator-engine.js';

const CONFIG = {
  id: 'default',
  heartbeat_enabled: 0,
  heartbeat_interval_minutes: 30,
  briefing_schedule: 'manual',
  heartbeat_model: 'sdk:claude-sonnet-5',
  briefing_model: 'sdk:claude-opus-5',
  planning_model: 'sdk:claude-opus-5',
  orchestrator_paused: 0,
  fully_disabled: 0,
};

function recordingDb() {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql.includes('FROM orchestrator_config')) return CONFIG as T;
      if (sql.includes('FROM orchestrator_stage')) return { id: 'default', current_stage: 1 } as T;
      if (sql.includes('FROM orchestrator_proposals')) return { c: '0' } as T;
      if (sql.includes('FROM orchestrator_briefings')) return { c: '0' } as T;
      if (sql.includes('FROM orchestrator_heartbeats')) {
        if (sql.includes('COUNT(*)')) return { c: '3' } as T;
        return { ran_at: '2026-09-16T10:30:00.000Z', status: 'ok', action_taken: 'spend_gate_paused' } as T;
      }
      return undefined;
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
  return { db, runs };
}

let server: import('http').Server;
let base = '';
let runs: Array<{ sql: string; params: unknown[] }>;
/** null = anonymous request; requireAuth answers 401. */
let current: { id: string; username: string; role: string } | null = null;

beforeAll(async () => {
  const rec = recordingDb();
  runs = rec.runs;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (current) (req as unknown as { user: typeof current }).user = current;
    next();
  });
  app.use('/api', await createOrchestratorRoutes(rec.db, null));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('No server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

beforeEach(() => {
  runs.length = 0;
  current = { id: 'u-1', username: 'daniel', role: 'admin' };
});

describe('GET /api/orchestrator/limits', () => {
  it('requires auth like its siblings', async () => {
    current = null;
    const res = await fetch(`${base}/api/orchestrator/limits`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Authentication required' });
  });

  it('serves the compiled-in limits and says they are read-only', async () => {
    const res = await fetch(`${base}/api/orchestrator/limits`);
    expect(res.status).toBe(200);
    const body = await res.json() as { limits: Record<string, number>; readOnly: boolean; note: string };
    expect(body.readOnly).toBe(true);
    expect(body.note).toBe('Hard limits are compiled in; they cannot be changed through the API.');
    expect(body.limits).toEqual(ORCHESTRATOR_HARD_LIMITS);
    expect(body.limits).not.toHaveProperty('MAX_CHAIN_DEPTH');
    expect(runs).toHaveLength(0);
  });
});

describe('the limits cannot be written', () => {
  it('PATCH /config drops limit keys — nothing reaches the database', async () => {
    const res = await fetch(`${base}/api/orchestrator/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ MAX_HEARTBEATS_PER_HOUR: 600, MAX_COST_PER_CYCLE_USD: 5000, limits: { MAX_TRAIL_ENTRIES: 1 } }),
    });
    expect(res.status).toBe(200);
    expect(runs.filter((r) => /UPDATE orchestrator_config/.test(r.sql))).toHaveLength(0);
    expect(ORCHESTRATOR_HARD_LIMITS.MAX_HEARTBEATS_PER_HOUR).toBe(6);
  });

  it('there is no POST/PUT/PATCH/DELETE on /limits', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await fetch(`${base}/api/orchestrator/limits`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ MAX_HEARTBEATS_PER_HOUR: 600 }),
      });
      expect(res.status, method).toBe(404);
    }
    expect(runs).toHaveLength(0);
  });
});

describe('GET /api/orchestrator/status', () => {
  it('carries the heartbeat state: enabled, scheduled, earned-or-idle with the reason, last cycle, cycles per hour, limits', async () => {
    const res = await fetch(`${base}/api/orchestrator/status`);
    expect(res.status).toBe(200);
    const body = await res.json() as { heartbeat: Record<string, unknown> & { earned: Record<string, unknown> } };
    expect(body.heartbeat).toMatchObject({
      enabled: false,
      scheduled: false,
      running: false,
      lastCycleAt: '2026-09-16T10:30:00.000Z',
      cyclesLastHour: 3,
      forceKey: 'orchestrator_heartbeat_force',
      limits: ORCHESTRATOR_HARD_LIMITS,
    });
    expect(body.heartbeat.earned).toMatchObject({ earned: false, forced: false, ratedInWindow: 0, windowDays: 90 });
    expect(String(body.heartbeat.earned.reason)).toBe('Idle: no rated proposal in 90 days; rate a proposal or set orchestrator_heartbeat_force');
  });
});
