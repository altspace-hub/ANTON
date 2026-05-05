/**
 * T14 — Instance squats on another instance's instance_id at the relay.
 *
 * Threat model claim (THREAT_MODEL.md §2 T14):
 *   "Spec §3.2 requires the relay to verify (a) instance_id == sha256(static_pk)[0..16),
 *    (b) binding_sig proves the Ed25519 / X25519 pair was deliberately signed by
 *    the operator, (c) proof_sig signs over instance_id || static_pk || ed_pk ||
 *    relay_url || timestamp, (d) the relay verifies its own URL appears in the
 *    signed payload."
 *
 * Each step has a dedicated negative test that submits a HELLO_INSTANCE
 * with that field tampered and confirms the relay rejects the frame at
 * the wire layer (over an actual WebSocket, not just a unit test of the
 * verifier function).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startRelay, stopRelay, dial, whenOpen, makeInstance, encodeFrame, TYPE,
  TEST_RELAY_URL,
} from './harness.js';
import { decodeRelayErrorPayload } from '../../src/frame.js';
import {
  buildHelloInstance, buildBindingSig,
} from '../../src/hello.js';
import {
  ed25519GenerateKeypair, ed25519PkToCurve25519, ed25519Sign,
} from '../../src/primitives.js';
import type { RelayServer } from '../../src/server.js';

let server: RelayServer;
let port: number;
beforeAll(async () => { ({ server, port } = await startRelay()); });
afterAll(async () => { await stopRelay(server); });

describe('T14 — instance squatting at the wire', () => {
  it('rejects HELLO_INSTANCE where instance_id ≠ sha256(static_pk)[0..16) (step 1)', async () => {
    const inst = makeInstance();
    // Mutate the first byte of instance_id (offset 0..16)
    const tampered = new Uint8Array(inst.payload);
    tampered[0] ^= 0x01;

    const ws = dial(port);
    await whenOpen(ws);
    ws.send(encodeFrame(TYPE.HELLO_INSTANCE, tampered));
    const f = await ws.nextFrame();
    expect(f.type).toBe(TYPE.ERROR);
    const err = decodeRelayErrorPayload(f.payload);
    expect(err.code).toBe(0x0002);  // BAD_HELLO
    expect(err.message).toContain('step 1');
    ws.close();
  });

  it('rejects HELLO_INSTANCE with a forged binding_sig (step 2)', async () => {
    const inst = makeInstance();
    const tampered = new Uint8Array(inst.payload);
    // binding_sig is at offset 16+32+32 = 80, length 64
    tampered[80] ^= 0x01;

    const ws = dial(port);
    await whenOpen(ws);
    ws.send(encodeFrame(TYPE.HELLO_INSTANCE, tampered));
    const f = await ws.nextFrame();
    const err = decodeRelayErrorPayload(f.payload);
    expect(err.code).toBe(0x0002);  // BAD_HELLO
    expect(err.message).toContain('step 2');
    ws.close();
  });

  it('rejects HELLO_INSTANCE with mismatched ed_pk / x_pk (step 2 — derived check)', async () => {
    // Build with ed_pk from one keypair and x_pk from another, both with
    // valid binding_sig over (ed_pk_A, x_pk_B). Step 2's "binding_sig
    // verifies under ed_pk" passes because we use ed_pk_A's privkey to
    // sign. But x_pk_B != ed25519_pk_to_curve25519(ed_pk_A), which the
    // derived-X check catches.
    const a = ed25519GenerateKeypair();
    const b = ed25519GenerateKeypair();
    const x_b = ed25519PkToCurve25519(b.publicKey);
    const sign = (m: Uint8Array) => ed25519Sign(m, a.privateKey);
    const binding_sig = buildBindingSig(a.publicKey, x_b, sign);
    const payload = buildHelloInstance({
      instance_ed_pk: a.publicKey,
      instance_static_pk: x_b,
      binding_sig,
      relay_url: TEST_RELAY_URL,
      timestamp: Math.floor(Date.now() / 1000),
      caps: 0,
      sign,
    });

    const ws = dial(port);
    await whenOpen(ws);
    ws.send(encodeFrame(TYPE.HELLO_INSTANCE, payload));
    const f = await ws.nextFrame();
    const err = decodeRelayErrorPayload(f.payload);
    expect(err.code).toBe(0x0002);
    expect(err.message).toContain('step 2');
    ws.close();
  });

  it('rejects HELLO_INSTANCE whose relay_url ≠ this relay\'s canonical URL (step 3)', async () => {
    const inst = makeInstance({ relayUrl: 'wss://impostor.example' });
    const ws = dial(port);
    await whenOpen(ws);
    ws.send(encodeFrame(TYPE.HELLO_INSTANCE, inst.payload));
    const f = await ws.nextFrame();
    const err = decodeRelayErrorPayload(f.payload);
    expect(err.code).toBe(0x0002);
    expect(err.message).toContain('step 3');
    ws.close();
  });

  it('rejects HELLO_INSTANCE with a stale timestamp (step 4)', async () => {
    const stale = Math.floor(Date.now() / 1000) - 60;     // 60s ago > 30s window
    const inst = makeInstance({ timestamp: stale });
    const ws = dial(port);
    await whenOpen(ws);
    ws.send(encodeFrame(TYPE.HELLO_INSTANCE, inst.payload));
    const f = await ws.nextFrame();
    const err = decodeRelayErrorPayload(f.payload);
    expect(err.code).toBe(0x0003);  // INVALID_PROOF
    expect(err.message).toContain('step 4');
    ws.close();
  });

  it('rejects HELLO_INSTANCE with a future-skewed timestamp (step 4)', async () => {
    const future = Math.floor(Date.now() / 1000) + 60;     // +60s > 30s window
    const inst = makeInstance({ timestamp: future });
    const ws = dial(port);
    await whenOpen(ws);
    ws.send(encodeFrame(TYPE.HELLO_INSTANCE, inst.payload));
    const f = await ws.nextFrame();
    const err = decodeRelayErrorPayload(f.payload);
    expect(err.code).toBe(0x0003);
    expect(err.message).toContain('step 4');
    ws.close();
  });

  it('rejects HELLO_INSTANCE with a corrupted proof_sig (step 5)', async () => {
    const inst = makeInstance();
    const tampered = new Uint8Array(inst.payload);
    // proof_sig offset = 16+32+32+64+2+relay_url_len+4 = 150 + relay_url_len
    const proofOff = 16 + 32 + 32 + 64 + 2 + TEST_RELAY_URL.length + 4;
    tampered[proofOff] ^= 0x01;

    const ws = dial(port);
    await whenOpen(ws);
    ws.send(encodeFrame(TYPE.HELLO_INSTANCE, tampered));
    const f = await ws.nextFrame();
    const err = decodeRelayErrorPayload(f.payload);
    expect(err.code).toBe(0x0003);
    expect(err.message).toContain('step 5');
    ws.close();
  });

  it('rejects a replayed HELLO_INSTANCE (step 6)', async () => {
    const inst = makeInstance();

    // First registration succeeds.
    const ws1 = dial(port);
    await whenOpen(ws1);
    ws1.send(encodeFrame(TYPE.HELLO_INSTANCE, inst.payload));
    // No immediate response on success — give the server a moment to process.
    await new Promise(r => setTimeout(r, 100));
    expect(ws1.hasFrame()).toBe(false);

    // Second registration with the SAME payload (replay).
    const ws2 = dial(port);
    await whenOpen(ws2);
    ws2.send(encodeFrame(TYPE.HELLO_INSTANCE, inst.payload));
    const f = await ws2.nextFrame();
    const err = decodeRelayErrorPayload(f.payload);
    // Step 6 rejects with INVALID_PROOF — the same proof_sig already in
    // the replay cache for this instance_id.
    expect(err.code).toBe(0x0003);
    expect(err.message).toContain('step 6');

    ws1.close(); ws2.close();
  });
});
