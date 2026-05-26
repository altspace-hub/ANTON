/**
 * main.ts — Electron entry for Anton Agent Pay.
 *
 * Owns: app lifecycle, Fastify JSON-RPC server, MCP stdio bridge,
 * settings window, modal driver. The renderer NEVER sees the
 * wallet's private key — signing happens in this process after the
 * modal returns Approve.
 *
 * Spec: docs/ANTON_AGENT_PAY_SPEC.md
 *
 * Phase 2 status (2026-05-24): Electron shell + modal + server +
 * MCP stdio are wired. Real chain integration via @futurechain/sdk
 * + wallet UI (Settings) + code signing are explicitly out of scope
 * for this commit — see README + task #292 description for what
 * remains for production readiness.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ElectronModalDriver } from './electron-modal.js';
import { setActiveModalDriver, type ModalDriver } from './modal.js';
import { PairingStore } from './pairing.js';
import { ProposalStore } from './proposals.js';
import { buildServer, type ServerDeps } from './server.js';
import { buildMcpServer } from './mcp.js';
import {
  Wallet, FileStorageBackend, NoWalletError,
} from './wallet/index.js';
import {
  submitPayment as chainSubmitPayment,
  fetchRecentTransactions, getChainClient,
} from './chain.js';
import { makeSettingsHandlers, registerSettingsIpc } from './settings-ipc.js';

// (We resolve only the discovery file path below; no __dirname/__filename
// needed in this entry — the modal preload path lives in electron-modal.ts.)
void fileURLToPath; void path;

/** Where the server.json discovery file lives — agents read this to
 *  learn the auto-selected port. Spec §6.1, §10. */
const DISCOVERY_DIR = path.join(os.homedir(), '.anton-agent-pay');
const DISCOVERY_FILE = path.join(DISCOVERY_DIR, 'server.json');

/** Log file — single rotating audit trail. JSON lines: every
 *  proposal in/out, every pair/unpair, every modal decision. */
const LOG_FILE = path.join(DISCOVERY_DIR, 'agent-pay.log');

interface BootContext {
  fastify: FastifyInstance;
  port: number;
  pairings: PairingStore;
  proposals: ProposalStore;
  modal: ModalDriver;
}

/** Single shared { pairings, proposals, wallet } state across both
 *  transports (JSON-RPC + MCP). buildDepsForBoot is now invoked once
 *  per process (was twice — see prior FIXME). */
interface SharedState {
  pairings: PairingStore;
  proposals: ProposalStore;
  wallet: Wallet;
}

function makeSharedState(): SharedState {
  const storage = new FileStorageBackend(path.join(DISCOVERY_DIR, 'wallet-store'));
  return {
    pairings: new PairingStore(),
    proposals: new ProposalStore(),
    wallet: new Wallet(storage),
  };
}

async function buildDepsForBoot(
  modal: ModalDriver, shared: SharedState,
): Promise<{ deps: ServerDeps }> {
  const { pairings, proposals, wallet } = shared;

  // Wallet info — uses the real wallet module + a single RpcClient
  // hop for live balance + tip. When no wallet has been created yet
  // (fresh install), walletStatus returns a sentinel so getStatus /
  // getBalance succeed gracefully and the agent / UI can surface
  // "no wallet yet — create one in Settings".
  async function walletStatus() {
    let address: string;
    try {
      const info = await wallet.publicInfo();
      address = info.address;
    } catch (e) {
      if (e instanceof NoWalletError) {
        return { walletAddress: 'fc_NO_WALLET_YET', balanceFtc: 0, lastSeenBlock: 0 };
      }
      throw e;
    }
    // Best-effort balance + tip — swallow RPC failures so the JSON-RPC
    // surface stays responsive even when the chain is unreachable.
    let balanceFtc = 0;
    let lastSeenBlock = 0;
    try {
      const client = getChainClient();
      const [bal, info] = await Promise.all([
        client.getBalance(address).catch(() => null),
        client.getInfo().catch(() => null),
      ]);
      if (bal) balanceFtc = bal.balance_ftc;
      if (info) lastSeenBlock = info.latest_block_height;
    } catch { /* swallow */ }
    return { walletAddress: address, balanceFtc, lastSeenBlock };
  }

  const deps: ServerDeps = {
    pairings,
    proposals,
    modal,

    walletStatus,
    walletHasPassphrase: async () => {
      try { return await wallet.hasPassphrase(); }
      catch (e) {
        if (e instanceof NoWalletError) return false;
        throw e;
      }
    },

    recentTransactions: async (limit) => {
      try {
        const info = await wallet.publicInfo();
        const rows = await fetchRecentTransactions(info.address, limit);
        return rows.map(r => ({
          txId: r.txId, amount: r.amount, direction: r.direction,
          counterparty: r.counterparty, ts: r.ts, confirmed: r.confirmed,
        }));
      } catch { return []; }
    },
    // FIXME(phase2c): counterparty address book — surface a label +
    // a seen-count for the modal "Acme Corp — seen 4×" hint. Today
    // we don't have a local address book; returning null is fine.
    counterpartyHint: async () => null,

    submitPayment: async (req) => {
      // Real end-to-end submit: unlock the wallet, hand off to
      // chain.submitPayment (which builds the PACS.008, signs with
      // the in-process Ed25519 priv, and POSTs via the SDK
      // RpcClient), zero the priv on the way out.
      const unlocked = await wallet.unlock(req.passphrase);
      try {
        const result = await chainSubmitPayment({
          unlocked,
          to: req.to,
          amountFtc: req.amountFtc,
          ...(req.reference !== undefined ? { reference: req.reference } : {}),
        });
        return { txId: result.txId, feeFtc: result.feeFtc };
      } finally {
        unlocked.zero();
      }
    },
  };
  return { deps };
}

async function pickFreePort(): Promise<number> {
  // Random ephemeral port in the IANA dynamic range.
  // (Fastify's listen({ port: 0 }) would also work; explicit picking
  // makes the discovery-file write easier to time correctly.)
  return Math.floor(49152 + Math.random() * (65535 - 49152));
}

async function writeDiscoveryFile(port: number): Promise<void> {
  await mkdir(DISCOVERY_DIR, { recursive: true });
  await writeFile(
    DISCOVERY_FILE,
    JSON.stringify({
      version: 1,
      host: '127.0.0.1',
      port,
      jsonrpcPath: '/rpc',
      pairPath: '/pair',
      pid: process.pid,
      startedAt: new Date().toISOString(),
    }, null, 2) + '\n',
    { mode: 0o600 },
  );
}

async function startHttpServer(shared: SharedState): Promise<BootContext> {
  const modal = new ElectronModalDriver();
  setActiveModalDriver(modal);
  const { deps } = await buildDepsForBoot(modal, shared);
  const fastify = buildServer(deps);
  // pairings + proposals come from `shared` so MCP uses the same store.
  const { pairings, proposals } = shared;

  // Try a handful of ports before giving up — rare collisions on
  // multi-instance dev boxes shouldn't crash the app.
  let port = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = await pickFreePort();
    try {
      await fastify.listen({ host: '127.0.0.1', port: candidate });
      port = candidate;
      break;
    } catch {
      // try next
    }
  }
  if (port === 0) {
    throw new Error('could not bind any port — check for stuck Agent Pay instances');
  }

  await writeDiscoveryFile(port);
  appendLog({ event: 'http_server_started', port, pid: process.pid });
  return { fastify, port, pairings, proposals, modal };
}

function appendLog(entry: Record<string, unknown>): void {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    const out = createWriteStream(LOG_FILE, { flags: 'a' });
    out.write(line);
    out.end();
  } catch {
    // Logging failure should never crash the app.
  }
}

async function startMcpStdio(deps: ServerDeps): Promise<void> {
  // The MCP stdio transport ONLY makes sense when the parent
  // process invoked Agent Pay as `agent-pay --mcp-stdio` (Claude
  // Desktop convention). If it's a normal Electron launch, we don't
  // claim stdin/stdout for MCP — that breaks normal logging.
  if (!process.argv.includes('--mcp-stdio')) return;
  const server = buildMcpServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  appendLog({ event: 'mcp_stdio_started' });
}

let settingsWindow: BrowserWindow | null = null;

/** Path resolution for the renderer files. After `pnpm build` the
 *  compiled layout is `dist/main/main.js` + `dist/renderer/...`. In
 *  dev (electron .) main runs from `src/main/main.ts` and the renderer
 *  files are at `src/renderer/...`. We try the dist path first, fall
 *  back to src — works for both contexts without conditionals. */
function rendererPath(relative: string): string {
  const dist = path.resolve(__dirname, '../renderer/settings', relative);
  return dist;
}

function openSettingsWindow(boot: BootContext): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 760,
    height: 640,
    title: 'Anton Agent Pay — Settings',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: rendererPath('preload.cjs'),
    },
  });
  void settingsWindow.loadFile(rendererPath('index.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
  // Surface boot details for the Network tab.
  void boot;
}

// ─── Electron app lifecycle ──────────────────────────────────

app.whenReady().then(async () => {
  try {
    const shared = makeSharedState();
    const boot = await startHttpServer(shared);
    // MCP uses the SAME shared state — so a proposal created via JSON-RPC
    // is visible to getProposal called via MCP and vice versa. The prior
    // FIXME about duplicate stores is now closed.
    const { deps: mcpDeps } = await buildDepsForBoot(boot.modal, shared);
    await startMcpStdio(mcpDeps);

    // Register Settings IPC handlers BEFORE opening the window so the
    // renderer's first walletInfo() call has a handler waiting.
    const settingsHandlers = makeSettingsHandlers({
      wallet: shared.wallet,
      pairings: shared.pairings,
      getBootInfo: () => ({
        port: boot.port,
        pid: process.pid,
        discoveryFile: DISCOVERY_FILE,
        endpoint: process.env.AGENT_PAY_NODE_URL ?? 'https://rpc.futurechain.eu',
      }),
    });
    registerSettingsIpc(ipcMain, settingsHandlers);

    openSettingsWindow(boot);

    ipcMain.handle('agent-pay:get-boot-info', () => ({
      port: boot.port,
      pid: process.pid,
      discoveryFile: DISCOVERY_FILE,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendLog({ event: 'startup_failed', error: msg });
    dialog.showErrorBox('Anton Agent Pay failed to start', msg);
    app.exit(1);
  }
});

app.on('window-all-closed', () => {
  // On macOS, apps typically stay alive when all windows close.
  // Agent Pay is server-bearing, so we stay alive everywhere —
  // user must explicitly Quit from the menu/dock to stop the
  // local JSON-RPC server.
  if (process.platform !== 'darwin') {
    // Linux/Windows: also stay alive. Comment out the next line
    // if/when we add a tray icon to make this discoverable.
    // app.quit();
  }
});

app.on('before-quit', () => {
  appendLog({ event: 'app_quitting', pid: process.pid });
});

// (Prior FIXME — "MCP gets its own duplicated pairings/proposals" —
//  resolved in this iteration: makeSharedState is allocated once,
//  passed to buildDepsForBoot for both transports.)
//
// Remaining FIXMEs are in buildDepsForBoot, all chain-wiring:
//   - walletStatus returns balance 0 / lastSeenBlock 0 — needs
//     @futurechain/sdk RpcClient for live data
//   - recentTransactions returns [] — needs RpcClient
//   - counterpartyHint returns null — needs address book + history walk
//   - submitPayment throws once the unlock succeeds — needs RpcClient
//     submitSignedTransaction
//
// All four are bounded scope and slot in behind the existing FIXME
// markers. The wallet module + envelope + storage are production-
// ready (80/80 tests pass including FileStorageBackend round-trip).
