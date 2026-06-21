/**
 * fulfilment-engine.ts — the ship → deliver state machine (P7), the
 * post-settlement leg of the commerce loop. Mirrors the agreement engine:
 * build+sign on one side, verify+record on the other.
 *
 * Trust: a shipment/delivery is signed by the instance identity AND, on ingest,
 * the signer's pubkey must equal the COUNTERPARTY's agreement pubkey (the same
 * key that signed the agreement, and not mine) and the message must be relayed by
 * that counterparty (fromHash). So only the two parties to a specific agreed/
 * settled agreement can move its fulfilment forward — a non-repudiable attestation
 * BY A PARTY, bound to the agreement + the proposalHash.
 *
 * v1 SCOPE: this attests "a party signed a shipment/delivery for this agreement".
 * It does NOT cryptographically enforce WHICH party ships vs. confirms (the
 * agreement carries no explicit seller/buyer marker — proposer=buyer holds for the
 * canonical flow but a counter swaps roles). Wiring an ESCROW RELEASE to these
 * artifacts (P8) MUST first add explicit role binding so only the seller can ship
 * and only the buyer can confirm. Until then fulfilment is informational/trust —
 * it moves no FTC, so it is signed but UNGATED (like decline/withdraw).
 */
import {
  computeShipmentDigest, shipmentSigningString, computeDeliveryDigest, deliverySigningString,
  FULFILLABLE_AGREEMENT_STATUSES,
  type FulfilmentRecord, type ShipmentPayload, type DeliveryPayload,
} from './fulfilment-core.js';
import { verifyMessage } from './agreement-crypto.js';
import type { AgreementStore } from './agreement-store.js';
import type { AgreementIdentity } from './agreement-identity.js';
import type { FulfilmentStore } from './fulfilment-store.js';
import type { Agreement } from './agreement-core.js';

export interface ShipInput {
  carrier: string;
  tracking?: string;
  eta?: string;
}

export interface FulfilmentEngineOpts {
  now?: () => number;
}

const FULFILLABLE = new Set<string>(FULFILLABLE_AGREEMENT_STATUSES);

export class FulfilmentEngine {
  private readonly now: () => number;

  constructor(
    private readonly agreements: AgreementStore,
    private readonly identity: AgreementIdentity,
    private readonly store: FulfilmentStore,
    opts: FulfilmentEngineOpts = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
  }

  get(agreementId: string): Promise<FulfilmentRecord | null> { return this.store.get(agreementId); }
  list(): Promise<FulfilmentRecord[]> { return this.store.list(); }

  /** Read the fulfilment status; 'awaiting' when the agreement exists + is
   *  fulfillable but nothing has shipped yet. null when there's no such agreement. */
  async status(agreementId: string): Promise<FulfilmentRecord | null> {
    const existing = await this.store.get(agreementId);
    if (existing) return existing;
    const a = await this.agreements.get(agreementId);
    if (!a) return null;
    return { agreementId, proposalHash: a.proposalHash, status: 'awaiting' };
  }

  // ── SHIP (seller side) ───────────────────────────────────────────────────

  async markShipped(agreementId: string, input: ShipInput): Promise<{ record: FulfilmentRecord; payload: ShipmentPayload }> {
    const a = await this.requireFulfillable(agreementId);
    const shippedAt = this.now();
    const digest = computeShipmentDigest({
      agreementId, proposalHash: a.proposalHash, carrier: input.carrier,
      ...(input.tracking !== undefined ? { tracking: input.tracking } : {}),
      ...(input.eta !== undefined ? { eta: input.eta } : {}),
      shippedAt,
    });
    const shipperPubkey = await this.identity.pubkey();
    const shipperSig = await this.identity.signString(shipmentSigningString(digest));

    const record: FulfilmentRecord = {
      agreementId, proposalHash: a.proposalHash, status: 'shipped',
      carrier: input.carrier,
      ...(input.tracking !== undefined ? { tracking: input.tracking } : {}),
      ...(input.eta !== undefined ? { eta: input.eta } : {}),
      shippedAt, shipperPubkey, shipperSig,
    };
    await this.store.put(record);

    const payload: ShipmentPayload = {
      agreementId, proposalHash: a.proposalHash, carrier: input.carrier,
      ...(input.tracking !== undefined ? { tracking: input.tracking } : {}),
      ...(input.eta !== undefined ? { eta: input.eta } : {}),
      shippedAt, shipperPubkey, shipperSig,
    };
    return { record, payload };
  }

  async applyInboundShipment(p: ShipmentPayload, fromHash: string): Promise<FulfilmentRecord | null> {
    const a = await this.agreements.get(p.agreementId);
    if (!a) return null;
    if (fromHash !== a.counterpartyHash) return null;
    if (!FULFILLABLE.has(a.status)) return null;
    if (p.proposalHash !== a.proposalHash) return null;
    // The shipper must be the COUNTERPARTY (a party to the agreement whose key is
    // NOT mine — the cp===myPubkey guard rejects a degenerate equal-key agreement
    // that would otherwise let me sign+ingest my own shipment as the counterparty).
    const myPubkey = await this.identity.pubkey();
    const cp = this.counterpartyPubkey(a, myPubkey);
    if (!cp || cp === myPubkey || p.shipperPubkey !== cp) return null;

    const digest = computeShipmentDigest({
      agreementId: p.agreementId, proposalHash: p.proposalHash, carrier: p.carrier,
      ...(p.tracking !== undefined ? { tracking: p.tracking } : {}),
      ...(p.eta !== undefined ? { eta: p.eta } : {}),
      shippedAt: p.shippedAt,
    });
    if (!(await verifyMessage(shipmentSigningString(digest), p.shipperSig, p.shipperPubkey))) return null;

    const prev = await this.store.get(p.agreementId);
    // No delivered→shipped downgrade, and no STALE/out-of-order overwrite within
    // the shipment leg (fulfilment is nonce-less; an async relay may re-deliver an
    // older signed shipment after a newer one — keep the newest shippedAt).
    if (prev?.status === 'delivered') return prev;
    if (prev?.shippedAt !== undefined && p.shippedAt <= prev.shippedAt) return prev;
    // Build the record from the payload's EXACT signed fields (don't inherit a
    // prior shipment's tracking/eta — that would persist a field this signature
    // never covered).
    const record: FulfilmentRecord = {
      agreementId: p.agreementId, proposalHash: p.proposalHash, status: 'shipped',
      carrier: p.carrier,
      ...(p.tracking !== undefined ? { tracking: p.tracking } : {}),
      ...(p.eta !== undefined ? { eta: p.eta } : {}),
      shippedAt: p.shippedAt, shipperPubkey: p.shipperPubkey, shipperSig: p.shipperSig,
    };
    await this.store.put(record);
    return record;
  }

  // ── DELIVER (buyer side) ─────────────────────────────────────────────────

  async confirmDelivery(agreementId: string): Promise<{ record: FulfilmentRecord; payload: DeliveryPayload }> {
    const a = await this.requireFulfillable(agreementId);
    const confirmedAt = this.now();
    const digest = computeDeliveryDigest({ agreementId, proposalHash: a.proposalHash, confirmedAt });
    const confirmerPubkey = await this.identity.pubkey();
    const confirmerSig = await this.identity.signString(deliverySigningString(digest));

    const prev = await this.store.get(agreementId);
    const record: FulfilmentRecord = {
      ...(prev ?? { agreementId, proposalHash: a.proposalHash }),
      agreementId, proposalHash: a.proposalHash, status: 'delivered',
      confirmedAt, confirmerPubkey, confirmerSig,
    };
    await this.store.put(record);
    return { record, payload: { agreementId, proposalHash: a.proposalHash, confirmedAt, confirmerPubkey, confirmerSig } };
  }

  async applyInboundDelivery(p: DeliveryPayload, fromHash: string): Promise<FulfilmentRecord | null> {
    const a = await this.agreements.get(p.agreementId);
    if (!a) return null;
    if (fromHash !== a.counterpartyHash) return null;
    if (!FULFILLABLE.has(a.status)) return null;
    if (p.proposalHash !== a.proposalHash) return null;
    const myPubkey = await this.identity.pubkey();
    const cp = this.counterpartyPubkey(a, myPubkey);
    if (!cp || cp === myPubkey || p.confirmerPubkey !== cp) return null;

    const digest = computeDeliveryDigest({ agreementId: p.agreementId, proposalHash: p.proposalHash, confirmedAt: p.confirmedAt });
    if (!(await verifyMessage(deliverySigningString(digest), p.confirmerSig, p.confirmerPubkey))) return null;

    const prev = await this.store.get(p.agreementId);
    // No stale/out-of-order delivery overwrite. Spread prev to RETAIN the
    // shipment-leg fields (carrier/tracking) under the new delivery status.
    if (prev?.confirmedAt !== undefined && p.confirmedAt <= prev.confirmedAt) return prev;
    const record: FulfilmentRecord = {
      ...(prev ?? { agreementId: p.agreementId, proposalHash: p.proposalHash }),
      agreementId: p.agreementId, proposalHash: p.proposalHash, status: 'delivered',
      confirmedAt: p.confirmedAt, confirmerPubkey: p.confirmerPubkey, confirmerSig: p.confirmerSig,
    };
    await this.store.put(record);
    return record;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async requireFulfillable(agreementId: string): Promise<Agreement> {
    const a = await this.agreements.get(agreementId);
    if (!a) throw new Error(`agreement ${agreementId} not found`);
    if (!FULFILLABLE.has(a.status)) {
      throw new Error(`agreement is ${a.status} — fulfilment needs an agreed/settled agreement`);
    }
    return a;
  }

  /** The OTHER party's agreement pubkey (the one that isn't mine). */
  private counterpartyPubkey(a: Agreement, myPubkey: string): string | undefined {
    if (a.proposerPubkey === myPubkey) return a.acceptorPubkey;
    if (a.acceptorPubkey === myPubkey) return a.proposerPubkey;
    return undefined;
  }
}
