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
import { afterEach, describe, expect, it } from 'vitest';
import {
  createUriEncoder, looksLikeUrFrame, UR_TYPE_PAY_URI,
} from '../qr-transfer/encoder';
import { createUriDecoder } from '../qr-transfer/decoder';
import {
  buildCompactReceiveUri, buildRichReceiveUri,
} from '../qr-transfer/receive-uri';
import { decodePaymentUri } from '../payment';
import type { PayerIdentity } from '../payment-identity';

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

// ── Missing-polyfill regression guard ──────────────────────────────────
//
// The original WebView bug: @ngraveio/bc-ur is authored for Node and
// reaches for the bare global `Buffer` (in cbor.js / bytewords.js /
// fountainEncoder.js / ur.js). The Pay bundle polyfills it via
// vite-plugin-node-polyfills (vite.config.pay.ts). Before that fix the
// browser had no `Buffer` global, so `createUriEncoder(...)` threw
// `ReferenceError: Buffer is not defined` synchronously and the
// AnimatedQrCode canvas stayed blank with no signal.
//
// This guard simulates the browser-without-polyfill by deleting the
// global `Buffer` and asserting the encoder still throws under it — i.e.
// the crash mode is real and observable. AnimatedQrCode now wraps the
// construction in try/catch and falls back to a static QR (A2), so this
// failure surfaces visibly instead of as a blank canvas. The guard
// fails loudly if a refactor ever makes the encoder silently swallow a
// missing Buffer (which would re-hide the blank-canvas regression).
describe('missing-polyfill regression guard', () => {
  const realBuffer = globalThis.Buffer;
  afterEach(() => {
    // Always restore so later tests (and the round-trips above) keep Buffer.
    (globalThis as { Buffer?: typeof Buffer }).Buffer = realBuffer;
  });

  it('the encoder relies on a Buffer global (deleting it breaks bc-ur)', () => {
    expect(globalThis.Buffer).toBeTypeOf('function');
    // With Buffer present, construction succeeds (the polyfilled WebView).
    expect(() => createUriEncoder(SMALL_URI)).not.toThrow();

    // Delete the global to mimic the un-polyfilled browser bundle.
    delete (globalThis as { Buffer?: typeof Buffer }).Buffer;
    // bc-ur (or our Buffer.from wrapper) now has no Buffer to reach for:
    // construction throws rather than silently producing a blank canvas.
    // AnimatedQrCode's try/catch (A2) catches exactly this and renders the
    // static fallback + an error chip.
    expect(() => createUriEncoder(SMALL_URI)).toThrow();
  });

  it('round-trips again once Buffer is restored (no global state leaked)', () => {
    // Sanity: the afterEach restore actually works, so the encoder is
    // healthy for the rest of the suite.
    const enc = createUriEncoder(SMALL_URI);
    const dec = createUriDecoder();
    let result;
    for (let i = 0; i < 50 && !result?.complete; i++) result = dec.receive(enc.next());
    expect(result?.complete).toBe(true);
    expect(result?.uri).toBe(SMALL_URI);
  });
});

// ── Rich receive URI (the value the animated QR carries) ───────────────
//
// The Receive screen feeds the *compact* URI to the static QR and the
// *rich* URI to the animated QR. The rich URI carries the receiver's
// creditor party + an order envelope — strictly more than the static
// one — and must round-trip back through decodePaymentUri so the
// sender's Pay app reconstructs the full party from an animated scan.
describe('rich receive URI', () => {
  const fullIdentity: PayerIdentity = {
    name: 'Karl Café AB',
    country: 'SE',
    city: 'Stockholm',
    street: 'Drottninggatan 1',
    postcode: '11151',
  };
  const ADDR = 'fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs';

  it('compact URI carries only the address when no amount is set', () => {
    expect(buildCompactReceiveUri(ADDR, 0n)).toBe(`futurechain:pay?to=${ADDR}`);
  });

  it('compact URI carries the amount when set', () => {
    expect(buildCompactReceiveUri(ADDR, 500_000n))
      .toBe(`futurechain:pay?to=${ADDR}&amount=500000`);
  });

  it('rich URI is null without an amount (nothing extra to carry)', () => {
    expect(buildRichReceiveUri({
      address: ADDR, amountMicroFtc: 0n, identity: fullIdentity,
    })).toBeNull();
  });

  it('rich URI is null without a payment identity (no creditor party)', () => {
    expect(buildRichReceiveUri({
      address: ADDR, amountMicroFtc: 500_000n, identity: null,
    })).toBeNull();
  });

  it('rich URI carries the creditor party + order envelope and round-trips', () => {
    const uri = buildRichReceiveUri({
      address: ADDR, amountMicroFtc: 500_000n, identity: fullIdentity, label: 'Main wallet',
    });
    expect(uri).not.toBeNull();
    // It must be strictly richer than the compact URI.
    const compact = buildCompactReceiveUri(ADDR, 500_000n);
    expect(uri!.length).toBeGreaterThan(compact.length);

    const r = decodePaymentUri(uri!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payment.toAddress).toBe(ADDR);
    expect(r.payment.amountMicroFtc).toBe(500_000n);
    // No merchant ref on a pay-to-pay receive.
    expect(r.payment.ref).toBe('');
    expect(r.payment.merchantId).toBe('');
    // The creditor party survived the round-trip.
    expect(r.payment.creditor).toEqual({
      name: 'Karl Café AB',
      country: 'SE',
      city: 'Stockholm',
      street: 'Drottninggatan 1',
      postcode: '11151',
    });
    // The order envelope decoded too.
    expect(r.payment.orderEnvelope?.v).toBe(1);
    expect(r.payment.orderEnvelope?.kind).toBe('invoice');
  });

  it('rich URI also flows through the animated encoder/decoder', () => {
    const uri = buildRichReceiveUri({
      address: ADDR, amountMicroFtc: 500_000n, identity: fullIdentity,
    })!;
    const enc = createUriEncoder(uri);
    const dec = createUriDecoder();
    let result;
    for (let i = 0; i < 200 && !result?.complete; i++) result = dec.receive(enc.next());
    expect(result?.complete).toBe(true);
    expect(result?.uri).toBe(uri);
    // And the reconstructed URI decodes to a valid payment.
    expect(decodePaymentUri(result!.uri!).ok).toBe(true);
  });
});
