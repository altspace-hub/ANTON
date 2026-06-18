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
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
