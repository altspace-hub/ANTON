import type { DatabaseAdapter } from '../db/database.js';
import type { FCWalletService } from './fc-wallet-service.js';
import { Pacs008Builder, buildSignedPacs008Transaction, type UtxoLike } from '@futurechain/sdk/pacs008';
import { RpcClient, type SubmitResult } from '@futurechain/sdk/rpc';

/**
 * fc-transaction-service — Phase 2 (May 20 2026).
 *
 * Same public API as the stub (`buildTransaction`, `submitTransaction`,
 * `listTransactions`, `getTransaction`) so existing callers
 * (`mission-budget.ts::executePayment`, route handlers, etc.) stay
 * unchanged. The decision between stub and real path is made per call
 * via the FC connection config (`stub_mode` column), the same way
 * `fc-wallet-service` does it.
 *
 * STUB MODE (legacy):
 *   • `submitTransaction` writes a fake `STUB_TX_…` id and immediately
 *     marks the row as `confirmed`. No network I/O.
 *
 * REAL MODE (Phase 2):
 *   • Loads the signing wallet via `fcWallet.getDecryptedWallet`.
 *   • Fetches UTXOs via `RpcClient.getUtxos(fromAddress)`.
 *   • Builds a `Pacs008Message` via the SDK builder.
 *   • Builds + signs a Transaction via
 *     `buildSignedPacs008Transaction(...)` (greedy UTXO selection +
 *     change + dual signature placement; txid = UETR).
 *   • POSTs to `/submit_signed_transaction`. Stores the returned
 *     status / tx_id / request_id immediately.
 *   • Spawns a confirmation poller that watches
 *     `/transaction/{uetr}` every 5 s for up to 5 min, flipping the
 *     row to `confirmed` (or `failed`) when the chain catches up.
 *
 * Status transitions (real mode):
 *   draft → submitted (server returned 'queued' or 'accepted')
 *          → confirmed (poller found the tx on-chain)
 *          → failed    (server returned 'rejected' OR poller timeout)
 *
 * `mission-budget.ts::executePayment` was updated to treat
 * 'submitted' / 'pending' / 'queued' / 'confirmed' as in-flight success
 * (i.e. not a failure), so the payment is considered "settled" the
 * moment the network accepts the tx for screening — not only after
 * mining.
 */

const COMPONENT = 'fc-transaction-service';
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface FCConnectionConfig {
  node_url: string | null;
  stub_mode: boolean;
}

interface TxRow {
  id: string;
  tx_id: string | null;
  uetr: string | null;
  from_address: string;
  to_address: string;
  amount_ftc: number;
  amount_raw: number | string;
  wallet_type: 'human' | 'agent';
  status: string;
  pacs008_fields: string | null;
  remittance_raw: string | null;
  task_ref: string | null;
  submission_method: string | null;
}

export interface SubmitTransactionResult {
  /** Internal row id (always present). */
  txId: string;
  /** Real on-chain id (= UETR for PACS.008) — present once the tx has
   *  been POSTed. */
  uetr?: string;
  /** Server-returned status envelope:
   *  - 'confirmed'  — stub mode, or a Full node admitted to mempool
   *  - 'submitted'  — real mode, server accepted; poller will flip to
   *                    'confirmed' on-chain inclusion
   *  - 'queued'     — Phase 0.5 P2P forward acknowledged
   *  - 'pending'    — server response shape unrecognised — poller will
   *                    still watch
   *  - 'rejected'   — server refused (signature, validation, compliance)
   *  - 'error'      — local exception before POST (no network round-trip)
   */
  status: 'confirmed' | 'submitted' | 'queued' | 'pending' | 'rejected' | 'error';
  /** Phase 0.5 P2P forward request_id (light-hub submissions only). */
  request_id?: string;
  /** Free-text reason on rejection / error. */
  reason?: string;
}

export async function createFCTransactionService(
  db: DatabaseAdapter,
  // Phase 2 dependencies — when omitted, behaves like the legacy stub.
  fcWallet?: FCWalletService,
  getConnectionConfig?: () => Promise<FCConnectionConfig | undefined>,
) {
  function buildRemittance(purpose: string, nature: string, goal: string, taskRef?: string) {
    let rem = `P:${purpose} N:${nature} G:${goal}`;
    if (taskRef) rem += ` T:${taskRef}`;
    return rem.slice(0, 140);
  }

  async function shouldUseStub(): Promise<boolean> {
    if (!getConnectionConfig || !fcWallet) return true;
    const cfg = await getConnectionConfig();
    if (!cfg) return true;
    if (cfg.stub_mode === false && cfg.node_url) return false;
    return true;
  }

  // ─── buildTransaction — DB draft row, unchanged from the stub ─────

  async function buildTransaction(params: {
    fromAddress: string; toAddress: string; amountFtc: number;
    walletType: 'human' | 'agent';
    purpose?: string; nature?: string; goal?: string; taskRef?: string;
  }) {
    const id = `fctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const amountRaw = Math.round(params.amountFtc * 100_000_000);
    const remittance = buildRemittance(
      params.purpose ?? 'OTHR',
      params.nature ?? 'payment',
      params.goal ?? 'service',
      params.taskRef,
    );
    const pacs008Draft = {
      senderAddress: params.fromAddress,
      receiverAddress: params.toAddress,
      amount: params.amountFtc,
      purpose: params.purpose ?? 'OTHR',
      nature: params.nature ?? 'payment',
      goal: params.goal ?? 'service',
      taskRef: params.taskRef,
    };

    await db.run(
      `INSERT INTO fc_transactions (id, from_address, to_address, amount_ftc, amount_raw, wallet_type, status, pacs008_fields, remittance_raw, task_ref, submission_method)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, 'pending')`,
      id, params.fromAddress, params.toAddress, params.amountFtc, amountRaw,
      params.walletType, JSON.stringify(pacs008Draft), remittance, params.taskRef ?? null,
    );
    return { id, status: 'draft' as const };
  }

  // ─── submitTransaction — Phase 2 real path ────────────────────────

  async function submitTransaction(txId: string): Promise<SubmitTransactionResult> {
    if (await shouldUseStub()) {
      // Legacy stub — unchanged.
      const stubTxId = `STUB_TX_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(
        `UPDATE fc_transactions
         SET status = 'confirmed', tx_id = ?, submitted_at = NOW(), confirmed_at = NOW(), submission_method = 'stub'
         WHERE id = ?`,
        stubTxId, txId,
      );
      return { txId, uetr: stubTxId, status: 'confirmed' };
    }

    return await submitTransactionReal(txId);
  }

  async function submitTransactionReal(txId: string): Promise<SubmitTransactionResult> {
    const row = await db.get<TxRow>('SELECT * FROM fc_transactions WHERE id = ?', txId);
    if (!row) {
      throw new Error(`${COMPONENT}.submitTransaction: tx row ${txId} not found`);
    }
    const cfg = await getConnectionConfig!();
    const nodeUrl = cfg?.node_url;
    if (!nodeUrl) {
      await markStatus(txId, 'failed', 'node_url not configured');
      return { txId, status: 'error', reason: 'node_url not configured' };
    }

    // Resolve the signing wallet from the from_address.
    const senderRow = await fcWallet!.getWalletByAddress(row.from_address);
    if (!senderRow) {
      const reason = `sender wallet ${row.from_address} not found in fc_wallets`;
      await markStatus(txId, 'failed', reason);
      return { txId, status: 'error', reason };
    }
    if ((senderRow.sdk_schema_version ?? 1) < 2) {
      const reason = `sender wallet ${row.from_address} is a stub (sdk_schema_version=${senderRow.sdk_schema_version}); cannot real-sign — re-create the wallet in real mode`;
      await markStatus(txId, 'failed', reason);
      return { txId, status: 'error', reason };
    }

    let signingWallet;
    try {
      signingWallet = await fcWallet!.getDecryptedWallet(senderRow.id);
    } catch (e) {
      const reason = `cannot decrypt sender wallet: ${(e as Error).message}`;
      await markStatus(txId, 'failed', reason);
      return { txId, status: 'error', reason };
    }

    const client = new RpcClient({ endpoint: nodeUrl, timeoutMs: 15_000 });

    // Fetch UTXOs.
    let utxos: UtxoLike[];
    try {
      const fetched = await client.getUtxos(row.from_address);
      utxos = fetched.map((u) => ({ tx_id: u.tx_id, output_index: u.output_index, amount: u.amount }));
    } catch (e) {
      const reason = `failed to fetch UTXOs: ${(e as Error).message}`;
      await markStatus(txId, 'failed', reason);
      return { txId, status: 'error', reason };
    }

    if (utxos.length === 0) {
      const reason = `sender wallet ${row.from_address} has no UTXOs on chain (balance = 0)`;
      await markStatus(txId, 'failed', reason);
      return { txId, status: 'error', reason };
    }

    // Build the PACS.008 message + signed tx.
    const draft = row.pacs008_fields ? (JSON.parse(row.pacs008_fields) as Record<string, unknown>) : {};
    const uetr = (draft['uetr'] as string | undefined) ?? makeUetr();
    const pacs = new Pacs008Builder()
      .debtor({ name: 'ANTON', accountId: row.from_address })
      .creditor({ name: 'ANTON Recipient', accountId: row.to_address })
      .amountFtc(row.amount_ftc)
      .uetr(uetr)
      .remittance(row.remittance_raw ?? '')
      .build();

    let signedTx;
    try {
      signedTx = buildSignedPacs008Transaction({
        wallet: signingWallet,
        utxos,
        recipient: row.to_address,
        amountSatoshi: Number(row.amount_raw),
        feeSatoshi: 100,
        pacs008: pacs,
        uetr,
      });
    } catch (e) {
      const reason = `builder failed: ${(e as Error).message}`;
      await markStatus(txId, 'failed', reason);
      return { txId, status: 'error', reason };
    }

    // POST.
    let response: SubmitResult;
    try {
      response = await client.submitSignedTransaction(signedTx);
    } catch (e) {
      const reason = `POST /submit_signed_transaction failed: ${(e as Error).message}`;
      await markStatus(txId, 'failed', reason);
      return { txId, status: 'error', reason };
    }

    const responseStatus = (response.status ?? '').toString().toLowerCase();
    let dbStatus: string;
    let outcome: SubmitTransactionResult['status'];
    let reason: string | undefined;

    if (responseStatus === 'accepted' || responseStatus === 'confirmed') {
      dbStatus = 'submitted';
      outcome = 'submitted';
    } else if (responseStatus === 'queued' || responseStatus === 'pending') {
      dbStatus = 'submitted';
      outcome = responseStatus === 'queued' ? 'queued' : 'pending';
    } else if (responseStatus === 'rejected') {
      dbStatus = 'rejected';
      outcome = 'rejected';
      reason = response.error ?? response.reason ?? 'rejected by node';
    } else {
      // Unrecognised response shape — likely an error envelope without a
      // `status` field (e.g. {error: "UTXO not found"}).
      dbStatus = 'failed';
      outcome = 'rejected';
      reason = response.error ?? response.reason ?? JSON.stringify(response).slice(0, 200);
    }

    await db.run(
      `UPDATE fc_transactions
       SET status = ?, tx_id = ?, uetr = ?, submitted_at = NOW(),
           submission_method = 'sdk',
           pacs008_fields = ?
       WHERE id = ?`,
      dbStatus,
      response.tx_id ?? uetr,
      uetr,
      JSON.stringify({ ...draft, uetr, request_id: response.request_id, response_status: responseStatus, reason }),
      txId,
    );

    if (dbStatus === 'submitted') {
      // Spawn the confirmation poller — fire-and-forget.
      void watchUntilConfirmed(txId, uetr, client).catch((e) => {
        console.warn(`[${COMPONENT}] poller failed for ${txId}/${uetr}: ${(e as Error).message}`);
      });
    } else if (dbStatus === 'rejected' || dbStatus === 'failed') {
      console.warn(`[${COMPONENT}] tx ${txId} rejected: ${reason}`);
    }

    return {
      txId,
      uetr,
      status: outcome,
      request_id: response.request_id,
      reason,
    };
  }

  // ─── Confirmation poller ──────────────────────────────────────────

  async function watchUntilConfirmed(txId: string, uetr: string, client: RpcClient): Promise<void> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      let txEnvelope: unknown;
      try {
        txEnvelope = await client.getTransaction(uetr);
      } catch {
        continue; // network blip — try again
      }
      const env = txEnvelope as Record<string, unknown> | null;
      if (!env) continue;

      // Two possible response shapes from the Rust /transaction/{id}:
      //   { error: "Transaction not found" }     → not yet on chain
      //   { tx: { … }, block_height: N }         → mined
      //   { ... fields of the tx with block info } → mined (some node configs)
      if (typeof env['error'] === 'string') {
        // Not found yet — keep polling.
        continue;
      }
      const blockHeight =
        (env['block_height'] as number | undefined) ??
        (env['blockHeight'] as number | undefined) ??
        ((env['tx'] as Record<string, unknown> | undefined)?.['block_height'] as number | undefined);
      if (typeof blockHeight === 'number' && blockHeight > 0) {
        await db.run(
          'UPDATE fc_transactions SET status = ?, confirmed_at = NOW() WHERE id = ?',
          'confirmed', txId,
        );
        console.log(`[${COMPONENT}] tx ${txId} confirmed at height ${blockHeight}`);
        return;
      }
      // Tx visible but not yet mined (still in some node's mempool view)
      // — keep polling.
    }
    await db.run(
      'UPDATE fc_transactions SET status = ? WHERE id = ? AND status = ?',
      'failed', txId, 'submitted',
    );
    console.warn(`[${COMPONENT}] tx ${txId} confirmation timeout after ${POLL_TIMEOUT_MS}ms`);
  }

  // ─── Read helpers ─────────────────────────────────────────────────

  async function listTransactions(filters?: { status?: string; limit?: number }) {
    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    if (filters?.status) { where += ' AND status = ?'; params.push(filters.status); }
    params.push(filters?.limit ?? 50);
    return await db.all(
      `SELECT * FROM fc_transactions ${where} ORDER BY created_at DESC LIMIT ?`,
      ...params,
    );
  }
  async function getTransaction(id: string) {
    return await db.get('SELECT * FROM fc_transactions WHERE id = ?', id);
  }

  // ─── Utilities ────────────────────────────────────────────────────

  async function markStatus(txId: string, status: string, reason: string): Promise<void> {
    await db.run(
      'UPDATE fc_transactions SET status = ?, pacs008_fields = COALESCE(pacs008_fields, \'\') || ? WHERE id = ?',
      status, `\n[fail-reason] ${reason}`, txId,
    );
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  function makeUetr(): string {
    // RFC 4122 v4 UUID. Browser + Node 20+ have `crypto.randomUUID`.
    return (globalThis.crypto?.randomUUID?.() ?? require('node:crypto').randomUUID()) as string;
  }

  return {
    buildRemittance,
    buildTransaction,
    submitTransaction,
    listTransactions,
    getTransaction,
  };
}
export type FCTransactionService = Awaited<ReturnType<typeof createFCTransactionService>>;
