/**
 * checkout-qr-encoder.ts — animated-QR (fountain-coded UR) encoder for the web
 * checkout, PORTED from src/business/services/qr-transfer/encoder.ts.
 *
 * Copied — NOT imported — across the `src/business` app boundary. The WIRE
 * FORMAT must stay byte-identical to Pay's / Business's encoder so the Pay app's
 * existing `ur:fc-pay-uri/…` decoder reconstructs the URI from web-rendered
 * frames exactly as it does from a POS screen:
 *   - UR type tag `fc-pay-uri`
 *   - CBOR via bc-ur's own `cborEncode`
 *   - default 100-byte fountain chunks
 *
 * Used only for the rare big-QR case (an order envelope pushes the
 * `futurechain:pay?…` URI over SINGLE_QR_BYTE_LIMIT). The widget cycles the
 * returned frames; the customer's Pay scanner stops when its fountain decode
 * completes.
 */
import { UR, UREncoder } from '@ngraveio/bc-ur';
import { cborEncode } from '@ngraveio/bc-ur/dist/cbor';
import { Buffer } from 'buffer';

/** MUST match Pay's `UR_TYPE_PAY_URI` exactly (cross-app compatibility). */
export const UR_TYPE_PAY_URI = 'fc-pay-uri';
export const DEFAULT_CHUNK_BYTES = 100;

export interface UriEncoder {
  next(): string;
  fragmentsLength: number;
  messageLength: number;
  type: string;
}

export function createUriEncoder(payload: string, opts: { type?: string; chunkBytes?: number } = {}): UriEncoder {
  if (!payload || payload.length === 0) throw new Error('createUriEncoder: payload is empty');
  const type = opts.type ?? UR_TYPE_PAY_URI;
  const chunkBytes = Math.max(20, Math.min(500, opts.chunkBytes ?? DEFAULT_CHUNK_BYTES));
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
