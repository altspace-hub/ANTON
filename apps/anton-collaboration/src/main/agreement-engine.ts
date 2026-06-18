/**
 * agreement-engine.ts — the proposer/responder state machine for signed
 * two-party agreements, the Node analogue of the Comm appliers in
 * src/comm/services/agreements.ts. Both the buyer's and the seller's standalone
 * run an engine; the wire payloads cross between them (over the agent boundary /
 * relay). The security ORDER of every applier is preserved byte-for-byte from
 * Comm — only the I/O (IndexedDB → AgreementStore, getIdentity → AgreementIdentity,
 * Date.now → injectable now) is swapped.
 *
 * Happy path (buyer proposes, seller accepts):
 *   buyer.propose()            → AgreementProposePayload  ───────────▶
 *   seller.applyInboundPropose()                          (row 'proposed')
 *   seller.respond('accept')   → AgreementRespondPayload  ◀───────────
 *   buyer.applyInboundRespond()                           (buyer 'agreed')
 *   buyer.buildAck()           → AgreementAckPayload      ───────────▶
 *   seller.applyInboundAck()                              (seller 'agreed')
 */
import { randomBytes } from 'node:crypto';
import {
  computeProposalHash, computeResponseDigest, isTerminal, headBeats, MAX_COUNTERS, AGREEMENT_SCHEMA_V,
  type Agreement, type ResponseVerb,
  type AgreementProposePayload, type AgreementRespondPayload,
  type AgreementWithdrawPayload, type AgreementAckPayload,
} from './agreement-core.js';
import { verifyProposalPayload, verifyMessage } from './agreement-crypto.js';
import { proposalSigningString, withdrawSigningString } from './agreement-core.js';
import type { AgreementStore } from './agreement-store.js';
import type { AgreementIdentity } from './agreement-identity.js';
import { buildSettlementInstruction, type SettlementInstruction } from './settlement.js';
import type { pacs008 } from '@futurechain/sdk';

export interface ProposeInput {
  decision: string;
  terms: string;
  amountMicroFtc: string;
  /** The counterparty's identifier (their fc address / contactHash / portal). */
  counterpartyAddress: string;
  counterpartyHash?: string;
  respondBy?: number;
  structured?: pacs008.AntonRemittance;
}

export interface CounterInput {
  decision: string;
  terms: string;
  amountMicroFtc: string;
}

export interface EngineOpts {
  now?: () => number;
  genId?: () => string;
  genNonce?: () => string;
}

export class AgreementEngine {
  private readonly now: () => number;
  private readonly genId: () => string;
  private readonly genNonce: () => string;

  constructor(
    private readonly store: AgreementStore,
    private readonly identity: AgreementIdentity,
    opts: EngineOpts = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.genId = opts.genId ?? (() => `agr_${randomBytes(12).toString('hex')}`);
    this.genNonce = opts.genNonce ?? (() => `non_${randomBytes(16).toString('hex')}`);
  }

  // ── Reads ───────────────────────────────────────────────────────────────
  get(id: string): Promise<Agreement | null> { return this.store.get(id); }
  list(): Promise<Agreement[]> { return this.store.list(); }
  listActionable(): Promise<Agreement[]> { return this.store.listActionable(); }

  // ── PROPOSE (proposer side) ─────────────────────────────────────────────

  /** Create + sign a new offer, persist it (role 'proposer', status 'proposed'),
   *  and return the wire payload to send to the counterparty. */
  async propose(input: ProposeInput): Promise<{ agreement: Agreement; payload: AgreementProposePayload }> {
    const agreementId = this.genId();
    const createdAt = this.now();
    const proposalHash = computeProposalHash({
      agreementId, seq: 0, decision: input.decision, terms: input.terms,
      amountMicroFtc: input.amountMicroFtc, counterpartyAddress: input.counterpartyAddress, createdAt,
    });
    const proposerPubkey = await this.identity.pubkey();
    const proposerSig = await this.identity.signProposalHash(proposalHash);

    const row: Agreement = {
      id: agreementId, schemaV: AGREEMENT_SCHEMA_V, role: 'proposer', trustTier: 'signed',
      ...(input.counterpartyHash !== undefined ? { counterpartyHash: input.counterpartyHash } : {}),
      counterpartyAddress: input.counterpartyAddress,
      decision: input.decision, terms: input.terms, amountMicroFtc: input.amountMicroFtc,
      status: 'proposed', seq: 0, proposalHash, proposerPubkey, proposerSig,
      ...(input.structured !== undefined ? { structured: input.structured } : {}),
      createdAt, ...(input.respondBy !== undefined ? { respondBy: input.respondBy } : {}), nonce: '',
    };
    await this.store.put(row);

    const payload: AgreementProposePayload = {
      agreementId, schemaV: AGREEMENT_SCHEMA_V, seq: 0,
      decision: input.decision, terms: input.terms, amountMicroFtc: input.amountMicroFtc,
      counterpartyAddress: input.counterpartyAddress, createdAt,
      ...(input.respondBy !== undefined ? { respondBy: input.respondBy } : {}),
      proposalHash, proposerPubkey, proposerSig,
      ...(input.structured !== undefined ? { structured: input.structured } : {}),
    };
    return { agreement: row, payload };
  }

  /** Apply an inbound offer (acceptor side): verify it, then persist the
   *  acceptor-side row (status 'proposed'). `fromHash` is the sender id. Returns
   *  the new/existing row, or null if verification fails. Idempotent. */
  async applyInboundPropose(p: AgreementProposePayload, fromHash: string): Promise<Agreement | null> {
    if (!(await verifyProposalPayload(p))) return null;
    const existing = await this.store.get(p.agreementId);
    if (existing) return existing; // duplicate / replay of the offer — no-op

    const row: Agreement = {
      id: p.agreementId, schemaV: p.schemaV ?? AGREEMENT_SCHEMA_V, role: 'acceptor', trustTier: 'signed',
      counterpartyHash: fromHash, counterpartyAddress: p.counterpartyAddress,
      decision: p.decision, terms: p.terms, amountMicroFtc: p.amountMicroFtc,
      status: 'proposed', seq: p.seq,
      ...(p.parentProposalHash !== undefined ? { parentProposalHash: p.parentProposalHash } : {}),
      proposalHash: p.proposalHash, proposerPubkey: p.proposerPubkey, proposerSig: p.proposerSig,
      ...(p.structured !== undefined ? { structured: p.structured } : {}),
      createdAt: p.createdAt, ...(p.respondBy !== undefined ? { respondBy: p.respondBy } : {}), nonce: '',
    };
    await this.store.put(row);
    return row;
  }

  // ── RESPOND (acceptor side: accept / decline / counter) ──────────────────

  /** Build + sign a response to the current head. accept → local 'accepted'
   *  (awaits the proposer's ack to reach 'agreed'); decline → local 'declined';
   *  counter → adopt a new signed head locally (role flips to 'proposer'). */
  async respond(
    agreementId: string, verb: ResponseVerb, counter?: CounterInput,
  ): Promise<{ agreement: Agreement; payload: AgreementRespondPayload }> {
    const row = await this.store.get(agreementId);
    if (!row) throw new Error(`agreement ${agreementId} not found`);
    if (row.role !== 'acceptor') throw new Error('only the current acceptor can respond');
    if (isTerminal(row.status)) throw new Error(`agreement is ${row.status} (terminal)`);
    if (verb === 'counter' && !counter) throw new Error('counter requires CounterInput');

    const nonce = this.genNonce();
    const responderPubkey = await this.identity.pubkey();

    if (verb === 'accept' || verb === 'decline') {
      const digest = computeResponseDigest({
        agreementId, proposalHash: row.proposalHash, verb, seq: row.seq, responderPubkey, nonce,
      });
      const responderSig = await this.identity.signResponseDigest(digest);
      const updated = await this.store.updateStatus(agreementId, {
        status: verb === 'accept' ? 'accepted' : 'declined',
        acceptorPubkey: responderPubkey, acceptorSig: responderSig, respondedAt: this.now(),
      });
      const payload: AgreementRespondPayload = {
        agreementId, proposalHash: row.proposalHash, verb, seq: row.seq, responderPubkey, responderSig, nonce,
      };
      return { agreement: updated!, payload };
    }

    // ── Counter: mint a brand-new signed head, then adopt it locally. ──
    const c = counter!;
    const counterSeq = row.seq + 1;
    if (counterSeq > MAX_COUNTERS) throw new Error(`counter cap (${MAX_COUNTERS}) reached`);
    const counterCreatedAt = this.now();
    const counterProposalHash = computeProposalHash({
      agreementId, seq: counterSeq, decision: c.decision, terms: c.terms,
      amountMicroFtc: c.amountMicroFtc, counterpartyAddress: '', // fixed '' for counters (see Comm)
      createdAt: counterCreatedAt, parentProposalHash: row.proposalHash,
    });
    // The counter head is signed by the SAME identity (signProposalHash signs the
    // proposal signing-string for counterProposalHash) — no seed ever leaks.
    const counterProposerSig = await this.identity.signProposalHash(counterProposalHash);
    const digest = computeResponseDigest({
      agreementId, proposalHash: row.proposalHash, verb: 'counter', seq: counterSeq,
      counterDecision: c.decision, counterTerms: c.terms, counterAmountMicroFtc: c.amountMicroFtc,
      responderPubkey, nonce,
    });
    const responderSig = await this.identity.signResponseDigest(digest);

    // Roles swap: I am now the proposer of the new head.
    const next: Agreement = {
      ...row, role: 'proposer', decision: c.decision, terms: c.terms, amountMicroFtc: c.amountMicroFtc,
      status: 'proposed', seq: counterSeq, parentProposalHash: row.proposalHash,
      proposalHash: counterProposalHash, proposerPubkey: responderPubkey, proposerSig: counterProposerSig,
      acceptorPubkey: undefined, acceptorSig: undefined, respondedAt: this.now(),
    };
    await this.store.put(next);

    const payload: AgreementRespondPayload = {
      agreementId, proposalHash: row.proposalHash, verb: 'counter', seq: counterSeq,
      responderPubkey, responderSig, nonce,
      counterDecision: c.decision, counterTerms: c.terms, counterAmountMicroFtc: c.amountMicroFtc,
      counterSeq, counterCreatedAt, counterProposalHash, counterProposerSig,
    };
    return { agreement: next, payload };
  }

  /**
   * Apply an inbound respond (proposer side). Security ORDER (each a hard reject
   * → null): (1) the agreement must exist; (2) from the counterparty; (3) target
   * the CURRENT head; (4) not already terminal (verdict-flip / replay defense);
   * (5) responder signature verifies; (6) nonce unused. Then flip: accept →
   * 'agreed', decline → 'declined'; counter → adopt iff it beats our head.
   */
  async applyInboundRespond(p: AgreementRespondPayload, fromHash: string): Promise<Agreement | null> {
    const row = await this.store.get(p.agreementId);
    if (!row) return null;
    if (fromHash !== row.counterpartyHash) return null;
    if (isTerminal(row.status)) return null;
    if (p.verb !== 'accept' && p.verb !== 'decline' && p.verb !== 'counter') return null;

    const digest = computeResponseDigest({
      agreementId: p.agreementId, proposalHash: p.proposalHash, verb: p.verb, seq: p.seq,
      ...(p.counterDecision !== undefined ? { counterDecision: p.counterDecision } : {}),
      ...(p.counterTerms !== undefined ? { counterTerms: p.counterTerms } : {}),
      ...(p.counterAmountMicroFtc !== undefined ? { counterAmountMicroFtc: p.counterAmountMicroFtc } : {}),
      responderPubkey: p.responderPubkey, nonce: p.nonce,
    });
    if (!(await verifyMessage(responseSigStr(digest), p.responderSig, p.responderPubkey))) return null;
    if (!(await this.store.consumeNonce(p.nonce))) return null; // replay — already used

    if (p.verb === 'accept' || p.verb === 'decline') {
      if (p.proposalHash !== row.proposalHash) return null; // verdict must target current head
      return this.store.updateStatus(p.agreementId, {
        status: p.verb === 'accept' ? 'agreed' : 'declined',
        acceptorPubkey: p.responderPubkey, acceptorSig: p.responderSig, respondedAt: this.now(),
      });
    }

    // ── Counter: validate the new signed head, then adopt iff it beats ours. ──
    if (!p.counterProposalHash || !p.counterProposerSig || p.counterSeq == null || p.counterCreatedAt == null) return null;
    if (p.counterSeq < 1 || p.counterSeq > MAX_COUNTERS) return null;
    const recomputed = computeProposalHash({
      agreementId: p.agreementId, seq: p.counterSeq,
      decision: p.counterDecision ?? '', terms: p.counterTerms ?? '',
      amountMicroFtc: p.counterAmountMicroFtc ?? '', counterpartyAddress: '',
      createdAt: p.counterCreatedAt, parentProposalHash: p.proposalHash,
    });
    if (recomputed !== p.counterProposalHash) return null;
    if (!(await verifyMessage(proposalSigningString(p.counterProposalHash), p.counterProposerSig, p.responderPubkey))) return null;
    if (!headBeats({ seq: p.counterSeq, hash: p.counterProposalHash }, { seq: row.seq, hash: row.proposalHash })) {
      return row; // a losing/stale counter — keep our head (nonce already spent)
    }
    // Roles swap: the counter-er is now the proposer; we become the acceptor.
    const next: Agreement = {
      ...row, role: 'acceptor', decision: p.counterDecision ?? '', terms: p.counterTerms ?? '',
      amountMicroFtc: p.counterAmountMicroFtc ?? '', status: 'proposed', seq: p.counterSeq,
      parentProposalHash: p.proposalHash, proposalHash: p.counterProposalHash,
      proposerPubkey: p.responderPubkey, proposerSig: p.counterProposerSig,
      acceptorPubkey: undefined, acceptorSig: undefined, respondedAt: this.now(),
    };
    await this.store.put(next);
    return next;
  }

  // ── WITHDRAW (proposer retracts) + ACK (two-phase accept completion) ─────

  /** Build a signed withdraw of MY outstanding proposal. */
  async withdraw(agreementId: string): Promise<{ agreement: Agreement; payload: AgreementWithdrawPayload }> {
    const row = await this.store.get(agreementId);
    if (!row) throw new Error(`agreement ${agreementId} not found`);
    if (row.role !== 'proposer') throw new Error('only the proposer can withdraw');
    if (isTerminal(row.status)) throw new Error(`agreement is ${row.status} (terminal)`);
    const withdrawerPubkey = await this.identity.pubkey();
    const withdrawSig = await this.identity.signWithdraw(row.proposalHash);
    const updated = await this.store.updateStatus(agreementId, { status: 'withdrawn', respondedAt: this.now() });
    return {
      agreement: updated!,
      payload: { agreementId, proposalHash: row.proposalHash, withdrawerPubkey, withdrawSig },
    };
  }

  /** Apply an inbound withdraw (acceptor side). */
  async applyInboundWithdraw(p: AgreementWithdrawPayload, fromHash: string): Promise<Agreement | null> {
    const row = await this.store.get(p.agreementId);
    if (!row) return null;
    if (fromHash !== row.counterpartyHash) return null;
    if (p.proposalHash !== row.proposalHash) return null;
    if (isTerminal(row.status)) return null;
    if (p.withdrawerPubkey !== row.proposerPubkey) return null;
    if (!(await verifyMessage(withdrawSigningString(p.proposalHash), p.withdrawSig, p.withdrawerPubkey))) return null;
    return this.store.updateStatus(p.agreementId, { status: 'withdrawn', respondedAt: this.now() });
  }

  /** Build the ack the proposer sends after recording an accept (two-phase echo). */
  async buildAck(agreementId: string): Promise<AgreementAckPayload> {
    const row = await this.store.get(agreementId);
    if (!row) throw new Error(`agreement ${agreementId} not found`);
    return { agreementId, proposalHash: row.proposalHash };
  }

  /** Apply an inbound ack (responder side): advance a local 'accepted' → 'agreed'. */
  async applyInboundAck(p: AgreementAckPayload, fromHash: string): Promise<Agreement | null> {
    const row = await this.store.get(p.agreementId);
    if (!row) return null;
    if (fromHash !== row.counterpartyHash) return null;
    if (p.proposalHash !== row.proposalHash) return null;
    if (row.status !== 'accepted') return null;
    return this.store.updateStatus(p.agreementId, { status: 'agreed' });
  }

  // ── SETTLE bridge (to/from Agent Pay) ────────────────────────────────────

  /** Build the settlement instruction for an agreed agreement (READ-ONLY — the
   *  SPEND happens in Agent Pay, which opens ITS human gate). The instruction's
   *  remittance is stamped with proposalHash + agreementId so the payee can
   *  reconcile the on-chain payment back to THIS agreement. */
  async getSettlementInstruction(agreementId: string): Promise<SettlementInstruction> {
    const a = await this.store.get(agreementId);
    if (!a) throw new Error(`agreement ${agreementId} not found`);
    return buildSettlementInstruction(a);
  }

  /** Payer side: record the on-chain txHash that settled THIS agreement, after
   *  Agent Pay broadcast it. agreed/accepted → 'settled' + linkedTxHash.
   *  Idempotent: a re-mark of an already-settled agreement keeps the first link. */
  async markSettled(agreementId: string, txHash: string): Promise<Agreement | null> {
    const a = await this.store.get(agreementId);
    if (!a) return null;
    if (a.status === 'settled') return a;
    if (a.status !== 'agreed' && a.status !== 'accepted') return null;
    return this.store.updateStatus(agreementId, { status: 'settled', linkedTxHash: txHash, respondedAt: this.now() });
  }

  /** Payee side: match an inbound on-chain payment (by the proposalHash carried
   *  in the remittance meta) to an agreement, and link the txHash. agreed/
   *  accepted → 'settled'. Returns null when no agreement matches the
   *  proposalHash or it isn't settle-able. First link wins (double-settle safe). */
  async reconcileInboundSettlement(input: { proposalHash: string; txHash: string }): Promise<Agreement | null> {
    const a = await this.store.getByProposalHash(input.proposalHash);
    if (!a) return null;
    if (a.status === 'settled') return a;
    if (a.status !== 'agreed' && a.status !== 'accepted') return null;
    return this.store.updateStatus(a.id, { status: 'settled', linkedTxHash: input.txHash, respondedAt: this.now() });
  }
}

/** The response signing-string wrapper (kept local to avoid a duplicate import
 *  name clash with the proposal one). */
function responseSigStr(responseDigest: string): string {
  return `anton-agreement-resp-sig|v1|${responseDigest}`;
}
