/**
 * coding-large-container.test.ts — ANTON Studio Phase 6 (route-level).
 *
 * Mounts the REAL coding-large router against a FULLY MOCKED DatabaseAdapter and
 * exercises the two container endpoints:
 *   • GET  /container/probe  — honest current state (docker? flag? effective mode)
 *   • POST /container/mode   — set environment_mode docker / local, with an
 *                              HONEST warning when docker can't actually isolate
 *
 * No real docker is invoked for the ASSERTIONS we make: the route calls the real
 * detectDocker(), but every assertion here is driven by the OPERATOR FLAG
 * (CODING_STUDIO_DOCKER) and the project's environment_mode — both of which we
 * control — so results are deterministic whether or not Docker is installed on
 * the runner. (With the flag OFF, effectiveMode is ALWAYS 'local' regardless of
 * docker presence — that is precisely the honest fallback we verify.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { CONTAINER_ENABLE_ENV } from '../../server/services/coding-container.js';

if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = 'c'.repeat(64);

const PROJECT_ID = 'cccccccc-dddd-eeee-ffff-000000000000';

interface FakeState {
  codingProjects: Map<string, Record<string, unknown>>;
}

function makeFakeDb(state: FakeState): DatabaseAdapter {
  return {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM coding_projects')) {
        return (state.codingProjects.get(String(params[0])) as T) ?? undefined;
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return [] as T[]; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.startsWith('UPDATE coding_projects') && sql.includes('environment_mode = ?')) {
        const id = String(params[params.length - 1]);
        const proj = state.codingProjects.get(id);
        if (proj) proj.environment_mode = params[0];
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
    async close(): Promise<void> {},
  };
}

describe('ANTON Studio Phase 6 — container routes', () => {
  let state: FakeState;
  let server: Server;
  let base: string;
  let prevFlag: string | undefined;

  beforeAll(() => {
    prevFlag = process.env[CONTAINER_ENABLE_ENV];
    // Default OFF for these tests — the honest-fallback path.
    delete process.env[CONTAINER_ENABLE_ENV];
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (prevFlag === undefined) delete process.env[CONTAINER_ENABLE_ENV];
    else process.env[CONTAINER_ENABLE_ENV] = prevFlag;
  });

  beforeEach(async () => {
    delete process.env[CONTAINER_ENABLE_ENV];
    state = {
      codingProjects: new Map([[PROJECT_ID, { id: PROJECT_ID, name: 'studio-container', environment_mode: 'auto' }]]),
    };
    const { createCodingLargeRoutes } = await import('../../server/routes/coding-large.js');
    const router = await createCodingLargeRoutes(makeFakeDb(state), {
      serverDsn: 'postgresql://anton:anton@localhost:5432/anton',
    });
    if (server) await new Promise<void>((r) => server.close(() => r()));
    const app = express();
    app.use(express.json());
    // server/index.ts mounts this router behind authMiddleware, which ALWAYS stamps
    // req.user (solo → the solo admin; team → the JWT subject, or 401 before the
    // router is reached). A harness without it models a request that cannot occur,
    // and the ownership guard on /coding/projects/:id correctly 401s it.
    app.use((req, _res, next) => {
      (req as express.Request & { user?: unknown }).user = { id: 'solo', username: 'solo', role: 'admin' };
      next();
    });
    app.use('/api', router);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no addr');
    base = `http://127.0.0.1:${addr.port}`;
  });

  async function post(p: string, body: unknown) {
    const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }
  async function get(p: string) {
    const r = await fetch(`${base}${p}`);
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  it('probe: with the flag OFF and mode=auto, effectiveMode is local and NOT isolated', async () => {
    const { status, json } = await get(`/api/coding/projects/${PROJECT_ID}/container/probe`);
    expect(status).toBe(200);
    expect(json.enabledByFlag).toBe(false);
    expect(json.enableEnvVar).toBe(CONTAINER_ENABLE_ENV);
    expect(json.environmentMode).toBe('auto');
    expect(json.requested).toBe(false);
    expect(json.effectiveMode).toBe('local');
    expect(json.isolated).toBe(false);
    expect(String(json.reason)).toMatch(/not in docker mode/i);
  });

  it('probe 404s for an unknown project', async () => {
    const { status } = await get(`/api/coding/projects/nope/container/probe`);
    expect(status).toBe(404);
  });

  it("mode=docker while the flag is OFF → 200 with an HONEST fallback warning (still NOT isolated)", async () => {
    const { status, json } = await post(`/api/coding/projects/${PROJECT_ID}/container/mode`, { mode: 'docker' });
    expect(status).toBe(200);
    expect(json.environmentMode).toBe('docker');
    expect(String(json.warning)).toMatch(/NOT isolated/i);
    expect(String(json.warning)).toContain(CONTAINER_ENABLE_ENV);
    // The DB was actually updated to docker.
    expect(state.codingProjects.get(PROJECT_ID)!.environment_mode).toBe('docker');

    // Re-probing now reports requested=true but effectiveMode still local (flag off).
    const probe = await get(`/api/coding/projects/${PROJECT_ID}/container/probe`);
    expect(probe.json.requested).toBe(true);
    expect(probe.json.effectiveMode).toBe('local');
    expect(probe.json.isolated).toBe(false);
    expect(String(probe.json.reason)).toMatch(/has not enabled it|unavailable/i);
  });

  it("mode=local sets environment_mode back to 'auto' with no warning", async () => {
    // First go docker, then back to local.
    await post(`/api/coding/projects/${PROJECT_ID}/container/mode`, { mode: 'docker' });
    const { status, json } = await post(`/api/coding/projects/${PROJECT_ID}/container/mode`, { mode: 'local' });
    expect(status).toBe(200);
    expect(json.environmentMode).toBe('auto');
    expect(json.warning).toBeNull();
    expect(state.codingProjects.get(PROJECT_ID)!.environment_mode).toBe('auto');
  });

  it('mode rejects an invalid value (400)', async () => {
    const { status, json } = await post(`/api/coding/projects/${PROJECT_ID}/container/mode`, { mode: 'vm' });
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/docker.*local|local.*docker/i);
  });

  it('mode 404s for an unknown project', async () => {
    const { status } = await post(`/api/coding/projects/nope/container/mode`, { mode: 'docker' });
    expect(status).toBe(404);
  });
});
