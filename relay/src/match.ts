/**
 * match.ts — Two-leg matching state machine, per spec §3.9.
 *
 * The match table is **pure logic**: it doesn't touch I/O. Every method
 * returns a list of `Action`s describing what the WS server should do
 * (send a frame, close a connection). This separation lets us test the
 * full state machine deterministically without spinning up sockets.
 *
 * Concepts:
 *   - **Instance leg:** a WS connection that has sent a valid HELLO_INSTANCE.
 *     At most one such leg is "registered" per instance_id at a time. A
 *     second HELLO_INSTANCE with the same id displaces the first (§3.9).
 *
 *   - **Phone leg:** a WS connection that has sent a HELLO_PHONE asking
 *     for a specific instance_id. If the instance is registered, we
 *     immediately create a matched session. Otherwise the phone waits
 *     for up to 30s; if no instance arrives, it gets NO_MATCH.
 *
 *   - **Matched session:** a (instance_leg, phone_leg) pair identified
 *     by a 16-byte session_id. ENVELOPE frames flow between them with
 *     the relay setting from_role (§3.6).
 *
 * Spec references:
 *   §3.4 ACK_INSTANCE / §3.5 ACK_PHONE  payload formats
 *   §3.6 ENVELOPE direction tag
 *   §3.9 state machine
 *   §3.10 limits (concurrent sessions per instance)
 *   §6.2 error codes (NO_MATCH, INSTANCE_REPLACED, PEER_GONE, RATE_LIMITED)
 */

import { randomBytes } from 'node:crypto';
import { encodeFrame, encodeRelayError, TYPE } from './frame.js';
import type { ParsedHelloInstance, ParsedHelloPhone } from './hello.js';
import { bytesToHex } from './primitives.js';

// ── Action types — what the server should do in response ─────────────

export type Action =
  | { kind: 'send'; connId: string; frame: Uint8Array }
  | { kind: 'close'; connId: string; code: number; reason: string };

// ── Error codes (subset; full list in spec §6.2) ─────────────────────

export const RELAY_ERROR_CODE = {
  NO_MATCH:           0x0004,
  INSTANCE_REPLACED:  0x0005,
  PEER_GONE:          0x0006,
  RATE_LIMITED:       0x0008,
  RELAY_DRAINING:     0x0009,
  // these flow up from upstream code paths, not this module:
  BAD_HELLO:          0x0002,
  INVALID_PROOF:      0x0003,
  MSG_TOO_LARGE:      0x0007,
} as const;

// ── Limits (§3.10 with Phase 1.8 hardening) ──────────────────────────

export interface MatchTableLimits {
  /** Max concurrent matched sessions per instance_id. Default 32, hard ceiling 256. */
  maxSessionsPerInstance: number;
  /** Max time a phone may wait for its instance to come online (seconds). */
  pendingPhoneTimeoutSec: number;
}

export const DEFAULT_LIMITS: MatchTableLimits = {
  maxSessionsPerInstance: 32,
  pendingPhoneTimeoutSec: 30,
};

export const HARD_CEILING_SESSIONS_PER_INSTANCE = 256;

// ── Internal record types ────────────────────────────────────────────

interface InstanceLeg {
  connId: string;
  instanceIdHex: string;
}

interface MatchedSession {
  sessionIdHex: string;
  sessionIdBytes: Uint8Array;
  instanceConnId: string;
  phoneConnId: string;
  instanceIdHex: string;
}

interface PendingPhone {
  connId: string;
  instanceIdHex: string;
  phoneEphemPk: Uint8Array;
  noiseInitMsg: Uint8Array;
  /** Wall-clock seconds when this pending entry must time out (NO_MATCH). */
  expiresAtSec: number;
}

// ── ROLE bytes for ENVELOPE.from_role (§3.6) ─────────────────────────

export const ROLE = {
  PHONE:    0x01,
  INSTANCE: 0x02,
} as const;

export type Role = typeof ROLE[keyof typeof ROLE];

// ── ACK_* payload builders (§3.4 + §3.5) ─────────────────────────────

function buildAckInstance(
  phoneEphemPk: Uint8Array,
  noiseInitMsg: Uint8Array,
  sessionId: Uint8Array,
): Uint8Array {
  const payload = new Uint8Array(32 + noiseInitMsg.length + 16);
  payload.set(phoneEphemPk, 0);
  payload.set(noiseInitMsg, 32);
  payload.set(sessionId, 32 + noiseInitMsg.length);
  return encodeFrame(TYPE.ACK_INSTANCE, payload);
}

function buildAckPhone(sessionId: Uint8Array): Uint8Array {
  return encodeFrame(TYPE.ACK_PHONE, sessionId);
}

/** Build an ENVELOPE frame to forward to a peer (§3.6). */
function buildEnvelope(sessionIdBytes: Uint8Array, fromRole: Role, inner: Uint8Array): Uint8Array {
  const payload = new Uint8Array(16 + 1 + inner.length);
  payload.set(sessionIdBytes, 0);
  payload[16] = fromRole;
  payload.set(inner, 17);
  return encodeFrame(TYPE.ENVELOPE, payload);
}

// ── Match table ──────────────────────────────────────────────────────

export class MatchTable {
  private instances = new Map<string, InstanceLeg>();          // instanceIdHex -> instance
  private sessions = new Map<string, MatchedSession>();         // sessionIdHex -> session
  private sessionsByInstance = new Map<string, Set<string>>();  // instanceIdHex -> sessionIdHex[]
  /**
   * Pending phones by instance_id — multiple phones can wait for the same
   * instance simultaneously. Stored in arrays in arrival order.
   */
  private pendingPhones = new Map<string, PendingPhone[]>();    // instanceIdHex -> phones
  /** Reverse lookup: connId → role + identifying key (so disconnect knows what to clean). */
  private connectionRoles = new Map<string, ConnectionRoleEntry>();

  constructor(
    private readonly limits: MatchTableLimits = DEFAULT_LIMITS,
    /** Now in seconds since epoch — injectable for tests. */
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    if (limits.maxSessionsPerInstance > HARD_CEILING_SESSIONS_PER_INSTANCE) {
      throw new Error(
        `maxSessionsPerInstance ${limits.maxSessionsPerInstance} > hard ceiling ${HARD_CEILING_SESSIONS_PER_INSTANCE}`,
      );
    }
  }

  /**
   * §3.9 — A WS connection with a verified HELLO_INSTANCE registers as
   * the instance leg for its instance_id. If a leg already exists, the
   * older one is displaced with INSTANCE_REPLACED and its sessions tear
   * down with PEER_GONE to the phone side.
   *
   * Then any pending phones for this instance_id are matched immediately.
   */
  registerInstance(connId: string, hello: ParsedHelloInstance): Action[] {
    const actions: Action[] = [];
    const instanceIdHex = bytesToHex(hello.instance_id);

    // Displace existing instance leg if any.
    const existing = this.instances.get(instanceIdHex);
    if (existing) {
      // Tear down the old instance and all its sessions.
      actions.push(...this.evictInstance(instanceIdHex, RELAY_ERROR_CODE.INSTANCE_REPLACED, 'replaced'));
    }

    this.instances.set(instanceIdHex, { connId, instanceIdHex });
    this.connectionRoles.set(connId, { role: 'instance', instanceIdHex });
    this.sessionsByInstance.set(instanceIdHex, new Set());

    // Drain pending phones for this instance.
    const queue = this.pendingPhones.get(instanceIdHex);
    if (queue && queue.length > 0) {
      for (const phone of queue) {
        const sessionActions = this.createSession(connId, instanceIdHex, phone);
        actions.push(...sessionActions);
      }
      this.pendingPhones.delete(instanceIdHex);
    }

    return actions;
  }

  /**
   * §3.9 — A WS connection with a HELLO_PHONE asks for `instance_id`. If
   * the instance is registered, match immediately. Otherwise queue the
   * phone for up to `pendingPhoneTimeoutSec`. The relay's reaper (called
   * periodically by the server) will time out stale entries.
   *
   * Phones never displace each other; concurrent phone requests against
   * the same instance produce concurrent matched sessions (subject to
   * the per-instance session ceiling).
   */
  registerPhoneRequest(connId: string, hello: ParsedHelloPhone): Action[] {
    const instanceIdHex = bytesToHex(hello.instance_id);
    const instance = this.instances.get(instanceIdHex);

    if (instance) {
      // Immediate match path.
      return this.createSession(instance.connId, instanceIdHex, {
        connId,
        instanceIdHex,
        phoneEphemPk: hello.phone_ephem_pk,
        noiseInitMsg: hello.noise_init_msg,
        expiresAtSec: this.now() + this.limits.pendingPhoneTimeoutSec,
      });
    }

    // No instance online — queue the phone request.
    let queue = this.pendingPhones.get(instanceIdHex);
    if (!queue) {
      queue = [];
      this.pendingPhones.set(instanceIdHex, queue);
    }
    queue.push({
      connId,
      instanceIdHex,
      phoneEphemPk: hello.phone_ephem_pk,
      noiseInitMsg: hello.noise_init_msg,
      expiresAtSec: this.now() + this.limits.pendingPhoneTimeoutSec,
    });
    this.connectionRoles.set(connId, { role: 'phone_pending', instanceIdHex });
    return [];
  }

  /**
   * §3.6 — Forward an ENVELOPE between matched legs, setting `from_role`.
   * If the inbound frame's session_id refers to no live match, drop with
   * PEER_GONE. The relay sets the from_role byte itself; whatever the
   * client supplied is overwritten.
   *
   * `inner` is the post-`session_id`+`from_role` portion of the original
   * payload (the opaque bytes destined for the peer).
   */
  forwardEnvelope(connId: string, sessionIdBytes: Uint8Array, inner: Uint8Array): Action[] {
    const sessionIdHex = bytesToHex(sessionIdBytes);
    const session = this.sessions.get(sessionIdHex);
    if (!session) {
      // Session not live — peer probably disconnected.
      return [{
        kind: 'send',
        connId,
        frame: encodeRelayError(RELAY_ERROR_CODE.PEER_GONE, 'no live session'),
      }];
    }
    const fromRole = (connId === session.instanceConnId)
      ? ROLE.INSTANCE
      : (connId === session.phoneConnId ? ROLE.PHONE : null);
    if (fromRole === null) {
      // Sender is not part of this session — close with PEER_GONE (caller
      // should never reach this in practice; defensive).
      return [{
        kind: 'send',
        connId,
        frame: encodeRelayError(RELAY_ERROR_CODE.PEER_GONE, 'not part of session'),
      }];
    }
    const targetConnId = (fromRole === ROLE.INSTANCE) ? session.phoneConnId : session.instanceConnId;
    return [{
      kind: 'send',
      connId: targetConnId,
      frame: buildEnvelope(sessionIdBytes, fromRole, inner),
    }];
  }

  /**
   * §3.9 — A connection went away. Clean up everything that referenced it
   * and notify the peer where applicable.
   */
  handleDisconnect(connId: string): Action[] {
    const role = this.connectionRoles.get(connId);
    if (!role) return [];
    this.connectionRoles.delete(connId);

    if (role.role === 'instance') {
      return this.evictInstance(role.instanceIdHex, RELAY_ERROR_CODE.PEER_GONE, 'instance disconnected');
    }

    if (role.role === 'phone_matched') {
      const session = this.sessions.get(role.sessionIdHex);
      if (!session) return [];
      this.sessions.delete(role.sessionIdHex);
      const set = this.sessionsByInstance.get(session.instanceIdHex);
      set?.delete(role.sessionIdHex);
      // Tell the instance that this phone is gone.
      return [{
        kind: 'send',
        connId: session.instanceConnId,
        frame: encodeRelayError(RELAY_ERROR_CODE.PEER_GONE, 'phone disconnected'),
      }];
    }

    if (role.role === 'phone_pending') {
      // Pull the entry out of the pending queue.
      const queue = this.pendingPhones.get(role.instanceIdHex);
      if (queue) {
        const filtered = queue.filter(p => p.connId !== connId);
        if (filtered.length > 0) this.pendingPhones.set(role.instanceIdHex, filtered);
        else this.pendingPhones.delete(role.instanceIdHex);
      }
      return [];
    }

    return [];
  }

  /**
   * Periodic reaper: time out pending phones whose deadline has passed.
   * Server calls this on a fixed interval (e.g. every second).
   */
  reapStalePending(): Action[] {
    const actions: Action[] = [];
    const now = this.now();
    for (const [instanceIdHex, queue] of this.pendingPhones) {
      const survivors: PendingPhone[] = [];
      for (const phone of queue) {
        if (phone.expiresAtSec <= now) {
          actions.push({
            kind: 'send',
            connId: phone.connId,
            frame: encodeRelayError(RELAY_ERROR_CODE.NO_MATCH, 'no instance found within window'),
          });
          actions.push({ kind: 'close', connId: phone.connId, code: 1000, reason: 'no_match' });
          this.connectionRoles.delete(phone.connId);
        } else {
          survivors.push(phone);
        }
      }
      if (survivors.length > 0) this.pendingPhones.set(instanceIdHex, survivors);
      else this.pendingPhones.delete(instanceIdHex);
    }
    return actions;
  }

  // ── Introspection helpers (used by tests + telemetry) ─────────────

  /** Number of currently registered instances. */
  instanceCount(): number { return this.instances.size; }
  /** Number of currently active matched sessions. */
  sessionCount(): number { return this.sessions.size; }
  /** Number of pending phones waiting for an instance to come online. */
  pendingPhoneCount(): number {
    let n = 0;
    for (const q of this.pendingPhones.values()) n += q.length;
    return n;
  }
  /** Active session count for a given instance_id (Phase 1.8 spec §3.10 limit). */
  sessionsFor(instanceIdHex: string): number {
    return this.sessionsByInstance.get(instanceIdHex)?.size ?? 0;
  }

  // ── Internals ────────────────────────────────────────────────────

  private createSession(
    instanceConnId: string,
    instanceIdHex: string,
    phone: PendingPhone,
  ): Action[] {
    const actions: Action[] = [];

    // Enforce per-instance concurrent-session ceiling (§3.10).
    const currentCount = this.sessionsByInstance.get(instanceIdHex)?.size ?? 0;
    if (currentCount >= this.limits.maxSessionsPerInstance) {
      actions.push({
        kind: 'send',
        connId: phone.connId,
        frame: encodeRelayError(RELAY_ERROR_CODE.RATE_LIMITED, 'instance session limit'),
      });
      actions.push({ kind: 'close', connId: phone.connId, code: 1008, reason: 'rate_limited' });
      // Don't track phone_pending — we're closing it.
      this.connectionRoles.delete(phone.connId);
      return actions;
    }

    const sessionIdBytes = randomBytes(16);
    const sessionIdHex = bytesToHex(sessionIdBytes);

    const session: MatchedSession = {
      sessionIdHex,
      sessionIdBytes,
      instanceConnId,
      phoneConnId: phone.connId,
      instanceIdHex,
    };
    this.sessions.set(sessionIdHex, session);
    let set = this.sessionsByInstance.get(instanceIdHex);
    if (!set) { set = new Set(); this.sessionsByInstance.set(instanceIdHex, set); }
    set.add(sessionIdHex);

    // Update reverse lookups.
    this.connectionRoles.set(phone.connId, { role: 'phone_matched', sessionIdHex });
    // Instance role is already 'instance' from registerInstance.

    // Send ACK_INSTANCE to the instance (so it can feed noise_init_msg into Noise responder).
    actions.push({
      kind: 'send',
      connId: instanceConnId,
      frame: buildAckInstance(phone.phoneEphemPk, phone.noiseInitMsg, sessionIdBytes),
    });
    // Send ACK_PHONE to the phone (just the session_id).
    actions.push({
      kind: 'send',
      connId: phone.connId,
      frame: buildAckPhone(sessionIdBytes),
    });

    return actions;
  }

  /**
   * Common cleanup when an instance leg is going away — either replaced or
   * disconnected. Closes the instance's WS, sends PEER_GONE to all matched
   * phones, sends them a polite close, and frees all referenced state.
   */
  private evictInstance(
    instanceIdHex: string,
    closeCode: number,
    closeReason: string,
  ): Action[] {
    const actions: Action[] = [];
    const inst = this.instances.get(instanceIdHex);
    if (!inst) return actions;

    // Close the old instance WS with whatever code we were given.
    actions.push({
      kind: 'send',
      connId: inst.connId,
      frame: encodeRelayError(closeCode, closeReason),
    });
    actions.push({ kind: 'close', connId: inst.connId, code: 1000, reason: closeReason });
    this.connectionRoles.delete(inst.connId);

    // Tear down all sessions that pointed at this instance.
    const sessionIds = this.sessionsByInstance.get(instanceIdHex);
    if (sessionIds) {
      for (const sid of sessionIds) {
        const session = this.sessions.get(sid);
        if (!session) continue;
        actions.push({
          kind: 'send',
          connId: session.phoneConnId,
          frame: encodeRelayError(RELAY_ERROR_CODE.PEER_GONE, 'instance gone'),
        });
        actions.push({
          kind: 'close',
          connId: session.phoneConnId,
          code: 1000,
          reason: 'peer_gone',
        });
        this.connectionRoles.delete(session.phoneConnId);
        this.sessions.delete(sid);
      }
      this.sessionsByInstance.delete(instanceIdHex);
    }

    this.instances.delete(instanceIdHex);
    return actions;
  }
}

// ── Internal types ───────────────────────────────────────────────────

type ConnectionRoleEntry =
  | { role: 'instance'; instanceIdHex: string }
  | { role: 'phone_pending'; instanceIdHex: string }
  | { role: 'phone_matched'; sessionIdHex: string };
