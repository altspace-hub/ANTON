/**
 * server.ts — RelayServer wires the WS library to the pure-logic modules.
 *
 * Responsibilities (all I/O lives here; pure logic is elsewhere):
 *   - Accept WS connections (TLS or plain) and assign each a connId
 *   - Parse inbound frames; dispatch by type
 *   - Run rate limits before any state-changing operation
 *   - Verify HELLO_INSTANCE per §3.2 (delegated to hello.ts)
 *   - Forward ENVELOPE via match table (which sets from_role)
 *   - Execute the Action[] returned by match-table calls
 *   - Run periodic reapers: pending-phone timeouts, idle bucket GC,
 *     HELLO grace timeout
 *   - Respond to PINGs with PONGs (§3.8)
 *   - Audit-log every state change (no payload bytes — §1.4)
 *
 * The class is async-friendly: start() returns when listening, stop()
 * drains gracefully unless `force=true`.
 *
 * Spec references:
 *   §1.3   wss-only enforcement (caller's TLS config)
 *   §1.4   audit log no-payload contract
 *   §2.2   maxPayload = 1 MiB + 5 enforced via ws lib option
 *   §3     all relay-control message types
 *   §3.6   ENVELOPE direction tag — relay sets from_role
 *   §3.8   PING/PONG keepalive
 *   §3.9   state machine (delegated to match.ts)
 *   §3.10  rate limits (delegated to limits.ts)
 *   §4.2.1 canonical URL (delegated to canonical-url.ts)
 *   §6     error codes (relay-control range used here)
 */

import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  decodeFrame,
  encodeRelayError,
  encodeFrame,
  TYPE,
  MAX_WS_MESSAGE_SIZE,
  FrameError,
} from './frame.js';
import {
  parseHelloInstance,
  parseHelloPhone,
  verifyHelloInstance,
  HelloVerificationError,
  HelloError,
} from './hello.js';
import {
  MatchTable,
  RELAY_ERROR_CODE,
  type Action,
  type MatchTableLimits,
} from './match.js';
import {
  RateLimiter,
  ipBucket,
  type RateLimitConfig,
} from './limits.js';
import {
  createAuditLogger,
  shortId,
  type AuditLogger,
} from './audit.js';
import { canonicalizeRelayUrl } from './canonical-url.js';
import { bytesToHex } from './primitives.js';

// ── Configuration ────────────────────────────────────────────────────

export interface RelayServerConfig {
  /** Canonical URL phones use to dial this relay. Validated at start(). */
  ownUrl: string;
  /** TCP port to listen on. Use 0 to let the OS assign (tests). */
  port: number;
  /** Bind address. Defaults to "0.0.0.0". */
  host?: string;
  /** TLS cert (PEM string or DER buffer). When set, server runs HTTPS. */
  tlsCert?: string | Buffer;
  /** TLS key (PEM string or DER buffer). Required iff tlsCert is set. */
  tlsKey?: string | Buffer;
  /**
   * When true, accept plain HTTP/WS instead of HTTPS/WSS. Use only behind
   * a reverse proxy that handles TLS, OR for tests on localhost.
   * Operators MUST set RELAY_INSECURE explicitly to opt in.
   */
  insecure?: boolean;
  /** Match-table limits. Defaults applied if not provided (§3.10). */
  matchLimits?: MatchTableLimits;
  /** HELLO rate-limit config. Default: 5/s, capacity 5 (matches §3.10). */
  helloRateLimit?: RateLimitConfig;
  /** ENVELOPE per-session rate-limit config. Default: 200/s, capacity 200. */
  envelopeRateLimit?: RateLimitConfig;
  /** Audit log destination. Path string or pre-built logger. */
  audit?: AuditLogger;
  /**
   * HELLO grace period (seconds). Connections that haven't sent a valid
   * HELLO_* by this deadline are closed. Default 30s.
   */
  helloGraceSec?: number;
  /**
   * Reaper interval (ms). How often pending-phone timeouts and bucket GC
   * fire. Default 1000ms.
   */
  reaperIntervalMs?: number;
}

// ── Per-connection state ─────────────────────────────────────────────

interface ConnState {
  connId: string;
  ws: WebSocket;
  remoteAddr: string;
  bucketKey: string;          // for rate limiter
  /** Set after a valid HELLO_*. Connections that don't HELLO get reaped. */
  helloed: boolean;
  /** Wall-clock seconds when the connection was accepted. */
  acceptedAtSec: number;
}

// ── Server class ─────────────────────────────────────────────────────

export class RelayServer {
  private cfg: Required<Omit<RelayServerConfig, 'tlsCert' | 'tlsKey' | 'audit' | 'insecure'>>
             & { tlsCert?: string | Buffer; tlsKey?: string | Buffer; audit: AuditLogger; insecure: boolean };
  private httpServer: http.Server | https.Server | null = null;
  private wss: WebSocketServer | null = null;
  private match: MatchTable;
  private helloRateLimiter: RateLimiter;
  private envelopeRateLimiter: RateLimiter;
  private connections = new Map<string, ConnState>();
  private reaperTimer: NodeJS.Timeout | null = null;

  /** Replay-protection cache for HELLO_INSTANCE proof_sigs (§3.2 step 6). */
  private proofReplayCache = new Map<string, number>();   // key → expiresAtSec

  constructor(rawCfg: RelayServerConfig) {
    // TLS config sanity.
    const tlsCert = rawCfg.tlsCert;
    const tlsKey = rawCfg.tlsKey;
    if ((tlsCert && !tlsKey) || (!tlsCert && tlsKey)) {
      throw new Error('tlsCert and tlsKey must both be set or both omitted');
    }
    const insecure = rawCfg.insecure ?? false;
    if (!tlsCert && !insecure) {
      throw new Error(
        'No TLS cert/key provided. Set tlsCert+tlsKey for direct TLS, OR ' +
        'set insecure=true to run plain WS (e.g. behind a reverse proxy).',
      );
    }

    // Validate and canonicalize ownUrl. In insecure mode (test / reverse-
    // proxy), ws:// is accepted; production mode requires wss://.
    const ownCanonical = canonicalizeRelayUrl(rawCfg.ownUrl, { allowInsecure: insecure });

    const audit = rawCfg.audit ?? createAuditLogger();

    this.cfg = {
      ownUrl: ownCanonical,
      port: rawCfg.port,
      host: rawCfg.host ?? '0.0.0.0',
      tlsCert,
      tlsKey,
      insecure,
      matchLimits: rawCfg.matchLimits ?? { maxSessionsPerInstance: 32, pendingPhoneTimeoutSec: 30 },
      helloRateLimit: rawCfg.helloRateLimit ?? { capacity: 5, refillPerSec: 5 },
      envelopeRateLimit: rawCfg.envelopeRateLimit ?? { capacity: 200, refillPerSec: 200 },
      audit,
      helloGraceSec: rawCfg.helloGraceSec ?? 30,
      reaperIntervalMs: rawCfg.reaperIntervalMs ?? 1000,
    };

    this.match = new MatchTable(this.cfg.matchLimits);
    this.helloRateLimiter = new RateLimiter(this.cfg.helloRateLimit);
    this.envelopeRateLimiter = new RateLimiter(this.cfg.envelopeRateLimit);
  }

  /** Start listening. Resolves once the port is bound. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const httpServer = this.cfg.tlsCert
        ? https.createServer({ cert: this.cfg.tlsCert, key: this.cfg.tlsKey })
        : http.createServer();

      this.wss = new WebSocketServer({
        server: httpServer,
        // §2.2 — bound the receive buffer at the WS-library layer so a
        // malicious peer can't claim a 4 GiB frame and starve the buffer
        // before we even parse the length field.
        maxPayload: MAX_WS_MESSAGE_SIZE,
        // We don't use per-message-deflate; saves CPU + reduces fingerprint.
        perMessageDeflate: false,
        // We do our own framing on top; leave WS protocol bare.
      });

      this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

      httpServer.on('error', (err) => reject(err));
      httpServer.listen(this.cfg.port, this.cfg.host, () => {
        this.httpServer = httpServer;
        // Start the reaper loop.
        this.reaperTimer = setInterval(() => this.runReaper(), this.cfg.reaperIntervalMs);
        // Don't pin the event loop — tests calling stop() should exit cleanly.
        this.reaperTimer.unref?.();
        this.cfg.audit.emit({
          type: 'connect',
          reason: `relay listening on ${this.cfg.host}:${this.actualPort()} (${this.cfg.tlsCert ? 'wss' : 'ws-insecure'})`,
        });
        resolve();
      });
    });
  }

  /** Stop the server. Closes all connections; waits for graceful shutdown. */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.reaperTimer) {
        clearInterval(this.reaperTimer);
        this.reaperTimer = null;
      }
      // Send RELAY_DRAINING to every connection then close.
      for (const conn of this.connections.values()) {
        try {
          conn.ws.send(encodeRelayError(RELAY_ERROR_CODE.RELAY_DRAINING, 'shutdown'));
          conn.ws.close(1001, 'shutting down');
        } catch { /* connection already gone */ }
      }
      this.wss?.close(() => {
        this.httpServer?.close(() => resolve());
      });
    });
  }

  /** Returns the actual bound port (useful when port=0 was passed). */
  actualPort(): number {
    const addr = this.httpServer?.address();
    if (addr && typeof addr === 'object') return addr.port;
    return this.cfg.port;
  }

  // ── Connection lifecycle ──────────────────────────────────────────

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const connId = crypto.randomUUID();
    const remoteAddr = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    let bucketKey: string;
    try {
      bucketKey = ipBucket(remoteAddr);
    } catch {
      // Couldn't bucket this address — close immediately. Shouldn't happen
      // with a normal TCP socket, but defensive.
      ws.close(1011, 'invalid remote');
      return;
    }
    const state: ConnState = {
      connId,
      ws,
      remoteAddr,
      bucketKey,
      helloed: false,
      acceptedAtSec: this.nowSec(),
    };
    this.connections.set(connId, state);
    this.cfg.audit.emit({
      type: 'connect',
      conn_id: connId,
      source: bucketKey,
    });

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      // ws sometimes hands us Buffer[] for fragmented frames; coalesce.
      const buf = Array.isArray(data)
        ? Buffer.concat(data)
        : (data instanceof ArrayBuffer ? Buffer.from(data) : data);
      this.handleMessage(state, buf);
    });
    ws.on('close', () => this.handleClose(state, 'ws_closed'));
    ws.on('error', () => {
      // Errors trigger close as well; nothing additional to do here.
    });
  }

  private handleClose(state: ConnState, reason: string): void {
    if (!this.connections.has(state.connId)) return; // already cleaned
    this.connections.delete(state.connId);
    this.cfg.audit.emit({
      type: 'disconnect',
      conn_id: state.connId,
      reason,
    });
    const actions = this.match.handleDisconnect(state.connId);
    this.executeActions(actions);
  }

  // ── Inbound message dispatch ──────────────────────────────────────

  private handleMessage(state: ConnState, buf: Uint8Array): void {
    let frame;
    try {
      frame = decodeFrame(buf);
    } catch (err) {
      const fe = err as FrameError;
      // Send relay-layer error if we can; close in any case.
      this.sendError(state, mapFrameErrorToCode(fe), fe.code);
      this.closeConn(state, 1002, 'frame_error');
      return;
    }

    switch (frame.type) {
      case TYPE.HELLO_INSTANCE:
        this.handleHelloInstance(state, frame.payload);
        return;
      case TYPE.HELLO_PHONE:
        this.handleHelloPhone(state, frame.payload);
        return;
      case TYPE.ENVELOPE:
        this.handleEnvelope(state, frame.payload);
        return;
      case TYPE.PING:
        // Respond with PONG, no further state mutation.
        this.send(state.ws, encodeFrame(TYPE.PONG, new Uint8Array(0)));
        return;
      case TYPE.PONG:
        // Treat as keepalive evidence; nothing to do.
        return;
      // Any other type is a client trying to send a relay→client message.
      // Reject with BAD_HELLO (clients shouldn't speak ACK_*, ERROR is
      // theoretically allowed but we don't act on client errors at the relay).
      default:
        this.sendError(state, RELAY_ERROR_CODE.BAD_HELLO, `unexpected type 0x${frame.type.toString(16)}`);
        this.closeConn(state, 1002, 'bad_type');
        return;
    }
  }

  private handleHelloInstance(state: ConnState, payload: Uint8Array): void {
    if (state.helloed) {
      this.sendError(state, RELAY_ERROR_CODE.BAD_HELLO, 'already HELLO\'d');
      this.closeConn(state, 1002, 'double_hello');
      return;
    }
    if (!this.helloRateLimiter.consume(state.bucketKey)) {
      this.cfg.audit.emit({
        type: 'rate_limited',
        conn_id: state.connId,
        source: state.bucketKey,
        reason: 'hello',
      });
      this.sendError(state, RELAY_ERROR_CODE.RATE_LIMITED, 'hello flood');
      this.closeConn(state, 1008, 'rate_limited');
      return;
    }

    let parsed;
    try {
      parsed = verifyHelloInstance(payload, {
        ownCanonicalUrl: this.cfg.ownUrl,
        recordProof: (key) => this.recordProofKey(key),
        now: () => this.nowSec(),
      });
    } catch (err) {
      const he = err as HelloVerificationError;
      const code = he.code === HelloError.BAD_HELLO
        ? RELAY_ERROR_CODE.BAD_HELLO
        : RELAY_ERROR_CODE.INVALID_PROOF;
      this.cfg.audit.emit({
        type: 'hello_instance_rejected',
        conn_id: state.connId,
        source: state.bucketKey,
        error_code: code,
        reason: `step ${he.step}`,
      });
      this.sendError(state, code, `step ${he.step}`);
      this.closeConn(state, 1002, 'bad_hello_instance');
      return;
    }

    state.helloed = true;
    const instanceIdHex = bytesToHex(parsed.instance_id);
    this.cfg.audit.emit({
      type: 'hello_instance',
      conn_id: state.connId,
      source: state.bucketKey,
      instance_id_prefix: shortId(instanceIdHex),
    });
    const actions = this.match.registerInstance(state.connId, parsed);
    this.executeActions(actions);
  }

  private handleHelloPhone(state: ConnState, payload: Uint8Array): void {
    if (state.helloed) {
      this.sendError(state, RELAY_ERROR_CODE.BAD_HELLO, 'already HELLO\'d');
      this.closeConn(state, 1002, 'double_hello');
      return;
    }
    if (!this.helloRateLimiter.consume(state.bucketKey)) {
      this.cfg.audit.emit({
        type: 'rate_limited',
        conn_id: state.connId,
        source: state.bucketKey,
        reason: 'hello',
      });
      this.sendError(state, RELAY_ERROR_CODE.RATE_LIMITED, 'hello flood');
      this.closeConn(state, 1008, 'rate_limited');
      return;
    }

    let parsed;
    try {
      parsed = parseHelloPhone(payload);
    } catch (err) {
      const he = err as HelloVerificationError;
      this.cfg.audit.emit({
        type: 'hello_phone_rejected',
        conn_id: state.connId,
        source: state.bucketKey,
        error_code: RELAY_ERROR_CODE.BAD_HELLO,
        reason: he.message,
      });
      this.sendError(state, RELAY_ERROR_CODE.BAD_HELLO, 'malformed');
      this.closeConn(state, 1002, 'bad_hello_phone');
      return;
    }

    state.helloed = true;
    this.cfg.audit.emit({
      type: 'hello_phone',
      conn_id: state.connId,
      source: state.bucketKey,
      instance_id_prefix: shortId(bytesToHex(parsed.instance_id)),
    });
    const actions = this.match.registerPhoneRequest(state.connId, parsed);
    this.executeActions(actions);
  }

  private handleEnvelope(state: ConnState, payload: Uint8Array): void {
    if (!state.helloed) {
      this.sendError(state, RELAY_ERROR_CODE.BAD_HELLO, 'envelope before hello');
      this.closeConn(state, 1002, 'envelope_before_hello');
      return;
    }
    if (payload.length < 16 + 1) {
      this.sendError(state, RELAY_ERROR_CODE.BAD_HELLO, 'envelope too small');
      this.closeConn(state, 1002, 'envelope_short');
      return;
    }
    const sessionIdBytes = payload.slice(0, 16);
    // payload[16] is the inbound from_role byte — IGNORED. The relay
    // sets from_role on the OUTBOUND envelope based on which leg sent
    // the inbound (§3.6). Whatever the client sent is overwritten.
    const inner = payload.slice(17);

    // Per-session ENVELOPE rate limit (§3.10).
    if (!this.envelopeRateLimiter.consume(bytesToHex(sessionIdBytes))) {
      this.cfg.audit.emit({
        type: 'rate_limited',
        conn_id: state.connId,
        session_id_prefix: shortId(bytesToHex(sessionIdBytes)),
        reason: 'envelope',
      });
      this.sendError(state, RELAY_ERROR_CODE.RATE_LIMITED, 'envelope flood');
      // Don't close — the session itself is still usable, just slow down.
      return;
    }

    const actions = this.match.forwardEnvelope(state.connId, sessionIdBytes, inner);
    this.executeActions(actions);
  }

  // ── Periodic reaper ──────────────────────────────────────────────

  private runReaper(): void {
    // 1. Time out pending phones whose 30s window expired.
    const reapActions = this.match.reapStalePending();
    this.executeActions(reapActions);

    // 2. Close connections that haven't HELLO'd within the grace window.
    const now = this.nowSec();
    const cutoff = now - this.cfg.helloGraceSec;
    for (const conn of this.connections.values()) {
      if (!conn.helloed && conn.acceptedAtSec <= cutoff) {
        this.cfg.audit.emit({
          type: 'protocol_error',
          conn_id: conn.connId,
          source: conn.bucketKey,
          reason: 'hello_grace_timeout',
        });
        this.sendError(conn, RELAY_ERROR_CODE.BAD_HELLO, 'hello grace expired');
        this.closeConn(conn, 1008, 'hello_timeout');
      }
    }

    // 3. GC idle rate-limit buckets and proof-replay cache.
    this.helloRateLimiter.reap(60);
    this.envelopeRateLimiter.reap(60);
    this.reapProofReplayCache(now);
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private executeActions(actions: Action[]): void {
    for (const action of actions) {
      const target = this.connections.get(action.connId);
      if (!target) continue;  // peer already gone
      if (action.kind === 'send') {
        this.send(target.ws, action.frame);
      } else {
        // close
        try { target.ws.close(action.code, action.reason); } catch { /* ignore */ }
      }
    }
  }

  private send(ws: WebSocket, frame: Uint8Array): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(frame);
    }
  }

  private sendError(state: ConnState, code: number, reason: string): void {
    this.send(state.ws, encodeRelayError(code, reason));
  }

  private closeConn(state: ConnState, wsCode: number, reason: string): void {
    try { state.ws.close(wsCode, reason); } catch { /* ignore */ }
    this.handleClose(state, reason);
  }

  /** §3.2 step 6 — replay-protection cache. Returns true on first sighting. */
  private recordProofKey(key: string): boolean {
    const now = this.nowSec();
    const existing = this.proofReplayCache.get(key);
    if (existing !== undefined && existing >= now) return false;
    // PROOF_REPLAY_TTL_MS is 60s; convert to seconds.
    this.proofReplayCache.set(key, now + 60);
    return true;
  }

  private reapProofReplayCache(nowSec: number): void {
    for (const [k, exp] of this.proofReplayCache) {
      if (exp < nowSec) this.proofReplayCache.delete(k);
    }
  }

  private nowSec(): number {
    return Math.floor(Date.now() / 1000);
  }

  // ── Introspection (tests) ─────────────────────────────────────────

  connectionCount(): number { return this.connections.size; }
  matchTable(): MatchTable { return this.match; }
}

// ── Frame-error → relay-error code mapping ───────────────────────────

function mapFrameErrorToCode(fe: FrameError): number {
  // Defensive — translate a parse-level error into a §6.2 code.
  if (fe.message.includes('BAD_VERSION')) return 0x0001;
  if (fe.message.includes('MSG_TOO_LARGE')) return RELAY_ERROR_CODE.MSG_TOO_LARGE;
  return RELAY_ERROR_CODE.BAD_HELLO;
}
