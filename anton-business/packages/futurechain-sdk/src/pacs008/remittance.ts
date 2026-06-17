/**
 * AntonRemittance — rich structured payload carried inside PACS.008
 * `RmtInf` (Remittance Information).
 *
 * The user-chosen design for Wave 10:
 *   • Opt-in per QR — the merchant flips a switch on the QR screen
 *     when they want to bundle order details.
 *   • Inline small attachments (<= INLINE_ATTACHMENT_LIMIT bytes),
 *     hash+URL pointer above that. Keeps the chain slim while
 *     remaining tamper-evidence linkable to external bytes.
 *
 * Placement in PACS.008:
 *   `Document.FIToFICstmrCdtTrf.CdtTrfTxInf[0].RmtInf` =
 *     {
 *       Ustrd: [<human-readable summary line>, ...optional continuation],
 *       Strd: [{
 *         RfrdDocInf: { Tp: { CdOrPrtry: { Cd: 'INVO' } }, Nb: <ref> },
 *         AddtlRmtInf: ['ANTON-V1:<base64-of-canonical-JSON>'],
 *       }],
 *     }
 *
 * The `ANTON-V1:` prefix is what the receiver scans for. Older
 * receivers that only understand `RmtInf.Ustrd` still see the human
 * summary; rich-aware receivers see the full structured payload.
 *
 * Encoding is JSON → UTF-8 → base64. Decoding reverses. Hashing of
 * `tx.encrypted_data` for the wire signature is unchanged — the
 * structured payload is just part of the bytes that get hashed.
 */
import { sha256 } from '@noble/hashes/sha2';

/** Soft cap — warn above this. */
export const REMITTANCE_SOFT_CAP_BYTES = 80 * 1024;
/** Hard cap — refuse to build a remittance bigger than this. The
 *  chain's tx.encrypted_data is `Vec<u8>` and the relay's per-tx
 *  budget is ~100 KB in practice; leaving 20 KB for the rest of
 *  the PACS.008 envelope. */
export const REMITTANCE_HARD_CAP_BYTES = 100 * 1024;
/** Inline-attachment threshold. Attachments under this go base64
 *  in the message; bigger ones become hash + URL pointer. */
export const INLINE_ATTACHMENT_LIMIT = 50 * 1024;

/** A single line item — typically a cart row from the merchant or
 *  an itemised note from the customer. */
export interface AntonRemittanceItem {
  /** Item display name (e.g. "Cappuccino", "Brake service"). */
  name: string;
  /** Quantity. Use 1 for unit-priced services. */
  qty: number;
  /** Per-unit price in SEK. */
  unitPriceSek?: number;
  /** Line total in SEK (qty * unitPriceSek). Cached for receiver
   *  convenience — receiver may verify by recomputing. */
  lineTotalSek?: number;
  /** VAT/GST rate percent. Any rate — the merchant's country sets the bands
   *  (Sweden 0/6/12/25, Germany 7/19, India 5/12/18/28, a US sales-tax rate, …).
   *  Was a Sweden-only union; widened to support multi-country merchants. */
  vatRate?: number;
  /** Optional SKU / stock code. */
  sku?: string;
}

/** Attachment — photo, scan, agreement document, link. */
export interface AntonRemittanceAttachment {
  /** What kind of bytes / link this is. */
  kind: 'photo' | 'pdf' | 'document' | 'link';
  /** Standard MIME type ("image/jpeg", "application/pdf", "text/uri-list"). */
  mime: string;
  /** Byte length of the original content. For links, the length of the URL. */
  sizeBytes: number;
  /** SHA-256 of the original content (hex). Lets the receiver verify
   *  integrity of the bytes whether they came inline or via URL. */
  sha256: string;
  /** Base64 of the original bytes — present iff sizeBytes <= INLINE_ATTACHMENT_LIMIT. */
  inlineB64?: string;
  /** Fetch URL — present iff the bytes are NOT inlined. The receiver
   *  must verify sha256 after fetching to detect tampering. */
  url?: string;
  /** Optional human label (filename, caption). */
  label?: string;
}

/** The full rich-remittance payload. */
export interface AntonRemittance {
  /** Schema version. v=1 is the only shipping version. */
  v: 1;
  /** What this remittance is. `mixed` = order + agreement on the same payment. */
  kind: 'order' | 'invoice' | 'agreement' | 'message' | 'mixed';
  /** Merchant or sender's local reference number (kvitto / order id). */
  ref?: string;
  /** Line items — for kind=order/invoice/mixed. */
  items?: AntonRemittanceItem[];
  /** Total amount in SEK (sum of line totals, pre-discount unless noted). */
  amountSek?: number;
  /** Total VAT in SEK. */
  vatSek?: number;
  /** Free-text message from the sender to the receiver. */
  message?: string;
  /** For service businesses: what the parties agreed to. */
  decision?: string;
  /** Terms of service / contract clauses. */
  terms?: string;
  /** Inline + linked attachments. */
  attachments?: AntonRemittanceAttachment[];
  /** Free-form extensions — keyed string map. */
  meta?: Record<string, string>;
}

const PREFIX = 'ANTON-V1:';

// ───────────────────────────────────────────────────────────────────────
// Encoding helpers — base64 without DOM `btoa`/`atob` (those are bytes,
// not utf-8 safe).
// ───────────────────────────────────────────────────────────────────────

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Standard base64 (no URL-safe variation, no padding stripping). */
function base64Encode(bytes: Uint8Array): string {
  // Avoid Buffer dependency (it works in Node but not in the browser
  // bundle). Do it manually via String.fromCharCode + btoa.
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  if (typeof btoa === 'function') return btoa(bin);
  // Node fallback
  return Buffer.from(bytes).toString('base64');
}

function base64Decode(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

// ───────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────

export interface EncodedRemittance {
  /** Wire-shape `RmtInf` block to merge into PACS.008 CdtTrfTxInf. */
  rmtInf: {
    Ustrd: string[];
    Strd: Array<{
      RfrdDocInf?: { Tp: { CdOrPrtry: { Cd: string } }; Nb?: string };
      AddtlRmtInf?: string[];
    }>;
  };
  /** Total byte size of the encoded `RmtInf` JSON (rough chain-budget hint). */
  approxBytes: number;
  /** Whether the encoded payload exceeded the soft cap. */
  overSoftCap: boolean;
}

/**
 * Encode an AntonRemittance into a PACS.008 `RmtInf` block.
 *
 * - Produces `Ustrd[0]` as a one-line human-readable summary so older
 *   receivers see something useful.
 * - Produces `Strd[0].AddtlRmtInf[0]` as `ANTON-V1:<base64>` carrying
 *   the full structured payload.
 * - Throws if the encoded size exceeds REMITTANCE_HARD_CAP_BYTES.
 */
export function encodeRemittance(payload: AntonRemittance): EncodedRemittance {
  if (payload.v !== 1) throw new Error('encodeRemittance: unsupported v');

  // Build the human summary first — what the merchant or customer
  // would see at a glance.
  const ustrd: string[] = [buildHumanSummary(payload)];
  // If there's a free-text message, also append a second line so a
  // legacy receiver sees both the totals AND the note.
  if (payload.message && payload.message.length <= 200) {
    ustrd.push(payload.message);
  }

  // Encode the full structured payload.
  const json = JSON.stringify(payload);
  const bytes = utf8Bytes(json);
  const b64 = base64Encode(bytes);
  const addtl = `${PREFIX}${b64}`;

  const strd: EncodedRemittance['rmtInf']['Strd'] = [{
    ...(payload.ref ? { RfrdDocInf: { Tp: { CdOrPrtry: { Cd: kindToIso(payload.kind) } }, Nb: payload.ref } } : {}),
    AddtlRmtInf: [addtl],
  }];

  const rmtInf = { Ustrd: ustrd, Strd: strd };
  const approxBytes = utf8Bytes(JSON.stringify(rmtInf)).length;

  if (approxBytes > REMITTANCE_HARD_CAP_BYTES) {
    throw new Error(
      `encodeRemittance: payload too large (${approxBytes} > ${REMITTANCE_HARD_CAP_BYTES} bytes). ` +
      'Reduce attachments or split into multiple payments.',
    );
  }

  return {
    rmtInf,
    approxBytes,
    overSoftCap: approxBytes > REMITTANCE_SOFT_CAP_BYTES,
  };
}

/**
 * Decode the structured payload from a PACS.008 `RmtInf` block.
 * Returns null when no `ANTON-V1:` envelope is present (the message
 * may still have a useful `Ustrd[0]` for display).
 */
export function decodeRemittance(rmtInf: unknown): AntonRemittance | null {
  if (!rmtInf || typeof rmtInf !== 'object') return null;
  const strdArr = (rmtInf as { Strd?: unknown }).Strd;
  if (!Array.isArray(strdArr)) return null;
  for (const strd of strdArr) {
    const addtl = (strd as { AddtlRmtInf?: unknown }).AddtlRmtInf;
    if (!Array.isArray(addtl)) continue;
    for (const line of addtl) {
      if (typeof line !== 'string' || !line.startsWith(PREFIX)) continue;
      const b64 = line.slice(PREFIX.length);
      try {
        const bytes = base64Decode(b64);
        const json = utf8Decode(bytes);
        const parsed = JSON.parse(json) as AntonRemittance;
        if (parsed.v !== 1) continue;
        return parsed;
      } catch {
        // bad payload — keep scanning, in case there's a valid one
      }
    }
  }
  return null;
}

/**
 * Extract just the human-readable summary line(s) from RmtInf.Ustrd.
 * Always safe to call; returns [] when not present.
 */
export function readableSummary(rmtInf: unknown): string[] {
  if (!rmtInf || typeof rmtInf !== 'object') return [];
  const u = (rmtInf as { Ustrd?: unknown }).Ustrd;
  if (!Array.isArray(u)) return [];
  return u.filter((x): x is string => typeof x === 'string');
}

/**
 * Compute the SHA-256 hex hash of bytes — used when building
 * attachments to bind the inline / linked content to a verifiable
 * integrity check.
 */
export function sha256Hex(bytes: Uint8Array): string {
  const digest = sha256(bytes);
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/**
 * Build an attachment object from raw bytes. Inlines as base64 when
 * the byte length is at or below INLINE_ATTACHMENT_LIMIT; otherwise
 * the caller must supply a URL after uploading separately.
 */
export function buildAttachment(input: {
  kind: AntonRemittanceAttachment['kind'];
  mime: string;
  bytes: Uint8Array;
  /** Required when bytes.length > INLINE_ATTACHMENT_LIMIT. */
  url?: string;
  label?: string;
}): AntonRemittanceAttachment {
  const { kind, mime, bytes, url, label } = input;
  const sha = sha256Hex(bytes);
  if (bytes.length <= INLINE_ATTACHMENT_LIMIT) {
    return {
      kind, mime, sizeBytes: bytes.length, sha256: sha,
      inlineB64: base64Encode(bytes),
      ...(label ? { label } : {}),
    };
  }
  if (!url) {
    throw new Error(
      `buildAttachment: bytes too large to inline (${bytes.length} > ${INLINE_ATTACHMENT_LIMIT}). ` +
      'Upload to your own host and pass a URL — the SHA-256 binds it to the receipt.',
    );
  }
  return { kind, mime, sizeBytes: bytes.length, sha256: sha, url, ...(label ? { label } : {}) };
}

// ───────────────────────────────────────────────────────────────────────
// Internal — human summary + iso mapping
// ───────────────────────────────────────────────────────────────────────

function buildHumanSummary(p: AntonRemittance): string {
  const parts: string[] = [];

  if (p.items && p.items.length > 0) {
    // Compact: "3× Cappuccino, 2× Croissant"
    const previewItems = p.items.slice(0, 3);
    const more = p.items.length - previewItems.length;
    const itemSummary = previewItems
      .map((it) => `${it.qty}× ${it.name}`)
      .join(', ');
    parts.push(more > 0 ? `${itemSummary} +${more} more` : itemSummary);
  }

  if (p.ref) parts.push(`Ref ${p.ref}`);

  if (typeof p.amountSek === 'number') {
    parts.push(`${p.amountSek.toFixed(2)} SEK`);
    if (typeof p.vatSek === 'number' && p.vatSek > 0) {
      parts.push(`VAT ${p.vatSek.toFixed(2)}`);
    }
  }

  if (!parts.length && p.message) {
    // No items / ref / amount — but there's a message. Show it.
    parts.push(p.message.slice(0, 140));
  }

  return parts.join(' · ');
}

/** Map an AntonRemittance kind onto a 4-char ISO 20022 document code.
 *  These codes feed `RmtInf.Strd[].RfrdDocInf.Tp.CdOrPrtry.Cd`. */
function kindToIso(kind: AntonRemittance['kind']): string {
  switch (kind) {
    case 'invoice':   return 'CINV'; // commercial invoice
    case 'order':     return 'SOAC'; // statement of account / order ack
    case 'agreement': return 'AROI'; // proof of agreement (ANTON-extended)
    case 'message':   return 'SCOR'; // structured remittance — message
    case 'mixed':     return 'CINV';
  }
}
