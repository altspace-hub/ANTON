/**
 * index.ts — headless Anton Collaboration gateway.
 *
 * A local, agent-callable program (JSON-RPC over 127.0.0.1 + optional MCP over
 * stdio) that lets an external AI agent DISCOVER businesses in the .anton
 * registry, resolve their commerce capabilities, TALK to them (inquire / order),
 * and reach a SIGNED two-party AGREEMENT (cryptographic mutual assent) behind a
 * human-approval gate. Legs 1-4 of the agent-to-agent commerce loop
 * (docs/AGENT_COLLABORATION_COMMERCE_PLAN.md); SETTLE (bridge to Agent Pay) and
 * the negotiation orchestrator arrive in later phases.
 *
 * Run:  pnpm --filter @anton/collaboration start:standalone [--mcp-stdio]
 * Env:  ANTON_COLLAB_PORT (default 49260) · ANTON_COLLAB_RELAY_BASE
 *       ANTON_COLLAB_CONTACT_HASH · ANTON_COLLAB_STORE_DIR
 *       ANTON_COLLAB_ALLOW_INSECURE_ORIGIN (dev sellers over http)
 *
 * stdout is reserved for MCP; all logs go to stderr.
 *
 * Human gate: in JSON-RPC mode (no --mcp-stdio) stdin is free, so committing
 * verbs (proposeAgreement / acceptAgreement / counterAgreement) prompt on the
 * terminal (CliModalDriver). Under --mcp-stdio stdin/stdout belong to MCP, so
 * there is NO approval driver and committing verbs FAIL CLOSED until the
 * web-confirm driver lands (read / inbound / discovery / talk verbs still work).
 */
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PairingStore } from '../main/pairing.js';
import { buildServer, type ServerDeps, type BuildServerOptions } from '../main/server.js';
import { buildMcpServer } from '../main/mcp.js';
import type { DiscoveryConfig } from '../main/discovery.js';
import { FileStorageBackend } from '../main/storage.js';
import { AgreementStore } from '../main/agreement-store.js';
import { AgreementIdentity } from '../main/agreement-identity.js';
import { AgreementEngine } from '../main/agreement-engine.js';
import { AgreementProposalStore } from '../main/agreement-proposals.js';
import { CliModalDriver } from '../main/modal.js';

function num(env: string | undefined): number | undefined {
  if (env === undefined || env.trim() === '') return undefined;
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function main(): Promise<void> {
  const log = (s: string): void => { process.stderr.write(s + '\n'); };
  const port = num(process.env.ANTON_COLLAB_PORT) ?? 49260;
  const mcpStdio = process.argv.includes('--mcp-stdio');
  const relayBase = process.env.ANTON_COLLAB_RELAY_BASE?.trim();

  const discovery: DiscoveryConfig | undefined = relayBase ? { base: relayBase } : undefined;
  const buyerContactHash = process.env.ANTON_COLLAB_CONTACT_HASH?.trim();

  // Durable store for the signing identity + the agreement rows.
  const storeDir = process.env.ANTON_COLLAB_STORE_DIR?.trim()
    || path.join(os.homedir(), '.anton-collaboration', 'store');
  const storage = new FileStorageBackend(storeDir);
  const identity = new AgreementIdentity(storage);
  const engine = new AgreementEngine(new AgreementStore(storage), identity);
  const approvals = new AgreementProposalStore();

  // The human-approval driver — terminal prompt in JSON-RPC mode only.
  let rl: readline.Interface | undefined;
  let modal: CliModalDriver | undefined;
  if (!mcpStdio) {
    rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    modal = new CliModalDriver(rl);
  }

  const deps: ServerDeps = {
    pairings: new PairingStore(),
    engine, approvals,
    ...(discovery ? { discovery } : {}),
    ...(buyerContactHash ? { buyerContactHash } : {}),
    ...(modal ? { modal } : {}),
  };

  // MCP clients send no Origin; the in-process MCP path bypasses the HTTP origin
  // check entirely. The HTTP server keeps the loopback origin allowlist.
  const opts: BuildServerOptions = {};
  const app = buildServer(deps, opts);
  await app.listen({ host: '127.0.0.1', port });
  const code = deps.pairings.newCode();
  const agreementPubkey = await identity.pubkey();

  log('════════════════════════════════════════════════════════════════');
  log(' Anton Collaboration — agent discovery · talk · sign agreements');
  log('════════════════════════════════════════════════════════════════');
  log(` JSON-RPC:   http://127.0.0.1:${port}/rpc        (127.0.0.1 only)`);
  log(` Pair:       POST http://127.0.0.1:${port}/pair`);
  log(` Pair code:  ${code}    (valid 60s)`);
  log(` Registry:   ${discovery?.base ?? 'https://relay.futurechain.eu (default)'}`);
  log(` Buyer hash: ${buyerContactHash ?? '(anonymous — set ANTON_COLLAB_CONTACT_HASH)'}`);
  log(` Sign key:   ${agreementPubkey.slice(0, 16)}…  (Ed25519 agreement identity)`);
  log(` Store:      ${storeDir}`);
  log(` Approval:   ${modal ? 'terminal y/N prompt' : 'NONE — committing verbs fail closed under --mcp-stdio'}`);
  log(' Verbs:      discover · talk · {propose,accept,counter,decline,withdraw}Agreement · ingest · settle(coming)');
  if (mcpStdio) log(' MCP:        stdio enabled (stdout reserved for MCP).');
  log('════════════════════════════════════════════════════════════════');

  if (mcpStdio) {
    const mcp = buildMcpServer(deps);
    await mcp.connect(new StdioServerTransport());
  }
}

main().catch((e) => {
  process.stderr.write(`[anton-collaboration] startup failed: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
