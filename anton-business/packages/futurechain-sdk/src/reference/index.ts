/**
 * reference/ — PACS.008 remittance field encoder/decoder.
 *
 * Implements ADR-004. See docs/adr/ADR-004-reference-encoding.md for the
 * full grammar. Pure functions, no I/O, no crypto.
 */

// ── v1 — Merchant-bearing schema (ANTON Business) ────────────────────

export type V1Purpose = 'RETAIL' | 'RESTAURANT' | 'EVENT' | 'SERVICE' | 'REFUND';
const V1_PURPOSES: ReadonlyArray<V1Purpose> = ['RETAIL', 'RESTAURANT', 'EVENT', 'SERVICE', 'REFUND'];

export interface V1Fields {
  merchantId: string;
  orderId: string;
  purpose: V1Purpose;
  itemCount?: number;
  vatMicroUnits?: bigint;
  discountMicroUnits?: bigint;
  refundOf?: string;
}

// ── v2 — Operational schema (existing ANTON gateway) ────────────────

export interface V2Fields {
  purpose: string;
  nature: string;
  goal: string;
  taskRef?: string;
}

// ── Decoder result envelope ──────────────────────────────────────────

export type DecodeResult =
  | { kind: 'v1'; fields: V1Fields }
  | { kind: 'v2'; fields: V2Fields }
  | { kind: 'unversioned-v2'; fields: V2Fields }
  | { kind: 'unknown'; raw: string }
  | { kind: 'invalid'; reason: string };

// ── Constants ─────────────────────────────────────────────────────────

export const REMITTANCE_MAX_LEN = 140;

export class ReferenceTooLongError extends Error {
  constructor(public readonly attempted: number) {
    super(`Reference exceeds ${REMITTANCE_MAX_LEN} chars (got ${attempted})`);
    this.name = 'ReferenceTooLongError';
  }
}

export class ReferenceValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`Reference validation failed on ${field}: ${message}`);
    this.name = 'ReferenceValidationError';
  }
}

// ── Validation regexes (from ADR-004 ABNF) ────────────────────────────

const MERCHANT_ID_RE = /^[A-Z0-9]{8}$/;
const ORDER_ID_RE = /^[A-Z0-9]{12}$/;
const ITEM_COUNT_RE = /^(0|[1-9][0-9]{0,2})$/;
const BIGINT_18_RE = /^(0|[1-9][0-9]{0,17})$/;
const UETR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_PURPOSE_RE = /^[A-Z]{4}$/;
const V2_TAG_VALUE_RE = /^[A-Za-z0-9_-]{1,32}$/;
const UNVERSIONED_V2_HINT_RE = /^P:[A-Z]{4}( |$)/;

// ── v1 encoder ────────────────────────────────────────────────────────

/** Encode v1 fields into a `v1:`-prefixed remittance string ≤140 chars.
 *  Throws ReferenceValidationError on any constraint violation and
 *  ReferenceTooLongError if the result would exceed 140 chars. */
export function encodeV1(input: V1Fields): string {
  if (!MERCHANT_ID_RE.test(input.merchantId)) {
    throw new ReferenceValidationError('merchantId', 'must match /^[A-Z0-9]{8}$/');
  }
  if (!ORDER_ID_RE.test(input.orderId)) {
    throw new ReferenceValidationError('orderId', 'must match /^[A-Z0-9]{12}$/');
  }
  if (!V1_PURPOSES.includes(input.purpose)) {
    throw new ReferenceValidationError('purpose', `unknown purpose "${input.purpose}"`);
  }
  if (input.purpose === 'REFUND' && !input.refundOf) {
    throw new ReferenceValidationError('refundOf', 'required when purpose === REFUND');
  }
  if (input.purpose !== 'REFUND' && input.refundOf !== undefined) {
    throw new ReferenceValidationError('refundOf', 'prohibited unless purpose === REFUND');
  }
  if (input.itemCount !== undefined) {
    if (!Number.isInteger(input.itemCount) || input.itemCount < 0 || input.itemCount > 999) {
      throw new ReferenceValidationError('itemCount', 'must be an integer in [0, 999]');
    }
  }
  if (input.vatMicroUnits !== undefined) {
    if (input.vatMicroUnits < 0n || input.vatMicroUnits >= 10n ** 18n) {
      throw new ReferenceValidationError('vatMicroUnits', 'must be in [0, 10^18)');
    }
  }
  if (input.discountMicroUnits !== undefined) {
    if (input.discountMicroUnits < 0n || input.discountMicroUnits >= 10n ** 18n) {
      throw new ReferenceValidationError('discountMicroUnits', 'must be in [0, 10^18)');
    }
  }
  if (input.refundOf !== undefined && !UETR_RE.test(input.refundOf)) {
    throw new ReferenceValidationError('refundOf', 'must be a lowercase UUIDv4');
  }

  const tokens = [
    `M:${input.merchantId}`,
    `O:${input.orderId}`,
    `P:${input.purpose}`,
  ];
  // ADR-004: canonical optional order is I V D R for byte-stability.
  if (input.itemCount !== undefined) tokens.push(`I:${input.itemCount}`);
  if (input.vatMicroUnits !== undefined) tokens.push(`V:${input.vatMicroUnits.toString()}`);
  if (input.discountMicroUnits !== undefined) tokens.push(`D:${input.discountMicroUnits.toString()}`);
  if (input.refundOf !== undefined) tokens.push(`R:${input.refundOf}`);

  const result = 'v1: ' + tokens.join(' ');
  if (result.length > REMITTANCE_MAX_LEN) {
    throw new ReferenceTooLongError(result.length);
  }
  return result;
}

// ── Decoder ───────────────────────────────────────────────────────────

/** Decode any remittance string. Never throws — bad input becomes
 *  `{ kind: 'invalid', reason }`. Free-text becomes `{ kind: 'unknown' }`. */
export function decode(remittance: string): DecodeResult {
  if (typeof remittance !== 'string') {
    return { kind: 'invalid', reason: 'input is not a string' };
  }
  if (remittance.length > REMITTANCE_MAX_LEN) {
    return { kind: 'invalid', reason: `exceeds ${REMITTANCE_MAX_LEN} chars` };
  }
  if (remittance.startsWith('v1: ')) {
    return decodeV1Body(remittance.slice(4));
  }
  if (remittance.startsWith('v2: ')) {
    return decodeV2Body(remittance.slice(4), 'v2');
  }
  if (UNVERSIONED_V2_HINT_RE.test(remittance)) {
    const r = decodeV2Body(remittance, 'unversioned-v2');
    // If the hint matched but parsing failed, treat as free-text rather
    // than report a v2-flavoured error — the sender probably wasn't
    // intending to emit v2 at all.
    return r.kind === 'invalid' ? { kind: 'unknown', raw: remittance } : r;
  }
  return { kind: 'unknown', raw: remittance };
}

/** Tokenise a body string `M:a O:b P:c ...` into a map of tag → value.
 *  Validates token shape and duplicates; returns null with reason on error. */
function tokenise(body: string): { ok: true; map: Map<string, string>; order: string[] } | { ok: false; reason: string } {
  if (body.length === 0) return { ok: false, reason: 'empty body' };
  const tokens = body.split(' ');
  const map = new Map<string, string>();
  const order: string[] = [];
  for (const t of tokens) {
    if (t.length === 0) return { ok: false, reason: 'empty token (consecutive spaces?)' };
    if (t.length < 3 || t[1] !== ':') return { ok: false, reason: `malformed token "${t}"` };
    const tag = t[0]!;
    const val = t.slice(2);
    if (map.has(tag)) return { ok: false, reason: `duplicate tag "${tag}"` };
    map.set(tag, val);
    order.push(tag);
  }
  return { ok: true, map, order };
}

function decodeV1Body(body: string): DecodeResult {
  const t = tokenise(body);
  if (!t.ok) return { kind: 'invalid', reason: t.reason };
  const { map, order } = t;

  // ADR-004: required tokens in fixed order M, O, P (positional).
  if (order.length < 3 || order[0] !== 'M' || order[1] !== 'O' || order[2] !== 'P') {
    return { kind: 'invalid', reason: 'required tokens must appear in order M O P' };
  }
  for (const tag of order.slice(3)) {
    if (!['I', 'V', 'D', 'R'].includes(tag)) {
      return { kind: 'invalid', reason: `unknown tag "${tag}" in v1` };
    }
  }

  const merchantId = map.get('M')!;
  const orderId = map.get('O')!;
  const purposeStr = map.get('P')!;

  if (!MERCHANT_ID_RE.test(merchantId)) return { kind: 'invalid', reason: 'malformed merchantId' };
  if (!ORDER_ID_RE.test(orderId)) return { kind: 'invalid', reason: 'malformed orderId' };
  if (!(V1_PURPOSES as ReadonlyArray<string>).includes(purposeStr)) {
    return { kind: 'invalid', reason: `unknown purpose "${purposeStr}"` };
  }
  const purpose = purposeStr as V1Purpose;

  const fields: V1Fields = { merchantId, orderId, purpose };

  if (map.has('I')) {
    const v = map.get('I')!;
    if (!ITEM_COUNT_RE.test(v)) return { kind: 'invalid', reason: 'malformed itemCount' };
    fields.itemCount = Number.parseInt(v, 10);
  }
  if (map.has('V')) {
    const v = map.get('V')!;
    if (!BIGINT_18_RE.test(v)) return { kind: 'invalid', reason: 'malformed vat' };
    fields.vatMicroUnits = BigInt(v);
  }
  if (map.has('D')) {
    const v = map.get('D')!;
    if (!BIGINT_18_RE.test(v)) return { kind: 'invalid', reason: 'malformed discount' };
    fields.discountMicroUnits = BigInt(v);
  }
  if (map.has('R')) {
    const v = map.get('R')!;
    if (!UETR_RE.test(v)) return { kind: 'invalid', reason: 'malformed refundOf UETR' };
    fields.refundOf = v;
  }

  if (purpose === 'REFUND' && fields.refundOf === undefined) {
    return { kind: 'invalid', reason: 'REFUND purpose requires R: tag' };
  }
  if (purpose !== 'REFUND' && fields.refundOf !== undefined) {
    return { kind: 'invalid', reason: 'R: tag only allowed with REFUND purpose' };
  }

  return { kind: 'v1', fields };
}

function decodeV2Body(body: string, kind: 'v2' | 'unversioned-v2'): DecodeResult {
  const t = tokenise(body);
  if (!t.ok) return { kind: 'invalid', reason: t.reason };
  const { map, order } = t;

  if (order.length < 3 || order[0] !== 'P' || order[1] !== 'N' || order[2] !== 'G') {
    return { kind: 'invalid', reason: 'required tokens must appear in order P N G' };
  }
  for (const tag of order.slice(3)) {
    if (tag !== 'T') return { kind: 'invalid', reason: `unknown tag "${tag}" in v2` };
  }

  const purpose = map.get('P')!;
  const nature = map.get('N')!;
  const goal = map.get('G')!;

  if (!ISO_PURPOSE_RE.test(purpose)) return { kind: 'invalid', reason: 'purpose must be 4 uppercase letters' };
  if (!V2_TAG_VALUE_RE.test(nature)) return { kind: 'invalid', reason: 'malformed nature' };
  if (!V2_TAG_VALUE_RE.test(goal)) return { kind: 'invalid', reason: 'malformed goal' };

  const fields: V2Fields = { purpose, nature, goal };
  if (map.has('T')) {
    const v = map.get('T')!;
    if (!V2_TAG_VALUE_RE.test(v)) return { kind: 'invalid', reason: 'malformed taskRef' };
    fields.taskRef = v;
  }
  return { kind, fields };
}
