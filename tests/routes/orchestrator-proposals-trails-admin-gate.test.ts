/**
 * orchestrator-proposals-trails-admin-gate.test.ts — proposals and reasoning
 * trails are admin reads on a team server, like the briefings they come from
 * (round-2 gap "verify2:projects-2").
 *
 * Briefings were made admin-only because generateBriefing writes up to 25
 * recent atoms of EVERY user into its prompt. But GET /orchestrator/proposals
 * returned every briefing's proposals, PATCH /proposals/:id and POST
 * /proposals/:id/modify hand back the whole proposal row, and GET
 * /orchestrator/trails[/:id] returned the briefing trail — its proposal list and
 * the model's thinking over those atoms. A non-admin 403'd on /briefings read
 * the same material there. Now all five are requireAdminOrSolo: a team
 * non-admin gets 403 and nothing is read or written; an admin and solo mode get
 * through.
 *
 * The three /orchestrator/executions routes follow the same rule: the list joins
 * each execution's proposed_action from the proposals, and the detail and the
 * outcome PATCH hand back the execution row.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

// middleware/auth.ts throws at import without JWT_SECRET; vi.hoisted runs before the imports below.
vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-orchestrator-proposals-trails-admin-gate';
});

vi.mock('node-cron', () => ({ validate: () => true, schedule: () => ({ stop: () => undefined }) }));
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: vi.fn(),
  mapModelToProvider: (m: string) => m,
  resolveModel: () => 'sdk:claude-sonnet-5',
}));
vi.mock('../../server/services/model-adapter.js', () => ({ getProviderFromModelId: () => 'anthropic_sdk' }));
vi.mock('../../server/services/audit-queue.js', () => ({ enqueueAudit: () => undefined }));
vi.mock('../../server/services/notification-service.js', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('../../server/services/sdk-engine-store.js', () => ({ isSdkEngineEnabled: () => false }));
vi.mock('fs-extra', () => ({ default: { ensureDir: vi.fn(async () => undefined), writeFile: vi.fn(async () => undefined) } }));

import { createOrchestratorRoutes } from '../../server/routes/orchestrator.js';

const PROPOSAL = { id: 'prop-1', status: 'pending', human_rating: null, proposed_action: "Act on Alice's atom: client X restructures", action_type: 'research', confidence_score: 0.8 };
const TRAIL = { id: 'trail-1', trigger_type: 'briefing', narrative_summary: "Reasoned over Alice's atoms" };
const ENTRY = { id: 'entry-1', trail_id: 'trail-1', sequence_number: 1, thinking_content: "Alice's client X is restructuring" };
const EXECUTION = { id: 'exec-1', proposal_id: 'prop-1', outcome: null, human_notes: "Ran Alice's research" };

const reads: string[] = [];
const writes: string[] = [];

const db = {
  dialect: 'postgresql',
  async get<T>(sql: string): Promise<T | undefined> {
    if (sql.includes('orchestrator_proposals') || sql.includes('orchestrator_reasoning') || sql.includes('orchestrator_executions')) reads.push(sql);
    if (sql.includes('pg_tables')) return { c: 1 } as T;
    if (sql.includes('COUNT(*)')) return { c: 1 } as T;
    if (sql.includes('FROM orchestrator_proposals')) return PROPOSAL as T;
    if (sql.includes('FROM orchestrator_executions WHERE id')) return EXECUTION as T;
    if (sql.includes('FROM orchestrator_reasoning_trails')) return TRAIL as T;
    if (sql.includes('FROM orchestrator_stage')) return { current_stage: 2 } as T;
    return undefined;
  },
  async all<T>(sql: string): Promise<T[]> {
    if (sql.includes('orchestrator_proposals') || sql.includes('orchestrator_reasoning') || sql.includes('orchestrator_executions')) reads.push(sql);
    if (sql.includes('FROM orchestrator_executions')) return [{ ...EXECUTION, proposed_action: PROPOSAL.proposed_action }] as T[];
    if (sql.includes('FROM orchestrator_proposals')) return [PROPOSAL] as T[];
    if (sql.includes('FROM orchestrator_reasoning_trails')) return [TRAIL] as T[];
    if (sql.includes('FROM orchestrator_reasoning_entries')) return [ENTRY] as T[];
    return [];
  },
  async run(sql: string): Promise<RunResult> {
    writes.push(sql);
    return { changes: 1, lastInsertRowid: 0 };
  },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db as unknown as DatabaseAdapter); },
  async close() { /* noop */ },
} as unknown as DatabaseAdapter;

let server: Server;
let base = '';
let current: { id: string; username: string; role: string };
const savedMode = process.env.DEPLOYMENT_MODE;

const ROUTES: Array<[string, string, unknown?]> = [
  ['GET', '/orchestrator/proposals'],
  ['PATCH', '/orchestrator/proposals/prop-1', {}],
  ['POST', '/orchestrator/proposals/prop-1/modify', { modification_notes: 'narrower' }],
  ['GET', '/orchestrator/trails'],
  ['GET', '/orchestrator/trails/trail-1'],
  ['GET', '/orchestrator/executions'],
  ['GET', '/orchestrator/executions/exec-1'],
  ['PATCH', '/orchestrator/executions/exec-1/outcome', { outcome: 'success' }],
];

async function hit(method: string, path: string, body?: unknown): Promise<{ status: number; text: string }> {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, text: await r.text() };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: typeof current }).user = current; next(); });
  app.use('/api', await createOrchestratorRoutes(db, null));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('No server address');
  base = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

beforeEach(() => {
  reads.length = 0;
  writes.length = 0;
  process.env.DEPLOYMENT_MODE = 'team';
  current = { id: 'u-bob', username: 'bob', role: 'analyst' };
});
afterEach(() => {
  if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = savedMode;
});

describe('orchestrator proposals and trails on a team server', () => {
  it('an analyst and a viewer get 403 on all eight — nothing read, nothing written', async () => {
    for (const role of ['analyst', 'viewer']) {
      current = { id: `u-${role}`, username: role, role };
      for (const [method, path, body] of ROUTES) {
        const r = await hit(method, path, body);
        expect(r.status, `${role} ${method} ${path}`).toBe(403);
        expect(r.text).not.toContain('Alice');
      }
    }
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('negative control: an admin reaches every one of them', async () => {
    current = { id: 'u-admin', username: 'admin', role: 'admin' };
    for (const [method, path, body] of ROUTES) {
      const r = await hit(method, path, body);
      expect(r.status, `${method} ${path}`).toBe(200);
    }
    const trail = await hit('GET', '/orchestrator/trails/trail-1');
    expect(trail.text).toContain(ENTRY.thinking_content);
  });

  it('negative control: solo is not gated', async () => {
    delete process.env.DEPLOYMENT_MODE;
    current = { id: 'solo', username: 'solo', role: 'admin' };
    for (const [method, path, body] of ROUTES) {
      expect((await hit(method, path, body)).status, `${method} ${path}`).toBe(200);
    }
    // Solo: even a caller not labelled admin passes, exactly as before.
    current = { id: 'solo', username: 'solo', role: 'analyst' };
    expect((await hit('GET', '/orchestrator/proposals')).status).toBe(200);
  });
});
