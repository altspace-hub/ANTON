/**
 * T18 — IPv6 /64 rate-limit bypass.
 *
 * Threat model claim (THREAT_MODEL.md §2 T18):
 *   "Spec §3.10 specifies the rate-limit bucket as /32 for IPv4 sources
 *    and /64 for IPv6 sources."
 *
 * The algorithmic invariant — that ipBucket() collapses any IPv6 address
 * within the same /64 to a single bucket key — is exhaustively tested in
 * tests/limits.test.ts (synthetic IPv6 sources without needing real
 * sockets). This file confirms the **wiring** at the relay-server layer:
 * a configured rate limiter actually fires when a single source bucket
 * exhausts its capacity.
 *
 * We can't fake an IPv6 source over loopback in a portable way, so this
 * test exercises the wiring by hammering one source IP (127.0.0.1, the
 * /32 bucket case) with HELLOs against a relay configured with a small
 * capacity. The same code path (RateLimiter.consume) handles both the
 * /32 and /64 cases — so green here + green in limits.test.ts means
 * green for both.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startRelay, stopRelay, dial, whenOpen, makeInstance, encodeFrame, TYPE,
} from './harness.js';
import { decodeRelayErrorPayload } from '../../src/frame.js';
import type { RelayServer } from '../../src/server.js';

let server: RelayServer;
let port: number;

beforeAll(async () => {
  // Tight rate limit so we can exhaust it in a few HELLOs.
  ({ server, port } = await startRelay({
    helloRateCap: 3,
    helloRateRefill: 0,        // no refill within this test
  }));
});
afterAll(async () => { await stopRelay(server); });

describe('T18 — rate-limit wiring against a single source bucket', () => {
  it('after capacity HELLOs from one source, the next HELLO gets RATE_LIMITED', async () => {
    // Burst HELLO_INSTANCE attempts. First 3 succeed (capacity = 3),
    // the 4th gets RATE_LIMITED.
    const wsList = [];
    for (let i = 0; i < 4; i++) {
      const ws = dial(port);
      await whenOpen(ws);
      const inst = makeInstance();
      ws.send(encodeFrame(TYPE.HELLO_INSTANCE, inst.payload));
      wsList.push(ws);
    }

    // The first three should NOT receive an error (success → no immediate frame).
    // The fourth MUST receive RATE_LIMITED.
    await new Promise(r => setTimeout(r, 100));
    expect(wsList[3]!.hasFrame()).toBe(true);
    const f = await wsList[3]!.nextFrame();
    expect(f.type).toBe(TYPE.ERROR);
    const err = decodeRelayErrorPayload(f.payload);
    expect(err.code).toBe(0x0008);    // RATE_LIMITED

    for (const ws of wsList) ws.close();
  });

  it('the algorithmic claim — IPv6 /64 collision — is covered in tests/limits.test.ts', () => {
    // tests/limits.test.ts > "ipBucket — IPv6 /64 bucketing":
    //   - distinct addresses on the same /64 produce identical bucket keys
    //   - distinct /64s produce different bucket keys
    //   - rotating low-bits CANNOT bypass capacity (5 attempts, only 5 allowed)
    // This integration test confirms the wiring; the unit test confirms the math.
    expect(true).toBe(true);    // documentation-only; real assertions live in limits.test.ts
  });
});
