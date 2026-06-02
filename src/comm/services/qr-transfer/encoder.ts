/**
 * encoder.ts — fountain-coded UR animated QR encoder.
 *
 * Spec: docs/PAY_QR_TRANSFER_SPEC.md
 *
 * Wraps a string payload (typically a `futurechain:pay?…` URI but
 * could be any UTF-8 text) into a UR (Uniform Resources) fountain
 * stream that can be rendered as an animated QR.
 *
 *   const enc = createUriEncoder(uri);
 *   setInterval(() => render(enc.next()), 200);  // 5 fps
 *
 * The fountain code generates an effectively infinite stream of
 * combined-chunk frames; any sufficient subset (slightly more than
 * the original chunk count) reconstructs the payload. So the caller
 * loops `next()` indefinitely — the receiver stops scanning when its
 * decoder reports complete.
 *
 * Defaults match `PAY_QR_TRANSFER_SPEC.md` §15:
 *   - type tag: `fc-pay-uri` (so a stray Bitcoin PSBT can't be
 *     mis-decoded as a payment)
 *   - chunk size: 100 bytes (mid-point between scan-comfort and
 *     frame-count)
 *
 * The caller is responsible for the render loop + frame rate; the
 * encoder is a pure pull source (`next()`) with no timing of its own.
 */
import { UR, UREncoder } from '@ngraveio/bc-ur';
import { cborEncode } from '@ngraveio/bc-ur/dist/cbor';
import { Buffer } from 'buffer';

/** UR type tag — namespaces our payload so a decoder that doesn't
 *  know `fc-pay-uri` refuses it. Phase 2 (encrypted) will use a
 *  separate tag (e.g. `fc-pay-uri-sealed`). */
export const UR_TYPE_PAY_URI = 'fc-pay-uri';

/** Default fountain-chunk size in bytes. Smaller = more frames + each
 *  QR is smaller (easier to scan). Larger = fewer frames but each QR
 *  is denser (harder to scan at distance). 100 is the spec default. */
export const DEFAULT_CHUNK_BYTES = 100;

export interface UriEncoder {
  /** Returns the next UR frame string (e.g. `ur:fc-pay-uri/7-12/…`).
   *  Call as often as the render loop needs — safe to call forever. */
  next(): string;
  /** How many original chunks the payload was split into. The receiver
   *  needs ~this many unique frames to complete the decode. */
  fragmentsLength: number;
  /** Size of the CBOR-encoded payload (informational; used by the
   *  sender UI to display "12 chunks · 1.2 KB"). */
  messageLength: number;
  /** UR type tag this encoder uses. */
  type: string;
}

export interface CreateUriEncoderOpts {
  /** Override the UR type tag. Defaults to `fc-pay-uri`. */
  type?: string;
  /** Override the per-fragment byte budget. Defaults to 100. */
  chunkBytes?: number;
}

/** Build an animated-QR encoder for a string payload (typically a
 *  `futurechain:pay?…` URI).
 *
 *  Payload is first CBOR-encoded (compact + standard) then wrapped in
 *  a UR with our custom type tag. The resulting fountain stream is
 *  the caller's QR frame source.
 *
 *  Throws if `payload` is empty. Empty payloads don't fountain-code
 *  meaningfully and are almost certainly a caller bug. */
export function createUriEncoder(
  payload: string,
  opts: CreateUriEncoderOpts = {},
): UriEncoder {
  if (!payload || payload.length === 0) {
    throw new Error('createUriEncoder: payload is empty');
  }
  const type = opts.type ?? UR_TYPE_PAY_URI;
  const chunkBytes = Math.max(20, Math.min(500, opts.chunkBytes ?? DEFAULT_CHUNK_BYTES));

  // CBOR-encode the URI string. Using bc-ur's own cborEncode keeps us
  // on the same code path the URDecoder expects — UR's `decodeCBOR()`
  // is what the receiver calls, so symmetry matters.
  const cbor = Buffer.from(cborEncode(payload));
  const ur = new UR(cbor, type);
  const enc = new UREncoder(ur, chunkBytes, 0);

  return {
    next: () => enc.nextPart(),
    fragmentsLength: enc.fragmentsLength,
    messageLength: enc.messageLength,
    type,
  };
}

/** Light-weight check: is a given QR scan result a UR frame?
 *  Used by the scanner to decide between `decodePaymentUri` (existing
 *  `futurechain:pay?…` shape) and `createUriDecoder` (this module's
 *  animated stream). Case-insensitive per the UR spec.
 */
export function looksLikeUrFrame(s: string): boolean {
  return /^ur:[a-z0-9-]+\//i.test(s);
}
