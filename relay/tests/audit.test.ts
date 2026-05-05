import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { createAuditLogger, shortId } from '../src/audit.js';

/** Capture pino output into an in-memory array of parsed JSON objects. */
function makeCapture(): { stream: Writable; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      const text = chunk.toString('utf8');
      // pino writes one JSON object per line (with trailing \n)
      for (const line of text.split('\n')) {
        if (line.trim().length === 0) continue;
        lines.push(JSON.parse(line));
      }
      cb();
    },
  });
  return { stream, lines };
}

describe('AuditLogger — basic emission', () => {
  it('writes a JSONL line per event', () => {
    const { stream, lines } = makeCapture();
    const log = createAuditLogger(stream);
    log.emit({ type: 'connect', conn_id: 'c1', source: '192.0.2.1' });
    log.emit({ type: 'disconnect', conn_id: 'c1', reason: 'normal' });
    expect(lines).toHaveLength(2);
    expect(lines[0]!.type).toBe('connect');
    expect(lines[1]!.type).toBe('disconnect');
  });

  it('includes the type, conn_id, and source', () => {
    const { stream, lines } = makeCapture();
    const log = createAuditLogger(stream);
    log.emit({ type: 'hello_instance', conn_id: 'inst-A', source: '2001:db8::/64',
               instance_id_prefix: 'aabbccdd' });
    expect(lines[0]!.type).toBe('hello_instance');
    expect(lines[0]!.conn_id).toBe('inst-A');
    expect(lines[0]!.source).toBe('2001:db8::/64');
    expect(lines[0]!.instance_id_prefix).toBe('aabbccdd');
  });

  it('tags every event with the relay component name + version', () => {
    const { stream, lines } = makeCapture();
    const log = createAuditLogger(stream);
    log.emit({ type: 'connect' });
    expect(lines[0]!.component).toBe('anton-mesh-relay');
    expect(lines[0]!.v).toBe('0.1.0');
  });
});

// ── §1.4 contract — audit log MUST NOT include payload bytes ───────

describe('AuditLogger — no-payload contract (spec §1.4)', () => {
  it('a Uint8Array passed in any field is replaced with <bytes:N>', () => {
    const { stream, lines } = makeCapture();
    const log = createAuditLogger(stream);
    // Caller bug: someone tries to log a session_id_prefix as bytes.
    // The sanitizer should refuse the raw bytes.
    log.emit({
      type: 'envelope',
      conn_id: 'c1',
      // @ts-expect-error — deliberately violating the type to test runtime guard
      session_id_prefix: new Uint8Array([1, 2, 3, 4, 5]),
    });
    expect(lines[0]!.session_id_prefix).toBe('<bytes:5>');
  });

  it('forbidden key fragments are dropped silently', () => {
    const { stream, lines } = makeCapture();
    const log = createAuditLogger(stream);
    log.emit({
      type: 'envelope',
      // @ts-expect-error — deliberately attempting a payload-shaped field
      payload: 'this should never appear',
      // @ts-expect-error — same for plaintext
      plaintext: 'nor this',
      // @ts-expect-error — same for cleartext
      cleartext: 'nor this either',
      // @ts-expect-error — and key
      key: '0xdeadbeef',
    });
    const entry = lines[0]!;
    expect(entry.payload).toBeUndefined();
    expect(entry.plaintext).toBeUndefined();
    expect(entry.cleartext).toBeUndefined();
    expect(entry.key).toBeUndefined();
    // type still present
    expect(entry.type).toBe('envelope');
  });

  it('a Buffer in any field is replaced with <bytes:N>', () => {
    const { stream, lines } = makeCapture();
    const log = createAuditLogger(stream);
    log.emit({
      type: 'envelope',
      // @ts-expect-error
      misc: Buffer.from('plaintext-bytes-here'),
    });
    expect(lines[0]!.misc).toBe('<bytes:20>');
  });

  it('logs first 8 hex chars only via shortId helper', () => {
    expect(shortId('aabbccdd11223344556677889900aabb')).toBe('aabbccdd');
    expect(shortId('aa')).toBe('aa');
  });
});
