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
  parseDialInstance,
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
  verifyHelloComm,
  CommHelloVerificationError,
  CommHelloError,
} from './comm-hello.js';
import {
  ContactRegistry,
  parseSendComm,
  parseAckDelivery,
  DEFAULT_COMM_LIMITS,
  type CommRegistryLimits,
  type Action as CommAction,
} from './comm-registry.js';
import {
  createAuditLogger,
  shortId,
  type AuditLogger,
} from './audit.js';
import { canonicalizeRelayUrl } from './canonical-url.js';
import { bytesToHex } from './primitives.js';
import { MetricsRegistry } from './metrics.js';
import { createRegistryDb, type RegistryDb } from './registry/db.js';
import { dispatch as dispatchRegistry } from './registry/routes.js';
import { pino, type Logger } from 'pino';

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
  /** Comm-to-Comm registry limits. Defaults applied if not provided
   *  (docs/COMM_RELAY_PROTOCOL_v0_1.md §7). */
  commLimits?: CommRegistryLimits;
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
  /**
   * Drain interval on stop() — RELAY_DRAINING is emitted to all clients,
   * then the relay waits this many ms before closing the WSS so phones
   * have a chance to fail over to another relay before their connection
   * drops. Default 5000ms (5s). Set to 0 for tests / immediate shutdown.
   */
  drainIntervalMs?: number;
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
  private commRegistry: ContactRegistry;
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
      commLimits: rawCfg.commLimits ?? DEFAULT_COMM_LIMITS,
      helloRateLimit: rawCfg.helloRateLimit ?? { capacity: 5, refillPerSec: 5 },
      envelopeRateLimit: rawCfg.envelopeRateLimit ?? { capacity: 200, refillPerSec: 200 },
      audit,
      helloGraceSec: rawCfg.helloGraceSec ?? 30,
      reaperIntervalMs: rawCfg.reaperIntervalMs ?? 1000,
      drainIntervalMs: rawCfg.drainIntervalMs ?? 5000,
    };

    this.match = new MatchTable(this.cfg.matchLimits);
    this.commRegistry = new ContactRegistry(this.cfg.commLimits);
    this.helloRateLimiter = new RateLimiter(this.cfg.helloRateLimit);
    this.envelopeRateLimiter = new RateLimiter(this.cfg.envelopeRateLimit);
  }

  /** Operational counters — exposed at /metrics. */
  private metrics = new MetricsRegistry();

  /** Portal registry DB handle. Null when RELAY_REGISTRY_DATABASE_URL is unset
   *  (or registryDb wasn't injected via config) — /v1/* routes return 503. */
  private registryDb: RegistryDb | null = null;

  /** Shared logger for registry routes. */
  private registryLogger: Logger = pino({ name: 'relay-registry' });

  /** Start listening. Resolves once the port is bound. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const httpServer = this.cfg.tlsCert
        ? https.createServer({ cert: this.cfg.tlsCert, key: this.cfg.tlsKey })
        : http.createServer();

      // ── HTTP routes for ops + portal registry ───────────────────
      // The 'request' handler runs for non-upgrade HTTP requests; the
      // WSS attaches its own 'upgrade' listener so WS connections are
      // unaffected. We expose:
      //   /healthz, /metrics — relay ops (always on)
      //   /v1/*             — portal registry (only if RELAY_REGISTRY_DATABASE_URL is set)
      //
      // Spawn the registry DB lazily on first request so the relay can
      // start without Postgres in dev / no-registry deployments.
      this.registryDb = createRegistryDb({ logger: this.registryLogger });
      httpServer.on('request', (req, res) => {
        const url = req.url ?? '/';
        if (req.method === 'GET' && (url === '/healthz' || url === '/healthz/')) {
          const snap = this.metrics.snapshot(this.match.sessionCount(), this.match.instanceCount());
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            ok: true,
            version: '0.1.0',
            uptime_sec: snap.uptime_sec,
            active_sessions: snap.active_sessions,
            active_instances: snap.active_instances,
            ws_connections: this.connections.size,
            registry_enabled: this.registryDb !== null,
          }));
          return;
        }
        if (req.method === 'GET' && (url === '/metrics' || url === '/metrics/')) {
          res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
          res.end(this.metrics.renderProm(this.match.sessionCount(), this.match.instanceCount()));
          return;
        }
        // /v1/* → portal registry dispatcher. Returns false when path
        // is not under /v1/, in which case we fall through to 404.
        if (url.startsWith('/v1/')) {
          void dispatchRegistry(req, res, {
            db: this.registryDb,
            logger: this.registryLogger,
          }).catch((err: unknown) => {
            // Defensive — handlers should never throw synchronously,
            // but if one does we don't want the connection to hang.
            this.registryLogger.error({ err: (err as Error)?.message }, 'registry dispatch failed');
            if (!res.writableEnded) {
              res.writeHead(500, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ error: 'internal_error' }));
            }
          });
          return;
        }
        // Anything else is 404. Don't leak internals.
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found\n');
      });

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

  /**
   * Stop the server gracefully:
   *   1. Stop the reaper.
   *   2. Stop accepting new WS connections (httpServer.close()).
   *   3. Emit RELAY_DRAINING to every live WS — phones use this signal to
   *      pre-migrate to the next relay BEFORE their connection drops,
   *      avoiding the thundering-herd on the failover relay.
   *   4. Wait `drainIntervalMs` to give clients time to receive + react.
   *   5. Close all WS connections + the HTTP server.
   *
   * Tests may pass `drainIntervalMs: 0` to skip the wait. Production should
   * leave the default 5s.
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.reaperTimer) {
        clearInterval(this.reaperTimer);
        this.reaperTimer = null;
      }
      // 1. Stop accepting new connections immediately. In-flight handshakes
      //    can still complete; new WS upgrades are refused.
      this.wss?.close();

      // 2. Notify every active leg that we're going away. Phones treat
      //    RELAY_DRAINING as "try the next relay now, don't wait for me
      //    to drop the connection."
      for (const conn of this.connections.values()) {
        try {
          conn.ws.send(encodeRelayError(RELAY_ERROR_CODE.RELAY_DRAINING, 'shutdown'));
        } catch { /* connection already gone */ }
      }

      // 3. Wait the drain interval (or 0 in tests) before tearing everyone
      //    down. ref-tracked timeout so tests don't hang the event loop.
      const drainTimer = setTimeout(() => {
        for (const conn of this.connections.values()) {
          try { conn.ws.close(1001, 'shutting down'); } catch { /* ignore */ }
        }
        // 4. Close the registry DB pool if it was opened. Done after WS
        //    teardown so in-flight HTTP requests have a chance to finish.
        const closeServer = () => this.httpServer?.close(() => resolve());
        if (this.registryDb) {
          this.registryDb.end().then(closeServer).catch(closeServer);
        } else {
          closeServer();
        }
      }, this.cfg.drainIntervalMs);
      drainTimer.unref?.();
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
    this.metrics.wsOpened();
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
    this.metrics.wsClosed();
    this.cfg.audit.emit({
      type: 'disconnect',
      conn_id: state.connId,
      reason,
    });
    const actions = this.match.handleDisconnect(state.connId);
    this.executeActions(actions);
    // Also clean up any Comm-side session bound to this connection.
    const commActions = this.commRegistry.handleDisconnect(state.connId);
    this.executeCommActions(commActions);
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
      case TYPE.DIAL_INSTANCE:
        this.handleDialInstance(state, frame.payload);
        return;
      case TYPE.ENVELOPE:
        this.handleEnvelope(state, frame.payload);
        return;
      case TYPE.HELLO_COMM:
        this.handleHelloComm(state, frame.payload);
        return;
      case TYPE.SEND_COMM:
        this.handleSendComm(state, frame.payload);
        return;
      case TYPE.ACK_DELIVERY:
        this.handleAckDelivery(state, frame.payload);
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

  // ── Comm-to-Comm handlers (docs/COMM_RELAY_PROTOCOL_v0_1.md) ────────

  private handleHelloComm(state: ConnState, payload: Uint8Array): void {
    if (state.helloed) {
      this.sendError(state, RELAY_ERROR_CODE.BAD_HELLO, 'already HELLO\'d');
      this.closeConn(state, 1002, 'double_hello');
      return;
    }
    if (!this.helloRateLimiter.consume(state.bucketKey)) {
      this.metrics.rateLimited();
      this.cfg.audit.emit({
        type: 'rate_limited',
        conn_id: state.connId,
        source: state.bucketKey,
        reason: 'hello_comm',
      });
      this.sendError(state, RELAY_ERROR_CODE.RATE_LIMITED, 'hello flood');
      this.closeConn(state, 1008, 'rate_limited');
      return;
    }

    let routing_id: Uint8Array;
    try {
      const result = verifyHelloComm(payload, {
        ownCanonicalUrl: this.cfg.ownUrl,
        recordProof: (key) => this.recordProofKey(key),
        now: () => this.nowSec(),
      });
      routing_id = result.routing_id;
    } catch (err) {
      const he = err as CommHelloVerificationError;
      const code = he.code === CommHelloError.BAD_HELLO
        ? RELAY_ERROR_CODE.BAD_HELLO
        : RELAY_ERROR_CODE.INVALID_PROOF;
      this.metrics.helloRejected(code);
      this.cfg.audit.emit({
        type: 'hello_instance_rejected', // reuse existing audit type — kind extracted in 'reason'
        conn_id: state.connId,
        source: state.bucketKey,
        error_code: code,
        reason: `comm step ${he.step}`,
      });
      this.sendError(state, code, `step ${he.step}`);
      this.closeConn(state, 1002, 'bad_hello_comm');
      return;
    }

    state.helloed = true;
    this.metrics.helloAccepted();
    const actions = this.commRegistry.registerComm(state.connId, routing_id);
    this.executeCommActions(actions);
  }

  private handleSendComm(state: ConnState, payload: Uint8Array): void {
    if (!state.helloed) {
      this.sendError(state, RELAY_ERROR_CODE.BAD_HELLO, 'SEND_COMM before HELLO_COMM');
      this.closeConn(state, 1002, 'send_before_hello');
      return;
    }
    let parsed;
    try {
      parsed = parseSendComm(payload);
    } catch (err) {
      this.sendError(state, RELAY_ERROR_CODE.BAD_HELLO, (err as Error).message);
      return;
    }
    const actions = this.commRegistry.routeSend(
      state.connId,
      parsed.session_id,
      parsed.target_routing_id,
      parsed.message_id,
      parsed.ciphertext,
    );
    this.executeCommActions(actions);
  }

  private handleAckDelivery(state: ConnState, payload: Uint8Array): void {
    if (!state.helloed) return; // best-effort, ignore stray acks
    let parsed;
    try {
      parsed = parseAckDelivery(payload);
    } catch {
      return; // best-effort; malformed ack is silently dropped
    }
    // The recipient knows the original sender's routing_id from the
    // DELIVER_COMM's from_routing_id field. We don't carry it on the wire
    // for ACK_DELIVERY (clients echo just message_id+kind). For the v0.1
    // best-effort delivery-ack flow this is acceptable — sender state-tick
    // updates depend on the client side correlating message_id.
    // Future: include from_routing_id explicitly. For now, no-op.
    void parsed;
  }

  private executeCommActions(actions: CommAction[]): void {
    // ContactRegistry.Action has the same shape as MatchTable.Action.
    this.executeActions(actions as unknown as Action[]);
  }

  private handleHelloInstance(state: ConnState, payload: Uint8Array): void {
    if (state.helloed) {
      this.sendError(state, RELAY_ERROR_CODE.BAD_HELLO, 'already HELLO\'d');
      this.closeConn(state, 1002, 'double_hello');
      return;
    }
    if (!this.helloRateLimiter.consume(state.bucketKey)) {
      this.metrics.rateLimited();
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
      this.metrics.helloRejected(code);
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
    this.metrics.helloAccepted();
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
      this.metrics.rateLimited();
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
      this.metrics.helloRejected(RELAY_ERROR_CODE.BAD_HELLO);
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
    this.metrics.helloAccepted();
    this.cfg.audit.emit({
      type: 'hello_phone',
      conn_id: state.connId,
      source: state.bucketKey,
      instance_id_prefix: shortId(bytesToHex(parsed.instance_id)),
    });
    const actions = this.match.registerPhoneRequest(state.connId, parsed);
    this.executeActions(actions);
  }

  /**
   * §3.11 — instance-to-instance dial. The dialer's connection MUST already
   * have completed HELLO_INSTANCE; the matcher's role check enforces that.
   * No fresh proof here — identity is inherited from the registered leg.
   */
  private handleDialInstance(state: ConnState, payload: Uint8Array): void {
    if (!state.helloed) {
      this.sendError(state, RELAY_ERROR_CODE.BAD_HELLO, 'DIAL_INSTANCE before HELLO_INSTANCE');
      this.closeConn(state, 1002, 'dial_before_hello');
      return;
    }
    let parsed;
    try {
      parsed = parseDialInstance(payload);
    } catch (err) {
      const he = err as HelloVerificationError;
      this.cfg.audit.emit({
        type: 'dial_instance_rejected',
        conn_id: state.connId,
        source: state.bucketKey,
        error_code: RELAY_ERROR_CODE.BAD_HELLO,
        reason: he.message,
      });
      this.sendError(state, RELAY_ERROR_CODE.BAD_HELLO, 'malformed');
      this.closeConn(state, 1002, 'bad_dial_instance');
      return;
    }
    this.cfg.audit.emit({
      type: 'dial_instance',
      conn_id: state.connId,
      source: state.bucketKey,
      instance_id_prefix: shortId(bytesToHex(parsed.target_instance_id)),
    });
    const actions = this.match.registerInstanceDial(state.connId, parsed);
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
      this.metrics.rateLimited();
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
    // Forwarded vs rejected: an action of kind 'send' targeting a different
    // conn means a successful forward; an ERROR back to the sender means
    // we couldn't route. Cheap classification at the executeActions site
    // would couple metrics to action shape — easier here.
    let forwarded = false;
    for (const a of actions) {
      if (a.kind === 'send' && a.connId !== state.connId) { forwarded = true; break; }
    }
    if (forwarded) this.metrics.envelopeForwarded();
    else this.metrics.envelopeRejected();
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

    // 4. Reap stale Comm-mailbox entries (7-day TTL).
    this.commRegistry.reapStaleMailbox();
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
