import { describe, it, expect } from 'vitest';
import {
  encodeFrame,
  decodeFrame,
  encodeRelayError,
  decodeRelayErrorPayload,
  TYPE,
  WIRE_VERSION,
  MAX_PAYLOAD_BYTES,
  FrameError,
  FrameErrorCode,
} from '../src/frame.js';

describe('frame codec — happy path', () => {
  it('round-trips an empty payload', () => {
    const enc = encodeFrame(TYPE.PING, new Uint8Array(0));
    expect(enc).toHaveLength(5);
    expect(enc[0]).toBe(WIRE_VERSION);
    expect(enc[1]).toBe(TYPE.PING);
    expect(enc[2]).toBe(0);
    expect(enc[3]).toBe(0);
    expect(enc[4]).toBe(0);
    const dec = decodeFrame(enc);
    expect(dec.type).toBe(TYPE.PING);
    expect(dec.payload).toHaveLength(0);
  });

  it('round-trips a small payload', () => {
    const payload = new TextEncoder().encode('hello');
    const enc = encodeFrame(TYPE.ENVELOPE, payload);
    expect(enc).toHaveLength(5 + 5);
    expect(enc[2]).toBe(0);
    expect(enc[3]).toBe(0);
    expect(enc[4]).toBe(5);
    const dec = decodeFrame(enc);
    expect(dec.type).toBe(TYPE.ENVELOPE);
    expect(new TextDecoder().decode(dec.payload)).toBe('hello');
  });

  it('round-trips a payload that spans all three u24 bytes', () => {
    // 70_000 = 0x011170 — exercises the high byte of u24.
    const payload = new Uint8Array(70_000).fill(0xAB);
    const enc = encodeFrame(TYPE.ENVELOPE, payload);
    expect(enc[2]).toBe(0x01);
    expect(enc[3]).toBe(0x11);
    expect(enc[4]).toBe(0x70);
    const dec = decodeFrame(enc);
    expect(dec.payload).toHaveLength(70_000);
    expect(dec.payload[0]).toBe(0xAB);
    expect(dec.payload[69_999]).toBe(0xAB);
  });

  it('returns a copy of the payload — caller mutation cannot corrupt source', () => {
    const original = new Uint8Array([1, 2, 3, 4]);
    const enc = encodeFrame(TYPE.HELLO_PHONE, original);
    const dec = decodeFrame(enc);
    dec.payload[0] = 99;
    // Source buffer for the encoded frame is still intact at offset 5.
    expect(enc[5]).toBe(1);
  });
});

describe('frame codec — limits', () => {
  it('accepts the maximum legal payload (1 MiB)', () => {
    const payload = new Uint8Array(MAX_PAYLOAD_BYTES);
    const enc = encodeFrame(TYPE.ENVELOPE, payload);
    expect(enc).toHaveLength(5 + MAX_PAYLOAD_BYTES);
    const dec = decodeFrame(enc);
    expect(dec.payload).toHaveLength(MAX_PAYLOAD_BYTES);
  });

  it('rejects encoding a payload exceeding 1 MiB', () => {
    const payload = new Uint8Array(MAX_PAYLOAD_BYTES + 1);
    expect(() => encodeFrame(TYPE.ENVELOPE, payload)).toThrowError(FrameError);
    try {
      encodeFrame(TYPE.ENVELOPE, payload);
    } catch (e) {
      expect((e as FrameError).code).toBe(FrameErrorCode.MSG_TOO_LARGE);
    }
  });
});

describe('frame codec — malformed input rejection', () => {
  it('rejects a buffer shorter than the 5-byte header', () => {
    expect(() => decodeFrame(new Uint8Array(4))).toThrowError(FrameError);
    try {
      decodeFrame(new Uint8Array(3));
    } catch (e) {
      expect((e as FrameError).code).toBe(FrameErrorCode.TRUNCATED);
    }
  });

  it('rejects a frame with the wrong version byte', () => {
    const buf = new Uint8Array([0x02, TYPE.PING, 0, 0, 0]);
    expect(() => decodeFrame(buf)).toThrowError(FrameError);
    try {
      decodeFrame(buf);
    } catch (e) {
      expect((e as FrameError).code).toBe(FrameErrorCode.BAD_VERSION);
    }
  });

  it('rejects a frame whose declared length disagrees with buffer length', () => {
    // Header says 10 bytes of payload, buffer has 5.
    const buf = new Uint8Array([WIRE_VERSION, TYPE.ENVELOPE, 0, 0, 10, 1, 2, 3, 4, 5]);
    expect(() => decodeFrame(buf)).toThrowError(FrameError);
    try {
      decodeFrame(buf);
    } catch (e) {
      expect((e as FrameError).code).toBe(FrameErrorCode.LENGTH_MISMATCH);
    }
  });

  it('rejects a frame whose declared length exceeds MAX_PAYLOAD_BYTES (DoS guard)', () => {
    // Declared 16 MiB - 1, far above the 1 MiB cap.
    const buf = new Uint8Array(5);
    buf[0] = WIRE_VERSION;
    buf[1] = TYPE.ENVELOPE;
    buf[2] = 0xFF;
    buf[3] = 0xFF;
    buf[4] = 0xFF;
    try {
      decodeFrame(buf);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as FrameError).code).toBe(FrameErrorCode.MSG_TOO_LARGE);
    }
  });

  it('rejects encoding with an out-of-range type byte', () => {
    expect(() => encodeFrame(-1, new Uint8Array(0))).toThrowError(FrameError);
    expect(() => encodeFrame(256, new Uint8Array(0))).toThrowError(FrameError);
    expect(() => encodeFrame(1.5, new Uint8Array(0))).toThrowError(FrameError);
  });
});

describe('relay-layer ERROR frame (§6.5)', () => {
  it('round-trips an error code with empty message', () => {
    const enc = encodeRelayError(0x0004 /* NO_MATCH */, '');
    const dec = decodeFrame(enc);
    expect(dec.type).toBe(TYPE.ERROR);
    const err = decodeRelayErrorPayload(dec.payload);
    expect(err.code).toBe(0x0004);
    expect(err.message).toBe('');
  });

  it('round-trips an error code with a UTF-8 message', () => {
    const enc = encodeRelayError(0x0001 /* BAD_VERSION */, 'expected v1, got v2 — refusing');
    const dec = decodeFrame(enc);
    const err = decodeRelayErrorPayload(dec.payload);
    expect(err.code).toBe(0x0001);
    expect(err.message).toBe('expected v1, got v2 — refusing');
  });

  it('rejects an error message longer than 256 bytes', () => {
    const longMsg = 'x'.repeat(257);
    expect(() => encodeRelayError(0x0001, longMsg)).toThrowError(FrameError);
  });

  it('rejects a malformed error payload (length mismatch)', () => {
    // Claims 10 bytes of message but only has 3.
    const payload = new Uint8Array([0x00, 0x01, 0x00, 0x0A, 0x61, 0x62, 0x63]);
    expect(() => decodeRelayErrorPayload(payload)).toThrowError(FrameError);
  });

  it('rejects a truncated error payload', () => {
    expect(() => decodeRelayErrorPayload(new Uint8Array(2))).toThrowError(FrameError);
  });
});
