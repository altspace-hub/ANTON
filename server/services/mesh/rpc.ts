/**
 * rpc.ts — RPC frame codec inside Noise transport messages, per spec §5.
 *
 * Each Noise transport message (after the handshake completes) carries a
 * single complete RPC frame. The four frame kinds are:
 *
 *   - 0x01 REQUEST  (phone → instance)
 *   - 0x02 RESPONSE (instance → phone)
 *   - 0x03 ERROR    (instance → phone, replaces a response on failure)
 *   - 0x04 CANCEL   (phone → instance, abandons an in-flight request)
 *
 * The codec enforces every size limit from spec §5.3. Out-of-spec inputs
 * are rejected with RpcParseError so a malformed message never reaches
 * application logic with surprise data.
 *
 * Spec ref: docs/ANTON_MESH_SPEC.md §5.
 */

// ── Constants from §5.3 ──────────────────────────────────────────────

export const MAX_METHOD_LEN  = 16;      // u8 length field
export const MAX_PATH_LEN    = 4096;    // u16 length field, capped to 4096
export const MAX_HEADERS     = 32;      // u8 header count
export const MAX_HEADER_NAME = 64;      // u8 length field
export const MAX_HEADER_VAL  = 4096;    // u16 length field
export const MAX_BODY        = 1_048_000; // u32 length field, capped to ~1MiB

export const RPC_KIND = {
  REQUEST:  0x01,
  RESPONSE: 0x02,
  ERROR:    0x03,
  CANCEL:   0x04,
} as const;

export type RpcKind = typeof RPC_KIND[keyof typeof RPC_KIND];

// ── Errors ──────────────────────────────────────────────────────────

export class RpcParseError extends Error {
  constructor(public readonly reason: string) {
    super(`RPC parse: ${reason}`);
    this.name = 'RpcParseError';
  }
}

export class RpcEncodeError extends Error {
  constructor(public readonly reason: string) {
    super(`RPC encode: ${reason}`);
    this.name = 'RpcEncodeError';
  }
}

// ── Public types ────────────────────────────────────────────────────

export interface RpcHeader {
  name: string;   // ASCII; lowercased on send
  value: string;  // UTF-8
}

export interface RpcRequest {
  kind: typeof RPC_KIND.REQUEST;
  seq: number;
  method: string;
  path: string;
  headers: RpcHeader[];
  body: Uint8Array;
}

export interface RpcResponse {
  kind: typeof RPC_KIND.RESPONSE;
  seq: number;
  status: number;
  headers: RpcHeader[];
  body: Uint8Array;
}

export interface RpcError {
  kind: typeof RPC_KIND.ERROR;
  seq: number;
  code: number;
  message: string;
}

export interface RpcCancel {
  kind: typeof RPC_KIND.CANCEL;
  seq: number;
}

export type RpcFrame = RpcRequest | RpcResponse | RpcError | RpcCancel;

// ── Encoder ─────────────────────────────────────────────────────────

export function encodeRpc(frame: RpcFrame): Uint8Array {
  switch (frame.kind) {
    case RPC_KIND.REQUEST:  return encodeRequest(frame);
    case RPC_KIND.RESPONSE: return encodeResponse(frame);
    case RPC_KIND.ERROR:    return encodeError(frame);
    case RPC_KIND.CANCEL:   return encodeCancel(frame);
    default: {
      const _never: never = frame;
      throw new RpcEncodeError(`unknown frame kind: ${(_never as { kind?: number }).kind}`);
    }
  }
}

function encodeRequest(r: RpcRequest): Uint8Array {
  const enc = new TextEncoder();
  const methodBytes = enc.encode(r.method);
  const pathBytes = enc.encode(r.path);

  if (methodBytes.length === 0 || methodBytes.length > MAX_METHOD_LEN) {
    throw new RpcEncodeError(`method length ${methodBytes.length} (must be 1..${MAX_METHOD_LEN})`);
  }
  if (pathBytes.length === 0 || pathBytes.length > MAX_PATH_LEN) {
    throw new RpcEncodeError(`path length ${pathBytes.length} (must be 1..${MAX_PATH_LEN})`);
  }
  if (r.headers.length > MAX_HEADERS) {
    throw new RpcEncodeError(`header count ${r.headers.length} > ${MAX_HEADERS}`);
  }
  if (r.body.length > MAX_BODY) {
    throw new RpcEncodeError(`body length ${r.body.length} > ${MAX_BODY}`);
  }

  // Pre-encode all header bytes so we can compute total size up front.
  const encodedHeaders: { nameBytes: Uint8Array; valueBytes: Uint8Array }[] = [];
  let headersSize = 0;
  for (const h of r.headers) {
    const nameBytes = enc.encode(h.name);
    const valueBytes = enc.encode(h.value);
    if (nameBytes.length === 0 || nameBytes.length > MAX_HEADER_NAME) {
      throw new RpcEncodeError(`header name length ${nameBytes.length} (must be 1..${MAX_HEADER_NAME})`);
    }
    if (valueBytes.length > MAX_HEADER_VAL) {
      throw new RpcEncodeError(`header value length ${valueBytes.length} > ${MAX_HEADER_VAL}`);
    }
    encodedHeaders.push({ nameBytes, valueBytes });
    headersSize += 1 + nameBytes.length + 2 + valueBytes.length;
  }

  // Layout: 0x01 | seq u32 | method_len u8 | method | path_len u16 | path
  //       | header_n u8 | headers... | body_len u32 | body
  const total = 1 + 4
              + 1 + methodBytes.length
              + 2 + pathBytes.length
              + 1 + headersSize
              + 4 + r.body.length;
  const out = new Uint8Array(total);
  let off = 0;
  out[off++] = RPC_KIND.REQUEST;
  writeU32BE(out, off, r.seq); off += 4;
  out[off++] = methodBytes.length;
  out.set(methodBytes, off); off += methodBytes.length;
  writeU16BE(out, off, pathBytes.length); off += 2;
  out.set(pathBytes, off); off += pathBytes.length;
  out[off++] = r.headers.length;
  for (const h of encodedHeaders) {
    out[off++] = h.nameBytes.length;
    out.set(h.nameBytes, off); off += h.nameBytes.length;
    writeU16BE(out, off, h.valueBytes.length); off += 2;
    out.set(h.valueBytes, off); off += h.valueBytes.length;
  }
  writeU32BE(out, off, r.body.length); off += 4;
  out.set(r.body, off);
  return out;
}

function encodeResponse(r: RpcResponse): Uint8Array {
  const enc = new TextEncoder();
  if (r.status < 0 || r.status > 0xFFFF) {
    throw new RpcEncodeError(`status ${r.status} out of u16 range`);
  }
  if (r.headers.length > MAX_HEADERS) {
    throw new RpcEncodeError(`header count ${r.headers.length} > ${MAX_HEADERS}`);
  }
  if (r.body.length > MAX_BODY) {
    throw new RpcEncodeError(`body length ${r.body.length} > ${MAX_BODY}`);
  }

  const encodedHeaders: { nameBytes: Uint8Array; valueBytes: Uint8Array }[] = [];
  let headersSize = 0;
  for (const h of r.headers) {
    const nameBytes = enc.encode(h.name);
    const valueBytes = enc.encode(h.value);
    if (nameBytes.length === 0 || nameBytes.length > MAX_HEADER_NAME) {
      throw new RpcEncodeError(`header name length ${nameBytes.length} (must be 1..${MAX_HEADER_NAME})`);
    }
    if (valueBytes.length > MAX_HEADER_VAL) {
      throw new RpcEncodeError(`header value length ${valueBytes.length} > ${MAX_HEADER_VAL}`);
    }
    encodedHeaders.push({ nameBytes, valueBytes });
    headersSize += 1 + nameBytes.length + 2 + valueBytes.length;
  }

  const total = 1 + 4 + 2
              + 1 + headersSize
              + 4 + r.body.length;
  const out = new Uint8Array(total);
  let off = 0;
  out[off++] = RPC_KIND.RESPONSE;
  writeU32BE(out, off, r.seq); off += 4;
  writeU16BE(out, off, r.status); off += 2;
  out[off++] = r.headers.length;
  for (const h of encodedHeaders) {
    out[off++] = h.nameBytes.length;
    out.set(h.nameBytes, off); off += h.nameBytes.length;
    writeU16BE(out, off, h.valueBytes.length); off += 2;
    out.set(h.valueBytes, off); off += h.valueBytes.length;
  }
  writeU32BE(out, off, r.body.length); off += 4;
  out.set(r.body, off);
  return out;
}

function encodeError(e: RpcError): Uint8Array {
  const msgBytes = new TextEncoder().encode(e.message);
  if (msgBytes.length > 256) {
    throw new RpcEncodeError(`error message ${msgBytes.length} bytes > 256`);
  }
  if (e.code < 0 || e.code > 0xFFFF) {
    throw new RpcEncodeError(`code ${e.code} out of u16 range`);
  }
  const out = new Uint8Array(1 + 4 + 2 + 2 + msgBytes.length);
  out[0] = RPC_KIND.ERROR;
  writeU32BE(out, 1, e.seq);
  writeU16BE(out, 5, e.code);
  writeU16BE(out, 7, msgBytes.length);
  out.set(msgBytes, 9);
  return out;
}

function encodeCancel(c: RpcCancel): Uint8Array {
  const out = new Uint8Array(1 + 4);
  out[0] = RPC_KIND.CANCEL;
  writeU32BE(out, 1, c.seq);
  return out;
}

// ── Decoder ─────────────────────────────────────────────────────────

export function decodeRpc(buf: Uint8Array): RpcFrame {
  if (buf.length < 1) throw new RpcParseError('empty buffer');
  const kind = buf[0]!;
  switch (kind) {
    case RPC_KIND.REQUEST:  return decodeRequest(buf);
    case RPC_KIND.RESPONSE: return decodeResponse(buf);
    case RPC_KIND.ERROR:    return decodeError(buf);
    case RPC_KIND.CANCEL:   return decodeCancel(buf);
    default:                throw new RpcParseError(`unknown kind 0x${kind.toString(16)}`);
  }
}

function decodeRequest(buf: Uint8Array): RpcRequest {
  let off = 1; // skip kind byte
  if (off + 4 > buf.length) throw new RpcParseError('truncated at seq');
  const seq = readU32BE(buf, off); off += 4;

  if (off + 1 > buf.length) throw new RpcParseError('truncated at method_len');
  const methodLen = buf[off]!; off += 1;
  if (methodLen === 0 || methodLen > MAX_METHOD_LEN) throw new RpcParseError(`method_len ${methodLen}`);
  if (off + methodLen > buf.length) throw new RpcParseError('truncated at method');
  const method = new TextDecoder().decode(buf.subarray(off, off + methodLen)); off += methodLen;

  if (off + 2 > buf.length) throw new RpcParseError('truncated at path_len');
  const pathLen = readU16BE(buf, off); off += 2;
  if (pathLen === 0 || pathLen > MAX_PATH_LEN) throw new RpcParseError(`path_len ${pathLen}`);
  if (off + pathLen > buf.length) throw new RpcParseError('truncated at path');
  const path = new TextDecoder().decode(buf.subarray(off, off + pathLen)); off += pathLen;

  if (off + 1 > buf.length) throw new RpcParseError('truncated at header_n');
  const headerN = buf[off]!; off += 1;
  if (headerN > MAX_HEADERS) throw new RpcParseError(`header_n ${headerN}`);
  const headers = readHeaders(buf, off, headerN);
  off = headers.endOffset;

  if (off + 4 > buf.length) throw new RpcParseError('truncated at body_len');
  const bodyLen = readU32BE(buf, off); off += 4;
  if (bodyLen > MAX_BODY) throw new RpcParseError(`body_len ${bodyLen} > ${MAX_BODY}`);
  if (off + bodyLen !== buf.length) throw new RpcParseError(`expected ${off + bodyLen} bytes, got ${buf.length}`);
  const body = buf.slice(off, off + bodyLen);

  return { kind: RPC_KIND.REQUEST, seq, method, path, headers: headers.headers, body };
}

function decodeResponse(buf: Uint8Array): RpcResponse {
  let off = 1;
  if (off + 4 > buf.length) throw new RpcParseError('truncated at seq');
  const seq = readU32BE(buf, off); off += 4;
  if (off + 2 > buf.length) throw new RpcParseError('truncated at status');
  const status = readU16BE(buf, off); off += 2;
  if (off + 1 > buf.length) throw new RpcParseError('truncated at header_n');
  const headerN = buf[off]!; off += 1;
  if (headerN > MAX_HEADERS) throw new RpcParseError(`header_n ${headerN}`);
  const headers = readHeaders(buf, off, headerN);
  off = headers.endOffset;
  if (off + 4 > buf.length) throw new RpcParseError('truncated at body_len');
  const bodyLen = readU32BE(buf, off); off += 4;
  if (bodyLen > MAX_BODY) throw new RpcParseError(`body_len ${bodyLen} > ${MAX_BODY}`);
  if (off + bodyLen !== buf.length) throw new RpcParseError(`expected ${off + bodyLen} bytes, got ${buf.length}`);
  const body = buf.slice(off, off + bodyLen);
  return { kind: RPC_KIND.RESPONSE, seq, status, headers: headers.headers, body };
}

function decodeError(buf: Uint8Array): RpcError {
  if (buf.length < 1 + 4 + 2 + 2) throw new RpcParseError('error frame too short');
  const seq = readU32BE(buf, 1);
  const code = readU16BE(buf, 5);
  const msgLen = readU16BE(buf, 7);
  if (msgLen > 256) throw new RpcParseError(`error msg_len ${msgLen} > 256`);
  if (1 + 4 + 2 + 2 + msgLen !== buf.length) {
    throw new RpcParseError(`error frame length mismatch`);
  }
  const message = new TextDecoder().decode(buf.subarray(9, 9 + msgLen));
  return { kind: RPC_KIND.ERROR, seq, code, message };
}

function decodeCancel(buf: Uint8Array): RpcCancel {
  if (buf.length !== 1 + 4) throw new RpcParseError(`cancel frame length ${buf.length} != 5`);
  return { kind: RPC_KIND.CANCEL, seq: readU32BE(buf, 1) };
}

function readHeaders(buf: Uint8Array, startOffset: number, count: number): { headers: RpcHeader[]; endOffset: number } {
  const headers: RpcHeader[] = [];
  let off = startOffset;
  for (let i = 0; i < count; i++) {
    if (off + 1 > buf.length) throw new RpcParseError(`truncated at header[${i}].name_len`);
    const nameLen = buf[off]!; off += 1;
    if (nameLen === 0 || nameLen > MAX_HEADER_NAME) throw new RpcParseError(`header[${i}].name_len ${nameLen}`);
    if (off + nameLen > buf.length) throw new RpcParseError(`truncated at header[${i}].name`);
    const name = new TextDecoder().decode(buf.subarray(off, off + nameLen)); off += nameLen;
    if (off + 2 > buf.length) throw new RpcParseError(`truncated at header[${i}].value_len`);
    const valueLen = readU16BE(buf, off); off += 2;
    if (valueLen > MAX_HEADER_VAL) throw new RpcParseError(`header[${i}].value_len ${valueLen}`);
    if (off + valueLen > buf.length) throw new RpcParseError(`truncated at header[${i}].value`);
    const value = new TextDecoder().decode(buf.subarray(off, off + valueLen)); off += valueLen;
    headers.push({ name, value });
  }
  return { headers, endOffset: off };
}

// ── BE int helpers ──────────────────────────────────────────────────

function writeU16BE(buf: Uint8Array, off: number, n: number): void {
  buf[off]     = (n >>> 8) & 0xFF;
  buf[off + 1] = n & 0xFF;
}

function writeU32BE(buf: Uint8Array, off: number, n: number): void {
  buf[off]     = (n >>> 24) & 0xFF;
  buf[off + 1] = (n >>> 16) & 0xFF;
  buf[off + 2] = (n >>> 8) & 0xFF;
  buf[off + 3] = n & 0xFF;
}

function readU16BE(buf: Uint8Array, off: number): number {
  return (buf[off]! << 8) | buf[off + 1]!;
}

function readU32BE(buf: Uint8Array, off: number): number {
  // >>> 0 ensures we get an unsigned 32-bit value rather than a sign-flipped
  // signed int when the high bit is set.
  return ((buf[off]! << 24) | (buf[off + 1]! << 16) | (buf[off + 2]! << 8) | buf[off + 3]!) >>> 0;
}
