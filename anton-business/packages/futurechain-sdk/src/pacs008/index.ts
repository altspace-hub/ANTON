/**
 * pacs008/ — PACS.008.001.13 builder + canonical JSON serialisation.
 *
 * Status: STUB. Real implementation lands in sprint 1 task 2.
 * Must match iso20022_pacs008.rs byte-for-byte. Vendor that file
 * into docs/futurechain/ before unstubbing.
 *
 * The Pacs008Builder pattern in spec §8.3 is the target API.
 */
import { NotImplementedError } from '../index.js';

export interface PartyIdentification {
  address: string;
  name: string;
  country: string;
  city?: string;
  street?: string;
  postcode?: string;
  orgNr?: string;
}

/** Standard ISO 20022 purpose codes used by ANTON Business. The full
 *  list is much longer; these are the ones we expect to emit in v1.0. */
export type Purpose = 'GDDS' | 'SCVE' | 'OTHR' | 'CASH' | 'INTC' | 'REFUND';

export interface Pacs008Draft {
  debtor: PartyIdentification;
  creditor: PartyIdentification;
  amountMicroFtc: bigint;
  currency: 'FTC';
  purpose: Purpose;
  reference: string;
  uetr?: string;
}

export class Pacs008Builder {
  private draft: Partial<Pacs008Draft> = { currency: 'FTC' };

  debtor(p: PartyIdentification): this { this.draft.debtor = p; return this; }
  creditor(p: PartyIdentification): this { this.draft.creditor = p; return this; }
  amount(microFtc: bigint, currency: 'FTC' = 'FTC'): this {
    this.draft.amountMicroFtc = microFtc;
    this.draft.currency = currency;
    return this;
  }
  purpose(p: Purpose): this { this.draft.purpose = p; return this; }
  reference(r: string): this { this.draft.reference = r; return this; }
  uetr(u: string): this { this.draft.uetr = u; return this; }

  build(): Pacs008Draft {
    throw new NotImplementedError('Pacs008Builder.build()', 'parent-repo: iso20022_pacs008.rs not yet vendored');
  }
}

/** Canonical JSON of a PACS.008 for hashing/signing. Key order, BigInt
 *  encoding, and whitespace rules must match the Rust serializer. */
export function canonicalize(_draft: Pacs008Draft): Uint8Array {
  throw new NotImplementedError('pacs008.canonicalize()', 'parent-repo: iso20022_pacs008.rs not yet vendored');
}

/** Keccak-256 of the canonical JSON. This is the message hash that
 *  wallet.sign() consumes. */
export function hash(_draft: Pacs008Draft): Uint8Array {
  throw new NotImplementedError('pacs008.hash()');
}
