/**
 * Unit tests for the registry-protocol trust primitives (Wave-3 plan 3.7):
 *
 *   - canonicalize: RFC 8785 determinism + loud failure on non-canonicalisable
 *   - buildEnvelope / signEnvelope / parseEnvelope: signed-operation
 *     round-trip with REAL Ed25519 keys, tamper + malformed rejection
 *   - signEnvelopeTwoSig / parseEnvelopeTwoSig: transfer-style dual signing
 *   - assertReplayWindow: timestamp window + nonce uniqueness
 *   - homoglyph defences: mixed-script detection + UTS #39 skeleton
 *     (latin/cyrillic/greek/fullwidth lookalikes collide; clean names pass)
 *
 * No DB, no network, no crypto mocks.
 */

import { describe, it, expect } from 'vitest';

import { canonicalize } from '../../../server/services/registry-protocol/canonical-json.js';
import {
  buildEnvelope,
  signEnvelope,
  parseEnvelope,
  signEnvelopeTwoSig,
  parseEnvelopeTwoSig,
  assertReplayWindow,
  EnvelopeError,
  TIMESTAMP_PAST_WINDOW_MS,
  TIMESTAMP_FUTURE_WINDOW_MS,
  type NonceStore,
  type RegistryEnvelope,
} from '../../../server/services/registry-protocol/envelope.js';
import {
  hasRiskyMixedScript,
  computeSkeleton,
} from '../../../server/services/registry-protocol/homoglyph.js';
import { generateAppKeypair } from '../../../server/services/identity.js';

const kp = generateAppKeypair();
const otherKp = generateAppKeypair();

function makeEnvelope(overrides: Partial<Parameters<typeof buildEnvelope>[0]> = {}): RegistryEnvelope {
  return buildEnvelope({
    operation: 'register',
    namespace: 'futurechain',
    actor: { contactHash: kp.contactHash, publicKeyHex: kp.publicKeyHex },
    payload: { name: 'cake-shop', category: 'commerce' },
    priorOperationId: null,
    ...overrides,
  });
}

// ── canonicalize ────────────────────────────────────────────────────────────

describe('canonicalize (RFC 8785)', () => {
  it('sorts keys deterministically regardless of insertion order', () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalize({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it('sorts nested keys and preserves array order', () => {
    expect(canonicalize({ z: { y: 2, x: 1 }, arr: [3, 1, 2] })).toBe(
      '{"arr":[3,1,2],"z":{"x":1,"y":2}}',
    );
  });

  it('emits no insignificant whitespace and stable number forms', () => {
    expect(canonicalize({ n: 1.5, m: 10 })).toBe('{"m":10,"n":1.5}');
  });

  it('throws loudly on non-canonicalisable values (functions)', () => {
    expect(() => canonicalize(() => 'evil')).toThrow(/not JSON-canonicalisable/);
  });
});

// ── Signed operation build / verify ─────────────────────────────────────────

describe('envelope sign / parse round-trip', () => {
  it('builds a schema-valid envelope and round-trips through parseEnvelope', () => {
    const envelope = makeEnvelope();
    const signed = signEnvelope(envelope, kp.privateKeyPem);
    const parsed = parseEnvelope(signed);
    expect(parsed.envelope.operation).toBe('register');
    expect(parsed.envelope.actor.contactHash).toBe(kp.contactHash);
    expect(parsed.signature).toBe(signed.signature);
  });

  it('round-trips after a JSON serialisation cycle (wire realism)', () => {
    const signed = signEnvelope(makeEnvelope(), kp.privateKeyPem);
    const overTheWire = JSON.parse(JSON.stringify(signed)) as unknown;
    expect(() => parseEnvelope(overTheWire)).not.toThrow();
  });

  it('rejects a tampered payload with E_SIGNATURE_INVALID', () => {
    const signed = signEnvelope(makeEnvelope(), kp.privateKeyPem);
    const tampered = JSON.parse(JSON.stringify(signed)) as { envelope: { payload: Record<string, unknown> } };
    tampered.envelope.payload.name = 'cake-shop-evil';
    try {
      parseEnvelope(tampered);
      expect.fail('expected parseEnvelope to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(EnvelopeError);
      expect((e as EnvelopeError).code).toBe('E_SIGNATURE_INVALID');
    }
  });

  it('rejects a signature produced by a different key', () => {
    const envelope = makeEnvelope(); // actor = kp
    const signed = signEnvelope(envelope, otherKp.privateKeyPem);
    expect(() => parseEnvelope(signed)).toThrow(EnvelopeError);
  });

  it('rejects a malformed envelope (missing nonce) with E_ENVELOPE_MALFORMED', () => {
    const signed = signEnvelope(makeEnvelope(), kp.privateKeyPem);
    const broken = JSON.parse(JSON.stringify(signed)) as { envelope: Record<string, unknown> };
    delete broken.envelope.nonce;
    try {
      parseEnvelope(broken);
      expect.fail('expected parseEnvelope to throw');
    } catch (e) {
      expect((e as EnvelopeError).code).toBe('E_ENVELOPE_MALFORMED');
    }
  });

  it('buildEnvelope itself rejects an invalid nonce (defensive zod validation)', () => {
    expect(() => makeEnvelope({ nonce: 'NOT-LOWERCASE-HEX' })).toThrow();
  });

  it('buildEnvelope rejects an invalid namespace', () => {
    expect(() => makeEnvelope({ namespace: 'X' })).toThrow();
  });
});

describe('two-signature envelopes (transfer §4.4)', () => {
  it('round-trips with current_owner + new_owner signatures', () => {
    const envelope = makeEnvelope({ operation: 'transfer' });
    const signed = signEnvelopeTwoSig(envelope, [
      { role: 'current_owner', publicKeyHex: kp.publicKeyHex, privateKeyPem: kp.privateKeyPem },
      { role: 'new_owner', publicKeyHex: otherKp.publicKeyHex, privateKeyPem: otherKp.privateKeyPem },
    ]);
    const parsed = parseEnvelopeTwoSig(signed);
    expect(parsed.signatures).toHaveLength(2);
  });

  it('rejects duplicate roles at signing time', () => {
    const envelope = makeEnvelope({ operation: 'transfer' });
    expect(() =>
      signEnvelopeTwoSig(envelope, [
        { role: 'current_owner', publicKeyHex: kp.publicKeyHex, privateKeyPem: kp.privateKeyPem },
        { role: 'current_owner', publicKeyHex: otherKp.publicKeyHex, privateKeyPem: otherKp.privateKeyPem },
      ]),
    ).toThrow(/distinct roles/);
  });

  it('flags which role failed when the new_owner signature is invalid', () => {
    const envelope = makeEnvelope({ operation: 'transfer' });
    const signed = signEnvelopeTwoSig(envelope, [
      { role: 'current_owner', publicKeyHex: kp.publicKeyHex, privateKeyPem: kp.privateKeyPem },
      { role: 'new_owner', publicKeyHex: otherKp.publicKeyHex, privateKeyPem: otherKp.privateKeyPem },
    ]);
    const tampered = JSON.parse(JSON.stringify(signed)) as {
      envelope: RegistryEnvelope;
      signatures: Array<{ role: string; publicKey: string; signature: string }>;
    };
    // Corrupt the new_owner signature only.
    const newOwner = tampered.signatures.find((s) => s.role === 'new_owner')!;
    newOwner.signature = newOwner.signature.slice(0, -4) + 'AAAA';
    try {
      parseEnvelopeTwoSig(tampered);
      expect.fail('expected parseEnvelopeTwoSig to throw');
    } catch (e) {
      expect((e as EnvelopeError).code).toBe('E_SECOND_SIGNATURE_INVALID');
    }
  });
});

// ── Replay protection ───────────────────────────────────────────────────────

function memoryNonceStore(): NonceStore {
  const seen = new Set<string>();
  return {
    async recordNonce(actor, nonce) {
      const key = `${actor}:${nonce}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  };
}

describe('assertReplayWindow', () => {
  it('accepts a fresh envelope and rejects a nonce replay', async () => {
    const store = memoryNonceStore();
    const envelope = makeEnvelope();
    await expect(assertReplayWindow(envelope, store)).resolves.toBeUndefined();
    await expect(assertReplayWindow(envelope, store)).rejects.toMatchObject({
      code: 'E_NONCE_REPLAY',
    });
  });

  it('rejects a timestamp older than the past window', async () => {
    const stale = new Date(Date.now() - TIMESTAMP_PAST_WINDOW_MS - 60_000).toISOString();
    const envelope = makeEnvelope({ timestamp: stale });
    await expect(assertReplayWindow(envelope, memoryNonceStore())).rejects.toMatchObject({
      code: 'E_TIMESTAMP_OUT_OF_WINDOW',
    });
  });

  it('rejects a timestamp too far in the future', async () => {
    const future = new Date(Date.now() + TIMESTAMP_FUTURE_WINDOW_MS + 60_000).toISOString();
    const envelope = makeEnvelope({ timestamp: future });
    await expect(assertReplayWindow(envelope, memoryNonceStore())).rejects.toMatchObject({
      code: 'E_TIMESTAMP_OUT_OF_WINDOW',
    });
  });
});

// ── Homoglyph defences ──────────────────────────────────────────────────────

describe('hasRiskyMixedScript', () => {
  it('passes clean ASCII names', () => {
    expect(hasRiskyMixedScript('cake-shop').risky).toBe(false);
    expect(hasRiskyMixedScript('daniel.bardun').risky).toBe(false);
  });

  it('flags Latin mixed with Cyrillic lookalikes', () => {
    // 'о' below is U+043E CYRILLIC SMALL LETTER O.
    const r = hasRiskyMixedScript('gооgle');
    expect(r.risky).toBe(true);
    expect(r.reason).toContain('Cyrillic');
  });

  it('flags Latin mixed with Greek lookalikes', () => {
    // 'ο' is U+03BF GREEK SMALL LETTER OMICRON.
    const r = hasRiskyMixedScript('amazοn');
    expect(r.risky).toBe(true);
    expect(r.reason).toContain('Greek');
  });

  it('allows single-script non-Latin names (caught by the skeleton index instead)', () => {
    expect(hasRiskyMixedScript('сайт').risky).toBe(false); // all-Cyrillic 'сайт'
  });

  it('ignores digits and punctuation when checking script mixing', () => {
    expect(hasRiskyMixedScript('shop-24.7').risky).toBe(false);
  });
});

describe('computeSkeleton (UTS #39 confusable reduction)', () => {
  it('collides a Cyrillic-spoofed name with its ASCII target', () => {
    // 'gооgle' with two Cyrillic о (U+043E).
    expect(computeSkeleton('gооgle')).toBe(computeSkeleton('google'));
  });

  it('collides a Greek-spoofed name with its ASCII target', () => {
    // ρ→p, α→a: 'ραypal'
    expect(computeSkeleton('ραypal')).toBe(computeSkeleton('paypal'));
  });

  it('collides fullwidth ASCII with plain ASCII (NFKC fold)', () => {
    expect(computeSkeleton('ｐａｙｐａｌ')).toBe('paypal');
  });

  it('collides uppercase Cyrillic lookalikes after case-folding', () => {
    // 'АNTON' with U+0410 CYRILLIC CAPITAL A.
    expect(computeSkeleton('АNTON')).toBe(computeSkeleton('anton'));
  });

  it('is case-insensitive for plain Latin', () => {
    expect(computeSkeleton('CakeShop')).toBe('cakeshop');
  });

  it('keeps genuinely distinct names distinct', () => {
    expect(computeSkeleton('google')).not.toBe(computeSkeleton('amazon'));
    expect(computeSkeleton('cake-shop')).not.toBe(computeSkeleton('cakeshop'));
  });

  it('is deterministic and pure', () => {
    const name = 'bаnk-of-anton'; // Cyrillic а
    expect(computeSkeleton(name)).toBe(computeSkeleton(name));
    expect(computeSkeleton(name)).toBe('bank-of-anton');
  });
});
