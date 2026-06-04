/**
 * file-attachment.test.ts — #91 generic file attachment: the 'file' wire kind
 * round-trips through parseWirePayload, and the relay size cap gates files the
 * same way it gates video.
 */
import { describe, it, expect } from 'vitest';
import { parseWirePayload, UNSUPPORTED_WIRE_PLACEHOLDER, type MediaPayload } from '../services/chat';
import { isWithinRelayCap, type Capture } from '../services/capture';
import { sanitizeFilename, base64ToBytes } from '../services/file-open';

describe('file wire payload', () => {
  it('parses a file wire into the file kind, preserving the payload + messageId', () => {
    const data: MediaPayload = { data: 'AAAA', mimeType: 'application/pdf', filename: 'report.pdf', size: 1024 };
    const wire = parseWirePayload(JSON.stringify({ kind: 'file', messageId: 'm1', data }));
    expect(wire.kind).toBe('file');
    if (wire.kind !== 'file') throw new Error('not a file wire');
    expect(wire.messageId).toBe('m1');
    expect(wire.data.filename).toBe('report.pdf');
    expect(wire.data.mimeType).toBe('application/pdf');
  });

  it('a malformed file wire (no data) falls back to text, not a throw', () => {
    const wire = parseWirePayload(JSON.stringify({ kind: 'file', messageId: 'm2' }));
    expect(wire.kind).toBe('text');
  });

  it('a TAGGED but unknown wire kind degrades to a placeholder, NOT the raw JSON', () => {
    // The bug: an old build receiving a newer wire kind dumped the whole wire
    // JSON as a text bubble. Now any tagged-but-unrenderable wire shows the
    // placeholder instead.
    const raw = JSON.stringify({ kind: 'some_future_kind', messageId: 'm3', data: { x: 1 } });
    const wire = parseWirePayload(raw);
    expect(wire.kind).toBe('text');
    if (wire.kind !== 'text') throw new Error('not text');
    expect(wire.text).toBe(UNSUPPORTED_WIRE_PLACEHOLDER);
    expect(wire.text).not.toContain('some_future_kind'); // never the raw JSON
  });

  it('untagged legacy plain text still passes through verbatim', () => {
    const wire = parseWirePayload('just a plain message');
    expect(wire.kind).toBe('text');
    if (wire.kind !== 'text') throw new Error('not text');
    expect(wire.text).toBe('just a plain message');
  });
});

describe('isWithinRelayCap for files', () => {
  const fileCap = (size: number): Capture =>
    ({ kind: 'file', mediaType: 'file', data: '', mimeType: 'application/pdf', filename: 'x', size } as Capture);

  it('accepts a file under the ~700 KB usable ceiling', () => {
    expect(isWithinRelayCap(fileCap(500_000))).toBe(true); // 500k × 1.4 = 700k ≤ 1M
  });

  it('rejects a file over the ceiling', () => {
    expect(isWithinRelayCap(fileCap(900_000))).toBe(false); // 900k × 1.4 = 1.26M > 1M
  });

  it('boundary: ~714 KB is the cutoff', () => {
    expect(isWithinRelayCap(fileCap(714_000))).toBe(true);  // ×1.4 = 999,600 ≤ 1M
    expect(isWithinRelayCap(fileCap(715_000))).toBe(false); // ×1.4 = 1,001,000 > 1M
  });
});

describe('sanitizeFilename (path-traversal prevention)', () => {
  it('strips path separators', () => {
    expect(sanitizeFilename('a/b\\c')).toBe('a_b_c');
  });
  it('strips leading dots so it cannot escape the cache dir', () => {
    expect(sanitizeFilename('../../x')).toBe('_.._x'); // no leading '..'
  });
  it('falls back to "file" when the name reduces to empty', () => {
    expect(sanitizeFilename('....')).toBe('file');
    expect(sanitizeFilename('')).toBe('file');
  });
  it('strips control chars', () => {
    expect(sanitizeFilename('a\x00\x1fb')).toBe('a__b');
  });
});

describe('base64ToBytes', () => {
  it('decodes to binary bytes (not UTF-8)', () => {
    expect(Array.from(base64ToBytes('AAEC'))).toEqual([0, 1, 2]);
  });
});
