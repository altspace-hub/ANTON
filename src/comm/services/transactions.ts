/**
 * transactions.ts — wallet transaction ledger.
 *
 * Records every FTC transaction the Comm App's wallet touches —
 * sends, receives, swaps, refunds. The tax engine in
 * @futurechain/sdk/tax (Phase 1+) consumes this ledger to compute
 * per-jurisdiction position + annual reports.
 *
 * Schema choices, traceable to FUTURECHAIN_TAX_RULES.md:
 *
 *   - `id`: stable per-tx primary key. UUID-style, locally generated.
 *   - `ts`: unix-ms of the disposal event. The tax engine uses this
 *     for cost-basis ordering (FIFO/AVERAGE), holding-period checks
 *     (DE/PT 1-year rules) and tax-year bucketing.
 *   - `kind`: the taxable-event taxonomy from §4 of the spec, namespaced
 *     here so the engine can map kind → taxable_events[kind] per
 *     jurisdiction.
 *   - `amountMicroFtc`: stored as a string because bigint isn't safe
 *     in structured-clone across all browsers (same workaround as the
 *     Business app's receipts.ts).
 *   - `fiatValueAtTx` + `fiatCurrency`: the SEK (or EUR, USD…) value
 *     at the moment of the disposal. Per §5 pseudocode the engine
 *     needs this for the gain/loss calc.
 *   - `ref`: the v1-encoded FTC reference (per ADR-004) if this was a
 *     merchant payment. Indexed so refunds can be linked back per §7.4.
 *   - `txHash`: the FutureChain network tx hash once confirmed. Null
 *     for pending / locally-only-confirmed entries.
 *   - `jurisdictionAtTx`: the user's declared residency at the time of
 *     the disposal. Locked in at record time so historic txs aren't
 *     retroactively recomputed if the user later changes residency.
 *
 * The ledger is on-device only. The spec is explicit: tax data is
 * privacy-sensitive; computation is local; export to advisers is the
 * only egress path.
 */
import type { Pacs008Draft } from './pacs008-draft';
import {
  openDb,
  STORE_WALLET_TXS,
  INDEX_WALLET_BY_TS,
} from './db';
import {
  deriveBehaviorProfile, type BehaviorEvent, type BehaviorProfile,
} from './behavior-profile';
import type { FraudAssessment } from './fraud-engine';

/** Taxable-event taxonomy mirroring FUTURECHAIN_TAX_RULES.md §4. */
export type WalletTxKind =
  | 'send'              // outbound — spend on goods/services or P2P transfer
  | 'receive'           // inbound — receive_as_payment or P2P transfer
  | 'swap'              // crypto-to-crypto (FR: not taxable; most others: taxable)
  | 'refund_sent'       // outbound refund cancelling a prior receive
  | 'refund_received'   // inbound refund cancelling a prior send
  | 'stake_reward'      // staking income — varies wildly by jurisdiction
  | 'airdrop'           // airdrop income
  | 'fee';              // network fee — informational, not a disposal

export interface WalletTx {
  id: string;
  ts: number;
  kind: WalletTxKind;
  /** The other party in the transaction — counterparty address, merchant
   *  id, or human label. */
  counterparty: string;
  /** Microunit amount, serialized as a base-10 string for IDB safety. */
  amountMicroFtc: string;
  /** Fiat value at the moment of the disposal — what the tax engine
   *  uses to compute gain/loss. */
  fiatValueAtTx: number;
  /** ISO-4217 currency code for `fiatValueAtTx`. */
  fiatCurrency: string;
  /** v1 FTC reference (ADR-004) if this was a merchant payment, else null. */
  ref: string | null;
  /** On-chain hash once confirmed; null for pending. */
  txHash: string | null;
  /** User's declared tax residency at record time (ISO 3166-1 alpha-2). */
  jurisdictionAtTx: string | null;
  /** Optional free-text note the user attached. */
  note?: string;
  /** Optional link back to the originating tx for refunds. */
  refundOf?: string;
  /** ISO 20022 PACS.008 draft assembled at confirmation time from the
   *  payer's saved identity + the scanned creditor party. Optional —
   *  txs recorded before the payment-identity feature, or from a QR
   *  with no ADR-004 v1 reference, omit it. Schemaless-safe: adding an
   *  optional record field needs no IndexedDB version bump. */
  pacs008?: Pacs008Draft;
  /** Light fraud-engine assessment computed at send time from the
   *  money + behaviour baselines. Advisory only — the engine never
   *  blocked this send. Optional: receives + txs recorded before the
   *  fraud engine omit it. Schemaless-safe — no IndexedDB version
   *  bump needed for an added optional record field. */
  risk?: FraudAssessment;
}

export type NewWalletTx = Omit<WalletTx, 'id' | 'ts'> & {
  ts?: number;
  id?: string;
};

/** Persist a wallet transaction. Returns the stored row. */
export async function recordTx(input: NewWalletTx): Promise<WalletTx> {
  const row: WalletTx = {
    id: input.id ?? generateTxId(),
    ts: input.ts ?? Date.now(),
    kind: input.kind,
    counterparty: input.counterparty,
    amountMicroFtc: input.amountMicroFtc,
    fiatValueAtTx: input.fiatValueAtTx,
    fiatCurrency: input.fiatCurrency,
    ref: input.ref,
    txHash: input.txHash,
    jurisdictionAtTx: input.jurisdictionAtTx,
    note: input.note,
    refundOf: input.refundOf,
    pacs008: input.pacs008,
    risk: input.risk,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_WALLET_TXS, 'readwrite');
    tx.objectStore(STORE_WALLET_TXS).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return row;
}

/** Update the on-chain hash + ts of a previously-recorded tx (e.g.
 *  once the RPC poller observes the inbound PACS.008). */
export async function confirmTx(id: string, txHash: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_WALLET_TXS, 'readwrite');
    const store = tx.objectStore(STORE_WALLET_TXS);
    const req = store.get(id);
    req.onsuccess = () => {
      const row = req.result as WalletTx | undefined;
      if (!row) {
        resolve();
        return;
      }
      store.put({ ...row, txHash });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** List the most recent transactions, newest first. */
export async function listTxs(limit = 100): Promise<WalletTx[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WALLET_TXS, 'readonly');
    const idx = tx.objectStore(STORE_WALLET_TXS).index(INDEX_WALLET_BY_TS);
    const req = idx.openCursor(null, 'prev');
    const out: WalletTx[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && out.length < limit) {
        out.push(cursor.value as WalletTx);
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/** Normalise an outbound wallet tx into a behaviour event. */
function txToEvent(tx: WalletTx): BehaviorEvent {
  let amountMicroFtc = 0n;
  try { amountMicroFtc = BigInt(tx.amountMicroFtc); } catch { /* keep 0n */ }
  return {
    amountMicroFtc,
    counterparty: tx.counterparty,
    purpose: '', // Comm wallet txs carry no ADR-004 purpose
    at: tx.ts,
  };
}

/** Derive the user's behaviour profile from their outbound wallet
 *  history. `now` is injectable for tests; defaults to the wall clock. */
export async function loadBehaviorProfile(now?: number): Promise<BehaviorProfile> {
  const txs = await listTxs(1000);
  const events = txs.filter((t) => t.kind === 'send').map(txToEvent);
  return deriveBehaviorProfile(events, now);
}

/** All txs in a closed [from, to] inclusive ts range. Used by the
 *  annual-report exporter once the tax engine ships. */
export async function listTxsByRange(fromTs: number, toTs: number): Promise<WalletTx[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WALLET_TXS, 'readonly');
    const idx = tx.objectStore(STORE_WALLET_TXS).index(INDEX_WALLET_BY_TS);
    const range = IDBKeyRange.bound(fromTs, toTs);
    const req = idx.openCursor(range, 'next');
    const out: WalletTx[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        out.push(cursor.value as WalletTx);
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/** Running balance in micro-FTC (sum of receives − sum of sends).
 *  Convenience for the wallet header until on-chain balance queries
 *  land. */
export async function computeBalanceMicroFtc(): Promise<bigint> {
  const txs = await listTxs(10000);
  let balance = 0n;
  for (const t of txs) {
    const amt = BigInt(t.amountMicroFtc);
    if (t.kind === 'receive' || t.kind === 'refund_received' || t.kind === 'stake_reward' || t.kind === 'airdrop') {
      balance += amt;
    } else if (t.kind === 'send' || t.kind === 'refund_sent' || t.kind === 'fee') {
      balance -= amt;
    }
    // 'swap' nets zero in FTC terms; the swap counterparty asset
    // lives outside this ledger.
  }
  return balance;
}

function generateTxId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
