/**
 * fuzz.test.ts — adversarial fuzz of every parser the relay exposes.
 *
 * For each parser, we generate thousands of random byte sequences and
 * verify the parser EITHER returns a value cleanly OR throws a typed
 * error (FrameError, HelloVerificationError, RpcParseError-equivalent).
 * It MUST NEVER:
 *   - throw an uncaught TypeError, RangeError, or generic Error
 *   - hang / infinite-loop
 *   - return malformed output that downstream code crashes on
 *
 * If this suite ever surfaces a crash that wasn't caught by the
 * existing unit tests, that's a parser bug — fix the parser, then add
 * a focused regression test in the relevant *.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decodeFrame, decodeRelayErrorPayload, FrameError } from '../src/frame.js';
import {
  parseHelloInstance,
  parseHelloPhone,
  HelloVerificationError,
} from '../src/hello.js';

const ITERATIONS_FAST = 5000;     // fast path — runs on every test
const ITERATIONS_SLOW = 30000;    // longer fuzz for `RUN_LONG_FUZZ=1`

const RUN_LONG = process.env.RUN_LONG_FUZZ === '1';
const N = RUN_LONG ? ITERATIONS_SLOW : ITERATIONS_FAST;

// Helpers ─────────────────────────────────────────────────────────────

function randomBuf(maxLen = 2048): Uint8Array {
  const len = Math.floor(Math.random() * maxLen);
  return new Uint8Array(randomBytes(len));
}

/** Random buffer biased toward "looks plausible" — version byte 0x01,
 *  random type, declared length matching actual length. Catches parsers
 *  that succeed on garbage. */
function plausibleFrame(maxLen = 1024): Uint8Array {
  const payloadLen = Math.floor(Math.random() * maxLen);
  const out = new Uint8Array(5 + payloadLen);
  out[0] = 0x01;                                  // version
  out[1] = Math.floor(Math.random() * 256);       // any type byte
  out[2] = (payloadLen >>> 16) & 0xFF;
  out[3] = (payloadLen >>> 8) & 0xFF;
  out[4] = payloadLen & 0xFF;
  randomBytes(payloadLen).copy(Buffer.from(out.buffer, 5, payloadLen));
  return out;
}

// Allowed-throw guard: returns true iff `e` is one of the typed errors
// the parser is documented to throw.
function isExpectedError(e: unknown): boolean {
  return e instanceof FrameError || e instanceof HelloVerificationError;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('frame codec — adversarial fuzz', () => {
  it(`decodeFrame survives ${N} random byte sequences without uncaught throws`, () => {
    let parsed = 0;
    let typedErrors = 0;
    for (let i = 0; i < N; i++) {
      const buf = randomBuf(2048);
      try {
        decodeFrame(buf);
        parsed++;
      } catch (e) {
        if (!isExpectedError(e)) {
          throw new Error(`unexpected throw on input ${[...buf.subarray(0, 8)].map(b => b.toString(16)).join(' ')}: ${(e as Error).message} [${(e as Error).constructor.name}]`);
        }
        typedErrors++;
      }
    }
    // Sanity: most random buffers should fail to parse — if everything
    // somehow parses, the fuzz is broken (e.g. the parser became too
    // permissive).
    expect(parsed + typedErrors).toBe(N);
    expect(typedErrors).toBeGreaterThan(N * 0.9);
  });

  it(`decodeFrame survives ${N} plausible-shaped frames without uncaught throws`, () => {
    for (let i = 0; i < N; i++) {
      const buf = plausibleFrame(2048);
      try {
        decodeFrame(buf);
      } catch (e) {
        if (!isExpectedError(e)) {
          throw new Error(`unexpected throw: ${(e as Error).message}`);
        }
      }
    }
  });

  it('decodeRelayErrorPayload survives random inputs', () => {
    for (let i = 0; i < N; i++) {
      const buf = randomBuf(512);
      try {
        decodeRelayErrorPayload(buf);
      } catch (e) {
        if (!isExpectedError(e)) {
          throw new Error(`unexpected throw: ${(e as Error).message}`);
        }
      }
    }
  });
});

describe('HELLO parsers — adversarial fuzz', () => {
  it(`parseHelloInstance survives ${N} random inputs`, () => {
    for (let i = 0; i < N; i++) {
      const buf = randomBuf(4096);
      try {
        parseHelloInstance(buf);
      } catch (e) {
        if (!isExpectedError(e)) {
          throw new Error(`unexpected throw: ${(e as Error).message} [${(e as Error).constructor.name}]`);
        }
      }
    }
  });

  it(`parseHelloPhone survives ${N} random inputs`, () => {
    for (let i = 0; i < N; i++) {
      const buf = randomBuf(4096);
      try {
        parseHelloPhone(buf);
      } catch (e) {
        if (!isExpectedError(e)) {
          throw new Error(`unexpected throw: ${(e as Error).message} [${(e as Error).constructor.name}]`);
        }
      }
    }
  });

  it('parseHelloInstance with deliberately-crafted boundary inputs', () => {
    // Generate inputs that exercise the parser's length-field arithmetic
    // at the edges — the place where buffer-overrun bugs typically live.
    const cases: Uint8Array[] = [];
    cases.push(new Uint8Array(0));                                 // empty
    cases.push(new Uint8Array(1));                                 // 1 byte
    cases.push(new Uint8Array(217));                               // min - 1
    cases.push(new Uint8Array(218));                               // min exactly
    // Header with relay_url_len claiming 65535 but no body.
    const overflow = new Uint8Array(218);
    overflow[16 + 32 + 32 + 64] = 0xFF;
    overflow[16 + 32 + 32 + 64 + 1] = 0xFF;
    cases.push(overflow);
    // Bytes that look like a HELLO_INSTANCE but with negative/garbage offsets.
    for (let len = 200; len < 250; len++) cases.push(new Uint8Array(len));

    for (const buf of cases) {
      try {
        parseHelloInstance(buf);
      } catch (e) {
        if (!isExpectedError(e)) {
          throw new Error(`unexpected throw at len=${buf.length}: ${(e as Error).message} [${(e as Error).constructor.name}]`);
        }
      }
    }
  });
});

describe('fuzz — combined parsers', () => {
  it(`every parser handles ${N} shared random inputs symmetrically`, () => {
    // Same input run through each parser. None should throw an unexpected
    // error type.
    for (let i = 0; i < N; i++) {
      const buf = randomBuf(2048);
      const parsers: ((b: Uint8Array) => unknown)[] = [
        decodeFrame, decodeRelayErrorPayload, parseHelloInstance, parseHelloPhone,
      ];
      for (const p of parsers) {
        try { p(buf); } catch (e) {
          if (!isExpectedError(e)) {
            throw new Error(`${p.name} unexpected throw: ${(e as Error).message} [${(e as Error).constructor.name}]`);
          }
        }
      }
    }
  });
});
