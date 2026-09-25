/**
 * orchestrator-briefings-admin-gate.test.ts — briefings are admin reads on a
 * team server (team-isolation round 2, gaps file "verify:atoms", last item).
 *
 * A briefing is one instance-wide document: generateBriefing writes up to 25
 * recent atoms of EVERY user into the prompt and the briefing quotes them. Any
 * user could list and open briefings. Scoping the generator per person is an
 * engine change, so the two reads are admin-only in team mode: a viewer gets 403
 * and no briefing row is read or marked; an admin reads; solo is not gated.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

// middleware/auth.ts throws at import without JWT_SECRET; vi.hoisted runs before the imports below.
vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-orchestrator-briefings-admin-gate';
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

const BRIEFING = { id: 'br-1', user_id: null, period: 'daily', status: 'unread', content: 'Quotes Alice\'s atom: client X restructures.' };
const reads: string[] = [];
const writes: string[] = [];

const db = {
  dialect: 'postgresql',
  async get<T>(sql: string): Promise<T | undefined> {
    if (sql.includes('FROM orchestrator_briefings')) {
      reads.push(sql);
      return (sql.includes('COUNT(*)') ? { c: '1' } : BRIEFING) as T;
    }
    return undefined;
  },
  async all<T>(sql: string): Promise<T[]> {
    if (sql.includes('orchestrator_briefings') || sql.includes('orchestrator_proposals')) reads.push(sql);
    return (sql.includes('FROM orchestrator_briefings') ? [BRIEFING] : []) as T[];
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

describe('orchestrator briefings on a team server', () => {
  it('a non-admin cannot list or open a briefing — 403, nothing read or marked read', async () => {
    expect((await fetch(`${base}/orchestrator/briefings`)).status).toBe(403);
    expect((await fetch(`${base}/orchestrator/briefings/br-1`)).status).toBe(403);
    current = { id: 'u-viewer', username: 'viewer', role: 'viewer' };
    expect((await fetch(`${base}/orchestrator/briefings/br-1`)).status).toBe(403);
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('an admin lists and opens briefings', async () => {
    current = { id: 'u-admin', username: 'admin', role: 'admin' };
    const list = await fetch(`${base}/orchestrator/briefings`);
    expect(list.status).toBe(200);
    expect(((await list.json()) as { briefings: Array<{ id: string }> }).briefings.map((b) => b.id)).toEqual(['br-1']);
    const one = await fetch(`${base}/orchestrator/briefings/br-1`);
    expect(one.status).toBe(200);
    expect(((await one.json()) as { briefing: { content: string } }).briefing.content).toBe(BRIEFING.content);
  });

  it('solo is not gated', async () => {
    delete process.env.DEPLOYMENT_MODE;
    current = { id: 'solo', username: 'solo', role: 'admin' };
    expect((await fetch(`${base}/orchestrator/briefings`)).status).toBe(200);
    expect((await fetch(`${base}/orchestrator/briefings/br-1`)).status).toBe(200);
  });
});
