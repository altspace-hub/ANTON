/**
 * webhook-listener.ts
 * Core event processing pipeline for event-driven workflow triggers.
 * Handles: receive → validate → filter → rate-limit → deduplicate → transform → execute.
 *
 * Security: HMAC-SHA256 for GitHub/GitLab, Slack signing secret, Bearer token for Teams.
 * Secrets encrypted at rest via credential-vault (encryptConfig/decryptConfig).
 */

import { randomUUID } from 'crypto';
import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

import { encryptConfig, decryptConfig } from './credential-vault.js';

export type TriggerType = 'webhook' | 'git_push' | 'slack_event' | 'teams_event' | 'mcp_event' | 'internal' | 'market_event';
export type EventStatus = 'received' | 'validated' | 'filtered_out' | 'rate_limited' | 'deduplicated' | 'triggered' | 'failed';
export type AuthMethod = 'hmac_sha256' | 'signing_secret' | 'bearer_token' | 'none';

export interface AuthConfig {
  method: AuthMethod;
  secret?: string;             // Encrypted with credential-vault
  header?: string;             // Custom header name (for generic HMAC)
  prefix?: string;             // Signature prefix (e.g. "sha256=")
}

export interface FilterConfig {
  branch?: string;             // git_push: match refs/heads/<branch>
  file_patterns?: string[];    // git_push: glob patterns for changed files
  channel?: string;            // slack_event: channel ID
  keywords?: string[];         // slack_event: message keywords
  event_type?: string;         // mcp_event: event type field
  severity?: string[];         // internal: severity levels
  radar_item_id?: string;      // internal: specific radar item
}

export interface WebhookTrigger {
  id: string;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  workflow_id: string;
  endpoint_path: string;
  auth_config: AuthConfig;
  filter_config: FilterConfig;
  payload_mapping: Record<string, string>;
  rate_limit_max: number;
  rate_limit_window_seconds: number;
  cooldown_seconds: number;
  status: 'active' | 'paused' | 'error';
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface RawTriggerRow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  workflow_id: string;
  endpoint_path: string;
  auth_config: string;
  filter_config: string;
  payload_mapping: string;
  rate_limit_max: number;
  rate_limit_window_seconds: number;
  cooldown_seconds: number;
  status: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

function parseTrigger(row: RawTriggerRow): WebhookTrigger {
  const rawAuth = JSON.parse(row.auth_config || '{}') as AuthConfig;
  // Decrypt secret if present
  if (rawAuth.secret) {
    try {
      const decrypted = decryptConfig({ secret: rawAuth.secret });
      rawAuth.secret = (decrypted as { secret: string }).secret;
    } catch {
      // Keep encrypted value if decryption fails — will fail auth check
    }
  }

  return {
    ...row,
    trigger_type: row.trigger_type as TriggerType,
    status: row.status as WebhookTrigger['status'],
    auth_config: rawAuth,
    filter_config: JSON.parse(row.filter_config || '{}'),
    payload_mapping: JSON.parse(row.payload_mapping || '{}'),
  };
}

export interface InternalEvent {
  source: 'regulatory_radar' | 'compliance_rules' | 'file_watcher';
  [key: string]: unknown;
}

export interface ProcessResult {
  status: EventStatus;
  event_id: string;
  workflow_run_id?: string;
  error?: string;
}

export async function createWebhookListener(db: DatabaseAdapter) {
  /**
   * Create a new webhook trigger. Encrypts the secret before storing.
   */
  async function createTrigger(input: {
    name: string;
    description?: string;
    trigger_type: TriggerType;
    workflow_id: string;
    auth_config: AuthConfig;
    filter_config?: FilterConfig;
    payload_mapping?: Record<string, string>;
    rate_limit_max?: number;
    rate_limit_window_seconds?: number;
    cooldown_seconds?: number;
    user_id?: string;
  }): Promise<WebhookTrigger> {
    const id = randomUUID();
    const endpoint_path = `/api/webhooks/inbound/${id}`;
    const now = new Date().toISOString();

    // Encrypt secret before storing
    const authToStore = { ...input.auth_config };
    if (authToStore.secret) {
      const encrypted = encryptConfig({ secret: authToStore.secret });
      authToStore.secret = (encrypted as { secret: string }).secret;
    }

    await db.run(`
      INSERT INTO webhook_triggers
        (id, name, description, trigger_type, workflow_id, endpoint_path, auth_config,
         filter_config, payload_mapping, rate_limit_max, rate_limit_window_seconds,
         cooldown_seconds, status, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `,
      id, input.name, input.description ?? null,
      input.trigger_type, input.workflow_id, endpoint_path,
      JSON.stringify(authToStore),
      JSON.stringify(input.filter_config ?? {}),
      JSON.stringify(input.payload_mapping ?? {}),
      input.rate_limit_max ?? 60,
      input.rate_limit_window_seconds ?? 60,
      input.cooldown_seconds ?? 300,
      input.user_id ?? 'default',
      now, now,
    );

    return (await getTrigger(id))!;
  }

  /**
   * Get trigger by ID.
   */
  async function getTrigger(triggerId: string): Promise<WebhookTrigger | null> {
    const row = await db.get('SELECT * FROM webhook_triggers WHERE id = ?', triggerId) as RawTriggerRow | undefined;
    return row ? parseTrigger(row) : null;
  }

  /**
   * Get trigger by endpoint path (used when inbound webhook arrives).
   */
  async function getTriggerByEndpoint(endpointPath: string): Promise<WebhookTrigger | null> {
    const row = await db.get('SELECT * FROM webhook_triggers WHERE endpoint_path = ?', endpointPath) as RawTriggerRow | undefined;
    return row ? parseTrigger(row) : null;
  }

  /**
   * List triggers.
   */
  async function listTriggers(userId?: string): Promise<WebhookTrigger[]> {
    const rows = userId
      ? await db.all('SELECT * FROM webhook_triggers WHERE user_id = ? ORDER BY created_at DESC', userId) as RawTriggerRow[]
      : await db.all('SELECT * FROM webhook_triggers ORDER BY created_at DESC') as RawTriggerRow[];
    return rows.map(parseTrigger);
  }

  /**
   * Update trigger status (active/paused).
   */
  async function setTriggerStatus(triggerId: string, status: 'active' | 'paused'): Promise<void> {
    await db.run(`UPDATE webhook_triggers SET status = ?, updated_at = NOW() WHERE id = ?`, status, triggerId);
  }

  /**
   * Delete a trigger.
   */
  async function deleteTrigger(triggerId: string): Promise<boolean> {
    const result = await db.run('DELETE FROM webhook_triggers WHERE id = ?', triggerId);
    return result.changes > 0;
  }

  // ── AUTHENTICATION ─────────────────────────────────────────────────────────

  function validateHmacSha256(
    body: string,
    secret: string,
    signatureHeader: string,
    prefix = 'sha256=',
  ): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(body);
    const digest = prefix + hmac.digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
    } catch {
      return false;
    }
  }

  function validateSlackSigningSecret(
    body: string,
    secret: string,
    timestamp: string,
    slackSignature: string,
  ): boolean {
    const baseString = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(baseString);
    const digest = 'v0=' + hmac.digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(slackSignature));
    } catch {
      return false;
    }
  }

  function authenticateRequest(
    trigger: WebhookTrigger,
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): { valid: boolean; reason?: string } {
    const { method, secret } = trigger.auth_config;

    if (method === 'none') {
      // Only allowed for internal triggers
      if (trigger.trigger_type !== 'internal') {
        return { valid: false, reason: 'auth method "none" only allowed for internal triggers' };
      }
      return { valid: true };
    }

    if (!secret) return { valid: false, reason: 'auth secret not configured' };

    if (method === 'hmac_sha256') {
      const headerName = trigger.auth_config.header || 'x-hub-signature-256';
      const prefix = trigger.auth_config.prefix || 'sha256=';
      const sigHeader = String(headers[headerName] || headers[headerName.toLowerCase()] || '');
      if (!sigHeader) return { valid: false, reason: `missing signature header: ${headerName}` };
      const valid = validateHmacSha256(rawBody, secret, sigHeader, prefix);
      return valid ? { valid: true } : { valid: false, reason: 'HMAC signature mismatch' };
    }

    if (method === 'signing_secret') {
      // Slack signing secret
      const timestamp = String(headers['x-slack-request-timestamp'] || '');
      const slackSig = String(headers['x-slack-signature'] || '');
      if (!timestamp || !slackSig) return { valid: false, reason: 'missing Slack signature headers' };

      // Check timestamp freshness (5 min window to prevent replay)
      const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
      if (age > 300) return { valid: false, reason: 'Slack timestamp too old (replay prevention)' };

      const valid = validateSlackSigningSecret(rawBody, secret, timestamp, slackSig);
      return valid ? { valid: true } : { valid: false, reason: 'Slack signing secret mismatch' };
    }

    if (method === 'bearer_token') {
      const authHeader = String(headers['authorization'] || '');
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) return { valid: false, reason: 'missing Authorization: Bearer header' };
      try {
        const valid = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
        return valid ? { valid: true } : { valid: false, reason: 'bearer token mismatch' };
      } catch {
        return { valid: false, reason: 'invalid bearer token format' };
      }
    }

    return { valid: false, reason: `unknown auth method: ${method}` };
  }

  // ── FILTERING ──────────────────────────────────────────────────────────────

  function matchesFilters(trigger: WebhookTrigger, payload: Record<string, unknown>): boolean {
    const f = trigger.filter_config;

    if (trigger.trigger_type === 'git_push') {
      if (f.branch) {
        const ref = String(payload['ref'] || '');
        if (!ref.endsWith(f.branch) && ref !== f.branch) return false;
      }
    }

    if (trigger.trigger_type === 'slack_event') {
      if (f.channel) {
        const eventData = payload['event'] as Record<string, unknown> | undefined;
        const channel = String(eventData?.['channel'] || payload['channel'] || '');
        if (channel !== f.channel) return false;
      }
      if (f.keywords && f.keywords.length > 0) {
        const eventData = payload['event'] as Record<string, unknown> | undefined;
        const text = String(eventData?.['text'] || payload['text'] || '').toLowerCase();
        const hasKeyword = f.keywords.some((kw) => text.includes(kw.toLowerCase()));
        if (!hasKeyword) return false;
      }
    }

    if (trigger.trigger_type === 'mcp_event' && f.event_type) {
      const evType = String(payload['event_type'] || payload['type'] || '');
      if (evType !== f.event_type) return false;
    }

    if (trigger.trigger_type === 'internal') {
      if (f.severity && Array.isArray(f.severity)) {
        const sev = String(payload['severity'] || '');
        if (sev && !f.severity.includes(sev)) return false;
      }
      if (f.radar_item_id) {
        const itemId = String(payload['radar_item_id'] || '');
        if (itemId !== f.radar_item_id) return false;
      }
    }

    return true;
  }

  // ── RATE LIMITING ──────────────────────────────────────────────────────────

  async function checkRateLimit(trigger: WebhookTrigger): Promise<boolean> {
    const windowStart = new Date(Date.now() - trigger.rate_limit_window_seconds * 1000).toISOString();
    const row = await db.get(`
      SELECT COUNT(*) as count FROM webhook_events
      WHERE trigger_id = ? AND status = 'triggered' AND received_at >= ?
    `, trigger.id, windowStart) as { count: number };

    return row.count < trigger.rate_limit_max;
  }

  // ── DEDUPLICATION ─────────────────────────────────────────────────────────

  function computeDedupSignature(trigger: WebhookTrigger, payload: Record<string, unknown>): string {
    let keyData: string;
    if (trigger.trigger_type === 'git_push') {
      keyData = String(payload['after'] || payload['commit_sha'] || JSON.stringify(payload));
    } else if (trigger.trigger_type === 'slack_event') {
      const eventData = payload['event'] as Record<string, unknown> | undefined;
      keyData = String(eventData?.['ts'] || payload['ts'] || JSON.stringify(payload));
    } else {
      keyData = JSON.stringify(payload);
    }
    return crypto.createHash('sha256').update(keyData).digest('hex');
  }

  async function checkDedup(trigger: WebhookTrigger, signature: string): Promise<boolean> {
    const windowStart = new Date(Date.now() - trigger.cooldown_seconds * 1000).toISOString();
    const existing = await db.get(`
      SELECT id FROM webhook_events
      WHERE trigger_id = ? AND dedup_signature = ? AND received_at >= ?
        AND status NOT IN ('failed', 'filtered_out')
    `, trigger.id, signature, windowStart) as { id: string } | undefined;
    return existing === undefined; // true = proceed (not a duplicate)
  }

  // ── PAYLOAD MAPPING ────────────────────────────────────────────────────────

  function getJsonPath(obj: unknown, path: string): unknown {
    // Simple JSONPath: $.field.nested or $.array[*].field
    const parts = path.replace(/^\$\.?/, '').split(/\.|\[|\]/).filter(Boolean);
    let current: unknown = obj;
    for (const part of parts) {
      if (part === '*') {
        if (Array.isArray(current)) {
          return current.map((item) => item);
        }
        return undefined;
      }
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  function mapPayload(
    mapping: Record<string, string>,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [varName, jsonPath] of Object.entries(mapping)) {
      result[varName] = getJsonPath(payload, jsonPath);
    }
    return result;
  }

  // ── EVENT LOGGING ──────────────────────────────────────────────────────────

  async function logEvent(
    triggerId: string,
    status: EventStatus,
    payload?: Record<string, unknown>,
    extra?: {
      mappedVariables?: Record<string, unknown>;
      dedupSignature?: string;
      workflowRunId?: string;
      errorMessage?: string;
      processingMs?: number;
    },
  ): Promise<string> {
    const eventId = randomUUID();
    await db.run(`
      INSERT INTO webhook_events
        (id, trigger_id, received_at, status, payload, mapped_variables,
         dedup_signature, workflow_run_id, error_message, processing_ms)
      VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)
    `,
      eventId, triggerId, status,
      payload ? JSON.stringify(payload) : null,
      extra?.mappedVariables ? JSON.stringify(extra.mappedVariables) : null,
      extra?.dedupSignature ?? null,
      extra?.workflowRunId ?? null,
      extra?.errorMessage ?? null,
      extra?.processingMs ?? null,
    );
    return eventId;
  }

  async function updateEventStatus(
    eventId: string,
    status: EventStatus,
    extra?: { workflowRunId?: string; errorMessage?: string; processingMs?: number },
  ): Promise<void> {
    await db.run(`
      UPDATE webhook_events SET status = ?, workflow_run_id = ?, error_message = ?, processing_ms = ?
      WHERE id = ?
    `, status, extra?.workflowRunId ?? null, extra?.errorMessage ?? null, extra?.processingMs ?? null, eventId);
  }

  // ── WORKFLOW HANDOFF ───────────────────────────────────────────────────────

  async function initiateWorkflow(
    workflowId: string,
    triggerId: string,
    eventId: string,
    mappedVariables: Record<string, unknown>,
    userId: string,
  ): Promise<string> {
    const runId = randomUUID();
    const contextWithTrigger = {
      ...mappedVariables,
      _trigger_id: triggerId,
      _event_id: eventId,
    };

    await db.run(`
      INSERT INTO workflow_runs
        (id, workflow_id, trigger_source, status, current_step, user_id, started_at)
      VALUES (?, ?, 'event', 'pending', 0, ?, NOW())
    `, runId, workflowId, userId);

    // Store trigger context in run for executor to pick up
    await db.run(`
      UPDATE workflow_runs SET trigger_source = ? WHERE id = ?
    `, JSON.stringify({ type: 'event', variables: contextWithTrigger, trigger_id: triggerId }), runId);

    return runId;
  }

  // ── MAIN PIPELINE ──────────────────────────────────────────────────────────

  /**
   * Process an inbound HTTP webhook event (external: GitHub, Slack, Teams, generic).
   */
  async function processWebhookRequest(
    triggerId: string,
    rawBody: string,
    parsedPayload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    userId: string = 'default',
  ): Promise<ProcessResult> {
    const start = Date.now();

    // Step 1: Look up trigger
    const trigger = await getTrigger(triggerId);
    if (!trigger) {
      return { status: 'failed', event_id: '', error: 'trigger not found' };
    }
    if (trigger.status !== 'active') {
      return { status: 'filtered_out', event_id: '', error: 'trigger is paused' };
    }

    // Log received
    const eventId = await logEvent(triggerId, 'received', parsedPayload);

    // Step 2: Authenticate
    const authResult = authenticateRequest(trigger, rawBody, headers);
    if (!authResult.valid) {
      await updateEventStatus(eventId, 'failed', {
        errorMessage: authResult.reason,
        processingMs: Date.now() - start,
      });
      return { status: 'failed', event_id: eventId, error: authResult.reason };
    }
    await updateEventStatus(eventId, 'validated');

    // Step 3: Filter
    if (!matchesFilters(trigger, parsedPayload)) {
      await updateEventStatus(eventId, 'filtered_out', { processingMs: Date.now() - start });
      return { status: 'filtered_out', event_id: eventId };
    }

    // Step 4: Rate limit
    if (!(await checkRateLimit(trigger))) {
      await updateEventStatus(eventId, 'rate_limited', { processingMs: Date.now() - start });
      return { status: 'rate_limited', event_id: eventId };
    }

    // Step 5: Dedup
    const dedupSig = computeDedupSignature(trigger, parsedPayload);
    if (!(await checkDedup(trigger, dedupSig))) {
      await updateEventStatus(eventId, 'deduplicated', { processingMs: Date.now() - start });
      return { status: 'deduplicated', event_id: eventId };
    }

    // Step 6: Map payload
    const mappedVariables = mapPayload(trigger.payload_mapping, parsedPayload);

    // Step 7: Initiate workflow
    const runId = await initiateWorkflow(trigger.workflow_id, trigger.id, eventId, mappedVariables, userId);

    await updateEventStatus(eventId, 'triggered', {
      workflowRunId: runId,
      processingMs: Date.now() - start,
    });

    // Update dedup signature after successful trigger
    await db.run('UPDATE webhook_events SET dedup_signature = ?, mapped_variables = ? WHERE id = ?', 
      dedupSig,
      JSON.stringify(mappedVariables),
      eventId,
    );

    return { status: 'triggered', event_id: eventId, workflow_run_id: runId };
  }

  /**
   * Process an internal event (from regulatory radar, compliance rules, file watcher).
   * Skips HTTP-specific auth; enters pipeline at filtering stage.
   */
  async function processInternalEvent(
    source: InternalEvent['source'],
    payload: Record<string, unknown>,
    userId: string = 'default',
  ): Promise<ProcessResult[]> {
    const results: ProcessResult[] = [];

    // Find all active internal triggers matching this source
    const triggers = await db.all(`
      SELECT * FROM webhook_triggers
      WHERE trigger_type = 'internal' AND status = 'active'
    `) as RawTriggerRow[];

    for (const rawTrigger of triggers) {
      const trigger = parseTrigger(rawTrigger);
      const filterCfg = trigger.filter_config as FilterConfig & { source?: string };

      // Match source
      if (filterCfg.source && filterCfg.source !== source) continue;

      const start = Date.now();
      const eventId = await logEvent(trigger.id, 'received', { source, ...payload });

      if (!matchesFilters(trigger, payload)) {
        await updateEventStatus(eventId, 'filtered_out', { processingMs: Date.now() - start });
        results.push({ status: 'filtered_out', event_id: eventId });
        continue;
      }

      if (!(await checkRateLimit(trigger))) {
        await updateEventStatus(eventId, 'rate_limited', { processingMs: Date.now() - start });
        results.push({ status: 'rate_limited', event_id: eventId });
        continue;
      }

      const dedupSig = computeDedupSignature(trigger, payload);
      if (!(await checkDedup(trigger, dedupSig))) {
        await updateEventStatus(eventId, 'deduplicated', { processingMs: Date.now() - start });
        results.push({ status: 'deduplicated', event_id: eventId });
        continue;
      }

      const mappedVariables = mapPayload(trigger.payload_mapping, payload);
      const runId = await initiateWorkflow(trigger.workflow_id, trigger.id, eventId, mappedVariables, userId);

      await updateEventStatus(eventId, 'triggered', { workflowRunId: runId, processingMs: Date.now() - start });
      await db.run('UPDATE webhook_events SET dedup_signature = ?, mapped_variables = ? WHERE id = ?',
        dedupSig, JSON.stringify(mappedVariables), eventId,
      );

      results.push({ status: 'triggered', event_id: eventId, workflow_run_id: runId });
    }

    return results;
  }

  /**
   * Get event log for a trigger (paginated).
   */
  async function getEventLog(triggerId: string, limit = 50, offset = 0): Promise<Array<{
    id: string; received_at: string; status: string;
    workflow_run_id: string | null; error_message: string | null; processing_ms: number | null;
  }>> {
    return await db.all(`
      SELECT id, received_at, status, workflow_run_id, error_message, processing_ms
      FROM webhook_events
      WHERE trigger_id = ?
      ORDER BY received_at DESC
      LIMIT ? OFFSET ?
    `, triggerId, limit, offset) as Array<{
      id: string; received_at: string; status: string;
      workflow_run_id: string | null; error_message: string | null; processing_ms: number | null;
    }>;
  }

  /**
   * Replay a specific event (re-runs it through the full pipeline).
   */
  async function replayEvent(eventId: string, userId: string = 'default'): Promise<ProcessResult> {
    const row = await db.get(
      `SELECT trigger_id, payload FROM webhook_events WHERE id = ?`,
      eventId
    ) as { trigger_id: string; payload: string | null; } | undefined;

    if (!row || !row.payload) {
      return { status: 'failed', event_id: eventId, error: 'event not found or has no payload' };
    }

    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    return processWebhookRequest(row.trigger_id, JSON.stringify(payload), payload, {}, userId);
  }

  /**
   * Get aggregate metrics for a trigger.
   */
  async function getTriggerMetrics(triggerId: string, hours = 24): Promise<{
    events_received: number; events_triggered: number;
    events_filtered: number; events_failed: number; avg_processing_ms: number;
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const row = await db.get(`
      SELECT
        COUNT(*) as events_received,
        SUM(CASE WHEN status = 'triggered' THEN 1 ELSE 0 END) as events_triggered,
        SUM(CASE WHEN status = 'filtered_out' THEN 1 ELSE 0 END) as events_filtered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as events_failed,
        AVG(processing_ms) as avg_processing_ms
      FROM webhook_events
      WHERE trigger_id = ? AND received_at >= ?
    `, triggerId, since) as {
      events_received: number; events_triggered: number;
      events_filtered: number; events_failed: number; avg_processing_ms: number;
    } | undefined;

    return {
      events_received: row?.events_received ?? 0,
      events_triggered: row?.events_triggered ?? 0,
      events_filtered: row?.events_filtered ?? 0,
      events_failed: row?.events_failed ?? 0,
      avg_processing_ms: row?.avg_processing_ms ?? 0,
    };
  }

  return {
    createTrigger,
    getTrigger,
    getTriggerByEndpoint,
    listTriggers,
    setTriggerStatus,
    deleteTrigger,
    processWebhookRequest,
    processInternalEvent,
    getEventLog,
    replayEvent,
    getTriggerMetrics,
  };
}
