/**
 * noise.ts — Noise_IK_25519_ChaChaPoly_BLAKE2b implementation.
 *
 * Implements the IK pattern from noiseprotocol.org rev 34 § 5 with the
 * exact cipher suite locked in docs/ANTON_MESH_SPEC.md §4.1:
 *
 *   - DH function:    X25519 (via @noble/curves)
 *   - Cipher:         ChaCha20-Poly1305 (via @noble/ciphers, IETF nonce)
 *   - Hash:           BLAKE2b-256 (via @noble/hashes, dkLen 32)
 *
 * Pattern (spec §4):
 *   -> e, es, s, ss          (initiator → responder, msg 1)
 *   <- e, ee, se             (responder → initiator, msg 2)
 *
 * After both messages, both sides Split() to get send/recv ChaChaPoly keys.
 * Transport messages encrypt/decrypt with monotonic counters per direction
 * (spec §4.7).
 *
 * **Security disclaimer:** this is a clean, focused implementation against
 * Noise rev 34. Before production deployment (Phase 6), it should be
 * cross-validated against snow's / cacophony's known-answer test vectors.
 * The end-to-end handshake is exercised by symmetric round-trip tests in
 * tests/mesh-noise.test.ts.
 *
 * Spec references throughout the file mirror the wire format in
 * docs/ANTON_MESH_SPEC.md §4.
 */

import { x25519 } from '@noble/curves/ed25519';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { blake2b } from '@noble/hashes/blake2b';

// ── Constants ────────────────────────────────────────────────────────

/** Spec §4.1 protocol identifier — hashed into the initial `h`. */
const PROTOCOL_NAME = new TextEncoder().encode('Noise_IK_25519_ChaChaPoly_BLAKE2b');

/** All Noise hashes are 32 bytes (BLAKE2b-256). */
const HASHLEN = 32;

/** All Noise X25519 keys + DH outputs are 32 bytes. */
const DHLEN = 32;

/** ChaCha20-Poly1305 auth tag length. */
const TAGLEN = 16;

/** Maximum counter value — Noise spec § 5.1. Sessions MUST end before reaching it. */
const NONCE_MAX = (2n ** 64n) - 1n;

// ── Public types ─────────────────────────────────────────────────────

export interface KeyPair {
  publicKey: Uint8Array;   // 32 bytes
  privateKey: Uint8Array;  // 32 bytes
}

/** State after a successful handshake — one cipher per direction. */
export interface TransportKeys {
  /** Key for messages this side SENDS. */
  sendKey: Uint8Array;
  /** Key for messages this side RECEIVES. */
  recvKey: Uint8Array;
  /** Final handshake hash — useful for binding higher-level auth. */
  handshakeHash: Uint8Array;
}

/** A live Noise transport session. Keep one per (instance, phone) pair. */
export class NoiseTransport {
  private sendCounter = 0n;
  private recvCounter = 0n;

  constructor(
    private readonly sendKey: Uint8Array,
    private readonly recvKey: Uint8Array,
    public readonly handshakeHash: Uint8Array,
  ) {}

  /**
   * Encrypt a plaintext with the send key + next send-counter.
   * Returns ciphertext + 16-byte Poly1305 tag (no on-wire counter prefix —
   * spec §4.7 — receiver tracks its own recv-counter).
   */
  encrypt(plaintext: Uint8Array, ad: Uint8Array = new Uint8Array(0)): Uint8Array {
    if (this.sendCounter > NONCE_MAX) {
      throw new Error('Noise send counter would roll over; session must end');
    }
    const cipher = chacha20poly1305(this.sendKey, nonceBytes(this.sendCounter), ad);
    const ct = cipher.encrypt(plaintext);
    this.sendCounter++;
    return ct;
  }

  /**
   * Decrypt a ciphertext+tag with the recv key + next recv-counter.
   * Throws on AEAD tag failure. Caller MUST treat any throw as session-fatal
   * per spec §4.7 (no skip-ahead, no retry).
   */
  decrypt(ciphertext: Uint8Array, ad: Uint8Array = new Uint8Array(0)): Uint8Array {
    if (this.recvCounter > NONCE_MAX) {
      throw new Error('Noise recv counter would roll over; session must end');
    }
    const cipher = chacha20poly1305(this.recvKey, nonceBytes(this.recvCounter), ad);
    const pt = cipher.decrypt(ciphertext);
    this.recvCounter++;
    return pt;
  }

  /** Read-only counters for telemetry / tests. */
  counters(): { send: bigint; recv: bigint } {
    return { send: this.sendCounter, recv: this.recvCounter };
  }
}

// ── Handshake state — internal ───────────────────────────────────────

interface HandshakeState {
  /** Running handshake hash. */
  h: Uint8Array;
  /** Chaining key — used in HKDF derivations. */
  ck: Uint8Array;
  /** Current symmetric cipher key, or null if no DH performed yet. */
  k: Uint8Array | null;
  /** Per-key nonce counter. Resets to 0 each MixKey(). */
  n: bigint;
  /** This side's static keypair. */
  s: KeyPair;
  /** This side's ephemeral keypair (generated during the handshake). */
  e?: KeyPair;
  /** Remote side's static pubkey. Initiator knows up front (IK pattern). */
  rs?: Uint8Array;
  /** Remote side's ephemeral pubkey (learned during the handshake). */
  re?: Uint8Array;
}

// ── Symmetric-state primitives (Noise spec §5.2) ─────────────────────

function initSymmetric(prologue: Uint8Array): { h: Uint8Array; ck: Uint8Array } {
  // h = HASH(protocol_name) since len(protocol_name) > HASHLEN check —
  // for IK_25519_ChaChaPoly_BLAKE2b, protocol_name is 33 bytes, just barely
  // over HASHLEN=32, so we hash it.
  const h = PROTOCOL_NAME.length > HASHLEN
    ? blake2bHash(PROTOCOL_NAME)
    : padToHashlen(PROTOCOL_NAME);
  const ck = h.slice();
  const h2 = mixHashRaw(h, prologue);
  return { h: h2, ck };
}

function blake2bHash(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: HASHLEN });
}

function padToHashlen(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(HASHLEN);
  out.set(data, 0);
  return out;
}

function mixHashRaw(h: Uint8Array, data: Uint8Array): Uint8Array {
  const cat = new Uint8Array(h.length + data.length);
  cat.set(h, 0);
  cat.set(data, h.length);
  return blake2bHash(cat);
}

function mixHash(state: HandshakeState, data: Uint8Array): void {
  state.h = mixHashRaw(state.h, data);
}

function mixKey(state: HandshakeState, inputKeyMaterial: Uint8Array): void {
  // HKDF(ck, ikm, 2 outputs); first becomes new ck, second becomes new k.
  const [ckNew, kNew] = hkdf(state.ck, inputKeyMaterial, 2);
  state.ck = ckNew;
  state.k = kNew.slice(0, 32);
  state.n = 0n;
}

/**
 * HKDF as defined by Noise spec §5.3 — uses HMAC-BLAKE2b internally.
 * Returns `numOutputs` 32-byte slabs.
 */
function hkdf(chainingKey: Uint8Array, ikm: Uint8Array, numOutputs: 2 | 3): Uint8Array[] {
  const tempKey = hmacBlake2b(chainingKey, ikm);
  const out1 = hmacBlake2b(tempKey, new Uint8Array([0x01]));
  const out2Input = new Uint8Array(out1.length + 1);
  out2Input.set(out1, 0);
  out2Input[out1.length] = 0x02;
  const out2 = hmacBlake2b(tempKey, out2Input);
  if (numOutputs === 2) return [out1, out2];
  const out3Input = new Uint8Array(out2.length + 1);
  out3Input.set(out2, 0);
  out3Input[out2.length] = 0x03;
  const out3 = hmacBlake2b(tempKey, out3Input);
  return [out1, out2, out3];
}

/**
 * HMAC using BLAKE2b as the underlying hash. BLAKE2b has a native keyed-mode,
 * but the Noise spec specifies HMAC explicitly — we follow it exactly.
 */
function hmacBlake2b(key: Uint8Array, data: Uint8Array): Uint8Array {
  // BLAKE2b internal block size is 128 bytes (BLOCKLEN per spec).
  const BLOCKLEN = 128;
  let k = key;
  if (k.length > BLOCKLEN) k = blake2bHash(k);
  const kPadded = new Uint8Array(BLOCKLEN);
  kPadded.set(k, 0);
  const opad = new Uint8Array(BLOCKLEN);
  const ipad = new Uint8Array(BLOCKLEN);
  for (let i = 0; i < BLOCKLEN; i++) {
    opad[i] = kPadded[i]! ^ 0x5c;
    ipad[i] = kPadded[i]! ^ 0x36;
  }
  const inner = new Uint8Array(BLOCKLEN + data.length);
  inner.set(ipad, 0);
  inner.set(data, BLOCKLEN);
  const innerHash = blake2bHash(inner);
  const outer = new Uint8Array(BLOCKLEN + innerHash.length);
  outer.set(opad, 0);
  outer.set(innerHash, BLOCKLEN);
  return blake2bHash(outer);
}

function encryptAndHash(state: HandshakeState, plaintext: Uint8Array): Uint8Array {
  if (!state.k) {
    // No cipher yet — plaintext flows through, just mix into h.
    mixHash(state, plaintext);
    return plaintext;
  }
  const cipher = chacha20poly1305(state.k, nonceBytes(state.n), state.h);
  const ct = cipher.encrypt(plaintext);
  state.n++;
  mixHash(state, ct);
  return ct;
}

function decryptAndHash(state: HandshakeState, ciphertext: Uint8Array): Uint8Array {
  if (!state.k) {
    mixHash(state, ciphertext);
    return ciphertext;
  }
  const cipher = chacha20poly1305(state.k, nonceBytes(state.n), state.h);
  const pt = cipher.decrypt(ciphertext);
  state.n++;
  mixHash(state, ciphertext);
  return pt;
}

function nonceBytes(counter: bigint): Uint8Array {
  // IETF ChaCha20-Poly1305 nonce: 4 zero bytes || u64 LE counter
  // (spec §4.7).
  const out = new Uint8Array(12);
  let c = counter;
  for (let i = 4; i < 12; i++) {
    out[i] = Number(c & 0xFFn);
    c >>= 8n;
  }
  return out;
}

// ── Pattern execution — IK ──────────────────────────────────────────

function dh(priv: Uint8Array, pub: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(priv, pub);
}

function genEphemeral(): KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

/** Final Split() — derives two transport keys from the chaining key. */
function split(state: HandshakeState): { k1: Uint8Array; k2: Uint8Array } {
  const [k1, k2] = hkdf(state.ck, new Uint8Array(0), 2);
  return { k1: k1.slice(0, 32), k2: k2.slice(0, 32) };
}

// ── Initiator API ────────────────────────────────────────────────────

export interface InitiatorOptions {
  /** Initiator's long-term static keypair (X25519). */
  staticKeypair: KeyPair;
  /** Responder's known static pubkey from pairing (X25519). */
  responderStatic: Uint8Array;
  /** Prologue bytes — must match between initiator and responder. */
  prologue: Uint8Array;
}

export class NoiseInitiator {
  private state: HandshakeState;
  private writeMessageCalled = false;
  private readMessageCalled = false;

  constructor(opts: InitiatorOptions) {
    if (opts.staticKeypair.publicKey.length !== DHLEN) throw new Error('static pubkey size');
    if (opts.staticKeypair.privateKey.length !== DHLEN) throw new Error('static privkey size');
    if (opts.responderStatic.length !== DHLEN) throw new Error('responder static size');
    const sym = initSymmetric(opts.prologue);
    this.state = {
      h: sym.h,
      ck: sym.ck,
      k: null,
      n: 0n,
      s: opts.staticKeypair,
      rs: opts.responderStatic,
    };
    // IK pre-message: mixHash(rs)
    mixHash(this.state, this.state.rs!);
  }

  /**
   * Produce handshake message 1: -> e, es, s, ss [optional payload]
   * The initiator's ephemeral is generated fresh inside this call.
   */
  writeMessage1(payload: Uint8Array = new Uint8Array(0)): Uint8Array {
    if (this.writeMessageCalled) throw new Error('Noise: writeMessage1 already called');
    this.writeMessageCalled = true;

    // e: generate ephemeral, send pubkey, mixHash(e_pub)
    this.state.e = genEphemeral();
    mixHash(this.state, this.state.e.publicKey);
    // es: mixKey(DH(e_priv, rs))
    mixKey(this.state, dh(this.state.e.privateKey, this.state.rs!));
    // s: encrypt static pubkey with current k, send ciphertext, mixHash inside encryptAndHash
    const sCiphertext = encryptAndHash(this.state, this.state.s.publicKey);
    // ss: mixKey(DH(s_priv, rs))
    mixKey(this.state, dh(this.state.s.privateKey, this.state.rs!));
    // payload: encrypt with current k
    const payloadCiphertext = encryptAndHash(this.state, payload);

    // Layout: e_pub (32) || s_ciphertext (48 = 32 + 16 tag) || payload_ciphertext
    const msg = new Uint8Array(this.state.e.publicKey.length + sCiphertext.length + payloadCiphertext.length);
    let off = 0;
    msg.set(this.state.e.publicKey, off); off += this.state.e.publicKey.length;
    msg.set(sCiphertext, off);             off += sCiphertext.length;
    msg.set(payloadCiphertext, off);
    return msg;
  }

  /**
   * Read handshake message 2: <- e, ee, se [optional payload]
   * Returns the decrypted payload (empty in v0.1).
   */
  readMessage2(message: Uint8Array): { payload: Uint8Array; transport: NoiseTransport } {
    if (this.readMessageCalled) throw new Error('Noise: readMessage2 already called');
    if (!this.writeMessageCalled) throw new Error('Noise: must call writeMessage1 first');
    this.readMessageCalled = true;

    if (message.length < DHLEN + TAGLEN) throw new Error('Noise: message 2 too short');
    let off = 0;
    // e: read responder ephemeral
    this.state.re = message.slice(off, off + DHLEN);
    off += DHLEN;
    mixHash(this.state, this.state.re);
    // ee: mixKey(DH(e_priv, re))
    mixKey(this.state, dh(this.state.e!.privateKey, this.state.re));
    // se: mixKey(DH(s_priv, re))
    mixKey(this.state, dh(this.state.s.privateKey, this.state.re));
    // payload: decrypt with current k
    const payloadCt = message.slice(off);
    const payload = decryptAndHash(this.state, payloadCt);

    // Split() — initiator: sendKey=k1, recvKey=k2
    const { k1, k2 } = split(this.state);
    return {
      payload,
      transport: new NoiseTransport(k1, k2, this.state.h),
    };
  }
}

// ── Responder API ────────────────────────────────────────────────────

export interface ResponderOptions {
  /** Responder's long-term static keypair (X25519). */
  staticKeypair: KeyPair;
  /** Prologue bytes — must match between initiator and responder. */
  prologue: Uint8Array;
}

export class NoiseResponder {
  private state: HandshakeState;
  private readMessageCalled = false;
  private writeMessageCalled = false;
  /**
   * Initiator's static pubkey, recovered from message 1. Available after
   * readMessage1() succeeds. Used by the application layer to look up the
   * device row in `app_devices` (spec §4.8).
   */
  initiatorStatic: Uint8Array | null = null;

  constructor(opts: ResponderOptions) {
    if (opts.staticKeypair.publicKey.length !== DHLEN) throw new Error('static pubkey size');
    if (opts.staticKeypair.privateKey.length !== DHLEN) throw new Error('static privkey size');
    const sym = initSymmetric(opts.prologue);
    this.state = {
      h: sym.h,
      ck: sym.ck,
      k: null,
      n: 0n,
      s: opts.staticKeypair,
    };
    // IK pre-message: mixHash(rs) — for responder, rs is its OWN static.
    mixHash(this.state, this.state.s.publicKey);
  }

  /**
   * Read handshake message 1: -> e, es, s, ss [optional payload]
   * Returns the decrypted payload (empty in v0.1) and the initiator's
   * static pubkey for application-layer auth.
   */
  readMessage1(message: Uint8Array): { payload: Uint8Array; initiatorStatic: Uint8Array } {
    if (this.readMessageCalled) throw new Error('Noise: readMessage1 already called');
    this.readMessageCalled = true;

    // Layout: e_pub (32) || s_ct (48) || payload_ct (>= 16)
    const minLen = DHLEN + DHLEN + TAGLEN + TAGLEN;
    if (message.length < minLen) throw new Error('Noise: message 1 too short');

    let off = 0;
    // e: read initiator ephemeral
    this.state.re = message.slice(off, off + DHLEN);
    off += DHLEN;
    mixHash(this.state, this.state.re);
    // es: mixKey(DH(s_priv, re))
    mixKey(this.state, dh(this.state.s.privateKey, this.state.re));
    // s: decrypt initiator static pubkey
    const sCiphertext = message.slice(off, off + DHLEN + TAGLEN);
    off += DHLEN + TAGLEN;
    const sPubkey = decryptAndHash(this.state, sCiphertext);
    if (sPubkey.length !== DHLEN) throw new Error('Noise: bad initiator static pubkey length');
    this.initiatorStatic = sPubkey;
    // ss: mixKey(DH(s_priv, initiator_static))
    mixKey(this.state, dh(this.state.s.privateKey, sPubkey));
    // payload: decrypt with current k
    const payloadCt = message.slice(off);
    const payload = decryptAndHash(this.state, payloadCt);

    return { payload, initiatorStatic: sPubkey };
  }

  /**
   * Produce handshake message 2: <- e, ee, se [optional payload]
   * Generates the responder's ephemeral fresh.
   */
  writeMessage2(payload: Uint8Array = new Uint8Array(0)): { message: Uint8Array; transport: NoiseTransport } {
    if (this.writeMessageCalled) throw new Error('Noise: writeMessage2 already called');
    if (!this.readMessageCalled) throw new Error('Noise: must call readMessage1 first');
    this.writeMessageCalled = true;

    // e: generate responder ephemeral
    this.state.e = genEphemeral();
    mixHash(this.state, this.state.e.publicKey);
    // ee: mixKey(DH(e_priv, re))
    mixKey(this.state, dh(this.state.e.privateKey, this.state.re!));
    // se: mixKey(DH(e_priv, initiator_static))
    mixKey(this.state, dh(this.state.e.privateKey, this.initiatorStatic!));
    // payload: encrypt with current k
    const payloadCiphertext = encryptAndHash(this.state, payload);

    const msg = new Uint8Array(this.state.e.publicKey.length + payloadCiphertext.length);
    msg.set(this.state.e.publicKey, 0);
    msg.set(payloadCiphertext, this.state.e.publicKey.length);

    // Split() — responder: sendKey=k2, recvKey=k1 (mirrors initiator)
    const { k1, k2 } = split(this.state);
    return {
      message: msg,
      transport: new NoiseTransport(k2, k1, this.state.h),
    };
  }
}

// ── Helpers exposed for tests + Phase 3.3 dialer ─────────────────────

/** Generate an X25519 keypair (used by tests + the future per-pairing flow). */
export function generateX25519Keypair(): KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

/** Build the spec §4.2 prologue for a given relay URL + instance_id (hex). */
export function buildPrologue(canonicalRelayUrl: string, instanceIdHex: string): Uint8Array {
  return new TextEncoder().encode(
    `ANTON-MESH/v1\n${canonicalRelayUrl}\n${instanceIdHex}`,
  );
}
