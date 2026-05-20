/**
 * pacs008.test.ts — Phase 1 conformance suite for tx signing.
 *
 * Loads the v2 conformance vectors (`test-vectors/conformance.v1.json`,
 * `schema_version: 2`) emitted by
 *   futurechain/src/bin/generate_conformance_vectors.rs
 * and asserts byte-equality for each canonical transaction:
 *   • `signing_message_v2` string — pipe-delimited canonical
 *   • SHA-256 of the canonical bytes
 *   • Ed25519 signature of that SHA-256 with the canonical signer wallet
 *
 * Plus a positive verify round-trip on a freshly signed minimal tx.
 *
 * If any of these diverge, the SDK's TS signing cannot be trusted to
 * produce a Transaction that the Rust core will accept — every wire path
 * downstream (RpcClient.submitSignedTransaction → mempool → block
 * validation) would silently reject.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  buildPacs008,
  canonicalize,
  Pacs008Builder,
  hash as pacs008Hash,
  signingMessageV2,
  signingMessageV2Hash,
  signTransaction,
  verifyTransactionSignature,
  type Transaction,
} from './index.js';
import {
  seedPhraseFromMnemonic,
  walletFromPrivateKey,
  walletFromSeedPhrase,
} from '../wallet/index.js';

// ───────────────────────────────────────────────────────────────────────
// Load vectors
// ───────────────────────────────────────────────────────────────────────

interface TxVector {
  name: string;
  description: string;
  signer_priv_key_hex: string;
  signer_pub_key_hex: string;
  signer_address: string;
  tx: Transaction;
  signing_message_v2: string;
  signing_message_v2_sha256_hex: string;
  signature_hex: string;
}
interface VectorsFile {
  schema_version: number;
  transactions: TxVector[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const VECTORS_PATH = resolve(HERE, '../../test-vectors/conformance.v1.json');
const file: VectorsFile = JSON.parse(readFileSync(VECTORS_PATH, 'utf8'));
if (file.schema_version < 2) {
  throw new Error(
    `pacs008.test: vectors schema_version ${file.schema_version} < 2 — ` +
      `regenerate via the Rust bin`,
  );
}
if (!file.transactions || file.transactions.length === 0) {
  throw new Error('pacs008.test: no `transactions` array in vectors file');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

// ───────────────────────────────────────────────────────────────────────
// signing_message_v2 conformance
// ───────────────────────────────────────────────────────────────────────

for (const v of file.transactions) {
  describe(`Phase 1 — tx-signing conformance — ${v.name}`, () => {
    it('signingMessageV2(tx) byte-exact', () => {
      expect(signingMessageV2(v.tx)).toBe(v.signing_message_v2);
    });

    it('signingMessageV2Hash(tx) byte-exact', () => {
      const h = signingMessageV2Hash(v.tx);
      expect(bytesToHex(h)).toBe(v.signing_message_v2_sha256_hex);
    });

    it('signing the message hash with the canonical wallet → byte-exact signature', () => {
      const wallet = walletFromPrivateKey(hexToBytes(v.signer_priv_key_hex));
      // Sanity: pubkey + address must match what the Rust side emitted.
      expect(bytesToHex(wallet.publicKey)).toBe(v.signer_pub_key_hex);
      expect(wallet.address).toBe(v.signer_address);

      const signed = signTransaction(wallet, v.tx);
      expect(signed.signature).not.toBeNull();
      expect(bytesToHex(Uint8Array.from(signed.signature!))).toBe(v.signature_hex);
    });

    it('signTransaction places the same signature on tx + every input', () => {
      const wallet = walletFromPrivateKey(hexToBytes(v.signer_priv_key_hex));
      const signed = signTransaction(wallet, v.tx);

      const sigHex = bytesToHex(Uint8Array.from(signed.signature!));
      const pubHex = bytesToHex(wallet.publicKey);

      for (const input of signed.inputs) {
        expect(input.signature).not.toBeNull();
        expect(input.public_key).not.toBeNull();
        expect(bytesToHex(Uint8Array.from(input.signature!))).toBe(sigHex);
        expect(bytesToHex(Uint8Array.from(input.public_key!))).toBe(pubHex);
      }
    });

    it('verifyTransactionSignature accepts the canonical signature', () => {
      // Build a tx with the canonical sig already attached.
      const txWithSig: Transaction = {
        ...v.tx,
        signature: Array.from(hexToBytes(v.signature_hex)),
      };
      const pub = hexToBytes(v.signer_pub_key_hex);
      expect(verifyTransactionSignature(txWithSig, pub)).toBe(true);
    });

    it('verifyTransactionSignature rejects a mutated input (signature locks inputs)', () => {
      const wallet = walletFromPrivateKey(hexToBytes(v.signer_priv_key_hex));
      const signed = signTransaction(wallet, v.tx);
      // Same wallet; sig is valid as-is.
      expect(verifyTransactionSignature(signed, wallet.publicKey)).toBe(true);
      // Mutate the fee — signature must no longer verify.
      const tampered: Transaction = { ...signed, fee: signed.fee + 1 };
      expect(verifyTransactionSignature(tampered, wallet.publicKey)).toBe(false);
    });
  });
}

// ───────────────────────────────────────────────────────────────────────
// PACS.008 builder smoke tests
// ───────────────────────────────────────────────────────────────────────

describe('pacs008 — builder + canonicalize/hash', () => {
  it('Pacs008Builder produces a wire-shape message with all required nodes', () => {
    const msg = new Pacs008Builder()
      .debtor({ name: 'Sender AB', accountId: 'fc_TestSender0000000000000000000000' })
      .creditor({ name: 'Receiver AB', accountId: 'fc_TestReceiver00000000000000000000' })
      .amountFtc(1.0)
      .uetr('11111111-2222-3333-4444-555555555555')
      .remittance('Test payment')
      .build();

    // Spot-check: the shape regression_test_suite.py asserts.
    const doc = (msg as { document: { FIToFICstmrCdtTrf: any } }).document.FIToFICstmrCdtTrf;
    expect(doc.GrpHdr.NbOfTxs).toBe('1');
    expect(doc.CdtTrfTxInf[0].PmtId.UETR).toBe('11111111-2222-3333-4444-555555555555');
    expect(doc.CdtTrfTxInf[0].Dbtr.Nm).toBe('Sender AB');
    expect(doc.CdtTrfTxInf[0].Cdtr.Nm).toBe('Receiver AB');
    expect(doc.CdtTrfTxInf[0].IntrBkSttlmAmt.$value).toBe(1.0);
    expect(doc.CdtTrfTxInf[0].RmtInf.Ustrd[0]).toBe('Test payment');

    expect((msg as { futurechain_metadata: { network_id: string } }).futurechain_metadata.network_id).toBe('mainnet');
  });

  it('buildPacs008 auto-generates a UETR when one is not provided', () => {
    const msg = buildPacs008({
      debtor: { name: 'A', accountId: 'fc_a' },
      creditor: { name: 'B', accountId: 'fc_b' },
      amountFtc: 0.01,
    });
    const u = (msg as { document: { FIToFICstmrCdtTrf: { CdtTrfTxInf: any[] } } })
      .document.FIToFICstmrCdtTrf.CdtTrfTxInf[0].PmtId.UETR;
    // UUID v4 shape: 8-4-4-4-12 hex with version=4 + RFC 4122 variant.
    expect(typeof u).toBe('string');
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('Pacs008Builder rejects missing required fields', () => {
    expect(() => new Pacs008Builder().build()).toThrow(/debtor required/);
    expect(() =>
      new Pacs008Builder()
        .debtor({ name: 'X', accountId: 'fc_x' })
        .build(),
    ).toThrow(/creditor required/);
    expect(() =>
      new Pacs008Builder()
        .debtor({ name: 'X', accountId: 'fc_x' })
        .creditor({ name: 'Y', accountId: 'fc_y' })
        .build(),
    ).toThrow(/amountFtc required/);
  });

  it('canonicalize + hash are deterministic for the same input', () => {
    const msg1 = buildPacs008({
      debtor: { name: 'A', accountId: 'fc_a' },
      creditor: { name: 'B', accountId: 'fc_b' },
      amountFtc: 0.5,
      uetr: 'fixed-uetr-for-test',
    });
    // Build a second message with the same UETR. Other auto-generated fields
    // (InstrId, EndToEndId, TxId, CreDtTm) differ — so canonicalize() of two
    // builds is NOT identical. We test determinism on a single call's output.
    const bytes = canonicalize(msg1);
    const bytesAgain = canonicalize(msg1);
    expect(bytes.length).toBe(bytesAgain.length);
    for (let i = 0; i < bytes.length; i++) expect(bytes[i]).toBe(bytesAgain[i]);
    expect(bytesToHex(pacs008Hash(msg1))).toBe(bytesToHex(pacs008Hash(msg1)));
  });
});

// ───────────────────────────────────────────────────────────────────────
// End-to-end: builder → tx with encrypted_data → sign → verify
// ───────────────────────────────────────────────────────────────────────

describe('pacs008 — end-to-end build + sign + verify', () => {
  it('a freshly-built PACS.008 tx signs and verifies round-trip', () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon ' +
      'abandon abandon abandon abandon abandon abandon abandon abandon ' +
      'abandon abandon abandon abandon abandon abandon abandon art';
    const phrase = seedPhraseFromMnemonic(mnemonic);
    const wallet = walletFromSeedPhrase(phrase, 0, 0);

    const pacs = new Pacs008Builder()
      .debtor({ name: 'Test Sender', accountId: wallet.address })
      .creditor({ name: 'Test Receiver', accountId: 'fc_TestReceiver00000000000000000000' })
      .amountFtc(0.01)
      .uetr('e2e-test-uetr')
      .build();

    const tx: Transaction = {
      id: '',
      inputs: [{
        previous_tx_id: '0'.repeat(64),
        output_index: 0,
        signature: null,
        public_key: null,
      }],
      outputs: [{
        address: 'fc_TestReceiver00000000000000000000',
        amount: 1_000_000,
      }],
      fee: 100,
      timestamp: '2026-05-20T12:00:00Z',
      signature: null,
      metadata: {
        iso20022_ref: 'e2e-test-uetr',
        transaction_type: 'ISO20022_PACS008',
        compliance_node_address: null,
        compliance_screening_id: null,
        compliance_decision_hash: null,
        compliance_signature: null,
        compliance_timestamp: null,
      },
      encrypted_data: Array.from(canonicalize(pacs)),
      privacy_proof: null,
      access_list: null,
    };

    const signed = signTransaction(wallet, tx);
    expect(signed.signature).not.toBeNull();
    expect(verifyTransactionSignature(signed, wallet.publicKey)).toBe(true);

    // The original tx was not mutated.
    expect(tx.signature).toBeNull();
    expect(tx.inputs[0].signature).toBeNull();
  });
});
