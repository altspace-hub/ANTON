/**
 * agreement-core.test.ts — the cross-app canonicalization GOLDEN LOCK + the
 * Ed25519 sign/verify round-trip for the standalone buyer's signed agreement.
 *
 * The two golden hashes are byte-identical constants shared with the Comm, Pay,
 * and Business copies (src/comm/__tests__/agreements.test.ts). If this 4th copy's
 * canonicalFlat / domain string / digest-map order EVER drifts, this test fails
 * against the shared golden — BEFORE the standalone ever signs an agreement the
 * seller's ANTON would reject. That cross-app byte-equality is the whole point
 * of porting the core verbatim.
 */
import { describe, it, expect } from 'vitest';
import {
  canonicalFlat, computeProposalHash, computeResponseDigest, isTerminal, headBeats,
  proposalSigningString, type AgreementProposePayload, type AgreementRespondPayload,
} from '../../src/main/agreement-core.js';
import {
  generateAgreementKeypair, publicKeyOf, signProposal, signResponse,
  verifyProposalPayload, verifyResponseSignature, signMessage, verifyMessage,
} from '../../src/main/agreement-crypto.js';

// ── Cross-app golden vectors (IDENTICAL to the Comm/Pay/Business copies) ─────
const GOLDEN_PROPOSAL_HASH = '7805fcb808ee3b1bbf589ac364c99bf308a9a7ba85f3ffadc59c86b8cbc6c7d8';
const GOLDEN_RESPONSE_DIGEST = '00705a1922f420c3ae0c1f36490f1dc98a29befc43cbd2769e90c60055b10c7f';

describe('canonicalFlat', () => {
  it('sorts keys + is insertion-order independent', () => {
    expect(canonicalFlat({ b: '2', a: '1', c: '3' })).toBe(canonicalFlat({ c: '3', a: '1', b: '2' }));
    expect(canonicalFlat({ b: '2', a: '1' })).toBe('{"a":"1","b":"2"}');
  });
});

describe('golden vectors (cross-app canonicalization lock)', () => {
  it('computeProposalHash matches the shared golden', () => {
    expect(computeProposalHash({
      agreementId: 'agr_golden_0001',
      seq: 0,
      decision: 'Deliver 10 widgets by Friday',
      terms: 'Net 30, no returns on perishables',
      amountMicroFtc: '1500000',
      counterpartyAddress: 'fc_GOLDENtestADDRESS000000',
      createdAt: 1700000000000,
    })).toBe(GOLDEN_PROPOSAL_HASH);
  });

  it('computeResponseDigest matches the shared golden', () => {
    expect(computeResponseDigest({
      agreementId: 'agr_golden_0001',
      proposalHash: 'deadbeefcafef00d',
      verb: 'accept',
      seq: 0,
      responderPubkey: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
      nonce: 'nonce_golden_0001',
    })).toBe(GOLDEN_RESPONSE_DIGEST);
  });

  it('the proposalHash binds every field — any change shifts the hash', () => {
    const base = {
      agreementId: 'a1', seq: 0, decision: 'd', terms: 't',
      amountMicroFtc: '100', counterpartyAddress: 'fc_x', createdAt: 1,
    };
    const h = computeProposalHash(base);
    expect(computeProposalHash({ ...base, amountMicroFtc: '101' })).not.toBe(h);
    expect(computeProposalHash({ ...base, terms: 't2' })).not.toBe(h);
    expect(computeProposalHash({ ...base, seq: 1 })).not.toBe(h);
  });

  it('the response digest binds the proposalHash + verb + nonce', () => {
    const base = {
      agreementId: 'a1', proposalHash: 'p', verb: 'accept' as const, seq: 0,
      responderPubkey: 'pk', nonce: 'n',
    };
    const d = computeResponseDigest(base);
    expect(computeResponseDigest({ ...base, proposalHash: 'p2' })).not.toBe(d);
    expect(computeResponseDigest({ ...base, verb: 'decline' })).not.toBe(d);
    expect(computeResponseDigest({ ...base, nonce: 'n2' })).not.toBe(d);
  });
});

describe('lifecycle helpers', () => {
  it('classifies the terminal set', () => {
    for (const s of ['agreed', 'settled', 'declined', 'withdrawn', 'expired', 'accept_unconfirmed'] as const) {
      expect(isTerminal(s)).toBe(true);
    }
    for (const s of ['draft', 'proposed', 'countered', 'accepted'] as const) {
      expect(isTerminal(s)).toBe(false);
    }
  });

  it('headBeats: higher seq wins, equal seq breaks on lexicographically-larger hash', () => {
    expect(headBeats({ seq: 2, hash: 'a' }, { seq: 1, hash: 'z' })).toBe(true);
    expect(headBeats({ seq: 1, hash: 'a' }, { seq: 2, hash: 'z' })).toBe(false);
    expect(headBeats({ seq: 1, hash: 'b' }, { seq: 1, hash: 'a' })).toBe(true);
    expect(headBeats({ seq: 1, hash: 'a' }, { seq: 1, hash: 'b' })).toBe(false);
  });
});

describe('Ed25519 sign/verify (signed tier)', () => {
  it('generates a keypair whose pub derives from the priv seed', async () => {
    const kp = await generateAgreementKeypair();
    expect(kp.privHex).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.pubHex).toMatch(/^[0-9a-f]{64}$/);
    expect(await publicKeyOf(kp.privHex)).toBe(kp.pubHex);
  });

  it('round-trips a message signature (the cross-app scheme: ed25519 over UTF-8)', async () => {
    const kp = await generateAgreementKeypair();
    const msg = proposalSigningString('deadbeef');
    const sig = await signMessage(msg, kp.privHex);
    expect(await verifyMessage(msg, sig, kp.pubHex)).toBe(true);
    expect(await verifyMessage(msg + 'x', sig, kp.pubHex)).toBe(false);
  });

  it('builds + verifies a signed proposal payload, and rejects tampering', async () => {
    const kp = await generateAgreementKeypair();
    const proposalHash = computeProposalHash({
      agreementId: 'agr_1', seq: 0, decision: 'Air Jordans EU43', terms: 'ship to SE, paid on chain',
      amountMicroFtc: '1800000', counterpartyAddress: 'fc_buyer_addr', createdAt: 1700000000001,
    });
    const payload: AgreementProposePayload = {
      agreementId: 'agr_1', schemaV: 1, seq: 0, decision: 'Air Jordans EU43', terms: 'ship to SE, paid on chain',
      amountMicroFtc: '1800000', counterpartyAddress: 'fc_buyer_addr', createdAt: 1700000000001,
      proposalHash, proposerPubkey: kp.pubHex, proposerSig: await signProposal(proposalHash, kp.privHex),
    };
    expect(await verifyProposalPayload(payload)).toBe(true);
    // Tamper the amount but keep the old hash/sig → hash recompute mismatch.
    expect(await verifyProposalPayload({ ...payload, amountMicroFtc: '999' })).toBe(false);
    // Forge a hash without a matching signature → sig fails.
    expect(await verifyProposalPayload({ ...payload, proposerSig: 'ab'.repeat(64) })).toBe(false);
  });

  it('verifies a signed accept response, and rejects a wrong-key signature', async () => {
    const kp = await generateAgreementKeypair();
    const other = await generateAgreementKeypair();
    const digest = computeResponseDigest({
      agreementId: 'agr_1', proposalHash: 'phash', verb: 'accept', seq: 0,
      responderPubkey: kp.pubHex, nonce: 'nonce-1',
    });
    const respond: AgreementRespondPayload = {
      agreementId: 'agr_1', proposalHash: 'phash', verb: 'accept', seq: 0,
      responderPubkey: kp.pubHex, responderSig: await signResponse(digest, kp.privHex), nonce: 'nonce-1',
    };
    expect(await verifyResponseSignature(respond)).toBe(true);
    expect(await verifyResponseSignature({ ...respond, responderPubkey: other.pubHex })).toBe(false);
    expect(await verifyResponseSignature({ ...respond, nonce: 'nonce-2' })).toBe(false);
  });
});
