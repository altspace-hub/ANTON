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

/**
 * THE mesh attack surface, as an explicit fail-closed allowlist.
 *
 * bootstrap.ts hands this bridge the WHOLE Express app, so without this every
 * inbound RPC frame could reach every one of the ~200 routers mounted under
 * /api — plus /mcp and /metrics, which grant access on a loopback origin alone
 * and which the synthetic socket used to satisfy. A completed Noise handshake
 * proves only that a peer chose to talk to this instance (IK authenticates the
 * RESPONDER to the initiator, not the reverse), and dialer.ts holds no database
 * handle, so it cannot check the peer against app_devices even in principle.
 * Authorization therefore has to happen here, at dispatch.
 *
 * The real surface is provably tiny, which is what makes an allowlist safe:
 *   - the Companion app sends `'/api/app' + suffix` for EVERY call
 *     (src/app/services/api.ts:104) including enrollment
 *     (src/app/services/enrollment.ts:148)
 *   - instance-to-instance A2A sends exactly one path,
 *     `/api/p2p/receive` (server/services/message-queue-service.ts:90)
 *
 * Anything else is answered 404 without ever entering Express — 404 rather than
 * 403 so a probing peer learns nothing about what exists.
 */
const MESH_ALLOWED_PREFIXES = ['/api/app/'] as const;
const MESH_ALLOWED_EXACT = ['/api/app', '/api/p2p/receive'] as const;

export function isMeshAllowedPath(rawPath: string): boolean {
  // Compare on the path only, and reject traversal/encoding tricks outright:
  // a peer must not reach /api/admin/app via /api/app/../admin/app.
  const path = (rawPath.split('?')[0] ?? '').split('#')[0] ?? '';
  if (path.includes('..') || path.includes('\\') || path.includes('%2e') || path.includes('%2E')) return false;
  if (path.includes('//')) return false;
  if (MESH_ALLOWED_EXACT.includes(path as (typeof MESH_ALLOWED_EXACT)[number])) return true;
  return MESH_ALLOWED_PREFIXES.some((p) => path.startsWith(p));
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

  // Authorization gate — BEFORE Express sees anything.
  if (!isMeshAllowedPath(req.path)) {
    sendResponseFrame(state, req.seq, 404, [{ name: 'content-type', value: 'text/plain' }],
      new TextEncoder().encode('not found'));
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

  // Build the header map from an explicit ALLOWLIST, not by copying the peer's
  // bag verbatim. A denylist is the wrong shape here: the dangerous headers are
  // the ones that impersonate infrastructure, and that set grows over time.
  //
  // What a verbatim copy handed a peer:
  //   origin / referer — csrf.ts:112 waives CSRF outright for
  //     `Origin: http://localhost`, and isSameOrigin() compares Origin against
  //     the peer-supplied host. Either one is a complete CSRF bypass.
  //   host / x-forwarded-host — auth.ts:178 builds password-reset links as
  //     `${req.protocol}://${req.get('host')}`, i.e. host-header injection into
  //     an emailed link.
  //   x-forwarded-for / x-real-ip / forwarded — inert today (`trust proxy` is
  //     unset, so req.ip comes from the socket) but audit.ts:26-31 already
  //     prefers the raw x-forwarded-for header, and the day anyone adds
  //     `trust proxy` for a reverse proxy this silently becomes req.ip.
  //   content-encoding / transfer-encoding — neither mesh client sends them;
  //     both invite body-parser desync.
  //   cookie — mesh has no browser and no cookie session; accepting one only
  //     offers a way to ride an unrelated session.
  //   x-mesh-* — reserved for the bridge's own trusted headers below.
  //
  // The two real clients need almost nothing: the phone sends Content-Type plus
  // x-app-session (src/app/services/api.ts:60,63) and A2A sends content-type
  // alone (peer-transport-service.ts:182).
  const MESH_ALLOWED_HEADERS = new Set([
    'content-type', 'content-length', 'accept', 'accept-language', 'x-app-session',
  ]);
  const headers: Record<string, string> = {};
  for (const h of req.headers) {
    const name = h.name.toLowerCase();
    if (MESH_ALLOWED_HEADERS.has(name)) headers[name] = h.value;
  }
  // Pin Host to a name this instance is never served on, so the same-origin and
  // localhost CSRF waivers can never match a mesh request, and so any URL built
  // from req.get('host') is obviously synthetic rather than attacker-chosen.
  headers['host'] = 'mesh.invalid';
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
  // Express runs `Object.setPrototypeOf(req, app.request)` (application.js
  // L238) which chains our Readable up to `http.IncomingMessage.prototype`.
  // After that, when the stream ends, Node calls IncomingMessage._destroy
  // which calls `this.socket.destroy()`. Our fake socket therefore needs a
  // real destroy() method (and a couple of other props middleware probes).
  const fakeSocket: {
    destroyed: boolean; readable: boolean; writable: boolean;
    destroy: (err?: unknown) => void; setKeepAlive: () => void;
    setNoDelay: () => void; setTimeout: () => void; ref: () => void;
    unref: () => void; remoteAddress: string; remotePort: number;
    localAddress: string; localPort: number; encrypted: boolean;
  } = {
    destroyed: false,
    readable: true,
    writable: true,
    destroy(_err?: unknown): void { fakeSocket.destroyed = true; },
    setKeepAlive(): void { /* noop */ },
    setNoDelay(): void { /* noop */ },
    setTimeout(): void { /* noop */ },
    ref(): void { /* noop */ },
    unref(): void { /* noop */ },
    // NOT loopback. This used to claim 127.0.0.1, which silently satisfied every
    // "is the caller local, therefore trusted" check in the app — and three of
    // those are real gates: /mcp (server/index.ts:407-413, the full tool-calling
    // interface, open on loopback alone whenever MCP_SECRET is unset — the
    // default), /metrics (routes/metrics.ts:45-46) and /api/relay
    // (middleware/relay-auth.ts:84-89). A mesh peer is REMOTE by definition, so
    // it must present as remote and every such check must fail closed.
    //
    // 192.0.2.1 is RFC 5737 TEST-NET-1 — a valid IPv4 reserved for documentation
    // that can never be a real client, so anything parsing or logging it behaves
    // normally while nothing mistakes it for local. (Side benefit: mesh traffic
    // no longer shares the operator's 127.0.0.1 rate-limit bucket, so a hostile
    // peer can't lock the local user out of /api/app/auth or /api/auth/login.)
    remoteAddress: '192.0.2.1',
    remotePort: 0,
    localAddress: '192.0.2.1',
    localPort: 0,
    // Kept: mesh really is E2E-encrypted (Noise IK), and nothing in server/
    // branches on req.secure — the session-cookie Secure flag comes from
    // NODE_ENV/HTTPS env, and helmet's HSTS is unconditional.
    encrypted: true,
  };

  const reqObj = readable as Readable & {
    method?: string; url?: string; headers?: Record<string, string>;
    httpVersion?: string; httpVersionMajor?: number; httpVersionMinor?: number;
    socket?: typeof fakeSocket; connection?: typeof fakeSocket;
    signal?: AbortSignal; complete?: boolean;
  };
  reqObj.method = req.method.toUpperCase();
  reqObj.url = req.path;
  reqObj.headers = headers;
  reqObj.httpVersion = '1.1';
  reqObj.httpVersionMajor = 1;
  reqObj.httpVersionMinor = 1;
  reqObj.socket = fakeSocket;
  reqObj.connection = fakeSocket; // Express checks both
  reqObj.signal = signal;
  reqObj.complete = true;

  return reqObj as unknown as IncomingMessage;
}

// ── Synthetic ServerResponse ─────────────────────────────────────────

class SyntheticResponse {
  // Renamed from `status` — the bare name collided with Express's
  // `res.status(code)` method on the prototype. After Express's
  // setPrototypeOf, JS looked up `res.status` on our instance first,
  // found this number, and "200(400)" threw "not a function".
  private statusValue = 200;
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
    // Express calls Object.setPrototypeOf(res, app.response) at dispatch
    // time (application.js L239). app.response chains up to
    // http.ServerResponse.prototype, so AFTER that switch, calls like
    // res.setHeader() resolve to Node's real _http_outgoing.setHeader,
    // which expects internal Symbol-keyed slots ([kOutHeaders] etc.) we
    // don't have — and crashes with "Cannot set properties of undefined".
    //
    // Defending against this: install our methods as OWN properties on the
    // instance. Own properties win lookup over the prototype chain, so
    // they survive Express's switcheroo. Without this, helmet's CSP
    // middleware crashes the bridge before any route handler runs.
    const own = (name: keyof SyntheticResponse): void => {
      Object.defineProperty(this, name, {
        value: (this[name] as unknown as Function).bind(this),
        writable: true, configurable: true, enumerable: false,
      });
    };
    own('setHeader');
    own('getHeader');
    own('removeHeader');
    own('writeHead');
    own('write');
    own('end');
    own('flushHeaders');
    own('getHeaders');
    own('hasHeader');
    own('getHeaderNames');
    own('on');
    own('once');
    own('emit');
    own('addListener');
    own('removeListener');
    own('off');
  }

  // Methods Express body-parsers / helmet probe but we just stub.
  getHeaderNames(): string[] { return Object.keys(this.headers); }
  addListener(_event: string, _listener: (...args: unknown[]) => void): this { return this; }
  removeListener(_event: string, _listener: (...args: unknown[]) => void): this { return this; }
  off(_event: string, _listener: (...args: unknown[]) => void): this { return this; }

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
    this.statusValue = statusCode;
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
      // Express's res.status(code) sets this.statusCode (NOT statusValue).
      // res.json/res.send don't go through writeHead, so statusValue stays
      // at its initial 200. Read from statusCode — which is what Express
      // and Node both update — so we capture the route's intended status.
      try { cb(this.statusCode, headerArr, body); } catch { /* swallow */ }
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
      cb(this.statusCode, headerArr, body);
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
