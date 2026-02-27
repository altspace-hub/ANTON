// ═══════════════════════════════════════════════════════════
// Headless Workflow Executor — runs workflow steps that
// do not require frontend interaction (API calls, DB queries,
// transforms, waits, decision gates).
// Used by the scheduler for automatic/scheduled execution.
// ═══════════════════════════════════════════════════════════

import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { WorkflowDefinition, WorkflowStep } from '../../src/lib/workflow-definitions.js';
import { resolveTemplate } from '../routes/workflows.js';
import { createConnectionManager } from './connection-manager.js';
import pkg from 'pg';
const { Client: PgClient } = pkg;
import mysql from 'mysql2/promise';
import sql from 'mssql';

// Step types that can run without user interaction
const HEADLESS_STEP_TYPES = new Set([
  'api_call',
  'database_query',
  'transform',
  'wait',
  'decision_gate',
  'conditional',
  'data_import',
  'data_export',
  'data_transform',
  'data_merge',
  'notification',
  'email_send',
]);

// Step types that require frontend/user interaction
const INTERACTIVE_STEP_TYPES = new Set([
  'claude',
  'input',
  'export',
  'checkpoint',
]);

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
  db: Database.Database,
  workflowId: string,
  scheduleId: number
): Promise<ExecutionResult> {
  const runId = randomUUID();
  let stepsCompleted = 0;
  let stepsSkipped = 0;

  // Fetch the workflow definition from the schedule record (stored at creation time)
  const scheduleRow = db.prepare(
    "SELECT workflow_definition FROM workflow_schedules WHERE id = ? AND workflow_id = ?"
  ).get(scheduleId, workflowId) as { workflow_definition: string | null } | undefined;

  let workflow: WorkflowDefinition;
  if (scheduleRow?.workflow_definition) {
    workflow = JSON.parse(scheduleRow.workflow_definition) as WorkflowDefinition;
  } else {
    // Also try workflow_definitions table (from schema_enhanced.sql)
    try {
      const defRow = db.prepare(
        "SELECT steps, config FROM workflow_definitions WHERE id = ?"
      ).get(workflowId) as { steps: string; config: string } | undefined;
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

      try {
        const { output, skippedToStepId } = await executeHeadlessStep(step, context, db, runId);

        // Merge output into context
        const outputVar = step.config?.outputVariable;
        if (outputVar && output[outputVar] !== undefined) {
          context[outputVar] = output[outputVar];
        } else {
          const key = `step_${stepIndex + 1}`;
          context[key] = output;
        }

        stepsCompleted++;

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
  db: Database.Database,
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

    case 'api_call': {
      if (!step.config?.connectionId) throw new Error('API call step requires connectionId');

      const manager = createConnectionManager(db);
      const conn = manager.get(step.config.connectionId);
      if (!conn) throw new Error(`Connection not found: ${step.config.connectionId}`);
      if (conn.type !== 'api') throw new Error(`Connection is not an API connection`);

      const cfg = conn.config as Record<string, unknown>;
      const baseUrl = cfg.base_url as string;
      const method = (step.config.method || 'GET').toUpperCase();
      const endpointPath = step.config.endpointPath
        ? resolveTemplate(step.config.endpointPath, context)
        : '';
      const url = `${baseUrl}${endpointPath}`;

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

      const manager = createConnectionManager(db);
      const conn = manager.get(step.config.connectionId);
      if (!conn) throw new Error(`Connection not found: ${step.config.connectionId}`);

      const cfg = conn.config as Record<string, unknown>;
      const driver = (cfg.driver as string) || 'sqlite';
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
      return { output: { resolvedMessage: message, sent: false, _note: 'Webhook not yet implemented' } };
    }

    case 'email_send': {
      const to = step.config?.toTemplate ? resolveTemplate(step.config.toTemplate, context) : '';
      const subject = step.config?.subjectTemplate ? resolveTemplate(step.config.subjectTemplate, context) : '';
      console.log(`[workflow-executor] Email stub: to="${to}" subject="${subject}"`);
      return { output: { to, subject, sent: false, _note: 'Email not yet implemented' } };
    }

    default:
      return { output: { status: 'unsupported_step_type', type: step.type } };
  }
}

// ── Run tracking helpers ───────────────────────────────────

function recordRun(
  db: Database.Database,
  runId: string,
  workflowId: string,
  scheduleId: number,
  status: string,
  errorMessage?: string
): void {
  try {
    db.prepare(`
      INSERT INTO workflow_runs (id, workflow_id, trigger_source, status, user_id, error_message)
      VALUES (?, ?, ?, ?, 'scheduler', ?)
    `).run(runId, workflowId, `schedule:${scheduleId}`, status, errorMessage || null);
  } catch {
    // workflow_runs table may not exist in all deploys — log but don't crash
    console.warn(`[workflow-executor] Could not record run ${runId} (workflow_runs table may not exist)`);
  }
}

function updateRun(
  db: Database.Database,
  runId: string,
  status: string,
  errorMessage?: string
): void {
  try {
    db.prepare(`
      UPDATE workflow_runs SET status = ?, completed_at = datetime('now'), error_message = ? WHERE id = ?
    `).run(status, errorMessage || null, runId);
  } catch {
    console.warn(`[workflow-executor] Could not update run ${runId}`);
  }
}
