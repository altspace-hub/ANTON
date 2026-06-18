/**
 * settlement.ts — the agree↔settle BRIDGE. The critical net-new glue the
 * commerce-loop investigation flagged: today an agreement's contract text rides
 * UNSTAMPED on a one-way Agent Pay payment, so an on-chain settlement can't be
 * reconciled to the specific signed agreement. This stamps the proposalHash +
 * agreementId into the settlement remittance so the payment provably settles a
 * named agreement, and matches an inbound payment back to its agreement.
 *
 * The SPEND itself stays in Agent Pay (its proposePayment opens ITS human modal)
 * — this module only PRODUCES the instruction the agent hands to Agent Pay, and
 * RECORDS the resulting on-chain txHash against the agreement on both sides.
 *
 * Agent Pay's buildAntonRemittance already preserves `meta` + `ref` verbatim, so
 * the stamps flow through to the PACS.008 RmtInf with no Agent Pay change.
 */
import type { pacs008 } from '@futurechain/sdk';
import type { Agreement } from './agreement-core.js';

/** What the agent hands to Agent Pay's proposePayment to settle an agreement. */
export interface SettlementInstruction {
  /** The payee — the agreement counterparty's fc_ address. */
  to: string;
  /** Decimal FTC (display + Agent Pay's amount field). */
  amountFtc: number;
  /** The exact base-unit string the agreement was signed over. */
  amountMicroFtc: string;
  /** The structured remittance — kind:'agreement', stamped with the reconcile
   *  keys in meta so the payee can match the payment to THIS agreement. */
  remittance: pacs008.AntonRemittance;
  /** Echoed for the caller's convenience (also in remittance.meta). */
  proposalHash: string;
  agreementId: string;
}

const SETTLEABLE = new Set(['agreed', 'accepted']);

/** Build the settlement instruction for an agreed agreement. Throws if the
 *  agreement isn't in a state that can be settled (must be agreed/accepted, and
 *  carry a non-zero amount). */
export function buildSettlementInstruction(a: Agreement): SettlementInstruction {
  if (!SETTLEABLE.has(a.status) && a.status !== 'settled') {
    throw new Error(`agreement ${a.id} is ${a.status} — only an agreed agreement can be settled`);
  }
  if (!/^\d+$/.test(a.amountMicroFtc) || a.amountMicroFtc === '0') {
    throw new Error(`agreement ${a.id} has no settlement amount`);
  }
  const remittance: pacs008.AntonRemittance = {
    v: 1, kind: 'agreement',
    ref: a.id,
    decision: a.decision,
    terms: a.terms,
    // The reconcile keys. meta is preserved verbatim by Agent Pay's
    // buildAntonRemittance → rides in the on-chain RmtInf.
    meta: { agreementId: a.id, proposalHash: a.proposalHash },
  };
  return {
    to: a.counterpartyAddress,
    amountFtc: microToFtc(a.amountMicroFtc),
    amountMicroFtc: a.amountMicroFtc,
    remittance,
    proposalHash: a.proposalHash,
    agreementId: a.id,
  };
}

/** Extract the reconcile keys from an inbound payment's remittance (the payee
 *  side reads this off an Agent Pay listTransactions row). Returns null when the
 *  remittance isn't a stamped agreement settlement. */
export function readSettlementRef(
  remittance: Pick<pacs008.AntonRemittance, 'kind' | 'meta'> | null | undefined,
): { proposalHash: string; agreementId?: string } | null {
  const meta = remittance?.meta;
  if (!meta || typeof meta.proposalHash !== 'string' || !meta.proposalHash) return null;
  return {
    proposalHash: meta.proposalHash,
    ...(typeof meta.agreementId === 'string' && meta.agreementId ? { agreementId: meta.agreementId } : {}),
  };
}

function microToFtc(microFtc: string): number {
  return Number(microFtc) / 1_000_000;
}
