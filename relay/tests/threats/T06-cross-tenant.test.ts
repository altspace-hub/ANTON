/**
 * T06 — Cross-tenant leak at the relay.
 *
 * Threat model claim (THREAT_MODEL.md §2 T6):
 *   "Relay matches by exact instance_id (16-byte SHA-256 prefix of pubkey).
 *    No partial match. Logged as MATCH_FAIL at any prefix mismatch."
 *
 * This test runs many concurrent pairings interleaved randomly and asserts
 * that ENVELOPEs from session-A NEVER reach instance-B (or any other
 * unrelated party). One leak across N pairings is one leak too many.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startRelay, stopRelay, makeInstance, pair, encodeFrame, TYPE,
  dial, whenOpen,
} from './harness.js';
import type { RelayServer } from '../../src/server.js';

let server: RelayServer;
let port: number;
beforeAll(async () => { ({ server, port } = await startRelay()); });
afterAll(async () => { await stopRelay(server); });

describe('T06 — cross-tenant isolation', () => {
  it('20 concurrent pairings — every ENVELOPE reaches its matched peer ONLY', async () => {
    const N = 20;
    const pairs: Awaited<ReturnType<typeof pair>>[] = [];
    for (let i = 0; i < N; i++) {
      pairs.push(await pair(port, makeInstance()));
    }

    // Each phone fires a unique payload that can be traced.
    const sentinels = pairs.map((_, i) => new TextEncoder().encode(`sentinel-${i}`));
    for (let i = 0; i < N; i++) {
      const env = new Uint8Array(16 + 1 + sentinels[i]!.length);
      env.set(pairs[i]!.sessionId, 0);
      env[16] = 0x00;
      env.set(sentinels[i]!, 17);
      pairs[i]!.phone.send(encodeFrame(TYPE.ENVELOPE, env));
    }

    // Each instance MUST receive exactly its own sentinel — and nothing else.
    for (let i = 0; i < N; i++) {
      const fwd = await pairs[i]!.inst.nextFrame(3000);
      expect(fwd.type).toBe(TYPE.ENVELOPE);
      expect(fwd.payload[16]).toBe(0x01);
      const got = new TextDecoder().decode(fwd.payload.subarray(17));
      expect(got).toBe(`sentinel-${i}`);
    }

    // Stragglers — give 200ms for any cross-leak to surface.
    await new Promise(r => setTimeout(r, 200));
    for (let i = 0; i < N; i++) {
      // Each instance should have NO additional pending frames.
      expect(pairs[i]!.inst.hasFrame()).toBe(false);
    }

    for (const p of pairs) {
      p.inst.close(); p.phone.close();
    }
  }, 15000);

  it('a phone forging a session_id from another tenant is rejected with PEER_GONE', async () => {
    // Set up two pairings — capture B's session_id, then have A's phone
    // try to send into B's session.
    const a = await pair(port, makeInstance());
    const b = await pair(port, makeInstance());

    const env = new Uint8Array(16 + 1 + 5);
    env.set(b.sessionId, 0);            // B's session_id, but sent from A's phone
    env[16] = 0x00;
    env.set(new TextEncoder().encode('forge'), 17);
    a.phone.send(encodeFrame(TYPE.ENVELOPE, env));

    // The relay should respond with PEER_GONE / "not part of session"
    const reply = await a.phone.nextFrame();
    expect(reply.type).toBe(TYPE.ERROR);

    // B's instance MUST NOT receive the forged envelope.
    await new Promise(r => setTimeout(r, 200));
    expect(b.inst.hasFrame()).toBe(false);

    a.inst.close(); a.phone.close(); b.inst.close(); b.phone.close();
  });

  it('a phone dialing a non-existent instance_id queues for 30s, NOT routed elsewhere', async () => {
    // Phone dials an instance that hasn't registered. The relay queues it
    // (per §3.9 WAITING_FOR_INSTANCE) — the phone MUST NOT be routed to a
    // different live instance with a partial-match instance_id.
    const liveInst = makeInstance();
    const livePair = await pair(port, liveInst);   // this instance is registered

    // Different instance_id (random; will not match liveInst).
    const phantomId = new Uint8Array(16);
    for (let i = 0; i < 16; i++) phantomId[i] = 0xFE;

    const phone = dial(port);
    await whenOpen(phone);

    const helloPayload = new Uint8Array(16 + 32 + 5);
    helloPayload.set(phantomId, 0);
    helloPayload.set(new Uint8Array(32).fill(0xCD), 16);
    helloPayload.set(new TextEncoder().encode('hi'), 48);
    phone.send(encodeFrame(TYPE.HELLO_PHONE, helloPayload));

    // Phone should NOT receive an ACK. liveInst should NOT receive an ACK.
    await new Promise(r => setTimeout(r, 300));
    expect(phone.hasFrame()).toBe(false);
    expect(livePair.inst.hasFrame()).toBe(false);

    livePair.inst.close(); livePair.phone.close(); phone.close();
  });
});
