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
 *       ANTON_COLLAB_REVIEW_MODEL (optional four-eyes reviewer, off when blank —
 *         use a DIFFERENT model/provider than the brain, e.g. mistral-large-latest;
 *         needs that provider's key, e.g. MISTRAL_API_KEY) ·
 *       ANTON_COLLAB_REVIEW_STRICT=1 (auto-reject a raised proposal) ·
 *       ANTON_COLLAB_REVIEW_POLICY (extra no-go policy text) ·
 *       ANTON_COLLAB_PHONE_RELAY / ANTON_COLLAB_PHONE_CHANNEL=on (phone↔agent relay
 *         channel: task inbox + read-only wallet view) ·
 *       ANTON_COLLAB_AGENT_PAY_URL (default http://127.0.0.1:49250/rpc) ·
 *       ANTON_COLLAB_AGENT_PAY_BEARER (agent-pay /pair sk_… → enables the phone's
 *         read-only wallet view; spends stay gated in Agent Pay)
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
import { CliModalDriver, type ModalDriver } from '../main/modal.js';
import { CollabWebConfirmModalDriver } from './web-confirm.js';
import { registerCollabDashboard } from './dashboard.js';
import { DashboardActions } from './dashboard-actions.js';
import { randomBytes } from 'node:crypto';
import { NegotiationStore } from '../main/negotiation-store.js';
import { ClaudeNegotiationBrain, type NegotiationBrain } from '../main/negotiation-brain.js';
import { createAgreementReviewer } from '../main/agreement-reviewer.js';
import { FulfilmentStore } from '../main/fulfilment-store.js';
import { FulfilmentEngine } from '../main/fulfilment-engine.js';
import { EscrowStore } from '../main/escrow-store.js';
import { EscrowEngine } from '../main/escrow-engine.js';
import { TaskStore } from '../main/task-store.js';
import { loadRelayIdentity } from '../main/relay/identity.js';
import { RelayPeer } from '../main/relay/peer.js';
import { HttpMailbox } from '../main/relay/mailbox-client.js';
import { taskRouter } from '../main/relay/task-router.js';
import { walletRouter } from '../main/relay/wallet-router.js';
import { composeRouters } from '../main/relay/compose-router.js';
import { OwnerRegistry, loadOrMintPairingSecret, ownerGate } from '../main/relay/owner-gate.js';
import { EncryptedKeyStorage, parseKeyEncryptionKey } from '../main/encrypted-storage.js';
import { AgentPayClient } from '../main/relay/agent-pay-client.js';

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

  // Durable store for the signing identity + the agreement rows. The signing
  // identity + phone pairing secret are AES-256-GCM-wrapped at rest when
  // ANTON_COLLAB_KEY_ENCRYPTION_KEY (64 hex chars) is set — legacy plaintext
  // rows migrate on first read; without the key a one-time warning is logged.
  const storeDir = process.env.ANTON_COLLAB_STORE_DIR?.trim()
    || path.join(os.homedir(), '.anton-collaboration', 'store');
  const keyEncKey = parseKeyEncryptionKey(process.env.ANTON_COLLAB_KEY_ENCRYPTION_KEY);
  const storage = new EncryptedKeyStorage(new FileStorageBackend(storeDir), keyEncKey, log);
  const identity = new AgreementIdentity(storage);
  const agreementStore = new AgreementStore(storage);
  const engine = new AgreementEngine(agreementStore, identity);
  const approvals = new AgreementProposalStore();
  // Fulfilment + escrow share the SAME agreement store (agreed/settled checks)
  // and the SAME fulfilment store (the escrow release policy reads delivery proof).
  const fulfilmentStore = new FulfilmentStore(storage);
  const fulfilment = new FulfilmentEngine(agreementStore, identity, fulfilmentStore);
  const escrowStore = new EscrowStore(storage);
  const escrow = new EscrowEngine(agreementStore, identity, escrowStore, fulfilmentStore);
  // The human↔agent task inbox (W2 talk rail) — durable, always present.
  const tasks = new TaskStore(storage);

  // The human-approval driver. Terminal y/N when stdin is free; a one-time
  // BROWSER confirm URL under --mcp-stdio (MCP owns stdin) — so the committing
  // AGREE verbs no longer fail closed there. ANTON_COLLAB_APPROVAL=web|terminal
  // forces either explicitly.
  const approvalEnv = (process.env.ANTON_COLLAB_APPROVAL ?? '').trim().toLowerCase();
  const approvalMode: 'terminal' | 'web' =
    approvalEnv === 'web' ? 'web'
    : approvalEnv === 'terminal' ? 'terminal'
    : mcpStdio ? 'web' : 'terminal';
  const webAutoOpen = (process.env.ANTON_COLLAB_WEB_CONFIRM_AUTOOPEN ?? '').trim().toLowerCase() === 'true';
  let rl: readline.Interface | undefined;
  let modal: ModalDriver | undefined;
  let webModal: CollabWebConfirmModalDriver | undefined;
  if (approvalMode === 'web') {
    webModal = new CollabWebConfirmModalDriver({ port, now: Date.now, log, autoOpen: webAutoOpen });
    modal = webModal;
  } else {
    rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    modal = new CliModalDriver(rl);
  }

  // The autonomous negotiation brain — only when an Anthropic key is present.
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const negModel = process.env.ANTON_COLLAB_NEG_MODEL?.trim();
  const negotiations = new NegotiationStore();
  // ANTON_COLLAB_NEG_MODEL only accepts CLAUDE ids, and saying so is the point.
  //
  // ClaudeNegotiationBrain talks to the Anthropic SDK directly and uses Anthropic-only
  // request shapes — adaptive thinking, a top-level output_config.effort, and Anthropic
  // tool-use for the structured decision. Handing it 'mistral-large-latest' does not
  // switch provider; it sends an unknown model id to Anthropic and every negotiation
  // fails at the API. The override LOOKED provider-agnostic and was not, which is worse
  // than not having it.
  //
  // The four-eyes REVIEWER below is the slot that genuinely accepts either provider
  // (see agreement-reviewer.ts: Claude ids go to the Anthropic SDK, anything else to
  // Mistral's OpenAI-compatible endpoint), and it is the better place for a second
  // provider anyway — one model must not rubber-stamp its own decision.
  const negModelIsClaude = !negModel || negModel.startsWith('claude-');
  if (negModel && !negModelIsClaude) {
    log(`  ⚠ ANTON_COLLAB_NEG_MODEL="${negModel}" is not a Claude id. The negotiation brain`);
    log('    is Anthropic-only, so it stays OFF rather than failing on every call.');
    log('    For a non-Anthropic model use ANTON_COLLAB_REVIEW_MODEL (four-eyes reviewer).');
  }
  const brain: NegotiationBrain | undefined = anthropicKey && negModelIsClaude
    ? new ClaudeNegotiationBrain({ apiKey: anthropicKey, ...(negModel ? { model: negModel } : {}) })
    : undefined;

  // OPTIONAL independent four-eyes reviewer for committing agreement verbs. Off
  // unless ANTON_COLLAB_REVIEW_MODEL is set. Use a DIFFERENT model/provider than
  // the negotiation brain (e.g. mistral-large-latest) so one model can't rubber-
  // stamp its own decision. Advisory by default; ANTON_COLLAB_REVIEW_STRICT=1
  // auto-rejects a raised proposal before the human is asked.
  const reviewModel = process.env.ANTON_COLLAB_REVIEW_MODEL?.trim();
  const reviewStrict = /^(1|true)$/i.test((process.env.ANTON_COLLAB_REVIEW_STRICT ?? '').trim());
  const mistralKey = process.env.MISTRAL_API_KEY?.trim();
  const reviewPolicy = process.env.ANTON_COLLAB_REVIEW_POLICY?.trim();
  const reviewer = reviewModel ? createAgreementReviewer({
    model: reviewModel,
    ...(mistralKey ? { mistralApiKey: mistralKey } : {}),
    ...(anthropicKey ? { anthropicApiKey: anthropicKey } : {}),
    ...(reviewPolicy ? { extraPolicy: reviewPolicy } : {}),
  }) : undefined;
  if (reviewStrict && !reviewModel) {
    log('  ⚠ ANTON_COLLAB_REVIEW_STRICT is set but ANTON_COLLAB_REVIEW_MODEL is blank — four-eyes is OFF, strict has no effect.');
  }
  if (reviewModel && /^claude/i.test(reviewModel)) {
    log("  ⚠ four-eyes reviewer is a claude-* model — it shares the negotiation brain's provider/key; prefer a different provider (e.g. mistral-large-latest) for true independence.");
  }
  // Drop terminal negotiation jobs older than 30m every 10m (don't block exit).
  const reaper = setInterval(() => negotiations.reap(30 * 60 * 1000), 10 * 60 * 1000);
  reaper.unref();

  const deps: ServerDeps = {
    pairings: new PairingStore(),
    engine, approvals, negotiations, fulfilment, escrow, tasks,
    ...(discovery ? { discovery } : {}),
    ...(buyerContactHash ? { buyerContactHash } : {}),
    ...(modal ? { modal } : {}),
    ...(brain ? { brain } : {}),
    ...(reviewer ? { reviewer } : {}),
    ...(reviewStrict ? { reviewStrict } : {}),
  };

  // Resolve identity + channel config BEFORE building the server, so the
  // browser-approval routes AND the dashboard can mount on the app before listen()
  // (Fastify routes must be registered pre-listen).
  const agreementPubkey = await identity.pubkey();
  const relayId = await loadRelayIdentity(storage);
  const explicitPhoneRelay = process.env.ANTON_COLLAB_PHONE_RELAY?.trim();
  const phoneRelayBase = explicitPhoneRelay || relayBase || 'https://relay.futurechain.eu';
  const phoneChannelOn = process.env.ANTON_COLLAB_PHONE_CHANNEL === 'on' || Boolean(explicitPhoneRelay);

  // Read-only WALLET VIEW: the phone VIEWS the agent's Agent Pay wallet over the
  // relay (balance + transactions). Real spends are NEVER proxied — proposePayment
  // stays gated inside the separate Agent Pay gateway's human approval. Enable by
  // pasting the bearer from agent-pay's /pair into ANTON_COLLAB_AGENT_PAY_BEARER
  // (use ttlMs:2592000000 at pair time for a 30-day token); without it the phone
  // sees a "no wallet wired" state.
  const payUrl = process.env.ANTON_COLLAB_AGENT_PAY_URL?.trim() || 'http://127.0.0.1:49250/rpc';
  const payBearer = process.env.ANTON_COLLAB_AGENT_PAY_BEARER?.trim();
  const payClient = payBearer ? new AgentPayClient({ url: payUrl, bearer: payBearer }) : undefined;

  // MCP clients send no Origin; the in-process MCP path bypasses the HTTP origin
  // check entirely. The HTTP server keeps the loopback origin allowlist.
  const opts: BuildServerOptions = {};
  const app = buildServer(deps, opts);
  // The browser-approval driver mounts its /agreement-confirm routes on the SAME
  // app before listen() (mirrors Agent Pay's web-confirm wiring).
  if (webModal) webModal.registerRoutes(app);
  // Local read-only settings + history dashboard at GET / (same loopback port).
  // OPTIONAL operator-gated dashboard actions (approve/reject/cancel from the
  // browser). Off unless ANTON_COLLAB_DASHBOARD_ACTIONS=on, and only meaningful
  // with browser approval (drives the web-confirm pending records). The 256-bit
  // dashboard key prints to stderr only — never returned by /rpc — so the AI agent
  // (which holds only the /rpc bearer) can never reach the action routes.
  const dashActionsOn = (process.env.ANTON_COLLAB_DASHBOARD_ACTIONS ?? '').trim().toLowerCase() === 'on';
  let dashActions: DashboardActions | undefined;
  if (dashActionsOn && webModal) {
    const wm = webModal;
    dashActions = new DashboardActions({
      port, log,
      dashboardKey: randomBytes(32).toString('base64url'),
      handlers: {
        approve: (id) => wm.operatorApprove(id),
        reject: (id) => wm.operatorReject(id),
        'cancel-agreement-proposal': (id) => { const c = approvals.cancel(id); wm.operatorReject(id); return c; },
        'cancel-negotiation': (id) => negotiations.cancel(id),
      },
    });
  } else if (dashActionsOn) {
    log('  ⚠ ANTON_COLLAB_DASHBOARD_ACTIONS=on needs browser approval (ANTON_COLLAB_APPROVAL=web) — dashboard actions are OFF.');
  }

  const dashboardOn = (process.env.ANTON_COLLAB_DASHBOARD ?? 'on').trim().toLowerCase() !== 'off';
  if (dashboardOn) registerCollabDashboard(app, {
    port,
    ...(dashActions ? { actions: dashActions } : {}),
    settings: {
      signingPubkey: agreementPubkey,
      contactHash: relayId.contactHash,
      relayBase: phoneRelayBase,
      registryBase: discovery?.base ?? 'https://relay.futurechain.eu (default)',
      approvalMode,
      ...(reviewModel ? { reviewModel } : {}),
      reviewStrict,
      phoneChannel: phoneChannelOn,
      walletView: Boolean(payBearer),
      storeDir,
    },
    agreements: () => agreementStore.list(),
    tasks: () => tasks.listTasks({ limit: 50 }),
    fulfilments: () => fulfilmentStore.list(),
    escrows: () => escrowStore.list(),
    agreementApprovals: () => approvals.list(),
    negotiations: () => negotiations.list(),
    pendingConfirms: () => (webModal ? webModal.pendingSummary() : { count: 0, soonestExpiryMs: null }),
  });
  await app.listen({ host: '127.0.0.1', port });
  const code = deps.pairings.newCode();

  // ── Phone↔agent relay channel (Comm-style mailbox) ─────────────────────
  // The phone pairs to this agent by its contact hash / QR and chats + views the
  // wallet THROUGH the relay (no ANTON-instance bridge). The relayPeer poll loop
  // is not a Fastify route, so it starts after listen().
  let relayPeer: RelayPeer | undefined;
  // Owner gating (2026-07-17): the pair code carries a persistent secret; only
  // phones that claimed it may use the task inbox / wallet view. Every commerce
  // counterparty necessarily holds the agent's pubkey, so pubkey-binding alone
  // must never authorize the phone channel. ANTON_COLLAB_PHONE_OPEN=true
  // restores the old open behavior (fixtures/tests only).
  const phoneOwners = new OwnerRegistry(storage);
  const pairSecret = await loadOrMintPairingSecret(storage);
  const phoneOpen = process.env.ANTON_COLLAB_PHONE_OPEN === 'true';
  if (phoneChannelOn) {
    const mailbox = new HttpMailbox(phoneRelayBase, {
      ...(process.env.ANTON_COLLAB_RELAY_API_KEY ? { apiKey: process.env.ANTON_COLLAB_RELAY_API_KEY } : {}),
      ...(process.env.ANTON_COLLAB_RELAY_HMAC_SECRET ? { hmacSecret: process.env.ANTON_COLLAB_RELAY_HMAC_SECRET } : {}),
    });
    // The phone channel serves the human↔agent TASK INBOX + the read-only WALLET
    // VIEW — NOT the agent↔agent commerce verbs (those stay on the local JSON-RPC
    // for the agent's brain). taskRouter first so it answers ping.
    const inner = composeRouters(taskRouter(tasks), walletRouter(() => payClient));
    const router = phoneOpen ? inner : ownerGate(phoneOwners, () => pairSecret, inner);
    relayPeer = new RelayPeer(relayId, mailbox, storage, router);
    relayPeer.start(Number(process.env.ANTON_COLLAB_PHONE_POLL_MS) || 4000);
  }

  log('════════════════════════════════════════════════════════════════');
  log(' Anton Collaboration — agent discovery · talk · sign agreements');
  log('════════════════════════════════════════════════════════════════');
  log(` JSON-RPC:   http://127.0.0.1:${port}/rpc        (127.0.0.1 only)`);
  log(` Pair:       POST http://127.0.0.1:${port}/pair`);
  log(` Pair code:  ${code}    (valid 60s)`);
  log(` Registry:   ${discovery?.base ?? 'https://relay.futurechain.eu (default)'}`);
  log(` Buyer hash: ${buyerContactHash ?? '(anonymous — set ANTON_COLLAB_CONTACT_HASH)'}`);
  log(` Sign key:   ${agreementPubkey.slice(0, 16)}…  (Ed25519 agreement identity)`);
  log(` Agent addr: ${relayId.contactHash}   ← a phone pairs to THIS (scan the QR / paste the pub)`);
  log(` Pair code:  antonagent:pair?pub=${relayId.edPubHex}&relay=${encodeURIComponent(phoneRelayBase)}&s=${pairSecret}`);
  log(` Phone chan: ${phoneChannelOn ? `ON — polling ${phoneRelayBase}` : 'OFF (set ANTON_COLLAB_PHONE_RELAY or ANTON_COLLAB_PHONE_CHANNEL=on)'}`);
  log(` Phone auth: ${phoneOpen ? 'OPEN (ANTON_COLLAB_PHONE_OPEN=true — no owner gate; fixtures only)' : `owner-gated — ${(await phoneOwners.list()).length} paired phone(s); new phones must scan the CURRENT pair code (it carries the pairing secret)`}`);
  log(` Wallet view:${payBearer ? ` ON — proxying ${payUrl} (read-only; spends stay gated in Agent Pay)` : ' OFF (set ANTON_COLLAB_AGENT_PAY_BEARER to let the phone view the wallet)'}`);
  log(` Store:      ${storeDir}`);
  log(` Key at rest:${keyEncKey ? ' AES-256-GCM (ANTON_COLLAB_KEY_ENCRYPTION_KEY)' : ' PLAINTEXT — set ANTON_COLLAB_KEY_ENCRYPTION_KEY (64 hex chars) to encrypt the signing identity'}`);
  log(` Approval:   ${approvalMode === 'web' ? `BROWSER — each committing verb prints a one-time confirm URL to THIS terminal${webAutoOpen ? ' (auto-open)' : ''}` : 'terminal y/N prompt'}`);
  log(` Dashboard:  ${dashboardOn ? `http://127.0.0.1:${port}/   (settings + history, read-only)` : 'off'}`);
  if (dashActions) {
    log(' Dash actions: ON — unlock the operator approve/reject console ONCE from THIS terminal:');
    log(`   ${dashActions.unlockUrl()}`);
  }
  // The OFF reason has to name the ACTUAL cause. "set ANTHROPIC_API_KEY" is
  // actively misleading when the key is set and the model id was the problem.
  const negOff = !anthropicKey
    ? 'OFF — set ANTHROPIC_API_KEY'
    : 'OFF — ANTON_COLLAB_NEG_MODEL is not a Claude id (this brain is Anthropic-only)';
  log(` Negotiate:  ${brain ? `LLM brain (${negModel ?? 'claude-opus-4-8'})` : negOff}`);
  log(` 4-eyes:     ${reviewer ? `ON (${reviewModel}, ${reviewStrict ? 'STRICT — auto-reject on raise' : 'advisory'})` : 'OFF — set ANTON_COLLAB_REVIEW_MODEL'}`);
  log(' Verbs:      discover · talk · negotiate · agreement · settle · fulfilment · escrow (custodial; spends gated in Agent Pay)');
  log(' Tasks:      human↔agent inbox ON — poll listTasks, reply with postMessage(role:agent), setTaskStatus done');
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
