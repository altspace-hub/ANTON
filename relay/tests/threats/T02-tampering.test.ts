/**
 * T02 — Compromised relay reads or modifies traffic.
 *
 * Threat model claim (THREAT_MODEL.md §2 T2):
 *   "Relay never holds either party's static or ephemeral keys. Tampering
 *    breaks the AEAD tag and the receiving side closes the stream."
 *
 * The relay is a *byte pipe* for ENVELOPE inner bytes. The Noise AEAD
 * layer (between phone and instance) is what guarantees integrity. The
 * relay's responsibility, testable here, is:
 *
 *   1. Forward the inner bytes byte-for-byte — no relay-side mutation
 *      OTHER than overwriting `from_role` (§3.6).
 *   2. Tampered bytes pass through to the receiver — meaning the relay
 *      doesn't "fix up" the AEAD ciphertext. The receiver is the sole
 *      line of defense.
 *
 * The actual AEAD detection is verified in the Noise client tests
 * (Phase 4); this file confirms the relay's contribution.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startRelay, stopRelay, dial, whenOpen, makeInstance, pair,
  encodeFrame, TYPE,
} from './harness.js';
import type { RelayServer } from '../../src/server.js';

let server: RelayServer;
let port: number;
beforeAll(async () => { ({ server, port } = await startRelay()); });
afterAll(async () => { await stopRelay(server); });

describe('T02 — relay forwards bytes faithfully', () => {
  it('arbitrary inner bytes survive a phone → instance round-trip unchanged', async () => {
    const inst = makeInstance();
    const { inst: instSock, phone, sessionId } = await pair(port, inst);

    // Construct a payload with every byte value 0-255.
    const inner = new Uint8Array(256);
    for (let i = 0; i < 256; i++) inner[i] = i;

    const env = new Uint8Array(16 + 1 + 256);
    env.set(sessionId, 0);
    env[16] = 0x00;            // ignored by relay; overwritten
    env.set(inner, 17);
    phone.send(encodeFrame(TYPE.ENVELOPE, env));

    const fwd = await instSock.nextFrame();
    expect(fwd.type).toBe(TYPE.ENVELOPE);
    // session_id passes through verbatim
    expect([...fwd.payload.subarray(0, 16)]).toEqual([...sessionId]);
    // from_role is the ONLY mutation
    expect(fwd.payload[16]).toBe(0x01);
    // inner bytes byte-for-byte identical
    expect([...fwd.payload.subarray(17)]).toEqual([...inner]);

    instSock.close(); phone.close();
  });

  it('a 1 MiB inner survives unchanged', async () => {
    const inst = makeInstance();
    const { inst: instSock, phone, sessionId } = await pair(port, inst);

    // Just under the 1 MiB envelope-payload cap.
    const innerLen = 1_048_000;
    const inner = new Uint8Array(innerLen);
    // Pseudo-random pattern that's easy to detect mutations in.
    for (let i = 0; i < innerLen; i++) inner[i] = (i * 31 + 7) & 0xFF;

    const env = new Uint8Array(16 + 1 + innerLen);
    env.set(sessionId, 0);
    env[16] = 0xFF;
    env.set(inner, 17);
    phone.send(encodeFrame(TYPE.ENVELOPE, env));

    const fwd = await instSock.nextFrame(5000);
    // Spot-check first, last, and a middle byte instead of comparing arrays
    // (Vitest's deep equality on a 1 MiB array is brutally slow).
    expect(fwd.payload.length).toBe(16 + 1 + innerLen);
    expect(fwd.payload[16]).toBe(0x01);
    expect(fwd.payload[17]).toBe(inner[0]);
    expect(fwd.payload[17 + Math.floor(innerLen / 2)]).toBe(inner[Math.floor(innerLen / 2)]);
    expect(fwd.payload[17 + innerLen - 1]).toBe(inner[innerLen - 1]);

    instSock.close(); phone.close();
  });

  it('a tampered byte flows through unchanged — receiver-side AEAD is the line of defense', async () => {
    // Setup: A intercepts a phone-side envelope and flips one byte before
    // sending. The relay has no way to know — and that's correct. The
    // instance's Noise AEAD layer will reject it. This test verifies the
    // RELAY does NOT silently fix up the bytes (which would mask the
    // tampering and defeat the threat-model claim).
    const inst = makeInstance();
    const { inst: instSock, phone, sessionId } = await pair(port, inst);

    const original = new TextEncoder().encode('original-noise-ciphertext');
    const tampered = new Uint8Array(original);
    tampered[5] ^= 0xFF;            // flip one byte

    const env = new Uint8Array(16 + 1 + tampered.length);
    env.set(sessionId, 0);
    env[16] = 0x00;
    env.set(tampered, 17);
    phone.send(encodeFrame(TYPE.ENVELOPE, env));

    const fwd = await instSock.nextFrame();
    // Bytes arrive at the instance EXACTLY as the attacker sent them —
    // the relay is faithful. (The Noise responder will then fail AEAD.)
    expect([...fwd.payload.subarray(17)]).toEqual([...tampered]);
    expect(fwd.payload[5 + 17]).not.toBe(original[5]);

    instSock.close(); phone.close();
  });
});
