/**
 * discovery-error-path.test.ts — the discovery routes must be able to FAIL.
 *
 * server/routes/discovery.ts carried this helper, used by all fourteen catch blocks:
 *
 *     function errMsg(err: unknown): string {
 *       return err instanceof Error ? errMsg(err) : String(err);
 *     }
 *
 * It calls itself on the same value, so any Error recursed until the stack blew. The
 * RangeError was thrown from INSIDE a catch block in an async handler, which Express 4
 * does not route to the error middleware — the promise just rejects and nothing is
 * ever written to the socket. Every 500 path in the file hung the request instead of
 * returning an error, so the user watched a spinner forever.
 *
 * This test therefore asserts the route RESPONDS at all, under a timeout. Asserting
 * only on the body would pass vacuously against the broken version — there is no body
 * to compare, because there is no response.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

/** A database that fails every read — the shape of a genuine 500. */
function failingDb(): DatabaseAdapter {
  return {
    dialect: 'postgresql',
    async get(): Promise<undefined> { throw new Error('connection terminated unexpectedly'); },
    async all(): Promise<never[]> { throw new Error('connection terminated unexpectedly'); },
    async run(): Promise<RunResult> { throw new Error('connection terminated unexpectedly'); },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
    async close(): Promise<void> {},
  } as unknown as DatabaseAdapter;
}

describe('discovery routes answer on the failure path', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const { createDiscoveryRoutes } = await import('../../server/routes/discovery.js');
    const app = express();
    app.use(express.json());
    app.use('/api', await createDiscoveryRoutes(failingDb()));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no addr');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it('returns a 500 with an error body instead of hanging when the DB throws', async () => {
    // 5s is generous for a loopback request; the point is that a hang FAILS here
    // rather than stalling until the suite's own 30s timeout.
    const res = await fetch(`${base}/api/discovery/sessions`, { signal: AbortSignal.timeout(5000) });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(typeof body.error).toBe('string');
    expect(body.error!.length).toBeGreaterThan(0);
  });

  it('answers the same way on a second, differently-shaped failure', async () => {
    // The helper is shared by every catch block in the file; one working path is not
    // evidence the helper works.
    const res = await fetch(`${base}/api/discovery/packs/fcp`, { signal: AbortSignal.timeout(5000) });
    expect(res.status).toBe(200);   // static data, no DB — sanity that the app is live

    const failing = await fetch(`${base}/api/discovery/followups/pending`, { signal: AbortSignal.timeout(5000) });
    expect(failing.status).toBe(500);
    expect(typeof ((await failing.json()) as { error?: string }).error).toBe('string');
  });
});
