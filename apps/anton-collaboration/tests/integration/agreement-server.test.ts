/**
 * agreement-server.test.ts — the agent-callable AGREE verbs over JSON-RPC:
 * the human-gated propose/accept (StubModalDriver), the fail-closed posture
 * when no driver is wired, the ungated reads/inbound, and a FULL agent-callable
 * signed round-trip between two standalones (buyer + seller).
 */
import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildServer, ERR_NO_APPROVAL, ERR_NO_ENGINE, ERR_VALIDATION, ERR_NOT_FOUND, type ServerDeps,
} from '../../src/main/server.js';
import { PairingStore } from '../../src/main/pairing.js';
import { AgreementEngine } from '../../src/main/agreement-engine.js';
import { AgreementStore } from '../../src/main/agreement-store.js';
import { AgreementIdentity } from '../../src/main/agreement-identity.js';
import { AgreementProposalStore } from '../../src/main/agreement-proposals.js';
import { InMemoryStorageBackend } from '../../src/main/storage.js';
import { StubModalDriver } from '../../src/main/modal.js';
import { StubAgreementReviewer, type AgreementReviewer } from '../../src/main/agreement-reviewer.js';

interface Harness {
  app: FastifyInstance;
  modal: StubModalDriver;
  token: string;
  call: (method: string, params?: unknown) => Promise<{ status: number; body: any }>;
}

function buildHarness(opts: { withEngine?: boolean; withModal?: boolean; buyerContactHash?: string; reviewer?: AgreementReviewer; reviewStrict?: boolean } = {}): Harness {
  const { withEngine = true, withModal = true, buyerContactHash, reviewer, reviewStrict } = opts;
  const pairings = new PairingStore();
  const modal = new StubModalDriver();
  const deps: ServerDeps = {
    pairings,
    ...(withEngine
      ? {
        engine: new AgreementEngine(new AgreementStore(new InMemoryStorageBackend()), new AgreementIdentity(new InMemoryStorageBackend())),
        approvals: new AgreementProposalStore(),
      }
      : {}),
    ...(withModal ? { modal } : {}),
    ...(buyerContactHash ? { buyerContactHash } : {}),
    ...(reviewer ? { reviewer } : {}),
    ...(reviewStrict ? { reviewStrict } : {}),
  };
  const app = buildServer(deps, { bypassOriginCheck: true });
  const code = pairings.newCode();
  const { sessionToken } = pairings.redeemCode({ name: 'agent', code });
  return {
    app, modal, token: sessionToken,
    call: async (method, params) => {
      const res = await app.inject({
        method: 'POST', url: '/rpc',
        headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
        payload: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      });
      return { status: res.statusCode, body: res.json() };
    },
  };
}

const TERMINAL = new Set(['done', 'rejected', 'expired', 'cancelled']);

/** Poll a proposal until it reaches a TERMINAL state. The flow is fire-and-forget
 *  (pending → approved → done), and engine keygen is real async crypto, so
 *  'approved' is intermediate — keep polling past it. */
async function settle(h: Harness, proposalId: string): Promise<any> {
  for (let i = 0; i < 100; i++) {
    const r = await h.call('getAgreementProposal', { proposalId });
    if (r.body.result && TERMINAL.has(r.body.result.state)) return r.body.result;
    await new Promise((res) => setTimeout(res, 5));
  }
  throw new Error('proposal never settled');
}

describe('AGREE verbs — human gate', () => {
  it('proposeAgreement: approve → signed offer is created + persisted', async () => {
    const h = buildHarness();
    h.modal.queueApprove();
    const r = await h.call('proposeAgreement', {
      decision: 'Air Jordans EU43 ×1', terms: 'ship to SE, paid on chain',
      amountMicroFtc: '1800000', counterpartyAddress: 'fc_sellerADDR', counterpartyHash: 'seller-hash',
    });
    expect(r.body.result.proposalId).toMatch(/^apr_/);

    const done = await settle(h, r.body.result.proposalId);
    expect(done.state).toBe('done');
    expect(done.agreementId).toMatch(/^agr_/);
    expect(done.payload.proposalHash).toMatch(/^[0-9a-f]{64}$/);
    expect(done.payload.proposerSig).toMatch(/^[0-9a-f]{128}$/);

    const got = await h.call('getAgreement', { agreementId: done.agreementId });
    expect(got.body.result.found).toBe(true);
    expect(got.body.result.agreement.status).toBe('proposed');
    expect(got.body.result.agreement.role).toBe('proposer');

    expect(h.modal.invocations()[0]!.kind).toBe('agreement_propose');
    expect(h.modal.invocations()[0]!.amountFtc).toBe(1.8);
  });

  it('proposeAgreement: reject → no agreement, rejectReason surfaced', async () => {
    const h = buildHarness();
    h.modal.queueReject('not today');
    const r = await h.call('proposeAgreement', {
      decision: 'd', terms: 't', amountMicroFtc: '100', counterpartyAddress: 'fc_x',
    });
    const done = await settle(h, r.body.result.proposalId);
    expect(done.state).toBe('rejected');
    expect(done.rejectReason).toBe('not today');
    expect((await h.call('listAgreements')).body.result.agreements).toHaveLength(0);
  });

  it('FAIL CLOSED: committing verb without a modal driver → ERR_NO_APPROVAL', async () => {
    const h = buildHarness({ withModal: false });
    const r = await h.call('proposeAgreement', { decision: 'd', terms: 't', amountMicroFtc: '1', counterpartyAddress: 'fc_x' });
    expect(r.body.error.code).toBe(ERR_NO_APPROVAL);
  });

  it('ERR_NO_ENGINE when the engine is not configured', async () => {
    const h = buildHarness({ withEngine: false });
    const r = await h.call('listAgreements');
    expect(r.body.error.code).toBe(ERR_NO_ENGINE);
  });

  it('validates amountMicroFtc (must be a base-10 µFTC integer)', async () => {
    const h = buildHarness();
    const r = await h.call('proposeAgreement', { decision: 'd', terms: 't', amountMicroFtc: '1.5', counterpartyAddress: 'fc_x' });
    expect(r.body.error.code).toBe(ERR_VALIDATION);
  });

  it('cancelAgreementProposal aborts a pending approval before the human decides', async () => {
    const h = buildHarness();
    h.modal.queueHang(); // the modal never resolves
    const r = await h.call('proposeAgreement', { decision: 'd', terms: 't', amountMicroFtc: '1', counterpartyAddress: 'fc_x' });
    const cancel = await h.call('cancelAgreementProposal', { proposalId: r.body.result.proposalId });
    expect(cancel.body.result.state).toBe('cancelled');
    const poll = await h.call('getAgreementProposal', { proposalId: r.body.result.proposalId });
    expect(poll.body.result.state).toBe('cancelled');
  });

  it('acceptAgreement on an unknown agreement → ERR_NOT_FOUND (before opening the modal)', async () => {
    const h = buildHarness();
    const r = await h.call('acceptAgreement', { agreementId: 'agr_nope' });
    expect(r.body.error.code).toBe(ERR_NOT_FOUND);
  });
});

describe('AGREE — four-eyes independent review (optional second model)', () => {
  const PROP = { decision: 'd', terms: 't', amountMicroFtc: '100', counterpartyAddress: 'fc_x', counterpartyHash: 'seller-hash' };

  it('advisory (default): a RAISED verdict is surfaced in the modal; the human still decides', async () => {
    const reviewer = new StubAgreementReviewer().queue1({ raise: true, severity: 'high', concerns: ['disallowed item'], reviewModel: 'mistral' });
    const h = buildHarness({ reviewer });
    h.modal.queueApprove(); // the human approves DESPITE the warning (advisory mode)
    const r = await h.call('proposeAgreement', PROP);
    const done = await settle(h, r.body.result.proposalId);
    expect(done.state).toBe('done'); // human had the final say → agreement created
    const inv = h.modal.invocations()[0]!;
    expect(inv.review?.raise).toBe(true);
    expect(inv.review?.concerns).toContain('disallowed item');
  });

  it('strict: a RAISED verdict AUTO-REJECTS before the human is even asked', async () => {
    const reviewer = new StubAgreementReviewer().queue1({ raise: true, severity: 'high', concerns: ['no-go zone'], reviewModel: 'mistral' });
    const h = buildHarness({ reviewer, reviewStrict: true });
    const r = await h.call('proposeAgreement', PROP); // no modal queued — never reached
    const done = await settle(h, r.body.result.proposalId);
    expect(done.state).toBe('rejected');
    expect(done.rejectReason).toMatch(/independent review/);
    expect(h.modal.invocations()).toHaveLength(0); // the human gate is never opened
  });

  it('advisory ok: a passing verdict is surfaced and the flow proceeds', async () => {
    const reviewer = new StubAgreementReviewer().queue1({ raise: false, severity: 'low', concerns: [], reviewModel: 'mistral' });
    const h = buildHarness({ reviewer });
    h.modal.queueApprove();
    const r = await h.call('proposeAgreement', PROP);
    const done = await settle(h, r.body.result.proposalId);
    expect(done.state).toBe('done');
    expect(h.modal.invocations()[0]!.review?.raise).toBe(false);
  });

  it('FAIL-CLOSED (strict): a reviewer that throws auto-rejects — never a silent pass', async () => {
    const reviewer: AgreementReviewer = { review: async () => { throw new Error('reviewer down'); } };
    const h = buildHarness({ reviewer, reviewStrict: true });
    const r = await h.call('proposeAgreement', PROP);
    const done = await settle(h, r.body.result.proposalId);
    expect(done.state).toBe('rejected');
    expect(done.rejectReason).toMatch(/independent review/);
  });
});

describe('AGREE — full agent-callable round-trip (buyer ⇄ seller standalones)', () => {
  it('buyer proposes (approved) → seller ingests + accepts (approved) → buyer ingests → agreed', async () => {
    const buyer = buildHarness({ buyerContactHash: 'buyer-hash' });
    const seller = buildHarness({ buyerContactHash: 'seller-hash' });

    // 1. Buyer proposes (human approves).
    buyer.modal.queueApprove();
    const proposeRes = await buyer.call('proposeAgreement', {
      decision: 'Air Jordans EU43 ×1', terms: 'ship to SE', amountMicroFtc: '1800000',
      counterpartyAddress: 'fc_sellerADDR', counterpartyHash: 'seller-hash',
    });
    const proposeDone = await settle(buyer, proposeRes.body.result.proposalId);
    const proposePayload = proposeDone.payload;

    // 2. Seller ingests the signed offer (verifies the proposer signature).
    const ingest1 = await seller.call('ingestAgreement', { type: 'propose', fromHash: 'buyer-hash', payload: proposePayload });
    expect(ingest1.body.result.applied).toBe(true);
    expect(ingest1.body.result.agreement.status).toBe('proposed');
    const agreementId = ingest1.body.result.agreement.id;

    // 3. Seller accepts (human approves).
    seller.modal.queueApprove();
    const acceptRes = await seller.call('acceptAgreement', { agreementId });
    const acceptDone = await settle(seller, acceptRes.body.result.proposalId);
    expect(acceptDone.state).toBe('done');
    const acceptPayload = acceptDone.payload;

    // 4. Buyer ingests the signed accept → reaches 'agreed'.
    const ingest2 = await buyer.call('ingestAgreement', { type: 'respond', fromHash: 'seller-hash', payload: acceptPayload });
    expect(ingest2.body.result.applied).toBe(true);
    expect(ingest2.body.result.agreement.status).toBe('agreed');
    expect(ingest2.body.result.agreement.acceptorPubkey).toBe(acceptPayload.responderPubkey);

    // Both sides bound to the SAME proposalHash.
    expect(ingest2.body.result.agreement.proposalHash).toBe(proposePayload.proposalHash);
  });

  it('settle bridge: agreed → buyer settles + seller reconciles, both linked to one txHash', async () => {
    const buyer = buildHarness({ buyerContactHash: 'buyer-hash' });
    const seller = buildHarness({ buyerContactHash: 'seller-hash' });

    // Drive to 'agreed' on both sides.
    buyer.modal.queueApprove();
    const proposeRes = await buyer.call('proposeAgreement', {
      decision: 'Air Jordans EU43 ×1', terms: 'ship to SE', amountMicroFtc: '1800000',
      counterpartyAddress: 'fc_sellerADDR', counterpartyHash: 'seller-hash',
    });
    const proposePayload = (await settle(buyer, proposeRes.body.result.proposalId)).payload;
    const ing1 = await seller.call('ingestAgreement', { type: 'propose', fromHash: 'buyer-hash', payload: proposePayload });
    const agreementId = ing1.body.result.agreement.id;
    seller.modal.queueApprove();
    const acceptRes = await seller.call('acceptAgreement', { agreementId });
    const acceptPayload = (await settle(seller, acceptRes.body.result.proposalId)).payload;
    await buyer.call('ingestAgreement', { type: 'respond', fromHash: 'seller-hash', payload: acceptPayload });

    // Buyer is the proposer — its local id differs from the seller's. Get the
    // buyer-side agreement to drive settlement (the proposalHash is shared).
    const buyerAgreementId = (await buyer.call('listAgreements')).body.result.agreements[0].id;
    const proposalHash = proposePayload.proposalHash;

    // Buyer builds the settlement instruction (the stamped remittance for Agent Pay).
    const instrRes = await buyer.call('getSettlementInstruction', { agreementId: buyerAgreementId });
    const instr = instrRes.body.result.instruction;
    expect(instr.to).toBe('fc_sellerADDR');
    expect(instr.amountFtc).toBe(1.8);
    expect(instr.remittance.meta).toEqual({ agreementId: buyerAgreementId, proposalHash });

    // ...the agent hands `instr` to Agent Pay → gets a txHash. Record it both sides.
    const TX = 'fc_tx_deadbeef0001';
    const buyerSettled = await buyer.call('markAgreementSettled', { agreementId: buyerAgreementId, txHash: TX });
    expect(buyerSettled.body.result.agreement.status).toBe('settled');
    expect(buyerSettled.body.result.agreement.linkedTxHash).toBe(TX);

    // Seller observes the inbound payment + reconciles by proposalHash.
    const sellerReco = await seller.call('reconcileSettlement', { proposalHash, txHash: TX });
    expect(sellerReco.body.result.matched).toBe(true);
    expect(sellerReco.body.result.agreement.status).toBe('settled');
    expect(sellerReco.body.result.agreement.linkedTxHash).toBe(TX);

    // A reconcile for an unknown proposalHash matches nothing.
    const miss = await seller.call('reconcileSettlement', { proposalHash: 'f'.repeat(64), txHash: TX });
    expect(miss.body.result.matched).toBe(false);
  });

  it('declineAgreement produces a signed decline the proposer can ingest', async () => {
    const buyer = buildHarness({ buyerContactHash: 'buyer-hash' });
    const seller = buildHarness({ buyerContactHash: 'seller-hash' });
    buyer.modal.queueApprove();
    const proposeRes = await buyer.call('proposeAgreement', {
      decision: 'd', terms: 't', amountMicroFtc: '100', counterpartyAddress: 'fc_s', counterpartyHash: 'seller-hash',
    });
    const proposePayload = (await settle(buyer, proposeRes.body.result.proposalId)).payload;
    const ing = await seller.call('ingestAgreement', { type: 'propose', fromHash: 'buyer-hash', payload: proposePayload });
    const agreementId = ing.body.result.agreement.id;

    const decline = await seller.call('declineAgreement', { agreementId });
    expect(decline.body.result.agreement.status).toBe('declined');

    const buyerSide = await buyer.call('ingestAgreement', { type: 'respond', fromHash: 'seller-hash', payload: decline.body.result.payload });
    expect(buyerSide.body.result.agreement.status).toBe('declined');
  });
});
