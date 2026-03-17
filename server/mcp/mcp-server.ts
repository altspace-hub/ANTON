/**
 * mcp-server.ts
 * HTTP MCP (Model Context Protocol) endpoint for ANTON.
 *
 * Exposes ANTON capabilities over HTTP so external tools such as
 * Cursor and Claude Code can connect without requiring browser auth.
 *
 * Routes (mounted at /mcp in server/index.ts):
 *   GET  /mcp/tools     — list available tools in MCP format
 *   POST /mcp/execute   — execute a tool call
 *
 * Auth: none (MCP clients do not perform browser auth).
 * Rate limit: 10 requests per minute per IP.
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { DatabaseAdapter } from '../db/database.js';
import { MCP_TOOLS, createMcpToolExecutor } from './mcp-tools.js';

// ── Rate limiter: 10 requests per minute ────────────────────────────────────

const mcpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: 'MCP rate limit exceeded — max 10 requests per minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Router factory ───────────────────────────────────────────────────────────

export async function createMcpRouter(db: Database): Router {
  const router = Router();
  const executor = createMcpToolExecutor(db);

  // Apply rate limiter to all MCP routes
  router.use(mcpLimiter);

  /**
   * GET /mcp/tools
   * Returns the list of available ANTON tools in MCP format.
   */
  router.get('/tools', async (_req: Request, res: Response) => {
    res.json({ tools: MCP_TOOLS });
  });

  /**
   * POST /mcp/execute
   * Executes a tool call.
   *
   * Body: { "tool": string, "parameters": Record<string, unknown> }
   * Returns: { "result": unknown }
   */
  router.post('/execute', async (req: Request, res: Response) => {
    const { tool, parameters } = req.body as {
      tool?: unknown;
      parameters?: unknown;
    };

    // Validate request shape
    if (!tool || typeof tool !== 'string') {
      res.status(400).json({
        error: 'Request body must include a "tool" field (string).',
        example: { tool: 'score_quality', parameters: { content: 'Your text here' } },
      });
      return;
    }

    const params =
      parameters && typeof parameters === 'object' && !Array.isArray(parameters)
        ? (parameters as Record<string, unknown>)
        : {};

    // Validate that the requested tool exists
    const knownTools = MCP_TOOLS.map((t) => t.name);
    if (!knownTools.includes(tool)) {
      res.status(400).json({
        error: `Unknown tool: "${tool}".`,
        available_tools: knownTools,
      });
      return;
    }

    try {
      const result = await executor.execute(tool, params);
      res.json(result);
    } catch (err) {
      console.error('[mcp] Tool execution error:', err);
      res.status(500).json({
        error: 'Tool execution failed.',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * GET /mcp
   * Root info endpoint — useful for health checks and client discovery.
   */
  router.get('/', async (_req: Request, res: Response) => {
    res.json({
      name: 'ANTON MCP Endpoint',
      version: '1.0.0',
      description: 'HTTP MCP interface for ANTON — Financial Crime Prevention AI Workbench',
      endpoints: {
        tools: 'GET /mcp/tools',
        execute: 'POST /mcp/execute',
      },
      tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
      note: 'No authentication required. Rate limited to 10 req/min per IP.',
    });
  });

  return router;
}
