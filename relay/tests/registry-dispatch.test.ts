/**
 * registry-dispatch.test.ts — Step 6 verification: the relay's /v1/*
 * dispatcher exists, routes /v1/healthz, and degrades gracefully when
 * the registry DB is not configured.
 *
 * No Postgres is required for these tests — when
 * RELAY_REGISTRY_DATABASE_URL is unset (the default in CI),
 * /v1/healthz responds with { ok: false, reason: 'registry_disabled' }
 * and any other /v1/* route returns a structured 503.
 *
 * Steps 8 + 9 will add tests against a real DB for the submit / search
 * / admin endpoints.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Writable } from 'node:stream';
import { RelayServer } from '../src/server.js';
import { createAuditLogger } from '../src/audit.js';

const sinkStream = new Writable({ write(_c, _e, cb) { cb(); } });

let server: RelayServer;
let port: number;

beforeAll(async () => {
  // Belt-and-braces: clear the env var so even if someone runs the
  // suite with a stale value set, our "disabled" assertion holds.
  delete process.env.RELAY_REGISTRY_DATABASE_URL;

  let tempPort: number;
  {
    const t = new RelayServer({
      ownUrl: 'ws://127.0.0.1:1', port: 0, host: '127.0.0.1', insecure: true,
      drainIntervalMs: 0, audit: createAuditLogger(sinkStream),
    });
    await t.start();
    tempPort = t.actualPort();
    await t.stop();
  }
  server = new RelayServer({
    ownUrl: `ws://127.0.0.1:${tempPort}`,
    port: tempPort,
    host: '127.0.0.1',
    insecure: true,
    drainIntervalMs: 0,
    audit: createAuditLogger(sinkStream),
  });
  await server.start();
  port = server.actualPort();
});

afterAll(async () => {
  await server.stop();
});

describe('/v1/healthz (registry disabled)', () => {
  it('responds 200 with ok:false + reason when no DB is configured', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')?.startsWith('application/json')).toBe(true);
    const body = await res.json() as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('registry_disabled');
  });

  it('the existing /healthz signals registry_enabled:false to ops', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; registry_enabled: boolean };
    expect(body.ok).toBe(true);
    expect(body.registry_enabled).toBe(false);
  });
});

describe('/v1/* other routes (registry disabled)', () => {
  it('any /v1/portals/* returns a structured 503 with the right error code', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/portals/search?text=test`);
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe('registry_not_configured');
    expect(body.message).toMatch(/RELAY_REGISTRY_DATABASE_URL/);
  });

  it('POST /v1/portals/submit also gets the 503 (no info leak)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/portals/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('registry_not_configured');
  });

  it('/v1/<anything-else> still gets the 503 — dispatcher takes the whole /v1/ prefix', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/admin/whatever`);
    expect(res.status).toBe(503);
  });

  it('caches are disabled on registry responses (cache-control: no-store)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/healthz`);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('non-/v1/ paths still 404 (regression guard for the WS routing)', () => {
  it('unknown root paths return 404, body unchanged', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/some-unknown-path`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('not found\n');
  });
});
