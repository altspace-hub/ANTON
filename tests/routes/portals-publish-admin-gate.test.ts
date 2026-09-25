/**
 * portals-publish-admin-gate.test.ts — publishing a portal, mapping the LAN
 * and swapping the registry trust bundle are instance-wide actions
 * (public-demo readiness, 2026-09-25).
 *
 * Before: any signed-in user could
 *   - start a walkthrough and finalize it, which publishes a portal under this
 *     instance's identity (signed descriptor, relay registry submission);
 *   - import a portal bundle, which publishes one too;
 *   - run the LAN scan and read its neighbour list — a map of the server's own
 *     network;
 *   - replace the trust bundle, which decides whose registry proofs every
 *     user's lookups accept.
 *
 * All are now requireAdminOrSolo in team mode. Each refusal is checked for the
 * absence of its side effect and paired with an admin and the solo user going
 * through (negative controls). Visitor and discovery reads stay public.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

vi.hoisted(() => {
  // middleware/auth.ts refuses to load without one.
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-portals-publish-admin-gate';
});

const svc = vi.hoisted(() => {
  const caller = { id: '' };
  return {
    caller,
    scanLan: vi.fn(async () => ({ found: 0 })),
    listKnownNeighbors: vi.fn(async () => []),
    importPortal: vi.fn(async () => ({ success: true, portalId: 'p1' })),
    createSession: vi.fn(async () => ({ id: 'wt_1' })),
    finalizeSession: vi.fn(async () => ({ portalId: 'p1' })),
    replace: vi.fn(() => undefined),
  };
});

vi.mock('../../server/services/portals/portal-lan-discovery.js', () => ({
  scanLan: svc.scanLan,
  listKnownNeighbors: svc.listKnownNeighbors,
}));
vi.mock('../../server/services/portals/portal-bundler.js', () => ({
  bundlePortal: vi.fn(async () => Buffer.from('')),
  importPortal: svc.importPortal,
}));
vi.mock('../../server/services/portals/portal-walkthrough-engine.js', () => ({
  createWalkthroughEngine: () => ({ createSession: svc.createSession, finalizeSession: svc.finalizeSession }),
}));
vi.mock('../../server/services/registry-client/trust-store.js', () => {
  const bundle = {
    trustStoreVersion: 1,
    registryOperators: [{ operatorId: 'op', namespaces: ['futurechain'], publicKeyHex: 'ab', publicKeyFingerprint: 'fp', bundleDate: '2026-01-01', expiresAt: '2027-01-01' }],
  };
  return {
    getTrustStore: () => ({
      replace: svc.replace,
      snapshot: () => bundle,
      forNamespace: () => bundle.registryOperators[0],
      isPlaceholder: () => false,
    }),
  };
});
vi.mock('../../server/services/portals/portal-handler.js', () => ({ createPortalHandler: () => ({}) }));
vi.mock('../../server/services/portals/portal-database-service.js', () => ({ createPortalDatabaseService: () => ({}) }));
vi.mock('../../server/services/portals/portal-search-engine.js', () => ({ createPortalSearchEngine: () => ({}) }));
vi.mock('../../server/services/portals/portal-llm-suggest.js', () => ({
  suggestPhase: vi.fn(), suggestPhaseStream: vi.fn(), suggestCapabilitySchema: vi.fn(), getSessionCostCents: vi.fn(),
}));
vi.mock('../../server/services/portals/portal-capabilities-editor.js', () => ({
  rebuildPortalDescriptor: vi.fn(), readCurrentCapabilities: vi.fn(),
}));
vi.mock('../../server/services/portals/external-url-verifier.js', () => ({ verifyAndPersist: vi.fn() }));
vi.mock('../../server/services/registry-client/relay-submit.js', () => ({
  fetchSubmissionStatus: vi.fn(),
  RelaySubmitError: class RelaySubmitError extends Error {},
}));

import { createPortalsRoutes } from '../../server/routes/portals.js';

const fakeDb = {
  dialect: 'postgresql',
  async get(sql: string) {
    // The walkthrough session belongs to whoever asks, so the route's own
    // session-owner check never masks what the admin gate does.
    if (/FROM portal_walkthrough_sessions/.test(sql)) return { owner_id: svc.caller.id };
    return undefined;
  },
  async all() { return []; },
  async run(): Promise<RunResult> { return { changes: 1, lastInsertRowid: 0 }; },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(fakeDb as unknown as DatabaseAdapter); },
  async close() { /* noop */ },
};

const originalMode = process.env.DEPLOYMENT_MODE;
let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.header('x-test-user');
    if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
    svc.caller.id = id ?? '';
    next();
  });
  app.use('/api', createPortalsRoutes(fakeDb as unknown as DatabaseAdapter));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

afterEach(() => { vi.clearAllMocks(); });

type Who = { id: string; role: string };
const ANALYST: Who = { id: 'carol', role: 'analyst' };
const VIEWER: Who = { id: 'vic', role: 'viewer' };
const ADMIN: Who = { id: 'root', role: 'admin' };
const SOLO: Who = { id: 'solo', role: 'admin' };

function mode(m: 'team' | 'solo'): void {
  if (m === 'team') process.env.DEPLOYMENT_MODE = 'team'; else delete process.env.DEPLOYMENT_MODE;
}

async function send(method: string, url: string, who: Who, body?: unknown): Promise<number> {
  const r = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user': who.id, 'x-test-role': who.role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await r.text();
  return r.status;
}

async function importBundle(who: Who): Promise<number> {
  const form = new FormData();
  form.append('bundle', new Blob([Buffer.from('PK-not-really-a-zip')]), 'portal.anton');
  const r = await fetch(`${base}/api/portals/import`, {
    method: 'POST',
    headers: { 'x-test-user': who.id, 'x-test-role': who.role },
    body: form,
  });
  await r.text();
  return r.status;
}

const TRUST_BUNDLE = {
  trustStoreVersion: 2,
  registryOperators: [{ operatorId: 'evil', namespaces: ['futurechain'], publicKeyHex: 'abcd', publicKeyFingerprint: 'fp', bundleDate: '2026-09-01', expiresAt: '2027-09-01' }],
};

const GATED: Array<{ name: string; run: (who: Who) => Promise<number>; effect: () => ReturnType<typeof vi.fn>; ok: number }> = [
  { name: 'LAN scan', run: (w) => send('POST', '/api/portals/lan/scan', w), effect: () => svc.scanLan, ok: 200 },
  { name: 'LAN neighbours', run: (w) => send('GET', '/api/portals/lan/neighbors', w), effect: () => svc.listKnownNeighbors, ok: 200 },
  { name: 'install trust bundle', run: (w) => send('POST', '/api/portals/trust-bundle', w, TRUST_BUNDLE), effect: () => svc.replace, ok: 200 },
  { name: 'start a walkthrough', run: (w) => send('POST', '/api/portals/walkthroughs', w, { templateId: 'consultant' }), effect: () => svc.createSession, ok: 201 },
  { name: 'finalize (publish)', run: (w) => send('POST', '/api/portals/walkthroughs/wt_1/finalize', w, {}), effect: () => svc.finalizeSession, ok: 201 },
  { name: 'import a bundle', run: importBundle, effect: () => svc.importPortal, ok: 201 },
];

describe('portal publishing, LAN mapping and the trust bundle are admin-only in team mode', () => {
  for (const g of GATED) {
    it(`${g.name}: 403 for an analyst and a viewer, and nothing happens`, async () => {
      mode('team');
      expect(await g.run(ANALYST)).toBe(403);
      expect(await g.run(VIEWER)).toBe(403);
      expect(g.effect()).not.toHaveBeenCalled();
    });
  }

  for (const g of GATED) {
    it(`${g.name}: an admin in team mode, and the solo user, go through`, async () => {
      mode('team');
      expect(await g.run(ADMIN)).toBe(g.ok);
      mode('solo');
      expect(await g.run(SOLO)).toBe(g.ok);
      expect(g.effect()).toHaveBeenCalledTimes(2);
    });
  }

  it('templates and the trust-bundle status stay public', async () => {
    mode('team');
    expect(await send('GET', '/api/portals/templates', VIEWER)).toBe(200);
    expect(await send('GET', '/api/portals/trust-bundle/status', VIEWER)).toBe(200);
  });
});
