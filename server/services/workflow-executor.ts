// ═══════════════════════════════════════════════════════════
// Headless Workflow Executor — runs workflow steps that
// do not require frontend interaction (API calls, DB queries,
// transforms, waits, decision gates).
// Used by the scheduler for automatic/scheduled execution.
// ═══════════════════════════════════════════════════════════

import type { DatabaseAdapter } from '../db/database.js';

import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import type { WorkflowDefinition, WorkflowStep } from '../../src/lib/workflow-definitions.js';
import { resolveTemplate } from '../routes/workflows.js';
import { createConnectionManager } from './connection-manager.js';
import pkg from 'pg';
const { Client: PgClient } = pkg;
import mysql from 'mysql2/promise';
import sql from 'mssql';

// Canonical step-type catalogue lives in workflow-step-registry.ts
// (single source of truth — see /docs/architecture/24-workflow-engine.md).
import {
  HEADLESS_STEP_IDS as HEADLESS_STEP_TYPES,
  INTERACTIVE_STEP_IDS as INTERACTIVE_STEP_TYPES,
  isRegisteredStepType,
  resolveExplicitDbDriver,
} from './workflow-step-registry.js';

interface ExecutionResult {
  success: boolean;
  runId: string;
  stepsCompleted: number;
  stepsSkipped: number;
  error?: string;
}

/**
 * Execute a workflow headlessly (for scheduled runs).
 * Steps requiring user interaction are skipped gracefully.
 */
export async function executeScheduledWorkflow(
  db: DatabaseAdapter,
  workflowId: string,
  scheduleId: number
): Promise<ExecutionResult> {
  const runId = randomUUID();
  let stepsCompleted = 0;
  let stepsSkipped = 0;

  // Fetch the workflow definition from the schedule record (stored at creation time)
  const scheduleRow = await db.get(
    "SELECT workflow_definition FROM workflow_schedules WHERE id = ? AND workflow_id = ?"
  , scheduleId, workflowId) as { workflow_definition: string | null } | undefined;

  let workflow: WorkflowDefinition;
  if (scheduleRow?.workflow_definition) {
    workflow = JSON.parse(scheduleRow.workflow_definition) as WorkflowDefinition;
  } else {
    // Also try workflow_definitions table (from schema_enhanced.sql)
    try {
      const defRow = await db.get(
        "SELECT steps, config FROM workflow_definitions WHERE id = ?"
      , workflowId) as { steps: string; config: string } | undefined;
      if (defRow) {
        const steps = JSON.parse(defRow.steps || '[]');
        const config = JSON.parse(defRow.config || '{}');
        workflow = { id: workflowId, label: config.label || workflowId, shortLabel: '', icon: 'ClipboardList', description: '', category: 'custom', estimatedTime: '', steps, tags: [] };
      } else {
        recordRun(db, runId, workflowId, scheduleId, 'failed', 'Workflow definition not found');
        return { success: false, runId, stepsCompleted: 0, stepsSkipped: 0, error: 'Workflow definition not found — attach definition when creating schedule' };
      }
    } catch {
      recordRun(db, runId, workflowId, scheduleId, 'failed', 'Workflow definition not found');
      return { success: false, runId, stepsCompleted: 0, stepsSkipped: 0, error: 'Workflow definition not found' };
    }
  }

  // Record the run as started
  recordRun(db, runId, workflowId, scheduleId, 'running');

  const context: Record<string, unknown> = {
    workflow: { id: workflow.id, label: workflow.label },
    _scheduled: true,
    _scheduleId: scheduleId,
    _startedAt: new Date().toISOString(),
  };

  try {
    const steps = workflow.steps || [];
    let stepIndex = 0;

    while (stepIndex < steps.length) {
      const step = steps[stepIndex];
      const stepType = step.type;

      // Skip interactive steps
      if (INTERACTIVE_STEP_TYPES.has(stepType)) {
        console.log(`[workflow-executor] Skipping interactive step ${stepIndex}: ${stepType} (${step.label})`);
        stepsSkipped++;
        stepIndex++;
        continue;
      }

      // Approval gate: pause execution and wait for external approval
      if (stepType === 'approval') {
        console.log(`[workflow-executor] Pausing at approval step ${stepIndex}: ${step.label}`);
        updateRun(db, runId, 'awaiting_approval', `Paused at step ${stepIndex} (${step.label}) — awaiting approval`);
        // Store step index so we can resume from here
        try {
          await db.run(
            "UPDATE workflow_runs SET error_message = ? WHERE id = ?",
            JSON.stringify({ awaitingStep: stepIndex, stepLabel: step.label }),
            runId
          );
        } catch { /* non-fatal */ }
        return { success: true, runId, stepsCompleted, stepsSkipped };
      }

      try {
        // Retry with exponential backoff for transient errors
        let lastErr: Error | null = null;
        let output: Record<string, unknown> = {};
        let skippedToStepId: string | undefined;
        const maxRetries = 3;
        const retryDelays = [2000, 4000, 8000];

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const result = await executeHeadlessStep(step, context, db, runId);
            output = result.output;
            skippedToStepId = result.skippedToStepId;
            lastErr = null;
            break;
          } catch (retryErr) {
            lastErr = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
            // Only retry on transient errors (network/rate-limit/server errors)
            const msg = lastErr.message.toLowerCase();
            const isTransient = msg.includes('timeout') || msg.includes('econnreset') ||
              msg.includes('429') || msg.includes('503') || msg.includes('502') ||
              msg.includes('network') || msg.includes('abort');
            if (!isTransient || attempt === maxRetries - 1) throw lastErr;
            console.warn(`[workflow-executor] Step ${stepIndex} attempt ${attempt + 1} failed (transient), retrying in ${retryDelays[attempt]}ms...`);
            await new Promise(r => setTimeout(r, retryDelays[attempt]));
          }
        }
        if (lastErr) throw lastErr;

        // Merge output into context
        const outputVar = step.config?.outputVariable;
        if (outputVar && output[outputVar] !== undefined) {
          context[outputVar] = output[outputVar];
        } else {
          const key = `step_${stepIndex + 1}`;
          context[key] = output;
        }

        stepsCompleted++;

        // ── onCompleteTrigger: fire a new workflow run when this step completes ──
        const trigger = step.config?.onCompleteTrigger;
        if (trigger?.type === 'start_workflow' && trigger.workflowId) {
          try {
            const newRunId = randomUUID();
            const triggerVars: Record<string, unknown> = {};
            if (trigger.variables) {
              for (const [k, v] of Object.entries(trigger.variables)) {
                // Resolve {{variable}} references from context
                triggerVars[k] = resolveTemplate(v, context);
              }
            }
            await db.run(`
              INSERT INTO workflow_runs (id, workflow_id, trigger_source, status, user_id, started_at)
              VALUES (?, ?, ?, 'pending', ?, NOW())
            `, newRunId,
              trigger.workflowId,
              JSON.stringify({ type: 'event', source: 'step_complete', triggeredBy: runId, stepId: step.id, label: trigger.label || '', variables: triggerVars }),
              'system');
            console.log(`[workflow-executor] Step trigger: started workflow ${trigger.workflowId} run ${newRunId}`);
          } catch (triggerErr) {
            console.warn('[workflow-executor] onCompleteTrigger failed (non-fatal):', triggerErr);
          }
        }

        // Handle decision gate skip
        if (skippedToStepId) {
          const targetIdx = steps.findIndex((s) => s.id === skippedToStepId);
          if (targetIdx >= 0) {
            stepsSkipped += targetIdx - stepIndex - 1;
            stepIndex = targetIdx;
            continue;
          }
        }

        stepIndex++;
      } catch (stepErr) {
        const msg = stepErr instanceof Error ? stepErr.message : String(stepErr);
        console.error(`[workflow-executor] Step ${stepIndex} failed: ${msg}`);
        updateRun(db, runId, 'failed', `Step ${stepIndex} (${step.label || stepType}) failed: ${msg}`);
        return { success: false, runId, stepsCompleted, stepsSkipped, error: msg };
      }
    }

    // All steps completed
    updateRun(db, runId, 'completed');
    return { success: true, runId, stepsCompleted, stepsSkipped };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateRun(db, runId, 'failed', msg);
    return { success: false, runId, stepsCompleted, stepsSkipped, error: msg };
  }
}

// ── Headless step executor ─────────────────────────────────

async function executeHeadlessStep(
  step: WorkflowStep,
  context: Record<string, unknown>,
  db: DatabaseAdapter,
  runId: string
): Promise<{ output: Record<string, unknown>; skippedToStepId?: string }> {
  switch (step.type) {
    case 'decision_gate': {
      const cond = step.config?.decisionCondition;
      if (!cond) return { output: { conditionMet: true } };

      const left = resolveTemplate(cond.leftOperand, context);
      const right = cond.operator !== 'exists' ? resolveTemplate(cond.rightOperand, context) : '';
      const leftNum = parseFloat(left);
      const rightNum = parseFloat(right);

      let conditionMet = true;
      switch (cond.operator) {
        case '==': conditionMet = left === right; break;
        case '!=': conditionMet = left !== right; break;
        case '>': conditionMet = !isNaN(leftNum) && !isNaN(rightNum) ? leftNum > rightNum : left > right; break;
        case '<': conditionMet = !isNaN(leftNum) && !isNaN(rightNum) ? leftNum < rightNum : left < right; break;
        case '>=': conditionMet = !isNaN(leftNum) && !isNaN(rightNum) ? leftNum >= rightNum : left >= right; break;
        case '<=': conditionMet = !isNaN(leftNum) && !isNaN(rightNum) ? leftNum <= rightNum : left <= right; break;
        case 'contains': conditionMet = left.includes(right); break;
        case 'exists': conditionMet = left !== '' && left !== 'undefined' && left !== 'null'; break;
      }

      if (!conditionMet && step.config.onFalseSkipToStepId) {
        return { output: { conditionMet }, skippedToStepId: step.config.onFalseSkipToStepId };
      }
      return { output: { conditionMet } };
    }

    case 'transform': {
      const mappings = step.config?.fieldMappings ?? [];
      const transformed: Record<string, unknown> = {};
      for (const mapping of mappings) {
        transformed[mapping.destinationField] = resolveTemplate(mapping.sourcePath, context);
      }
      const outputVar = step.config?.outputVariable || 'transformed';
      return { output: { [outputVar]: transformed } };
    }

    case 'wait': {
      const seconds = step.config?.waitSeconds ?? 0;
      if (seconds > 0 && seconds <= 30) {
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      }
      return { output: { waitedSeconds: seconds, completedAt: new Date().toISOString() } };
    }

    case 'file_read': {
      const connId = step.config?.connectionId as string | undefined;
      if (!connId) throw new Error('file_read step requires a connectionId');

      let basePath: string;

      if (connId.startsWith('kl:')) {
        // Knowledge Library entry — resolve path from knowledge_library table
        const klId = connId.slice(3);
        const klEntry = await db.get('SELECT path FROM knowledge_library WHERE id = ?', klId) as { path: string } | undefined;
        if (!klEntry) throw new Error(`Knowledge Library entry not found: ${klId}`);
        basePath = klEntry.path;
      } else {
        // Regular filesystem connection
        const manager = await createConnectionManager(db);
        const conn = await manager.get(connId);
        if (!conn) throw new Error(`Connection not found: ${connId}`);
        if (conn.type !== 'filesystem') throw new Error('Connection is not a filesystem connection');
        const cfg = conn.config as Record<string, unknown>;
        basePath = cfg.base_path as string || cfg.path as string || '';
      }

      if (!basePath || !fs.existsSync(basePath)) {
        throw new Error(`Filesystem path does not exist: ${basePath}`);
      }

      // Validate path against ALLOWED_FOLDER_PATHS
      const allowedBases = (process.env.ALLOWED_FOLDER_PATHS ?? '').split(',').filter(Boolean);
      const resolved = path.resolve(basePath);
      if (allowedBases.length > 0 && !allowedBases.some(base => resolved.startsWith(path.resolve(base)))) {
        throw new Error('Folder access not permitted by ALLOWED_FOLDER_PATHS');
      }

      // Read files matching filter
      const filterStr = (step.config?.fileFilter as string || '').trim();
      const extensions = filterStr ? filterStr.split(',').map(e => e.trim().toLowerCase()) : [];
      const maxFiles = 50;

      const entries = fs.readdirSync(basePath, { withFileTypes: true });
      const files: { name: string; content: string; size: number }[] = [];

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (extensions.length > 0 && !extensions.some(ext => entry.name.toLowerCase().endsWith(ext))) continue;
        if (files.length >= maxFiles) break;

        const filePath = path.join(basePath, entry.name);
        const stat = fs.statSync(filePath);
        if (stat.size > 2 * 1024 * 1024) continue; // Skip files > 2MB

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          files.push({ name: entry.name, content, size: stat.size });
        } catch {
          // Skip unreadable files
        }
      }

      const outputVar = (step.config?.outputVariable as string) || 'file_content';
      return { output: { [outputVar]: { files, count: files.length, basePath } } };
    }

    case 'api_call': {
      if (!step.config?.connectionId) throw new Error('API call step requires connectionId');

      const manager = await createConnectionManager(db);
      const conn = await manager.get(step.config.connectionId);
      if (!conn) throw new Error(`Connection not found: ${step.config.connectionId}`);
      if (conn.type !== 'api') throw new Error(`Connection is not an API connection`);

      const cfg = conn.config as Record<string, unknown>;
      const baseUrl = cfg.base_url as string;
      const method = (step.config.method || 'GET').toUpperCase();
      const endpointPath = step.config.endpointPath
        ? resolveTemplate(step.config.endpointPath, context)
        : '';
      const url = `${baseUrl}${endpointPath}`;

      // SEC-21: Reject non-HTTPS schemes to prevent SSRF via javascript:, data:, file:, http: URIs
      if (!url.startsWith('https://')) {
        throw new Error(`API call blocked: URL scheme must be https:// (got: ${url.slice(0, 30)})`);
      }

      const headers: Record<string, string> = { ...(cfg.headers as Record<string, string> || {}) };
      if (step.config.headers) {
        for (const [k, v] of Object.entries(step.config.headers)) {
          headers[k] = typeof v === 'string' ? resolveTemplate(v, context) : String(v);
        }
      }

      let body: string | undefined;
      if (step.config.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        body = typeof step.config.body === 'string'
          ? resolveTemplate(step.config.body, context)
          : JSON.stringify(step.config.body);
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      }

      const outputVar = step.config.outputVariable || 'api_response';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), step.config.timeout_ms || 30000);

      try {
        const response = await fetch(url, { method, headers, body, signal: controller.signal });
        clearTimeout(timeout);

        const contentType = response.headers.get('content-type') || '';
        let data: unknown;
        if (contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        return {
          output: {
            [outputVar]: { status: response.status, ok: response.ok, data },
          },
        };
      } catch (error) {
        clearTimeout(timeout);
        throw new Error(`API call failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    case 'database_query': {
      if (!step.config?.connectionId) throw new Error('Database query step requires connectionId');

      const manager = await createConnectionManager(db);
      const conn = await manager.get(step.config.connectionId);
      if (!conn) throw new Error(`Connection not found: ${step.config.connectionId}`);

      const cfg = conn.config as Record<string, unknown>;
      // Driver must be explicit on the connection — never silently default (bug 0.8).
      const driver = resolveExplicitDbDriver(cfg);
      const query = step.config.queryTemplate
        ? resolveTemplate(step.config.queryTemplate, context)
        : '';
      const parameters = step.config.parameters || [];
      const maxRows = step.config.maxRows || 1000;
      const outputVar = step.config.outputVariable || 'query_result';

      let rows: unknown[] = [];
      let rowCount = 0;

      if (driver === 'postgresql') {
        const client = new PgClient({
          host: cfg.host as string, port: cfg.port as number,
          database: cfg.database as string, user: cfg.username as string,
          password: cfg.password as string,
          ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
          connectionTimeoutMillis: 10000, query_timeout: 30000,
        });
        await client.connect();
        const result = await client.query(query, parameters);
        rows = result.rows.slice(0, maxRows);
        rowCount = result.rowCount || 0;
        await client.end();
      } else if (driver === 'mysql') {
        const connection = await mysql.createConnection({
          host: cfg.host as string, port: cfg.port as number,
          database: cfg.database as string, user: cfg.username as string,
          password: cfg.password as string, connectTimeout: 10000,
        });
        const [results] = await connection.execute(query, parameters as (string | number | boolean | null | Date | Buffer)[]);
        rows = (Array.isArray(results) ? results : []).slice(0, maxRows);
        rowCount = rows.length;
        await connection.end();
      } else if (driver === 'mssql') {
        const pool = await sql.connect({
          server: cfg.host as string, port: cfg.port as number,
          database: cfg.database as string, user: cfg.username as string,
          password: cfg.password as string,
          options: { encrypt: cfg.ssl as boolean, trustServerCertificate: true },
          connectionTimeout: 10000, requestTimeout: 30000,
        });
        const result = await pool.request().query(query);
        rows = result.recordset.slice(0, maxRows);
        rowCount = result.recordset.length;
        await pool.close();
      } else if (driver === 'sqlite') {
        const { default: Database } = await import('better-sqlite3');
        const sqliteDb = new Database(cfg.host as string, { readonly: true });
        const stmt = sqliteDb.prepare(query);
        const allRows = parameters.length > 0 ? stmt.all(...parameters) : stmt.all();
        rows = allRows.slice(0, maxRows);
        rowCount = allRows.length;
        sqliteDb.close();
      } else {
        throw new Error(`Unsupported database driver: ${driver}`);
      }

      return {
        output: {
          [outputVar]: { rows, rowCount, driver },
        },
      };
    }

    case 'conditional':
      return { output: { status: 'evaluated' } };

    case 'notification': {
      const message = step.config?.messageTemplate
        ? resolveTemplate(step.config.messageTemplate, context)
        : '';
      console.log(`[workflow-executor] Notification: ${message}`);
      return { output: { resolvedMessage: message, sent: false, _stub: true, _note: 'Webhook not yet implemented' } };
    }

    case 'email_send': {
      const to = step.config?.toTemplate ? resolveTemplate(step.config.toTemplate, context) : '';
      const subject = step.config?.subjectTemplate ? resolveTemplate(step.config.subjectTemplate, context) : '';
      console.log(`[workflow-executor] Email stub: to="${to}" subject="${subject}"`);
      return { output: { to, subject, sent: false, _stub: true, _note: 'Email not yet implemented' } };
    }

    case 'messaging_notification': {
      const connectionId = step.config?.connectionId as string | undefined;
      if (!connectionId) {
        console.warn('[workflow-executor] messaging_notification: no connectionId configured');
        return { output: { sent: false, error: 'No connectionId configured' } };
      }

      const conn = await db.get(
        "SELECT * FROM connections WHERE id = ? AND type = 'messaging' AND status = 'active'"
      , connectionId) as { config: string } | undefined;

      if (!conn) {
        console.warn(`[workflow-executor] messaging_notification: connection ${connectionId} not found or not active`);
        return { output: { sent: false, error: 'Messaging connection not found or not active' } };
      }

      try {
        const { decryptConfig } = await import('./credential-vault.js');
        const cfg = decryptConfig(JSON.parse(conn.config) as Record<string, unknown>) as Record<string, unknown>;
        const platform = cfg.platform as string;
        const webhookUrl = cfg.webhook_url as string;

        const title = step.config.titleTemplate
          ? resolveTemplate(step.config.titleTemplate, context)
          : 'ANTON Workflow Notification';
        const body = step.config.bodyTemplate
          ? resolveTemplate(step.config.bodyTemplate, context)
          : 'Workflow step completed.';
        const url = step.config.linkUrl
          ? resolveTemplate(step.config.linkUrl, context)
          : undefined;
        const level = step.config.level || 'info';

        const msg = { title, body, url, level };

        if (platform === 'slack') {
          const { sendSlackMessage } = await import('./integrations/slack-webhook.js');
          const result = await sendSlackMessage({ webhookUrl }, msg);
          console.log(`[workflow-executor] Slack message sent: ${result.ok ? 'ok' : result.error}`);
          return { output: { sent: result.ok, platform: 'slack', error: result.error } };
        } else if (platform === 'teams') {
          const { sendTeamsMessage } = await import('./integrations/teams-webhook.js');
          const result = await sendTeamsMessage({ webhookUrl }, msg);
          console.log(`[workflow-executor] Teams message sent: ${result.ok ? 'ok' : result.error}`);
          return { output: { sent: result.ok, platform: 'teams', error: result.error } };
        } else {
          return { output: { sent: false, error: `Unknown platform: ${platform}` } };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[workflow-executor] messaging_notification error: ${msg}`);
        return { output: { sent: false, error: msg } };
      }
    }

    case 'script': {
      const cfg = step.config as Record<string, unknown>;
      const outputVar = (cfg.outputVariable as string) || 'script_result';

      if (cfg.template) {
        // Run a computation template
        const { createMarketComputationService } = await import('./market-computation-service.js');
        const computationService = await createMarketComputationService(db);
        const params = (cfg.params as Record<string, unknown>) || {};
        // Merge context vars into params
        const mergedParams: Record<string, unknown> = { ...params };
        for (const [k, v] of Object.entries(mergedParams)) {
          if (typeof v === 'string' && v.startsWith('{{')) {
            mergedParams[k] = resolveTemplate(v, context);
          }
        }
        const result = await computationService.runTemplate(
          cfg.template as string,
          mergedParams,
          'workflow'
        );
        return { output: { [outputVar]: result.output, success: result.success, error: result.error } };
      } else if (cfg.endpoint) {
        // Make internal HTTP POST to local endpoint
        const port = process.env.PORT || 3001;
        const url = `http://localhost:${port}${cfg.endpoint}`;
        const method = (cfg.method as string || 'POST').toUpperCase();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        try {
          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method !== 'GET' ? JSON.stringify(cfg.body || {}) : undefined,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const data = await response.json().catch(() => ({}));
          return { output: { [outputVar]: data, status: response.status, ok: response.ok } };
        } catch (err) {
          clearTimeout(timeout);
          throw new Error(`Script endpoint call failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        throw new Error('Script step requires either "template" or "endpoint" in config');
      }
    }

    case 'llm': {
      const cfg = step.config as Record<string, unknown>;
      const outputVar = (cfg.outputVariable as string) || 'llm_result';
      const promptName = cfg.prompt as string;
      if (!promptName) throw new Error('LLM step requires "prompt" in config');

      // Read system prompt file
      const promptPath = path.join(__dirname, '..', 'prompts', `${promptName}.md`);
      let systemPrompt: string;
      try {
        systemPrompt = fs.readFileSync(promptPath, 'utf-8');
      } catch {
        systemPrompt = `You are an expert market analyst. Task: ${promptName}`;
      }

      // Build user message from context
      const userMessage = cfg.userMessage
        ? resolveTemplate(cfg.userMessage as string, context)
        : `Analyze the following context and provide insights:\n\n${JSON.stringify(context, null, 2).slice(0, 8000)}`;

      // Use cost-efficient model for headless LLM calls: per-step model when
      // configured, otherwise the provider-routed utility model (review 3.8).
      const { callChat } = await import('./provider-router.js');
      const { getRoutedUtilityModel } = await import('./utility-model.js');
      const modelId = (cfg.model as string) || await getRoutedUtilityModel(db);
      const result = await callChat({
        model: modelId,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: (cfg.maxTokens as number) || 4096,
        thinkingLevel: (cfg.thinking as string) || undefined,
      });

      return { output: { [outputVar]: result.text, model: modelId } };
    }

    case 'parallel': {
      const cfg = step.config as Record<string, unknown>;
      const templates = (cfg.templates as string[]) || [];
      const outputVar = (cfg.outputVariable as string) || 'parallel_results';

      if (templates.length === 0) {
        return { output: { [outputVar]: [], note: 'No templates specified' } };
      }

      const { createMarketComputationService } = await import('./market-computation-service.js');
      const computationService = await createMarketComputationService(db);
      const params = (cfg.params as Record<string, unknown>) || {};

      const results = await Promise.allSettled(
        templates.map(templateName =>
          computationService.runTemplate(templateName, params, 'workflow')
        )
      );

      const outputs = results.map((r, i) => ({
        template: templates[i],
        success: r.status === 'fulfilled' ? r.value.success : false,
        output: r.status === 'fulfilled' ? r.value.output : null,
        error: r.status === 'fulfilled' ? r.value.error : (r.reason instanceof Error ? r.reason.message : String(r.reason)),
      }));

      return { output: { [outputVar]: outputs } };
    }

    case 'approval':
      // This shouldn't be reached since we handle it above, but provide fallback
      return { output: { status: 'awaiting_approval', step: step.label } };

    default:
      return { output: { status: 'unsupported_step_type', type: step.type } };
  }
}

// ── Run tracking helpers ───────────────────────────────────

async function recordRun(
  db: DatabaseAdapter,
  runId: string,
  workflowId: string,
  scheduleId: number,
  status: string,
  errorMessage?: string
): Promise<void> {
  try {
    await db.run(`
      INSERT INTO workflow_runs (id, workflow_id, trigger_source, status, user_id, error_message)
      VALUES (?, ?, ?, ?, 'scheduler', ?)
    `, runId, workflowId, `schedule:${scheduleId}`, status, errorMessage || null);
  } catch {
    // workflow_runs table may not exist in all deploys — log but don't crash
    console.warn(`[workflow-executor] Could not record run ${runId} (workflow_runs table may not exist)`);
  }
}

async function updateRun(
  db: DatabaseAdapter,
  runId: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  try {
    await db.run(`
      UPDATE workflow_runs SET status = ?, completed_at = NOW(), error_message = ? WHERE id = ?
    `, status, errorMessage || null, runId);
  } catch {
    console.warn(`[workflow-executor] Could not update run ${runId}`);
  }
}
