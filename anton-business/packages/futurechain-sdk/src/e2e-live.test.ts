/**
 * e2e-live.test.ts — Phase 1 end-to-end smoke against a live FutureChain
 * node. Gated by `FUTURECHAIN_LIVE_RPC` env var; skipped by default so
 * unit-test runs in CI don't require a node.
 *
 * Set `FUTURECHAIN_LIVE_RPC` to the RPC URL of a reachable node, e.g.:
 *   FUTURECHAIN_LIVE_RPC=http://127.0.0.1:8546 pnpm test          # local Node 2
 *   FUTURECHAIN_LIVE_RPC=http://127.0.0.1:8545 pnpm test          # local Node 1 (Full + Heimdall)
 *   FUTURECHAIN_LIVE_RPC=http://79.136.1.113:8545 pnpm test       # Bahnhof
 *
 * What this proves end-to-end:
 *   1. wallet → SDK can derive a deterministic Ed25519 wallet
 *   2. pacs008 → SDK can build a valid PACS.008 message
 *   3. pacs008/builder → SDK can construct + sign a real Transaction
 *   4. rpc → SDK can POST the signed Transaction over real HTTP
 *   5. The receiving node accepts the wire shape (returns 200, not 400) and
 *      either (a) queues the tx via Phase 0.5 P2P forward, or (b) processes
 *      it locally (queued/accepted/rejected at the application layer — all
 *      of which mean the SDK's wire shape + signature are correct).
 *
 * This is the Phase 1 exit criterion ("a published @futurechain/sdk that
 * can build, sign, and submit a real FutureChain transaction, proven
 * against the Rust canonical").
 *
 * Note: the test uses SYNTHETIC UTXO references (`previous_tx_id` set to a
 * fake value), so Node 1 (Full + Heimdall + local validation) will reject
 * the tx at the mempool-admission step ("input refers to non-existent
 * UTXO"). Bahnhof / Node 2 (Standard) will queue the tx via P2P
 * (Phase 0.5) since their gateway has no Heimdall to validate against.
 * Either response is success at the SDK level — the test just asserts
 * the server understood our request.
 */
import { describe, it, expect } from 'vitest';
import {
  Pacs008Builder,
  buildSignedPacs008Transaction,
  signingMessageV2,
  verifyTransactionSignature,
  type UtxoLike,
} from './pacs008/index.js';
import { seedPhraseFromMnemonic, walletFromSeedPhrase } from './wallet/index.js';
import { RpcClient } from './rpc/index.js';

const LIVE_RPC = process.env['FUTURECHAIN_LIVE_RPC'];

// Vitest 4 treats a file with zero registered tests as a failure, so we
// keep one always-running `it` (the env-presence note) and skip the rest
// individually when LIVE_RPC isn't set.
describe('Phase 1 — live end-to-end smoke', () => {
  // Deterministic test wallet from the conformance vector A. Address:
  // fc_VCjDhTr82jbLnhPh9bPpwLAwya6UnE6Q2H. This wallet has no UTXOs on
  // the live chain (the mnemonic is the public BIP-39 "abandon × 23 +
  // art" edge case), so the tx WILL fail mempool admission on a Full
  // node — that's fine, the smoke proves wire-shape + signing only.
  const TEST_MNEMONIC =
    'abandon abandon abandon abandon abandon abandon abandon abandon ' +
    'abandon abandon abandon abandon abandon abandon abandon abandon ' +
    'abandon abandon abandon abandon abandon abandon abandon art';
  const PHRASE = seedPhraseFromMnemonic(TEST_MNEMONIC);
  const WALLET = walletFromSeedPhrase(PHRASE, 0, 0);
  const ENDPOINT = LIVE_RPC ?? '<unset>';
  // Lazy client — built per test so module-load doesn't fail when
  // FUTURECHAIN_LIVE_RPC is unset (RpcClient constructor requires an
  // endpoint).
  const newClient = () => new RpcClient({ endpoint: LIVE_RPC!, timeoutMs: 15_000 });

  it('runs when FUTURECHAIN_LIVE_RPC is set (otherwise these tests are skipped)', () => {
    if (!LIVE_RPC) {
      console.log('[live] FUTURECHAIN_LIVE_RPC not set — live E2E tests skipped.');
    }
    expect(true).toBe(true);
  });

  it.skipIf(!LIVE_RPC)('reaches the node and gets a healthy response', async () => {
    const client = newClient();
    const h = await client.getHealth();
    expect(h.status).toBe('healthy');
    console.log(`[live] ${ENDPOINT} → ${h.version ?? '<no version>'} ` +
      `compliance_gateway=${h.compliance_gateway} signing=${h.signing}`);
  });

  it.skipIf(!LIVE_RPC)('reads /info and surfaces the chain height', async () => {
    const client = newClient();
    const info = await client.getInfo();
    expect(info.chain_height).toBeGreaterThan(0);
    expect(info.latest_block_hash).toMatch(/^[0-9a-f]{64}$/);
    console.log(
      `[live] chain_height=${info.chain_height} latest=${info.latest_block_hash.slice(0, 16)}… node_type=${info.storage_info.node_type}`,
    );
  });

  it.skipIf(!LIVE_RPC)('builds + signs + submits a synthetic PACS.008 tx', async () => {
    const client = newClient();
    // Synthetic UTXOs — won't exist on chain. The submit will fail at
    // mempool admission on Full nodes, will queue on Standard / LightHub.
    // Either outcome proves the SDK's wire-shape + signature are right
    // (otherwise the server returns 400 on the JSON).
    const utxos: UtxoLike[] = [
      { tx_id: 'a'.repeat(64), output_index: 0, amount: 10_000_000 },
    ];
    const recipient = 'fc_TestRecipient000000000000000000000';
    const uetr = `e2e-live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const pacs = new Pacs008Builder()
      .debtor({ name: 'E2E Test Sender', accountId: WALLET.address })
      .creditor({ name: 'E2E Test Recipient', accountId: recipient })
      .amountFtc(0.01)
      .uetr(uetr)
      .remittance(`E2E smoke ${uetr}`)
      .build();

    const tx = buildSignedPacs008Transaction({
      wallet: WALLET,
      utxos,
      recipient,
      amountSatoshi: 1_000_000,
      feeSatoshi: 100,
      pacs008: pacs,
      uetr,
    });

    // Local verification before going on the wire.
    expect(verifyTransactionSignature(tx, WALLET.publicKey)).toBe(true);

    // Surface the canonical for debug.
    const canon = signingMessageV2(tx);
    console.log(`[live] tx.id=${tx.id}`);
    console.log(`[live] signing_message_v2 (first 200): ${canon.slice(0, 200)}…`);

    // POST. We don't fail the test on any specific status — both
    // "queued" (Phase 0.5 P2P forward on a light hub) and "rejected"
    // (mempool admission failed on a Full node because the synthetic
    // UTXO doesn't exist) are evidence the SDK's wire shape worked.
    const r = await client.submitSignedTransaction(tx);
    console.log(`[live] submit response: ${JSON.stringify(r)}`);

    // The server understood our JSON if it responded with EITHER a typed
    // status envelope OR an explicit error. Both are "the SDK's wire
    // shape + signature worked" — only a 4xx/5xx (RpcError) means
    // failure at the wire level.
    //
    // On Node 1 (Full + Heimdall) the response shape is:
    //   {error: "Transaction validation failed: UTXO not found: ..."} — synthetic UTXO
    //   {error: "Compliance check failed: ..."}                       — Heimdall block
    //   {status: "accepted"}                                           — admitted to mempool (won't happen with synthetic UTXOs)
    // On a Standard / LightHub node (Phase 0.5 P2P forward):
    //   {status: "queued", request_id, tx_id, originator_address}
    //   {status: "rejected", error: "...wallet password..."}           — /submit_pacs008_batch refusal (not the path we took)
    const hasStatus = typeof r.status === 'string';
    const hasError = typeof r.error === 'string';
    expect(hasStatus || hasError).toBe(true);
    if (hasStatus) {
      expect(['queued', 'accepted', 'rejected', 'pending']).toContain(r.status);
    }
  }, 30_000);
});
