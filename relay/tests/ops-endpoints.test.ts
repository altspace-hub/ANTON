/**
 * ops-endpoints.test.ts — /healthz, /metrics, RELAY_DRAINING graceful drain.
 *
 * These are Phase 7.1 operational concerns — the bits the relay needs in
 * production but doesn't need for protocol correctness. Caddy + uptime
 * monitors hit /healthz; Prometheus hits /metrics; SIGTERM during a
 * deployment triggers the drain path.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Writable } from 'node:stream';
import WebSocket from 'ws';
import { RelayServer } from '../src/server.js';
import { createAuditLogger } from '../src/audit.js';
import {
  encodeFrame, decodeFrame, decodeRelayErrorPayload, TYPE,
} from '../src/frame.js';
import {
  buildHelloInstance, buildBindingSig,
} from '../src/hello.js';
import {
  ed25519GenerateKeypair, ed25519PkToCurve25519, ed25519Sign,
} from '../src/primitives.js';

const TEST_RELAY_URL = 'ws://test.ops.example';

const sinkStream = new Writable({ write(_c, _e, cb) { cb(); } });

let server: RelayServer;
let port: number;
let canonicalUrl: string;

beforeAll(async () => {
  // Bind to a free port, then restart with the canonical URL using that port.
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
  canonicalUrl = `ws://127.0.0.1:${tempPort}`;
  server = new RelayServer({
    ownUrl: canonicalUrl,
    port: tempPort,
    host: '127.0.0.1',
    insecure: true,
    drainIntervalMs: 0, // tests don't wait the 5s production drain
    audit: createAuditLogger(sinkStream),
    helloRateLimit: { capacity: 1000, refillPerSec: 1000 },
    envelopeRateLimit: { capacity: 1000, refillPerSec: 1000 },
  });
  await server.start();
  port = server.actualPort();
});

afterAll(async () => {
  await server.stop();
});

// ── /healthz ────────────────────────────────────────────────────────

describe('/healthz', () => {
  it('returns 200 + JSON with version, uptime, active counts', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')?.startsWith('application/json')).toBe(true);
    const body = await res.json() as {
      ok: boolean;
      version: string;
      uptime_sec: number;
      active_sessions: number;
      active_instances: number;
      ws_connections: number;
    };
    expect(body.ok).toBe(true);
    expect(body.version).toBe('0.1.0');
    expect(typeof body.uptime_sec).toBe('number');
    expect(body.uptime_sec).toBeGreaterThanOrEqual(0);
    expect(body.active_sessions).toBe(0);
    expect(body.active_instances).toBe(0);
  });

  it('also matches /healthz/ (trailing slash)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz/`);
    expect(res.status).toBe(200);
  });

  it('rejects POST /healthz with 404', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown paths (no info leak)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/admin`);
    expect(res.status).toBe(404);
    const body = await res.text();
    // Body is just "not found\n" — no relay internals.
    expect(body).toBe('not found\n');
  });
});

// ── /metrics ────────────────────────────────────────────────────────

describe('/metrics', () => {
  it('returns 200 + Prometheus text-exposition format', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    const body = await res.text();
    // Required Prometheus features:
    expect(body).toMatch(/^# HELP /m);
    expect(body).toMatch(/^# TYPE /m);
    // Specific counters present:
    expect(body).toContain('anton_relay_uptime_seconds');
    expect(body).toContain('anton_relay_active_sessions');
    expect(body).toContain('anton_relay_active_instances');
    expect(body).toContain('anton_relay_hello_accepted_total');
    expect(body).toContain('anton_relay_envelope_forwarded_total');
    expect(body).toContain('anton_relay_rate_limited_total');
    expect(body).toContain('anton_relay_ws_connections_opened_total');
  });

  it('counters increment when activity occurs', async () => {
    // Snapshot before
    const before = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();
    const beforeAccepted = parseGauge(before, 'anton_relay_hello_accepted_total');
    const beforeWsOpened = parseGauge(before, 'anton_relay_ws_connections_opened_total');

    // Open + close a WS connection that sends a valid HELLO_INSTANCE
    const inst = makeInstance(canonicalUrl);
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    ws.send(encodeFrame(TYPE.HELLO_INSTANCE, inst.payload));
    // Give the server a moment to process
    await new Promise((r) => setTimeout(r, 50));
    ws.close();
    await new Promise((r) => setTimeout(r, 50));

    const after = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();
    const afterAccepted = parseGauge(after, 'anton_relay_hello_accepted_total');
    const afterWsOpened = parseGauge(after, 'anton_relay_ws_connections_opened_total');

    expect(afterAccepted).toBeGreaterThan(beforeAccepted);
    expect(afterWsOpened).toBeGreaterThan(beforeWsOpened);
  });

  it('rejected HELLOs increment the labelled-by-code counter', async () => {
    // Send a HELLO_INSTANCE for the WRONG relay URL — step 3 BAD_HELLO.
    const inst = makeInstance('ws://impostor.example');
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    ws.send(encodeFrame(TYPE.HELLO_INSTANCE, inst.payload));
    // Drain the ERROR frame
    await new Promise<void>((resolve) => {
      ws.once('message', (data: Buffer) => {
        const f = decodeFrame(data);
        if (f.type === TYPE.ERROR) decodeRelayErrorPayload(f.payload);
        resolve();
      });
    });
    ws.close();
    await new Promise((r) => setTimeout(r, 50));

    const m = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();
    expect(m).toMatch(/anton_relay_hello_rejected_total\{code="0x0002"\}\s+\d+/);
  });
});

// ── RELAY_DRAINING graceful shutdown ────────────────────────────────

describe('RELAY_DRAINING graceful shutdown', () => {
  it('emits RELAY_DRAINING to live connections before closing them', async () => {
    // Use a short drain interval so the test is fast but non-zero.
    const drainServer = new RelayServer({
      ownUrl: 'ws://127.0.0.1:1', port: 0, host: '127.0.0.1', insecure: true,
      drainIntervalMs: 200,
      audit: createAuditLogger(sinkStream),
      helloRateLimit: { capacity: 100, refillPerSec: 100 },
    });
    await drainServer.start();
    const drainPort = drainServer.actualPort();

    const ws = new WebSocket(`ws://127.0.0.1:${drainPort}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    const events: { type: 'message' | 'close'; t: number; payload?: number }[] = [];
    const t0 = Date.now();
    ws.on('message', (data: Buffer) => {
      const f = decodeFrame(data);
      if (f.type === TYPE.ERROR) {
        const err = decodeRelayErrorPayload(f.payload);
        events.push({ type: 'message', t: Date.now() - t0, payload: err.code });
      }
    });
    ws.on('close', () => events.push({ type: 'close', t: Date.now() - t0 }));

    // Trigger graceful shutdown.
    await drainServer.stop();

    // Wait for the WS close event to fire.
    await new Promise((r) => setTimeout(r, 350));

    // We should have observed: RELAY_DRAINING (0x0009) message FIRST, then close.
    const drainMsg = events.find(e => e.type === 'message' && e.payload === 0x0009);
    const closeEvt = events.find(e => e.type === 'close');
    expect(drainMsg).toBeDefined();
    expect(closeEvt).toBeDefined();
    // The drain message arrives quickly; the close fires after the
    // drainIntervalMs (200ms) elapses. We allow generous bounds.
    expect(drainMsg!.t).toBeLessThan(150);
    expect(closeEvt!.t).toBeGreaterThanOrEqual(drainMsg!.t);
  });

  it('drainIntervalMs=0 closes immediately (test mode)', async () => {
    const fastServer = new RelayServer({
      ownUrl: 'ws://127.0.0.1:1', port: 0, host: '127.0.0.1', insecure: true,
      drainIntervalMs: 0,
      audit: createAuditLogger(sinkStream),
    });
    await fastServer.start();
    const fastPort = fastServer.actualPort();

    const ws = new WebSocket(`ws://127.0.0.1:${fastPort}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    const t0 = Date.now();
    await fastServer.stop();
    // Wait for the WS close event.
    await new Promise((r) => setTimeout(r, 100));
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(200);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────

function makeInstance(relayUrl: string): { payload: Uint8Array } {
  const { publicKey: ed_pk, privateKey: ed_priv } = ed25519GenerateKeypair();
  const x_pk = ed25519PkToCurve25519(ed_pk);
  const sign = (m: Uint8Array) => ed25519Sign(m, ed_priv);
  const binding_sig = buildBindingSig(ed_pk, x_pk, sign);
  const payload = buildHelloInstance({
    instance_ed_pk: ed_pk,
    instance_static_pk: x_pk,
    binding_sig,
    relay_url: relayUrl,
    timestamp: Math.floor(Date.now() / 1000),
    caps: 0,
    sign,
  });
  return { payload };
}

function parseGauge(promText: string, metric: string): number {
  const re = new RegExp(`^${metric}(?:\\{[^}]*\\})?\\s+([0-9.]+)`, 'm');
  const m = re.exec(promText);
  if (!m) return 0;
  return parseFloat(m[1]!);
}
