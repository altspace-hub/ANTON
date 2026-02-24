#!/usr/bin/env node
/**
 * openEXPERT MCP Server
 * Exposes openEXPERT modules as tools for Claude Desktop and other MCP clients.
 *
 * Setup in Claude Desktop config:
 * {
 *   "mcpServers": {
 *     "openexpert": {
 *       "command": "node",
 *       "args": ["/path/to/openexpert/dist/server/mcp/openexpert-mcp.js"],
 *       "env": { "OPENEXPERT_URL": "http://localhost:3001" }
 *     }
 *   }
 * }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

const OPENEXPERT_URL = process.env.OPENEXPERT_URL || 'http://localhost:3001';

// The MCP server communicates over stdio; all console output must go to stderr
// so it does not corrupt the stdio protocol channel.
const log = (...args: unknown[]) => console.error('[openEXPERT MCP]', ...args);

const server = new Server(
  { name: 'openexpert', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ── API helpers ─────────────────────────────────────────────────────────────

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${OPENEXPERT_URL}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json();
}

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${OPENEXPERT_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'list_areas',
    description:
      'List all available expert areas in openEXPERT (e.g., FCP, Legal, Audit, HR, etc.) with their IDs, names, and module counts.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'list_modules',
    description:
      'List all expert modules in a specific area with their IDs and descriptions. Use list_areas first to find area IDs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        area_id: {
          type: 'string',
          description:
            'The area ID (e.g., "fcp", "legal", "audit"). Get valid IDs from list_areas.',
        },
      },
      required: ['area_id'],
    },
  },
  {
    name: 'run_module',
    description:
      'Run an openEXPERT expert module with a specific question or task. Returns structured expert analysis. Use list_areas + list_modules to find the right module_id.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        module_id: {
          type: 'string',
          description:
            'The module ID to run (e.g., "gap-analysis", "contract-review"). Get IDs from list_modules.',
        },
        area_id: {
          type: 'string',
          description:
            'The area ID the module belongs to (e.g., "fcp", "legal"). Get IDs from list_areas.',
        },
        message: {
          type: 'string',
          description:
            'Your question or task description. Be specific and provide all relevant context.',
        },
        thinking_level: {
          type: 'string',
          enum: ['quick', 'think', 'think_hard', 'investigate'],
          description:
            'Analysis depth. Default: think. Use investigate for complex analysis requiring deep reasoning.',
        },
        model: {
          type: 'string',
          enum: [
            'claude-opus-4-6',
            'claude-sonnet-4-5-20250929',
            'claude-haiku-4-5-20251001',
          ],
          description:
            'Model to use. Default: claude-sonnet-4-5-20250929 for speed. Use claude-opus-4-6 for highest quality.',
        },
      },
      required: ['module_id', 'message'],
    },
  },
  {
    name: 'quick_analysis',
    description:
      'Run a quick expert analysis without selecting a specific module. openEXPERT will use its general knowledge to answer the question.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description: 'Your question or analysis request.',
        },
        thinking_level: {
          type: 'string',
          enum: ['quick', 'think', 'think_hard', 'investigate'],
          description: 'Analysis depth. Default: think.',
        },
      },
      required: ['question'],
    },
  },
];

// ── Request handlers ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ── list_areas ─────────────────────────────────────────────────────────
    if (name === 'list_areas') {
      const areas = await apiGet('/api/areas') as Array<{
        id: string;
        name: string;
        shortName?: string;
        description?: string;
        modules?: unknown[];
      }>;

      if (!Array.isArray(areas)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(areas, null, 2) }] };
      }

      const lines = areas.map((a) => {
        const moduleCount = Array.isArray(a.modules) ? a.modules.length : 0;
        const short = a.shortName ? ` (${a.shortName})` : '';
        const desc = a.description ? `\n    ${a.description}` : '';
        return `• ${a.id}${short}: ${a.name} — ${moduleCount} module${moduleCount !== 1 ? 's' : ''}${desc}`;
      });

      const text = `Available expert areas in openEXPERT (${areas.length} total):\n\n${lines.join('\n')}`;
      return { content: [{ type: 'text' as const, text }] };
    }

    // ── list_modules ───────────────────────────────────────────────────────
    if (name === 'list_modules') {
      const { area_id } = args as { area_id: string };

      const area = await apiGet(`/api/areas/${encodeURIComponent(area_id)}`) as {
        id: string;
        name: string;
        modules?: Array<{ id: string; name: string; description?: string; defaultThinking?: string }>;
      };

      if (!area || !Array.isArray(area.modules)) {
        return {
          content: [{ type: 'text' as const, text: `No modules found for area: ${area_id}` }],
        };
      }

      const lines = area.modules.map((m) => {
        const desc = m.description ? `\n    ${m.description}` : '';
        const thinking = m.defaultThinking ? ` [default thinking: ${m.defaultThinking}]` : '';
        return `• ${m.id}${thinking}: ${m.name}${desc}`;
      });

      const text = `Modules in area "${area.name}" (${area.modules.length} total):\n\n${lines.join('\n')}`;
      return { content: [{ type: 'text' as const, text }] };
    }

    // ── run_module ─────────────────────────────────────────────────────────
    if (name === 'run_module') {
      const {
        module_id,
        area_id,
        message,
        thinking_level = 'think',
        model = 'claude-sonnet-4-5-20250929',
      } = args as {
        module_id: string;
        area_id?: string;
        message: string;
        thinking_level?: string;
        model?: string;
      };

      log(`run_module: module=${module_id} area=${area_id || 'auto'} thinking=${thinking_level}`);

      const data = await apiPost('/api/claude/message-sync', {
        moduleId: module_id,
        areaId: area_id || null,
        userMessage: message,
        thinking: thinking_level,
        creativity: 'balanced',
        model,
        outputFormats: [],
        knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false } },
        history: [],
      }) as { content?: string; text?: string; error?: string };

      if (data.error) {
        throw new Error(data.error);
      }

      const text = data.content || data.text || JSON.stringify(data, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    }

    // ── quick_analysis ─────────────────────────────────────────────────────
    if (name === 'quick_analysis') {
      const {
        question,
        thinking_level = 'think',
      } = args as { question: string; thinking_level?: string };

      log(`quick_analysis: thinking=${thinking_level}`);

      const data = await apiPost('/api/claude/message-sync', {
        moduleId: null,
        areaId: null,
        userMessage: question,
        thinking: thinking_level,
        creativity: 'balanced',
        model: 'claude-sonnet-4-5-20250929',
        outputFormats: [],
        knowledgeSources: { claudeKnowledge: { enabled: true, webSearchEnabled: false } },
        history: [],
      }) as { content?: string; text?: string; error?: string };

      if (data.error) {
        throw new Error(data.error);
      }

      const text = data.content || data.text || JSON.stringify(data, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`Tool error [${name}]:`, msg);
    return {
      content: [{ type: 'text' as const, text: `Error: ${msg}` }],
      isError: true,
    };
  }
});

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`openEXPERT MCP server running (stdio) — connected to ${OPENEXPERT_URL}`);
}

main().catch((err) => {
  console.error('[openEXPERT MCP] Fatal error:', err);
  process.exit(1);
});
