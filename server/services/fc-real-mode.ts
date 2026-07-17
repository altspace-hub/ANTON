/**
 * fc-real-mode.ts — construct the FC wallet + transaction services WITH their
 * real-mode dependencies (2026-07-17).
 *
 * createFCWalletService / createFCTransactionService take optional
 * getConnectionConfig + fcWallet deps and HARD-RETURN stub behavior when they
 * are omitted ("if (!getConnectionConfig) return true" in shouldUseStub). Until
 * now only mission-budget.ts passed them — every HTTP route constructed the
 * services bare, so setting fc_connection_config.stub_mode = FALSE was a no-op
 * for the desktop/companion/gateway payment paths and submits kept fake-
 * confirming with STUB_TX_ ids. This helper is the single place that wires the
 * deps; route factories use it instead of the bare constructors.
 */
import type { DatabaseAdapter } from '../db/database.js';
import type { FCWalletService } from './fc-wallet-service.js';
import type { FCTransactionService } from './fc-transaction-service.js';

export interface FCConnectionSnapshot {
  node_url: string | null;
  stub_mode: boolean;
}

export interface RealModeFCServices {
  fcWallet: FCWalletService;
  fcTx: FCTransactionService;
  /** Operator connection config (stub_mode defaults TRUE when unset). */
  getCfg: () => Promise<FCConnectionSnapshot | undefined>;
  /** True when the operator has switched to real mode AND a node URL is set. */
  isRealMode: () => Promise<boolean>;
}

export async function createRealModeFCServices(db: DatabaseAdapter): Promise<RealModeFCServices> {
  const { createFCConnectionService } = await import('./fc-connection-service.js');
  const { createFCWalletService } = await import('./fc-wallet-service.js');
  const { createFCTransactionService } = await import('./fc-transaction-service.js');
  const fcConn = await createFCConnectionService(db);
  const getCfg = async (): Promise<FCConnectionSnapshot | undefined> => {
    const c = (await fcConn.getConfig()) as Record<string, unknown> | undefined;
    if (!c) return undefined;
    return {
      node_url: (c['node_url'] as string | null | undefined) ?? null,
      stub_mode: c['stub_mode'] !== false, // default TRUE if undefined
    };
  };
  const fcWallet = await createFCWalletService(db, getCfg);
  const fcTx = await createFCTransactionService(db, fcWallet, getCfg);
  const isRealMode = async (): Promise<boolean> => {
    const cfg = await getCfg();
    return !!cfg && cfg.stub_mode === false && !!cfg.node_url;
  };
  return { fcWallet, fcTx, getCfg, isRealMode };
}
