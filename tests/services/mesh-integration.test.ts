/**
 * mesh-integration.test.ts — full end-to-end of the mesh stack.
 *
 * Stands up:
 *   - A REAL relay/src/server.ts RelayServer (Phase 2) — does full §3.2
 *     6-step HELLO_INSTANCE verification and ENVELOPE forwarding with
 *     from_role override.
 *   - A REAL MeshDialer (Phase 3.3) connecting to that relay.
 *   - A REAL bridge (Phase 3.4) wiring inbound RPC frames to a stub
 *     Express handler.
 *   - A fake phone using the REAL NoiseInitiator (Phase 3.1).
 *
 * Then runs an RPC REQUEST → RESPONSE round-trip end-to-end. If this
 * passes, every spec layer is interoperating correctly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Writable } from 'node:stream';
import WebSocket from 'ws';
import { createHash } from 'node:crypto';
import { ed25519, edwardsToMontgomeryPriv, edwardsToMontgomeryPub } from '@noble/curves/ed25519';

// Real relay package
import { RelayServer } from '../../relay/src/server.js';
import { createAuditLogger } from '../../relay/src/audit.js';

// Mesh modules under test
import { MeshDialer } from '../../server/services/mesh/dialer.js';
import { buildBridgeHooks } from '../../server/services/mesh/bridge.js';
import {
  NoiseInitiator,
  buildPrologue,
} from '../../server/services/mesh/noise.js';
import {
  encodeRpc,
  decodeRpc,
  RPC_KIND,
  type RpcResponse,
} from '../../server/services/mesh/rpc.js';

const sinkStream = new Writable({ write(_c, _e, cb) { cb(); } });

let server: RelayServer;
let port: number;
let canonicalRelayUrl: string;

beforeAll(async () => {
  // Bind to random loopback port first so we know the URL we'll commit to.
  // RelayServer in insecure mode accepts ws:// canonical URLs (insecure
  // mode is opt-in; production passing wss:// is unaffected).
  // We bind a temporary server to discover the port, close it, then restart
  // with the matching ownUrl.
  let tempPort: number;
  {
    const t = new RelayServer({
      ownUrl: 'ws://127.0.0.1:1',
      port: 0, host: '127.0.0.1', insecure: true,
      audit: createAuditLogger(sinkStream),
    });
    await t.start();
    tempPort = t.actualPort();
    await t.stop();
  }
  canonicalRelayUrl = `ws://127.0.0.1:${tempPort}`;
  server = new RelayServer({
    ownUrl: canonicalRelayUrl,
    port: tempPort,
    host: '127.0.0.1',
    insecure: true,
    helloGraceSec: 30,
    reaperIntervalMs: 100,
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

const BINDING_DOMAIN = new TextEncoder().encode('ANTON-MESH-IDENTITY/v1\n');

interface InstanceFixture {
  ed_priv: Uint8Array;
  ed_pk: Uint8Array;
  x_priv: Uint8Array;
  x_pk: Uint8Array;
  instanceId: Uint8Array;
  bindingSig: Uint8Array;
}

/** Build a real instance identity per spec §3.2 — the relay will verify
 *  every step against this, including the (ed_pk, x_pk) binding. */
function makeRealInstance(): InstanceFixture {
  const ed_priv = ed25519.utils.randomPrivateKey();
  const ed_pk = ed25519.getPublicKey(ed_priv);
  // Derive X25519 from Ed25519 — pubkey via birational map, privkey
  // via libsodium's standard derivation (SHA-512 of seed → clamp).
  const x_pk = edwardsToMontgomeryPub(ed_pk);
  const x_priv = edwardsToMontgomeryPriv(ed_priv);
  // instance_id = sha256(x_pk)[0..16)
  const instanceId = createHash('sha256').update(x_pk).digest().subarray(0, 16);
  // binding_sig signs (BINDING_DOMAIN || ed_pk || x_pk) under ed_priv
  const bindingMsg = new Uint8Array(BINDING_DOMAIN.length + 32 + 32);
  bindingMsg.set(BINDING_DOMAIN, 0);
  bindingMsg.set(ed_pk, BINDING_DOMAIN.length);
  bindingMsg.set(x_pk, BINDING_DOMAIN.length + 32);
  const bindingSig = ed25519.sign(bindingMsg, ed_priv);
  return {
    ed_priv, ed_pk, x_priv, x_pk, instanceId, bindingSig,
  };
}

// Wire-format helpers
const WIRE_VERSION = 0x01;
const TYPE_HELLO_PHONE = 0x02;
const TYPE_ACK_PHONE   = 0x04;
const TYPE_ENVELOPE    = 0x10;
const ROLE_PHONE = 0x01;

function encodeFrame(type: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + payload.length);
  out[0] = WIRE_VERSION;
  out[1] = type;
  out[2] = (payload.length >>> 16) & 0xFF;
  out[3] = (payload.length >>> 8) & 0xFF;
  out[4] = payload.length & 0xFF;
  out.set(payload, 5);
  return out;
}

function decodeFrame(buf: Uint8Array): { type: number; payload: Uint8Array } {
  const len = (buf[2]! << 16) | (buf[3]! << 8) | buf[4]!;
  return { type: buf[1]!, payload: buf.slice(5, 5 + len) };
}

interface BufferedWS {
  ws: WebSocket;
  nextFrame(timeoutMs?: number): Promise<{ type: number; payload: Uint8Array }>;
  send(frame: Uint8Array): void;
  close(): void;
}

function dial(): BufferedWS {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const queue: { type: number; payload: Uint8Array }[] = [];
  const waiters: ((f: { type: number; payload: Uint8Array }) => void)[] = [];
  ws.on('message', (data: Buffer) => {
    const f = decodeFrame(data);
    const w = waiters.shift();
    if (w) w(f);
    else queue.push(f);
  });
  return {
    ws,
    nextFrame(timeoutMs = 3000): Promise<{ type: number; payload: Uint8Array }> {
      return new Promise((resolve, reject) => {
        if (queue.length > 0) { resolve(queue.shift()!); return; }
        const timer = setTimeout(() => reject(new Error('nextFrame timed out')), timeoutMs);
        waiters.push((f) => { clearTimeout(timer); resolve(f); });
      });
    },
    send(frame): void { ws.send(frame); },
    close(): void { try { ws.close(); } catch { /* ignore */ } },
  };
}

function whenOpen(b: BufferedWS): Promise<void> {
  return new Promise((resolve, reject) => {
    b.ws.once('open', () => resolve());
    b.ws.once('error', reject);
  });
}

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ── The integration test ────────────────────────────────────────────

describe('Mesh integration — real relay + dialer + bridge + Express stub', () => {
  it('phone → instance RPC round-trip via the real stack', async () => {
    // Stub Express handler — echoes the request body back as JSON.
    const expressHandler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): void => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const bodyIn = Buffer.concat(chunks).toString('utf8');
        const phoneStatic = (req.headers['x-mesh-phone-static'] as string) ?? null;
        const replyJson = JSON.stringify({
          got: bodyIn,
          method: req.method,
          path: req.url,
          phoneStaticPrefix: phoneStatic ? phoneStatic.slice(0, 8) : null,
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(replyJson);
      });
    };

    // ── Boot the instance side ──────────────────────────────────
    const inst = makeRealInstance();

    const bridgeHooks = buildBridgeHooks({
      expressHandler,
      attachPhoneStaticHeader: true,
    });
    const dialer = new MeshDialer({
      relayUrls: [canonicalRelayUrl],
      ed25519: { publicKey: inst.ed_pk, privateKey: inst.ed_priv },
      x25519:  { publicKey: inst.x_pk,  privateKey: inst.x_priv },
      instanceId: inst.instanceId,
      bindingSig: inst.bindingSig,
      onSessionOpen: bridgeHooks.onSessionOpen,
      onSessionData: bridgeHooks.onSessionData,
      onSessionClose: bridgeHooks.onSessionClose,
    });
    dialer.start();
    await waitFor(() => dialer.legCount() === 1, 3000);

    // ── Boot the fake phone side ─────────────────────────────────
    const phoneStaticPriv = ed25519.utils.randomPrivateKey();
    const phoneStaticPubEd = ed25519.getPublicKey(phoneStaticPriv);
    void phoneStaticPubEd;
    // For Noise IK we need X25519 keys.
    const phoneX25519Priv = edwardsToMontgomeryPriv(phoneStaticPriv);
    const phoneX25519Pub  = edwardsToMontgomeryPub(ed25519.getPublicKey(phoneStaticPriv));

    // Build prologue using the same canonical URL the relay knows.
    const instanceIdHex = Array.from(inst.instanceId)
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const initiator = new NoiseInitiator({
      staticKeypair: { publicKey: phoneX25519Pub, privateKey: phoneX25519Priv },
      responderStatic: inst.x_pk,
      prologue: buildPrologue(canonicalRelayUrl, instanceIdHex),
    });
    const noiseMsg1 = initiator.writeMessage1();

    // Phone connects to relay and sends HELLO_PHONE.
    const phoneSock = dial();
    await whenOpen(phoneSock);

    const helloPayload = new Uint8Array(16 + 32 + noiseMsg1.length);
    helloPayload.set(inst.instanceId, 0);
    // phone_ephem_pk: the relay forwards this to the instance, but the
    // instance reads it from inside noiseMsg1 anyway. Use zeros to keep
    // the test simple.
    helloPayload.set(new Uint8Array(32), 16);
    helloPayload.set(noiseMsg1, 48);
    phoneSock.send(encodeFrame(TYPE_HELLO_PHONE, helloPayload));

    // Phone gets ACK_PHONE
    const ackPhone = await phoneSock.nextFrame();
    expect(ackPhone.type).toBe(TYPE_ACK_PHONE);
    const sessionId = ackPhone.payload;
    expect(sessionId).toHaveLength(16);

    // Next frame to the phone is the instance's Noise msg 2 in an ENVELOPE.
    const noiseMsg2Env = await phoneSock.nextFrame();
    expect(noiseMsg2Env.type).toBe(TYPE_ENVELOPE);
    const noiseMsg2 = noiseMsg2Env.payload.subarray(17);   // skip session_id + from_role
    const { transport: phoneTransport } = initiator.readMessage2(noiseMsg2);

    // Phone sends an RPC REQUEST inside a Noise transport message.
    const reqFrame = encodeRpc({
      kind: RPC_KIND.REQUEST,
      seq: 1,
      method: 'POST',
      path: '/api/app/echo',
      headers: [{ name: 'content-type', value: 'application/json' }],
      body: new TextEncoder().encode('{"hello":"mesh"}'),
    });
    const reqCt = phoneTransport.encrypt(reqFrame);
    const reqEnv = new Uint8Array(16 + 1 + reqCt.length);
    reqEnv.set(sessionId, 0);
    reqEnv[16] = ROLE_PHONE;   // relay overrides anyway
    reqEnv.set(reqCt, 17);
    phoneSock.send(encodeFrame(TYPE_ENVELOPE, reqEnv));

    // Wait for the response ENVELOPE coming back through the relay.
    const respEnv = await phoneSock.nextFrame(5000);
    expect(respEnv.type).toBe(TYPE_ENVELOPE);
    const respCt = respEnv.payload.subarray(17);
    const respPlaintext = phoneTransport.decrypt(respCt);
    const respFrame = decodeRpc(respPlaintext) as RpcResponse;

    expect(respFrame.kind).toBe(RPC_KIND.RESPONSE);
    expect(respFrame.seq).toBe(1);
    expect(respFrame.status).toBe(200);
    const replyBody = JSON.parse(new TextDecoder().decode(respFrame.body));
    expect(replyBody.got).toBe('{"hello":"mesh"}');
    expect(replyBody.method).toBe('POST');
    expect(replyBody.path).toBe('/api/app/echo');
    // Phone static pubkey was attached as a header.
    expect(replyBody.phoneStaticPrefix).toBeDefined();
    expect(typeof replyBody.phoneStaticPrefix).toBe('string');
    expect(replyBody.phoneStaticPrefix.length).toBe(8);

    phoneSock.close();
    dialer.stop();
  }, 15000);
});
