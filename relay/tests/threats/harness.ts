/**
 * harness.ts — shared helpers for the threat test suite.
 *
 * Each test under tests/threats/ simulates a specific named attack from
 * docs/ANTON_MESH_THREAT_MODEL.md and asserts the spec-claimed mitigation.
 * Tests share the same scaffolding: spin up a real RelayServer on a random
 * loopback port, dial buffered WebSockets, build valid (or attacker-shaped)
 * HELLO payloads.
 */

import { Writable } from 'node:stream';
import WebSocket from 'ws';
import { RelayServer } from '../../src/server.js';
import { createAuditLogger } from '../../src/audit.js';
import {
  decodeFrame,
  encodeFrame,
  TYPE,
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
import { createHash } from 'node:crypto';

export const TEST_RELAY_URL = 'wss://test.relay.example';

/** Silent audit sink — keep test output clean. */
const sinkStream = new Writable({ write(_c, _e, cb) { cb(); } });

/**
 * Stand up a fresh RelayServer on a random loopback port. Caller MUST
 * call stopRelay() in afterAll. Generous rate limits + short HELLO grace
 * keep the tests fast and isolated from each other's traffic.
 */
export async function startRelay(overrides: {
  ownUrl?: string;
  helloRateCap?: number;
  helloRateRefill?: number;
} = {}): Promise<{ server: RelayServer; port: number }> {
  const server = new RelayServer({
    ownUrl: overrides.ownUrl ?? TEST_RELAY_URL,
    port: 0,
    host: '127.0.0.1',
    insecure: true,
    helloGraceSec: 5,
    reaperIntervalMs: 100,
    helloRateLimit: {
      capacity: overrides.helloRateCap ?? 1000,
      refillPerSec: overrides.helloRateRefill ?? 1000,
    },
    envelopeRateLimit: { capacity: 1000, refillPerSec: 1000 },
    audit: createAuditLogger(sinkStream),
  });
  await server.start();
  return { server, port: server.actualPort() };
}

export async function stopRelay(server: RelayServer): Promise<void> {
  await server.stop();
}

// ── Buffered WS dial ────────────────────────────────────────────────

export interface BufferedWS {
  ws: WebSocket;
  /** Wait for the next WS frame (full Mesh frame, decoded). Times out at timeoutMs. */
  nextFrame(timeoutMs?: number): Promise<{ type: number; payload: Uint8Array }>;
  /** True if any frame has arrived since open(). */
  hasFrame(): boolean;
  send(frame: Uint8Array): void;
  close(): void;
}

export function dial(port: number): BufferedWS {
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
          const i = waiters.findIndex(w => w === resolve);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error(`no frame within ${timeoutMs}ms`));
        }, timeoutMs);
        waiters.push((f) => { clearTimeout(timer); resolve(f); });
      });
    },
    hasFrame(): boolean { return queue.length > 0; },
    send(frame: Uint8Array): void { ws.send(frame); },
    close(): void { try { ws.close(); } catch { /* ignore */ } },
  };
}

export function whenOpen(b: BufferedWS): Promise<void> {
  return new Promise((resolve, reject) => {
    b.ws.once('open', () => resolve());
    b.ws.once('error', reject);
  });
}

// ── HELLO builders ──────────────────────────────────────────────────

export interface InstanceFixture {
  ed_pk: Uint8Array;
  ed_priv: Uint8Array;
  x_pk: Uint8Array;
  binding_sig: Uint8Array;
  payload: Uint8Array;
  instance_id: Uint8Array;
}

/** Build a valid HELLO_INSTANCE payload + matching keypair. */
export function makeInstance(opts: {
  relayUrl?: string;
  timestamp?: number;
} = {}): InstanceFixture {
  const { publicKey: ed_pk, privateKey: ed_priv } = ed25519GenerateKeypair();
  const x_pk = ed25519PkToCurve25519(ed_pk);
  const sign = (m: Uint8Array) => ed25519Sign(m, ed_priv);
  const binding_sig = buildBindingSig(ed_pk, x_pk, sign);
  const payload = buildHelloInstance({
    instance_ed_pk: ed_pk,
    instance_static_pk: x_pk,
    binding_sig,
    relay_url: opts.relayUrl ?? TEST_RELAY_URL,
    timestamp: opts.timestamp ?? Math.floor(Date.now() / 1000),
    caps: 0,
    sign,
  });
  const instance_id = createHash('sha256').update(x_pk).digest().subarray(0, 16);
  return { ed_pk, ed_priv, x_pk, binding_sig, payload, instance_id };
}

/** Build a HELLO_PHONE payload pointing at the given instance_id. */
export function makePhoneHello(
  instance_id: Uint8Array,
  noiseInit = 'mock-noise-init',
): Uint8Array {
  const phoneEphem = new Uint8Array(32);
  for (let i = 0; i < 32; i++) phoneEphem[i] = (i + 1) & 0xFF;
  const noise = new TextEncoder().encode(noiseInit);
  const payload = new Uint8Array(16 + 32 + noise.length);
  payload.set(instance_id, 0);
  payload.set(phoneEphem, 16);
  payload.set(noise, 48);
  return payload;
}

/** Re-export commonly-used frame primitives so tests don't deep-import. */
export { encodeFrame, decodeFrame, TYPE };

// ── End-to-end pairing helper ───────────────────────────────────────

/**
 * Execute a complete pair: dial instance + phone, send HELLOs, await ACKs.
 * Returns the live BufferedWS pair plus the session_id.
 */
export async function pair(
  port: number,
  instance: InstanceFixture,
): Promise<{ inst: BufferedWS; phone: BufferedWS; sessionId: Uint8Array }> {
  const inst = dial(port);
  await whenOpen(inst);
  inst.send(encodeFrame(TYPE.HELLO_INSTANCE, instance.payload));

  const phone = dial(port);
  await whenOpen(phone);
  phone.send(encodeFrame(TYPE.HELLO_PHONE, makePhoneHello(instance.instance_id)));

  const ackInst = await inst.nextFrame();
  if (ackInst.type !== TYPE.ACK_INSTANCE) {
    throw new Error(`expected ACK_INSTANCE, got 0x${ackInst.type.toString(16)}`);
  }
  const ackPhone = await phone.nextFrame();
  if (ackPhone.type !== TYPE.ACK_PHONE) {
    throw new Error(`expected ACK_PHONE, got 0x${ackPhone.type.toString(16)}`);
  }
  return { inst, phone, sessionId: ackPhone.payload };
}
