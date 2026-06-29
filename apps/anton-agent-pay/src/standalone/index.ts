/**
 * standalone/index.ts — ANTON-FutureChain Standalone gateway.
 *
 * Lets EXTERNAL AI agents (Claude Desktop / OpenCLAW / LangGraph / a cURL or
 * Python script) propose + send FTC payments under a NON-BYPASSABLE human
 * confirmation, WITHOUT the Electron desktop app. It reuses the proven Agent-Pay
 * core verbatim — the JSON-RPC server (buildServer), the MCP server
 * (buildMcpServer), the proposal state machine, the pairing/bearer auth, and the
 * real chain submit (chain.ts → @futurechain/sdk) — and adds only:
 *   • the TERMINAL approval driver (CliModalDriver) — the safety boundary, and
 *   • hard SPEND CAPS (per-payment + 24h) enforced in code before the modal.
 *
 * Transports (both funnel through the same deps + the same approval):
 *   • JSON-RPC 2.0 over HTTP on 127.0.0.1   (default — point any agent at /rpc)
 *   • MCP over stdio                          (with --mcp-stdio; Claude-Desktop style)
 *
 * Config (env):
 *   AGENT_PAY_PORT                 HTTP port (default 49250)
 *   AGENT_PAY_WALLET_DIR           wallet storage dir (default ~/.anton-fc-standalone)
 *   AGENT_PAY_MNEMONIC             BIP-39 mnemonic to import on first run (optional)
 *   AGENT_PAY_MAX_PER_PAYMENT_FTC  per-payment hard cap (optional)
 *   AGENT_PAY_MAX_DAILY_FTC        rolling-24h hard cap (optional)
 *   AGENT_PAY_NODE_URL             FutureChain RPC endpoint (chain.ts default = public RPC)
 *   AGENT_PAY_API_KEY             bearer for auth-required submit endpoints (optional)
 *
 * Run:  pnpm --filter @anton/agent-pay start:standalone
 *       (add --mcp-stdio to expose MCP over stdio for Claude Desktop)
 *
 * SECURITY: bound to 127.0.0.1 only. Every JSON-RPC call needs a bearer from the
 * pairing flow. Every payment needs a typed `y` in the operator's terminal. No
 * auto-approve, no allow-list, no spending above the caps. See ANTON_AGENT_PAY_SPEC.md.
 */
import os from 'node:os';
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setActiveModalDriver } from '../main/modal.js';
import { PairingStore } from '../main/pairing.js';
import { ProposalStore, type SpendLimits } from '../main/proposals.js';
import { buildServer, type ServerDeps } from '../main/server.js';
import { buildMcpServer } from '../main/mcp.js';
import {
  Wallet, FileStorageBackend, NoWalletError, type UnlockedWallet,
} from '../main/wallet/index.js';
import {
  getChainClient, submitPayment as chainSubmitPayment, fetchRecentTransactions,
} from '../main/chain.js';
import { TransactionLedger } from '../main/ledger.js';
import { CliModalDriver } from './cli-modal.js';
import { WebConfirmModalDriver } from './web-confirm.js';
import { registerAgentPayDashboard } from './dashboard.js';
import { attestationChainConfig } from '../main/attestation-config.js';
import { ensureEnrolled } from '../main/enrollment.js';

function num(env: string | undefined): number | undefined {
  if (env === undefined || env.trim() === '') return undefined;
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function buildWalletDeps(wallet: Wallet, ledger: TransactionLedger, storage: FileStorageBackend): Promise<Pick<ServerDeps,
  'walletStatus' | 'walletHasPassphrase' | 'recentTransactions' | 'counterpartyHint' | 'submitPayment'>> {
  // Mirrors the (non-Electron) wiring in main.ts buildDepsForBoot — reuses
  // chain.ts (getChainClient / submitPayment / fetchRecentTransactions). No
  // attestation header here (set AGENT_PAY_API_KEY for Bahnhof endpoints).
  return {
    walletStatus: async () => {
      let address: string;
      try { address = (await wallet.publicInfo()).address; }
      catch (e) {
        if (e instanceof NoWalletError) return { walletAddress: 'fc_NO_WALLET_YET', balanceFtc: 0, lastSeenBlock: 0 };
        throw e;
      }
      let balanceFtc = 0; let lastSeenBlock = 0;
      try {
        const client = getChainClient();
        const [bal, info] = await Promise.all([
          client.getBalance(address).catch(() => null),
          client.getInfo().catch(() => null),
        ]);
        if (bal) balanceFtc = bal.balance_ftc;
        if (info) lastSeenBlock = info.latest_block_height;
      } catch { /* keep the surface responsive even if the chain is unreachable */ }
      return { walletAddress: address, balanceFtc, lastSeenBlock };
    },
    walletHasPassphrase: async () => {
      try { return await wallet.hasPassphrase(); }
      catch (e) { if (e instanceof NoWalletError) return false; throw e; }
    },
    recentTransactions: async (limit) => {
      // Top up the durable ledger with best-effort fetched (received) rows,
      // then return the merged sent+received history. Returns the persisted
      // ledger even when the node is unreachable.
      try {
        const info = await wallet.publicInfo();
        const rows = await fetchRecentTransactions(info.address, limit);
        await ledger.mergeFetched(rows);
      } catch { /* keep going — the ledger still has the sends */ }
      return ledger.list(limit);
    },
    counterpartyHint: async () => null,
    submitPayment: async (req) => {
      let unlocked: UnlockedWallet;
      try { unlocked = await wallet.unlock(req.passphrase); }
      catch (e) {
        if (e instanceof NoWalletError) {
          throw new Error('no wallet configured — set AGENT_PAY_MNEMONIC (or import a wallet) before sending');
        }
        throw e;
      }
      try {
        // Attach the Bahnhof install bearer + a desktop device-attestation token
        // (X-Attestation-Token) to the submit when AGENT_PAY_API_KEY is set —
        // mirrors the Electron app (main.ts). Without it the relay's forward_auth
        // gate on /submit_signed_transaction returns 401. Local dev nodes (no
        // apiKey) submit unattested, which chain.ts explicitly supports.
        const chainConfig = attestationChainConfig(storage);
        const result = await chainSubmitPayment({
          unlocked,
          to: req.to,
          amountFtc: req.amountFtc,
          ...(req.reference !== undefined ? { reference: req.reference } : {}),
          ...(req.remittance !== undefined ? { remittance: req.remittance } : {}),
          ...(chainConfig ? { chainConfig } : {}),
        });
        // Persist the send so it survives restart + node outages. Best-effort
        // — a ledger write failure must never undo a broadcast payment.
        await ledger.recordSent({
          txId: result.txId, amount: req.amountFtc, counterparty: req.to,
          feeFtc: result.feeFtc,
          ...(req.reference !== undefined ? { reference: req.reference } : {}),
        }).catch(() => { /* non-fatal */ });
        return { txId: result.txId, feeFtc: result.feeFtc };
      } finally {
        unlocked.zero();
      }
    },
  };
}

async function main(): Promise<void> {
  const log = (s: string): void => { process.stderr.write(s + '\n'); }; // stderr only (stdout may be MCP)
  const port = num(process.env.AGENT_PAY_PORT) ?? 49250;
  const walletDir = process.env.AGENT_PAY_WALLET_DIR
    ?? path.join(os.homedir(), '.anton-fc-standalone');
  const mcpStdio = process.argv.includes('--mcp-stdio');

  const limits: SpendLimits = {
    ...(num(process.env.AGENT_PAY_MAX_PER_PAYMENT_FTC) !== undefined ? { maxPerPaymentFtc: num(process.env.AGENT_PAY_MAX_PER_PAYMENT_FTC) } : {}),
    ...(num(process.env.AGENT_PAY_MAX_DAILY_FTC) !== undefined ? { maxDailyFtc: num(process.env.AGENT_PAY_MAX_DAILY_FTC) } : {}),
  };

  // Approval mode. Terminal (typed `y` on stdin) works for the interactive
  // JSON-RPC transport. But in --mcp-stdio mode the MCP transport OWNS stdin, so
  // terminal approval can't read keystrokes → default to the browser driver
  // there. AGENT_PAY_APPROVAL=terminal|web forces either explicitly.
  const approvalEnv = (process.env.AGENT_PAY_APPROVAL ?? '').trim().toLowerCase();
  const approvalMode: 'terminal' | 'web' =
    approvalEnv === 'web' ? 'web'
    : approvalEnv === 'terminal' ? 'terminal'
    : mcpStdio ? 'web' : 'terminal';
  const webAutoOpen = (process.env.AGENT_PAY_WEB_CONFIRM_AUTOOPEN ?? '').trim().toLowerCase() === 'true';

  // One storage backend shared by the wallet (wallet.* keys) and the
  // durable transaction ledger (ledger.v1 key) — different namespaces.
  const storage = new FileStorageBackend(walletDir);
  const wallet = new Wallet(storage);
  const ledger = new TransactionLedger(storage, async () => {
    try { return (await wallet.publicInfo()).address; } catch { return null; }
  });

  // First-run import from a mnemonic, but NEVER overwrite an existing wallet.
  let walletReady = false;
  try { await wallet.publicInfo(); walletReady = true; }
  catch (e) {
    if (e instanceof NoWalletError && process.env.AGENT_PAY_MNEMONIC?.trim()) {
      const { address } = await wallet.importFromMnemonic(process.env.AGENT_PAY_MNEMONIC.trim());
      walletReady = true;
      log(`Imported wallet ${address} from AGENT_PAY_MNEMONIC.`);
    }
  }

  // Auto-enroll for the Bahnhof install bearer so ATTESTED submits work out of
  // the box (the Electron app does this; the standalone previously did not, so a
  // real submit 401'd). Skip when AGENT_PAY_API_KEY is already set or no wallet
  // exists. Best-effort — a failure leaves the gateway able to READ the chain +
  // receive; only outbound submits need the bearer + attestation.
  if (walletReady && !process.env.AGENT_PAY_API_KEY?.trim()) {
    try {
      const endpoint = process.env.AGENT_PAY_NODE_URL ?? 'https://rpc.futurechain.eu';
      const enr = await ensureEnrolled({ storage, endpoint });
      process.env.AGENT_PAY_API_KEY = enr.bearerToken;
      log(`Enrolled install ${enr.installId} for ${endpoint} — attested submits enabled.`);
    } catch (e) {
      log(`Enrollment failed — submits stay unattested (reads + receive still work): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const modal = approvalMode === 'web'
    ? new WebConfirmModalDriver({ port, now: Date.now, log, autoOpen: webAutoOpen })
    : new CliModalDriver();                      // approve in THIS terminal
  const deps: ServerDeps = {
    pairings: new PairingStore(),
    proposals: new ProposalStore(Date.now, limits),
    modal,
    ...(await buildWalletDeps(wallet, ledger, storage)),
  };
  setActiveModalDriver(deps.modal);

  const app = buildServer(deps);
  // The web driver mounts its /confirm routes on the SAME app before listen().
  if (modal instanceof WebConfirmModalDriver) modal.registerRoutes(app);
  // Local read-only settings + history dashboard at GET / (same loopback port).
  const dashboardOn = (process.env.AGENT_PAY_DASHBOARD ?? 'on').trim().toLowerCase() !== 'off';
  if (dashboardOn) registerAgentPayDashboard(app, {
    port,
    config: {
      walletReady,
      ...(limits.maxPerPaymentFtc !== undefined ? { perPaymentCap: limits.maxPerPaymentFtc } : {}),
      ...(limits.maxDailyFtc !== undefined ? { dailyCap: limits.maxDailyFtc } : {}),
      ...(process.env.AGENT_PAY_UBO_NAME?.trim() ? { uboName: process.env.AGENT_PAY_UBO_NAME.trim() } : {}),
      ...(process.env.AGENT_PAY_UBO_COUNTRY?.trim() ? { uboCountry: process.env.AGENT_PAY_UBO_COUNTRY.trim() } : {}),
      approvalMode,
      rpcEndpoint: process.env.AGENT_PAY_NODE_URL ?? 'https://rpc.futurechain.eu',
    },
    walletStatus: () => deps.walletStatus(),
    transactions: (limit) => deps.recentTransactions(limit),
  });
  await app.listen({ host: '127.0.0.1', port });
  const code = deps.pairings.newCode();

  log('════════════════════════════════════════════════════════════════');
  log(' ANTON-FutureChain Standalone — agent payment gateway');
  log('════════════════════════════════════════════════════════════════');
  log(` JSON-RPC:   http://127.0.0.1:${port}/rpc        (127.0.0.1 only)`);
  log(` Pair:       POST http://127.0.0.1:${port}/pair`);
  log(` Pair code:  ${code}    (valid 60s)`);
  log(` Wallet:     ${walletReady ? 'ready' : 'NONE — read-only (set AGENT_PAY_MNEMONIC to send)'}`);
  log(` Caps:       per-payment ${limits.maxPerPaymentFtc ?? '∞'} FTC · 24h ${limits.maxDailyFtc ?? '∞'} FTC`);
  if (approvalMode === 'web') {
    log(' Approval:   BROWSER — each payment prints a one-time confirm URL to THIS');
    log('             terminal; open it and click Approve/Reject. No bypass.');
    if (webAutoOpen) log('             (auto-open enabled)');
  } else {
    log(' Approval:   every payment needs a typed "y" in THIS terminal — no bypass');
  }
  log(` Dashboard:  ${dashboardOn ? `http://127.0.0.1:${port}/   (settings + history, read-only)` : 'off'}`);
  if (mcpStdio) log(' MCP:        stdio enabled (stdout reserved for MCP).');
  log('════════════════════════════════════════════════════════════════');

  if (mcpStdio) {
    const mcp = buildMcpServer(deps);
    await mcp.connect(new StdioServerTransport());
  }
}

main().catch((e) => {
  process.stderr.write(`[anton-fc-standalone] startup failed: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
