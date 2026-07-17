/**
 * mcp.ts — Model Context Protocol wrapper for Anton Collaboration.
 *
 * Exposes the same verbs as the JSON-RPC server (searchSellers, resolveSeller,
 * getStatus) as MCP tools so MCP-aware agents (Claude Desktop, etc.) discover +
 * call them natively over stdio. Thin transport adapter — reuses the same
 * discovery logic + ServerDeps as the JSON-RPC layer (single source of truth).
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { ServerDeps } from './server.js';
import {
  COLLAB_VERBS, NegotiateParams, startNegotiation,
  requireGate, nowOf, runAgreementModalFlow,
  ProposeAgreementParams, AcceptAgreementParams, CounterAgreementParams, ProposalIdParams,
} from './server.js';
import type { ProposeInput, CounterInput } from './agreement-engine.js';
import { searchPortals, resolvePortal, portalVerbs } from './discovery.js';
import { invokeCapability, capabilityForVerb } from './talk.js';
import { TaskNotFoundError } from './task-store.js';

/** Identity label for MCP-originated approvals (the built-in stdio client). */
const MCP_AGENT_NAME = 'mcp-agent';

export const MCP_TOOLS = [
  {
    name: 'getStatus',
    description: 'Confirm this collaboration program is reachable + paired, and which registry + verbs are available.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'searchSellers',
    description:
      'Search the ANTON .anton registry for businesses by free text + capability verb + category — e.g. find a '
      + 'sport store that can take an order. Returns matching portals (address, title, verbs).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', maxLength: 500, description: 'Free-text query, e.g. "sport store running shoes".' },
        verbs: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 64 }, description: 'Require these commerce verbs, e.g. ["order"].' },
        categories: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 64 } },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0 },
      },
    },
  },
  {
    name: 'resolveSeller',
    description:
      'Resolve an exact "name.namespace" portal address to its signed capability descriptor: the commerce verbs '
      + 'it offers (inquire/order/pay), its payment rail, and the originEndpoint where you talk to its agent.',
    inputSchema: {
      type: 'object',
      required: ['address'],
      additionalProperties: false,
      properties: { address: { type: 'string', maxLength: 256, description: 'e.g. "kicks.sthlm.portal".' } },
    },
  },
  {
    name: 'inquireSeller',
    description:
      "Ask a resolved seller a question by invoking one of its commerce capabilities — e.g. \"do you have Air "
      + 'Jordans in size 43, and what do they cost?". Goes directly to the seller\'s ANTON (not the relay). Returns '
      + 'the seller\'s structured response (a quote, availability, or a queued acknowledgement). This is TALK, the '
      + 'step before negotiate/agree/settle — it commits to nothing.',
    inputSchema: {
      type: 'object',
      required: ['address'],
      additionalProperties: false,
      properties: {
        address: { type: 'string', maxLength: 256, description: 'Exact seller address, e.g. "kicks.sthlm.portal".' },
        verb: { type: 'string', maxLength: 64, description: 'Capability verb to invoke, e.g. "inquire" or "order".' },
        capabilityId: { type: 'string', maxLength: 128, description: 'Exact capability id (overrides verb).' },
        input: { type: 'object', description: 'Structured question/payload matching the capability\'s input schema.' },
      },
    },
  },
  // ── AGREE: the committing verbs (HUMAN-GATED) ────────────────────────
  {
    name: 'proposeAgreement',
    description:
      'Propose a SIGNED two-party agreement to a counterparty (decision + terms + amount). HUMAN-GATED: this opens '
      + 'an approval the owner must confirm in their browser (the web-confirm driver under --mcp-stdio) — it returns a '
      + 'proposalId immediately (fire-and-forget); poll getAgreementProposal for the outcome. Fails closed with an '
      + 'error if no approval driver is wired. This is the ONLY way to originate a signed agreement.',
    inputSchema: {
      type: 'object',
      required: ['decision', 'terms', 'amountMicroFtc', 'counterpartyAddress'],
      additionalProperties: false,
      properties: {
        decision: { type: 'string', maxLength: 2000, description: 'The commitment being made, e.g. "buy 1 pair Air Jordans EU43".' },
        terms: { type: 'string', maxLength: 8000, description: 'Full agreement terms.' },
        amountMicroFtc: { type: 'string', description: 'Amount in µFTC (base-10 integer string).' },
        counterpartyAddress: { type: 'string', maxLength: 256, description: 'Seller portal address, e.g. "kicks.sthlm.portal".' },
        counterpartyHash: { type: 'string', maxLength: 256, description: 'Optional counterparty contact hash.' },
        agentNote: { type: 'string', maxLength: 2000, description: 'Optional note surfaced to the owner in the approval.' },
        ttlMs: { type: 'integer', description: 'Approval TTL in ms (clamped 10s–5min).' },
      },
    },
  },
  {
    name: 'acceptAgreement',
    description:
      'Accept an open agreement you are the acceptor of (the seller accepting the buyer\'s offer, or vice versa). '
      + 'HUMAN-GATED (browser approval under --mcp-stdio). Returns a proposalId; poll getAgreementProposal. Produces '
      + 'the SIGNED accept once the owner confirms.',
    inputSchema: {
      type: 'object', required: ['agreementId'], additionalProperties: false,
      properties: {
        agreementId: { type: 'string', maxLength: 128 },
        ttlMs: { type: 'integer' },
      },
    },
  },
  {
    name: 'counterAgreement',
    description:
      'Counter an open agreement with revised terms (decision + terms + amount). HUMAN-GATED (browser approval under '
      + '--mcp-stdio). Returns a proposalId; poll getAgreementProposal. Produces a SIGNED counter once confirmed.',
    inputSchema: {
      type: 'object',
      required: ['agreementId', 'decision', 'terms', 'amountMicroFtc'],
      additionalProperties: false,
      properties: {
        agreementId: { type: 'string', maxLength: 128 },
        decision: { type: 'string', maxLength: 2000 },
        terms: { type: 'string', maxLength: 8000 },
        amountMicroFtc: { type: 'string', description: 'Revised amount in µFTC (base-10 integer string).' },
        agentNote: { type: 'string', maxLength: 2000 },
        ttlMs: { type: 'integer' },
      },
    },
  },
  {
    name: 'getAgreementProposal',
    description:
      'Poll a committing-verb approval by its proposalId: state (pending / approved / done / rejected / expired / '
      + 'cancelled), and — once done — the resulting agreementId + signed payload. This is how you learn whether the '
      + 'owner approved your proposeAgreement / acceptAgreement / counterAgreement.',
    inputSchema: {
      type: 'object', required: ['proposalId'], additionalProperties: false,
      properties: { proposalId: { type: 'string', maxLength: 128 } },
    },
  },
  {
    name: 'cancelAgreementProposal',
    description: 'Cancel a still-pending committing-verb approval (before the owner acts on it).',
    inputSchema: {
      type: 'object', required: ['proposalId'], additionalProperties: false,
      properties: { proposalId: { type: 'string', maxLength: 128 } },
    },
  },
  {
    name: 'listAgreements',
    description: 'List the signed two-party agreements this program holds (newest first), with their status (proposed / accepted / agreed / declined / withdrawn / settled).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'getAgreement',
    description: 'Fetch one agreement by id — its decision, terms, amount, counterparty, status, and the signed proposal hash.',
    inputSchema: {
      type: 'object', required: ['agreementId'], additionalProperties: false,
      properties: { agreementId: { type: 'string', maxLength: 128 } },
    },
  },
  {
    name: 'ingestAgreement',
    description:
      "Apply an inbound SIGNED agreement message from the counterparty (relayed by you): a propose / respond "
      + '(accept|decline|counter) / withdraw / ack payload. Verifies the signature + records it. This is how the '
      + 'seller receives the buyer\'s offer and the buyer receives the seller\'s accept.',
    inputSchema: {
      type: 'object', required: ['type', 'fromHash', 'payload'], additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['propose', 'respond', 'withdraw', 'ack'] },
        fromHash: { type: 'string', maxLength: 256, description: 'The sender\'s contact hash (who relayed this).' },
        payload: { type: 'object', description: 'The signed wire payload exactly as produced by the counterparty.' },
      },
    },
  },
  {
    name: 'declineAgreement',
    description: 'Decline an open agreement you are the acceptor of. Produces a SIGNED decline to relay back to the proposer. Commits to nothing, so no human gate.',
    inputSchema: {
      type: 'object', required: ['agreementId'], additionalProperties: false,
      properties: { agreementId: { type: 'string', maxLength: 128 } },
    },
  },
  {
    name: 'withdrawAgreement',
    description: 'Withdraw an offer you proposed that has not yet been answered. Produces a SIGNED withdraw to relay to the counterparty. No human gate (retracting your own offer).',
    inputSchema: {
      type: 'object', required: ['agreementId'], additionalProperties: false,
      properties: { agreementId: { type: 'string', maxLength: 128 } },
    },
  },
  {
    name: 'getSettlementInstruction',
    description:
      'For an AGREED agreement, get the instruction to settle it on FutureChain: the payee address, FTC amount, and '
      + 'a remittance STAMPED with the proposalHash + agreementId. Hand this to Anton Agent Pay\'s proposePayment '
      + '(the spend opens Agent Pay\'s own human approval). The stamp lets the payee reconcile the on-chain payment '
      + 'to this exact agreement.',
    inputSchema: {
      type: 'object', required: ['agreementId'], additionalProperties: false,
      properties: { agreementId: { type: 'string', maxLength: 128 } },
    },
  },
  {
    name: 'markAgreementSettled',
    description: 'Payer side: after Agent Pay broadcast the settlement, record the on-chain txHash against the agreement (→ status "settled").',
    inputSchema: {
      type: 'object', required: ['agreementId', 'txHash'], additionalProperties: false,
      properties: { agreementId: { type: 'string', maxLength: 128 }, txHash: { type: 'string', maxLength: 256 } },
    },
  },
  {
    name: 'reconcileSettlement',
    description: 'Payee side: an inbound payment arrived carrying a proposalHash in its remittance meta — match it to your agreement + link the txHash (→ status "settled").',
    inputSchema: {
      type: 'object', required: ['proposalHash', 'txHash'], additionalProperties: false,
      properties: { proposalHash: { type: 'string', maxLength: 128 }, txHash: { type: 'string', maxLength: 256 } },
    },
  },
  {
    name: 'negotiate',
    description:
      'Autonomously negotiate with a seller toward a goal: I search/resolve the seller, inquire about price + '
      + 'availability, and (within your HARD µFTC ceiling) counter or accept on your behalf — all over UNGATED TALK. '
      + 'This NEVER signs or pays. Its best outcome PREPARES a proposeAgreement you must STILL run through the '
      + 'human-gated proposeAgreement verb. Returns a jobId; poll getNegotiation for the transcript + outcome.',
    inputSchema: {
      type: 'object',
      required: ['address', 'objective', 'maxAmountMicroFtc'],
      additionalProperties: false,
      properties: {
        address: { type: 'string', maxLength: 256, description: 'Seller address, e.g. "kicks.sthlm.portal".' },
        verb: { type: 'string', maxLength: 64, description: 'Seller capability verb, e.g. "inquire" or "order".' },
        capabilityId: { type: 'string', maxLength: 128 },
        objective: { type: 'string', maxLength: 2000, description: 'What you want, e.g. "Air Jordans EU43, 1 pair".' },
        inquiryInput: { type: 'object', description: 'Opening structured question for the seller capability.' },
        maxAmountMicroFtc: { type: 'string', description: 'HARD price ceiling in µFTC (base-10 integer). Never exceeded.' },
        targetAmountMicroFtc: { type: 'string', description: 'Advisory target price the brain aims for.' },
        constraints: { type: 'string', maxLength: 4000 },
        maxRounds: { type: 'integer', minimum: 1, maximum: 8 },
        ttlMs: { type: 'integer' },
      },
    },
  },
  {
    name: 'getNegotiation',
    description: 'Poll a negotiation job: its state, the round-by-round transcript, and on completion the outcome (propose_ready with prepared params / walked_away / no_agreement).',
    inputSchema: {
      type: 'object', required: ['jobId'], additionalProperties: false,
      properties: { jobId: { type: 'string', maxLength: 128 } },
    },
  },
  {
    name: 'cancelNegotiation',
    description: 'Cancel a pending/running negotiation job.',
    inputSchema: {
      type: 'object', required: ['jobId'], additionalProperties: false,
      properties: { jobId: { type: 'string', maxLength: 128 } },
    },
  },
  {
    name: 'markShipped',
    description: 'Seller side: after an agreed/settled agreement, sign + record a shipment (carrier + tracking). Returns a SIGNED shipment notice to relay to the buyer. Moves no FTC; no human gate.',
    inputSchema: {
      type: 'object', required: ['agreementId', 'carrier'], additionalProperties: false,
      properties: {
        agreementId: { type: 'string', maxLength: 128 },
        carrier: { type: 'string', maxLength: 200 },
        tracking: { type: 'string', maxLength: 200 },
        eta: { type: 'string', maxLength: 200 },
      },
    },
  },
  {
    name: 'confirmDelivery',
    description: 'Buyer side: confirm receipt of an agreed/settled order. Returns a SIGNED delivery confirmation to relay to the seller (the trust signal for a future escrow release).',
    inputSchema: {
      type: 'object', required: ['agreementId'], additionalProperties: false,
      properties: { agreementId: { type: 'string', maxLength: 128 } },
    },
  },
  {
    name: 'ingestFulfilment',
    description: 'Apply an inbound SIGNED fulfilment message from the counterparty: a shipment (seller→buyer) or delivery (buyer→seller). Verifies the signature came from the agreement\'s counterparty + records it.',
    inputSchema: {
      type: 'object', required: ['type', 'fromHash', 'payload'], additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['shipment', 'delivery'] },
        fromHash: { type: 'string', maxLength: 256 },
        payload: { type: 'object' },
      },
    },
  },
  {
    name: 'getFulfilment',
    description: 'Read the fulfilment status of an agreement: awaiting / shipped (carrier + tracking) / delivered.',
    inputSchema: {
      type: 'object', required: ['agreementId'], additionalProperties: false,
      properties: { agreementId: { type: 'string', maxLength: 128 } },
    },
  },
  {
    name: 'openEscrow',
    description:
      'Opt an agreed agreement into CUSTODIAL escrow (FutureChain has no native escrow): a third arbiter holds an '
      + 'escrow address; the buyer funds it, and on a confirmed delivery the arbiter releases to the seller (or '
      + 'refunds the buyer). Fixes the immutable escrow/release/refund addresses + arbiter. The SPENDS are gated in '
      + 'Agent Pay. NOT trustless — the arbiter can never misdirect funds but is trusted to act.',
    inputSchema: {
      type: 'object', required: ['agreementId', 'escrowAddress', 'releaseTo', 'refundTo', 'arbiterPubkey'], additionalProperties: false,
      properties: {
        agreementId: { type: 'string', maxLength: 128 }, escrowAddress: { type: 'string', maxLength: 256 },
        releaseTo: { type: 'string', maxLength: 256 }, refundTo: { type: 'string', maxLength: 256 },
        arbiterPubkey: { type: 'string', maxLength: 128 }, escrowMode: { type: 'string', enum: ['notary'] },
        fundDeadlineMs: { type: 'integer' }, autoReleaseMs: { type: 'integer' }, disputeWindowMs: { type: 'integer' },
      },
    },
  },
  { name: 'getEscrowFundInstruction', description: 'Buyer: the instruction (pay → escrow E) to hand to Agent Pay\'s proposePayment.', inputSchema: { type: 'object', required: ['agreementId'], additionalProperties: false, properties: { agreementId: { type: 'string', maxLength: 128 } } } },
  { name: 'getEscrowReleaseInstruction', description: 'Arbiter: the instruction (E → seller) when the release policy allows it (delivery confirmed). arbiterOverride:"release" resolves a dispute.', inputSchema: { type: 'object', required: ['agreementId'], additionalProperties: false, properties: { agreementId: { type: 'string', maxLength: 128 }, arbiterOverride: { type: 'string', enum: ['release', 'refund'] } } } },
  { name: 'getEscrowRefundInstruction', description: 'Arbiter: the instruction (E → buyer) when the refund policy allows it (never-shipped / dispute). arbiterOverride:"refund" resolves a dispute.', inputSchema: { type: 'object', required: ['agreementId'], additionalProperties: false, properties: { agreementId: { type: 'string', maxLength: 128 }, arbiterOverride: { type: 'string', enum: ['release', 'refund'] } } } },
  { name: 'markEscrowFunded', description: 'Record the confirmed FUND tx (→ funded; opens the release/refund windows).', inputSchema: { type: 'object', required: ['agreementId', 'txHash'], additionalProperties: false, properties: { agreementId: { type: 'string', maxLength: 128 }, txHash: { type: 'string', maxLength: 256 } } } },
  { name: 'markEscrowReleased', description: 'Record the confirmed RELEASE tx (→ released; settles the agreement).', inputSchema: { type: 'object', required: ['agreementId', 'txHash'], additionalProperties: false, properties: { agreementId: { type: 'string', maxLength: 128 }, txHash: { type: 'string', maxLength: 256 } } } },
  { name: 'markEscrowRefunded', description: 'Record the confirmed REFUND tx (→ refunded).', inputSchema: { type: 'object', required: ['agreementId', 'txHash'], additionalProperties: false, properties: { agreementId: { type: 'string', maxLength: 128 }, txHash: { type: 'string', maxLength: 256 } } } },
  { name: 'raiseDispute', description: 'Buyer: raise a SIGNED dispute against a funded escrow (→ disputed; routes to the human arbiter). Signed, ungated.', inputSchema: { type: 'object', required: ['agreementId', 'reason'], additionalProperties: false, properties: { agreementId: { type: 'string', maxLength: 128 }, reason: { type: 'string', maxLength: 2000 } } } },
  { name: 'ingestDispute', description: 'Arbiter/seller: apply an inbound SIGNED dispute (verifies the buyer key + signature).', inputSchema: { type: 'object', required: ['payload'], additionalProperties: false, properties: { payload: { type: 'object' } } } },
  { name: 'reconcileEscrow', description: 'Record an observed inbound escrow leg by kind (fund / release / refund) + txHash.', inputSchema: { type: 'object', required: ['agreementId', 'leg', 'txHash'], additionalProperties: false, properties: { agreementId: { type: 'string', maxLength: 128 }, leg: { type: 'string', enum: ['fund', 'release', 'refund'] }, txHash: { type: 'string', maxLength: 256 } } } },
  { name: 'getEscrow', description: 'Read the escrow status: requested / funded / release_pending / released / refund_pending / refunded / disputed / expired.', inputSchema: { type: 'object', required: ['agreementId'], additionalProperties: false, properties: { agreementId: { type: 'string', maxLength: 128 } } } },
  // ── TASKS — human↔agent task inbox (the W2 talk rail) ──────────────
  { name: 'listTasks', description: 'Poll the human→agent task inbox: tasks the owner gave you (newest first). Pass since (epoch ms) to fetch only what changed since your last poll. THIS is how you discover new work to do.', inputSchema: { type: 'object', additionalProperties: false, properties: { since: { type: 'integer', minimum: 0 }, status: { type: 'string', enum: ['open', 'working', 'done', 'cancelled'] }, limit: { type: 'integer', minimum: 1, maximum: 200 } } } },
  { name: 'listMessages', description: 'Read one task thread — the owner\'s ask plus your replies, in order.', inputSchema: { type: 'object', required: ['taskId'], additionalProperties: false, properties: { taskId: { type: 'string', maxLength: 128 } } } },
  { name: 'postMessage', description: 'Reply in a task thread so the owner sees it in their app (always posted as the AGENT — the human side is the owner\'s phone). The first reply moves the task to "working".', inputSchema: { type: 'object', required: ['taskId', 'text'], additionalProperties: false, properties: { taskId: { type: 'string', maxLength: 128 }, text: { type: 'string', minLength: 1, maxLength: 8000 } } } },
  { name: 'setTaskStatus', description: 'Set a task\'s status — mark it "done" when finished (or "cancelled").', inputSchema: { type: 'object', required: ['taskId', 'status'], additionalProperties: false, properties: { taskId: { type: 'string', maxLength: 128 }, status: { type: 'string', enum: ['open', 'working', 'done', 'cancelled'] } } } },
  { name: 'postTask', description: 'Create a new task in the inbox (role:human). Normally the owner does this from their phone; included for completeness.', inputSchema: { type: 'object', required: ['text'], additionalProperties: false, properties: { text: { type: 'string', minLength: 1, maxLength: 8000 } } } },
] as const;

export function buildMcpServer(deps: ServerDeps): Server {
  const server = new Server(
    { name: 'anton-collaboration', version: '0.0.1' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: MCP_TOOLS as unknown as Array<{ name: string; description: string; inputSchema: object }>,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      const result = await dispatchMcpTool(deps, name, args ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
    }
  });

  return server;
}

export async function dispatchMcpTool(
  deps: ServerDeps, name: string, args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'getStatus':
      return {
        paired: true,
        relayBase: deps.discovery?.base ?? process.env.ANTON_COLLAB_RELAY_BASE ?? 'https://relay.futurechain.eu',
        verbs: [...COLLAB_VERBS],
      };
    case 'searchSellers': {
      const opts = {
        ...(typeof args.text === 'string' ? { text: args.text } : {}),
        ...(Array.isArray(args.verbs) ? { verbs: (args.verbs as unknown[]).map(String) } : {}),
        ...(Array.isArray(args.categories) ? { categories: (args.categories as unknown[]).map(String) } : {}),
        ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
        ...(typeof args.offset === 'number' ? { offset: args.offset } : {}),
      };
      return searchPortals(opts, deps.discovery);
    }
    case 'resolveSeller': {
      const address = String(args.address ?? '');
      if (!address) throw new Error('validation: address is required');
      const resolved = await resolvePortal(address, deps.discovery);
      if (!resolved) return { found: false };
      return {
        found: true,
        address: resolved.portalAddress,
        ...(resolved.contactHash !== undefined ? { contactHash: resolved.contactHash } : {}),
        ...(resolved.signingPubkeyHex !== undefined ? { signingPubkeyHex: resolved.signingPubkeyHex } : {}),
        verbs: portalVerbs(resolved),
        descriptor: resolved.descriptor,
      };
    }
    case 'inquireSeller': {
      const address = String(args.address ?? '');
      if (!address) throw new Error('validation: address is required');
      const verb = typeof args.verb === 'string' ? args.verb : undefined;
      const explicitCapId = typeof args.capabilityId === 'string' ? args.capabilityId : undefined;
      if (!verb && !explicitCapId) throw new Error('validation: verb or capabilityId is required');
      const input = (args.input && typeof args.input === 'object' ? args.input : {}) as Record<string, unknown>;

      const resolved = await resolvePortal(address, deps.discovery);
      if (!resolved) return { kind: 'capability_not_found', message: `seller not found: ${address}` };

      let capabilityId = explicitCapId;
      if (!capabilityId && verb) {
        const cap = capabilityForVerb(resolved, verb);
        if (!cap) return { kind: 'capability_not_found', message: `seller has no "${verb}" capability` };
        capabilityId = cap.id;
      }
      if (!capabilityId) throw new Error('validation: verb or capabilityId is required');

      const invokeOpts: { fetch?: typeof fetch; visitorContactHash?: string } = {};
      if (deps.discovery?.fetch) invokeOpts.fetch = deps.discovery.fetch;
      if (deps.buyerContactHash) invokeOpts.visitorContactHash = deps.buyerContactHash;
      const result = await invokeCapability(resolved, capabilityId, input, invokeOpts);
      return { capabilityId, ...result };
    }
    // ── AGREE: committing verbs (human-gated) — mirror the JSON-RPC path ──
    // Routes through the SAME requireGate + approvals.create +
    // runAgreementModalFlow (web-confirm/terminal + optional four-eyes review)
    // as server.ts, so an agreement can never be signed without the owner's
    // browser approval. Fails closed (throws) if no approval driver is wired.
    case 'proposeAgreement': {
      const gate = requireGate(deps);
      if ('err' in gate) throw new Error(gate.message);
      const p = ProposeAgreementParams.safeParse(args);
      if (!p.success) throw new Error(`validation: ${p.error.issues.map((i) => i.message).join('; ')}`);
      const input: ProposeInput = {
        decision: p.data.decision, terms: p.data.terms, amountMicroFtc: p.data.amountMicroFtc,
        counterpartyAddress: p.data.counterpartyAddress,
        ...(p.data.counterpartyHash !== undefined ? { counterpartyHash: p.data.counterpartyHash } : {}),
      };
      const rec = gate.approvals.create(MCP_AGENT_NAME, { kind: 'propose', input }, p.data.ttlMs);
      void runAgreementModalFlow(gate, MCP_AGENT_NAME, { pairedAt: nowOf(deps)() }, rec.id, nowOf(deps), p.data.agentNote);
      return { proposalId: rec.id, expiresAt: rec.expiresAt };
    }
    case 'acceptAgreement': {
      const gate = requireGate(deps);
      if ('err' in gate) throw new Error(gate.message);
      const p = AcceptAgreementParams.safeParse(args);
      if (!p.success) throw new Error(`validation: ${p.error.issues.map((i) => i.message).join('; ')}`);
      const existing = await gate.engine.get(p.data.agreementId);
      if (!existing) throw new Error(`unknown agreement: ${p.data.agreementId}`);
      const rec = gate.approvals.create(MCP_AGENT_NAME, { kind: 'accept', agreementId: p.data.agreementId }, p.data.ttlMs);
      void runAgreementModalFlow(gate, MCP_AGENT_NAME, { pairedAt: nowOf(deps)() }, rec.id, nowOf(deps));
      return { proposalId: rec.id, expiresAt: rec.expiresAt };
    }
    case 'counterAgreement': {
      const gate = requireGate(deps);
      if ('err' in gate) throw new Error(gate.message);
      const p = CounterAgreementParams.safeParse(args);
      if (!p.success) throw new Error(`validation: ${p.error.issues.map((i) => i.message).join('; ')}`);
      const existing = await gate.engine.get(p.data.agreementId);
      if (!existing) throw new Error(`unknown agreement: ${p.data.agreementId}`);
      const counter: CounterInput = { decision: p.data.decision, terms: p.data.terms, amountMicroFtc: p.data.amountMicroFtc };
      const rec = gate.approvals.create(MCP_AGENT_NAME, { kind: 'counter', agreementId: p.data.agreementId, counter }, p.data.ttlMs);
      void runAgreementModalFlow(gate, MCP_AGENT_NAME, { pairedAt: nowOf(deps)() }, rec.id, nowOf(deps), p.data.agentNote);
      return { proposalId: rec.id, expiresAt: rec.expiresAt };
    }
    case 'getAgreementProposal': {
      if (!deps.approvals) throw new Error('approvals not configured');
      const p = ProposalIdParams.safeParse(args);
      if (!p.success) throw new Error(`validation: ${p.error.issues.map((i) => i.message).join('; ')}`);
      const rec = deps.approvals.get(p.data.proposalId);
      if (!rec) throw new Error('unknown proposal');
      return {
        state: rec.state,
        ...(rec.agreementId !== undefined ? { agreementId: rec.agreementId } : {}),
        ...(rec.payloadJson !== undefined ? { payload: JSON.parse(rec.payloadJson) } : {}),
        ...(rec.rejectReason !== undefined ? { rejectReason: rec.rejectReason } : {}),
      };
    }
    case 'cancelAgreementProposal': {
      if (!deps.approvals) throw new Error('approvals not configured');
      const p = ProposalIdParams.safeParse(args);
      if (!p.success) throw new Error(`validation: ${p.error.issues.map((i) => i.message).join('; ')}`);
      if (!deps.approvals.cancel(p.data.proposalId)) throw new Error('proposal not pending or unknown');
      return { state: 'cancelled' };
    }
    case 'listAgreements': {
      const engine = requireEngine(deps);
      return { agreements: await engine.list() };
    }
    case 'getAgreement': {
      const engine = requireEngine(deps);
      const agreementId = String(args.agreementId ?? '');
      if (!agreementId) throw new Error('validation: agreementId is required');
      const a = await engine.get(agreementId);
      return a ? { found: true, agreement: a } : { found: false };
    }
    case 'ingestAgreement': {
      const engine = requireEngine(deps);
      const type = String(args.type ?? '');
      const fromHash = String(args.fromHash ?? '');
      const payload = (args.payload && typeof args.payload === 'object' ? args.payload : null) as Record<string, unknown> | null;
      if (!fromHash || !payload) throw new Error('validation: type, fromHash and payload are required');
      let applied: unknown = null;
      if (type === 'propose') applied = await engine.applyInboundPropose(payload as never, fromHash);
      else if (type === 'respond') applied = await engine.applyInboundRespond(payload as never, fromHash);
      else if (type === 'withdraw') applied = await engine.applyInboundWithdraw(payload as never, fromHash);
      else if (type === 'ack') applied = await engine.applyInboundAck(payload as never, fromHash);
      else throw new Error(`validation: unknown ingest type "${type}"`);
      return { applied: applied !== null, agreement: applied };
    }
    case 'declineAgreement': {
      const engine = requireEngine(deps);
      const agreementId = String(args.agreementId ?? '');
      if (!agreementId) throw new Error('validation: agreementId is required');
      return engine.respond(agreementId, 'decline');
    }
    case 'withdrawAgreement': {
      const engine = requireEngine(deps);
      const agreementId = String(args.agreementId ?? '');
      if (!agreementId) throw new Error('validation: agreementId is required');
      return engine.withdraw(agreementId);
    }
    case 'getSettlementInstruction': {
      const engine = requireEngine(deps);
      const agreementId = String(args.agreementId ?? '');
      if (!agreementId) throw new Error('validation: agreementId is required');
      return { instruction: await engine.getSettlementInstruction(agreementId) };
    }
    case 'markAgreementSettled': {
      const engine = requireEngine(deps);
      const agreementId = String(args.agreementId ?? '');
      const txHash = String(args.txHash ?? '');
      if (!agreementId || !txHash) throw new Error('validation: agreementId and txHash are required');
      const a = await engine.markSettled(agreementId, txHash);
      if (!a) throw new Error('agreement not found or not in an agreed/accepted state');
      return { agreement: a };
    }
    case 'reconcileSettlement': {
      const engine = requireEngine(deps);
      const proposalHash = String(args.proposalHash ?? '');
      const txHash = String(args.txHash ?? '');
      if (!proposalHash || !txHash) throw new Error('validation: proposalHash and txHash are required');
      const a = await engine.reconcileInboundSettlement({ proposalHash, txHash });
      return { matched: a !== null, agreement: a };
    }
    case 'negotiate': {
      const parsed = NegotiateParams.safeParse(args);
      if (!parsed.success) throw new Error(`validation: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
      // MCP carries no per-agent identity beyond the in-process pairing; label it.
      const r = await startNegotiation(deps, 'mcp-agent', parsed.data);
      if (r.kind === 'err') throw new Error(r.message);
      return { jobId: r.jobId, expiresAt: r.expiresAt };
    }
    case 'getNegotiation': {
      if (!deps.negotiations) throw new Error('negotiations not configured');
      const jobId = String(args.jobId ?? '');
      if (!jobId) throw new Error('validation: jobId is required');
      const job = deps.negotiations.get(jobId);
      if (!job) throw new Error('unknown negotiation');
      return {
        state: job.state, round: job.round, transcript: job.transcript,
        ...(job.outcome !== undefined ? { outcome: job.outcome } : {}),
        ...(job.rejectReason !== undefined ? { rejectReason: job.rejectReason } : {}),
      };
    }
    case 'cancelNegotiation': {
      if (!deps.negotiations) throw new Error('negotiations not configured');
      const jobId = String(args.jobId ?? '');
      if (!jobId) throw new Error('validation: jobId is required');
      if (!deps.negotiations.cancel(jobId)) throw new Error('negotiation not active or unknown');
      return { state: 'cancelled' };
    }
    case 'markShipped': {
      const f = requireFulfilment(deps);
      const agreementId = String(args.agreementId ?? '');
      const carrier = String(args.carrier ?? '');
      if (!agreementId || !carrier) throw new Error('validation: agreementId and carrier are required');
      return f.markShipped(agreementId, {
        carrier,
        ...(typeof args.tracking === 'string' ? { tracking: args.tracking } : {}),
        ...(typeof args.eta === 'string' ? { eta: args.eta } : {}),
      });
    }
    case 'confirmDelivery': {
      const f = requireFulfilment(deps);
      const agreementId = String(args.agreementId ?? '');
      if (!agreementId) throw new Error('validation: agreementId is required');
      return f.confirmDelivery(agreementId);
    }
    case 'ingestFulfilment': {
      const f = requireFulfilment(deps);
      const type = String(args.type ?? '');
      const fromHash = String(args.fromHash ?? '');
      const payload = (args.payload && typeof args.payload === 'object' ? args.payload : null) as Record<string, unknown> | null;
      if (!fromHash || !payload) throw new Error('validation: type, fromHash and payload are required');
      const record = type === 'shipment'
        ? await f.applyInboundShipment(payload as never, fromHash)
        : type === 'delivery'
          ? await f.applyInboundDelivery(payload as never, fromHash)
          : (() => { throw new Error(`validation: unknown fulfilment type "${type}"`); })();
      return { applied: record !== null, record };
    }
    case 'getFulfilment': {
      const f = requireFulfilment(deps);
      const agreementId = String(args.agreementId ?? '');
      if (!agreementId) throw new Error('validation: agreementId is required');
      const record = await f.status(agreementId);
      return record ? { found: true, fulfilment: record } : { found: false };
    }
    case 'openEscrow': {
      const e = requireEscrow(deps);
      const a = String(args.agreementId ?? '');
      if (!a || !args.escrowAddress || !args.releaseTo || !args.refundTo || !args.arbiterPubkey) {
        throw new Error('validation: agreementId, escrowAddress, releaseTo, refundTo, arbiterPubkey are required');
      }
      return { escrow: await e.openEscrow(a, {
        escrowAddress: String(args.escrowAddress), releaseTo: String(args.releaseTo), refundTo: String(args.refundTo),
        arbiterPubkey: String(args.arbiterPubkey),
        ...(args.escrowMode === 'notary' ? { escrowMode: 'notary' as const } : {}),
        ...(typeof args.fundDeadlineMs === 'number' ? { fundDeadlineMs: args.fundDeadlineMs } : {}),
        ...(typeof args.autoReleaseMs === 'number' ? { autoReleaseMs: args.autoReleaseMs } : {}),
        ...(typeof args.disputeWindowMs === 'number' ? { disputeWindowMs: args.disputeWindowMs } : {}),
      }) };
    }
    case 'getEscrowFundInstruction': {
      const e = requireEscrow(deps);
      return { instruction: await e.getFundInstruction(reqId(args)) };
    }
    case 'getEscrowReleaseInstruction': {
      const e = requireEscrow(deps);
      return { instruction: await e.buildRelease(reqId(args), args.arbiterOverride === 'release' ? { arbiterOverride: 'release' } : {}) };
    }
    case 'getEscrowRefundInstruction': {
      const e = requireEscrow(deps);
      return { instruction: await e.buildRefund(reqId(args), args.arbiterOverride === 'refund' ? { arbiterOverride: 'refund' } : {}) };
    }
    case 'markEscrowFunded': return { escrow: await requireEscrow(deps).markFunded(reqId(args), reqTx(args)) };
    case 'markEscrowReleased': return { escrow: await requireEscrow(deps).markReleased(reqId(args), reqTx(args)) };
    case 'markEscrowRefunded': return { escrow: await requireEscrow(deps).markRefunded(reqId(args), reqTx(args)) };
    case 'raiseDispute': {
      const e = requireEscrow(deps);
      const reason = String(args.reason ?? '');
      if (!reason) throw new Error('validation: reason is required');
      const { record, payload } = await e.raiseDispute(reqId(args), reason);
      return { escrow: record, payload };
    }
    case 'ingestDispute': {
      const e = requireEscrow(deps);
      const payload = (args.payload && typeof args.payload === 'object' ? args.payload : null) as Record<string, unknown> | null;
      if (!payload) throw new Error('validation: payload is required');
      const escrow = await e.applyInboundDispute(payload as never);
      return { applied: escrow !== null, escrow };
    }
    case 'reconcileEscrow': {
      const e = requireEscrow(deps);
      const leg = String(args.leg ?? '');
      if (leg !== 'fund' && leg !== 'release' && leg !== 'refund') throw new Error('validation: leg must be fund/release/refund');
      const escrow = await e.reconcile({ agreementId: reqId(args), leg, txHash: reqTx(args) });
      return { reconciled: escrow !== null, escrow };
    }
    case 'getEscrow': {
      const escrow = await requireEscrow(deps).get(reqId(args));
      return escrow ? { found: true, escrow } : { found: false };
    }

    // ── TASKS — human↔agent task inbox ────────────────────────────────
    case 'listTasks': {
      const opts = {
        ...(typeof args.since === 'number' ? { since: args.since } : {}),
        ...(typeof args.status === 'string' ? { status: args.status as 'open' | 'working' | 'done' | 'cancelled' } : {}),
        ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
      };
      return { tasks: await requireTasks(deps).listTasks(opts) };
    }
    case 'listMessages': {
      const taskId = String(args.taskId ?? '');
      if (!taskId) throw new Error('validation: taskId is required');
      const t = await requireTasks(deps).getTask(taskId);
      if (!t) throw new Error(`task not found: ${taskId}`);
      return { taskId: t.id, title: t.title, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt, messages: t.messages };
    }
    case 'postMessage': {
      const taskId = String(args.taskId ?? '');
      const text = String(args.text ?? '');
      if (!taskId || !text) throw new Error('validation: taskId and text are required');
      // MCP callers are the agent's brain (the human side is the phone via the
      // instance bridge over JSON-RPC) — always post as 'agent', never human.
      const role = 'agent';
      try {
        const t = await requireTasks(deps).appendMessage(taskId, role, text);
        return { taskId: t.id, status: t.status, updatedAt: t.updatedAt, messageCount: t.messages.length };
      } catch (e) {
        if (e instanceof TaskNotFoundError) throw new Error(e.message);
        throw e;
      }
    }
    case 'setTaskStatus': {
      const taskId = String(args.taskId ?? '');
      const status = String(args.status ?? '');
      if (status !== 'open' && status !== 'working' && status !== 'done' && status !== 'cancelled') {
        throw new Error('validation: status must be open/working/done/cancelled');
      }
      try {
        const t = await requireTasks(deps).setStatus(taskId, status);
        return { taskId: t.id, status: t.status };
      } catch (e) {
        if (e instanceof TaskNotFoundError) throw new Error(e.message);
        throw e;
      }
    }
    case 'postTask': {
      const text = String(args.text ?? '');
      if (!text) throw new Error('validation: text is required');
      const t = await requireTasks(deps).createTask(text);
      return { taskId: t.id, status: t.status, createdAt: t.createdAt };
    }

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function requireTasks(deps: ServerDeps): NonNullable<ServerDeps['tasks']> {
  if (!deps.tasks) throw new Error('task inbox not configured');
  return deps.tasks;
}

function requireFulfilment(deps: ServerDeps): NonNullable<ServerDeps['fulfilment']> {
  if (!deps.fulfilment) throw new Error('fulfilment engine not configured');
  return deps.fulfilment;
}

function requireEscrow(deps: ServerDeps): NonNullable<ServerDeps['escrow']> {
  if (!deps.escrow) throw new Error('escrow engine not configured');
  return deps.escrow;
}

function reqId(args: Record<string, unknown>): string {
  const a = String(args.agreementId ?? '');
  if (!a) throw new Error('validation: agreementId is required');
  return a;
}

function reqTx(args: Record<string, unknown>): string {
  const t = String(args.txHash ?? '');
  if (!t) throw new Error('validation: txHash is required');
  return t;
}

function requireEngine(deps: ServerDeps): NonNullable<ServerDeps['engine']> {
  if (!deps.engine) {
    throw new Error('agreement engine not configured (this MCP instance has no signing identity)');
  }
  return deps.engine;
}
