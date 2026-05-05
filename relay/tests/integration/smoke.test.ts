/**
 * Integration smoke test — spin up a real RelayServer on a random port and
 * run a happy-path pairing + envelope round-trip through it.
 *
 * This is the litmus test that the WS server, frame codec, hello verifier,
 * match table, rate limiter, and audit log all wire together correctly.
 * Phase 2.9 will add explicit threat-model tests on top of this scaffold.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Writable } from 'node:stream';
import WebSocket from 'ws';
import { RelayServer } from '../../src/server.js';
import { createAuditLogger } from '../../src/audit.js';
import {
  encodeFrame,
  decodeFrame,
  TYPE,
  decodeRelayErrorPayload,
} from '../../src/frame.js';
import {
  buildHelloInstance,
  buildBindingSig,
} from '../../src/hello.js';
import {
  ed25519GenerateKeypair,
  ed25519PkToCurve25519,
  ed25519Sign,
} from '../../src/primitives.js';

const RELAY_URL = 'wss://test.relay.example';   // canonical form

let server: RelayServer;
let port: number;

// Silent audit logger — keep test output clean. The audit pipeline is
// exercised separately in audit.test.ts.
const sinkStream = new Writable({ write(_c, _e, cb) { cb(); } });

beforeAll(async () => {
  server = new RelayServer({
    ownUrl: RELAY_URL,
    port: 0,                  // OS-assigned
    host: '127.0.0.1',
    insecure: true,           // plain WS for tests
    helloGraceSec: 5,         // tight grace for fast test feedback
    reaperIntervalMs: 100,
    // All tests share one source IP (127.0.0.1) so the same bucket gets
    // hammered. Bump capacity well above what one test run consumes.
    helloRateLimit: { capacity: 1000, refillPerSec: 1000 },
    envelopeRateLimit: { capacity: 1000, refillPerSec: 1000 },
    audit: createAuditLogger(sinkStream),
  });
  await server.start();
  port = server.actualPort();
});

afterAll(async () => {
  await server.stop();
});

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * dial() returns a buffered WS — frames that arrive before the test calls
 * nextFrame() are queued and yielded in order. Without buffering, messages
 * fire before the test wires up its listener and tests timeout.
 */
interface BufferedWS {
  ws: WebSocket;
  nextFrame(timeoutMs?: number): Promise<{ type: number; payload: Uint8Array }>;
}

function dial(): BufferedWS {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const queue: { type: number; payload: Uint8Array }[] = [];
  const waiters: ((f: { type: number; payload: Uint8Array }) => void)[] = [];
  ws.on('message', (data: Buffer) => {
    const frame = decodeFrame(data);
    const w = waiters.shift();
    if (w) w(frame);
    else queue.push(frame);
  });
  return {
    ws,
    nextFrame(timeoutMs = 2000): Promise<{ type: number; payload: Uint8Array }> {
      return new Promise((resolve, reject) => {
        if (queue.length > 0) {
          resolve(queue.shift()!);
          return;
        }
        const timer = setTimeout(() => {
          // Remove our waiter from the queue.
          const i = waiters.indexOf(resolve);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error(`no frame within ${timeoutMs}ms`));
        }, timeoutMs);
        waiters.push((f) => { clearTimeout(timer); resolve(f); });
      });
    },
  };
}

function whenOpen(b: BufferedWS): Promise<void> {
  return new Promise((resolve, reject) => {
    b.ws.once('open', () => resolve());
    b.ws.once('error', reject);
  });
}

function buildValidInstanceHelloPayload(opts: { relayUrl?: string; timestamp?: number } = {}) {
  const { publicKey: ed_pk, privateKey: ed_priv } = ed25519GenerateKeypair();
  const x_pk = ed25519PkToCurve25519(ed_pk);
  const sign = (m: Uint8Array) => ed25519Sign(m, ed_priv);
  const binding_sig = buildBindingSig(ed_pk, x_pk, sign);
  const payload = buildHelloInstance({
    instance_ed_pk: ed_pk,
    instance_static_pk: x_pk,
    binding_sig,
    relay_url: opts.relayUrl ?? RELAY_URL,
    timestamp: opts.timestamp ?? Math.floor(Date.now() / 1000),
    caps: 0,
    sign,
  });
  return { ed_pk, ed_priv, x_pk, payload };
}

function buildPhoneHelloPayload(instance_id: Uint8Array, noiseInit = 'mock-noise-init'): Uint8Array {
  const phoneEphem = new Uint8Array(32);
  for (let i = 0; i < 32; i++) phoneEphem[i] = (i + 1) & 0xFF;
  const noise = new TextEncoder().encode(noiseInit);
  const payload = new Uint8Array(16 + 32 + noise.length);
  payload.set(instance_id, 0);
  payload.set(phoneEphem, 16);
  payload.set(noise, 48);
  return payload;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('relay smoke — happy path', () => {
  it('completes a full pairing: instance HELLO, phone HELLO, ACKs, ENVELOPE round-trip', async () => {
    // Instance side
    const inst = dial();
    await whenOpen(inst);
    const { x_pk, payload: instHello } = buildValidInstanceHelloPayload();
    inst.ws.send(encodeFrame(TYPE.HELLO_INSTANCE, instHello));

    // Phone side
    const phone = dial();
    await whenOpen(phone);
    const crypto = await import('node:crypto');
    const instance_id = crypto.createHash('sha256').update(x_pk).digest().subarray(0, 16);
    phone.ws.send(encodeFrame(TYPE.HELLO_PHONE, buildPhoneHelloPayload(instance_id)));

    const ackInst = await inst.nextFrame();
    expect(ackInst.type).toBe(TYPE.ACK_INSTANCE);
    const ackPhone = await phone.nextFrame();
    expect(ackPhone.type).toBe(TYPE.ACK_PHONE);

    const sessionId = ackPhone.payload;
    expect(sessionId).toHaveLength(16);

    // Phone → instance ENVELOPE; relay must set from_role=PHONE (0x01)
    const inner = new TextEncoder().encode('encrypted-noise-handshake-msg-1');
    const outboundEnv = new Uint8Array(16 + 1 + inner.length);
    outboundEnv.set(sessionId, 0);
    outboundEnv[16] = 0xCC;  // bogus from_role — relay overwrites
    outboundEnv.set(inner, 17);
    phone.ws.send(encodeFrame(TYPE.ENVELOPE, outboundEnv));

    const fwd = await inst.nextFrame();
    expect(fwd.type).toBe(TYPE.ENVELOPE);
    expect(fwd.payload[16]).toBe(0x01);
    expect(new TextDecoder().decode(fwd.payload.subarray(17))).toBe('encrypted-noise-handshake-msg-1');

    // Instance → phone ENVELOPE; relay must set from_role=INSTANCE (0x02)
    const reply = new TextEncoder().encode('encrypted-noise-handshake-msg-2');
    const replyEnv = new Uint8Array(16 + 1 + reply.length);
    replyEnv.set(sessionId, 0);
    replyEnv[16] = 0x77;  // bogus
    replyEnv.set(reply, 17);
    inst.ws.send(encodeFrame(TYPE.ENVELOPE, replyEnv));

    const fwd2 = await phone.nextFrame();
    expect(fwd2.type).toBe(TYPE.ENVELOPE);
    expect(fwd2.payload[16]).toBe(0x02);

    inst.ws.close();
    phone.ws.close();
  });

  it('responds to PING with PONG', async () => {
    const c = dial();
    await whenOpen(c);
    c.ws.send(encodeFrame(TYPE.PING, new Uint8Array(0)));
    const f = await c.nextFrame();
    expect(f.type).toBe(TYPE.PONG);
    c.ws.close();
  });
});

describe('relay smoke — error paths', () => {
  it('closes a connection that sends a bad-version frame', async () => {
    const c = dial();
    await whenOpen(c);
    const bad = new Uint8Array([0x99, 0x01, 0, 0, 0]);  // version=0x99
    c.ws.send(bad);
    const f = await c.nextFrame();
    expect(f.type).toBe(TYPE.ERROR);
    const err = decodeRelayErrorPayload(f.payload);
    expect(err.code).toBe(0x0001);  // BAD_VERSION
  });

  it('rejects a HELLO_INSTANCE whose relay_url does not match the relay\'s own', async () => {
    const c = dial();
    await whenOpen(c);
    const { payload } = buildValidInstanceHelloPayload({ relayUrl: 'wss://impostor.example' });
    c.ws.send(encodeFrame(TYPE.HELLO_INSTANCE, payload));
    const f = await c.nextFrame();
    expect(f.type).toBe(TYPE.ERROR);
    const err = decodeRelayErrorPayload(f.payload);
    expect(err.code).toBe(0x0002);  // BAD_HELLO (step 3 relay_url mismatch)
  });

  it('rejects a HELLO_INSTANCE with an out-of-window timestamp', async () => {
    const c = dial();
    await whenOpen(c);
    const old = Math.floor(Date.now() / 1000) - 60;
    const { payload } = buildValidInstanceHelloPayload({ timestamp: old });
    c.ws.send(encodeFrame(TYPE.HELLO_INSTANCE, payload));
    const f = await c.nextFrame();
    const err = decodeRelayErrorPayload(f.payload);
    expect(err.code).toBe(0x0003);  // INVALID_PROOF (step 4 timestamp)
  });

  it('closes a connection that sends ENVELOPE before HELLO', async () => {
    const c = dial();
    await whenOpen(c);
    const env = new Uint8Array(17);  // session_id + from_role, no inner
    c.ws.send(encodeFrame(TYPE.ENVELOPE, env));
    const f = await c.nextFrame();
    expect(f.type).toBe(TYPE.ERROR);
  });

  it('closes a connection that fails to HELLO within the grace window', async () => {
    const c = dial();
    await whenOpen(c);
    const closed = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 7000);
      c.ws.once('close', () => { clearTimeout(timer); resolve(true); });
    });
    expect(closed).toBe(true);
  }, 10000);
});

describe('relay smoke — cross-tenant isolation (T6)', () => {
  it('two pairings to different instances do not see each other\'s envelopes', async () => {
    const crypto = await import('node:crypto');

    const instA = dial();
    await whenOpen(instA);
    const a = buildValidInstanceHelloPayload();
    instA.ws.send(encodeFrame(TYPE.HELLO_INSTANCE, a.payload));

    const instB = dial();
    await whenOpen(instB);
    const b = buildValidInstanceHelloPayload();
    instB.ws.send(encodeFrame(TYPE.HELLO_INSTANCE, b.payload));

    const idA = crypto.createHash('sha256').update(a.x_pk).digest().subarray(0, 16);
    const idB = crypto.createHash('sha256').update(b.x_pk).digest().subarray(0, 16);

    const phoneA = dial();
    await whenOpen(phoneA);
    phoneA.ws.send(encodeFrame(TYPE.HELLO_PHONE, buildPhoneHelloPayload(idA)));

    const phoneB = dial();
    await whenOpen(phoneB);
    phoneB.ws.send(encodeFrame(TYPE.HELLO_PHONE, buildPhoneHelloPayload(idB)));

    const ackInstA = await instA.nextFrame();
    const ackInstB = await instB.nextFrame();
    const ackPhoneA = await phoneA.nextFrame();
    await phoneB.nextFrame();
    expect(ackInstA.type).toBe(TYPE.ACK_INSTANCE);
    expect(ackInstB.type).toBe(TYPE.ACK_INSTANCE);

    // Phone A sends an envelope → only Instance A should receive
    const sidA = ackPhoneA.payload;
    const env = new Uint8Array(17 + 5);
    env.set(sidA, 0);
    env.set(new TextEncoder().encode('hello'), 17);
    phoneA.ws.send(encodeFrame(TYPE.ENVELOPE, env));

    const recvA = await instA.nextFrame();
    expect(recvA.type).toBe(TYPE.ENVELOPE);

    // Instance B should receive nothing — wait briefly and verify the queue is empty.
    await new Promise(r => setTimeout(r, 300));
    let leakedBytes = 0;
    instB.ws.on('message', (d: Buffer) => { leakedBytes += d.length; });
    await new Promise(r => setTimeout(r, 100));
    expect(leakedBytes).toBe(0);

    instA.ws.close(); instB.ws.close(); phoneA.ws.close(); phoneB.ws.close();
  });
});
