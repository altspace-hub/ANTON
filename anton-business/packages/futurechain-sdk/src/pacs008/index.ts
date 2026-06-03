/**
 * pacs008/ — Transaction signing + PACS.008 message builder.
 *
 * Status: IMPLEMENTED (Phase 1 — May 20 2026). Byte-exact against the
 * Rust canonical at `futurechain/src/transaction.rs:593-632` (the
 * `signing_message_v2` private fn) and `futurechain/src/blockchain.rs`
 * (the Transaction / TransactionInput / TransactionOutput /
 * TransactionMetadata structs).
 *
 * What's in here:
 *   • Transaction / TransactionInput / TransactionOutput / TransactionMetadata
 *     — wire-shape types matching what `serde_json::to_value(&Transaction)`
 *     emits in the Rust core. The RPC client POSTs and reads these shapes.
 *   • `signingMessageV2(tx)` — the exact pipe-delimited canonical string
 *     that the Rust signer builds. Byte-for-byte equal to Rust output.
 *   • `signingMessageV2Hash(tx)` — SHA-256 of the UTF-8 bytes of the
 *     canonical string. This is the 32-byte hash that Ed25519 actually
 *     signs.
 *   • `signTransaction(wallet, tx)` — produces an updated Transaction with
 *     the wallet's Ed25519 signature attached at the tx-level AND on every
 *     input (dual signature placement — matches transaction.rs:321-330).
 *   • `Pacs008Builder` — produces a Pacs008Message JSON in the canonical
 *     wire shape (the same shape `regression_test_suite.py::create_pacs008_message`
 *     emits, matching `iso20022_pacs008.rs::Pacs008Document` serde).
 *   • `canonicalize(pacs008)` / `hash(pacs008)` — JSON bytes / SHA-256 of
 *     the Pacs008Message. These are what go into `tx.encrypted_data` and
 *     what `signing_message_v2` re-hashes into `encrypted_data_hash`.
 *
 * Conformance is asserted in `pacs008.test.ts` against the v2 vectors in
 * `test-vectors/conformance.v1.json`.
 */
import { sha256 } from '@noble/hashes/sha2';
import { ed25519 } from '@noble/curves/ed25519';
import type { Wallet } from '../wallet/index.js';

// ───────────────────────────────────────────────────────────────────────
// Transaction wire shape — matches `blockchain.rs::Transaction` serde
// ───────────────────────────────────────────────────────────────────────

/** A signed-or-unsigned Transaction in the FutureChain wire shape. The
 *  field names and order match exactly what `serde_json::to_value(&Transaction)`
 *  emits on the Rust side, which is what the RPC server expects on POST. */
export interface Transaction {
  id: string;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  fee: number;
  /** Timestamp — Rust uses `chrono::DateTime<Utc>` which serdes as a
   *  RFC 3339 string ("2026-05-20T00:00:00Z"). When `signingMessageV2`
   *  builds the canonical it converts this back to Unix seconds — the
   *  same as `tx.timestamp.timestamp()` on the Rust side. */
  timestamp: string;
  signature: number[] | null;
  metadata: TransactionMetadata | null;
  /** PACS.008 payload bytes (the canonical JSON of a Pacs008Message).
   *  Rust serdes Vec<u8> as a JSON number array. */
  encrypted_data: number[] | null;
  privacy_proof: unknown | null;
  access_list: string[] | null;
}

export interface TransactionInput {
  previous_tx_id: string;
  output_index: number;
  signature: number[] | null;
  public_key: number[] | null;
  /** Shadow-mode FALCON-512 fields — soft-upgrade per
   *  `blockchain.rs::TransactionInput` serde. Omitted from JSON if null. */
  pq_signature?: number[] | null;
  pq_public_key?: number[] | null;
}

export interface TransactionOutput {
  address: string;
  amount: number;
}

export interface TransactionMetadata {
  iso20022_ref: string | null;
  transaction_type: string;
  // Compliance-decision fields — populated by the gateway AFTER user
  // signs. Excluded from `signing_message_v2`'s metadata_user_hash on
  // purpose so the user signature is stable across compliance stamping.
  compliance_node_address: string | null;
  compliance_screening_id: string | null;
  compliance_decision_hash: string | null;
  compliance_signature: number[] | null;
  compliance_timestamp: number | null;
}

// ───────────────────────────────────────────────────────────────────────
// signing_message_v2 — byte-exact mirror of transaction.rs:593-632
// ───────────────────────────────────────────────────────────────────────

/** Build the canonical pipe-delimited signing string for a Transaction.
 *  Output format (six `|`-joined fields):
 *
 *      inputs|outputs|fee|timestamp_unix_seconds|encrypted_data_hash|metadata_user_hash
 *
 *  Where:
 *    inputs               = comma-joined "<previous_tx_id>:<output_index>"
 *    outputs              = comma-joined "<address>:<amount>"
 *    encrypted_data_hash  = hex(SHA-256(encrypted_data)) OR "none"
 *    metadata_user_hash   = hex(SHA-256("iso_ref=<ref>;type=<type>")) OR "none"
 *
 *  Compliance metadata is INTENTIONALLY excluded — it's filled in by the
 *  gateway after the user signs.
 *
 *  Must match `transaction.rs::signing_message_v2` byte-for-byte. The
 *  conformance suite checks ~3 transaction shapes against the Rust
 *  oracle. */
export function signingMessageV2(tx: Transaction): string {
  const inputs_str = tx.inputs
    .map((i) => `${i.previous_tx_id}:${i.output_index}`)
    .join(',');
  const outputs_str = tx.outputs
    .map((o) => `${o.address}:${o.amount}`)
    .join(',');

  const encrypted_data_hash = tx.encrypted_data
    ? bytesToHex(sha256(Uint8Array.from(tx.encrypted_data)))
    : 'none';

  let metadata_user_hash: string;
  if (tx.metadata) {
    const canonical = `iso_ref=${tx.metadata.iso20022_ref ?? ''};type=${tx.metadata.transaction_type}`;
    metadata_user_hash = bytesToHex(sha256(utf8(canonical)));
  } else {
    metadata_user_hash = 'none';
  }

  const ts_unix = timestampToUnixSeconds(tx.timestamp);

  return `${inputs_str}|${outputs_str}|${tx.fee}|${ts_unix}|${encrypted_data_hash}|${metadata_user_hash}`;
}

/** SHA-256 of the UTF-8 bytes of `signingMessageV2(tx)` — the 32-byte
 *  hash that the Ed25519 signer actually consumes. Matches Rust's
 *  `Sha256::digest(message.as_bytes())` in transaction.rs:309. */
export function signingMessageV2Hash(tx: Transaction): Uint8Array {
  return sha256(utf8(signingMessageV2(tx)));
}

// ───────────────────────────────────────────────────────────────────────
// signTransaction — dual signature placement (tx + every input)
// ───────────────────────────────────────────────────────────────────────

/** Sign `tx` with the wallet's Ed25519 private key. Mirrors
 *  `transaction.rs::sign_transaction:306-333` — attaches the same
 *  signature both at `tx.signature` (tx-level) and on each
 *  `input.signature` (per-input), with `input.public_key` set to the
 *  wallet's pubkey on every input.
 *
 *  Does NOT modify the input `tx`; returns a new Transaction. Does NOT
 *  set `tx.id` (txid is set by the Transaction builder — `calculate_txid`
 *  in the Rust core is height-gated v1/v2 logic and lives in the
 *  builder, not here).
 *
 *  Pre-condition: `tx.metadata` and `tx.encrypted_data` must already be
 *  populated as they will appear on chain — signing locks both into the
 *  hash.
 *
 *  Compliance fields in metadata may be null at sign time — that's
 *  expected; they're filled in by the gateway later, and
 *  `signing_message_v2` excludes them from the hash for that reason. */
export function signTransaction(wallet: Wallet, tx: Transaction): Transaction {
  const hash = signingMessageV2Hash(tx);
  const sig = ed25519.sign(hash, wallet.privateKey);
  const sigArr = Array.from(sig);
  const pubArr = Array.from(wallet.publicKey);

  return {
    ...tx,
    signature: sigArr,
    inputs: tx.inputs.map((i) => ({
      ...i,
      signature: sigArr,
      public_key: pubArr,
    })),
  };
}

/**
 * Async signer callback — pure function of (digest → signature) that
 * the caller plugs in from a native plugin / HSM / etc. The signer
 * MUST NOT inspect or persist the digest; it MUST return a 64-byte
 * Ed25519 signature.
 *
 * Used by the *WithSigner variants below to keep the private key
 * out of JavaScript heap entirely — the canonical implementation
 * delegates to a Capacitor plugin that holds the priv under an
 * Android Keystore alias and signs in native JVM code.
 */
export type AsyncEd25519Signer = (digest: Uint8Array) => Promise<Uint8Array>;

/**
 * Signer-callback variant of {@link signTransaction}. Identical
 * placement (tx-level + every input) as the wallet-shaped variant —
 * the only difference is the sign step delegates to a callback so
 * the priv key can live somewhere safer than the JS heap.
 *
 *   publicKey  — the 32-byte Ed25519 public key (safe to expose)
 *   signer     — async callback that signs a 32-byte digest
 *   tx         — the Transaction to sign
 */
export async function signTransactionWithSigner(
  publicKey: Uint8Array,
  signer: AsyncEd25519Signer,
  tx: Transaction,
): Promise<Transaction> {
  const digest = signingMessageV2Hash(tx);
  const sig = await signer(digest);
  if (sig.length !== 64) {
    throw new Error(
      `signTransactionWithSigner: signer returned ${sig.length} bytes; expected 64.`,
    );
  }
  const sigArr = Array.from(sig);
  const pubArr = Array.from(publicKey);
  return {
    ...tx,
    signature: sigArr,
    inputs: tx.inputs.map((i) => ({
      ...i,
      signature: sigArr,
      public_key: pubArr,
    })),
  };
}

/** Verify a signed Transaction's tx-level Ed25519 signature against the
 *  given public key. Re-computes `signing_message_v2` from the tx and
 *  checks the signature.
 *
 *  Note: this verifies the user signature only. Compliance signatures
 *  (set by the gateway in `metadata.compliance_signature`) are a separate
 *  channel — see `compliance_gateway.rs` for that path. */
export function verifyTransactionSignature(
  tx: Transaction,
  publicKey: Uint8Array,
): boolean {
  if (!tx.signature) return false;
  if (publicKey.length !== 32) return false;
  if (tx.signature.length !== 64) return false;
  const sig = Uint8Array.from(tx.signature);
  const hash = signingMessageV2Hash(tx);
  try {
    return ed25519.verify(sig, hash, publicKey);
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────
// PACS.008 message builder
// ───────────────────────────────────────────────────────────────────────

/** ISO 20022 structured postal address (`PstlAdr`). Every field is
 *  optional and emitted only when present. Set it on the debtor for
 *  a Travel-Rule transfer (>= EUR 1000); omit it sub-threshold per
 *  GDPR data-minimisation. */
export interface Pacs008PostalAddress {
  /** Street name (`StrtNm`). */
  streetName?: string;
  /** Post code (`PstCd`). */
  postCode?: string;
  /** Town / city name (`TwnNm`). */
  townName?: string;
  /** ISO 3166 alpha-2 country (`Ctry`). */
  country?: string;
}

/** Party information for the debtor/creditor on a PACS.008. */
export interface Pacs008Party {
  name: string;
  /** ISO 3166 alpha-2 country code (residence). */
  countryOfResidence?: string;
  /** Wallet address — `fc_...`. */
  accountId: string;
  /** Structured postal address (`PstlAdr`). Emitted into the signed
   *  message only when present — set it for Travel-Rule transfers. */
  postalAddress?: Pacs008PostalAddress;
}

/** Builder input — the high-level intent the SDK consumer wants to send. */
export interface Pacs008BuildInput {
  debtor: Pacs008Party;
  creditor: Pacs008Party;
  /** Optional Ultimate Debtor (`UltmtDbtr`) — the party that ultimately owes,
   *  distinct from the `Dbtr` that initiates. Used by ANTON agent wallets: the
   *  agent acts as the `Dbtr` ("ANTON <addr6>") while the human owner is
   *  disclosed here as the UBO. Emitted only when set, so existing flows are
   *  byte-identical. */
  ultimateDebtor?: Pacs008Party;
  /** Amount in FTC (a decimal — e.g. 1.00). The on-wire representation is
   *  a JSON number; the chain stores satoshis (1 FTC = 1e8 satoshi) on
   *  outputs separately. */
  amountFtc: number;
  /** Optional UETR (Unique End-to-End Transaction Reference). Auto-generated
   *  as a UUID v4 if omitted. */
  uetr?: string;
  /** Optional remittance text (free-form, see ADR-004 for the @futurechain/sdk/
   *  reference encoding the merchant apps use). */
  remittanceText?: string;
  /** Optional full structured `RmtInf` block (Wave 10 — rich remittance).
   *  When set, this is placed under `CdtTrfTxInf[0].RmtInf` verbatim and
   *  the `remittanceText` field is ignored. Use `encodeRemittance()` from
   *  `./remittance.js` to build this. */
  remittanceInfo?: {
    Ustrd?: string[];
    Strd?: Array<Record<string, unknown>>;
  };
  /** BIC for both agents (the same chain operator runs both legs of a
   *  same-chain payment). Defaults to TESTSE33XXX. */
  bic?: string;
  /** ISO 20022 external purpose code (`Purp.Cd`) — e.g. GDDS, SCVE,
   *  OTHR. Defaults to 'SUPP'. FutureChain's validator requires a
   *  purpose for a debtor resident in a high-risk country. */
  purpose?: string;
}

/** The wire-shape Pacs008Message — matches what the regression suite +
 *  `iso20022_pacs008.rs::Pacs008Document` serde emit on the Rust side. */
export type Pacs008Message = Record<string, unknown>;

const DEFAULT_BIC = 'TESTSE33XXX';
const DEFAULT_BANK_NAME = 'FutureChain AB';

/** Builder for a PACS.008.001.13 wire message. Chainable convenience
 *  wrapper around `buildPacs008` — useful when constructing a tx from
 *  partial state across multiple call sites. */
export class Pacs008Builder {
  private partial: Partial<Pacs008BuildInput> = {};

  debtor(p: Pacs008Party): this { this.partial.debtor = p; return this; }
  creditor(p: Pacs008Party): this { this.partial.creditor = p; return this; }
  ultimateDebtor(p: Pacs008Party): this { this.partial.ultimateDebtor = p; return this; }
  amountFtc(v: number): this { this.partial.amountFtc = v; return this; }
  uetr(v: string): this { this.partial.uetr = v; return this; }
  remittance(v: string): this { this.partial.remittanceText = v; return this; }
  bic(v: string): this { this.partial.bic = v; return this; }
  purpose(v: string): this { this.partial.purpose = v; return this; }

  build(): Pacs008Message {
    if (!this.partial.debtor) throw new Error('Pacs008Builder.build(): debtor required');
    if (!this.partial.creditor) throw new Error('Pacs008Builder.build(): creditor required');
    if (this.partial.amountFtc === undefined) {
      throw new Error('Pacs008Builder.build(): amountFtc required');
    }
    return buildPacs008(this.partial as Pacs008BuildInput);
  }
}

/** Render a Pacs008Party into the ISO debtor/creditor shape — `Nm` +
 *  `CtryOfRes`, plus a structured `PstlAdr` when the party carries a
 *  postal address. */
function isoParty(p: Pacs008Party): Record<string, unknown> {
  const out: Record<string, unknown> = {
    Nm: p.name,
    CtryOfRes: p.countryOfResidence ?? 'SE',
  };
  const a = p.postalAddress;
  if (a && (a.streetName || a.postCode || a.townName || a.country)) {
    const pstlAdr: Record<string, unknown> = {};
    if (a.streetName) pstlAdr.StrtNm = a.streetName;
    if (a.postCode) pstlAdr.PstCd = a.postCode;
    if (a.townName) pstlAdr.TwnNm = a.townName;
    if (a.country) pstlAdr.Ctry = a.country;
    out.PstlAdr = pstlAdr;
  }
  return out;
}

/** Build a Pacs008Message from a `Pacs008BuildInput`. Pure function —
 *  no I/O, no side effects. The output matches the regression suite's
 *  `create_pacs008_message` shape so the Rust core's
 *  `serde_json::from_slice::<Pacs008Message>(encrypted_data)` deserialises
 *  it cleanly. */
export function buildPacs008(input: Pacs008BuildInput): Pacs008Message {
  const now = isoNowSeconds();
  const uetr = input.uetr ?? uuidV4();
  const msgId = `MSGID-${randomHex(16).toUpperCase()}`;
  const instrId = `INSTR-${randomHex(16).toUpperCase()}`;
  const e2eId = `E2E-${randomHex(16).toUpperCase()}`;
  const txId = `TXID-${randomHex(16).toUpperCase()}`;
  const bic = input.bic ?? DEFAULT_BIC;

  return {
    document: {
      FIToFICstmrCdtTrf: {
        GrpHdr: {
          MsgId: msgId,
          CreDtTm: now,
          NbOfTxs: '1',
          SttlmInf: { SttlmMtd: 'CLRG' },
        },
        CdtTrfTxInf: [{
          PmtId: { InstrId: instrId, EndToEndId: e2eId, TxId: txId, UETR: uetr },
          IntrBkSttlmAmt: { '@Ccy': 'FTC', $value: input.amountFtc },
          ChrgBr: 'SLEV',
          Dbtr: isoParty(input.debtor),
          DbtrAcct: { Id: { Othr: { Id: input.debtor.accountId } } },
          // Ultimate Debtor — the UBO behind an agent/ delegated payment.
          // Emitted only when supplied so existing messages are unchanged.
          ...(input.ultimateDebtor ? { UltmtDbtr: isoParty(input.ultimateDebtor) } : {}),
          DbtrAgt: { FinInstnId: { BICFI: bic, Nm: DEFAULT_BANK_NAME } },
          CdtrAgt: { FinInstnId: { BICFI: bic, Nm: DEFAULT_BANK_NAME } },
          Cdtr: isoParty(input.creditor),
          CdtrAcct: { Id: { Othr: { Id: input.creditor.accountId } } },
          Purp: { Cd: input.purpose ?? 'SUPP' },
          // Wave 10 — structured remittance wins over the legacy
          // single-line shorthand. When neither is set, RmtInf is
          // omitted entirely (older payers / chains were never relying
          // on it being present).
          ...(input.remittanceInfo
            ? { RmtInf: input.remittanceInfo }
            : input.remittanceText !== undefined
              ? { RmtInf: { Ustrd: [input.remittanceText] } }
              : {}),
        }],
      },
    },
    futurechain_metadata: {
      compliance_checked: false,
      kyc_verified: false,
      aml_checked: false,
      sanctions_checked: false,
      risk_score: 0.1,
      processing_timestamp: now,
      blockchain_tx_id: null,
      node_type: 'archive',
      network_id: 'mainnet',
    },
  };
}

/** Canonical bytes of a PACS.008 message — `tx.encrypted_data` content.
 *  Uses `JSON.stringify` (key order = insertion order — same as the
 *  builder). Matches the Rust `serde_json::to_vec(&pacs008)` shape on
 *  the deserialization side (the Rust signer's `signing_message_v2` only
 *  hashes the BYTES that already live in `tx.encrypted_data`, so the
 *  builder's JSON shape is what matters). */
export function canonicalize(pacs008: Pacs008Message): Uint8Array {
  return utf8(JSON.stringify(pacs008));
}

/** SHA-256 of the canonical bytes — useful for content addressing /
 *  off-chain dedup. */
export function hash(pacs008: Pacs008Message): Uint8Array {
  return sha256(canonicalize(pacs008));
}

// ───────────────────────────────────────────────────────────────────────
// Transaction builder — UTXO selection + outputs + sign
// ───────────────────────────────────────────────────────────────────────

/** A spendable UTXO as returned by `/get_utxos/{address}` on the live
 *  node. Re-exported from rpc/ so the builder doesn't import rpc/ —
 *  pacs008/ stays the "lower" layer in the dep graph. */
export interface UtxoLike {
  tx_id: string;
  output_index: number;
  amount: number;
}

export interface BuildPacs008TxInput {
  /** The wallet that owns the input UTXOs and signs the tx. */
  wallet: Wallet;
  /** All UTXOs available for the sender. The builder picks greedily
   *  largest-first; pass the full set returned by `getUtxos(address)`. */
  utxos: UtxoLike[];
  /** Recipient wallet address (fc_…). Same chain — no cross-chain. */
  recipient: string;
  /** Amount to send, in satoshi (1 FTC = 100_000_000 satoshi). */
  amountSatoshi: number;
  /** Network fee in satoshi. Default 100 (= 1e-6 FTC). */
  feeSatoshi?: number;
  /** The PACS.008 payload — built by `Pacs008Builder` or `buildPacs008`. */
  pacs008: Pacs008Message;
  /** UETR — the txid for PACS.008 is the UETR per the protocol. Must match
   *  the UETR in the PACS.008 message. */
  uetr: string;
  /** Optional override for tx.timestamp (ISO 8601 UTC). Defaults to now. */
  timestamp?: string;
}

/** Greedy UTXO selection — largest-first until the target is met. Throws
 *  if the sender's UTXOs sum to less than the target. */
export function selectUtxosGreedy(
  utxos: UtxoLike[],
  targetSatoshi: number,
): UtxoLike[] {
  if (targetSatoshi <= 0) {
    throw new Error('selectUtxosGreedy: target must be > 0');
  }
  const sorted = [...utxos].sort((a, b) => b.amount - a.amount);
  const picked: UtxoLike[] = [];
  let sum = 0;
  for (const u of sorted) {
    picked.push(u);
    sum += u.amount;
    if (sum >= targetSatoshi) return picked;
  }
  throw new Error(
    `selectUtxosGreedy: insufficient funds — need ${targetSatoshi} sat, have ${sum} sat across ${utxos.length} UTXO(s)`,
  );
}

// ── Network fee policy ────────────────────────────────────────────────
//
// fee = 0.1% of the amount, capped at 0.1 FTC, with a floor. The CLIENT and
// the node MUST agree on this EXACTLY: the fee is signed into the tx
// (change = totalIn − amount − fee), so the node can only accept/reject, never
// silently recompute. A mismatch ⇒ the tx is rejected. See docs/FEE_POLICY.md.

/** 0.1% = amount / 1000. */
export const FEE_RATE_DIVISOR = 1000;
/** Hard cap = exactly 0.1 FTC. */
export const FEE_CAP_SATOSHI = 10_000_000;
/** App floor. The network minimum is 200 sat (≈200-byte tx); the app uses 250
 *  (+50 buffer) so it is never rejected for underpaying. */
export const FEE_MIN_SATOSHI = 250;

/** The network fee in satoshi for sending `amountSatoshi`: 0.1% rounded half-up
 *  (exact integer math, no float drift), capped at 0.1 FTC, floored at
 *  `minSatoshi` (default 250 = the app floor; pass 200 for the bare network
 *  minimum). This is the single source of truth shared by Pay + Comm. */
export function computeNetworkFee(
  amountSatoshi: number,
  minSatoshi: number = FEE_MIN_SATOSHI,
): number {
  if (!Number.isFinite(amountSatoshi) || amountSatoshi <= 0) return minSatoshi;
  const amt = Math.trunc(amountSatoshi);
  // round half up at 500/1000, pure integer ops (no floating-point division).
  const q = Math.floor(amt / FEE_RATE_DIVISOR);
  const r = amt % FEE_RATE_DIVISOR;
  const pct = q + (r >= FEE_RATE_DIVISOR / 2 ? 1 : 0);
  return Math.min(Math.max(pct, minSatoshi), FEE_CAP_SATOSHI);
}

/** Build a fully-signed PACS.008-bearing Transaction ready to POST to
 *  `/submit_signed_transaction`. Mirrors the Rust core's
 *  `TransactionBuilder::create_transaction` shape: greedy UTXO selection,
 *  recipient + change outputs, fee, metadata.transaction_type =
 *  `ISO20022_PACS008`, encrypted_data = canonical JSON of the
 *  Pacs008Message, txid = UETR, then `signTransaction` to attach the
 *  Ed25519 signature on both the tx-level and every input. */
export function buildSignedPacs008Transaction(
  input: BuildPacs008TxInput,
): Transaction {
  const fee = input.feeSatoshi ?? computeNetworkFee(input.amountSatoshi);
  if (fee < 0) throw new Error('buildSignedPacs008Transaction: fee must be >= 0');
  if (input.amountSatoshi <= 0) {
    throw new Error('buildSignedPacs008Transaction: amountSatoshi must be > 0');
  }
  const target = input.amountSatoshi + fee;
  const selected = selectUtxosGreedy(input.utxos, target);
  const totalIn = selected.reduce((s, u) => s + u.amount, 0);
  const change = totalIn - target;
  if (change < 0) {
    // Shouldn't happen — selectUtxosGreedy already guarantees sum >= target.
    throw new Error('buildSignedPacs008Transaction: invariant violated — change < 0');
  }

  const outputs: TransactionOutput[] = [
    { address: input.recipient, amount: input.amountSatoshi },
  ];
  if (change > 0) {
    // Change goes back to the sender.
    outputs.push({ address: input.wallet.address, amount: change });
  }

  const unsigned: Transaction = {
    id: input.uetr, // PACS.008: txid = UETR (per protocol spec §5 Phase 1)
    inputs: selected.map((u) => ({
      previous_tx_id: u.tx_id,
      output_index: u.output_index,
      signature: null,
      public_key: null,
    })),
    outputs,
    fee,
    timestamp: input.timestamp ?? isoNowSeconds(),
    signature: null,
    metadata: {
      iso20022_ref: input.uetr,
      transaction_type: 'ISO20022_PACS008',
      compliance_node_address: null,
      compliance_screening_id: null,
      compliance_decision_hash: null,
      compliance_signature: null,
      compliance_timestamp: null,
    },
    encrypted_data: Array.from(canonicalize(input.pacs008)),
    privacy_proof: null,
    access_list: null,
  };

  return signTransaction(input.wallet, unsigned);
}

/**
 * Same as {@link BuildPacs008TxInput} but with the private key
 * abstracted behind a signer callback so the priv can live in
 * native code (Android Keystore via a Capacitor plugin, an HSM,
 * etc.). The caller supplies the wallet's public key + address +
 * an async signer.
 */
export interface BuildPacs008TxWithSignerInput {
  /** 32-byte Ed25519 public key — safe to pass through JS heap. */
  publicKey: Uint8Array;
  /** Sender's `fc_…` Base58 address; change goes back here. */
  senderAddress: string;
  /** Native signer callback — typically a Capacitor plugin that
   *  signs in JVM/Kotlin from a Keystore-resident priv key. */
  signer: AsyncEd25519Signer;
  utxos: UtxoLike[];
  recipient: string;
  amountSatoshi: number;
  feeSatoshi?: number;
  pacs008: Pacs008Message;
  uetr: string;
  /** Optional override for tx.timestamp (ISO 8601 UTC). Defaults to now. */
  timestamp?: string;
}

/**
 * Signer-callback variant of {@link buildSignedPacs008Transaction}.
 * Identical byte-for-byte output — only the priv-key handling
 * differs. Use this from any client that doesn't want the priv in
 * the JS heap (which should be all of them, once migrated).
 */
export async function buildSignedPacs008TransactionWithSigner(
  input: BuildPacs008TxWithSignerInput,
): Promise<Transaction> {
  const fee = input.feeSatoshi ?? 100;
  if (fee < 0) throw new Error('buildSignedPacs008TransactionWithSigner: fee must be >= 0');
  if (input.amountSatoshi <= 0) {
    throw new Error('buildSignedPacs008TransactionWithSigner: amountSatoshi must be > 0');
  }
  const target = input.amountSatoshi + fee;
  const selected = selectUtxosGreedy(input.utxos, target);
  const totalIn = selected.reduce((s, u) => s + u.amount, 0);
  const change = totalIn - target;
  if (change < 0) {
    throw new Error('buildSignedPacs008TransactionWithSigner: invariant violated — change < 0');
  }

  const outputs: TransactionOutput[] = [
    { address: input.recipient, amount: input.amountSatoshi },
  ];
  if (change > 0) {
    outputs.push({ address: input.senderAddress, amount: change });
  }

  const unsigned: Transaction = {
    id: input.uetr,
    inputs: selected.map((u) => ({
      previous_tx_id: u.tx_id,
      output_index: u.output_index,
      signature: null,
      public_key: null,
    })),
    outputs,
    fee,
    timestamp: input.timestamp ?? isoNowSeconds(),
    signature: null,
    metadata: {
      iso20022_ref: input.uetr,
      transaction_type: 'ISO20022_PACS008',
      compliance_node_address: null,
      compliance_screening_id: null,
      compliance_decision_hash: null,
      compliance_signature: null,
      compliance_timestamp: null,
    },
    encrypted_data: Array.from(canonicalize(input.pacs008)),
    privacy_proof: null,
    access_list: null,
  };

  return signTransactionWithSigner(input.publicKey, input.signer, unsigned);
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Convert the Rust-side `tx.timestamp.timestamp()` Unix seconds form
 *  from the wire-shape ISO 8601 string. Drops sub-second precision —
 *  matches `chrono::DateTime::timestamp() -> i64`. */
function timestampToUnixSeconds(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    throw new Error(`signingMessageV2: invalid timestamp '${iso}'`);
  }
  return Math.floor(t / 1000);
}

function isoNowSeconds(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function randomHex(len: number): string {
  const bytes = new Uint8Array(Math.ceil(len / 2));
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s.slice(0, len);
}

function uuidV4(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  // We just allocated b with length 16 so every index is in bounds; the
  // non-null assertions are required only under `noUncheckedIndexedAccess`.
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = (i: number) => b[i]!.toString(16).padStart(2, '0');
  return (
    `${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-` +
    `${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}`
  );
}

// ───────────────────────────────────────────────────────────────────────
// Wave 10 — rich remittance re-exports
// ───────────────────────────────────────────────────────────────────────

export {
  encodeRemittance, decodeRemittance, readableSummary,
  sha256Hex, buildAttachment,
  REMITTANCE_SOFT_CAP_BYTES, REMITTANCE_HARD_CAP_BYTES, INLINE_ATTACHMENT_LIMIT,
  type AntonRemittance, type AntonRemittanceItem, type AntonRemittanceAttachment,
  type EncodedRemittance,
} from './remittance.js';
