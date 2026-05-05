/**
 * T16 — Relay misrouting delivers ENVELOPE to wrong leg.
 *
 * Threat model claim (THREAT_MODEL.md §2 T16):
 *   "Spec §3.6 adds a relay-set from_role byte (0x01 phone / 0x02 instance)
 *    inside ENVELOPE. Receiver MUST check it equals the *opposite* of its
 *    own role, drops the frame and ends the session before invoking AEAD."
 *
 * The relay's contribution: it MUST set from_role itself, ignoring whatever
 * the client put in the inbound byte. This protects clients from a relay-
 * side bug where a misrouted frame would otherwise consume Noise counters
 * trying to decrypt with the wrong direction's key.
 *
 * Tested invariants:
 *   1. The relay overrides whatever from_role the inbound frame carried.
 *   2. Phone → instance: outbound from_role is exactly 0x01.
 *   3. Instance → phone: outbound from_role is exactly 0x02.
 *   4. A non-member phone trying to forge into a foreign session_id
 *      gets PEER_GONE (relay's match-table lookup catches the impostor
 *      before any from_role assignment).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startRelay, stopRelay, makeInstance, pair, encodeFrame, TYPE,
} from './harness.js';
import type { RelayServer } from '../../src/server.js';

let server: RelayServer;
let port: number;
beforeAll(async () => { ({ server, port } = await startRelay()); });
afterAll(async () => { await stopRelay(server); });

describe('T16 — relay-set direction tag (§3.6)', () => {
  it('phone-supplied from_role byte is overwritten on phone → instance', async () => {
    const inst = makeInstance();
    const { inst: instSock, phone, sessionId } = await pair(port, inst);

    // Try every byte value the attacker might inject.
    for (const bogus of [0x00, 0x02, 0x42, 0x77, 0xCC, 0xFF]) {
      const env = new Uint8Array(16 + 1 + 5);
      env.set(sessionId, 0);
      env[16] = bogus;
      env.set(new TextEncoder().encode('hello'), 17);
      phone.send(encodeFrame(TYPE.ENVELOPE, env));
      const fwd = await instSock.nextFrame();
      // Relay MUST set from_role = PHONE (0x01) regardless of what the phone tried.
      expect(fwd.payload[16]).toBe(0x01);
    }

    instSock.close(); phone.close();
  });

  it('instance-supplied from_role byte is overwritten on instance → phone', async () => {
    const inst = makeInstance();
    const { inst: instSock, phone, sessionId } = await pair(port, inst);

    for (const bogus of [0x00, 0x01, 0x55, 0x77, 0xFF]) {
      const env = new Uint8Array(16 + 1 + 5);
      env.set(sessionId, 0);
      env[16] = bogus;
      env.set(new TextEncoder().encode('reply'), 17);
      instSock.send(encodeFrame(TYPE.ENVELOPE, env));
      const fwd = await phone.nextFrame();
      // Relay MUST set from_role = INSTANCE (0x02) regardless of input.
      expect(fwd.payload[16]).toBe(0x02);
    }

    instSock.close(); phone.close();
  });

  it('a phone forging into a foreign session_id gets PEER_GONE — never delivered to that session\'s instance', async () => {
    // Two pairings; A's phone tries to forge into B's session_id.
    const a = await pair(port, makeInstance());
    const b = await pair(port, makeInstance());

    const env = new Uint8Array(16 + 1 + 4);
    env.set(b.sessionId, 0);
    env[16] = 0x01;          // even with the "right" from_role, the relay rejects
    env.set(new TextEncoder().encode('FORG'), 17);
    a.phone.send(encodeFrame(TYPE.ENVELOPE, env));

    const reply = await a.phone.nextFrame();
    expect(reply.type).toBe(TYPE.ERROR);

    // B's instance should receive nothing — wait for any leak.
    await new Promise(r => setTimeout(r, 200));
    expect(b.inst.hasFrame()).toBe(false);

    a.inst.close(); a.phone.close(); b.inst.close(); b.phone.close();
  });

  it('an envelope with a non-existent session_id returns PEER_GONE without affecting any live session', async () => {
    const live = await pair(port, makeInstance());
    const fakeSession = new Uint8Array(16).fill(0xEE);

    const env = new Uint8Array(16 + 1 + 3);
    env.set(fakeSession, 0);
    env[16] = 0x01;
    env.set(new TextEncoder().encode('XYZ'), 17);
    live.phone.send(encodeFrame(TYPE.ENVELOPE, env));

    const reply = await live.phone.nextFrame();
    expect(reply.type).toBe(TYPE.ERROR);

    // Live instance unaffected
    await new Promise(r => setTimeout(r, 200));
    expect(live.inst.hasFrame()).toBe(false);

    live.inst.close(); live.phone.close();
  });
});
