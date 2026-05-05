/**
 * frame.ts — Wire-frame codec for ANTON Mesh v0.1, per spec §2.
 *
 * Frame layout:
 *   [0]      version: u8 = 0x01
 *   [1]      type: u8           (relay-layer code from §3.1)
 *   [2..5)   payload_length: u24 BE
 *   [5..)    payload: bytes
 *
 * Constants and limits follow the spec exactly. Receivers MUST close on:
 *   - version mismatch (BAD_VERSION)
 *   - frame size > MAX_WS_MESSAGE_SIZE (MSG_TOO_LARGE)
 *   - any parse failure that would consume bytes past the buffer end
 *
 * This module is the single source of truth for wire framing across the
 * relay process; the WS server, the test harness, and the threat tests
 * all parse and emit through here.
 */

/** Spec §1.6 — current wire version. */
export const WIRE_VERSION = 0x01;

/** Spec §3.1 — relay-layer message types. */
export const TYPE = {
  HELLO_INSTANCE: 0x01,
  HELLO_PHONE:    0x02,
  ACK_INSTANCE:   0x03,
  ACK_PHONE:      0x04,
  PING:           0x05,
  PONG:           0x06,
  ERROR:          0x0F,
  ENVELOPE:       0x10,
} as const;

export type FrameType = typeof TYPE[keyof typeof TYPE];

/** Spec §2.2 — max payload bytes. 1 MiB. */
export const MAX_PAYLOAD_BYTES = 1_048_576;

/** Spec §2.2 — max WS message size (header + payload). Configure ws library with this. */
export const MAX_WS_MESSAGE_SIZE = 5 + MAX_PAYLOAD_BYTES;

/** Spec §6.2 — relay-control error codes (used here for FrameError). */
export enum FrameErrorCode {
  BAD_VERSION = 'BAD_VERSION',
  MSG_TOO_LARGE = 'MSG_TOO_LARGE',
  TRUNCATED = 'TRUNCATED',
  LENGTH_MISMATCH = 'LENGTH_MISMATCH',
  RESERVED_TYPE = 'RESERVED_TYPE',
}

export class FrameError extends Error {
  constructor(public readonly code: FrameErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'FrameError';
  }
}

export interface DecodedFrame {
  type: number;       // raw byte; caller decides which TYPE.* values it accepts
  payload: Uint8Array;
}

/**
 * Encode a frame. Throws FrameError if `payload` exceeds MAX_PAYLOAD_BYTES.
 * Returned buffer is exactly `5 + payload.length` bytes.
 */
export function encodeFrame(type: number, payload: Uint8Array): Uint8Array {
  if (!Number.isInteger(type) || type < 0 || type > 0xFF) {
    throw new FrameError(FrameErrorCode.RESERVED_TYPE, `type out of range: ${type}`);
  }
  if (payload.length > MAX_PAYLOAD_BYTES) {
    throw new FrameError(
      FrameErrorCode.MSG_TOO_LARGE,
      `payload ${payload.length} > MAX_PAYLOAD_BYTES ${MAX_PAYLOAD_BYTES}`,
    );
  }
  const out = new Uint8Array(5 + payload.length);
  out[0] = WIRE_VERSION;
  out[1] = type;
  // u24 BE — payload_length
  out[2] = (payload.length >>> 16) & 0xFF;
  out[3] = (payload.length >>> 8) & 0xFF;
  out[4] = payload.length & 0xFF;
  out.set(payload, 5);
  return out;
}

/**
 * Decode a frame. Buffer MUST be exactly one frame (no leftover bytes,
 * no partial frame). WebSocket already gives us one frame per message,
 * so this is the contract.
 *
 * Throws FrameError on:
 *   - buffer shorter than 5-byte header
 *   - version byte != WIRE_VERSION
 *   - declared payload_length doesn't match remaining buffer length
 *   - payload exceeds MAX_PAYLOAD_BYTES
 */
export function decodeFrame(buf: Uint8Array): DecodedFrame {
  if (buf.length < 5) {
    throw new FrameError(FrameErrorCode.TRUNCATED, `frame ${buf.length} bytes < 5-byte header`);
  }
  const version = buf[0]!;
  if (version !== WIRE_VERSION) {
    throw new FrameError(FrameErrorCode.BAD_VERSION, `got 0x${version.toString(16)}, expected 0x01`);
  }
  const type = buf[1]!;
  const declaredLen = (buf[2]! << 16) | (buf[3]! << 8) | buf[4]!;
  if (declaredLen > MAX_PAYLOAD_BYTES) {
    throw new FrameError(
      FrameErrorCode.MSG_TOO_LARGE,
      `declared ${declaredLen} > MAX_PAYLOAD_BYTES ${MAX_PAYLOAD_BYTES}`,
    );
  }
  const actualPayloadLen = buf.length - 5;
  if (declaredLen !== actualPayloadLen) {
    throw new FrameError(
      FrameErrorCode.LENGTH_MISMATCH,
      `header says ${declaredLen}, buffer has ${actualPayloadLen}`,
    );
  }
  // Slice — Uint8Array.slice copies; this prevents downstream mutation
  // of the buffer from corrupting the WS receive buffer if it's pooled.
  const payload = buf.slice(5);
  return { type, payload };
}

/**
 * Convenience: encode a relay-layer ERROR frame (type=0x0F) per §6.5.
 * Layout inside payload:
 *   [ code: u16 BE ] [ message_len: u16 BE ] [ message: bytes ]
 */
export function encodeRelayError(code: number, message = ''): Uint8Array {
  const msgBytes = new TextEncoder().encode(message);
  if (msgBytes.length > 256) {
    throw new FrameError(
      FrameErrorCode.MSG_TOO_LARGE,
      `error message ${msgBytes.length} bytes > 256`,
    );
  }
  const payload = new Uint8Array(4 + msgBytes.length);
  payload[0] = (code >>> 8) & 0xFF;
  payload[1] = code & 0xFF;
  payload[2] = (msgBytes.length >>> 8) & 0xFF;
  payload[3] = msgBytes.length & 0xFF;
  payload.set(msgBytes, 4);
  return encodeFrame(TYPE.ERROR, payload);
}

export interface DecodedRelayError {
  code: number;
  message: string;
}

/** Decode a relay-layer ERROR payload (NOT the full frame — just the payload bytes). */
export function decodeRelayErrorPayload(payload: Uint8Array): DecodedRelayError {
  if (payload.length < 4) {
    throw new FrameError(FrameErrorCode.TRUNCATED, `error payload ${payload.length} < 4`);
  }
  const code = (payload[0]! << 8) | payload[1]!;
  const msgLen = (payload[2]! << 8) | payload[3]!;
  if (4 + msgLen !== payload.length) {
    throw new FrameError(
      FrameErrorCode.LENGTH_MISMATCH,
      `error msg_len header says ${msgLen}, payload has ${payload.length - 4}`,
    );
  }
  const message = new TextDecoder('utf-8', { fatal: false }).decode(payload.subarray(4));
  return { code, message };
}
