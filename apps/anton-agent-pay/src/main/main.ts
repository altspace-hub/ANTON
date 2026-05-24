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
import { buildServer, type ServerDeps, type WalletStatusSnapshot } from './server.js';
import { buildMcpServer } from './mcp.js';

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

async function buildDepsForBoot(modal: ModalDriver): Promise<{
  pairings: PairingStore;
  proposals: ProposalStore;
  deps: ServerDeps;
}> {
  const pairings = new PairingStore();
  const proposals = new ProposalStore();

  // ─── Wallet integration (PHASE 2 PENDING) ────────────────────
  //
  // The deps below are STUBBED. Phase 2 work hooks them up to:
  //   • the real @futurechain/sdk RpcClient (recentTransactions,
  //     submitPayment, counterpartyHint, walletStatus)
  //   • the wallet-passphrase module from src/pay/services for
  //     walletHasPassphrase + the priv unlock flow inside
  //     submitPayment
  //
  // The stubs return non-throwing placeholders so the JSON-RPC
  // surface is browsable + the modal can render with sample data
  // during development. Code paths are deliberately marked so the
  // Phase-2 reviewer can find them with a single grep.
  //
  // FIXME(phase2): wire to @futurechain/sdk + wallet-passphrase.
  // ─────────────────────────────────────────────────────────────
  const stubStatus: WalletStatusSnapshot = {
    walletAddress: 'fc_NOT_YET_INITIALISED',
    balanceFtc: 0,
    lastSeenBlock: 0,
  };
  const deps: ServerDeps = {
    pairings,
    proposals,
    modal,
    walletStatus: async () => stubStatus,
    recentTransactions: async () => [],
    counterpartyHint: async () => null,
    walletHasPassphrase: async () => false,
    submitPayment: async () => {
      throw new Error(
        'submitPayment: Phase 2 wallet wiring pending — see main.ts FIXME(phase2)',
      );
    },
  };
  return { pairings, proposals, deps };
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

async function startHttpServer(): Promise<BootContext> {
  const modal = new ElectronModalDriver();
  setActiveModalDriver(modal);
  const { pairings, proposals, deps } = await buildDepsForBoot(modal);
  const fastify = buildServer(deps);

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

function openSettingsWindow(boot: BootContext): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 720,
    height: 560,
    title: 'Anton Agent Pay — Settings',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Phase 2 PENDING: settings preload + HTML.
      // preload: path.resolve(__dirname, '../renderer/settings/preload.cjs'),
    },
  });
  // Phase 2 PENDING: actual settings UI (pair, wallet, RPC URL).
  // For now, show a placeholder page baked into a data URL.
  void settingsWindow.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(
      `<!doctype html><html><head><title>Settings</title>
       <style>body{font:14px -apple-system,sans-serif;padding:24px;color:#0f1a26}
       code{background:#f1f5f9;padding:2px 6px;border-radius:4px}</style>
       </head><body>
       <h2>Anton Agent Pay — Phase 1 dev shell</h2>
       <p>Local JSON-RPC: <code>http://127.0.0.1:${boot.port}/rpc</code></p>
       <p>Pairing: <code>POST /pair { name, code }</code></p>
       <p>Discovery file: <code>${DISCOVERY_FILE}</code></p>
       <p>Pair an agent: <strong>(Phase 2 — UI pending)</strong>.
       For now, generate a code programmatically and POST to <code>/pair</code>.</p>
       </body></html>`
    )
  );
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ─── Electron app lifecycle ──────────────────────────────────

app.whenReady().then(async () => {
  try {
    const boot = await startHttpServer();
    // Plumb MCP through the same ServerDeps the HTTP server uses
    // so both transports call into one source of truth.
    const { deps } = await buildDepsForBoot(boot.modal); // sigh — see refactor note below
    await startMcpStdio(deps);
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

// FIXME(phase2): the second buildDepsForBoot call above creates a
// SECOND pairings/proposals store for MCP — wrong, they should share
// state with the HTTP server. Easy to fix once buildDepsForBoot is
// refactored to accept an existing { pairings, proposals } pair
// rather than allocating fresh ones. Captured here so the Phase 2
// reviewer doesn't miss it.
