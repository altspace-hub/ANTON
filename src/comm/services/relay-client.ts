/**
 * relay-client.ts — Comm-to-Comm relay client per
 * docs/COMM_RELAY_PROTOCOL_v0_1.md.
 *
 * Connects to the relay via WebSocket, performs HELLO_COMM, then flushes
 * outbound encrypted messages and dispatches inbound DELIVER_COMM to the
 * chat layer.
 *
 * Reconnection: exponential backoff (1s → 30s cap) with jitter. Each
 * reconnect re-issues HELLO_COMM, which displaces any prior session for
 * the same routing_id at the relay.
 */

import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha2';
import { getSecure } from './secure-store';
import { getIdentity, deriveRoutingId } from './identity';
import { listContacts } from './contacts';
import { listQueued, updateStatus } from './messages';
import { listReadyInline, markInlineAttempt, enqueueInline } from './inline-outbox';
import { redactHash, devLog } from './log-redact';
import { openFromPeer, sealForPeer, type EncryptedEnvelope } from './crypto';
import { sealForPeerFromQueued, applyInboundMessage, parseWirePayload } from './chat';
import { getContact } from './contacts';

ed25519.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed25519.etc.concatBytes(...m));

const SECURE_KEY_PRIVKEY = 'identity-private-key';

// ── Wire constants (mirror relay/src/frame.ts) ──────────────────────────

const WIRE_VERSION = 0x01;
const TYPE_HELLO_COMM    = 0x20;
const TYPE_ACK_COMM      = 0x21;
const TYPE_SEND_COMM     = 0x22;
const TYPE_DELIVER_COMM  = 0x23;
const TYPE_ACK_DELIVERY  = 0x24;
const TYPE_PING          = 0x05;
const TYPE_PONG          = 0x06;
const TYPE_ERROR         = 0x0F;

const PROOF_DOMAIN = new TextEncoder().encode('ANTON-COMM-HELLO/v1\n');

// ── Config ──────────────────────────────────────────────────────────────

export interface RelayClientConfig {
  /** wss:// URL of the relay. Must match what the relay claims as ownUrl. */
  relayUrl: string;
  /**
   * Optional listener for inbound DELIVER_COMM after decryption. Called with
   * the persisted ChatMessage record (already in IDB) so the UI can refresh.
   */
  onMessage?: (fromHash: string) => void;
  /** Called on session lifecycle events. */
  onStatus?: (status: RelayStatus) => void;
}

export type RelayStatus =
  | 'idle'
  | 'connecting'
  | 'registering'
  | 'open'
  | 'closing'
  | 'closed'
  | 'error';

// ── Singleton client ───────────────────────────────────────────────────

let activeClient: RelayClient | null = null;

export function startRelayClient(cfg: RelayClientConfig): RelayClient {
  if (activeClient) activeClient.close();
  activeClient = new RelayClient(cfg);
  void activeClient.connect();
  return activeClient;
}

export function getRelayClient(): RelayClient | null {
  return activeClient;
}

export function stopRelayClient(): void {
  activeClient?.close();
  activeClient = null;
}

// ── RelayClient ─────────────────────────────────────────────────────────

export class RelayClient {
  private ws: WebSocket | null = null;
  private status: RelayStatus = 'idle';
  private sessionId: Uint8Array | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private explicitClose = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private scheduleFlushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private cfg: RelayClientConfig) {}

  async connect(): Promise<void> {
    if (this.status === 'open' || this.status === 'connecting' || this.status === 'registering') return;
    const me = getIdentity();
    if (!me) {
      this.setStatus('error');
      return;
    }
    this.explicitClose = false;
    this.setStatus('connecting');

    try {
      const ws = new WebSocket(this.cfg.relayUrl);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => { void this.sendHelloComm().catch((err) => this.fail('hello send failed: ' + (err as Error).message)); };
      ws.onmessage = (ev) => this.handleFrame(ev.data as ArrayBuffer);
      ws.onclose = () => this.handleClose();
      ws.onerror = () => { /* onclose follows */ };
    } catch (err) {
      this.fail('open failed: ' + (err as Error).message);
    }
  }

  close(): void {
    this.explicitClose = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.scheduleFlushTimer) { clearInterval(this.scheduleFlushTimer); this.scheduleFlushTimer = null; }
    this.setStatus('closing');
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
    this.sessionId = null;
    this.setStatus('closed');
  }

  /** Push a queued outbox message. Returns true if accepted by the WS layer. */
  async flushOutbox(): Promise<void> {
    if (this.status !== 'open' || !this.sessionId) return;
    const queued = await listQueued();
    const nowIso = new Date().toISOString();
    for (const msg of queued) {
      // R10 — scheduled-for-future messages stay queued until their time.
      if (msg.scheduledFor && msg.scheduledFor > nowIso) continue;
      try {
        const env = await sealForPeerFromQueued(msg);
        if (!env) continue; // peer key missing; leave queued
        await this.sendSendComm(msg.id, msg.toHash, env);
        await updateStatus(msg.id, 'sent');
      } catch (err) {
        devLog('[relay-client] flush failed', redactHash(msg.id), err);
        await updateStatus(msg.id, 'failed');
      }
    }
  }

  getStatus(): RelayStatus { return this.status; }

  /**
   * Send a one-shot wire payload to a peer without persisting it as a
   * ChatMessage. Two modes:
   *   - persistent=true (default for state-mutating wires like edit /
   *     delete / poll_vote / wassup_*) — if the connection isn't open
   *     or sealing fails, the payload is enqueued in the inline outbox
   *     and re-attempted on the next flush cycle.
   *   - persistent=false (presence wires: read receipts / typing /
   *     location_update) — best-effort, drops if not connected.
   */
  async sendInlinePayload(
    peerContactHash: string,
    wireJson: string,
    opts: { persistent?: boolean } = {},
  ): Promise<void> {
    const persistent = opts.persistent !== false;
    if (this.status !== 'open' || !this.sessionId) {
      if (persistent) await enqueueInline(peerContactHash, wireJson);
      return;
    }
    const me = getIdentity();
    if (!me) return;
    const peer = await getContact(peerContactHash);
    if (!peer?.publicKeyHex) {
      if (persistent) await enqueueInline(peerContactHash, wireJson);
      return;
    }

    try {
      await this.dispatchInline(peerContactHash, wireJson, peer.publicKeyHex, me.contactHash);
    } catch (err) {
      if (persistent) await enqueueInline(peerContactHash, wireJson);
      else devLog('[relay-client] inline send failed', err);
    }
  }

  /** Internal: actually encrypt + frame + send one inline payload. */
  private async dispatchInline(
    peerContactHash: string,
    wireJson: string,
    peerPubkeyHex: string,
    myContactHash: string,
  ): Promise<void> {
    if (!this.sessionId) throw new Error('no session');
    const envelope = await sealForPeer(wireJson, peerPubkeyHex, myContactHash, peerContactHash);
    const ephemeralMsgId = `inline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const targetRoutingId = (await import('./identity')).deriveRoutingId(peerPubkeyHex);
    const ciphertext = new TextEncoder().encode(JSON.stringify(envelope));
    const payload = new Uint8Array(16 + 16 + 16 + ciphertext.length);
    payload.set(this.sessionId, 0);
    payload.set(targetRoutingId, 16);
    payload.set(messageIdToBytesInline(ephemeralMsgId), 32);
    payload.set(ciphertext, 48);
    this.send(TYPE_SEND_COMM, payload);
  }

  /**
   * Drain any inline payloads ready for retry. Called on register + on
   * the periodic 20s tick. Backoff + max-attempts logic lives in
   * `listReadyInline()` / `markInlineAttempt()`.
   */
  async flushInlineOutbox(): Promise<void> {
    if (this.status !== 'open' || !this.sessionId) return;
    const me = getIdentity();
    if (!me) return;
    const ready = await listReadyInline();
    for (const row of ready) {
      try {
        const peer = await getContact(row.peerContactHash);
        if (!peer?.publicKeyHex) {
          // Contact deleted — burn the row.
          await markInlineAttempt(row.id, true);
          continue;
        }
        await this.dispatchInline(row.peerContactHash, row.wireJson, peer.publicKeyHex, me.contactHash);
        await markInlineAttempt(row.id, true);
      } catch {
        await markInlineAttempt(row.id, false);
      }
    }
  }

  // ── Internals ────────────────────────────────────────────────────────

  private setStatus(s: RelayStatus) {
    this.status = s;
    this.cfg.onStatus?.(s);
  }

  private fail(reason: string): void {
    console.warn('[relay-client]', reason);
    this.setStatus('error');
    this.scheduleReconnect();
  }

  private handleClose(): void {
    this.ws = null;
    this.sessionId = null;
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    this.setStatus('closed');
    if (!this.explicitClose) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.explicitClose) return;
    if (this.reconnectTimer) return;
    const base = Math.min(30_000, 1000 * Math.pow(2, this.reconnectAttempt));
    const jitter = Math.floor(Math.random() * 500);
    const delay = base + jitter;
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  // ── HELLO_COMM ───────────────────────────────────────────────────────

  private async sendHelloComm(): Promise<void> {
    const me = getIdentity();
    if (!me) throw new Error('no identity');
    const edPrivHex = await getSecure(SECURE_KEY_PRIVKEY);
    if (!edPrivHex) throw new Error('no private key');
    const edPriv = hexToBytes(edPrivHex);
    const edPub = hexToBytes(me.publicKeyHex);

    const timestamp = Math.floor(Date.now() / 1000);
    const sigInput = buildProofInput(timestamp, this.cfg.relayUrl);
    const sigBytes = await ed25519.signAsync(sigInput, edPriv);

    const payload = buildHelloCommPayload(edPub, timestamp, this.cfg.relayUrl, sigBytes, 0);
    this.setStatus('registering');
    this.send(TYPE_HELLO_COMM, payload);
  }

  // ── SEND_COMM ────────────────────────────────────────────────────────

  private async sendSendComm(messageIdStr: string, targetHash: string, envelope: EncryptedEnvelope): Promise<void> {
    if (!this.sessionId) throw new Error('no session');
    const me = getIdentity();
    if (!me) throw new Error('no identity');

    // We need the target's pubkey to compute their routing_id. Look up in contacts.
    const contacts = await listContacts();
    const peer = contacts.find(c => c.contactHash === targetHash);
    if (!peer?.publicKeyHex) throw new Error('no peer pubkey');
    const targetRoutingId = deriveRoutingId(peer.publicKeyHex);

    const messageId = messageIdToBytes(messageIdStr);
    const ciphertext = encodeEnvelopeToBytes(envelope);

    const payload = new Uint8Array(16 + 16 + 16 + ciphertext.length);
    payload.set(this.sessionId, 0);
    payload.set(targetRoutingId, 16);
    payload.set(messageId, 32);
    payload.set(ciphertext, 48);
    this.send(TYPE_SEND_COMM, payload);
  }

  // ── Frame dispatch ───────────────────────────────────────────────────

  private send(type: number, payload: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const frame = new Uint8Array(5 + payload.length);
    frame[0] = WIRE_VERSION;
    frame[1] = type;
    frame[2] = (payload.length >>> 16) & 0xFF;
    frame[3] = (payload.length >>> 8) & 0xFF;
    frame[4] = payload.length & 0xFF;
    frame.set(payload, 5);
    this.ws.send(frame);
  }

  private handleFrame(buf: ArrayBuffer): void {
    const view = new Uint8Array(buf);
    if (view.length < 5) return;
    if (view[0] !== WIRE_VERSION) return;
    const type = view[1];
    const length = (view[2] << 16) | (view[3] << 8) | view[4];
    if (view.length !== 5 + length) return;
    const payload = view.slice(5);

    switch (type) {
      case TYPE_ACK_COMM:
        return this.handleAckComm(payload);
      case TYPE_DELIVER_COMM:
        return void this.handleDeliverComm(payload);
      case TYPE_ACK_DELIVERY:
        return; // best-effort; v0.1 ignores incoming acks
      case TYPE_PING:
        this.send(TYPE_PONG, new Uint8Array(0));
        return;
      case TYPE_PONG:
        return;
      case TYPE_ERROR:
        return this.handleRelayError(payload);
    }
  }

  private handleAckComm(payload: Uint8Array): void {
    if (payload.length < 22) { this.fail('short ACK_COMM'); return; }
    this.sessionId = payload.slice(0, 16);
    // payload[16..18] = pending_count, [18..22] = mailbox_ttl_secs; relay will
    // immediately follow with N DELIVER_COMM frames, which our handler picks up.
    this.reconnectAttempt = 0;
    this.setStatus('open');
    // Start a 30s ping to keep NAT mappings warm.
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.send(TYPE_PING, new Uint8Array(0)), 30_000);
    // R10 — flush every 20s so scheduled-for-future messages auto-send
    // once their time passes. flushOutbox itself filters by scheduledFor.
    // Phase 2 P2-1 — same cadence drains the inline outbox for any
    // ephemeral wires (edit / delete / poll_vote / etc.) that piled up
    // while we were offline.
    if (this.scheduleFlushTimer) clearInterval(this.scheduleFlushTimer);
    this.scheduleFlushTimer = setInterval(() => {
      void this.flushOutbox();
      void this.flushInlineOutbox();
    }, 20_000);
    void this.flushOutbox();
    void this.flushInlineOutbox();
  }

  private async handleDeliverComm(payload: Uint8Array): Promise<void> {
    if (payload.length < 36) return;
    const fromRoutingId = payload.slice(0, 16);
    // const messageId = payload.slice(16, 32); // unused v0.1
    // const relayTs = ... // unused v0.1
    const ciphertextBytes = payload.slice(36);
    try {
      const envelope = decodeEnvelopeFromBytes(ciphertextBytes);
      // Match fromRoutingId to one of our contacts by deriving each contact's
      // routing_id and comparing.
      const contacts = await listContacts();
      const sender = contacts.find(c => c.publicKeyHex && byteEq(deriveRoutingId(c.publicKeyHex), fromRoutingId));
      if (!sender || !sender.publicKeyHex) {
        // Unknown sender — could be someone whose QR you haven't scanned.
        // v0.1 drops; v0.2 should write to a "requests" tray instead.
        devLog('[relay-client] DELIVER_COMM from unknown contact, dropping');
        return;
      }
      const me = getIdentity();
      if (!me) return;
      const wireJson = await openFromPeer(envelope, sender.publicKeyHex, sender.contactHash, me.contactHash);
      const wire = parseWirePayload(wireJson);
      await applyInboundMessage(sender.contactHash, wire);
      this.cfg.onMessage?.(sender.contactHash);
    } catch (err) {
      if ((err as Error)?.name === 'ReplayError') {
        // Already-seen envelope; drop quietly. Don't log content to keep
        // the relay's mailbox-redelivery story noise-free.
        return;
      }
      devLog('[relay-client] decrypt failed', err);
    }
  }

  private handleRelayError(payload: Uint8Array): void {
    if (payload.length < 4) return;
    const code = (payload[0] << 8) | payload[1];
    const msgLen = (payload[2] << 8) | payload[3];
    const reason = new TextDecoder().decode(payload.subarray(4, 4 + msgLen));
    console.warn(`[relay-client] relay error 0x${code.toString(16)}: ${reason}`);
    // Some codes are fatal for this connection (close + reconnect);
    // others (RATE_LIMITED, MAILBOX_FULL) leave the session open.
    if (code === 0x0005 /* INSTANCE_REPLACED */ || code === 0x0006 /* PEER_GONE */) {
      try { this.ws?.close(); } catch { /* noop */ }
    }
  }
}

// ── Builders / parsers ──────────────────────────────────────────────────

function buildProofInput(timestamp: number, relayUrl: string): Uint8Array {
  const urlBytes = new TextEncoder().encode(relayUrl);
  const out = new Uint8Array(PROOF_DOMAIN.length + 4 + urlBytes.length);
  out.set(PROOF_DOMAIN, 0);
  out[PROOF_DOMAIN.length + 0] = (timestamp >>> 24) & 0xFF;
  out[PROOF_DOMAIN.length + 1] = (timestamp >>> 16) & 0xFF;
  out[PROOF_DOMAIN.length + 2] = (timestamp >>> 8) & 0xFF;
  out[PROOF_DOMAIN.length + 3] = timestamp & 0xFF;
  out.set(urlBytes, PROOF_DOMAIN.length + 4);
  return out;
}

function buildHelloCommPayload(
  edPub: Uint8Array,
  timestamp: number,
  relayUrl: string,
  sig: Uint8Array,
  caps: number,
): Uint8Array {
  const urlBytes = new TextEncoder().encode(relayUrl);
  const out = new Uint8Array(32 + 4 + 2 + urlBytes.length + 64 + 4);
  let off = 0;
  out.set(edPub, off); off += 32;
  out[off++] = (timestamp >>> 24) & 0xFF;
  out[off++] = (timestamp >>> 16) & 0xFF;
  out[off++] = (timestamp >>> 8) & 0xFF;
  out[off++] = timestamp & 0xFF;
  out[off++] = (urlBytes.length >>> 8) & 0xFF;
  out[off++] = urlBytes.length & 0xFF;
  out.set(urlBytes, off); off += urlBytes.length;
  out.set(sig, off); off += 64;
  out[off++] = (caps >>> 24) & 0xFF;
  out[off++] = (caps >>> 16) & 0xFF;
  out[off++] = (caps >>> 8) & 0xFF;
  out[off++] = caps & 0xFF;
  return out;
}

/**
 * Encode the EncryptedEnvelope (base64 fields) into the byte slice we put
 * on the wire. Format is JSON-UTF-8 for v0.1 — simple, debuggable, and
 * the relay never inspects it. A future v0.2 can switch to a packed binary
 * form for ~30% bandwidth savings; the relay doesn't care.
 */
function encodeEnvelopeToBytes(env: EncryptedEnvelope): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(env));
}

function decodeEnvelopeFromBytes(bytes: Uint8Array): EncryptedEnvelope {
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as EncryptedEnvelope;
}

function messageIdToBytes(idStr: string): Uint8Array {
  // The IDB id is a base32-ish 20-char string. We hash it to a stable 16-byte
  // ID for the relay wire (the relay just echoes it; no semantic meaning).
  return sha256(new TextEncoder().encode(idStr)).slice(0, 16);
}

function messageIdToBytesInline(idStr: string): Uint8Array {
  return sha256(new TextEncoder().encode(idStr)).slice(0, 16);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.substr(i, 2), 16);
  return out;
}

function byteEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
