/**
 * server-only.ts — headless dev/CI entry that runs JUST the JSON-RPC
 * server (no Electron, no MCP stdio). Useful for testing the JSON-RPC
 * surface from curl/httpie/postman without spinning up the full
 * desktop app.
 *
 * Invoke via:   pnpm start:server
 *
 * Behaviour differences vs main.ts:
 *   - Uses StubModalDriver instead of the Electron BrowserWindow one;
 *     pre-programs every proposal to AUTO-APPROVE after 2 s. This lets
 *     a developer drive the full propose→approve→submit flow from a
 *     terminal without an actual desktop modal. Production submission
 *     remains a stub (FIXME(phase2) — see main.ts).
 *   - Prints the pairing code to stdout on startup so curl tests can
 *     immediately POST /pair.
 *   - Logs to stdout instead of ~/.anton-agent-pay/agent-pay.log.
 */
import { setActiveModalDriver, StubModalDriver } from './modal.js';
import { PairingStore } from './pairing.js';
import { ProposalStore } from './proposals.js';
import { buildServer, type ServerDeps } from './server.js';

const PORT = Number(process.env.AGENT_PAY_PORT ?? 49200);

async function main(): Promise<void> {
  const modal = new StubModalDriver();
  setActiveModalDriver(modal);

  // For dev convenience: every proposal that opens the modal gets
  // auto-approved on a 2-second delay (simulates a human at the
  // keyboard). Override with AGENT_PAY_AUTOREJECT=1 to flip to
  // auto-reject — useful for testing the rejection path.
  const autoreject = process.env.AGENT_PAY_AUTOREJECT === '1';
  const tickInterval = setInterval(() => {
    // Refill the queue with one decision per tick. The modal will
    // dequeue as proposePayment calls fire.
    if (autoreject) {
      modal.queueDecision({ kind: 'reject', reason: 'AGENT_PAY_AUTOREJECT=1' });
    } else {
      modal.queueDecision({ kind: 'approve' });
    }
  }, 2_000);
  // Don't keep the process alive just for the tick.
  tickInterval.unref();

  const pairings = new PairingStore();
  const proposals = new ProposalStore();

  const deps: ServerDeps = {
    pairings, proposals, modal,
    walletStatus: async () => ({
      walletAddress: 'fc_DEV_HEADLESS_STUB',
      balanceFtc: 1000,
      lastSeenBlock: 805_367,
    }),
    recentTransactions: async () => [],
    counterpartyHint: async () => null,
    walletHasPassphrase: async () => false,
    submitPayment: async (req) => {
      // Dev stub — pretend the chain accepted, return a fake tx id.
      const txId = 'fake_' + Math.random().toString(36).slice(2, 10);
      console.log(`[server-only] DEV submitPayment to=${req.to} amount=${req.amountFtc} → ${txId}`);
      return { txId, feeFtc: 0.001 };
    },
  };

  const app = buildServer(deps);
  await app.listen({ host: '127.0.0.1', port: PORT });

  // Mint a pairing code immediately so a curl flow can pair right away.
  const code = pairings.newCode();
  console.log('========================================================');
  console.log(' Anton Agent Pay — headless dev server');
  console.log('========================================================');
  console.log(` URL:           http://127.0.0.1:${PORT}/rpc`);
  console.log(` Pair endpoint: POST http://127.0.0.1:${PORT}/pair`);
  console.log(` Pairing code:  ${code}    (valid for 60s)`);
  console.log(' Stub modal:    auto-' + (autoreject ? 'REJECT' : 'APPROVE') + ' after 2s');
  console.log('');
  console.log(' Try:');
  console.log(`   curl -sS http://127.0.0.1:${PORT}/pair \\`);
  console.log('     -H "Content-Type: application/json" \\');
  console.log(`     -d '{"name":"curl-dev","code":"${code}"}'`);
  console.log('========================================================');
}

main().catch((e) => {
  console.error('[server-only] startup failed:', e);
  process.exit(1);
});
