/**
 * mesh-dialer.test.ts — drive the MeshDialer against a mock relay that we
 * stand up in-process. The mock plays both the relay role (accept
 * HELLO_INSTANCE, send ACK_INSTANCE with a phone's noise_init_msg,
 * forward ENVELOPE bytes between dialer and a fake phone) and the phone
 * role (run the Noise IK initiator side via NoiseInitiator).
 *
 * This isolates the dialer from the full relay package — keeping the test
 * fast and decoupled — while still exercising the real Noise IK responder
 * + the dialer's session lifecycle end-to-end.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocketServer, WebSocket as WSClient } from 'ws';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519';
import { x25519 } from '@noble/curves/ed25519';
import { MeshDialer } from '../../server/services/mesh/dialer.js';
import {
  NoiseInitiator,
  generateX25519Keypair,
  buildPrologue,
} from '../../server/services/mesh/noise.js';

// ── Wire-format constants (same as dialer.ts) ───────────────────────

const WIRE_VERSION = 0x01;
const TYPE_HELLO_INSTANCE = 0x01;
const TYPE_ACK_INSTANCE   = 0x03;
const TYPE_ENVELOPE       = 0x10;
const ROLE_PHONE    = 0x01;
const ROLE_INSTANCE = 0x02;

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
  if (buf.length < 5) throw new Error('short');
  const len = (buf[2]! << 16) | (buf[3]! << 8) | buf[4]!;
  return { type: buf[1]!, payload: buf.slice(5, 5 + len) };
}

// ── Mock relay ──────────────────────────────────────────────────────

interface MockRelay {
  url: string;
  /** Promise that resolves to the dialer's HELLO_INSTANCE payload. */
  helloInstanceP: Promise<Uint8Array>;
  /** Send an ACK_INSTANCE to the dialer (carries a phone's noise_init_msg + session_id). */
  sendAckInstance(phoneEphemPk: Uint8Array, noiseInitMsg: Uint8Array, sessionId: Uint8Array): void;
  /** Send an ENVELOPE to the dialer (used for phone → instance traffic). */
  sendEnvelope(sessionId: Uint8Array, fromRole: number, inner: Uint8Array): void;
  /** Inspect frames received FROM the dialer. */
  receivedFrames(): { type: number; payload: Uint8Array }[];
  /** Wait for the next frame from the dialer of a given type. */
  awaitNextFrame(matcher: (f: { type: number; payload: Uint8Array }) => boolean, timeoutMs?: number): Promise<{ type: number; payload: Uint8Array }>;
  close(): Promise<void>;
}

async function startMockRelay(): Promise<MockRelay> {
  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const port = (httpServer.address() as { port: number }).port;
  const url = `ws://127.0.0.1:${port}`;

  let dialerWs: WSClient | null = null;
  const received: { type: number; payload: Uint8Array }[] = [];
  const helloInstanceResolvers: ((p: Uint8Array) => void)[] = [];
  const helloInstanceP = new Promise<Uint8Array>((resolve) => helloInstanceResolvers.push(resolve));

  const waiters: ((f: { type: number; payload: Uint8Array }) => void)[] = [];

  wss.on('connection', (ws) => {
    dialerWs = ws as unknown as WSClient;
    ws.on('message', (data: Buffer) => {
      const frame = decodeFrame(data);
      received.push(frame);
      if (frame.type === TYPE_HELLO_INSTANCE) {
        const r = helloInstanceResolvers.shift();
        if (r) r(frame.payload);
      }
      // Drain any matching waiters
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i]!;
        // Each waiter pulls the most-recent matching frame; we leave the
        // matching to awaitNextFrame's filter rather than embedding here.
        // We just notify all waiters and they self-filter.
        try { w(frame); } catch { /* ignore */ }
      }
    });
  });

  return {
    url,
    helloInstanceP,
    sendAckInstance(phoneEphemPk, noiseInitMsg, sessionId): void {
      if (!dialerWs) throw new Error('no dialer connected');
      const payload = new Uint8Array(32 + noiseInitMsg.length + 16);
      payload.set(phoneEphemPk, 0);
      payload.set(noiseInitMsg, 32);
      payload.set(sessionId, 32 + noiseInitMsg.length);
      dialerWs.send(encodeFrame(TYPE_ACK_INSTANCE, payload));
    },
    sendEnvelope(sessionId, fromRole, inner): void {
      if (!dialerWs) throw new Error('no dialer connected');
      const payload = new Uint8Array(16 + 1 + inner.length);
      payload.set(sessionId, 0);
      payload[16] = fromRole;
      payload.set(inner, 17);
      dialerWs.send(encodeFrame(TYPE_ENVELOPE, payload));
    },
    receivedFrames(): { type: number; payload: Uint8Array }[] {
      return received.slice();
    },
    awaitNextFrame(matcher, timeoutMs = 2000): Promise<{ type: number; payload: Uint8Array }> {
      // Check already-arrived frames first
      for (const f of received) if (matcher(f)) {
        // Mark consumed by returning the first that matches; we don't actually
        // dedupe here because tests check by content, not by reference.
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('awaitNextFrame timed out')), timeoutMs);
        const w = (f: { type: number; payload: Uint8Array }): void => {
          if (matcher(f)) {
            clearTimeout(timer);
            const i = waiters.indexOf(w);
            if (i >= 0) waiters.splice(i, 1);
            resolve(f);
          }
        };
        waiters.push(w);
      });
    },
    async close(): Promise<void> {
      wss.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

const BINDING_DOMAIN = new TextEncoder().encode('ANTON-MESH-IDENTITY/v1\n');

function deriveX25519FromEd25519(ed_priv: Uint8Array, ed_pk: Uint8Array): { x_priv: Uint8Array; x_pk: Uint8Array } {
  // We could use noble's edwardsToMontgomery* functions, but the dialer
  // expects the X25519 keypair AS-IS — generating a fresh X25519 keypair
  // for tests is simpler and matches what an instance would do at boot.
  void ed_priv; void ed_pk;
  return { x_priv: new Uint8Array(32), x_pk: new Uint8Array(32) };
}

function makeInstanceFixture() {
  // Ed25519 long-term identity
  const ed_priv = ed25519.utils.randomPrivateKey();
  const ed_pk = ed25519.getPublicKey(ed_priv);
  // X25519 static — for tests, use an independent keypair (real instances
  // would derive deterministically; the dialer doesn't care, it uses what
  // it's given). The HELLO_INSTANCE binding_sig + step 2 verification
  // would catch a mismatched pair on the relay side, but the mock relay
  // here doesn't run that verification.
  const x_priv = x25519.utils.randomPrivateKey();
  const x_pk = x25519.getPublicKey(x_priv);
  // instance_id = sha256(x_pk)[0..16)
  const instance_id = crypto.createHash('sha256').update(x_pk).digest().subarray(0, 16);
  // binding_sig = Ed25519(ed_priv) over (BINDING_DOMAIN || ed_pk || x_pk)
  const bindingMsg = new Uint8Array(BINDING_DOMAIN.length + 32 + 32);
  bindingMsg.set(BINDING_DOMAIN, 0);
  bindingMsg.set(ed_pk, BINDING_DOMAIN.length);
  bindingMsg.set(x_pk, BINDING_DOMAIN.length + 32);
  const binding_sig = ed25519.sign(bindingMsg, ed_priv);
  return {
    ed25519: { publicKey: ed_pk, privateKey: ed_priv },
    x25519: { publicKey: x_pk, privateKey: x_priv },
    instanceId: instance_id,
    bindingSig: binding_sig,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('MeshDialer — connect + HELLO_INSTANCE', () => {
  let relay: MockRelay;
  beforeAll(async () => { relay = await startMockRelay(); });
  afterAll(async () => { await relay.close(); });

  it('sends a well-formed HELLO_INSTANCE on connect', async () => {
    const inst = makeInstanceFixture();
    const dialer = new MeshDialer({
      relayUrls: [relay.url],
      ed25519: inst.ed25519,
      x25519: inst.x25519,
      instanceId: inst.instanceId,
      bindingSig: inst.bindingSig,
    });
    dialer.start();
    const helloPayload = await relay.helloInstanceP;

    // First 16 bytes = instance_id
    expect([...helloPayload.subarray(0, 16)]).toEqual([...inst.instanceId]);
    // Next 32 = x_pk
    expect([...helloPayload.subarray(16, 48)]).toEqual([...inst.x25519.publicKey]);
    // Next 32 = ed_pk
    expect([...helloPayload.subarray(48, 80)]).toEqual([...inst.ed25519.publicKey]);
    // Next 64 = binding_sig
    expect([...helloPayload.subarray(80, 144)]).toEqual([...inst.bindingSig]);

    dialer.stop();
  }, 5000);
});

describe('MeshDialer — full Noise round-trip via mock relay', () => {
  it('completes an end-to-end pairing with a fake phone via the mock relay', async () => {
    const relay = await startMockRelay();
    try {
      const inst = makeInstanceFixture();

      let openedSessionId: Uint8Array | null = null;
      let receivedPlaintext: Uint8Array | null = null;
      let sessionCtx: { send: (p: Uint8Array) => void; close: () => void } | null = null;

      const dialer = new MeshDialer({
        relayUrls: [relay.url],
        ed25519: inst.ed25519,
        x25519: inst.x25519,
        instanceId: inst.instanceId,
        bindingSig: inst.bindingSig,
        onSessionOpen: (sid, ctx) => {
          openedSessionId = sid;
          sessionCtx = ctx;
        },
        onSessionData: (_sid, plaintext) => {
          receivedPlaintext = plaintext;
        },
      });
      dialer.start();
      await relay.helloInstanceP;

      // Phone side: build Noise IK initiator, send msg 1.
      const phoneStatic = generateX25519Keypair();
      const initiator = new NoiseInitiator({
        staticKeypair: phoneStatic,
        responderStatic: inst.x25519.publicKey,
        prologue: buildPrologue(relay.url, [...inst.instanceId].map(b => b.toString(16).padStart(2, '0')).join('')),
      });
      const noiseMsg1 = initiator.writeMessage1();

      // Mock relay sends ACK_INSTANCE to the dialer.
      const sessionId = crypto.randomBytes(16);
      const phoneEphem = new Uint8Array(32); // unused informationally; real phone_ephem is in noiseMsg1
      relay.sendAckInstance(phoneEphem, noiseMsg1, sessionId);

      // Wait for the dialer to send back its Noise msg 2 as an ENVELOPE.
      const fwd = await relay.awaitNextFrame(
        (f) => f.type === TYPE_ENVELOPE,
      );
      expect(fwd.type).toBe(TYPE_ENVELOPE);
      // Layout: session_id (16) | from_role (1) | inner
      expect([...fwd.payload.subarray(0, 16)]).toEqual([...sessionId]);
      const noiseMsg2 = fwd.payload.subarray(17);

      // Phone completes handshake.
      const { transport: phoneTransport } = initiator.readMessage2(noiseMsg2);

      // Wait for the dialer to register the session locally.
      await waitFor(() => openedSessionId !== null, 2000);
      expect(openedSessionId).not.toBeNull();
      expect(dialer.sessionCount()).toBe(1);

      // Phone sends an encrypted application message.
      const phonePayload = new TextEncoder().encode('hello-from-phone');
      const phoneCt = phoneTransport.encrypt(phonePayload);
      relay.sendEnvelope(sessionId, ROLE_PHONE, phoneCt);

      // Wait for the dialer to decrypt and surface it.
      await waitFor(() => receivedPlaintext !== null, 2000);
      expect(new TextDecoder().decode(receivedPlaintext!)).toBe('hello-from-phone');

      // Instance sends a reply through the dialer.
      sessionCtx!.send(new TextEncoder().encode('hello-from-instance'));
      const reply = await relay.awaitNextFrame((f) => {
        if (f.type !== TYPE_ENVELOPE) return false;
        // A second ENVELOPE after the first (which carried the Noise msg 2).
        return f.payload.byteLength > 17 + 16; // not the empty/short noise msg2
      });
      const replyInner = reply.payload.subarray(17);
      const replyPt = phoneTransport.decrypt(replyInner);
      expect(new TextDecoder().decode(replyPt)).toBe('hello-from-instance');

      dialer.stop();
    } finally {
      await relay.close();
    }
  }, 10000);
});

describe('MeshDialer — reachability hook', () => {
  it('fires onReachabilityChange(true) when first relay connects', async () => {
    const relay = await startMockRelay();
    try {
      const inst = makeInstanceFixture();
      const events: boolean[] = [];
      const dialer = new MeshDialer({
        relayUrls: [relay.url],
        ed25519: inst.ed25519,
        x25519: inst.x25519,
        instanceId: inst.instanceId,
        bindingSig: inst.bindingSig,
        onReachabilityChange: (r) => events.push(r),
      });
      dialer.start();
      await relay.helloInstanceP;
      await waitFor(() => events.length > 0, 2000);
      expect(events[0]).toBe(true);
      dialer.stop();
    } finally {
      await relay.close();
    }
  }, 5000);
});

// ── Helpers ─────────────────────────────────────────────────────────

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}
