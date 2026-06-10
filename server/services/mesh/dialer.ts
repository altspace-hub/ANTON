/**
 * dialer.ts — long-lived dialer from an ANTON instance to one or more relays.
 *
 * Per spec §1.4: "Instance dials all of its configured relays in parallel
 * so any phone can reach it via any of them." This module maintains those
 * connections, sending HELLO_INSTANCE on each, reconnecting with bounded
 * exponential backoff on failure, and dispatching inbound ENVELOPE frames
 * to a per-session Noise responder.
 *
 * Frame codec lives in relay/src/frame.ts (the same wire format both ends
 * speak); rather than duplicate the codec, this module re-implements just
 * the encode/decode functions it needs against the same spec §2 layout.
 *
 * Phase 3.3 scope:
 *   - Connection lifecycle (dial, reconnect, close)
 *   - HELLO_INSTANCE construction + send on connect
 *   - ACK_INSTANCE handler that begins a Noise responder for a new session
 *   - Inbound ENVELOPE → matched session's Noise transport (decrypt path)
 *   - Outbound: a `send(sessionId, plaintext)` API that encrypts via the
 *     session's Noise transport and ships out as an ENVELOPE
 *
 * Phase 3.4 (NOT in this commit) layers Express request bridging on top.
 */

import { WebSocket } from 'ws';
import crypto from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519';
import { NoiseInitiator, NoiseResponder, NoiseTransport, buildPrologue, type KeyPair } from './noise.js';

// ── Wire-frame constants (mirrors relay/src/frame.ts §2) ─────────────

const WIRE_VERSION = 0x01;
const TYPE_HELLO_INSTANCE = 0x01;
const TYPE_ACK_INSTANCE   = 0x03;
const TYPE_ACK_PHONE      = 0x04;
const TYPE_PING           = 0x05;
const TYPE_PONG           = 0x06;
const TYPE_DIAL_INSTANCE  = 0x07;  // §3.11 — instance dialing peer instance
const TYPE_ERROR          = 0x0F;
const TYPE_ENVELOPE       = 0x10;

const ROLE_PHONE    = 0x01;  // initiator side of a session
const ROLE_INSTANCE = 0x02;  // responder side of a session

// ── Public types ────────────────────────────────────────────────────

export interface DialerConfig {
  /** Canonical URLs of relays to dial in parallel (each MUST be wss:// in prod). */
  relayUrls: string[];
  /** Instance's long-term Ed25519 keypair (signing). */
  ed25519: KeyPair;
  /** Instance's long-term X25519 keypair (Noise static, derived from Ed25519). */
  x25519: KeyPair;
  /** instance_id: sha256(x25519.publicKey)[0..16). */
  instanceId: Uint8Array;
  /** binding_sig: Ed25519(ed_pk) over ("ANTON-MESH-IDENTITY/v1\n" || ed_pk || x_pk). */
  bindingSig: Uint8Array;
  /** Capabilities bitfield (§3.7). v0.1 instances send 0. */
  caps?: number;
  /** Initial backoff in ms; doubles on each consecutive failure (cap 30s). Default 1000ms. */
  initialBackoffMs?: number;
  /** Maximum backoff in ms. Default 30000ms. */
  maxBackoffMs?: number;
  /** Hook called when a new session matches and a Noise responder is created. */
  onSessionOpen?: (sessionId: Uint8Array, ctx: SessionContext) => void;
  /** Hook called when a session ends (peer gone, error, etc.). */
  onSessionClose?: (sessionId: Uint8Array, reason: string) => void;
  /** Hook called for each successfully-decrypted inbound application payload. */
  onSessionData?: (sessionId: Uint8Array, plaintext: Uint8Array) => void;
  /** Hook called when the dialer enters/leaves the "connected to ≥1 relay" state. */
  onReachabilityChange?: (reachable: boolean) => void;
}

/** Per-session handles given to the application layer. */
export interface SessionContext {
  /** Encrypt + send `plaintext` as an ENVELOPE through the relay this session lives on. */
  send(plaintext: Uint8Array): void;
  /** Tear down the session locally (does not signal the peer; relay will PEER_GONE). */
  close(reason?: string): void;
  /** The peer's static X25519 pubkey. For phone-initiated sessions this is
   *  the phone's static (recovered from Noise IK msg 1). For instance-dialed
   *  sessions this is the responder's static (known up-front from the
   *  community contact card / pairing — we used it to construct msg 1). */
  phoneStaticPubkey: Uint8Array;
  /**
   * Route inbound decrypted payloads for THIS session to `listener` instead
   * of the dialer-global onSessionData hook (which is wired to the Express
   * bridge and treats inbound RESPONSE frames as protocol violations).
   * Pass null to restore the global hook. Used by peer-transport-service
   * to await the RPC RESPONSE for an initiator-dialed request.
   *
   * Optional so test doubles that only exercise the responder path don't
   * have to implement it.
   */
  setDataListener?(listener: ((plaintext: Uint8Array) => void) | null): void;
}

interface ActiveSession {
  sessionId: Uint8Array;
  sessionIdHex: string;
  relayUrl: string;
  transport: NoiseTransport;
  /** Peer's static X25519 — kept under the original name for ABI compat with
   *  callers that introspect the field; see SessionContext.phoneStaticPubkey. */
  phoneStaticPubkey: Uint8Array;
  /** §3.11 — this side's role in the session, for the envelope direction
   *  check. 'responder' = we accept a phone or peer dial (existing path,
   *  expect from_role=PHONE on incoming). 'initiator' = we dialed a peer
   *  via DIAL_INSTANCE (expect from_role=INSTANCE on incoming). */
  myRole: 'initiator' | 'responder';
}

/**
 * §3.11 — state for a dial-out that is waiting for ACK_PHONE (and then for
 * ENVELOPE carrying Noise msg 2). Indexed two ways:
 *   - by relayUrl (FIFO queue) before ACK_PHONE arrives, so we can match
 *     the next ACK_PHONE on that leg to the oldest pending dial
 *   - by sessionIdHex after ACK_PHONE, so the next ENVELOPE on that session
 *     drives the Noise initiator to msg 2 + transport
 */
interface PendingDial {
  initiator: NoiseInitiator;
  peerStaticPubkey: Uint8Array;
  relayUrl: string;
  resolve: (ctx: SessionContext) => void;
  reject: (err: Error) => void;
  timeoutTimer: ReturnType<typeof setTimeout>;
  sessionIdHex?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

const PROOF_DOMAIN = new TextEncoder().encode('ANTON-MESH-HELLO-INSTANCE/v1\n');

function u32BE(n: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (n >>> 24) & 0xFF;
  out[1] = (n >>> 16) & 0xFF;
  out[2] = (n >>> 8) & 0xFF;
  out[3] = n & 0xFF;
  return out;
}

function encodeFrame(type: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + payload.length);
  out[0] = WIRE_VERSION;
  out[1] = type;
  out[2] = (payload.length >>> 16) & 0xFF;
  out[3] = (payload.length >>> 8) & 0xFF;
  out[4] = payload.length & 0xFF;
  out.set(payload, 5);
  return out;
}

interface DecodedFrame {
  type: number;
  payload: Uint8Array;
}

function decodeFrame(buf: Uint8Array): DecodedFrame {
  if (buf.length < 5) throw new Error('frame: short header');
  if (buf[0] !== WIRE_VERSION) throw new Error(`frame: bad version 0x${buf[0]!.toString(16)}`);
  const len = (buf[2]! << 16) | (buf[3]! << 8) | buf[4]!;
  if (5 + len !== buf.length) throw new Error(`frame: length mismatch (declared ${len}, have ${buf.length - 5})`);
  return { type: buf[1]!, payload: buf.slice(5) };
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function buildHelloInstancePayload(cfg: DialerConfig, relayUrl: string): Uint8Array {
  const relayBytes = new TextEncoder().encode(relayUrl);
  const timestamp = Math.floor(Date.now() / 1000);

  const proofMsg = concat(
    PROOF_DOMAIN,
    cfg.instanceId,
    cfg.x25519.publicKey,
    cfg.ed25519.publicKey,
    relayBytes,
    u32BE(timestamp),
  );
  const proofSig = ed25519.sign(proofMsg, cfg.ed25519.privateKey);

  // Layout from spec §3.2:
  //   instance_id (16) | x_pk (32) | ed_pk (32) | binding_sig (64)
  //   | relay_url_len (u16) | relay_url | timestamp (u32 BE) | proof_sig (64) | caps (u32 BE)
  const out = new Uint8Array(16 + 32 + 32 + 64 + 2 + relayBytes.length + 4 + 64 + 4);
  let off = 0;
  out.set(cfg.instanceId, off); off += 16;
  out.set(cfg.x25519.publicKey, off); off += 32;
  out.set(cfg.ed25519.publicKey, off); off += 32;
  out.set(cfg.bindingSig, off); off += 64;
  out[off] = (relayBytes.length >>> 8) & 0xFF;
  out[off + 1] = relayBytes.length & 0xFF;
  off += 2;
  out.set(relayBytes, off); off += relayBytes.length;
  out.set(u32BE(timestamp), off); off += 4;
  out.set(proofSig, off); off += 64;
  out.set(u32BE(cfg.caps ?? 0), off);
  return out;
}

// ── MeshDialer ──────────────────────────────────────────────────────

export class MeshDialer {
  private cfg: Required<Pick<DialerConfig, 'caps' | 'initialBackoffMs' | 'maxBackoffMs'>> & DialerConfig;
  private legs = new Map<string, RelayLeg>();
  private sessions = new Map<string, ActiveSession>();
  /** Reverse map: sessionIdHex → which relay URL the session lives on. */
  private sessionRelay = new Map<string, string>();
  /** §3.11 — dial-outs that have sent DIAL_INSTANCE and are awaiting
   *  ACK_PHONE. FIFO per leg so we can match the next ACK_PHONE on a
   *  given relayUrl to the oldest pending dial there. */
  private pendingDialsByLeg = new Map<string, PendingDial[]>();
  /** §3.11 — dial-outs that have received ACK_PHONE (so session_id is
   *  known) but are still awaiting ENVELOPE with Noise msg 2. */
  private pendingDialsBySession = new Map<string, PendingDial>();
  /** Per-session data listeners (SessionContext.setDataListener). When set
   *  for a session, inbound plaintext for that session goes to the listener
   *  instead of the global onSessionData hook. */
  private sessionDataListeners = new Map<string, (plaintext: Uint8Array) => void>();
  private stopping = false;
  private prevReachable = false;

  constructor(cfg: DialerConfig) {
    if (cfg.relayUrls.length === 0) throw new Error('relayUrls must be non-empty');
    this.cfg = {
      caps: 0,
      initialBackoffMs: 1000,
      maxBackoffMs: 30_000,
      ...cfg,
    };
  }

  /** Start dialing all configured relays. Returns immediately; the dialer
   *  reconnects in the background until stop() is called. */
  start(): void {
    for (const url of this.cfg.relayUrls) {
      const leg = new RelayLeg(url, this);
      this.legs.set(url, leg);
      leg.connect();
    }
  }

  /** Stop dialing and close everything. */
  stop(): void {
    this.stopping = true;
    for (const leg of this.legs.values()) leg.shutdown();
    this.legs.clear();
    for (const sid of this.sessions.keys()) {
      this.cfg.onSessionClose?.(this.sessions.get(sid)!.sessionId, 'dialer_stopping');
    }
    this.sessions.clear();
    this.sessionRelay.clear();
    this.sessionDataListeners.clear();
  }

  /** Number of relays currently connected (HELLO sent). For tests + telemetry. */
  legCount(): number {
    let n = 0;
    for (const l of this.legs.values()) if (l.connected()) n++;
    return n;
  }

  /** Active matched-session count. */
  sessionCount(): number {
    return this.sessions.size;
  }

  // ── §3.11 dial-out (instance-to-instance) ──────────────────────────

  /**
   * Dial a peer instance over the mesh. Sends DIAL_INSTANCE on the first
   * connected leg, awaits ACK_PHONE + the responder's Noise msg 2, and
   * resolves with a SessionContext for sending application data.
   *
   * Caller MUST already know the peer's static X25519 pubkey — typically
   * from the community contact card (community_connections.peer_instance_pubkey
   * is the Ed25519, which the caller derives X25519 from via
   * ed_pk_to_curve25519). This function does NOT do peer discovery.
   */
  async dialPeer(opts: {
    /** 16-byte target instance_id = sha256(peer_x_pk)[0..16). */
    peerInstanceId: Uint8Array;
    /** 32-byte peer X25519 static pubkey (Noise responder static). */
    peerStaticPubkey: Uint8Array;
    /** Total time budget for ACK_PHONE + msg 2. Default 10s. */
    timeoutMs?: number;
  }): Promise<SessionContext> {
    if (opts.peerInstanceId.length !== 16) throw new Error('peerInstanceId must be 16 bytes');
    if (opts.peerStaticPubkey.length !== 32) throw new Error('peerStaticPubkey must be 32 bytes');

    // Pick any connected leg. v0.1 strategy: first connected wins. A future
    // iteration can rotate / pick by latency / spread sessions across relays.
    let chosenLeg: RelayLeg | null = null;
    for (const leg of this.legs.values()) {
      if (leg.connected()) { chosenLeg = leg; break; }
    }
    if (!chosenLeg) throw new Error('dialPeer: no connected relay legs');

    // Build NoiseInitiator + msg 1. The same prologue formula as the responder
    // path so both sides agree on the binding (relay_url + target_instance_id).
    const targetInstanceIdHex = bytesToHex(opts.peerInstanceId);
    const prologue = buildPrologue(chosenLeg.url, targetInstanceIdHex);
    const initiator = new NoiseInitiator({
      staticKeypair: this.cfg.x25519,
      responderStatic: opts.peerStaticPubkey,
      prologue,
    });
    const noiseInitMsg = initiator.writeMessage1();

    // The first 32 bytes of noiseInitMsg are the initiator ephemeral
    // pubkey (NoiseInitiator's writeMessage1 layout — see noise.ts:333).
    // The relay matcher mirrors this into ACK_INSTANCE for the target.
    const initiatorEphemPk = noiseInitMsg.slice(0, 32);

    // DIAL_INSTANCE payload: target_instance_id (16) | initiator_ephem_pk (32) | noise_init_msg
    const payload = new Uint8Array(16 + 32 + noiseInitMsg.length);
    payload.set(opts.peerInstanceId, 0);
    payload.set(initiatorEphemPk, 16);
    payload.set(noiseInitMsg, 16 + 32);

    return new Promise<SessionContext>((resolve, reject) => {
      const timeoutMs = opts.timeoutMs ?? 10_000;
      const dial: PendingDial = {
        initiator,
        peerStaticPubkey: opts.peerStaticPubkey,
        relayUrl: chosenLeg!.url,
        resolve,
        reject,
        timeoutTimer: setTimeout(() => {
          this.failPendingDial(dial, new Error('dialPeer: timeout waiting for peer'));
        }, timeoutMs),
      };
      let queue = this.pendingDialsByLeg.get(chosenLeg!.url);
      if (!queue) { queue = []; this.pendingDialsByLeg.set(chosenLeg!.url, queue); }
      queue.push(dial);

      // Send DIAL_INSTANCE last — between push and send the leg can't fire
      // ACK_PHONE since we haven't asked yet. (Even if it did, our queue is
      // already armed.)
      try {
        chosenLeg!.sendFrame(encodeFrame(TYPE_DIAL_INSTANCE, payload));
      } catch (err) {
        this.failPendingDial(dial, err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Internal — called from RelayLeg ───────────────────────────────

  /** A relay leg connected. Send HELLO_INSTANCE down it. */
  legOpen(leg: RelayLeg): void {
    const payload = buildHelloInstancePayload(this.cfg, leg.url);
    leg.sendFrame(encodeFrame(TYPE_HELLO_INSTANCE, payload));
    this.updateReachability();
  }

  /** A relay leg disconnected. Tear down any sessions that lived on it. */
  legClose(leg: RelayLeg, reason: string): void {
    for (const [sidHex, relayUrl] of this.sessionRelay) {
      if (relayUrl === leg.url) {
        const session = this.sessions.get(sidHex);
        if (session) {
          this.cfg.onSessionClose?.(session.sessionId, `relay_closed:${reason}`);
          this.sessions.delete(sidHex);
        }
        this.sessionRelay.delete(sidHex);
        this.sessionDataListeners.delete(sidHex);
      }
    }
    // §3.11 — fail any in-flight dial-outs on this leg.
    const pending = this.pendingDialsByLeg.get(leg.url);
    if (pending) {
      for (const dial of pending) this.failPendingDial(dial, new Error(`dial: leg closed (${reason})`));
      this.pendingDialsByLeg.delete(leg.url);
    }
    for (const [sidHex, dial] of this.pendingDialsBySession) {
      if (dial.relayUrl === leg.url) {
        this.failPendingDial(dial, new Error(`dial: leg closed before msg 2 (${reason})`));
        // failPendingDial deletes from pendingDialsBySession, so the iterator is
        // safe to continue on the underlying Map (entries() is forgiving).
        void sidHex;
      }
    }
    this.updateReachability();
  }

  /** A frame arrived from a relay. Decode and dispatch. */
  legMessage(leg: RelayLeg, raw: Uint8Array): void {
    let frame: DecodedFrame;
    try {
      frame = decodeFrame(raw);
    } catch {
      // Malformed frame from relay — close the leg, will reconnect.
      leg.closeWithReason(1002, 'bad_frame');
      return;
    }
    switch (frame.type) {
      case TYPE_ACK_INSTANCE:
        this.handleAckInstance(leg, frame.payload);
        return;
      case TYPE_ACK_PHONE:
        // §3.11 — relay confirms our DIAL_INSTANCE matched. Returns session_id.
        this.handleAckPhone(leg, frame.payload);
        return;
      case TYPE_ENVELOPE:
        this.handleEnvelope(leg, frame.payload);
        return;
      case TYPE_PING:
        leg.sendFrame(encodeFrame(TYPE_PONG, new Uint8Array(0)));
        return;
      case TYPE_PONG:
        return;
      case TYPE_ERROR:
        // Relay-level error — log & let leg close itself.
        leg.closeWithReason(1000, 'relay_error');
        return;
      default:
        // Unexpected type (e.g. HELLO_PHONE addressed at us). Close leg.
        leg.closeWithReason(1002, 'unexpected_type');
        return;
    }
  }

  // ── ACK_INSTANCE handler — start Noise responder for a new session ──

  private handleAckInstance(leg: RelayLeg, payload: Uint8Array): void {
    // §3.4 layout: phone_ephem_pk (32) || noise_init_msg (variable) || session_id (16)
    if (payload.length < 32 + 16) {
      leg.closeWithReason(1002, 'ack_instance_short');
      return;
    }
    const sessionId = payload.slice(payload.length - 16);
    const noiseInitMsg = payload.slice(32, payload.length - 16);

    // Run the Noise IK responder against this initiator's msg 1.
    const sessionIdHex = bytesToHex(sessionId);
    const instanceIdHex = bytesToHex(this.cfg.instanceId);
    const prologue = buildPrologue(leg.url, instanceIdHex);
    const responder = new NoiseResponder({
      staticKeypair: this.cfg.x25519,
      prologue,
    });
    let phoneStaticPubkey: Uint8Array;
    try {
      const r = responder.readMessage1(noiseInitMsg);
      phoneStaticPubkey = r.initiatorStatic;
    } catch {
      // Failed handshake msg 1 — the phone is unauthenticated. Send a
      // Noise-handshake-layer error inside an ENVELOPE so it knows to give
      // up. (For v0.1 we just close the session locally; relay will time
      // it out and notify the phone with PEER_GONE.)
      return;
    }
    let transport: NoiseTransport;
    try {
      const r = responder.writeMessage2();
      transport = r.transport;
      // Send msg 2 to the phone via this relay leg as an ENVELOPE.
      leg.sendFrame(encodeFrame(TYPE_ENVELOPE, this.buildEnvelope(sessionId, r.message)));
    } catch {
      return;
    }

    const session: ActiveSession = {
      sessionId,
      sessionIdHex,
      relayUrl: leg.url,
      transport,
      phoneStaticPubkey,
      myRole: 'responder',
    };
    this.sessions.set(sessionIdHex, session);
    this.sessionRelay.set(sessionIdHex, leg.url);

    const ctx: SessionContext = {
      send: (plaintext: Uint8Array) => this.sendApplicationMessage(sessionId, plaintext),
      close: (reason = 'closed_by_app') => this.closeSession(sessionId, reason),
      phoneStaticPubkey,
      setDataListener: (listener) => this.setSessionDataListener(sessionIdHex, listener),
    };
    this.cfg.onSessionOpen?.(sessionId, ctx);
  }

  // ── ACK_PHONE handler (§3.11 dial-out path) ────────────────────────

  /**
   * Relay confirms our DIAL_INSTANCE matched the target — payload is the
   * 16-byte session_id. Match it to the oldest pending dial on this leg
   * (FIFO) and move that dial into pendingDialsBySession so the next
   * ENVELOPE on this session drives the Noise initiator to msg 2.
   */
  private handleAckPhone(leg: RelayLeg, payload: Uint8Array): void {
    if (payload.length !== 16) {
      leg.closeWithReason(1002, 'ack_phone_bad_size');
      return;
    }
    const queue = this.pendingDialsByLeg.get(leg.url);
    if (!queue || queue.length === 0) {
      // ACK_PHONE without a pending dial — relay misbehaving or our state
      // got out of sync. Close the leg; reconnect will resync.
      leg.closeWithReason(1002, 'ack_phone_no_pending');
      return;
    }
    const dial = queue.shift()!;
    if (queue.length === 0) this.pendingDialsByLeg.delete(leg.url);
    const sessionIdHex = bytesToHex(payload);
    dial.sessionIdHex = sessionIdHex;
    this.pendingDialsBySession.set(sessionIdHex, dial);
    this.sessionRelay.set(sessionIdHex, leg.url);
  }

  // ── ENVELOPE handler — decrypt with Noise, dispatch plaintext ──────

  private handleEnvelope(leg: RelayLeg, payload: Uint8Array): void {
    // §3.6 layout: session_id (16) | from_role (1) | inner (variable)
    if (payload.length < 17) {
      leg.closeWithReason(1002, 'envelope_short');
      return;
    }
    const sessionId = payload.slice(0, 16);
    const sessionIdHex = bytesToHex(sessionId);
    const fromRole = payload[16];
    const inner = payload.slice(17);

    // §3.11 — pending dial-out finalization. The first ENVELOPE on a
    // session we initiated carries Noise IK msg 2 from the responder.
    const pendingDial = this.pendingDialsBySession.get(sessionIdHex);
    if (pendingDial) {
      this.finalizePendingDial(pendingDial, sessionId, fromRole, inner, leg);
      return;
    }

    const session = this.sessions.get(sessionIdHex);
    if (!session) {
      // No matching session — relay should have caught this, but defensive.
      return;
    }

    // §3.11 — session-scoped direction check. Responder expects from_role=PHONE
    // (peer is the initiator), initiator expects from_role=INSTANCE (peer is
    // the responder). Pre-§3.11 dialer was responder-only and hard-coded
    // ROLE_PHONE here.
    const expected = session.myRole === 'responder' ? ROLE_PHONE : ROLE_INSTANCE;
    if (fromRole !== expected) {
      // Misrouted by the relay (or relay is buggy). End the session.
      this.closeSession(sessionId, 'wrong_direction_tag');
      return;
    }

    let plaintext: Uint8Array;
    try {
      plaintext = session.transport.decrypt(inner);
    } catch {
      // AEAD failure — session is fatally compromised. End it.
      this.closeSession(sessionId, 'mac_fail');
      return;
    }

    // Per-session listener (initiator awaiting an RPC RESPONSE) takes
    // precedence over the global hook (the Express bridge).
    const local = this.sessionDataListeners.get(sessionIdHex);
    if (local) {
      local(plaintext);
      return;
    }
    this.cfg.onSessionData?.(sessionId, plaintext);
  }

  /**
   * §3.11 — finalize an outbound dial: the responder's Noise msg 2 just
   * arrived as an ENVELOPE. Run readMessage2 to derive the transport
   * keys, register an ActiveSession, and resolve the dialPeer() promise
   * with a SessionContext.
   */
  private finalizePendingDial(
    dial: PendingDial,
    sessionId: Uint8Array,
    fromRole: number | undefined,
    inner: Uint8Array,
    leg: RelayLeg,
  ): void {
    const sessionIdHex = bytesToHex(sessionId);
    if (fromRole !== ROLE_INSTANCE) {
      // We're the initiator; peer is the responder; relay must tag from_role=INSTANCE.
      this.failPendingDial(dial, new Error('dial: wrong direction tag on msg 2'));
      return;
    }
    let transport: NoiseTransport;
    try {
      const r = dial.initiator.readMessage2(inner);
      transport = r.transport;
    } catch (err) {
      this.failPendingDial(dial, err instanceof Error ? err : new Error(String(err)));
      return;
    }

    // Promote to an ActiveSession.
    clearTimeout(dial.timeoutTimer);
    this.pendingDialsBySession.delete(sessionIdHex);

    const session: ActiveSession = {
      sessionId,
      sessionIdHex,
      relayUrl: leg.url,
      transport,
      phoneStaticPubkey: dial.peerStaticPubkey,
      myRole: 'initiator',
    };
    this.sessions.set(sessionIdHex, session);

    const ctx: SessionContext = {
      send: (plaintext: Uint8Array) => this.sendApplicationMessage(sessionId, plaintext),
      close: (reason = 'closed_by_app') => this.closeSession(sessionId, reason),
      phoneStaticPubkey: dial.peerStaticPubkey,
      setDataListener: (listener) => this.setSessionDataListener(sessionIdHex, listener),
    };
    this.cfg.onSessionOpen?.(sessionId, ctx);
    dial.resolve(ctx);
  }

  /** SessionContext.setDataListener implementation (per-session override). */
  private setSessionDataListener(
    sessionIdHex: string,
    listener: ((plaintext: Uint8Array) => void) | null,
  ): void {
    if (listener) this.sessionDataListeners.set(sessionIdHex, listener);
    else this.sessionDataListeners.delete(sessionIdHex);
  }

  private failPendingDial(dial: PendingDial, err: Error): void {
    clearTimeout(dial.timeoutTimer);
    if (dial.sessionIdHex) {
      this.pendingDialsBySession.delete(dial.sessionIdHex);
      this.sessionRelay.delete(dial.sessionIdHex);
    }
    // Try to remove from per-leg queue too (in case ACK_PHONE never arrived).
    const queue = this.pendingDialsByLeg.get(dial.relayUrl);
    if (queue) {
      const idx = queue.indexOf(dial);
      if (idx >= 0) queue.splice(idx, 1);
      if (queue.length === 0) this.pendingDialsByLeg.delete(dial.relayUrl);
    }
    dial.reject(err);
  }

  /** Encrypt + send an application-layer plaintext for a session. */
  private sendApplicationMessage(sessionId: Uint8Array, plaintext: Uint8Array): void {
    const sessionIdHex = bytesToHex(sessionId);
    const session = this.sessions.get(sessionIdHex);
    if (!session) throw new Error(`unknown session ${sessionIdHex}`);
    const leg = this.legs.get(session.relayUrl);
    if (!leg || !leg.connected()) {
      throw new Error(`leg for ${session.relayUrl} not connected`);
    }
    let ciphertext: Uint8Array;
    try {
      ciphertext = session.transport.encrypt(plaintext);
    } catch (err) {
      this.closeSession(sessionId, 'send_counter_rollover');
      throw err;
    }
    leg.sendFrame(encodeFrame(TYPE_ENVELOPE, this.buildEnvelope(sessionId, ciphertext)));
  }

  private closeSession(sessionId: Uint8Array, reason: string): void {
    const sidHex = bytesToHex(sessionId);
    if (!this.sessions.has(sidHex)) return;
    this.sessions.delete(sidHex);
    this.sessionRelay.delete(sidHex);
    this.sessionDataListeners.delete(sidHex);
    this.cfg.onSessionClose?.(sessionId, reason);
  }

  /** Build an ENVELOPE payload (relay overrides from_role anyway, so we set 0). */
  private buildEnvelope(sessionId: Uint8Array, inner: Uint8Array): Uint8Array {
    const out = new Uint8Array(16 + 1 + inner.length);
    out.set(sessionId, 0);
    out[16] = ROLE_INSTANCE;     // relay overrides; informational
    out.set(inner, 17);
    return out;
  }

  private updateReachability(): void {
    const reachable = this.legCount() > 0;
    if (reachable !== this.prevReachable) {
      this.prevReachable = reachable;
      this.cfg.onReachabilityChange?.(reachable);
    }
  }

  /** Internal: how the dialer answers `is reachable now`. */
  isStopping(): boolean { return this.stopping; }
}

// ── RelayLeg — one WS connection to one relay ───────────────────────

class RelayLeg {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private currentBackoffMs: number;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shuttingDown = false;

  constructor(public readonly url: string, private dialer: MeshDialer) {
    this.currentBackoffMs = 1000;
  }

  connected(): boolean { return this.isConnected; }

  connect(): void {
    if (this.shuttingDown) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url, { perMessageDeflate: false });
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      this.isConnected = true;
      this.currentBackoffMs = 1000;   // reset backoff on success
      this.dialer.legOpen(this);
    });
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      const buf = Array.isArray(data)
        ? Buffer.concat(data)
        : (data instanceof ArrayBuffer ? Buffer.from(data) : data);
      this.dialer.legMessage(this, buf);
    });
    ws.on('error', () => { /* close handler will fire too */ });
    ws.on('close', () => {
      this.isConnected = false;
      this.ws = null;
      this.dialer.legClose(this, 'ws_closed');
      this.scheduleReconnect();
    });
  }

  sendFrame(bytes: Uint8Array): void {
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(bytes);
    }
  }

  closeWithReason(code: number, reason: string): void {
    try { this.ws?.close(code, reason); } catch { /* ignore */ }
  }

  shutdown(): void {
    this.shuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try { this.ws?.close(1000, 'dialer_stopping'); } catch { /* ignore */ }
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.dialer.isStopping()) return;
    if (this.reconnectTimer) return;
    const delay = this.currentBackoffMs;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, 30_000);
  }
}

// ── Helpers exposed for tests / Phase 3.4 ───────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, '0');
  return out;
}

export { bytesToHex as _bytesToHex };
