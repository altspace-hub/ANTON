import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildHelloInstance,
  buildBindingSig,
  parseHelloInstance,
  parseHelloPhone,
  verifyHelloInstance,
  HelloError,
  HelloVerificationError,
  PROOF_TIMESTAMP_WINDOW_S,
  type HelloVerifierConfig,
} from '../src/hello.js';
import {
  ed25519GenerateKeypair,
  ed25519PkToCurve25519,
  ed25519Sign,
  bytesToHex,
} from '../src/primitives.js';

// ── Test fixture: a fully-valid HELLO_INSTANCE we can mutate per test ──

interface Fixture {
  ed_pk: Uint8Array;
  ed_priv: Uint8Array;
  x_pk: Uint8Array;
  binding_sig: Uint8Array;
  relayUrl: string;
  timestamp: number;
  payload: Uint8Array;
  cfg: HelloVerifierConfig;
  seenProofs: Set<string>;
}

function makeFixture(overrides: Partial<{
  relayUrl: string;
  timestamp: number;
  cfgUrl: string;
  now: number;
}> = {}): Fixture {
  const { publicKey: ed_pk, privateKey: ed_priv } = ed25519GenerateKeypair();
  const x_pk = ed25519PkToCurve25519(ed_pk);
  const sign = (msg: Uint8Array) => ed25519Sign(msg, ed_priv);
  const binding_sig = buildBindingSig(ed_pk, x_pk, sign);
  const relayUrl = overrides.relayUrl ?? 'wss://r1.openexpert.org';
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000);
  const payload = buildHelloInstance({
    instance_ed_pk: ed_pk,
    instance_static_pk: x_pk,
    binding_sig,
    relay_url: relayUrl,
    timestamp,
    caps: 0,
    sign,
  });
  const seenProofs = new Set<string>();
  const cfg: HelloVerifierConfig = {
    ownCanonicalUrl: overrides.cfgUrl ?? relayUrl,
    recordProof: (key) => {
      if (seenProofs.has(key)) return false;
      seenProofs.add(key);
      return true;
    },
    now: () => overrides.now ?? Math.floor(Date.now() / 1000),
  };
  return { ed_pk, ed_priv, x_pk, binding_sig, relayUrl, timestamp, payload, cfg, seenProofs };
}

describe('parseHelloInstance', () => {
  it('parses a valid payload', () => {
    const f = makeFixture();
    const parsed = parseHelloInstance(f.payload);
    expect(bytesToHex(parsed.instance_ed_pk)).toBe(bytesToHex(f.ed_pk));
    expect(bytesToHex(parsed.instance_static_pk)).toBe(bytesToHex(f.x_pk));
    expect(parsed.relay_url).toBe(f.relayUrl);
    expect(parsed.timestamp).toBe(f.timestamp);
  });

  it('rejects a payload shorter than the minimum', () => {
    expect(() => parseHelloInstance(new Uint8Array(50))).toThrow(HelloVerificationError);
  });

  it('rejects a payload with an oversized relay_url_len', () => {
    const f = makeFixture();
    const bad = new Uint8Array(f.payload);
    // relay_url_len lives at offset 16+32+32+64 = 144
    bad[144] = 0xFF;
    bad[145] = 0xFF;
    expect(() => parseHelloInstance(bad)).toThrow(HelloVerificationError);
  });

  it('rejects a payload with trailing bytes after caps', () => {
    const f = makeFixture();
    const bad = new Uint8Array(f.payload.length + 5);
    bad.set(f.payload);
    expect(() => parseHelloInstance(bad)).toThrow(HelloVerificationError);
  });
});

describe('verifyHelloInstance — happy path', () => {
  it('accepts a valid HELLO_INSTANCE', () => {
    const f = makeFixture();
    const parsed = verifyHelloInstance(f.payload, f.cfg);
    expect(bytesToHex(parsed.instance_ed_pk)).toBe(bytesToHex(f.ed_pk));
  });
});

describe('verifyHelloInstance — step 1: instance_id mismatch (BAD_HELLO)', () => {
  it('rejects when instance_id does not match sha256(static_pk)[0..16)', () => {
    const f = makeFixture();
    const bad = new Uint8Array(f.payload);
    // Flip a bit in the instance_id (offset 0..16)
    bad[3] ^= 0x01;
    try {
      verifyHelloInstance(bad, f.cfg);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as HelloVerificationError).code).toBe(HelloError.BAD_HELLO);
      expect((e as HelloVerificationError).step).toBe(1);
    }
  });
});

describe('verifyHelloInstance — step 2: binding_sig invalid (BAD_HELLO)', () => {
  it('rejects when binding_sig is corrupted', () => {
    const f = makeFixture();
    const bad = new Uint8Array(f.payload);
    // binding_sig at offset 16+32+32 = 80, length 64
    bad[80] ^= 0x01;
    try {
      verifyHelloInstance(bad, f.cfg);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as HelloVerificationError).code).toBe(HelloError.BAD_HELLO);
      expect((e as HelloVerificationError).step).toBe(2);
    }
  });

  it('rejects when ed_pk and x_pk are mismatched (binding_sig still valid for the ed_pk)', () => {
    // Attacker scenario: generate two real keypairs, sign a binding for the first
    // ed_pk over the SECOND x_pk. binding_sig will verify under ed_pk_A — but
    // x_pk_B != ed25519_pk_to_curve25519(ed_pk_A), which step 2's derived check
    // catches.
    const a = ed25519GenerateKeypair();
    const b = ed25519GenerateKeypair();
    const x_pk_a = ed25519PkToCurve25519(a.publicKey);
    const x_pk_b = ed25519PkToCurve25519(b.publicKey);
    // Build with ed_pk = a, x_pk = b — binding signed by A over (a_ed || b_x)
    const sign = (m: Uint8Array) => ed25519Sign(m, a.privateKey);
    const binding_sig = buildBindingSig(a.publicKey, x_pk_b, sign);
    // Need to pass the WRONG instance_id (sha256(x_pk_b)[0..16)) so step 1
    // doesn't fire first; we want to exercise step 2's derived-x check.
    const payload = buildHelloInstance({
      instance_ed_pk: a.publicKey,
      instance_static_pk: x_pk_b, // mismatched on purpose
      binding_sig,
      relay_url: 'wss://r1.openexpert.org',
      timestamp: Math.floor(Date.now() / 1000),
      caps: 0,
      sign,
    });
    const cfg: HelloVerifierConfig = {
      ownCanonicalUrl: 'wss://r1.openexpert.org',
      recordProof: () => true,
      now: () => Math.floor(Date.now() / 1000),
    };
    try {
      verifyHelloInstance(payload, cfg);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as HelloVerificationError).code).toBe(HelloError.BAD_HELLO);
      expect((e as HelloVerificationError).step).toBe(2);
    }
    // Sanity: this would NOT have been caught by step 1 because we used the
    // x_pk_b in the instance_id derivation. (The buildHelloInstance helper
    // computes instance_id from instance_static_pk = x_pk_b, so step 1 passes.)
    expect(bytesToHex(x_pk_a)).not.toBe(bytesToHex(x_pk_b));
  });
});

describe('verifyHelloInstance — step 3: relay_url mismatch (BAD_HELLO)', () => {
  it('rejects when the HELLO claims a different relay URL than ours', () => {
    const f = makeFixture({ relayUrl: 'wss://r1.openexpert.org', cfgUrl: 'wss://r2.openexpert.org' });
    try {
      verifyHelloInstance(f.payload, f.cfg);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as HelloVerificationError).code).toBe(HelloError.BAD_HELLO);
      expect((e as HelloVerificationError).step).toBe(3);
    }
  });
});

describe('verifyHelloInstance — step 4: timestamp out of window (INVALID_PROOF)', () => {
  it('rejects when the HELLO timestamp is too old', () => {
    const now = Math.floor(Date.now() / 1000);
    const f = makeFixture({ timestamp: now - PROOF_TIMESTAMP_WINDOW_S - 5, now });
    try {
      verifyHelloInstance(f.payload, f.cfg);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as HelloVerificationError).code).toBe(HelloError.INVALID_PROOF);
      expect((e as HelloVerificationError).step).toBe(4);
    }
  });

  it('rejects when the HELLO timestamp is too far in the future', () => {
    const now = Math.floor(Date.now() / 1000);
    const f = makeFixture({ timestamp: now + PROOF_TIMESTAMP_WINDOW_S + 5, now });
    try {
      verifyHelloInstance(f.payload, f.cfg);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as HelloVerificationError).code).toBe(HelloError.INVALID_PROOF);
      expect((e as HelloVerificationError).step).toBe(4);
    }
  });

  it('accepts at exactly the window boundary', () => {
    const now = Math.floor(Date.now() / 1000);
    const f = makeFixture({ timestamp: now - PROOF_TIMESTAMP_WINDOW_S, now });
    expect(() => verifyHelloInstance(f.payload, f.cfg)).not.toThrow();
  });
});

describe('verifyHelloInstance — step 5: proof_sig invalid (INVALID_PROOF)', () => {
  it('rejects when proof_sig is corrupted', () => {
    const f = makeFixture();
    const bad = new Uint8Array(f.payload);
    // proof_sig offset = 16+32+32+64+2+relay_url_len+4 = 150 + relay_url_len
    const offset = 16 + 32 + 32 + 64 + 2 + f.relayUrl.length + 4;
    bad[offset] ^= 0x01;
    try {
      verifyHelloInstance(bad, f.cfg);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as HelloVerificationError).code).toBe(HelloError.INVALID_PROOF);
      expect((e as HelloVerificationError).step).toBe(5);
    }
  });
});

describe('verifyHelloInstance — step 6: replay (INVALID_PROOF)', () => {
  it('rejects a second HELLO with the same proof_sig (within the window)', () => {
    const f = makeFixture();
    // First call passes
    expect(() => verifyHelloInstance(f.payload, f.cfg)).not.toThrow();
    // Second call with the same payload (same proof_sig) — replay
    try {
      verifyHelloInstance(f.payload, f.cfg);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as HelloVerificationError).code).toBe(HelloError.INVALID_PROOF);
      expect((e as HelloVerificationError).step).toBe(6);
    }
  });
});

describe('verifyHelloInstance — T16-style: relay-replay defeated by relay_url binding', () => {
  it('a HELLO signed for relay R1 fails verification at relay R2 even if R2 has never seen the proof_sig', () => {
    // Build the HELLO with relay_url=R1, proof_sig binds R1 into the signature.
    const f = makeFixture({ relayUrl: 'wss://r1.openexpert.org' });
    // R2 has its own canonical URL — but the HELLO's relay_url field still says R1.
    // Step 3 catches this BEFORE step 5 (proof verification), so attempt to forward
    // to R2 fails immediately on the relay_url comparison.
    const r2cfg: HelloVerifierConfig = {
      ownCanonicalUrl: 'wss://r2.openexpert.org',
      recordProof: () => true,
      now: () => Math.floor(Date.now() / 1000),
    };
    try {
      verifyHelloInstance(f.payload, r2cfg);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as HelloVerificationError).step).toBe(3);
    }
    // And IF an attacker tampered with the relay_url field on the wire
    // (changing it from R1 to R2 inline), proof_sig verification (step 5)
    // would catch it because relay_url is in the signed payload:
    const tampered = new Uint8Array(f.payload);
    const urlOffset = 16 + 32 + 32 + 64 + 2;
    const r1bytes = new TextEncoder().encode('wss://r1.openexpert.org');
    const r2bytes = new TextEncoder().encode('wss://r2.openexpert.org');
    expect(r1bytes.length).toBe(r2bytes.length); // sanity check for in-place tamper
    tampered.set(r2bytes, urlOffset);
    try {
      verifyHelloInstance(tampered, r2cfg);
      expect.unreachable('should have thrown');
    } catch (e) {
      // Tampering with relay_url means proof_sig was signed over r1bytes but
      // we're verifying against r2bytes — proof_sig fails (step 5).
      expect((e as HelloVerificationError).step).toBe(5);
    }
  });
});

describe('parseHelloPhone', () => {
  it('parses a minimum-length payload (16 + 32 + 0)', () => {
    const payload = new Uint8Array(48);
    for (let i = 0; i < 16; i++) payload[i] = 0xAB;
    for (let i = 16; i < 48; i++) payload[i] = 0xCD;
    const parsed = parseHelloPhone(payload);
    expect(parsed.instance_id).toHaveLength(16);
    expect(parsed.phone_ephem_pk).toHaveLength(32);
    expect(parsed.noise_init_msg).toHaveLength(0);
  });

  it('parses a payload with a noise_init_msg', () => {
    const payload = new Uint8Array(48 + 100);
    const parsed = parseHelloPhone(payload);
    expect(parsed.noise_init_msg).toHaveLength(100);
  });

  it('rejects a payload shorter than 48 bytes', () => {
    expect(() => parseHelloPhone(new Uint8Array(47))).toThrow(HelloVerificationError);
  });
});
