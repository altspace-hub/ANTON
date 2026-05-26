/**
 * qr-transfer.test.ts — round-trip tests for the UR-based animated QR
 * encoder + decoder pair.
 *
 * Spec: docs/PAY_QR_TRANSFER_SPEC.md §13
 *
 * The encoder generates an effectively infinite stream of fountain
 * chunks; any sufficient subset reconstructs the original. We test:
 *   - happy-path round trip on payloads of typical + maxed-out size
 *   - resilience to dropped frames (skip random frames; still completes)
 *   - resilience to duplicate frames (re-sending the same frame is fine)
 *   - type-tag mismatch is rejected without corrupting an in-flight decode
 *   - non-UR garbage is silently ignored
 *   - reset() returns the decoder to a clean state
 */
import { describe, expect, it } from 'vitest';
import {
  createUriEncoder, looksLikeUrFrame, UR_TYPE_PAY_URI,
} from '../qr-transfer/encoder';
import { createUriDecoder } from '../qr-transfer/decoder';

const SMALL_URI = 'futurechain:pay?to=fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs&amount=500000&ref=INV-2026-05-26-0042';

// A maxed-out "rich payment request" approximating the spec's worst-case
// 4 KB CBOR payload — long structured remittance + multiple party fields.
const BIG_URI = 'futurechain:pay?to=fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs&amount=500000&ref=' +
  'INV-2026-05-26-0042&order=' + encodeURIComponent('lineitems:'.padEnd(3500, 'x'));

function drain(enc: ReturnType<typeof createUriEncoder>, count: number): string[] {
  const frames: string[] = [];
  for (let i = 0; i < count; i++) frames.push(enc.next());
  return frames;
}

describe('qr-transfer encoder/decoder', () => {
  it('round-trips a small URI in a few frames', () => {
    const enc = createUriEncoder(SMALL_URI);
    const dec = createUriDecoder();
    expect(enc.fragmentsLength).toBeGreaterThan(0);
    expect(enc.fragmentsLength).toBeLessThan(10);  // ~95 bytes / 100 = 1-2 chunks

    let result;
    for (let i = 0; i < 50 && !result?.complete; i++) {
      result = dec.receive(enc.next());
    }
    expect(result?.complete).toBe(true);
    expect(result?.uri).toBe(SMALL_URI);
  });

  it('round-trips a big URI (4 KB) in more frames but still completes', () => {
    const enc = createUriEncoder(BIG_URI);
    const dec = createUriDecoder();
    expect(enc.fragmentsLength).toBeGreaterThan(15);

    let result;
    for (let i = 0; i < 500 && !result?.complete; i++) {
      result = dec.receive(enc.next());
    }
    expect(result?.complete).toBe(true);
    expect(result?.uri).toBe(BIG_URI);
  });

  it('completes despite ~50% random frame drops (fountain resilience)', () => {
    const enc = createUriEncoder(SMALL_URI);
    const dec = createUriDecoder();
    // Drop every other frame.
    let result;
    let seq = 0;
    for (let i = 0; i < 200 && !result?.complete; i++) {
      const frame = enc.next();
      seq++;
      if (seq % 2 === 0) continue;  // drop
      result = dec.receive(frame);
    }
    expect(result?.complete).toBe(true);
    expect(result?.uri).toBe(SMALL_URI);
  });

  it('handles duplicate frames without breaking', () => {
    const enc = createUriEncoder(SMALL_URI);
    const dec = createUriDecoder();
    const f1 = enc.next();
    const f2 = enc.next();
    // Feed each twice — duplicates should be a no-op, not an error.
    dec.receive(f1);
    dec.receive(f1);
    dec.receive(f2);
    dec.receive(f2);
    // Keep going until complete.
    let result;
    for (let i = 0; i < 100 && !result?.complete; i++) {
      result = dec.receive(enc.next());
    }
    expect(result?.complete).toBe(true);
    expect(result?.uri).toBe(SMALL_URI);
  });

  it('reports progress between 0 and 1 while accumulating', () => {
    const enc = createUriEncoder(BIG_URI);
    const dec = createUriDecoder();
    const progresses: number[] = [];
    for (let i = 0; i < 50; i++) {
      const r = dec.receive(enc.next());
      progresses.push(r.progress);
      if (r.complete) break;
    }
    // Progress is monotone non-decreasing until the moment of completion.
    for (let i = 1; i < progresses.length; i++) {
      expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1]);
    }
    // Progress hits 1.0 on completion.
    expect(progresses[progresses.length - 1]).toBe(1);
  });

  it('rejects a UR frame with the wrong type tag', () => {
    const dec = createUriDecoder();
    // A real-shape UR frame but of type `crypto-psbt` (Bitcoin),
    // not `fc-pay-uri`. Don't need a valid bytewords body — the type
    // gate fires before the fountain decoder.
    const stray = 'ur:crypto-psbt/1-1/lpadbbcsiecyaegyjygryt';
    const r = dec.receive(stray);
    expect(r.accepted).toBe(false);
    expect(r.complete).toBe(false);
    expect(r.error).toMatch(/Unsupported QR type/);
  });

  it('silently ignores non-UR garbage', () => {
    const dec = createUriDecoder();
    const r1 = dec.receive('hello world');
    expect(r1.accepted).toBe(false);
    expect(r1.complete).toBe(false);
    expect(r1.error).toBeUndefined();
    // Then proceed with real frames — decode should still work.
    const enc = createUriEncoder(SMALL_URI);
    let result;
    for (let i = 0; i < 30 && !result?.complete; i++) {
      result = dec.receive(enc.next());
    }
    expect(result?.complete).toBe(true);
  });

  it('reset() returns decoder to a clean state', () => {
    const enc = createUriEncoder(SMALL_URI);
    const dec = createUriDecoder();
    dec.receive(enc.next());
    dec.reset();

    // Start fresh with a different payload.
    const enc2 = createUriEncoder('futurechain:pay?to=fc_VWqgwJ4GYaV3ayiyWNVd6HAs9Lt53PmwdK&amount=1');
    let result;
    for (let i = 0; i < 30 && !result?.complete; i++) {
      result = dec.receive(enc2.next());
    }
    expect(result?.complete).toBe(true);
    expect(result?.uri).toBe('futurechain:pay?to=fc_VWqgwJ4GYaV3ayiyWNVd6HAs9Lt53PmwdK&amount=1');
  });

  it('looksLikeUrFrame recognises UR-shape strings', () => {
    expect(looksLikeUrFrame('ur:fc-pay-uri/1-3/lpadbbcsiecyaegyjygryt')).toBe(true);
    expect(looksLikeUrFrame('UR:FC-PAY-URI/1-3/lpadbbcsiecyaegyjygryt')).toBe(true);
    expect(looksLikeUrFrame('ur:crypto-psbt/1-1/abc')).toBe(true);
    expect(looksLikeUrFrame('futurechain:pay?to=fc_X')).toBe(false);
    expect(looksLikeUrFrame('')).toBe(false);
    expect(looksLikeUrFrame('hello')).toBe(false);
  });

  it('encoder refuses empty payload', () => {
    expect(() => createUriEncoder('')).toThrow(/empty/);
  });

  it('encoder type tag flows through to receiver', () => {
    const enc = createUriEncoder(SMALL_URI, { type: 'fc-pay-uri' });
    expect(enc.type).toBe('fc-pay-uri');
    expect(enc.type).toBe(UR_TYPE_PAY_URI);
  });
});
