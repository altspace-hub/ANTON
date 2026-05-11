/**
 * comm-registry.ts — Comm-to-Comm routing state machine, per
 * docs/COMM_RELAY_PROTOCOL_v0_1.md §5 + §6 + §7 + §8.
 *
 * Pure logic (no I/O). Mirrors the Action[] pattern of match.ts so the WS
 * server can dispatch in the same way. The registry holds:
 *   - active connections keyed by 16-byte routing_id
 *   - reverse lookup: connId → routing_id
 *   - per-recipient mailbox of pending DELIVER_COMM payloads (in-memory v0.1)
 *   - per-sender SEND_COMM rate-limit bucket
 */

import { randomBytes } from 'node:crypto';
import { encodeFrame, encodeRelayError, TYPE } from './frame.js';
import { bytesToHex } from './primitives.js';

export type Action =
  | { kind: 'send'; connId: string; frame: Uint8Array }
  | { kind: 'close'; connId: string; code: number; reason: string };

// ── Error codes ─────────────────────────────────────────────────────────
// Reuses match.ts's RELAY_ERROR_CODE values; declared again so this module
// has no cross-import to match.ts (keeps responsibilities separated).

export const COMM_ERROR_CODE = {
  BAD_HELLO:    0x0002,
  INVALID_PROOF: 0x0003,
  NO_MATCH:     0x0004,
  INSTANCE_REPLACED: 0x0005, // we reuse this code name for "Comm session replaced"
  PEER_GONE:    0x0006,
  MSG_TOO_LARGE: 0x0007,
  RATE_LIMITED: 0x0008,
  RELAY_DRAINING: 0x0009,
  MAILBOX_FULL: 0x0010,
} as const;

// ── Limits ──────────────────────────────────────────────────────────────

export interface CommRegistryLimits {
  /** Max SEND_COMM frames per sender per minute (sliding window). */
  sendsPerMinutePerSender: number;
  /** Max messages stored per recipient mailbox. */
  mailboxCapacity: number;
  /** How long a mailboxed message lives, in seconds. */
  mailboxTtlSecs: number;
}

export const DEFAULT_COMM_LIMITS: CommRegistryLimits = {
  sendsPerMinutePerSender: 30,
  mailboxCapacity: 100,
  mailboxTtlSecs: 7 * 24 * 3600, // 7 days
};

// ── Internal types ──────────────────────────────────────────────────────

interface CommSession {
  connId: string;
  routingIdHex: string;
  sessionIdHex: string;
}

interface MailboxEntry {
  fromRoutingId: Uint8Array; // 16 bytes
  messageId: Uint8Array;     // 16 bytes
  ciphertext: Uint8Array;    // opaque
  arrivedAtSec: number;      // wall-clock seconds for TTL
}

interface RateBucket {
  /** Timestamps (in seconds) of recent SEND_COMMs for this sender. */
  tsSeconds: number[];
}

// ── ContactRegistry ─────────────────────────────────────────────────────

export class ContactRegistry {
  private sessions = new Map<string, CommSession>();         // routingIdHex -> session
  private byConn = new Map<string, CommSession>();           // connId -> session
  private mailbox = new Map<string, MailboxEntry[]>();       // routingIdHex -> entries
  private rateBuckets = new Map<string, RateBucket>();       // routingIdHex -> bucket

  constructor(
    private readonly limits: CommRegistryLimits = DEFAULT_COMM_LIMITS,
    /** Now in seconds since epoch — injectable for tests. */
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  /**
   * §5 — register a Comm App that has just been verified by comm-hello.ts.
   *
   * Effects:
   *   - displace any existing session for the same routing_id (INSTANCE_REPLACED)
   *   - issue a fresh session_id
   *   - drain any mailboxed messages to the new session
   *   - return Action[] to send: ACK_COMM + N × DELIVER_COMM
   */
  registerComm(connId: string, routing_id: Uint8Array): Action[] {
    const routingIdHex = bytesToHex(routing_id);
    const actions: Action[] = [];

    // Displace any existing session.
    const existing = this.sessions.get(routingIdHex);
    if (existing) {
      actions.push({
        kind: 'send',
        connId: existing.connId,
        frame: encodeRelayError(COMM_ERROR_CODE.INSTANCE_REPLACED, 'comm session replaced'),
      });
      actions.push({ kind: 'close', connId: existing.connId, code: 1000, reason: 'replaced' });
      this.byConn.delete(existing.connId);
    }

    // Drain mailbox TTL before counting.
    this.expireMailbox(routingIdHex);
    const pending = this.mailbox.get(routingIdHex) ?? [];

    const sessionIdBytes = randomBytes(16);
    const sessionIdHex = bytesToHex(sessionIdBytes);
    const session: CommSession = { connId, routingIdHex, sessionIdHex };
    this.sessions.set(routingIdHex, session);
    this.byConn.set(connId, session);

    actions.push({
      kind: 'send',
      connId,
      frame: encodeFrame(TYPE.ACK_COMM, buildAckCommPayload(sessionIdBytes, pending.length, this.limits.mailboxTtlSecs)),
    });

    // Drain mailbox.
    for (const entry of pending) {
      actions.push({
        kind: 'send',
        connId,
        frame: encodeFrame(
          TYPE.DELIVER_COMM,
          buildDeliverCommPayload(entry.fromRoutingId, entry.messageId, entry.arrivedAtSec, entry.ciphertext),
        ),
      });
    }
    this.mailbox.delete(routingIdHex);

    return actions;
  }

  /**
   * §6 — route a SEND_COMM. Caller has already parsed the payload and
   * passes the destructured fields.
   *
   *   - session_id must match the sender's registered session (PEER_GONE if not)
   *   - rate-limit check (RATE_LIMITED if over budget; frame dropped, session stays)
   *   - if target online: forward DELIVER_COMM to target's session
   *   - if target offline: push to mailbox (MAILBOX_FULL if at capacity)
   */
  routeSend(
    senderConnId: string,
    sessionIdBytes: Uint8Array,
    targetRoutingId: Uint8Array,
    messageId: Uint8Array,
    ciphertext: Uint8Array,
  ): Action[] {
    const sender = this.byConn.get(senderConnId);
    if (!sender) {
      return [{
        kind: 'send',
        connId: senderConnId,
        frame: encodeRelayError(COMM_ERROR_CODE.PEER_GONE, 'sender not registered (HELLO_COMM required first)'),
      }];
    }
    if (bytesToHex(sessionIdBytes) !== sender.sessionIdHex) {
      return [{
        kind: 'send',
        connId: senderConnId,
        frame: encodeRelayError(COMM_ERROR_CODE.PEER_GONE, 'session_id mismatch'),
      }];
    }

    // Rate limit (sliding 60s window).
    if (!this.consumeRate(sender.routingIdHex)) {
      return [{
        kind: 'send',
        connId: senderConnId,
        frame: encodeRelayError(COMM_ERROR_CODE.RATE_LIMITED, 'SEND_COMM budget exceeded'),
      }];
    }

    // Build the from_routing_id from the verified session — NOT from client input.
    const fromRoutingIdBytes = hexToBytes(sender.routingIdHex);
    const targetIdHex = bytesToHex(targetRoutingId);
    const targetSession = this.sessions.get(targetIdHex);

    if (targetSession) {
      // Online — forward immediately.
      return [{
        kind: 'send',
        connId: targetSession.connId,
        frame: encodeFrame(
          TYPE.DELIVER_COMM,
          buildDeliverCommPayload(fromRoutingIdBytes, messageId, this.now(), ciphertext),
        ),
      }];
    }

    // Offline — mailbox.
    const box = this.mailbox.get(targetIdHex) ?? [];
    // Apply TTL eviction before capacity check.
    const liveCount = this.evictExpired(box);
    if (liveCount >= this.limits.mailboxCapacity) {
      return [{
        kind: 'send',
        connId: senderConnId,
        frame: encodeRelayError(COMM_ERROR_CODE.MAILBOX_FULL, 'recipient mailbox at capacity'),
      }];
    }
    box.push({
      fromRoutingId: fromRoutingIdBytes,
      messageId,
      ciphertext,
      arrivedAtSec: this.now(),
    });
    this.mailbox.set(targetIdHex, box);
    return [];
  }

  /**
   * §4.5 — ack_delivery flows back to the sender if they're still connected.
   * Best-effort: drop silently if sender offline.
   */
  routeAckDelivery(
    recipientConnId: string,
    fromRoutingId: Uint8Array, // the *original sender's* routing_id (recipient looked it up locally)
    messageId: Uint8Array,
    kind: number,
  ): Action[] {
    const recipient = this.byConn.get(recipientConnId);
    if (!recipient) return [];
    const senderIdHex = bytesToHex(fromRoutingId);
    const senderSession = this.sessions.get(senderIdHex);
    if (!senderSession) return [];
    return [{
      kind: 'send',
      connId: senderSession.connId,
      frame: encodeFrame(TYPE.ACK_DELIVERY, buildAckDeliveryPayload(messageId, kind)),
    }];
  }

  /** Disconnect cleanup. */
  handleDisconnect(connId: string): Action[] {
    const session = this.byConn.get(connId);
    if (!session) return [];
    this.byConn.delete(connId);
    this.sessions.delete(session.routingIdHex);
    return [];
  }

  /** Periodic reaper: drop expired mailbox entries. */
  reapStaleMailbox(): void {
    const dead: string[] = [];
    for (const [routingIdHex, box] of this.mailbox) {
      this.evictExpired(box);
      if (box.length === 0) dead.push(routingIdHex);
    }
    for (const k of dead) this.mailbox.delete(k);
  }

  // ── Introspection (for tests / telemetry) ─────────────────────────────

  sessionCount(): number { return this.sessions.size; }
  mailboxSize(routingIdHex: string): number {
    return this.mailbox.get(routingIdHex)?.length ?? 0;
  }
  isOnline(routingIdHex: string): boolean {
    return this.sessions.has(routingIdHex);
  }

  // ── Internals ─────────────────────────────────────────────────────────

  /** Returns true if a SEND_COMM is admitted, false if over budget. */
  private consumeRate(routingIdHex: string): boolean {
    const now = this.now();
    const cutoff = now - 60;
    let bucket = this.rateBuckets.get(routingIdHex);
    if (!bucket) { bucket = { tsSeconds: [] }; this.rateBuckets.set(routingIdHex, bucket); }
    // Drop entries older than the window.
    bucket.tsSeconds = bucket.tsSeconds.filter(t => t > cutoff);
    if (bucket.tsSeconds.length >= this.limits.sendsPerMinutePerSender) return false;
    bucket.tsSeconds.push(now);
    return true;
  }

  /** Mutates `box` in place, removing TTL-expired entries. Returns remaining count. */
  private evictExpired(box: MailboxEntry[]): number {
    const cutoff = this.now() - this.limits.mailboxTtlSecs;
    let writeIdx = 0;
    for (let readIdx = 0; readIdx < box.length; readIdx++) {
      if (box[readIdx]!.arrivedAtSec > cutoff) {
        box[writeIdx++] = box[readIdx]!;
      }
    }
    box.length = writeIdx;
    return writeIdx;
  }

  private expireMailbox(routingIdHex: string): void {
    const box = this.mailbox.get(routingIdHex);
    if (!box) return;
    this.evictExpired(box);
    if (box.length === 0) this.mailbox.delete(routingIdHex);
  }
}

// ── Payload builders ────────────────────────────────────────────────────

function buildAckCommPayload(
  sessionIdBytes: Uint8Array,
  pendingCount: number,
  mailboxTtlSecs: number,
): Uint8Array {
  const out = new Uint8Array(16 + 2 + 4);
  out.set(sessionIdBytes, 0);
  out[16] = (pendingCount >>> 8) & 0xFF;
  out[17] = pendingCount & 0xFF;
  out[18] = (mailboxTtlSecs >>> 24) & 0xFF;
  out[19] = (mailboxTtlSecs >>> 16) & 0xFF;
  out[20] = (mailboxTtlSecs >>> 8) & 0xFF;
  out[21] = mailboxTtlSecs & 0xFF;
  return out;
}

function buildDeliverCommPayload(
  fromRoutingId: Uint8Array,
  messageId: Uint8Array,
  relayTsSec: number,
  ciphertext: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(16 + 16 + 4 + ciphertext.length);
  out.set(fromRoutingId, 0);
  out.set(messageId, 16);
  out[32] = (relayTsSec >>> 24) & 0xFF;
  out[33] = (relayTsSec >>> 16) & 0xFF;
  out[34] = (relayTsSec >>> 8) & 0xFF;
  out[35] = relayTsSec & 0xFF;
  out.set(ciphertext, 36);
  return out;
}

function buildAckDeliveryPayload(messageId: Uint8Array, kind: number): Uint8Array {
  const out = new Uint8Array(16 + 1);
  out.set(messageId, 0);
  out[16] = kind & 0xFF;
  return out;
}

// ── Parsers (for server.ts handling inbound SEND_COMM/ACK_DELIVERY) ─────

export interface ParsedSendComm {
  session_id: Uint8Array;
  target_routing_id: Uint8Array;
  message_id: Uint8Array;
  ciphertext: Uint8Array;
}

export function parseSendComm(payload: Uint8Array): ParsedSendComm {
  if (payload.length < 48) throw new Error(`SEND_COMM payload ${payload.length} < 48`);
  return {
    session_id: payload.slice(0, 16),
    target_routing_id: payload.slice(16, 32),
    message_id: payload.slice(32, 48),
    ciphertext: payload.slice(48),
  };
}

export interface ParsedAckDelivery {
  message_id: Uint8Array;
  kind: number;
}

export function parseAckDelivery(payload: Uint8Array): ParsedAckDelivery {
  if (payload.length !== 17) throw new Error(`ACK_DELIVERY payload ${payload.length} != 17`);
  return { message_id: payload.slice(0, 16), kind: payload[16]! };
}

// ── Hex utility (local to avoid cross-import) ───────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.substr(i, 2), 16);
  return out;
}
