# openEXPERT MCP Server

openEXPERT can be used as an MCP (Model Context Protocol) server, allowing Claude Desktop and other MCP clients to use openEXPERT's 145+ expert modules as tools directly from their interface.

## How it works

The MCP server (`server/mcp/openexpert-mcp.ts`) runs as a standalone stdio process and connects to the openEXPERT HTTP API running on localhost. It exposes four tools that MCP clients (like Claude Desktop) can call:

- **list_areas** — Discover the 29+ expert areas (FCP, Legal, Audit, HR, etc.)
- **list_modules** — Browse all modules in a specific area
- **run_module** — Run a specific expert module with your question
- **quick_analysis** — Run a general expert analysis without selecting a module

## Prerequisites

- openEXPERT running locally (`pnpm dev` or `pnpm start`) — the MCP server connects to it at `http://localhost:3001`
- Claude Desktop (or another MCP client) installed
- Node.js 18+

## Setup

### 1. Build the MCP server

```bash
cd /path/to/openexpert
pnpm run mcp:build
```

This compiles `server/mcp/openexpert-mcp.ts` to `dist/server/mcp/openexpert-mcp.js`.

### 2. Configure Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "openexpert": {
      "command": "node",
      "args": ["/absolute/path/to/openexpert/dist/server/mcp/openexpert-mcp.js"],
      "env": {
        "OPENEXPERT_URL": "http://localhost:3001"
      }
    }
  }
}
```

Replace `/absolute/path/to/openexpert` with the actual path to your openEXPERT installation.

### 3. Start openEXPERT

```bash
pnpm start
# or for development:
pnpm dev
```

### 4. Restart Claude Desktop

Close and reopen Claude Desktop. The openEXPERT tools will appear in the tool panel (the hammer icon).

## Available Tools

| Tool | Description | Required inputs |
|------|-------------|-----------------|
| `list_areas` | List all 29+ expert areas with module counts | none |
| `list_modules` | List modules in a specific area | `area_id` |
| `run_module` | Run an expert module with your question | `module_id`, `message` |
| `quick_analysis` | Quick analysis without module selection | `question` |

### run_module options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `module_id` | string | required | Module ID from `list_modules` |
| `area_id` | string | optional | Area ID for module context |
| `message` | string | required | Your question or task |
| `thinking_level` | enum | `think` | `quick`, `think`, `think_hard`, `investigate` |
| `model` | enum | `claude-sonnet-4-5-20250929` | Claude model to use |

## Example Usage in Claude Desktop

Once configured, you can use natural language:

> "Use openEXPERT to run a gap analysis on my AML policy"

> "List the available legal modules in openEXPERT"

> "Run the gap-analysis module in the fcp area on this question: How does our current customer due diligence process compare to AMLR 2024 requirements?"

> "Use openEXPERT quick analysis: What are the key obligations under DORA for ICT third-party risk management?"

## Running in Development (without building)

You can run the MCP server directly with `tsx` during development:

```bash
pnpm run mcp
```

To use this with Claude Desktop in development mode, change the command in the config:

```json
{
  "mcpServers": {
    "openexpert": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/openexpert/server/mcp/openexpert-mcp.ts"],
      "env": {
        "OPENEXPERT_URL": "http://localhost:3001"
      }
    }
  }
}
```

## Testing with MCP Inspector

You can test the MCP server independently using the MCP Inspector tool:

```bash
npx @modelcontextprotocol/inspector pnpm run mcp
```

This opens a browser-based UI where you can call each tool and inspect the responses without needing Claude Desktop.

## Architecture Notes

- The MCP server communicates over **stdio** — all output goes to stderr to avoid corrupting the protocol channel. Only structured MCP protocol data is written to stdout.
- The MCP server calls `POST /api/claude/message-sync` — a dedicated non-streaming endpoint added alongside the existing SSE streaming endpoint. This endpoint composes the same prompts and uses the same module system, but returns a plain JSON `{ content, thinking, inputTokens, outputTokens }` response.
- Authentication: the sync endpoint respects the same auth middleware as all other `/api` routes. In solo deployment mode (the default), no credentials are needed from localhost.
- The `OPENEXPERT_URL` environment variable controls which openEXPERT instance to connect to. Default: `http://localhost:3001`.
