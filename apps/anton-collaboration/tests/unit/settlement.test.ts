/**
 * settlement.test.ts — the agree↔settle bridge builders: an agreed agreement →
 * a stamped settlement instruction for Agent Pay, and reading the reconcile keys
 * back off an inbound payment's remittance.
 */
import { describe, it, expect } from 'vitest';
import { buildSettlementInstruction, readSettlementRef } from '../../src/main/settlement.js';
import type { Agreement } from '../../src/main/agreement-core.js';

function agreed(over: Partial<Agreement> = {}): Agreement {
  return {
    id: 'agr_1', schemaV: 1, role: 'proposer', trustTier: 'signed',
    counterpartyAddress: 'fc_sellerADDR', decision: 'Air Jordans EU43 ×1', terms: 'ship to SE',
    amountMicroFtc: '1800000', status: 'agreed', seq: 0,
    proposalHash: 'a'.repeat(64), proposerPubkey: 'b'.repeat(64), proposerSig: 'c'.repeat(128),
    createdAt: 1_700_000_000_000, nonce: '', ...over,
  };
}

describe('buildSettlementInstruction', () => {
  it('stamps proposalHash + agreementId into the remittance meta', () => {
    const ins = buildSettlementInstruction(agreed());
    expect(ins.to).toBe('fc_sellerADDR');
    expect(ins.amountFtc).toBe(1.8);
    expect(ins.amountMicroFtc).toBe('1800000');
    expect(ins.remittance.kind).toBe('agreement');
    expect(ins.remittance.ref).toBe('agr_1');
    expect(ins.remittance.decision).toBe('Air Jordans EU43 ×1');
    expect(ins.remittance.meta).toEqual({ agreementId: 'agr_1', proposalHash: 'a'.repeat(64) });
    expect(ins.proposalHash).toBe('a'.repeat(64));
    expect(ins.agreementId).toBe('agr_1');
  });

  it('accepts an accepted agreement (the responder may settle before the ack)', () => {
    expect(() => buildSettlementInstruction(agreed({ status: 'accepted' }))).not.toThrow();
  });

  it('refuses to settle a non-agreed agreement', () => {
    expect(() => buildSettlementInstruction(agreed({ status: 'proposed' }))).toThrow(/only an agreed/);
    expect(() => buildSettlementInstruction(agreed({ status: 'declined' }))).toThrow(/only an agreed/);
  });

  it('refuses a zero / non-numeric amount', () => {
    expect(() => buildSettlementInstruction(agreed({ amountMicroFtc: '0' }))).toThrow(/no settlement amount/);
  });
});

describe('readSettlementRef', () => {
  it('extracts the reconcile keys from a stamped remittance', () => {
    const r = buildSettlementInstruction(agreed()).remittance;
    expect(readSettlementRef(r)).toEqual({ proposalHash: 'a'.repeat(64), agreementId: 'agr_1' });
  });

  it('returns null for a remittance with no proposalHash stamp', () => {
    expect(readSettlementRef({ kind: 'message', meta: { foo: 'bar' } })).toBeNull();
    expect(readSettlementRef({ kind: 'agreement' })).toBeNull();
    expect(readSettlementRef(null)).toBeNull();
  });
});
