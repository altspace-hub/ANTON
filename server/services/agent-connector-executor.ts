/**
 * agent-connector-executor.ts — Execute external API calls and database queries for agents
 *
 * Agents can have connectors (REST APIs, databases, webhooks) that they call
 * as tools during conversation. The AI decides when a connector is needed,
 * returns a structured tool call, and this executor runs it and returns the result.
 *
 * SECURITY MODEL — READ THIS BEFORE RELAXING ANYTHING HERE.
 *
 * The `toolCall` reaching executeCall() is parsed out of the MODEL'S FREE TEXT
 * (see parseToolCalls). That text is influenced by whatever the agent read — an
 * inbound /agents/public/query message, a delegated peer task, a fetched
 * document. So every field of a tool call must be treated as ATTACKER-CONTROLLED
 * input, not as an instruction the model chose. The connector's declared surface
 * (config.endpoints / config.tables) is the operator's intent; the tool call is
 * merely a request against it, and this file is where the two are reconciled.
 *
 * That reconciliation used not to happen. buildToolDescriptions() rendered
 * config.endpoints into the system prompt as an advisory list, and executeCall()
 * never consulted it — method, path and body all came straight from the model
 * and were dispatched with the operator's vault-decrypted credentials. The SQL
 * branch took the query verbatim and ran it unparameterised on ANTON's own
 * database.
 *
 * Enforced now:
 * - Credentials encrypted at rest via credential-vault
 * - REST: (method, path) MUST match an endpoint the operator declared;
 *   write verbs require an explicit per-connector opt-in
 * - SQL: SELECT-only, no statement separators or comments (so a second
 *   statement is structurally impossible), and every referenced table must be
 *   in an allowlist that FAILS CLOSED when empty
 * - Webhook: the HMAC covers the exact bytes transmitted
 * - SSRF guard + no redirect following on every egress
 * - Results truncated to prevent context overflow
 *
 * STILL OPEN (architectural, tracked separately): the tool-call channel itself.
 * A ```tool_call fence matched by regex means any text the model can be induced
 * to emit is a command. The durable fix is the provider's native structured
 * tool-use API, so only a schema-validated tool_use block can dispatch. Until
 * then the controls in this file are what bound the damage.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { decryptConfig } from './credential-vault.js';
import { assertSafeEgressUrl } from '../lib/ssrf-guard.js';

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

/** HTTP verbs a REST connector may use without an explicit write opt-in. */
const READ_ONLY_METHODS = new Set(['GET', 'HEAD']);

export interface DeclaredEndpoint { method: string; path: string; description?: string; params?: string[] }

/**
 * Does the model's requested (method, path) match something the OPERATOR declared?
 *
 * config.endpoints was previously advisory — rendered into the system prompt and
 * never checked — so a connector advertising only `GET /contacts` would happily
 * dispatch `DELETE /v2/contacts/all` with the operator's Bearer token attached.
 *
 * Matching is exact on method, and on path allows a declared `:id` / `{id}`
 * segment to match exactly one non-empty, non-slash segment. Deliberately NOT a
 * prefix or wildcard match: `/admin/users` must not be reachable because
 * `/admin` was declared.
 *
 * Fails CLOSED — an empty or malformed `endpoints` list permits nothing. A
 * connector with no declared surface is not a connector with an open surface.
 */
export function matchesDeclaredEndpoint(
  method: string,
  path: string,
  endpoints: DeclaredEndpoint[],
): boolean {
  if (!Array.isArray(endpoints) || endpoints.length === 0) return false;
  const wantMethod = String(method || '').toUpperCase();
  // Compare path only — a query string is carried separately and must not let
  // `/contacts?x=1` masquerade as the declared `/contacts`.
  const wantPath = normalisePath(String(path || '').split('?')[0]?.split('#')[0] ?? '');
  if (!wantPath) return false;
  // `..` can never appear in a legitimately declared path and is the obvious way
  // to climb out of a declared prefix once the URL is joined to base_url.
  if (wantPath.includes('..')) return false;

  return endpoints.some((e) => {
    if (!e || typeof e.method !== 'string' || typeof e.path !== 'string') return false;
    if (e.method.toUpperCase() !== wantMethod) return false;
    const declared = normalisePath(e.path).split('/');
    const actual = wantPath.split('/');
    if (declared.length !== actual.length) return false;
    return declared.every((seg, i) => {
      const isParam = (seg.startsWith(':') && seg.length > 1)
        || (seg.startsWith('{') && seg.endsWith('}') && seg.length > 2);
      if (isParam) return actual[i]!.length > 0;
      return seg.toLowerCase() === actual[i]!.toLowerCase();
    });
  });
}

function normalisePath(p: string): string {
  const t = p.trim();
  const withSlash = t.startsWith('/') ? t : '/' + t;
  // Drop a trailing slash so `/contacts` and `/contacts/` are the same path,
  // but keep the root as '/'.
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

/** Strip string literals and comments so table extraction can't be fooled by them. */
function stripLiteralsAndComments(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, "''")     // single-quoted literals
    .replace(/"(?:[^"]|"")*"/g, '""')     // quoted identifiers
    .replace(/--[^\n]*/g, ' ')            // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ');   // block comments
}

/**
 * Tables a SELECT actually reads, taken from FROM/JOIN clauses.
 *
 * The previous check was `allowedTables.some(t => query.toUpperCase().includes(t))`
 * — a substring test over the whole query, satisfied by putting an allowed table
 * name in a trailing comment while selecting from something else entirely.
 * Extracting the real FROM/JOIN targets and requiring EVERY one to be allowed is
 * what makes the allowlist mean anything.
 *
 * This is a heuristic, not a parser; it is the second line of defence behind
 * SELECT-only and the no-separator rule, not a substitute for either. A genuine
 * SQL parser (or better, operator-defined parameterised templates) is the
 * durable answer.
 */
export function referencedTables(sql: string): string[] {
  const stripped = stripLiteralsAndComments(sql);

  // CTE names are query-local aliases, not tables — `WITH x AS (...) SELECT * FROM x`
  // reads no relation called `x`. Collect them so they aren't demanded of the
  // allowlist. This cannot be used to launder access: the CTE's own body is still
  // scanned, so `WITH orders AS (SELECT * FROM user_sessions) SELECT * FROM orders`
  // still surfaces `user_sessions` and is still rejected.
  const cteNames = new Set<string>();
  const cteRe = /(?:\bWITH\s+(?:RECURSIVE\s+)?|,\s*)([A-Za-z_][A-Za-z0-9_$]*)\s+AS\s*\(/gi;
  let c: RegExpExecArray | null;
  while ((c = cteRe.exec(stripped)) !== null) cteNames.add(c[1]!.toLowerCase());

  const out: string[] = [];
  const re = /\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const name = m[1]!;
    if (!cteNames.has(name.toLowerCase())) out.push(name);
  }
  return out;
}

export interface SqlGuardResult { ok: boolean; error?: string }

/**
 * Gate a model-authored query before it touches ANTON's own database.
 *
 * The load-bearing rule is the separator ban. `db.all(sql)` passes no values, so
 * pg's requiresPreparation() is false (values.length > 0) and it dispatches via
 * connection.query(text) — the SIMPLE protocol, which executes MULTIPLE
 * statements in one round trip. That is how `SELECT 1;/**\/DO $$ ... $$;--` became
 * arbitrary PL/pgSQL despite a SELECT-only check: the old blocklist matched only
 * `;\s*(DROP|DELETE|...)`, missing DO/GRANT/COPY/CALL/SET and defeated by any
 * comment between the semicolon and the keyword.
 *
 * Rather than extend a keyword blocklist — which cannot be made complete —
 * forbid the separator and comments outright. A single SELECT needs neither, so
 * a second statement becomes structurally impossible instead of merely
 * unrecognised. The cost is that a literal containing ';' or '--' is rejected;
 * that is the right trade for model-authored SQL.
 */
export function guardLocalSelect(rawQuery: string, allowedTables: string[]): SqlGuardResult {
  const query = String(rawQuery ?? '').trim();
  if (!query) return { ok: false, error: 'Empty query' };

  if (!/^SELECT\s/i.test(query) && !/^WITH\s/i.test(query)) {
    return { ok: false, error: 'Only SELECT queries are allowed (read-only)' };
  }
  if (query.includes(';')) {
    return { ok: false, error: 'Statement separators are not allowed — send exactly one SELECT' };
  }
  if (query.includes('--') || query.includes('/*')) {
    return { ok: false, error: 'SQL comments are not allowed' };
  }

  // Fail CLOSED. Previously an empty allowlist SKIPPED the check entirely, so a
  // connector configured without `tables` could read every table in the database
  // — credentials, sessions, engagement content, community identities.
  if (!Array.isArray(allowedTables) || allowedTables.length === 0) {
    return { ok: false, error: 'This connector declares no readable tables — configure config.tables' };
  }

  const allowed = new Set(allowedTables.map(t => String(t).toLowerCase()));
  const referenced = referencedTables(query);
  if (referenced.length === 0) {
    return { ok: false, error: 'Query must read from a declared table' };
  }
  for (const t of referenced) {
    // Accept either a bare name or a schema-qualified one whose table part is allowed.
    const bare = t.includes('.') ? t.split('.').pop()! : t;
    if (!allowed.has(t.toLowerCase()) && !allowed.has(bare.toLowerCase())) {
      return { ok: false, error: `Query must reference only: ${allowedTables.join(', ')}` };
    }
  }
  return { ok: true };
}

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

        // The model asked for this (method, path); the OPERATOR declared what is
        // callable. Reconcile the two before any credential is attached.
        const declared = (config.endpoints ?? []) as DeclaredEndpoint[];
        if (!matchesDeclaredEndpoint(method, path, declared)) {
          return {
            success: false, connectorName: connector.name, data: null,
            error: `Not a declared endpoint for this connector: ${method} ${path}`,
            durationMs: Date.now() - startTime,
          };
        }
        // Write verbs need an explicit per-connector opt-in even when declared —
        // an operator who lists a POST endpoint for their own use should not
        // thereby make it reachable by whatever text the agent happens to read.
        if (!READ_ONLY_METHODS.has(method) && config.allow_write_methods !== true) {
          return {
            success: false, connectorName: connector.name, data: null,
            error: `${method} requires config.allow_write_methods = true on this connector`,
            durationMs: Date.now() - startTime,
          };
        }

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
          // SSRF: never follow redirects — an allowed host could 302 to
          // 169.254.169.254 or a private address, defeating assertSafeEgressUrl
          // (which only validates the INITIAL url). Same pattern as
          // mission-delivery.ts.
          redirect: 'manual',
        };
        if (['POST', 'PUT', 'PATCH'].includes(method) && toolCall.params.body) {
          fetchOpts.body = JSON.stringify(toolCall.params.body);
        }

        await assertSafeEgressUrl(fullUrl); // SSRF guard — block private/link-local/metadata targets
        const response = await fetch(fullUrl, fetchOpts);
        if (response.status >= 300 && response.status < 400) {
          return {
            success: false, connectorName: connector.name,
            data: null, error: `Redirect (HTTP ${response.status}) not followed — SSRF guard; configure the final URL directly`,
            durationMs: Date.now() - startTime,
          };
        }
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

        // Use a separate connection if external DB is configured, otherwise use local
        const connString = (credentials.connection_string ?? config.connection_string) as string | undefined;
        // Both branches run model-authored SQL, so both take the same gate. The
        // external branch was already marginally safer (it passes a values array,
        // which puts pg on the extended protocol) but nothing stopped a
        // separator there either, and it reaches a database the operator owns.
        const guard = guardLocalSelect(query, (config.tables ?? []) as string[]);
        if (!guard.ok) {
          return {
            success: false, connectorName: connector.name,
            data: null, error: guard.error ?? 'Query rejected',
            durationMs: Date.now() - startTime,
          };
        }

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
          // Local database — ANTON's OWN db, full privileges. guardLocalSelect
          // above has already required SELECT-only, no separators, no comments,
          // and a non-empty table allowlist that every FROM/JOIN target satisfies.
          const rows = await db.all(query);
          result = { rows: (rows as unknown[]).slice(0, 100), rowCount: (rows as unknown[]).length };
        }
      }

      // ── Webhook Connector ───────────────────────────────────────────
      else if (connector.connector_type === 'webhook') {
        const webhookUrl = (config.url ?? config.webhook_url) as string;
        if (!webhookUrl) throw new Error('No webhook URL configured');

        // Sign the EXACT bytes we transmit. This previously HMAC'd
        // JSON.stringify(toolCall.params) while sending {action, params,
        // timestamp} — so the signature did not cover the payload at all: a
        // receiver verifying over the received body got a mismatch, and one
        // verifying over `params` alone left `action` and `timestamp` unsigned
        // and mutable in transit. Serialise once, sign that, send that.
        const webhookBody = JSON.stringify({
          action: toolCall.action, params: toolCall.params, timestamp: Date.now(),
        });
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (credentials.secret) {
          const { createHmac } = await import('crypto');
          headers['X-Webhook-Signature'] = createHmac('sha256', credentials.secret as string)
            .update(webhookBody).digest('hex');
        }

        await assertSafeEgressUrl(webhookUrl); // SSRF guard — block private/link-local/metadata targets
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: webhookBody,
          signal: AbortSignal.timeout(Number(config.timeout_ms ?? 10_000)),
          redirect: 'manual', // SSRF: don't follow a redirect to a private target
        });
        if (response.status >= 300 && response.status < 400) {
          return {
            success: false, connectorName: connector.name,
            data: null, error: `Redirect (HTTP ${response.status}) not followed — SSRF guard; configure the final URL directly`,
            durationMs: Date.now() - startTime,
          };
        }

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

      // Truncate result if too large. NOTE: never JSON.parse a sliced blob —
      // slicing serialized JSON at an arbitrary offset is invalid JSON, so the
      // old `JSON.parse(slice + '..."')` threw for essentially every >8KB
      // response and turned it into success:false (2026-07-17 fix). Return a
      // marked preview instead so the agent still sees the leading content.
      const resultStr = JSON.stringify(result);
      const truncated = resultStr.length > MAX_RESULT_LENGTH
        ? { _truncated: true, totalLength: resultStr.length, preview: resultStr.slice(0, MAX_RESULT_LENGTH) }
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
