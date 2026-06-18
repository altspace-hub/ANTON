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
import { COLLAB_VERBS } from './server.js';
import { searchPortals, resolvePortal, portalVerbs } from './discovery.js';
import { invokeCapability, capabilityForVerb } from './talk.js';

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

async function dispatchMcpTool(
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
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function requireEngine(deps: ServerDeps): NonNullable<ServerDeps['engine']> {
  if (!deps.engine) {
    throw new Error('agreement engine not configured (this MCP instance has no signing identity)');
  }
  return deps.engine;
}
