/**
 * instance-surfaces-admin-gate.test.ts — instance-wide surfaces any signed-in
 * user could change (public-demo readiness, 2026-09-25, "Shared instance-wide
 * surfaces any user can change" and "Background spend that visitors can
 * switch on").
 *
 * Each of these had no role check at all:
 *   - webhook triggers: a trigger gives the internet an unauthenticated URL
 *     that runs a workflow billed to the instance (the file's header even said
 *     "RBAC-protected");
 *   - Ollama pull / delete: fills the host's disk, or removes the model other
 *     users' runs need;
 *   - FutureChain config, KYC profile, budget rules and transactions: one per
 *     instance, and the KYC route hands back the owner's decrypted identity;
 *   - pattern detection: the detectors read every user's atoms, and the
 *     scheduler is an instance-wide switch;
 *   - browser sessions: a browser on the host that goes anywhere;
 *   - alignment reviews: ingest read any directory on the host, with no
 *     folder guard, into a review every user could read.
 *
 * All are now requireAdminOrSolo in team mode. Each refusal is checked for the
 * absence of its side effect, and paired with an admin and the solo user going
 * through (negative controls). Alignment ingest also goes through the
 * ALLOWED_FOLDER_PATHS guard in every mode, with an allowed folder as its
 * negative control.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

// ── Service fakes ────────────────────────────────────────────────────────────

const trig = vi.hoisted(() => {
  const trigger = { id: 'trg_1', name: 'T', trigger_type: 'webhook', status: 'active', user_id: 'root', endpoint_path: '/webhooks/inbound/trg_1', auth_config: { method: 'hmac_sha256', secret: 's' } };
  // The trigger belongs to whoever asks, so the route's own per-owner check
  // never masks what the admin gate does.
  const caller = { id: '' };
  return {
    trigger,
    caller,
    listTriggers: vi.fn(async () => [trigger]),
    getTrigger: vi.fn(async () => ({ ...trigger, user_id: caller.id })),
    createTrigger: vi.fn(async () => trigger),
    setTriggerStatus: vi.fn(() => undefined),
    deleteTrigger: vi.fn(() => true),
    getTriggerMetrics: vi.fn(async () => ({})),
    getEventLog: vi.fn(async () => []),
    replayEvent: vi.fn(async () => ({ ok: true })),
  };
});
vi.mock('../../server/services/webhook-listener.js', () => ({ createWebhookListener: async () => trig }));

const fc = vi.hoisted(() => ({
  getConfig: vi.fn(async () => ({ id: 'default', stub_mode: true })),
  updateConfig: vi.fn(async () => ({ id: 'default' })),
  healthCheck: vi.fn(async () => ({ ok: true })),
  getRules: vi.fn(async () => ({})),
  updateRules: vi.fn(async () => ({})),
  getSpendingState: vi.fn(async () => ({})),
  getSpendingLog: vi.fn(async () => []),
  checkSpending: vi.fn(async () => ({ allowed: true })),
  buildTransaction: vi.fn(async () => ({ id: 'tx_1' })),
  listTransactions: vi.fn(async () => []),
  getTransaction: vi.fn(async () => ({ id: 'tx_1' })),
  submitTransaction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../server/services/fc-connection-service.js', () => ({
  createFCConnectionService: async () => ({ getConfig: fc.getConfig, updateConfig: fc.updateConfig, healthCheck: fc.healthCheck }),
}));
vi.mock('../../server/services/fc-budget-service.js', () => ({
  createFCBudgetService: async () => ({
    getRules: fc.getRules, updateRules: fc.updateRules, getSpendingState: fc.getSpendingState,
    getSpendingLog: fc.getSpendingLog, checkSpending: fc.checkSpending,
  }),
}));
vi.mock('../../server/services/fc-real-mode.js', () => ({
  createRealModeFCServices: async () => ({
    fcTx: {
      buildTransaction: fc.buildTransaction, listTransactions: fc.listTransactions,
      getTransaction: fc.getTransaction, submitTransaction: fc.submitTransaction,
    },
    isRealMode: async () => false,
  }),
}));
vi.mock('../../server/services/fc-signing-session.js', () => ({
  assertSigningSession: () => undefined,
  SigningSessionError: class SigningSessionError extends Error {},
}));
vi.mock('../../server/services/credential-vault.js', () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ''),
}));

const pat = vi.hoisted(() => ({
  runAllDetectors: vi.fn(async () => ({ patternsDetected: 0 })),
  getDetectorState: vi.fn(async () => null),
  getPatterns: vi.fn(async () => []),
  updatePatternStatus: vi.fn(() => undefined),
  detectTemporalCorrelation: vi.fn(async () => []),
  detectEntityConvergence: vi.fn(async () => []),
  detectCascade: vi.fn(async () => []),
  detectTrendDivergence: vi.fn(async () => []),
  detectGaps: vi.fn(async () => []),
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  getStatus: vi.fn(async () => ({ running: false })),
  updateConfig: vi.fn(async () => undefined),
  runManual: vi.fn(async () => ({ success: true })),
  getRecentRuns: vi.fn(async () => []),
}));
vi.mock('../../server/services/pattern-detection.js', () => ({
  createPatternDetection: async () => ({
    runAllDetectors: pat.runAllDetectors, getDetectorState: pat.getDetectorState, getPatterns: pat.getPatterns,
    updatePatternStatus: pat.updatePatternStatus, detectTemporalCorrelation: pat.detectTemporalCorrelation,
    detectEntityConvergence: pat.detectEntityConvergence, detectCascade: pat.detectCascade,
    detectTrendDivergence: pat.detectTrendDivergence, detectGaps: pat.detectGaps,
  }),
}));
vi.mock('../../server/services/pattern-scheduler.js', () => ({
  createPatternScheduler: async () => ({
    start: pat.start, stop: pat.stop, getStatus: pat.getStatus, updateConfig: pat.updateConfig,
    runManual: pat.runManual, getRecentRuns: pat.getRecentRuns,
  }),
}));

const browser = vi.hoisted(() => ({
  startCleanupLoop: vi.fn(() => undefined),
  listSessions: vi.fn(async () => []),
  isPlaywrightInstalled: vi.fn(async () => false),
  createSession: vi.fn(async () => ({ id: 'bs_1' })),
  executeAction: vi.fn(async () => ({ success: true })),
  closeSession: vi.fn(async () => undefined),
}));
vi.mock('../../server/services/missions/mission-browser.js', () => ({ createBrowserAutomation: () => browser }));
vi.mock('../../server/services/missions/mission-identity.js', () => ({ resolveCallerIdentity: async () => ({ ok: true }) }));

const ingest = vi.hoisted(() => ({ ingestLocalProject: vi.fn(async () => ({ structure: [], totalFiles: 0 })) }));
vi.mock('../../server/services/project-ingestor.js', () => ({ ingestLocalProject: ingest.ingestLocalProject }));
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: vi.fn(async () => ({ text: '{}', inputTokens: 0, outputTokens: 0 })),
  mapModelToProvider: (m: string) => m,
}));

import { createTriggersRoutes } from '../../server/routes/triggers.js';
import { createFCSettingsRoutes } from '../../server/routes/fc-settings.js';
import { createFCBudgetRoutes } from '../../server/routes/fc-budget.js';
import { createFCTransactionRoutes } from '../../server/routes/fc-transactions.js';
import { createPatternDetectionRoutes } from '../../server/routes/pattern-detection.js';
import { createBrowserRoutes } from '../../server/routes/mission-browser.js';
import { createAlignmentReviewerRoutes } from '../../server/routes/alignment-reviewer.js';

// ── Fake database ────────────────────────────────────────────────────────────

/** Every statement that reached the database, so a refusal can prove none did. */
const dbCalls: string[] = [];
const fakeDb = {
  dialect: 'postgresql',
  async get(sql: string) {
    dbCalls.push(sql);
    if (/FROM alignment_reviews WHERE id/.test(sql)) return { id: 'rev_1', project_name: 'p' };
    return undefined;
  },
  async all(sql: string) { dbCalls.push(sql); return []; },
  async run(sql: string): Promise<RunResult> { dbCalls.push(sql); return { changes: 1, lastInsertRowid: 0 }; },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(fakeDb as unknown as DatabaseAdapter); },
  async close() { /* noop */ },
};
const db = fakeDb as unknown as DatabaseAdapter;

// ── A fake Ollama, so pull / delete have somewhere to go ──────────────────────

const ollamaHits: string[] = [];
let ollama: Server;

const saved = {
  mode: process.env.DEPLOYMENT_MODE,
  ollama: process.env.OLLAMA_BASE_URL,
  folders: process.env.ALLOWED_FOLDER_PATHS,
};
let server: Server;
let base = '';
let allowedDir = '';

beforeAll(async () => {
  ollama = http.createServer((req, res) => {
    ollamaHits.push(`${req.method} ${req.url}`);
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(req.url === '/api/pull' ? '{"status":"success"}\n' : '{}');
    });
  });
  await new Promise<void>((resolve) => { ollama.listen(0, '127.0.0.1', () => resolve()); });
  const oaddr = ollama.address();
  if (!oaddr || typeof oaddr === 'string') throw new Error('no ollama address');
  // Read at module load by routes/ollama.ts, so set before the import below.
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${oaddr.port}`;
  const { default: ollamaRouter } = await import('../../server/routes/ollama.js');

  allowedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-align-'));

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.header('x-test-user');
    if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
    trig.caller.id = id ?? '';
    next();
  });
  app.use('/api', await createTriggersRoutes(db));
  app.use('/api/ollama', ollamaRouter);
  app.use('/api', await createFCSettingsRoutes(db));
  app.use('/api', await createFCBudgetRoutes(db));
  app.use('/api', await createFCTransactionRoutes(db));
  app.use('/api', await createPatternDetectionRoutes(db));
  app.use('/api', createBrowserRoutes(db));
  app.use('/api', await createAlignmentReviewerRoutes(db));
  // A route mounted AFTER the triggers router: its /triggers guard must not reach it.
  app.get('/api/after-triggers', (_req, res) => { res.json({ ok: true }); });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  base = `http://127.0.0.1:${addr.port}`;
  vi.clearAllMocks();   // the pattern scheduler auto-starts at construction
  dbCalls.length = 0;
});

afterAll(async () => {
  for (const [k, v] of [['DEPLOYMENT_MODE', saved.mode], ['OLLAMA_BASE_URL', saved.ollama], ['ALLOWED_FOLDER_PATHS', saved.folders]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  await new Promise<void>((resolve) => { ollama?.close(() => resolve()); });
  fs.rmSync(allowedDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.clearAllMocks();
  dbCalls.length = 0;
  ollamaHits.length = 0;
});

type Who = { id: string; role: string };
const ANALYST: Who = { id: 'carol', role: 'analyst' };
const VIEWER: Who = { id: 'vic', role: 'viewer' };
const ADMIN: Who = { id: 'root', role: 'admin' };
const SOLO: Who = { id: 'solo', role: 'admin' };

function mode(m: 'team' | 'solo'): void {
  if (m === 'team') process.env.DEPLOYMENT_MODE = 'team'; else delete process.env.DEPLOYMENT_MODE;
}

async function send(method: string, url: string, who: Who, body?: unknown): Promise<{ status: number; text: string }> {
  const r = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user': who.id, 'x-test-role': who.role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, text: await r.text() };
}

type Gated = {
  name: string; method: string; url: string; body?: unknown; ok: number;
  /** True once the handler did its work. */
  happened: () => boolean;
};

const called = (fn: ReturnType<typeof vi.fn>) => () => fn.mock.calls.length > 0;
const touched = (re: RegExp) => () => dbCalls.some((s) => re.test(s));

const GATED: Gated[] = [
  // Webhook triggers
  { name: 'list triggers', method: 'GET', url: '/api/triggers', ok: 200, happened: called(trig.listTriggers) },
  { name: 'create trigger', method: 'POST', url: '/api/triggers', ok: 201, body: { name: 'T', trigger_type: 'webhook', workflow_id: 'wf', auth_config: { method: 'hmac_sha256', secret: 'x' } }, happened: called(trig.createTrigger) },
  { name: 'pause trigger', method: 'PATCH', url: '/api/triggers/trg_1/status', ok: 200, body: { status: 'paused' }, happened: called(trig.setTriggerStatus) },
  { name: 'delete trigger', method: 'DELETE', url: '/api/triggers/trg_1', ok: 200, happened: called(trig.deleteTrigger) },
  { name: 'replay trigger event', method: 'POST', url: '/api/triggers/trg_1/events/ev_1/replay', ok: 200, happened: called(trig.replayEvent) },
  // Ollama
  { name: 'ollama pull', method: 'POST', url: '/api/ollama/pull', ok: 200, body: { modelName: 'llama3' }, happened: () => ollamaHits.includes('POST /api/pull') },
  { name: 'ollama delete', method: 'DELETE', url: '/api/ollama/models/llama3', ok: 200, happened: () => ollamaHits.includes('DELETE /api/delete') },
  // FutureChain
  { name: 'FC read config', method: 'GET', url: '/api/futurechain/config', ok: 200, happened: called(fc.getConfig) },
  { name: 'FC write config', method: 'PUT', url: '/api/futurechain/config', ok: 200, body: { stub_mode: false }, happened: called(fc.updateConfig) },
  { name: 'FC health check', method: 'POST', url: '/api/futurechain/health-check', ok: 200, happened: called(fc.healthCheck) },
  { name: 'FC read KYC profile', method: 'GET', url: '/api/futurechain/kyc', ok: 200, happened: touched(/fc_kyc_profiles/) },
  { name: 'FC write KYC profile', method: 'PUT', url: '/api/futurechain/kyc', ok: 200, body: { country: 'SE' }, happened: touched(/fc_kyc_profiles/) },
  { name: 'FC budget rules', method: 'PUT', url: '/api/futurechain/budget/rules', ok: 200, body: { daily_limit: 5 }, happened: called(fc.updateRules) },
  { name: 'FC budget log', method: 'GET', url: '/api/futurechain/budget/log', ok: 200, happened: called(fc.getSpendingLog) },
  { name: 'FC build transaction', method: 'POST', url: '/api/futurechain/transactions/build', ok: 201, body: { fromAddress: 'a', toAddress: 'b', amountFtc: 1, walletType: 'x' }, happened: called(fc.buildTransaction) },
  { name: 'FC submit transaction', method: 'POST', url: '/api/futurechain/transactions/tx_1/submit', ok: 200, happened: called(fc.submitTransaction) },
  { name: 'FC contact autofill', method: 'GET', url: '/api/futurechain/transactions/autofill/abc', ok: 404, happened: touched(/community_connections/) },
  // Pattern detection
  { name: 'list patterns', method: 'GET', url: '/api/patterns', ok: 200, happened: called(pat.getPatterns) },
  { name: 'run detectors', method: 'POST', url: '/api/patterns/detect', ok: 200, happened: called(pat.runAllDetectors) },
  { name: 'set pattern status', method: 'PUT', url: '/api/patterns/p1/status', ok: 200, body: { status: 'dismissed' }, happened: called(pat.updatePatternStatus) },
  { name: 'start pattern scheduler', method: 'POST', url: '/api/patterns/scheduler/start', ok: 200, happened: called(pat.start) },
  { name: 'pattern scheduler config', method: 'PUT', url: '/api/patterns/scheduler/config', ok: 200, body: { enabled: true, cronExpression: '* * * * *' }, happened: called(pat.updateConfig) },
  { name: 'pattern scheduler run-now', method: 'POST', url: '/api/patterns/scheduler/run-now', ok: 200, happened: called(pat.runManual) },
  // Browser sessions
  { name: 'list browser sessions', method: 'GET', url: '/api/browser-sessions', ok: 200, happened: called(browser.listSessions) },
  { name: 'start browser session', method: 'POST', url: '/api/browser-sessions', ok: 201, body: { mission_id: 'm1' }, happened: called(browser.createSession) },
  { name: 'browser action', method: 'POST', url: '/api/browser-sessions/bs_1/action', ok: 200, body: { type: 'navigate', url: 'http://169.254.169.254/' }, happened: called(browser.executeAction) },
  { name: 'close browser session', method: 'POST', url: '/api/browser-sessions/bs_1/close', ok: 200, happened: called(browser.closeSession) },
  // Alignment reviews (the ingest has its own folder-guard cases below)
  { name: 'list alignment reviews', method: 'GET', url: '/api/coding/alignment-reviews', ok: 200, happened: touched(/alignment_reviews/) },
  { name: 'create alignment review', method: 'POST', url: '/api/coding/alignment-reviews', ok: 200, body: { project_name: 'p' }, happened: touched(/INSERT INTO alignment_reviews/) },
  { name: 'read alignment review', method: 'GET', url: '/api/coding/alignment-reviews/rev_1', ok: 200, happened: touched(/alignment_reviews/) },
];

describe('instance-wide surfaces are admin-only in team mode', () => {
  for (const g of GATED) {
    it(`${g.name}: 403 for an analyst and a viewer, and nothing happens`, async () => {
      mode('team');
      expect((await send(g.method, g.url, ANALYST, g.body)).status).toBe(403);
      expect((await send(g.method, g.url, VIEWER, g.body)).status).toBe(403);
      expect(g.happened()).toBe(false);
    });
  }

  for (const g of GATED) {
    it(`${g.name}: an admin in team mode, and the solo user, go through`, async () => {
      mode('team');
      expect((await send(g.method, g.url, ADMIN, g.body)).status).toBe(g.ok);
      expect(g.happened()).toBe(true);
      mode('solo');
      expect((await send(g.method, g.url, SOLO, g.body)).status).toBe(g.ok);
    });
  }

  it('the triggers guard is scoped to /triggers: a route mounted after it stays open', async () => {
    mode('team');
    expect((await send('GET', '/api/after-triggers', VIEWER)).status).toBe(200);
  });

  it('Ollama status and model list stay open to every user', async () => {
    mode('team');
    expect((await send('GET', '/api/ollama/status', VIEWER)).status).toBe(200);
    expect((await send('GET', '/api/ollama/models', VIEWER)).status).toBe(200);
  });
});

describe('alignment ingest reads only folders ALLOWED_FOLDER_PATHS allows', () => {
  it('admin-only in team mode: an analyst is refused before the folder is read', async () => {
    mode('team');
    process.env.ALLOWED_FOLDER_PATHS = allowedDir;
    const r = await send('POST', '/api/coding/alignment-reviews/rev_1/ingest', ANALYST, { source_type: 'local-directory', path: allowedDir });
    expect(r.status).toBe(403);
    expect(ingest.ingestLocalProject).not.toHaveBeenCalled();
  });

  it('a folder outside the whitelist is refused even for the solo user, and nothing is read', async () => {
    mode('solo');
    process.env.ALLOWED_FOLDER_PATHS = allowedDir;
    const outside = path.resolve(allowedDir, '..');
    const r = await send('POST', '/api/coding/alignment-reviews/rev_1/ingest', SOLO, { source_type: 'local-directory', path: outside });
    expect(r.status).toBe(403);
    expect(ingest.ingestLocalProject).not.toHaveBeenCalled();
    expect(dbCalls.some((s) => /UPDATE alignment_reviews/.test(s))).toBe(false);
  });

  it('negative control: a folder inside the whitelist is ingested (admin in team mode, and solo)', async () => {
    process.env.ALLOWED_FOLDER_PATHS = allowedDir;
    mode('team');
    expect((await send('POST', '/api/coding/alignment-reviews/rev_1/ingest', ADMIN, { source_type: 'local-directory', path: allowedDir })).status).toBe(200);
    mode('solo');
    expect((await send('POST', '/api/coding/alignment-reviews/rev_1/ingest', SOLO, { source_type: 'local-directory', path: allowedDir })).status).toBe(200);
    expect(ingest.ingestLocalProject).toHaveBeenCalledTimes(2);
    expect(ingest.ingestLocalProject).toHaveBeenCalledWith(path.resolve(allowedDir));
  });
});
