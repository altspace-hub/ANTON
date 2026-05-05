import { describe, it, expect } from 'vitest';
import {
  encodeRpc,
  decodeRpc,
  RPC_KIND,
  RpcEncodeError,
  RpcParseError,
  MAX_BODY,
  type RpcRequest,
  type RpcResponse,
  type RpcError,
  type RpcCancel,
} from '../../server/services/mesh/rpc.js';

describe('RPC codec — request frame', () => {
  it('round-trips a minimal POST', () => {
    const req: RpcRequest = {
      kind: RPC_KIND.REQUEST,
      seq: 1,
      method: 'POST',
      path: '/api/app/org/abc/query-sync',
      headers: [{ name: 'content-type', value: 'application/json' }],
      body: new TextEncoder().encode('{"message":"hi"}'),
    };
    const encoded = encodeRpc(req);
    const decoded = decodeRpc(encoded);
    expect(decoded).toEqual(req);
  });

  it('round-trips a GET with no body and no headers', () => {
    const req: RpcRequest = {
      kind: RPC_KIND.REQUEST,
      seq: 42,
      method: 'GET',
      path: '/api/app/profile',
      headers: [],
      body: new Uint8Array(0),
    };
    const encoded = encodeRpc(req);
    const decoded = decodeRpc(encoded);
    expect(decoded).toEqual(req);
  });

  it('preserves header order and values byte-for-byte', () => {
    const req: RpcRequest = {
      kind: RPC_KIND.REQUEST,
      seq: 5,
      method: 'POST',
      path: '/api/app/x',
      headers: [
        { name: 'authorization', value: 'Bearer abcdef' },
        { name: 'x-app-session', value: 'session-token-here' },
        { name: 'content-type', value: 'application/json' },
      ],
      body: new Uint8Array(0),
    };
    const decoded = decodeRpc(encodeRpc(req)) as RpcRequest;
    expect(decoded.headers).toHaveLength(3);
    expect(decoded.headers[0]).toEqual({ name: 'authorization', value: 'Bearer abcdef' });
    expect(decoded.headers[1]!.name).toBe('x-app-session');
    expect(decoded.headers[2]!.name).toBe('content-type');
  });

  it('round-trips a UTF-8 body unchanged', () => {
    const req: RpcRequest = {
      kind: RPC_KIND.REQUEST,
      seq: 1,
      method: 'POST',
      path: '/api/app/x',
      headers: [],
      body: new TextEncoder().encode('åäö 中国 🚀'),
    };
    const decoded = decodeRpc(encodeRpc(req)) as RpcRequest;
    expect(new TextDecoder().decode(decoded.body)).toBe('åäö 中国 🚀');
  });

  it('round-trips a large body up to MAX_BODY', () => {
    const body = new Uint8Array(MAX_BODY - 100);
    for (let i = 0; i < body.length; i++) body[i] = (i * 31 + 7) & 0xFF;
    const req: RpcRequest = {
      kind: RPC_KIND.REQUEST, seq: 1, method: 'POST', path: '/x',
      headers: [], body,
    };
    const decoded = decodeRpc(encodeRpc(req)) as RpcRequest;
    expect(decoded.body.length).toBe(body.length);
    expect(decoded.body[0]).toBe(body[0]);
    expect(decoded.body[body.length - 1]).toBe(body[body.length - 1]);
  });
});

describe('RPC codec — response frame', () => {
  it('round-trips a 200 with JSON body', () => {
    const res: RpcResponse = {
      kind: RPC_KIND.RESPONSE, seq: 1, status: 200,
      headers: [{ name: 'content-type', value: 'application/json' }],
      body: new TextEncoder().encode('{"text":"Understood."}'),
    };
    const decoded = decodeRpc(encodeRpc(res));
    expect(decoded).toEqual(res);
  });

  it('round-trips an error status (4xx/5xx)', () => {
    for (const status of [400, 401, 403, 404, 429, 500, 502, 503]) {
      const res: RpcResponse = {
        kind: RPC_KIND.RESPONSE, seq: 1, status,
        headers: [], body: new Uint8Array(0),
      };
      const decoded = decodeRpc(encodeRpc(res)) as RpcResponse;
      expect(decoded.status).toBe(status);
    }
  });
});

describe('RPC codec — error frame', () => {
  it('round-trips with empty message', () => {
    const e: RpcError = { kind: RPC_KIND.ERROR, seq: 0, code: 0x0201, message: '' };
    expect(decodeRpc(encodeRpc(e))).toEqual(e);
  });

  it('round-trips with a UTF-8 message', () => {
    const e: RpcError = { kind: RPC_KIND.ERROR, seq: 7, code: 0x0202, message: 'sequence collision — closing session' };
    expect(decodeRpc(encodeRpc(e))).toEqual(e);
  });

  it('rejects encoding a message longer than 256 bytes', () => {
    expect(() => encodeRpc({
      kind: RPC_KIND.ERROR, seq: 1, code: 1, message: 'x'.repeat(257),
    })).toThrow(RpcEncodeError);
  });
});

describe('RPC codec — cancel frame', () => {
  it('round-trips', () => {
    const c: RpcCancel = { kind: RPC_KIND.CANCEL, seq: 9999 };
    expect(decodeRpc(encodeRpc(c))).toEqual(c);
  });

  it('cancel frame is exactly 5 bytes', () => {
    const c: RpcCancel = { kind: RPC_KIND.CANCEL, seq: 1 };
    expect(encodeRpc(c).length).toBe(5);
  });
});

// ── Limit enforcement (spec §5.3) ────────────────────────────────────

describe('RPC codec — size-limit enforcement', () => {
  it('rejects encoding a method longer than 16 bytes', () => {
    expect(() => encodeRpc({
      kind: RPC_KIND.REQUEST, seq: 1, method: 'X'.repeat(17),
      path: '/x', headers: [], body: new Uint8Array(0),
    })).toThrow(RpcEncodeError);
  });

  it('rejects encoding a path longer than 4096 bytes', () => {
    expect(() => encodeRpc({
      kind: RPC_KIND.REQUEST, seq: 1, method: 'GET',
      path: '/' + 'x'.repeat(4096), headers: [], body: new Uint8Array(0),
    })).toThrow(RpcEncodeError);
  });

  it('rejects encoding more than 32 headers', () => {
    const headers = [];
    for (let i = 0; i < 33; i++) headers.push({ name: `h${i}`, value: 'v' });
    expect(() => encodeRpc({
      kind: RPC_KIND.REQUEST, seq: 1, method: 'GET', path: '/x',
      headers, body: new Uint8Array(0),
    })).toThrow(RpcEncodeError);
  });

  it('rejects encoding a header value longer than 4096 bytes', () => {
    expect(() => encodeRpc({
      kind: RPC_KIND.REQUEST, seq: 1, method: 'GET', path: '/x',
      headers: [{ name: 'x', value: 'v'.repeat(4097) }],
      body: new Uint8Array(0),
    })).toThrow(RpcEncodeError);
  });

  it('rejects encoding a body larger than MAX_BODY', () => {
    expect(() => encodeRpc({
      kind: RPC_KIND.REQUEST, seq: 1, method: 'POST', path: '/x',
      headers: [], body: new Uint8Array(MAX_BODY + 1),
    })).toThrow(RpcEncodeError);
  });
});

// ── Malformed-input rejection ───────────────────────────────────────

describe('RPC codec — malformed input rejection', () => {
  it('rejects an empty buffer', () => {
    expect(() => decodeRpc(new Uint8Array(0))).toThrow(RpcParseError);
  });

  it('rejects an unknown kind byte', () => {
    expect(() => decodeRpc(new Uint8Array([0x99, 0, 0, 0, 0]))).toThrow(RpcParseError);
  });

  it('rejects a truncated request frame', () => {
    const req: RpcRequest = {
      kind: RPC_KIND.REQUEST, seq: 1, method: 'GET', path: '/x',
      headers: [], body: new Uint8Array(0),
    };
    const enc = encodeRpc(req);
    const truncated = enc.slice(0, enc.length - 1);
    expect(() => decodeRpc(truncated)).toThrow(RpcParseError);
  });

  it('rejects a request frame with trailing garbage', () => {
    const req: RpcRequest = {
      kind: RPC_KIND.REQUEST, seq: 1, method: 'GET', path: '/x',
      headers: [], body: new Uint8Array(0),
    };
    const enc = encodeRpc(req);
    const padded = new Uint8Array(enc.length + 5);
    padded.set(enc);
    expect(() => decodeRpc(padded)).toThrow(RpcParseError);
  });

  it('rejects a cancel frame of the wrong length', () => {
    expect(() => decodeRpc(new Uint8Array([0x04, 0, 0, 0]))).toThrow(RpcParseError);
    expect(() => decodeRpc(new Uint8Array([0x04, 0, 0, 0, 0, 0]))).toThrow(RpcParseError);
  });

  it('rejects a request claiming a body longer than the buffer holds', () => {
    // Hand-craft a request payload with body_len = 1000 but only 5 actual bytes.
    const out = new Uint8Array(1 + 4 + 1 + 3 + 2 + 2 + 1 + 4 + 5);
    let off = 0;
    out[off++] = 0x01;     // REQUEST
    off += 4;              // seq=0
    out[off++] = 3;        // method_len=3
    out.set(new TextEncoder().encode('GET'), off); off += 3;
    out[off++] = 0; out[off++] = 2; // path_len=2
    out.set(new TextEncoder().encode('/x'), off); off += 2;
    out[off++] = 0;        // header_n=0
    out[off++] = 0; out[off++] = 0; out[off++] = 0x03; out[off++] = 0xE8; // body_len=1000
    // remaining 5 bytes of body declared
    expect(() => decodeRpc(out)).toThrow(RpcParseError);
  });

  it('rejects a header with name_len = 0', () => {
    // Manually build: REQUEST | seq | method_len=3, "GET" | path_len=2, "/x" | header_n=1 | name_len=0 ...
    const out = new Uint8Array(1 + 4 + 1 + 3 + 2 + 2 + 1 + 1);
    let off = 0;
    out[off++] = 0x01;
    off += 4;
    out[off++] = 3;
    out.set(new TextEncoder().encode('GET'), off); off += 3;
    out[off++] = 0; out[off++] = 2;
    out.set(new TextEncoder().encode('/x'), off); off += 2;
    out[off++] = 1; // header_n=1
    out[off++] = 0; // name_len=0 — invalid
    expect(() => decodeRpc(out)).toThrow(RpcParseError);
  });
});

// ── seq=0 reservation ───────────────────────────────────────────────

describe('RPC codec — seq=0 (session-level)', () => {
  it('an ERROR with seq=0 is well-formed (session-level error per spec §5.5)', () => {
    const e: RpcError = { kind: RPC_KIND.ERROR, seq: 0, code: 0x0201, message: 'session ended' };
    const decoded = decodeRpc(encodeRpc(e)) as RpcError;
    expect(decoded.seq).toBe(0);
  });
});
