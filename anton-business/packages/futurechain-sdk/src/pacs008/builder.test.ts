/**
 * builder.test.ts — Transaction builder tests.
 *
 * Verifies:
 *   • greedy UTXO selection picks largest-first until target met
 *   • change output is added iff totalIn > target
 *   • tx.metadata.transaction_type = 'ISO20022_PACS008', iso20022_ref = UETR
 *   • tx.id = UETR (per PACS.008 protocol)
 *   • tx.encrypted_data = canonical bytes of the Pacs008Message
 *   • signTransaction's dual-placement: same sig on tx + every input
 *   • verifyTransactionSignature round-trips
 *   • insufficient funds throws cleanly
 */
import { describe, it, expect } from 'vitest';
import {
  buildPacs008,
  buildSignedPacs008Transaction,
  canonicalize,
  selectUtxosGreedy,
  signingMessageV2,
  verifyTransactionSignature,
  type UtxoLike,
} from './index.js';
import { seedPhraseFromMnemonic, walletFromSeedPhrase } from '../wallet/index.js';

// Convenient deterministic test wallet — same mnemonic as the conformance
// vector A, account 0 index 0. Address: fc_VCjDhTr82jbLnhPh9bPpwLAwya6UnE6Q2H
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon ' +
  'abandon abandon abandon abandon abandon abandon abandon abandon ' +
  'abandon abandon abandon abandon abandon abandon abandon art';
const TEST_PHRASE = seedPhraseFromMnemonic(TEST_MNEMONIC);
const TEST_WALLET = walletFromSeedPhrase(TEST_PHRASE, 0, 0);

function utxo(tx: string, idx: number, amount: number): UtxoLike {
  return { tx_id: tx, output_index: idx, amount };
}

// ───────────────────────────────────────────────────────────────────────
// selectUtxosGreedy
// ───────────────────────────────────────────────────────────────────────

describe('selectUtxosGreedy', () => {
  it('picks largest-first until the target is met', () => {
    const utxos = [utxo('a', 0, 50), utxo('b', 0, 200), utxo('c', 0, 100)];
    const picked = selectUtxosGreedy(utxos, 150);
    // Sort would put 200 first → meets 150 with just one UTXO.
    expect(picked).toHaveLength(1);
    expect(picked[0]!.amount).toBe(200);
  });

  it('picks multiple UTXOs when the largest alone is not enough', () => {
    const utxos = [utxo('a', 0, 100), utxo('b', 0, 200), utxo('c', 0, 150)];
    const picked = selectUtxosGreedy(utxos, 350);
    expect(picked).toHaveLength(2); // 200 + 150 = 350
    expect(picked.reduce((s, u) => s + u.amount, 0)).toBe(350);
  });

  it('throws on insufficient funds', () => {
    const utxos = [utxo('a', 0, 50), utxo('b', 0, 30)];
    expect(() => selectUtxosGreedy(utxos, 1000)).toThrow(/insufficient funds/);
  });

  it('rejects non-positive target', () => {
    expect(() => selectUtxosGreedy([utxo('a', 0, 100)], 0)).toThrow(/target/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// buildSignedPacs008Transaction — end-to-end builder
// ───────────────────────────────────────────────────────────────────────

describe('buildSignedPacs008Transaction', () => {
  function pacs() {
    return buildPacs008({
      debtor: { name: 'Sender', accountId: TEST_WALLET.address },
      creditor: { name: 'Receiver', accountId: 'fc_TestReceiver00000000000000000000' },
      amountFtc: 0.01,
      uetr: 'fixed-uetr-builder-test',
    });
  }

  it('produces a tx with all fields set correctly', () => {
    const tx = buildSignedPacs008Transaction({
      wallet: TEST_WALLET,
      utxos: [utxo('aa', 0, 1_000_000), utxo('bb', 0, 500_000)],
      recipient: 'fc_TestReceiver00000000000000000000',
      amountSatoshi: 1_000_000,
      feeSatoshi: 100,
      pacs008: pacs(),
      uetr: 'fixed-uetr-builder-test',
      timestamp: '2026-05-20T00:00:00Z',
    });

    expect(tx.id).toBe('fixed-uetr-builder-test');
    expect(tx.metadata?.transaction_type).toBe('ISO20022_PACS008');
    expect(tx.metadata?.iso20022_ref).toBe('fixed-uetr-builder-test');
    expect(tx.fee).toBe(100);
    expect(tx.timestamp).toBe('2026-05-20T00:00:00Z');

    // greedy: target = amount + fee = 1_000_000 + 100 = 1_000_100. The
    // largest UTXO (1_000_000) is just under target → both UTXOs are
    // picked (1_000_000 + 500_000 = 1_500_000) → 2 inputs, change 499_900.
    expect(tx.inputs).toHaveLength(2);
    expect(tx.inputs[0]!.previous_tx_id).toBe('aa');
    expect(tx.outputs).toHaveLength(2);
    expect(tx.outputs[1]!.amount).toBe(499_900);
  });

  it('correctly handles greedy selection across multiple UTXOs + change', () => {
    const tx = buildSignedPacs008Transaction({
      wallet: TEST_WALLET,
      utxos: [utxo('aa', 0, 1_000_000), utxo('bb', 0, 500_000), utxo('cc', 0, 200_000)],
      recipient: 'fc_TestReceiver00000000000000000000',
      amountSatoshi: 1_000_000,
      feeSatoshi: 100,
      pacs008: pacs(),
      uetr: 'fixed-uetr-multi-utxo',
    });
    // target = 1_000_100 sat. Largest UTXO (1_000_000) is not enough → take
    // the next largest (500_000) → totalIn = 1_500_000.
    expect(tx.inputs).toHaveLength(2);
    expect(tx.outputs).toHaveLength(2);
    expect(tx.outputs[0]!.address).toBe('fc_TestReceiver00000000000000000000');
    expect(tx.outputs[0]!.amount).toBe(1_000_000);
    // Change = totalIn − amount − fee = 1_500_000 − 1_000_000 − 100 = 499_900.
    expect(tx.outputs[1]!.amount).toBe(499_900);
    expect(tx.outputs[1]!.address).toBe(TEST_WALLET.address);
  });

  it('omits the change output when totalIn == amount + fee exactly', () => {
    const tx = buildSignedPacs008Transaction({
      wallet: TEST_WALLET,
      utxos: [utxo('aa', 0, 100_100)],
      recipient: 'fc_TestReceiver00000000000000000000',
      amountSatoshi: 100_000,
      feeSatoshi: 100,
      pacs008: pacs(),
      uetr: 'fixed-uetr-no-change',
    });
    expect(tx.outputs).toHaveLength(1);
    expect(tx.outputs[0]!.amount).toBe(100_000);
  });

  it('attaches the wallet signature on tx + every input (dual placement)', () => {
    const tx = buildSignedPacs008Transaction({
      wallet: TEST_WALLET,
      utxos: [utxo('aa', 0, 5_000_000), utxo('bb', 0, 5_000_000)],
      recipient: 'fc_TestReceiver00000000000000000000',
      amountSatoshi: 8_000_000,
      feeSatoshi: 100,
      pacs008: pacs(),
      uetr: 'fixed-uetr-dual-sig',
    });
    expect(tx.signature).not.toBeNull();
    expect(tx.signature!.length).toBe(64);
    for (const input of tx.inputs) {
      expect(input.signature).not.toBeNull();
      expect(input.signature!.length).toBe(64);
      expect(input.public_key).not.toBeNull();
      expect(input.public_key!.length).toBe(32);
      // Same signature on every input + tx.
      expect(input.signature).toEqual(tx.signature);
    }
    // Verification round-trip.
    expect(verifyTransactionSignature(tx, TEST_WALLET.publicKey)).toBe(true);
  });

  it('encrypted_data equals canonicalize(pacs008)', () => {
    const p = pacs();
    const tx = buildSignedPacs008Transaction({
      wallet: TEST_WALLET,
      utxos: [utxo('aa', 0, 5_000_000)],
      recipient: 'fc_TestReceiver00000000000000000000',
      amountSatoshi: 1_000_000,
      feeSatoshi: 100,
      pacs008: p,
      uetr: 'fixed-uetr-enc-data',
    });
    const expected = Array.from(canonicalize(p));
    expect(tx.encrypted_data).toEqual(expected);
  });

  it('produces a stable signing_message_v2 string for a fixed input', () => {
    const tx = buildSignedPacs008Transaction({
      wallet: TEST_WALLET,
      utxos: [utxo('aa', 0, 5_000_000)],
      recipient: 'fc_TestReceiver00000000000000000000',
      amountSatoshi: 1_000_000,
      feeSatoshi: 100,
      pacs008: pacs(),
      uetr: 'fixed-uetr-stable',
      timestamp: '2026-05-20T00:00:00Z',
    });
    const msg = signingMessageV2(tx);
    // Sanity: known prefix shape. '2026-05-20T00:00:00Z' = 1779235200
    // Unix seconds. (The Rust conformance generator uses a DIFFERENT
    // wall-clock timestamp — 1779220800 ≡ 2026-05-19T20:00:00Z — so the
    // numeric prefix differs from the txv_* vectors. signingMessageV2's
    // byte-exactness against Rust is asserted in pacs008.test.ts against
    // those vectors; this test is for the JS-builder side.)
    expect(msg).toMatch(/^aa:0\|fc_TestReceiver00000000000000000000:1000000,fc_VCjDhTr82jbLnhPh9bPpwLAwya6UnE6Q2H:\d+\|100\|1779235200\|/);
    expect(msg.split('|')).toHaveLength(6);
  });

  it('rejects invalid inputs', () => {
    const args = {
      wallet: TEST_WALLET,
      utxos: [utxo('aa', 0, 100)],
      recipient: 'fc_r',
      pacs008: pacs(),
      uetr: 'u',
    };
    expect(() =>
      buildSignedPacs008Transaction({ ...args, amountSatoshi: 0 }),
    ).toThrow(/amountSatoshi/);
    expect(() =>
      buildSignedPacs008Transaction({ ...args, amountSatoshi: 100, feeSatoshi: -1 }),
    ).toThrow(/fee/);
    expect(() =>
      buildSignedPacs008Transaction({ ...args, amountSatoshi: 1_000_000_000 }),
    ).toThrow(/insufficient/);
  });
});
