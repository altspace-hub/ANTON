/**
 * agent-connector-executor.ts — Execute external API calls and database queries for agents
 *
 * Agents can have connectors (REST APIs, databases, webhooks) that they call
 * as tools during conversation. The AI decides when a connector is needed,
 * returns a structured tool call, and this executor runs it and returns the result.
 *
 * Security:
 * - Credentials encrypted at rest via credential-vault
 * - SQL queries are read-only (SELECT only) by default
 * - API calls have configurable timeout (default 10s)
 * - Results are truncated to prevent context overflow
 */

import type { DatabaseAdapter } from '../db/database.js';
import { decryptConfig } from './credential-vault.js';

export interface ConnectorConfig {
  id: string;
  name: string;
  connector_type: string;
  description: string | null;
  config: Record<string, unknown>;
  auth_config: Record<string, unknown>;
  is_active: boolean;
}

export interface ConnectorCallResult {
  success: boolean;
  connectorName: string;
  data: unknown;
  error?: string;
  durationMs: number;
}

const MAX_RESULT_LENGTH = 8000; // Truncate results to prevent context overflow

export async function createConnectorExecutor(db: DatabaseAdapter) {

  /**
   * Get all active connectors for an agent, with credentials decrypted.
   */
  async function getAgentConnectors(agentId: string): Promise<ConnectorConfig[]> {
    const connectors = await db.all<{
      id: string; name: string; connector_type: string; description: string | null;
      config: string; auth_config: string; is_active: boolean;
    }>(
      'SELECT id, name, connector_type, description, config, auth_config, is_active FROM agent_connectors WHERE agent_id = ? AND is_active = TRUE',
      agentId
    );

    return connectors.map(c => ({
      ...c,
      config: typeof c.config === 'string' ? JSON.parse(c.config) : c.config,
      auth_config: typeof c.auth_config === 'string' ? JSON.parse(c.auth_config) : c.auth_config,
    }));
  }

  /**
   * Build tool descriptions for the AI from an agent's connectors.
   * These are included in the system prompt so the AI knows what tools are available.
   */
  function buildToolDescriptions(connectors: ConnectorConfig[]): string {
    if (connectors.length === 0) return '';

    const toolDescs = connectors.map(c => {
      const config = c.config;
      if (c.connector_type === 'rest_api') {
        const endpoints = (config.endpoints ?? []) as Array<{ method: string; path: string; description: string; params?: string[] }>;
        return `TOOL: ${c.name} (REST API)\nDescription: ${c.description ?? 'External API'}\nEndpoints:\n${
          endpoints.map(e => `  - ${e.method} ${e.path}: ${e.description}${e.params ? ` (params: ${e.params.join(', ')})` : ''}`).join('\n')
        }`;
      }
      if (c.connector_type === 'database') {
        const tables = (config.tables ?? []) as string[];
        return `TOOL: ${c.name} (Database)\nDescription: ${c.description ?? 'Database query'}\nAvailable tables: ${tables.join(', ')}\nNote: READ-ONLY queries only (SELECT)`;
      }
      if (c.connector_type === 'webhook') {
        return `TOOL: ${c.name} (Webhook)\nDescription: ${c.description ?? 'Webhook trigger'}\nTrigger: POST to configured URL with payload`;
      }
      return `TOOL: ${c.name} (${c.connector_type})\nDescription: ${c.description ?? c.connector_type}`;
    });

    return `\n\nAVAILABLE TOOLS:\nYou have access to the following external tools. To use a tool, respond with a JSON block:\n\`\`\`tool_call\n{"tool": "<connector_name>", "action": "<method_or_query>", "params": {<parameters>}}\n\`\`\`\n\nThe system will execute the tool and provide the result. Then continue your response using the result.\n\n${toolDescs.join('\n\n')}`;
  }

  /**
   * Execute a tool call against a connector.
   */
  async function executeCall(agentId: string, toolCall: {
    tool: string;
    action: string;
    params: Record<string, unknown>;
  }): Promise<ConnectorCallResult> {
    const startTime = Date.now();

    // Find the connector
    const connector = await db.get<{
      id: string; name: string; connector_type: string;
      config: string; auth_config: string;
    }>(
      'SELECT id, name, connector_type, config, auth_config FROM agent_connectors WHERE agent_id = ? AND name = ? AND is_active = TRUE',
      agentId, toolCall.tool
    );

    if (!connector) {
      return { success: false, connectorName: toolCall.tool, data: null, error: `Connector "${toolCall.tool}" not found`, durationMs: Date.now() - startTime };
    }

    const config = typeof connector.config === 'string' ? JSON.parse(connector.config) : connector.config;
    const authConfig = typeof connector.auth_config === 'string' ? JSON.parse(connector.auth_config) : connector.auth_config;

    // Decrypt auth credentials
    let credentials: Record<string, unknown> = {};
    try {
      if (authConfig && Object.keys(authConfig).length > 0) {
        credentials = decryptConfig(authConfig);
      }
    } catch { /* no encrypted credentials */ }

    try {
      let result: unknown;

      // ── REST API Connector ──────────────────────────────────────────
      if (connector.connector_type === 'rest_api') {
        const baseUrl = (config.base_url ?? config.baseUrl ?? '') as string;
        if (!baseUrl) throw new Error('No base_url configured');

        const method = (toolCall.action ?? 'GET').toUpperCase();
        const path = (toolCall.params.path ?? toolCall.params.endpoint ?? '') as string;
        const url = `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : '/' + path}`;

        // Build headers
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (credentials.api_key) headers['Authorization'] = `Bearer ${credentials.api_key as string}`;
        if (credentials.x_api_key) headers['X-API-Key'] = credentials.x_api_key as string;
        const customHeaders = (config.headers ?? {}) as Record<string, string>;
        Object.assign(headers, customHeaders);

        // Build query params for GET
        const queryParams = (toolCall.params.query ?? {}) as Record<string, string>;
        const queryString = Object.entries(queryParams).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        const fullUrl = queryString ? `${url}?${queryString}` : url;

        const fetchOpts: RequestInit = {
          method,
          headers,
          signal: AbortSignal.timeout(Number(config.timeout_ms ?? 10_000)),
        };
        if (['POST', 'PUT', 'PATCH'].includes(method) && toolCall.params.body) {
          fetchOpts.body = JSON.stringify(toolCall.params.body);
        }

        const response = await fetch(fullUrl, fetchOpts);
        const contentType = response.headers.get('content-type') ?? '';

        if (contentType.includes('json')) {
          result = await response.json();
        } else {
          result = await response.text();
        }

        if (!response.ok) {
          return {
            success: false, connectorName: connector.name,
            data: result, error: `HTTP ${response.status}`,
            durationMs: Date.now() - startTime,
          };
        }
      }

      // ── Database Connector ──────────────────────────────────────────
      else if (connector.connector_type === 'database') {
        const query = (toolCall.action ?? toolCall.params.query ?? '') as string;

        // Security: only allow SELECT statements
        const normalizedQuery = query.trim().toUpperCase();
        if (!normalizedQuery.startsWith('SELECT')) {
          return {
            success: false, connectorName: connector.name,
            data: null, error: 'Only SELECT queries are allowed (read-only)',
            durationMs: Date.now() - startTime,
          };
        }

        // Disallow dangerous patterns
        if (/;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE)/i.test(query)) {
          return {
            success: false, connectorName: connector.name,
            data: null, error: 'Query contains disallowed statements',
            durationMs: Date.now() - startTime,
          };
        }

        // Use a separate connection if external DB is configured, otherwise use local
        const connString = (credentials.connection_string ?? config.connection_string) as string | undefined;
        if (connString) {
          // External database — use pg directly
          const { default: pg } = await import('pg');
          const client = new pg.Client({ connectionString: connString, connectionTimeoutMillis: 5000 });
          await client.connect();
          try {
            const res = await client.query(query, (toolCall.params.values ?? []) as unknown[]);
            result = { rows: res.rows.slice(0, 100), rowCount: res.rowCount, fields: res.fields?.map(f => f.name) };
          } finally {
            await client.end();
          }
        } else {
          // Local database (read-only query on ANTON's own DB)
          const allowedTables = (config.tables ?? []) as string[];
          if (allowedTables.length > 0) {
            const hasAllowedTable = allowedTables.some(t => normalizedQuery.includes(t.toUpperCase()));
            if (!hasAllowedTable) {
              return {
                success: false, connectorName: connector.name,
                data: null, error: `Query must reference one of: ${allowedTables.join(', ')}`,
                durationMs: Date.now() - startTime,
              };
            }
          }
          const rows = await db.all(query);
          result = { rows: (rows as unknown[]).slice(0, 100), rowCount: (rows as unknown[]).length };
        }
      }

      // ── Webhook Connector ───────────────────────────────────────────
      else if (connector.connector_type === 'webhook') {
        const webhookUrl = (config.url ?? config.webhook_url) as string;
        if (!webhookUrl) throw new Error('No webhook URL configured');

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (credentials.secret) {
          const { createHmac } = await import('crypto');
          const body = JSON.stringify(toolCall.params);
          headers['X-Webhook-Signature'] = createHmac('sha256', credentials.secret as string).update(body).digest('hex');
        }

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: toolCall.action, params: toolCall.params, timestamp: Date.now() }),
          signal: AbortSignal.timeout(Number(config.timeout_ms ?? 10_000)),
        });

        result = response.headers.get('content-type')?.includes('json')
          ? await response.json() : await response.text();
      }

      // ── Unknown Connector Type ──────────────────────────────────────
      else {
        return {
          success: false, connectorName: connector.name,
          data: null, error: `Unsupported connector type: ${connector.connector_type}`,
          durationMs: Date.now() - startTime,
        };
      }

      // Truncate result if too large
      const resultStr = JSON.stringify(result);
      const truncated = resultStr.length > MAX_RESULT_LENGTH
        ? JSON.parse(resultStr.slice(0, MAX_RESULT_LENGTH) + '..."')
        : result;

      // Update last_used_at
      await db.run('UPDATE agent_connectors SET last_used_at = NOW(), last_error = NULL WHERE id = ?', connector.id);

      return { success: true, connectorName: connector.name, data: truncated, durationMs: Date.now() - startTime };

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await db.run('UPDATE agent_connectors SET last_error = ? WHERE id = ?', errorMsg, connector.id);
      return {
        success: false, connectorName: connector.name,
        data: null, error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Parse tool calls from AI response text.
   * Looks for ```tool_call JSON blocks.
   */
  function parseToolCalls(text: string): Array<{ tool: string; action: string; params: Record<string, unknown> }> {
    const calls: Array<{ tool: string; action: string; params: Record<string, unknown> }> = [];
    const regex = /```tool_call\s*\n?([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.tool) calls.push(parsed);
      } catch { /* skip malformed tool calls */ }
    }
    return calls;
  }

  return { getAgentConnectors, buildToolDescriptions, executeCall, parseToolCalls };
}
