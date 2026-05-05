import { describe, it, expect } from 'vitest';
import {
  NoiseInitiator,
  NoiseResponder,
  generateX25519Keypair,
  buildPrologue,
} from '../../server/services/mesh/noise.js';

const PROLOGUE = buildPrologue('wss://r1.openexpert.org', 'aabbccdd11223344556677889900aabb');

// ── Happy-path handshake ────────────────────────────────────────────

describe('Noise IK — happy path', () => {
  it('completes a full handshake and produces matching transport keys', () => {
    const responder = generateX25519Keypair();
    const initiator = generateX25519Keypair();

    const init = new NoiseInitiator({
      staticKeypair: initiator,
      responderStatic: responder.publicKey,
      prologue: PROLOGUE,
    });
    const resp = new NoiseResponder({
      staticKeypair: responder,
      prologue: PROLOGUE,
    });

    const msg1 = init.writeMessage1();
    const { initiatorStatic } = resp.readMessage1(msg1);
    // Responder learned the initiator's static pubkey from msg 1
    expect([...initiatorStatic]).toEqual([...initiator.publicKey]);

    const { message: msg2, transport: respTransport } = resp.writeMessage2();
    const { transport: initTransport } = init.readMessage2(msg2);

    // Both sides share the same handshake hash — bind for higher layers
    expect([...initTransport.handshakeHash]).toEqual([...respTransport.handshakeHash]);
  });

  it('symmetric transport: initiator → responder round-trip', () => {
    const { initTransport, respTransport } = doHandshake();
    const plaintext = new TextEncoder().encode('hello from phone');
    const ct = initTransport.encrypt(plaintext);
    const pt = respTransport.decrypt(ct);
    expect(new TextDecoder().decode(pt)).toBe('hello from phone');
  });

  it('symmetric transport: responder → initiator round-trip', () => {
    const { initTransport, respTransport } = doHandshake();
    const plaintext = new TextEncoder().encode('hello from instance');
    const ct = respTransport.encrypt(plaintext);
    const pt = initTransport.decrypt(ct);
    expect(new TextDecoder().decode(pt)).toBe('hello from instance');
  });

  it('counters advance independently per direction across many messages', () => {
    const { initTransport, respTransport } = doHandshake();
    for (let i = 0; i < 100; i++) {
      const ct = initTransport.encrypt(new Uint8Array([i]));
      const pt = respTransport.decrypt(ct);
      expect(pt[0]).toBe(i);
    }
    expect(initTransport.counters().send).toBe(100n);
    expect(respTransport.counters().recv).toBe(100n);
    // Reverse direction starts fresh at 0.
    expect(initTransport.counters().recv).toBe(0n);
    expect(respTransport.counters().send).toBe(0n);
  });

  it('handles a 1 MiB plaintext', () => {
    const { initTransport, respTransport } = doHandshake();
    const big = new Uint8Array(1_000_000);
    for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 0xFF;
    const ct = initTransport.encrypt(big);
    const pt = respTransport.decrypt(ct);
    // Spot-check (deep equal on 1 MiB is slow).
    expect(pt.length).toBe(big.length);
    expect(pt[0]).toBe(big[0]);
    expect(pt[500_000]).toBe(big[500_000]);
    expect(pt[big.length - 1]).toBe(big[big.length - 1]);
  });
});

// ── Tamper detection ────────────────────────────────────────────────

describe('Noise IK — tamper detection', () => {
  it('rejects msg 1 if a byte is flipped', () => {
    const responder = generateX25519Keypair();
    const initiator = generateX25519Keypair();
    const init = new NoiseInitiator({
      staticKeypair: initiator,
      responderStatic: responder.publicKey,
      prologue: PROLOGUE,
    });
    const resp = new NoiseResponder({
      staticKeypair: responder,
      prologue: PROLOGUE,
    });
    const msg1 = init.writeMessage1();
    // Flip a byte in the static-pubkey ciphertext (offset 32, length 48).
    const tampered = new Uint8Array(msg1);
    tampered[40] ^= 0x01;
    expect(() => resp.readMessage1(tampered)).toThrow();
  });

  it('rejects msg 2 if a byte is flipped', () => {
    const { init, resp, msg1 } = startHandshake();
    resp.readMessage1(msg1);
    const { message: msg2 } = resp.writeMessage2();
    const tampered = new Uint8Array(msg2);
    tampered[35] ^= 0x01;   // any byte in the post-ephemeral region
    expect(() => init.readMessage2(tampered)).toThrow();
  });

  it('rejects a transport message tampered after encryption', () => {
    const { initTransport, respTransport } = doHandshake();
    const ct = initTransport.encrypt(new TextEncoder().encode('confidential'));
    const tampered = new Uint8Array(ct);
    tampered[5] ^= 0x01;
    expect(() => respTransport.decrypt(tampered)).toThrow();
  });

  it('rejects a transport message replayed at the wrong counter', () => {
    const { initTransport, respTransport } = doHandshake();
    const ct1 = initTransport.encrypt(new TextEncoder().encode('first'));
    initTransport.encrypt(new TextEncoder().encode('second'));
    // Replay ct1 — it was decrypted at counter 0, now we'd be at counter 2.
    respTransport.decrypt(ct1); // first one OK at counter 0
    // Now try the same ct again — counter is at 1, key+nonce different.
    expect(() => respTransport.decrypt(ct1)).toThrow();
  });
});

// ── Wrong-key rejection ─────────────────────────────────────────────

describe('Noise IK — authentication failure cases', () => {
  it('initiator rejects responder with a different static key (impostor)', () => {
    const realResponder = generateX25519Keypair();
    const impostor = generateX25519Keypair();
    const initiator = generateX25519Keypair();

    const init = new NoiseInitiator({
      staticKeypair: initiator,
      responderStatic: realResponder.publicKey,    // initiator pinned the real one
      prologue: PROLOGUE,
    });
    const impostorResp = new NoiseResponder({
      staticKeypair: impostor,                      // impostor uses a different static
      prologue: PROLOGUE,
    });

    const msg1 = init.writeMessage1();
    // The impostor cannot decrypt msg1's static-pubkey ciphertext because
    // it was encrypted with DH(e_priv, real_responder_static), not with DH
    // against the impostor's key.
    expect(() => impostorResp.readMessage1(msg1)).toThrow();
  });

  it('responder rejects msg 1 if the prologue differs', () => {
    const responder = generateX25519Keypair();
    const initiator = generateX25519Keypair();
    const init = new NoiseInitiator({
      staticKeypair: initiator,
      responderStatic: responder.publicKey,
      prologue: PROLOGUE,
    });
    const resp = new NoiseResponder({
      staticKeypair: responder,
      prologue: buildPrologue('wss://r2.openexpert.org', 'aabbccdd11223344556677889900aabb'),
    });
    const msg1 = init.writeMessage1();
    // Different relay URL in prologue → handshake hash diverges → AEAD fails.
    expect(() => resp.readMessage1(msg1)).toThrow();
  });

  it('responder rejects msg 1 if the instance_id portion of the prologue differs', () => {
    const responder = generateX25519Keypair();
    const initiator = generateX25519Keypair();
    const init = new NoiseInitiator({
      staticKeypair: initiator,
      responderStatic: responder.publicKey,
      prologue: buildPrologue('wss://r1.openexpert.org', 'aaaa...'),
    });
    const resp = new NoiseResponder({
      staticKeypair: responder,
      prologue: buildPrologue('wss://r1.openexpert.org', 'bbbb...'),
    });
    const msg1 = init.writeMessage1();
    expect(() => resp.readMessage1(msg1)).toThrow();
  });
});

// ── Forward secrecy + ephemeral freshness ──────────────────────────

describe('Noise IK — ephemeral freshness', () => {
  it('two handshakes with the same static keys produce different transport keys', () => {
    const responder = generateX25519Keypair();
    const initiator = generateX25519Keypair();

    const a = handshake(initiator, responder);
    const b = handshake(initiator, responder);

    // Different ephemerals each round → different chaining keys → different transport keys.
    expect([...a.initTransport.handshakeHash]).not.toEqual([...b.initTransport.handshakeHash]);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────

function startHandshake(): {
  init: NoiseInitiator;
  resp: NoiseResponder;
  msg1: Uint8Array;
  initiatorStatic: { publicKey: Uint8Array; privateKey: Uint8Array };
  responderStatic: { publicKey: Uint8Array; privateKey: Uint8Array };
} {
  const responder = generateX25519Keypair();
  const initiator = generateX25519Keypair();
  const init = new NoiseInitiator({
    staticKeypair: initiator,
    responderStatic: responder.publicKey,
    prologue: PROLOGUE,
  });
  const resp = new NoiseResponder({
    staticKeypair: responder,
    prologue: PROLOGUE,
  });
  const msg1 = init.writeMessage1();
  return { init, resp, msg1, initiatorStatic: initiator, responderStatic: responder };
}

function doHandshake() {
  const { init, resp, msg1 } = startHandshake();
  resp.readMessage1(msg1);
  const { message: msg2, transport: respTransport } = resp.writeMessage2();
  const { transport: initTransport } = init.readMessage2(msg2);
  return { initTransport, respTransport };
}

function handshake(
  initiatorKp: { publicKey: Uint8Array; privateKey: Uint8Array },
  responderKp: { publicKey: Uint8Array; privateKey: Uint8Array },
) {
  const init = new NoiseInitiator({
    staticKeypair: initiatorKp,
    responderStatic: responderKp.publicKey,
    prologue: PROLOGUE,
  });
  const resp = new NoiseResponder({
    staticKeypair: responderKp,
    prologue: PROLOGUE,
  });
  const msg1 = init.writeMessage1();
  resp.readMessage1(msg1);
  const { message: msg2, transport: respTransport } = resp.writeMessage2();
  const { transport: initTransport } = init.readMessage2(msg2);
  return { initTransport, respTransport };
}
