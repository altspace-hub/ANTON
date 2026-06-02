/**
 * decoder.ts — fountain-coded UR animated QR decoder.
 *
 * Spec: docs/PAY_QR_TRANSFER_SPEC.md
 *
 * Mirror of encoder.ts. Wraps `@ngraveio/bc-ur`'s URDecoder with the
 * type-tag enforcement and progress hooks the scanner UI needs.
 *
 *   const dec = createUriDecoder();
 *   scanner.onScan(s => {
 *     const out = dec.receive(s);
 *     if (out.complete) { handlePayment(out.uri!); scanner.stop(); }
 *     else if (out.error) showError(out.error);
 *     else updateProgressUi(out.progress);
 *   });
 */
import { URDecoder } from '@ngraveio/bc-ur';
import { cborDecode } from '@ngraveio/bc-ur/dist/cbor';
import { UR_TYPE_PAY_URI, looksLikeUrFrame } from './encoder';

export interface DecodeProgress {
  /** Per-frame `receivePart` result: did the decoder accept (true) or
   *  ignore (false — duplicate / off-type / malformed) this frame? */
  accepted: boolean;
  /** True if the fountain decoder reached completion this call. */
  complete: boolean;
  /** When complete: the reconstructed URI string. */
  uri?: string;
  /** When the decoder reported an unrecoverable error (corrupt frame,
   *  type-tag mismatch, etc.). Caller should show this to the user
   *  and let them retry. */
  error?: string;
  /** 0.0 – 1.0 estimated completion. */
  progress: number;
  /** Count of unique fountain chunks received so far. */
  partsReceived: number;
  /** Total chunks the original payload was split into (learned from
   *  the first frame; 0 until then). */
  partsExpected: number;
}

export interface UriDecoder {
  /** Feed one scanned QR string. Result tells the caller whether to
   *  keep scanning or surface the completed URI. */
  receive(frame: string): DecodeProgress;
  /** Drop all received frames + start over (e.g. after a Cancel). */
  reset(): void;
  /** Snapshot of current progress without consuming a frame. */
  status(): DecodeProgress;
}

/** Build a fresh decoder. Default enforces the `fc-pay-uri` type tag —
 *  pass a different `expectedType` to interoperate with other UR
 *  streams (e.g. future `fc-pay-uri-sealed`). */
export function createUriDecoder(expectedType: string = UR_TYPE_PAY_URI): UriDecoder {
  let dec = new URDecoder();
  let errorMsg: string | undefined;
  let lastSeenType: string | undefined;

  function snapshot(accepted: boolean, complete: boolean, uri?: string): DecodeProgress {
    return {
      accepted,
      complete,
      uri,
      error: errorMsg,
      progress: dec.estimatedPercentComplete(),
      partsReceived: dec.receivedPartIndexes().length,
      partsExpected: dec.expectedPartCount(),
    };
  }

  return {
    receive(frame: string): DecodeProgress {
      // Defensive: ignore garbage that isn't UR-shaped at all. Lets
      // the caller pipe every QR scan through us without first
      // checking the shape.
      if (!looksLikeUrFrame(frame)) {
        return snapshot(false, false);
      }

      // Type-tag gate. We pull the tag from the URI prefix so we can
      // reject mismatched UR streams (e.g. someone aiming at a Bitcoin
      // PSBT) before feeding the fountain decoder, which would silently
      // accumulate frames of a stream we'll never want.
      const tagMatch = /^ur:([a-z0-9-]+)\//i.exec(frame);
      const tag = tagMatch ? tagMatch[1].toLowerCase() : '';
      if (lastSeenType && lastSeenType !== tag) {
        // Mid-decode type change — wallet was pointed at a different
        // UR stream. Don't corrupt the in-flight decode; ignore.
        return snapshot(false, false);
      }
      if (tag !== expectedType) {
        errorMsg = `Unsupported QR type: ${tag} (expected ${expectedType})`;
        return snapshot(false, false);
      }
      lastSeenType = tag;

      let accepted = false;
      try {
        accepted = dec.receivePart(frame);
      } catch (e) {
        errorMsg = `Bad QR frame: ${(e as Error).message}`;
        return snapshot(false, false);
      }
      // Surface library-side errors (e.g. checksum failure across
      // accumulated chunks) without crashing the scan loop.
      if (dec.isError()) {
        errorMsg = dec.resultError() || 'decoder reported error';
        return snapshot(false, false);
      }

      if (!dec.isComplete()) {
        return snapshot(accepted, false);
      }

      // Complete — extract the original URI.
      let uri: string;
      try {
        const ur = dec.resultUR();
        if (ur.type !== expectedType) {
          errorMsg = `Completed with wrong type: ${ur.type}`;
          return snapshot(accepted, false);
        }
        const decoded = cborDecode(ur.cbor);
        if (typeof decoded !== 'string') {
          errorMsg = `Decoded payload is ${typeof decoded}, expected string`;
          return snapshot(accepted, false);
        }
        uri = decoded;
      } catch (e) {
        errorMsg = `Failed to decode CBOR: ${(e as Error).message}`;
        return snapshot(accepted, false);
      }
      return snapshot(accepted, true, uri);
    },
    reset(): void {
      dec = new URDecoder();
      errorMsg = undefined;
      lastSeenType = undefined;
    },
    status(): DecodeProgress {
      return snapshot(false, dec.isComplete(), undefined);
    },
  };
}
