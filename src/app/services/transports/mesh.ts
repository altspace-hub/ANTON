/**
 * mesh.ts — phone-side Transport adapter implementing ANTON Mesh v0.1.
 *
 * Maintains a single WebSocket connection to a relay (with failover across
 * relay_endpoints), runs the Noise IK initiator, and multiplexes RPC
 * requests over the shared Noise channel using monotonic seq numbers.
 *
 * Reuses noise.ts + rpc.ts from server/services/mesh/ — those modules are
 * pure crypto/codec on top of @noble/* primitives, fully browser-safe.
 *
 * See docs/ANTON_MESH_SPEC.md §4 (Noise IK), §5 (RPC framing), §3.6 (ENVELOPE).
 */

import { sha256 } from '@noble/hashes/sha256';
import {
  NoiseInitiator,
  NoiseTransport,
  buildPrologue,
  type KeyPair,
} from '../../../../server/services/mesh/noise';
import {
  encodeRpc,
  decodeRpc,
  RPC_KIND,
  type RpcResponse,
  type RpcError,
} from '../../../../server/services/mesh/rpc';
import type { Instance } from '../instances';
import type { Transport, TransportRequest, TransportResponse } from './index';

// ── Wire-format constants (mirror relay/src/frame.ts §2) ────────────

const WIRE_VERSION = 0x01;
const TYPE_HELLO_PHONE = 0x02;
const TYPE_ACK_PHONE   = 0x04;
const TYPE_PING        = 0x05;
const TYPE_PONG        = 0x06;
const TYPE_ERROR       = 0x0F;
const TYPE_ENVELOPE    = 0x10;
const ROLE_INSTANCE = 0x02;

// ── Public factory ──────────────────────────────────────────────────

export interface MeshTransportConfig {
  /** Phone's X25519 static keypair (derived from device Ed25519 at pair time). */
  phoneStaticKeypair: KeyPair;
  /** Pinned instance X25519 static pubkey from the QR. */
  instanceStaticPubkey: Uint8Array;
  /** instance_id derived at pair time: sha256(instance_x_pk)[0..16). */
  instanceId: Uint8Array;
  /** Ranked WSS relay URLs the phone tries in order. */
  relayEndpoints: string[];
  /** WebSocket constructor — defaults to global.WebSocket. Tests inject. */
  WebSocketCtor?: typeof WebSocket;
  /** Optional auth-header injector — e.g. {'x-app-session': sessionToken}. */
  getAuthHeaders?: () => Record<string, string>;
}

export interface MeshTransportHandle extends Transport {
  /** Close the underlying WS connection (e.g. on instance switch / signout / teardown). */
  close(): void;
}

export function createMeshTransport(cfg: MeshTransportConfig): MeshTransportHandle {
  const conn = new MeshConnection(cfg);
  return {
    kind: 'mesh',
    isLikelyOnline: () => conn.isReady(),
    async fetch(req: TransportRequest): Promise<TransportResponse> {
      return conn.dispatch(req);
    },
    close: () => conn.close(),
  };
}

/** Convenience: build a MeshTransport from an Instance record. */
export function meshTransportForInstance(
  inst: Instance,
  opts: {
    phoneStaticKeypair: KeyPair;
    getAuthHeaders?: () => Record<string, string>;
    WebSocketCtor?: typeof WebSocket;
  },
): Transport {
  if (!inst.relay_endpoints || inst.relay_endpoints.length === 0) {
    throw new Error('Instance has transport=mesh but no relay_endpoints');
  }
  if (!inst.pubkey_pinned) {
    throw new Error('Instance has no pinned pubkey');
  }
  // For a mesh-paired Instance, pubkey_pinned is a JSON {ed, x, binding_sig}
  // (see spec §8.1). Parse out the X25519 portion.
  let x_pk: Uint8Array;
  try {
    const parsed = JSON.parse(inst.pubkey_pinned) as { x: string };
    x_pk = hexToBytes(parsed.x);
  } catch {
    throw new Error('Mesh-paired Instance has malformed pubkey_pinned');
  }
  // instance_id = sha256(x_pk)[0..16) per spec §3.3 — 16 bytes, NOT the
  // full x_pk (was a bug here pre-mesh-pairing; would corrupt HELLO_PHONE).
  const instanceId = sha256(x_pk).slice(0, 16);
  return createMeshTransport({
    phoneStaticKeypair: opts.phoneStaticKeypair,
    instanceStaticPubkey: x_pk,
    instanceId,
    relayEndpoints: inst.relay_endpoints,
    WebSocketCtor: opts.WebSocketCtor,
    getAuthHeaders: opts.getAuthHeaders,
  });
}

// ── MeshConnection — one Noise session per WS connection ────────────

interface PendingRequest {
  resolve: (resp: TransportResponse) => void;
  reject: (err: Error) => void;
  signal?: AbortSignal;
}

class MeshConnection {
  private ws: WebSocket | null = null;
  private noise: NoiseInitiator | null = null;
  private transport: NoiseTransport | null = null;
  private state: 'idle' | 'connecting' | 'helloed' | 'ready' | 'closed' = 'idle';
  private nextSeq = 1;
  private pending = new Map<number, PendingRequest>();
  private connectPromise: Promise<void> | null = null;
  private currentRelayUrl: string | null = null;
  private lastSuccessfulRequest = 0;
  private readonly MAX_BODY = 1_048_000;
  private sessionId: Uint8Array | null = null;

  constructor(private cfg: MeshTransportConfig) {}

  isReady(): boolean { return this.state === 'ready'; }

  async dispatch(req: TransportRequest): Promise<TransportResponse> {
    await this.ensureConnected();
    if (this.state !== 'ready' || !this.transport || !this.sessionId) {
      throw new Error('mesh: connection not ready');
    }

    const seq = this.nextSeq++;
    if (this.pending.has(seq)) {
      throw new Error(`mesh: seq ${seq} already in flight (impossible)`);
    }

    // Encode RPC REQUEST
    const headers = { ...(req.headers ?? {}), ...(this.cfg.getAuthHeaders?.() ?? {}) };
    const headerArr = Object.entries(headers).map(([name, value]) => ({ name, value }));
    const bodyBytes = req.body
      ? new TextEncoder().encode(req.body)
      : new Uint8Array(0);
    if (bodyBytes.length > this.MAX_BODY) {
      throw new Error(`mesh: request body ${bodyBytes.length} > ${this.MAX_BODY}`);
    }
    const rpcFrame = encodeRpc({
      kind: RPC_KIND.REQUEST,
      seq,
      method: req.method ?? (req.body ? 'POST' : 'GET'),
      path: req.path,
      headers: headerArr,
      body: bodyBytes,
    });

    // Build the response promise + register the pending entry FIRST.
    // If we sent the request before registering, a fast server could
    // deliver the response on the next event-loop tick before we ever
    // record that we're waiting for it — and it'd be dropped as "unknown
    // seq" + close the session. Order matters here.
    let resolveOuter!: (resp: TransportResponse) => void;
    let rejectOuter!: (err: Error) => void;
    const responsePromise = new Promise<TransportResponse>((resolve, reject) => {
      resolveOuter = resolve;
      rejectOuter = reject;
    });
    this.pending.set(seq, { resolve: resolveOuter, reject: rejectOuter, signal: req.signal });

    // Now encrypt + ship.
    try {
      const ciphertext = this.transport.encrypt(rpcFrame);
      const envPayload = new Uint8Array(16 + 1 + ciphertext.length);
      envPayload.set(this.sessionId, 0);
      envPayload[16] = 0x01;       // ROLE_PHONE — relay overrides
      envPayload.set(ciphertext, 17);
      this.sendFrame(TYPE_ENVELOPE, envPayload);
    } catch (err) {
      this.pending.delete(seq);
      throw err;
    }

    if (req.signal) {
      const onAbort = (): void => {
        const pending = this.pending.get(seq);
        if (!pending) return;
        this.pending.delete(seq);
        this.sendCancel(seq);
        pending.reject(new DOMException('aborted', 'AbortError'));
      };
      if (req.signal.aborted) onAbort();
      else req.signal.addEventListener('abort', onAbort, { once: true });
    }

    return responsePromise;
  }

  /** Tear down the connection (e.g. instance switched, app backgrounded). */
  close(): void {
    this.state = 'closed';
    try { this.ws?.close(1000, 'mesh_close'); } catch { /* ignore */ }
    this.ws = null;
    for (const [, p] of this.pending) p.reject(new Error('mesh: connection closed'));
    this.pending.clear();
  }

  // ── Connection setup ──────────────────────────────────────────────

  private ensureConnected(): Promise<void> {
    if (this.state === 'ready') return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connectInternal()
      .finally(() => { this.connectPromise = null; });
    return this.connectPromise;
  }

  private async connectInternal(): Promise<void> {
    // Try each relay URL in order until one accepts us.
    for (const url of this.cfg.relayEndpoints) {
      try {
        await this.attemptConnect(url);
        return;     // success
      } catch {
        // Try the next relay
        this.cleanupSocket();
      }
    }
    throw new Error('mesh: all relays unreachable');
  }

  private attemptConnect(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.state = 'connecting';
      this.currentRelayUrl = url;
      const Ctor = this.cfg.WebSocketCtor ?? globalThis.WebSocket;
      const ws = new Ctor(url);
      // Some WebSocket implementations (browsers) default to 'blob' for binary;
      // we want raw bytes via ArrayBuffer when supported. Node ws ignores this.
      try { ws.binaryType = 'arraybuffer'; } catch { /* node ws may not allow */ }
      this.ws = ws;

      const onOpen = (): void => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
        this.sendHelloPhone(url).then(resolve).catch(reject);
      };
      const onError = (): void => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
        reject(new Error('mesh: ws connect error'));
      };
      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
      // Handle both browser (MessageEvent with .data) and Node ws library
      // (which may deliver ev.data OR fire 'message' with raw Buffer).
      // Using addEventListener works for both — but Node's binaryType
      // override may produce Buffer regardless of setting.
      ws.addEventListener('message', (ev: MessageEvent | { data?: unknown }) => {
        const data = (ev as { data: unknown }).data;
        this.handleFrame(data as ArrayBuffer | Uint8Array | Blob | string);
      });
      ws.addEventListener('close', () => this.handleClose());
    });
  }

  private async sendHelloPhone(url: string): Promise<void> {
    // Build Noise IK initiator + msg 1.
    const instanceIdHex = bytesToHexImpl(this.cfg.instanceId);
    const prologue = buildPrologue(url, instanceIdHex);
    this.noise = new NoiseInitiator({
      staticKeypair: this.cfg.phoneStaticKeypair,
      responderStatic: this.cfg.instanceStaticPubkey,
      prologue,
    });
    const noiseMsg1 = this.noise.writeMessage1();

    // HELLO_PHONE layout (§3.3): instance_id (16) | phone_ephem_pk (32) | noise_init_msg
    // The phone_ephem_pk is the X25519 ephemeral the initiator generated
    // — exposed to the relay for matching purposes only. We extract it
    // from msg 1's first 32 bytes (per Noise IK msg 1 layout).
    const phoneEphemPk = noiseMsg1.slice(0, 32);
    const payload = new Uint8Array(16 + 32 + noiseMsg1.length);
    payload.set(this.cfg.instanceId, 0);
    payload.set(phoneEphemPk, 16);
    payload.set(noiseMsg1, 48);
    this.sendFrame(TYPE_HELLO_PHONE, payload);
    this.state = 'helloed';

    // Wait for ACK_PHONE + first ENVELOPE (carrying Noise msg 2).
    await this.waitForReady();
  }

  private waitForReadyResolve: (() => void) | null = null;
  private waitForReadyReject: ((err: Error) => void) | null = null;

  private waitForReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.waitForReadyResolve = resolve;
      this.waitForReadyReject = reject;
      // Time out the handshake at 10s.
      setTimeout(() => {
        if (this.state !== 'ready') {
          reject(new Error('mesh: handshake timed out'));
        }
      }, 10_000);
    });
  }

  // ── Inbound frame dispatch ────────────────────────────────────────

  private handleFrame(data: ArrayBuffer | Blob | string | Uint8Array): void {
    if (typeof data === 'string') {
      this.failConnection(new Error('mesh: unexpected text frame'));
      return;
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      // Browser fallback when binaryType wasn't honored — read as ArrayBuffer.
      void data.arrayBuffer().then((b) => this.handleFrame(b));
      return;
    }
    // Node ws library may deliver Buffer (extends Uint8Array) regardless of
    // binaryType setting. ArrayBuffer in browsers. Both work with new Uint8Array.
    const buf = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
    let frame;
    try {
      frame = decodeWireFrame(buf);
    } catch (err) {
      this.failConnection(err instanceof Error ? err : new Error('mesh: bad wire frame'));
      return;
    }
    switch (frame.type) {
      case TYPE_ACK_PHONE:
        this.sessionId = frame.payload;
        return;
      case TYPE_ENVELOPE:
        this.handleEnvelope(frame.payload);
        return;
      case TYPE_PING:
        this.sendFrame(TYPE_PONG, new Uint8Array(0));
        return;
      case TYPE_PONG:
        return;
      case TYPE_ERROR:
        this.failConnection(new Error(`mesh: relay error code 0x${(frame.payload[0]! << 8 | frame.payload[1]!).toString(16)}`));
        return;
      default:
        this.failConnection(new Error(`mesh: unexpected frame type 0x${frame.type.toString(16)}`));
        return;
    }
  }

  private handleEnvelope(payload: Uint8Array): void {
    if (payload.length < 17) {
      this.failConnection(new Error('mesh: envelope too short'));
      return;
    }
    const fromRole = payload[16];
    if (fromRole !== ROLE_INSTANCE) {
      this.failConnection(new Error('mesh: envelope wrong direction'));
      return;
    }
    const inner = payload.slice(17);

    // First ENVELOPE post-HELLO carries Noise msg 2; subsequent ones are
    // encrypted application data.
    if (this.state === 'helloed' && this.noise) {
      try {
        const { transport } = this.noise.readMessage2(inner);
        this.transport = transport;
        this.state = 'ready';
        this.noise = null;
        this.lastSuccessfulRequest = Date.now();
        this.waitForReadyResolve?.();
        this.waitForReadyResolve = null;
        this.waitForReadyReject = null;
      } catch (err) {
        this.failConnection(err instanceof Error ? err : new Error('mesh: noise msg2 fail'));
      }
      return;
    }

    if (this.state !== 'ready' || !this.transport) {
      // Envelope arrived before handshake finished — can't decrypt.
      this.failConnection(new Error('mesh: envelope before handshake'));
      return;
    }

    let plaintext: Uint8Array;
    try {
      plaintext = this.transport.decrypt(inner);
    } catch {
      this.failConnection(new Error('mesh: envelope decrypt failed'));
      return;
    }

    let rpcFrame;
    try {
      rpcFrame = decodeRpc(plaintext);
    } catch {
      this.failConnection(new Error('mesh: bad rpc frame'));
      return;
    }

    switch (rpcFrame.kind) {
      case RPC_KIND.RESPONSE:
        this.resolveResponse(rpcFrame);
        return;
      case RPC_KIND.ERROR:
        this.resolveError(rpcFrame);
        return;
      case RPC_KIND.REQUEST:
      case RPC_KIND.CANCEL:
        // Phone is the requester; receiving a request or cancel from the
        // instance is a protocol error. End the session.
        this.failConnection(new Error('mesh: instance sent request/cancel'));
        return;
    }
  }

  private resolveResponse(frame: RpcResponse): void {
    const pending = this.pending.get(frame.seq);
    if (!pending) {
      // Unknown seq — close per spec §5.4.
      this.failConnection(new Error(`mesh: response for unknown seq ${frame.seq}`));
      return;
    }
    this.pending.delete(frame.seq);
    this.lastSuccessfulRequest = Date.now();

    // Build TransportResponse from the RPC frame.
    const headers = new Headers();
    for (const h of frame.headers) headers.set(h.name, h.value);
    const bodyText = (): Promise<string> =>
      Promise.resolve(new TextDecoder('utf-8', { fatal: false }).decode(frame.body));

    const resp: TransportResponse = {
      status: frame.status,
      ok: frame.status >= 200 && frame.status < 300,
      headers,
      text: bodyText,
      json: <T = unknown>(): Promise<T> => bodyText().then((t) => JSON.parse(t) as T),
    };
    pending.resolve(resp);
  }

  private resolveError(frame: RpcError): void {
    const pending = this.pending.get(frame.seq);
    if (!pending) {
      // Session-level error (seq=0) or unknown seq — terminate.
      this.failConnection(new Error(`mesh: rpc error code 0x${frame.code.toString(16)}: ${frame.message}`));
      return;
    }
    this.pending.delete(frame.seq);
    pending.reject(new Error(`mesh rpc error 0x${frame.code.toString(16)}: ${frame.message}`));
  }

  private sendCancel(seq: number): void {
    if (!this.transport || !this.sessionId) return;
    try {
      const cancelFrame = encodeRpc({ kind: RPC_KIND.CANCEL, seq });
      const ct = this.transport.encrypt(cancelFrame);
      const env = new Uint8Array(16 + 1 + ct.length);
      env.set(this.sessionId, 0);
      env[16] = 0x01;
      env.set(ct, 17);
      this.sendFrame(TYPE_ENVELOPE, env);
    } catch {
      // best-effort cancel — if it fails, the request times out server-side
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  private failConnection(err: Error): void {
    this.waitForReadyReject?.(err);
    this.waitForReadyResolve = null;
    this.waitForReadyReject = null;
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
    this.cleanupSocket();
  }

  private handleClose(): void {
    if (this.state === 'closed') return;
    const wasReady = this.state === 'ready';
    this.state = 'idle';
    this.transport = null;
    this.sessionId = null;
    this.noise = null;
    if (this.waitForReadyReject) {
      this.waitForReadyReject(new Error('mesh: ws closed before handshake'));
      this.waitForReadyResolve = null;
      this.waitForReadyReject = null;
    }
    if (wasReady) {
      for (const [, p] of this.pending) p.reject(new Error('mesh: connection lost'));
      this.pending.clear();
    }
  }

  private cleanupSocket(): void {
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
    this.state = 'idle';
    this.transport = null;
    this.sessionId = null;
    this.noise = null;
  }

  // ── Wire ──────────────────────────────────────────────────────────

  private sendFrame(type: number, payload: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return;
    const out = new Uint8Array(5 + payload.length);
    out[0] = WIRE_VERSION;
    out[1] = type;
    out[2] = (payload.length >>> 16) & 0xFF;
    out[3] = (payload.length >>> 8) & 0xFF;
    out[4] = payload.length & 0xFF;
    out.set(payload, 5);
    this.ws.send(out);
  }
}

// ── Frame decoder ───────────────────────────────────────────────────

function decodeWireFrame(buf: Uint8Array): { type: number; payload: Uint8Array } {
  if (buf.length < 5) throw new Error('frame: short header');
  if (buf[0] !== WIRE_VERSION) throw new Error('frame: bad version');
  const len = (buf[2]! << 16) | (buf[3]! << 8) | buf[4]!;
  if (5 + len !== buf.length) throw new Error('frame: length mismatch');
  return { type: buf[1]!, payload: buf.slice(5) };
}

// ── Helpers ─────────────────────────────────────────────────────────

function bytesToHexImpl(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('odd-length hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return out;
}

