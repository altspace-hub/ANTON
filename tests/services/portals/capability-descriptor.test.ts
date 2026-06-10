/**
 * Unit tests for the capability-descriptor trust root (Wave-3 plan 3.7 —
 * portals trust-stack test floor):
 *
 *   - descriptorHash: canonical-JSON determinism (key order, nesting, unicode)
 *   - signDescriptor / verifyDescriptor: Ed25519 round-trip with REAL keys
 *     (node:crypto generateKeyPairSync — the repo's single Ed25519 surface,
 *     per portal-crypto.ts header), tamper detection, wrong-key rejection,
 *     validity-window enforcement, contact-hash cross-check
 *   - buildDescriptor: produces a schema-valid descriptor whose hash binds
 *     to the served envelope; capability summary flattening
 *   - validateDescriptor (ajv): accepts each of the 13 verb baselines,
 *     rejects malformed inputs (missing required, wrong types, unknown verb,
 *     non x- extension keys)
 *   - validateAgainstSchema / validateCapabilityInputAgainstBaseline:
 *     the invoke-time + publish-time input gates
 *
 * Pure crypto + ajv — no DB, no network, no mocks.
 */

import { describe, it, expect } from 'vitest';

import { descriptorHash } from '../../../server/services/capability-descriptor/hash.js';
import {
  signDescriptor,
  verifyDescriptor,
} from '../../../server/services/capability-descriptor/signer.js';
import {
  validateDescriptor,
  validateAgainstSchema,
  validateCapabilityInputAgainstBaseline,
} from '../../../server/services/capability-descriptor/validator.js';
import {
  buildDescriptor,
  type BuilderInput,
} from '../../../server/services/capability-descriptor/builder.js';
import {
  CAPABILITY_VERBS,
  type CapabilityVerb,
} from '../../../server/services/capability-descriptor/schema.js';
import { getVerbBaseline } from '../../../server/services/capability-descriptor/verbs/index.js';
import { generateAppKeypair } from '../../../server/services/identity.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const kp = generateAppKeypair();
const otherKp = generateAppKeypair();

function builderInput(overrides: Partial<BuilderInput> = {}): BuilderInput {
  return {
    portal: {
      name: 'cake-shop',
      namespace: 'futurechain',
      displayTitle: 'The Cake Shop',
      category: 'commerce',
      contactHash: kp.contactHash,
      publicKeyHex: kp.publicKeyHex,
    },
    identity: {
      humanContact: { available: true, displayName: 'Baker', languages: ['en'] },
    },
    capabilities: [
      {
        id: 'say-hello',
        verb: 'contact',
        title: 'Send a message',
        description: 'Free-form message to the baker.',
        aapEndpoint: 'messages',
        tags: ['bakery'],
      },
    ],
    ...overrides,
  };
}

// ── descriptorHash: canonical determinism ───────────────────────────────────

describe('descriptorHash (canonical JSON determinism)', () => {
  it('is invariant under top-level key insertion order', () => {
    const a = { alpha: 1, beta: 'two', gamma: [1, 2, 3] };
    const b = { gamma: [1, 2, 3], beta: 'two', alpha: 1 };
    expect(descriptorHash(a)).toBe(descriptorHash(b));
  });

  it('is invariant under nested key insertion order', () => {
    const a = { outer: { x: 1, y: { p: true, q: null } }, list: [{ m: 1, n: 2 }] };
    const b = { list: [{ n: 2, m: 1 }], outer: { y: { q: null, p: true }, x: 1 } };
    expect(descriptorHash(a)).toBe(descriptorHash(b));
  });

  it('preserves array order (different order = different hash)', () => {
    expect(descriptorHash({ items: [1, 2] })).not.toBe(descriptorHash({ items: [2, 1] }));
  });

  it('changes when any value changes', () => {
    const base = { portal: { name: 'a.b.portal' }, n: 1 };
    expect(descriptorHash(base)).not.toBe(descriptorHash({ portal: { name: 'a.b.portal' }, n: 2 }));
  });

  it('is deterministic for unicode strings (same codepoints → same hash)', () => {
    const v1 = descriptorHash({ title: 'Café Brûlée — 日本語 🎂' });
    const v2 = descriptorHash({ title: 'Café Brûlée — 日本語 🎂' });
    expect(v1).toBe(v2);
    expect(v1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does NOT unicode-normalise: NFC and NFD forms hash differently (byte-exact binding)', () => {
    const composed = 'Café'.normalize('NFC');
    const decomposed = 'Café'.normalize('NFD');
    expect(composed).not.toBe(decomposed); // sanity: distinct byte sequences
    expect(descriptorHash({ t: composed })).not.toBe(descriptorHash({ t: decomposed }));
  });
});

// ── buildDescriptor ─────────────────────────────────────────────────────────

describe('buildDescriptor', () => {
  it('produces a schema-valid descriptor with a hash that binds the body', () => {
    const built = buildDescriptor(builderInput(), kp.privateKeyPem);
    expect(built.validation.valid).toBe(true);
    expect(built.validation.errors).toEqual([]);
    expect(built.hash).toBe(descriptorHash(built.descriptor));
    expect(built.envelope.signatureAlgorithm).toBe('Ed25519');
    const portal = built.descriptor.portal as { name: string };
    expect(portal.name).toBe('cake-shop.futurechain.portal');
  });

  it('flattens the capability summary (verbs, tags, descriptorHash)', () => {
    const input = builderInput({
      capabilities: [
        { id: 'say-hello', verb: 'contact', title: 'Msg', description: 'd', aapEndpoint: 'messages', tags: ['a'] },
        { id: 'order-cake', verb: 'order', title: 'Order', description: 'd', aapEndpoint: 'orders', tags: ['a', 'b'] },
      ],
      discoveryMetadata: { publicIndex: true, tags: ['c'], serviceAreas: ['SE'], languages: ['sv'] },
    });
    const built = buildDescriptor(input, kp.privateKeyPem);
    expect(built.capabilitySummary.capabilityVerbs.sort()).toEqual(['contact', 'order']);
    expect(built.capabilitySummary.tags.sort()).toEqual(['a', 'b', 'c']);
    expect(built.capabilitySummary.serviceAreas).toEqual(['SE']);
    expect(built.capabilitySummary.languages).toEqual(['sv']);
    expect(built.capabilitySummary.descriptorHash).toBe(built.hash);
  });

  it('seeds inputSchema/outputSchema from the verb baseline when omitted', () => {
    const built = buildDescriptor(builderInput(), kp.privateKeyPem);
    const caps = built.descriptor.capabilities as Array<Record<string, unknown>>;
    expect(caps[0].inputSchema).toEqual(getVerbBaseline('contact').inputSchema);
    expect(caps[0].outputSchema).toEqual(getVerbBaseline('contact').outputSchema);
  });
});

// ── Ed25519 sign / verify round-trip ────────────────────────────────────────

describe('signDescriptor / verifyDescriptor (real Ed25519 keys)', () => {
  const built = buildDescriptor(builderInput(), kp.privateKeyPem);

  it('round-trips: a freshly signed descriptor verifies against the signing key', () => {
    const r = verifyDescriptor(built.envelope, { publicKey: kp.publicKeyHex });
    expect(r.reasons).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('verifies with the contactHash cross-check when it matches', () => {
    const r = verifyDescriptor(built.envelope, {
      publicKey: kp.publicKeyHex,
      contactHash: kp.contactHash,
    });
    expect(r.valid).toBe(true);
  });

  it('rejects a tampered descriptor body', () => {
    const tampered = {
      ...built.envelope,
      descriptor: JSON.parse(JSON.stringify(built.envelope.descriptor)) as Record<string, unknown>,
    };
    (tampered.descriptor.portal as { displayTitle: string }).displayTitle = 'Evil Twin Shop';
    const r = verifyDescriptor(tampered, { publicKey: kp.publicKeyHex });
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toContain('signature did not verify');
  });

  it('rejects verification against the wrong public key', () => {
    const r = verifyDescriptor(built.envelope, { publicKey: otherKp.publicKeyHex });
    expect(r.valid).toBe(false);
    // Fingerprint mismatch AND signature failure AND portal.publicKey mismatch.
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
    expect(r.reasons.join(' ')).toContain('signingKeyFingerprint');
  });

  it('rejects a swapped signature (signature from a different key over the same body)', () => {
    const foreign = signDescriptor(
      built.envelope.descriptor,
      otherKp.publicKeyHex,
      otherKp.privateKeyPem,
    );
    const spliced = { ...built.envelope, signature: foreign.signature };
    const r = verifyDescriptor(spliced, { publicKey: kp.publicKeyHex });
    expect(r.valid).toBe(false);
  });

  it('rejects an unsupported signature algorithm', () => {
    const bad = { ...built.envelope, signatureAlgorithm: 'RSA-PSS' as 'Ed25519' };
    const r = verifyDescriptor(bad, { publicKey: kp.publicKeyHex });
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toContain('Unsupported signature algorithm');
  });

  it('rejects an expired descriptor (validUntil in the past relative to now)', () => {
    const future = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000); // beyond 365d validity
    const r = verifyDescriptor(built.envelope, { publicKey: kp.publicKeyHex }, future);
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toContain('expired');
  });

  it('rejects a not-yet-valid descriptor (validFrom in the future)', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const r = verifyDescriptor(built.envelope, { publicKey: kp.publicKeyHex }, past);
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toContain('not yet valid');
  });

  it('flags a contactHash that does not match the registry record', () => {
    const r = verifyDescriptor(built.envelope, {
      publicKey: kp.publicKeyHex,
      contactHash: 'ANTON-XXXX-XXXX-XXXX-XXXX',
    });
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toContain('contactHash');
  });
});

// ── ajv validator: 13 verb baselines ────────────────────────────────────────

describe('validateDescriptor accepts every verb baseline', () => {
  it.each(CAPABILITY_VERBS)('accepts a descriptor with a %s capability', (verb) => {
    const built = buildDescriptor(
      builderInput({
        capabilities: [
          {
            id: `cap-${verb}`,
            verb: verb as CapabilityVerb,
            ...(verb === 'custom' ? { customVerbName: 'bespoke-thing' } : {}),
            title: `${verb} capability`,
            description: `Baseline ${verb} capability for schema validation.`,
            aapEndpoint: `${verb}-endpoint`,
          },
        ],
      }),
      kp.privateKeyPem,
    );
    const r = validateDescriptor(built.descriptor);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    // Baseline-seeded schemas must not trigger baseline warnings either.
    expect(r.warnings).toEqual([]);
  });
});

describe('validateDescriptor rejects malformed descriptors', () => {
  const valid = buildDescriptor(builderInput(), kp.privateKeyPem).descriptor;

  function clone(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
  }

  it('rejects when a required top-level section is missing (identity)', () => {
    const d = clone();
    delete d.identity;
    const r = validateDescriptor(d);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes('identity'))).toBe(true);
  });

  it('rejects wrong types (capabilities as object instead of array)', () => {
    const d = clone();
    d.capabilities = { id: 'oops' };
    const r = validateDescriptor(d);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.startsWith('/capabilities'))).toBe(true);
  });

  it('rejects an unknown verb that is not declared as custom', () => {
    const d = clone();
    (d.capabilities as Array<Record<string, unknown>>)[0].verb = 'teleport';
    const r = validateDescriptor(d);
    expect(r.valid).toBe(false);
  });

  it('rejects a malformed contactHash', () => {
    const d = clone();
    (d.portal as Record<string, unknown>).contactHash = 'ANTON-lowercase-bad';
    const r = validateDescriptor(d);
    expect(r.valid).toBe(false);
  });

  it('rejects unknown fields inside portal (additionalProperties: false)', () => {
    const d = clone();
    (d.portal as Record<string, unknown>).sneakyField = 'injected';
    const r = validateDescriptor(d);
    expect(r.valid).toBe(false);
  });

  it('rejects extension keys that are not x- prefixed', () => {
    const d = clone();
    d.extensions = { 'not-x-prefixed': { a: 1 } };
    const r = validateDescriptor(d);
    expect(r.valid).toBe(false);
  });

  it('rejects a wrong schemaVersion constant', () => {
    const d = clone();
    d.schemaVersion = 'capability-9.9.9';
    const r = validateDescriptor(d);
    expect(r.valid).toBe(false);
  });
});

// ── Invoke-time + publish-time input gates ──────────────────────────────────

describe('validateAgainstSchema (invoke-time ajv gate)', () => {
  const contactInput = getVerbBaseline('contact').inputSchema;

  it('accepts a conforming contact input', () => {
    const r = validateAgainstSchema(contactInput, { message: 'Hello there' });
    expect(r.valid).toBe(true);
  });

  it('rejects input missing the required field', () => {
    const r = validateAgainstSchema(contactInput, { subject: 'no message' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes('message'))).toBe(true);
  });

  it('rejects a wrong-typed field', () => {
    const r = validateAgainstSchema(contactInput, { message: 12345 });
    expect(r.valid).toBe(false);
  });

  it('fails closed on an uncompilable schema', () => {
    const r = validateAgainstSchema({ type: 'not-a-real-type' }, {});
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.keyword).toBe('compile_error');
  });
});

describe('validateCapabilityInputAgainstBaseline (publish-time §4.8 gate)', () => {
  it('flags a declared schema that drops a baseline field', () => {
    const r = validateCapabilityInputAgainstBaseline('contact', {
      type: 'object',
      properties: { subject: { type: 'string' } }, // 'message' dropped
      required: [],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.keyword === 'baseline_missing' && e.path === '/message')).toBe(true);
  });

  it('flags a baseline field redeclared with the wrong type', () => {
    const r = validateCapabilityInputAgainstBaseline('contact', {
      type: 'object',
      properties: {
        message: { type: 'number' }, // baseline says string
        subject: { type: 'string' },
        replyTo: { type: 'string' },
      },
      required: ['message'],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.keyword === 'baseline_type_mismatch')).toBe(true);
  });

  it('passes a schema that extends the baseline without breaking it', () => {
    const baseline = getVerbBaseline('contact').inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    const r = validateCapabilityInputAgainstBaseline('contact', {
      type: 'object',
      properties: { ...baseline.properties, urgency: { type: 'string' } },
      required: baseline.required,
    });
    expect(r.valid).toBe(true);
  });
});
