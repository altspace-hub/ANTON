/**
 * bridge.ts — Glue between the mesh dialer (Noise transport) and the
 * existing Express app.
 *
 * Flow per request:
 *   1. Phone sends an RPC REQUEST frame inside a Noise transport message.
 *   2. Dialer decrypts → fires onSessionData(plaintext).
 *   3. Bridge decodes the RPC frame, builds a synthetic IncomingMessage
 *      (with the body preloaded as a single chunk) and ServerResponse.
 *   4. Bridge calls express(req, res) — same code path as a real HTTP req.
 *   5. When res.end() fires, bridge captures status + headers + body,
 *      encodes an RPC RESPONSE frame, hands it to the dialer to encrypt
 *      + ship out as an ENVELOPE.
 *
 * CANCEL frames abort the in-flight AbortController for that seq. Express
 * routes that respect req.signal cooperatively bail out.
 *
 * Spec ref: docs/ANTON_MESH_SPEC.md §5 RPC framing + §9 auth chaining.
 */

import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import {
  decodeRpc,
  encodeRpc,
  RPC_KIND,
  type RpcRequest,
  type RpcResponse,
  type RpcHeader,
} from './rpc.js';
import type { MeshDialer, SessionContext } from './dialer.js';

// ── Public API ──────────────────────────────────────────────────────

export interface MeshBridgeConfig {
  /** The Express app (or any `(req, res) => void` handler). */
  expressHandler: (req: IncomingMessage, res: ServerResponse) => void;
  /**
   * Soft timeout for a single Express dispatch. If the handler hasn't
   * called res.end() by then, the bridge sends a 504 RPC response and
   * fires the AbortController (so a cooperative handler bails out).
   * Default 60s.
   */
  requestTimeoutMs?: number;
  /**
   * If set, the bridge attaches an `x-mesh-phone-static` header to every
   * synthetic IncomingMessage carrying the phone's X25519 static pubkey.
   * Express middleware can use this for app-layer device auth without
   * the bridge needing to know about app_devices.
   */
  attachPhoneStaticHeader?: boolean;
}

export interface MeshBridge {
  /** Subscribe the bridge to a MeshDialer. Idempotent per-dialer. */
  attach(dialer: MeshDialer): void;
  /** Number of in-flight requests across all sessions (for telemetry). */
  inFlightCount(): number;
}

export function createMeshBridge(cfg: MeshBridgeConfig): MeshBridge {
  const sessions = new Map<string, SessionState>();
  let attached = false;
  const requestTimeoutMs = cfg.requestTimeoutMs ?? 60_000;

  return {
    attach(dialer: MeshDialer): void {
      if (attached) throw new Error('MeshBridge already attached to a dialer');
      attached = true;
      // Re-export the relevant lifecycle hooks from the dialer config —
      // but the dialer has already been constructed; we instead chain
      // via wrapper hooks. The cleanest pattern is for the caller to
      // pass the bridge's hooks INTO the dialer constructor. This method
      // is offered as a convenience for that wiring.
      void dialer;
      throw new Error(
        'attach() on a constructed dialer is not supported. ' +
        'Use createMeshBridge().hooks() and pass the result to MeshDialer constructor.',
      );
    },
    inFlightCount(): number {
      let n = 0;
      for (const s of sessions.values()) n += s.inFlight.size;
      return n;
    },
  };

  // ── Below: helpers that close over `cfg` + `sessions` ──────────────
  // (kept inside the factory function so they share state)
}

/**
 * Build the `onSessionOpen` / `onSessionData` / `onSessionClose` hooks
 * the MeshDialer constructor expects. Pass these into MeshDialer's config.
 *
 * This is the *recommended* wiring path — it composes cleanly with the
 * dialer's lifecycle without an awkward post-hoc attach.
 */
export function buildBridgeHooks(cfg: MeshBridgeConfig): {
  onSessionOpen: (sessionId: Uint8Array, ctx: SessionContext) => void;
  onSessionData: (sessionId: Uint8Array, plaintext: Uint8Array) => void;
  onSessionClose: (sessionId: Uint8Array, reason: string) => void;
  inFlightCount: () => number;
} {
  const sessions = new Map<string, SessionState>();
  const requestTimeoutMs = cfg.requestTimeoutMs ?? 60_000;

  return {
    onSessionOpen(sessionId: Uint8Array, ctx: SessionContext): void {
      sessions.set(bytesToHex(sessionId), {
        sessionId,
        ctx,
        inFlight: new Map(),
      });
    },
    onSessionData(sessionId: Uint8Array, plaintext: Uint8Array): void {
      const sidHex = bytesToHex(sessionId);
      const state = sessions.get(sidHex);
      if (!state) return;
      handleInbound(state, plaintext, cfg.expressHandler, requestTimeoutMs, cfg.attachPhoneStaticHeader === true);
    },
    onSessionClose(sessionId: Uint8Array, _reason: string): void {
      const sidHex = bytesToHex(sessionId);
      const state = sessions.get(sidHex);
      if (!state) return;
      // Abort any in-flight requests on this session.
      for (const [, controller] of state.inFlight) controller.abort();
      sessions.delete(sidHex);
    },
    inFlightCount(): number {
      let n = 0;
      for (const s of sessions.values()) n += s.inFlight.size;
      return n;
    },
  };
}

// ── Internal types ───────────────────────────────────────────────────

interface SessionState {
  sessionId: Uint8Array;
  ctx: SessionContext;
  inFlight: Map<number, AbortController>;
}

// ── Inbound handling ─────────────────────────────────────────────────

function handleInbound(
  state: SessionState,
  plaintext: Uint8Array,
  expressHandler: (req: IncomingMessage, res: ServerResponse) => void,
  requestTimeoutMs: number,
  attachPhoneStaticHeader: boolean,
): void {
  let frame;
  try {
    frame = decodeRpc(plaintext);
  } catch {
    // Malformed RPC frame inside an authenticated session = peer is buggy
    // or compromised. End the session.
    state.ctx.close('bad_rpc_frame');
    return;
  }

  switch (frame.kind) {
    case RPC_KIND.REQUEST:
      void dispatchRequest(state, frame, expressHandler, requestTimeoutMs, attachPhoneStaticHeader);
      return;

    case RPC_KIND.CANCEL: {
      const controller = state.inFlight.get(frame.seq);
      if (controller) {
        controller.abort();
        state.inFlight.delete(frame.seq);
      }
      // Unknown seq is silently ignored per spec §5.5.
      return;
    }

    case RPC_KIND.RESPONSE:
    case RPC_KIND.ERROR:
      // The instance is the responder, not the requester. Receiving these
      // means the peer is misbehaving — close the session.
      state.ctx.close('unexpected_kind');
      return;

    default: {
      const _never: never = frame;
      void _never;
      state.ctx.close('unknown_kind');
      return;
    }
  }
}

async function dispatchRequest(
  state: SessionState,
  req: RpcRequest,
  expressHandler: (req: IncomingMessage, res: ServerResponse) => void,
  requestTimeoutMs: number,
  attachPhoneStaticHeader: boolean,
): Promise<void> {
  // Reject duplicate seq (spec §5.4).
  if (state.inFlight.has(req.seq)) {
    sendErrorFrame(state, req.seq, 0x0202, 'seq duplicate');
    state.ctx.close('seq_duplicate');
    return;
  }

  const controller = new AbortController();
  state.inFlight.set(req.seq, controller);

  // Build synthetic req/res
  const synthReq = makeSyntheticRequest(req, controller.signal,
    attachPhoneStaticHeader ? state.ctx.phoneStaticPubkey : null);
  const synthRes = new SyntheticResponse(synthReq);

  // Soft-timeout.
  const timeoutTimer = setTimeout(() => {
    if (!synthRes.isFinished()) {
      controller.abort();
      sendResponseFrame(state, req.seq, 504, [{ name: 'content-type', value: 'text/plain' }],
        new TextEncoder().encode('mesh dispatch timeout'));
      state.inFlight.delete(req.seq);
    }
  }, requestTimeoutMs);

  // When the response finishes, encode + send back.
  synthRes.onFinish((status, headers, body) => {
    clearTimeout(timeoutTimer);
    if (!state.inFlight.has(req.seq)) return; // already aborted
    state.inFlight.delete(req.seq);
    sendResponseFrame(state, req.seq, status, headers, body);
  });

  // Dispatch into Express.
  try {
    expressHandler(synthReq, synthRes as unknown as ServerResponse);
  } catch (err) {
    clearTimeout(timeoutTimer);
    if (!state.inFlight.has(req.seq)) return;
    state.inFlight.delete(req.seq);
    sendErrorFrame(state, req.seq, 0x0201, err instanceof Error ? err.message : 'dispatch error');
  }
}

function sendResponseFrame(
  state: SessionState,
  seq: number,
  status: number,
  headers: RpcHeader[],
  body: Uint8Array,
): void {
  try {
    const frame = encodeRpc({ kind: RPC_KIND.RESPONSE, seq, status, headers, body } as RpcResponse);
    state.ctx.send(frame);
  } catch {
    // Encoding failed (e.g. body too large). Convert to ERROR frame.
    sendErrorFrame(state, seq, 0x0201, 'response too large');
  }
}

function sendErrorFrame(state: SessionState, seq: number, code: number, message: string): void {
  try {
    const frame = encodeRpc({ kind: RPC_KIND.ERROR, seq, code, message });
    state.ctx.send(frame);
  } catch {
    // Couldn't even encode the error — give up on the session.
    state.ctx.close('send_error_failed');
  }
}

// ── Synthetic IncomingMessage ────────────────────────────────────────

function makeSyntheticRequest(
  req: RpcRequest,
  signal: AbortSignal,
  phoneStaticPubkey: Uint8Array | null,
): IncomingMessage {
  // Express only needs a Readable + a few properties. Build a Readable
  // that immediately yields the body and ends.
  const bodyChunk = req.body;
  const readable = new Readable({
    read(): void {
      if (bodyChunk.length > 0) this.push(Buffer.from(bodyChunk));
      this.push(null);
    },
  });

  // Build headers map. Express looks at .headers (lowercased keys).
  const headers: Record<string, string> = {};
  for (const h of req.headers) {
    headers[h.name.toLowerCase()] = h.value;
  }
  // Always attach the body length so Express's body parser doesn't hang.
  if (req.body.length > 0 && !headers['content-length']) {
    headers['content-length'] = String(req.body.length);
  }
  // Optional: surface the phone's static pubkey so Express can use it
  // for app-layer device auth (existing app_devices lookup).
  if (phoneStaticPubkey) {
    headers['x-mesh-phone-static'] = bytesToHex(phoneStaticPubkey);
  }

  // Attach IncomingMessage-shaped properties on the Readable.
  // (Express + body-parser don't need a real net.Socket — just enough
  // surface area on the request object.)
  const reqObj = readable as Readable & {
    method?: string; url?: string; headers?: Record<string, string>;
    httpVersion?: string; httpVersionMajor?: number; httpVersionMinor?: number;
    socket?: { destroyed?: boolean }; signal?: AbortSignal;
  };
  reqObj.method = req.method.toUpperCase();
  reqObj.url = req.path;
  reqObj.headers = headers;
  reqObj.httpVersion = '1.1';
  reqObj.httpVersionMajor = 1;
  reqObj.httpVersionMinor = 1;
  reqObj.socket = { destroyed: false };
  reqObj.signal = signal;

  return reqObj as unknown as IncomingMessage;
}

// ── Synthetic ServerResponse ─────────────────────────────────────────

class SyntheticResponse {
  private status = 200;
  private headers: Record<string, string> = {};
  private headerSent = false;
  private chunks: Uint8Array[] = [];
  private finished = false;
  private finishCallbacks: ((status: number, headers: RpcHeader[], body: Uint8Array) => void)[] = [];

  // Express touches a handful of properties — these stand in.
  statusCode = 200;
  statusMessage = 'OK';
  /* eslint-disable @typescript-eslint/no-unused-vars */
  socket: Socket | null = null;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  finishedFlag = false;
  headersSent = false;

  constructor(_req: IncomingMessage) {
    void _req;
  }

  // Methods Express + middleware call.

  setHeader(name: string, value: string | number | string[]): this {
    this.headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
    return this;
  }

  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  removeHeader(name: string): void {
    delete this.headers[name.toLowerCase()];
  }

  writeHead(statusCode: number, statusMessage?: string | Record<string, string | number>, headers?: Record<string, string | number>): this {
    this.status = statusCode;
    this.statusCode = statusCode;
    if (typeof statusMessage === 'string') {
      this.statusMessage = statusMessage;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) this.setHeader(k, v as string | number);
      }
    } else if (typeof statusMessage === 'object' && statusMessage !== null) {
      for (const [k, v] of Object.entries(statusMessage)) this.setHeader(k, v);
    }
    this.headerSent = true;
    this.headersSent = true;
    return this;
  }

  write(chunk: string | Buffer | Uint8Array): boolean {
    if (this.finished) return false;
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
    this.chunks.push(new Uint8Array(buf));
    return true;
  }

  end(chunk?: string | Buffer | Uint8Array): void {
    if (this.finished) return;
    if (chunk !== undefined) this.write(chunk);
    this.finished = true;
    this.finishedFlag = true;

    const body = concatChunks(this.chunks);
    const headerArr: RpcHeader[] = [];
    for (const [name, value] of Object.entries(this.headers)) {
      headerArr.push({ name, value });
    }
    for (const cb of this.finishCallbacks) {
      try { cb(this.status, headerArr, body); } catch { /* swallow */ }
    }
  }

  // Express also touches `flushHeaders`, `getHeaders`, etc. — minimal stubs.
  flushHeaders(): void { this.headerSent = true; this.headersSent = true; }
  getHeaders(): Record<string, string> { return { ...this.headers }; }
  hasHeader(name: string): boolean { return name.toLowerCase() in this.headers; }
  // Express's `res.json` / `res.send` route through write+end via underlying
  // express implementation — so we don't need to implement them.

  // EventEmitter-compatible no-ops for `on('close')` etc.
  on(_event: string, _listener: (...args: unknown[]) => void): this { return this; }
  once(_event: string, _listener: (...args: unknown[]) => void): this { return this; }
  emit(_event: string, ..._args: unknown[]): boolean { return false; }

  // Internal — called by the bridge to receive the finished response.
  onFinish(cb: (status: number, headers: RpcHeader[], body: Uint8Array) => void): void {
    if (this.finished) {
      const body = concatChunks(this.chunks);
      const headerArr: RpcHeader[] = [];
      for (const [name, value] of Object.entries(this.headers)) headerArr.push({ name, value });
      cb(this.status, headerArr, body);
    } else {
      this.finishCallbacks.push(cb);
    }
  }

  isFinished(): boolean { return this.finished; }
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, '0');
  return out;
}
