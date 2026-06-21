/**
 * fulfilment-core.ts — the canonical layer for the FULFILMENT leg (P7): the
 * post-settlement ship → deliver lifecycle. After an agreement is agreed/settled,
 * a party signs a shipment notice (carrier + tracking) and the other party signs a
 * delivery confirmation. Both are Ed25519-signed by the SAME identity keys that
 * signed the agreement — non-repudiable trust artifacts. (v1 attests by-a-party;
 * cryptographic seller-ships / buyer-confirms role binding is a P8 prerequisite
 * before any escrow release is wired to these — see fulfilment-engine.ts.)
 *
 * Reuses the agreement's canonicalFlat (the one hashed/signed serialization) and
 * the same domain-separation discipline. A fulfilment is a STANDALONE-only
 * concept keyed by the agreement's id + proposalHash — it never enters the
 * agreement's own signed digest (the agreement core stays byte-identical to the
 * Comm/Pay/Business copies).
 */
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { canonicalFlat } from './agreement-core.js';

export const FULFILMENT_SCHEMA_V = 1;

export type FulfilmentStatus = 'awaiting' | 'shipped' | 'delivered';

const SHIPMENT_DOMAIN = 'anton-fulfilment-ship|v1|';
const DELIVERY_DOMAIN = 'anton-fulfilment-deliver|v1|';

// ── Shipment ─────────────────────────────────────────────────────────────────

export interface ShipmentDigestFields {
  agreementId: string;
  proposalHash: string;
  carrier: string;
  tracking?: string;
  eta?: string;
  shippedAt: number;
}

/** Flat map the shipment signature is computed over. Counter fields always
 *  present as keys for a stable shape (mirrors responseDigestMap). */
export function shipmentDigestMap(f: ShipmentDigestFields): Record<string, string> {
  return {
    agreementId: f.agreementId,
    schemaV: String(FULFILMENT_SCHEMA_V),
    kind: 'shipment',
    proposalHash: f.proposalHash,
    carrier: f.carrier,
    tracking: f.tracking ?? '',
    eta: f.eta ?? '',
    shippedAt: String(f.shippedAt),
  };
}

export function computeShipmentDigest(f: ShipmentDigestFields): string {
  return bytesToHex(sha256(utf8ToBytes(SHIPMENT_DOMAIN + canonicalFlat(shipmentDigestMap(f)))));
}

/** The exact string the shipper's Ed25519 signature is produced over. */
export function shipmentSigningString(digest: string): string {
  return `anton-fulfilment-ship-sig|v1|${digest}`;
}

// ── Delivery ─────────────────────────────────────────────────────────────────

export interface DeliveryDigestFields {
  agreementId: string;
  proposalHash: string;
  confirmedAt: number;
}

export function deliveryDigestMap(f: DeliveryDigestFields): Record<string, string> {
  return {
    agreementId: f.agreementId,
    schemaV: String(FULFILMENT_SCHEMA_V),
    kind: 'delivery',
    proposalHash: f.proposalHash,
    confirmedAt: String(f.confirmedAt),
  };
}

export function computeDeliveryDigest(f: DeliveryDigestFields): string {
  return bytesToHex(sha256(utf8ToBytes(DELIVERY_DOMAIN + canonicalFlat(deliveryDigestMap(f)))));
}

export function deliverySigningString(digest: string): string {
  return `anton-fulfilment-deliver-sig|v1|${digest}`;
}

// ── Wire payloads ────────────────────────────────────────────────────────────

/** fulfilment_shipment — the shipper's signed "I dispatched it". */
export interface ShipmentPayload {
  agreementId: string;
  proposalHash: string;
  carrier: string;
  tracking?: string;
  eta?: string;
  shippedAt: number;
  shipperPubkey: string;
  shipperSig: string;
}

/** fulfilment_delivery — the recipient's signed "I received it". */
export interface DeliveryPayload {
  agreementId: string;
  proposalHash: string;
  confirmedAt: number;
  confirmerPubkey: string;
  confirmerSig: string;
}

// ── Stored record ────────────────────────────────────────────────────────────

export interface FulfilmentRecord {
  agreementId: string;
  proposalHash: string;
  status: FulfilmentStatus;
  // shipment leg
  carrier?: string;
  tracking?: string;
  eta?: string;
  shippedAt?: number;
  shipperPubkey?: string;
  shipperSig?: string;
  // delivery leg
  confirmedAt?: number;
  confirmerPubkey?: string;
  confirmerSig?: string;
}

/** The agreement statuses from which fulfilment may begin. */
export const FULFILLABLE_AGREEMENT_STATUSES = ['agreed', 'settled'] as const;
