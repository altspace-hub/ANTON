/**
 * index.ts — headless Anton Collaboration gateway.
 *
 * A local, agent-callable program (JSON-RPC over 127.0.0.1 + optional MCP over
 * stdio) that lets an external AI agent DISCOVER businesses in the .anton
 * registry and resolve their commerce capabilities. The first leg of the
 * agent-to-agent commerce loop (docs/AGENT_COLLABORATION_COMMERCE_PLAN.md);
 * TALK / NEGOTIATE / AGREE / SETTLE verbs arrive in later phases.
 *
 * Run:  pnpm --filter @anton/collaboration start:standalone [--mcp-stdio]
 * Env:  ANTON_COLLAB_PORT (default 49260) · ANTON_COLLAB_RELAY_BASE
 *
 * stdout is reserved for MCP; all logs go to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PairingStore } from '../main/pairing.js';
import { buildServer, type ServerDeps, type BuildServerOptions } from '../main/server.js';
import { buildMcpServer } from '../main/mcp.js';
import type { DiscoveryConfig } from '../main/discovery.js';

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
  const deps: ServerDeps = {
    pairings: new PairingStore(),
    ...(discovery ? { discovery } : {}),
  };

  // MCP clients send no Origin; the in-process MCP path bypasses the HTTP origin
  // check entirely. The HTTP server keeps the loopback origin allowlist.
  const opts: BuildServerOptions = {};
  const app = buildServer(deps, opts);
  await app.listen({ host: '127.0.0.1', port });
  const code = deps.pairings.newCode();

  log('════════════════════════════════════════════════════════════════');
  log(' Anton Collaboration — agent discovery + negotiation gateway');
  log('════════════════════════════════════════════════════════════════');
  log(` JSON-RPC:   http://127.0.0.1:${port}/rpc        (127.0.0.1 only)`);
  log(` Pair:       POST http://127.0.0.1:${port}/pair`);
  log(` Pair code:  ${code}    (valid 60s)`);
  log(` Registry:   ${discovery?.base ?? 'https://relay.futurechain.eu (default)'}`);
  log(` Verbs:      getStatus · searchSellers · resolveSeller   (TALK/AGREE/SETTLE coming)`);
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
