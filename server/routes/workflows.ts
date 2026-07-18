// ═══════════════════════════════════════════════════════════
// Workflow Execution Engine — REST API
// Supports Guided, Automatic, and Scheduled execution modes
// ═══════════════════════════════════════════════════════════

import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

import Anthropic from '@anthropic-ai/sdk';
import { callChat, mapModelToProvider } from '../services/provider-router.js';
import { getRoutedUtilityModel } from '../services/utility-model.js';
import type { WorkflowDefinition, WorkflowStep, WorkflowStepType } from '../../src/lib/workflow-definitions.js';
import { WORKFLOWS } from '../../src/lib/workflow-definitions.js';
import { createConnectionManager } from '../services/connection-manager.js';
import { resolveExplicitDbDriver } from '../services/workflow-step-registry.js';
import pkg from 'pg';
import { safeError } from '../lib/error-response.js';
const { Client: PgClient } = pkg;
import mysql from 'mysql2/promise';
import sql from 'mssql';
import { importData, exportData, getSampleRows, type ExportConfig } from '../services/data-importer.js';
import { applyTransformations, validateOperation, TransformOperation } from '../services/data-transformer.js';
import { mergeDatasets, deduplicateDataset, validateMergeConfig, MergeConfig } from '../services/data-merger.js';
import { getDatasetCache } from './data.js';
import {
  persistExecution, loadExecution, listExecutionSummaries,
  listPendingApprovals, recordClientRun,
  decideExecutionAccess, decideRunAccess, reconcileOrphanedRunning,
  type WorkflowExecution, type ExecutionMode, type StepResult,
} from '../services/workflow-execution-store.js';
import { resumeApprovedRun, rejectRun } from '../services/workflow-executor.js';

// ── Types ────────────────────────────────────────────────────────
// Execution types live in workflow-execution-store.ts (single source of
// truth — they are persisted to PostgreSQL); re-exported here for
// backwards compatibility.

export type {
  ExecutionMode, ExecutionStatus, StepStatus, StepResult, WorkflowExecution,
} from '../services/workflow-execution-store.js';

// ── In-memory execution store (hot cache) ────────────────────────
// Live executions are held in memory for speed, but every state change is
// serialized to the PostgreSQL workflow_executions table (migration 230) and
// rehydrated on demand — paused runs survive a server restart (B7 fix).
// Durable scheduled-run history additionally lives in workflow_runs
// (see workflow-executor.ts recordRun/updateRun).
const executions = new Map<string, WorkflowExecution>();

/** Map lookup with PostgreSQL rehydration fallback (restart survival). */
async function getExecution(db: DatabaseAdapter, id: string): Promise<WorkflowExecution | undefined> {
  const hot = executions.get(id);
  if (hot) return hot;
  const rehydrated = await loadExecution(db, id);
  if (rehydrated) executions.set(id, rehydrated);
  return rehydrated;
}

// ── Template resolver ────────────────────────────────────────────

export function resolveTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const value = path.trim().split('.').reduce<unknown>((obj, key) => {
      if (obj === null || obj === undefined) return undefined;
      if (typeof obj === 'object') return (obj as Record<string, unknown>)[key];
      return undefined;
    }, context);
    return value !== undefined && value !== null ? String(value) : _match;
  });
}

// ── Decision condition evaluator ─────────────────────────────────

function evaluateCondition(condition: WorkflowStep['config']['decisionCondition'], context: Record<string, unknown>): boolean {
  if (!condition) return true;

  const left = resolveTemplate(condition.leftOperand, context);
  const right = condition.operator !== 'exists' ? resolveTemplate(condition.rightOperand, context) : '';
  const leftNum = parseFloat(left);
  const rightNum = parseFloat(right);

  switch (condition.operator) {
    case '==': return left === right;
    case '!=': return left !== right;
    case '>':  return !isNaN(leftNum) && !isNaN(rightNum) ? leftNum > rightNum : left > right;
    case '<':  return !isNaN(leftNum) && !isNaN(rightNum) ? leftNum < rightNum : left < right;
    case '>=': return !isNaN(leftNum) && !isNaN(rightNum) ? leftNum >= rightNum : left >= right;
    case '<=': return !isNaN(leftNum) && !isNaN(rightNum) ? leftNum <= rightNum : left <= right;
    case 'contains': return left.includes(right);
    case 'exists': return left !== '' && left !== 'undefined' && left !== 'null';
    default: return true;
  }
}

// ── Transform evaluator ──────────────────────────────────────────
// Named operations only — no arbitrary code execution.
// Using new Function() / eval() would allow authenticated users to run arbitrary
// server-side JavaScript (full process compromise). All transforms must be
// explicitly listed here.

const SAFE_TRANSFORM_OPS: Record<string, (v: unknown) => unknown> = {
  // Type coercions
  string:        (v) => String(v ?? ''),
  number:        (v) => Number(v),
  boolean:       (v) => Boolean(v),
  integer:       (v) => parseInt(String(v ?? ''), 10),
  float:         (v) => parseFloat(String(v ?? '')),
  // String operations
  uppercase:     (v) => String(v ?? '').toUpperCase(),
  lowercase:     (v) => String(v ?? '').toLowerCase(),
  trim:          (v) => String(v ?? '').trim(),
  trim_start:    (v) => String(v ?? '').trimStart(),
  trim_end:      (v) => String(v ?? '').trimEnd(),
  // Null-safety
  or_empty:      (v) => v ?? '',
  or_zero:       (v) => v ?? 0,
  // JSON
  json_stringify: (v) => JSON.stringify(v),
  json_parse:    (v) => { try { return JSON.parse(String(v)); } catch { return v; } },
};

function applyTransformExpression(expression: string | undefined, value: unknown): unknown {
  if (!expression || !expression.trim()) return value;
  const op = expression.trim().toLowerCase();
  if (op in SAFE_TRANSFORM_OPS) {
    try {
      return SAFE_TRANSFORM_OPS[op](value);
    } catch {
      return value;
    }
  }
  console.warn(
    `[workflow] Transform expression "${expression}" is not a recognised operation — returning value unchanged. ` +
    `Supported operations: ${Object.keys(SAFE_TRANSFORM_OPS).join(', ')}`
  );
  return value;
}

// ── Step executors ───────────────────────────────────────────────

async function executeStep(
  step: WorkflowStep,
  execution: WorkflowExecution,
  db: DatabaseAdapter
): Promise<{ output: Record<string, unknown>; skippedToStepId?: string }> {
  const ctx = execution.context;
  const executionId = execution.id;

  switch (step.type as WorkflowStepType) {

    // ── Claude Analysis (already works in frontend — here we record it)
    case 'claude': {
      // Claude steps are executed on the frontend via streaming.
      // Server just records the step start; actual AI call happens client-side.
      return { output: { status: 'claude_step_delegated_to_frontend' } };
    }

    // ── Input Step: return placeholder (input collected on frontend)
    case 'input': {
      return { output: { status: 'input_collected' } };
    }

    // ── Export Step: return placeholder
    case 'export': {
      return { output: { status: 'exported', format: step.config.exportFormat ?? 'docx' } };
    }

    // ── Decision Gate ────────────────────────────────────────────
    case 'decision_gate': {
      const conditionMet = evaluateCondition(step.config.decisionCondition, ctx);
      if (!conditionMet && step.config.onFalseSkipToStepId) {
        return {
          output: { conditionMet, evaluatedAt: new Date().toISOString() },
          skippedToStepId: step.config.onFalseSkipToStepId,
        };
      }
      return { output: { conditionMet, evaluatedAt: new Date().toISOString() } };
    }

    // ── Transform ────────────────────────────────────────────────
    case 'transform': {
      const mappings = step.config.fieldMappings ?? [];
      const transformed: Record<string, unknown> = {};
      for (const mapping of mappings) {
        const resolved = resolveTemplate(mapping.sourcePath, ctx);
        const value = applyTransformExpression(mapping.expression, resolved);
        transformed[mapping.destinationField] = value;
      }
      const outputVar = step.config.outputVariable || 'transformed';
      return { output: { [outputVar]: transformed } };
    }

    // ── Wait (fixed duration) ────────────────────────────────────
    case 'wait': {
      const seconds = step.config.waitSeconds ?? 0;
      if (seconds > 0 && seconds <= 30) {
        // Only actually wait for short durations server-side
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      }
      return { output: { waitedSeconds: seconds, completedAt: new Date().toISOString() } };
    }

    // ── Checkpoint: always pauses — handled by execution loop ────
    case 'checkpoint': {
      return { output: { checkpointReached: true, message: step.config.checkpointMessage } };
    }

    // ── API Call ──────────────────────────────────────────────────
    case 'api_call': {
      if (!step.config.connectionId) throw new Error('API call step requires connectionId');

      const manager = await createConnectionManager(db);
      const conn = await manager.get(step.config.connectionId);
      if (!conn) throw new Error(`Connection not found: ${step.config.connectionId}`);
      if (conn.type !== 'api') throw new Error(`Connection ${step.config.connectionId} is not an API connection`);

      const cfg = conn.config as Record<string, unknown>;
      const baseUrl = cfg.base_url as string;
      const method = (step.config.method || 'GET').toUpperCase();
      const endpointPath = step.config.endpointPath
        ? resolveTemplate(step.config.endpointPath, ctx)
        : '';
      const url = `${baseUrl}${endpointPath}`;

      // Build headers
      const headers: Record<string, string> = { ...(cfg.headers as Record<string, string> || {}) };
      if (step.config.headers) {
        Object.entries(step.config.headers).forEach(([k, v]) => {
          headers[k] = typeof v === 'string' ? resolveTemplate(v, ctx) : String(v);
        });
      }

      // Build body
      let body: string | undefined;
      if (step.config.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        const bodyData = typeof step.config.body === 'string'
          ? resolveTemplate(step.config.body, ctx)
          : JSON.stringify(step.config.body);
        body = bodyData;
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      }

      const outputVar = step.config.outputVariable || 'api_response';

      // ASYNC MODE: Fire-and-forget
      if (step.config.async) {
        fetch(url, { method, headers, body, signal: AbortSignal.timeout(step.config.timeout_ms || 30000) })
          .then(() => console.log(`[workflow] Async API call dispatched: ${method} ${url}`))
          .catch((err) => console.error(`[workflow] Async API call failed: ${err.message}`));

        return {
          output: {
            [outputVar]: {
              status: 'dispatched',
              url,
              method,
              timestamp: new Date().toISOString(),
            },
          },
        };
      }

      // SYNC MODE: Wait for response
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), step.config.timeout_ms || 30000);

      try {
        const response = await fetch(url, { method, headers, body, signal: controller.signal });
        clearTimeout(timeout);

        const contentType = response.headers.get('content-type') || '';
        let data: unknown;

        if (contentType.includes('application/json')) {
          data = await response.json();
        } else if (contentType.includes('text/')) {
          data = await response.text();
        } else {
          data = await response.arrayBuffer();
        }

        // Log to audit trail
        manager.logAction(
          step.config.connectionId,
          executionId || null,
          'api_call',
          { method, url, status: response.status },
          `${response.status} ${response.statusText}`,
          'workflow-engine'
        );

        return {
          output: {
            [outputVar]: {
              status: response.status,
              statusText: response.statusText,
              ok: response.ok,
              headers: Object.fromEntries(response.headers.entries()),
              data,
            },
          },
        };
      } catch (error) {
        clearTimeout(timeout);
        const message = error instanceof Error ? error.message : String(error);

        manager.logAction(
          step.config.connectionId,
          executionId || null,
          'api_call',
          { method, url, error: message },
          `Error: ${message}`,
          'workflow-engine'
        );

        throw new Error(`API call failed: ${message}`);
      }
    }

    // ── Database Query ────────────────────────────────────────────
    case 'database_query': {
      if (!step.config.connectionId) throw new Error('Database query step requires connectionId');

      const manager = await createConnectionManager(db);
      const conn = await manager.get(step.config.connectionId);
      if (!conn) throw new Error(`Connection not found: ${step.config.connectionId}`);
      if (conn.type !== 'database') throw new Error(`Connection ${step.config.connectionId} is not a database connection`);

      const cfg = conn.config as Record<string, unknown>;
      // Driver must be explicit on the connection — never silently default (bug 0.8).
      const driver = resolveExplicitDbDriver(cfg);
      const query = step.config.queryTemplate
        ? resolveTemplate(step.config.queryTemplate, ctx)
        : '';
      const parameters = step.config.parameters || [];
      const maxRows = step.config.maxRows || 1000;
      const outputVar = step.config.outputVariable || 'query_result';

      let rows: unknown[] = [];
      let rowCount = 0;

      try {
        // POSTGRESQL
        if (driver === 'postgresql') {
          const client = new PgClient({
            host: cfg.host as string,
            port: cfg.port as number,
            database: cfg.database as string,
            user: cfg.username as string,
            password: cfg.password as string,
            ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
            connectionTimeoutMillis: 10000,
            query_timeout: 30000,
          });

          await client.connect();
          const result = await client.query(query, parameters);
          rows = result.rows.slice(0, maxRows);
          rowCount = result.rowCount || 0;
          await client.end();
        }

        // MYSQL
        else if (driver === 'mysql') {
          const connection = await mysql.createConnection({
            host: cfg.host as string,
            port: cfg.port as number,
            database: cfg.database as string,
            user: cfg.username as string,
            password: cfg.password as string,
            connectTimeout: 10000,
          });

          const [results] = await connection.execute(query, parameters as (string | number | boolean | null | Date | Buffer)[]);
          rows = (Array.isArray(results) ? results : []).slice(0, maxRows);
          rowCount = rows.length;
          await connection.end();
        }

        // SQL SERVER
        else if (driver === 'mssql') {
          const pool = await sql.connect({
            server: cfg.host as string,
            port: cfg.port as number,
            database: cfg.database as string,
            user: cfg.username as string,
            password: cfg.password as string,
            options: {
              encrypt: cfg.ssl as boolean,
              trustServerCertificate: true,
            },
            connectionTimeout: 10000,
            requestTimeout: 30000,
          });

          const result = await pool.request().query(query);
          rows = result.recordset.slice(0, maxRows);
          rowCount = result.recordset.length;
          await pool.close();
        }

        // SQLITE (local database)
        else if (driver === 'sqlite') {
          const { default: Database } = await import('better-sqlite3');
          const sqliteDb = new Database(cfg.host as string, { readonly: true });
          const stmt = sqliteDb.prepare(query);
          const allRows = parameters.length > 0 ? stmt.all(...parameters) : stmt.all();
          rows = allRows.slice(0, maxRows);
          rowCount = allRows.length;
          sqliteDb.close();
        }

        else {
          throw new Error(`Unsupported database driver: ${driver}`);
        }

        // Log to audit trail
        manager.logAction(
          step.config.connectionId,
          executionId || null,
          'database_query',
          { driver, rowCount, truncated: rowCount > maxRows },
          `Query returned ${rowCount} rows (${rows.length} returned)`,
          'workflow-engine'
        );

        return {
          output: {
            [outputVar]: {
              rows,
              rowCount,
              truncated: rowCount > maxRows,
              driver,
            },
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        manager.logAction(
          step.config.connectionId,
          executionId || null,
          'database_query',
          { driver, error: message },
          `Error: ${message}`,
          'workflow-engine'
        );

        throw new Error(`Database query failed: ${message}`);
      }
    }

    // ── File Read (stub) ─────────────────────────────────────────
    case 'file_read': {
      console.log(`[workflow-engine] TODO: File read from ${step.config.pathPattern} via connection ${step.config.connectionId}`);
      const outputVar = step.config.outputVariable || 'file_content';
      return {
        output: {
          [outputVar]: {
            _stub: true,
            _message: 'File read not yet implemented — connection required',
            connectionId: step.config.connectionId,
            pathPattern: step.config.pathPattern
              ? resolveTemplate(step.config.pathPattern, ctx)
              : undefined,
            files: [],
          },
        },
      };
    }

    // ── File Write (stub) ────────────────────────────────────────
    case 'file_write': {
      console.log(`[workflow-engine] TODO: File write to ${step.config.outputPath} via connection ${step.config.connectionId}`);
      return {
        output: {
          _stub: true,
          _message: 'File write not yet implemented — connection required',
          connectionId: step.config.connectionId,
          outputPath: step.config.outputPath
            ? resolveTemplate(step.config.outputPath, ctx)
            : undefined,
        },
      };
    }

    // ── Script (stub) ────────────────────────────────────────────
    case 'script': {
      console.log(`[workflow-engine] TODO: Run script ${step.config.scriptId}`);
      const outputVar = step.config.outputVariable || 'script_result';
      return {
        output: {
          [outputVar]: {
            _stub: true,
            _message: 'Script execution not yet implemented — script library required',
            scriptId: step.config.scriptId,
          },
        },
      };
    }

    // ── Email Send (stub) ────────────────────────────────────────
    case 'email_send': {
      const to = step.config.toTemplate ? resolveTemplate(step.config.toTemplate, ctx) : '';
      const subject = step.config.subjectTemplate ? resolveTemplate(step.config.subjectTemplate, ctx) : '';
      console.log(`[workflow-engine] TODO: Send email to "${to}" subject "${subject}"`);
      return {
        output: {
          _stub: true,
          _message: 'Email send not yet implemented',
          to,
          subject,
        },
      };
    }

    // ── Loop (stub — full implementation requires recursive execution) ──
    case 'loop': {
      const listPath = step.config.inputListPath || '';
      const list = listPath ? resolveTemplate(listPath, ctx) : '[]';
      console.log(`[workflow-engine] TODO: Loop over list at ${listPath}`);
      return {
        output: {
          _stub: true,
          _message: 'Loop execution not yet fully implemented',
          inputList: list,
          iterations: 0,
        },
      };
    }

    // ── Parallel (stub) ─────────────────────────────────────────
    case 'parallel': {
      console.log(`[workflow-engine] TODO: Parallel execution of ${step.config.parallelGroups?.length ?? 0} groups`);
      return {
        output: {
          _stub: true,
          _message: 'Parallel execution not yet implemented',
          groupCount: step.config.parallelGroups?.length ?? 0,
        },
      };
    }

    // ── Sub-workflow (stub) ──────────────────────────────────────
    case 'sub_workflow': {
      console.log(`[workflow-engine] TODO: Execute sub-workflow ${step.config.subWorkflowId}`);
      const outputVar = step.config.outputVariable || 'sub_workflow_result';
      return {
        output: {
          [outputVar]: {
            _stub: true,
            _message: 'Sub-workflow execution not yet implemented',
            subWorkflowId: step.config.subWorkflowId,
          },
        },
      };
    }

    // ── Notification (stub) ──────────────────────────────────────
    case 'notification': {
      const message = step.config.messageTemplate
        ? resolveTemplate(step.config.messageTemplate, ctx)
        : '';
      const webhookUrl = step.config.webhookUrl || '';
      console.log(`[workflow-engine] TODO: Send notification webhook to ${webhookUrl || 'connection'}`);
      return {
        output: {
          _stub: true,
          _message: 'Notification webhook not yet implemented',
          resolvedMessage: message,
          webhookUrl,
        },
      };
    }

    // ── Conditional (legacy) ─────────────────────────────────────
    case 'conditional': {
      return { output: { status: 'evaluated' } };
    }

    // ── Data Import ──────────────────────────────────────────────
    case 'data_import': {
      const importConfig = {
        source: step.config.importSource || 'file',
        filePath: step.config.filePath ? resolveTemplate(step.config.filePath, ctx) : undefined,
        fileType: step.config.fileType,
        sheetName: step.config.sheetName,
        delimiter: step.config.delimiter,
        hasHeader: step.config.hasHeader !== false,
        connectionId: step.config.dataConnectionId,
        query: step.config.importQuery ? resolveTemplate(step.config.importQuery, ctx) : undefined,
        preview: step.config.preview,
        db: step.config.importSource === 'database' ? db : undefined,
      };

      const dataset = await importData(importConfig as any);
      // Register in the shared dataset cache so downstream data_transform / merge /
      // export steps can find it by id. The import step used to skip this (the
      // /api/data/import route cached, but this direct call didn't), so any
      // import → transform pipeline broke at the transform's cache lookup.
      getDatasetCache().set(dataset.id, dataset);
      const outputVar = step.config.outputVariable || 'dataset';

      return {
        output: {
          [outputVar]: {
            id: dataset.id,
            columns: dataset.columns,
            rowCount: dataset.metadata.rowCount,
            preview: dataset.rows.slice(0, 5),
          },
        },
      };
    }

    // ── Data Transform ───────────────────────────────────────────
    case 'data_transform': {
      const inputDatasetId = step.config.inputDatasetId
        ? resolveTemplate(step.config.inputDatasetId, ctx)
        : undefined;

      if (!inputDatasetId) {
        throw new Error('Data transform step requires inputDatasetId');
      }

      // Get dataset from context
      const datasetPath = inputDatasetId.replace(/^\{\{|\}\}$/g, '').trim();
      const datasetObj = datasetPath.split('.').reduce((obj: any, key) => obj?.[key], ctx);

      if (!datasetObj || !datasetObj.id) {
        throw new Error(`Dataset not found: ${inputDatasetId}`);
      }

      // Operate in-process against the shared dataset cache (the same Map the
      // /api/data routes use). The previous self-HTTP round-trip is now blocked by
      // CSRF and needlessly re-serialised the whole dataset over the loopback.
      const cache = getDatasetCache();
      const cachedDataset = cache.get(datasetObj.id);
      if (!cachedDataset) {
        throw new Error(`Failed to fetch dataset from cache: ${datasetObj.id}`);
      }

      // Apply transformations (validate each op first, mirroring /api/data/transform)
      const operations = (step.config.transformOperations || []) as TransformOperation[];
      for (const operation of operations) {
        const validation = validateOperation(cachedDataset, operation);
        if (!validation.valid) {
          throw new Error(`Invalid transform operation ${operation.type}: ${validation.error}`);
        }
      }
      const transformed = applyTransformations(cachedDataset, operations);
      cache.set(transformed.id, transformed);

      const outputVar = step.config.outputVariable || 'transformed_dataset';
      return {
        output: {
          [outputVar]: {
            id: transformed.id,
            columns: transformed.columns,
            rowCount: transformed.metadata.rowCount,
            preview: getSampleRows(transformed, 10),
          },
        },
      };
    }

    // ── Data Merge ───────────────────────────────────────────────
    case 'data_merge': {
      const leftId = step.config.leftDatasetId
        ? resolveTemplate(step.config.leftDatasetId, ctx)
        : undefined;
      const rightId = step.config.rightDatasetId
        ? resolveTemplate(step.config.rightDatasetId, ctx)
        : undefined;

      if (!leftId || !rightId) {
        throw new Error('Data merge step requires leftDatasetId and rightDatasetId');
      }

      // Extract dataset IDs from context paths
      const leftPath = leftId.replace(/^\{\{|\}\}$/g, '').trim();
      const rightPath = rightId.replace(/^\{\{|\}\}$/g, '').trim();
      const leftDataset = leftPath.split('.').reduce((obj: any, key) => obj?.[key], ctx);
      const rightDataset = rightPath.split('.').reduce((obj: any, key) => obj?.[key], ctx);

      if (!leftDataset?.id || !rightDataset?.id) {
        throw new Error('Datasets not found in context');
      }

      // Build merge config
      const mergeConfig: MergeConfig = {
        mergeType: step.config.mergeType || 'join',
        joinType: step.config.joinType,
        leftKey: step.config.leftKey,
        rightKey: step.config.rightKey,
        columnMapping: step.config.columnMapping,
        deduplicateBy: step.config.deduplicateBy,
        deduplicateStrategy: step.config.deduplicateStrategy,
      };

      // Merge in-process against the shared dataset cache (see data_transform note).
      const cache = getDatasetCache();
      const left = cache.get(leftDataset.id);
      const right = cache.get(rightDataset.id);
      if (!left || !right) {
        throw new Error('Datasets not found in cache');
      }
      const mergeValidation = validateMergeConfig(left, right, mergeConfig);
      if (!mergeValidation.valid) {
        throw new Error(`Invalid merge configuration: ${mergeValidation.error}`);
      }
      let merged = mergeDatasets(left, right, mergeConfig);
      if (mergeConfig.deduplicateBy && mergeConfig.deduplicateStrategy) {
        merged = deduplicateDataset(merged, mergeConfig.deduplicateBy, mergeConfig.deduplicateStrategy);
      }
      cache.set(merged.id, merged);

      const outputVar = step.config.outputVariable || 'merged_dataset';
      return {
        output: {
          [outputVar]: {
            id: merged.id,
            columns: merged.columns,
            rowCount: merged.metadata.rowCount,
            preview: getSampleRows(merged, 10),
          },
        },
      };
    }

    // ── Data Export ──────────────────────────────────────────────
    case 'data_export': {
      const datasetId = step.config.exportDatasetId
        ? resolveTemplate(step.config.exportDatasetId, ctx)
        : undefined;

      if (!datasetId) {
        throw new Error('Data export step requires exportDatasetId');
      }

      // Extract dataset ID from context
      const datasetPath = datasetId.replace(/^\{\{|\}\}$/g, '').trim();
      const datasetObj = datasetPath.split('.').reduce((obj: any, key) => obj?.[key], ctx);

      if (!datasetObj?.id) {
        throw new Error(`Dataset not found: ${datasetId}`);
      }

      // Build export config
      const exportConfig = {
        destination: step.config.exportDestination || 'file',
        filePath: step.config.exportFilePath ? resolveTemplate(step.config.exportFilePath, ctx) : undefined,
        fileType: step.config.exportFileType,
        tableName: step.config.exportTableName,
        insertMode: step.config.exportInsertMode,
        overwrite: step.config.overwrite,
        db: step.config.exportDestination === 'database' ? db : undefined,
      };

      // Export in-process against the shared dataset cache (see data_transform note).
      const cache = getDatasetCache();
      const exportDataset = cache.get(datasetObj.id);
      if (!exportDataset) {
        throw new Error(`Dataset not found: ${datasetId}`);
      }
      const exportResultValue = await exportData(exportDataset, exportConfig as ExportConfig);

      const outputVar = step.config.outputVariable || 'export_result';
      return {
        output: {
          [outputVar]: {
            success: true,
            destination: exportConfig.destination,
            result: exportResultValue,
          },
        },
      };
    }

    default: {
      return { output: { status: 'unknown_step_type', type: step.type } };
    }
  }
}

// ── Core execution loop ──────────────────────────────────────────

async function runExecution(execution: WorkflowExecution, db: DatabaseAdapter): Promise<void> {
  const steps = execution.workflowDefinition.steps;
  execution.status = 'running';
  await persistExecution(db, execution);

  while (execution.currentStepIndex < steps.length) {
    // Re-read status each iteration — can be mutated externally (e.g., abort route)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    if ((execution.status as string) === 'aborted') break;

    const step = steps[execution.currentStepIndex];
    const stepResult: StepResult = {
      stepId: step.id,
      stepIndex: execution.currentStepIndex,
      status: 'running',
      startedAt: new Date().toISOString(),
      input: { context: execution.context },
    };

    // In guided mode: pause BEFORE each step (except on initial start)
    if (execution.mode === 'guided' && execution.currentStepIndex > 0) {
      execution.status = 'paused';
      await persistExecution(db, execution);
      return; // Return and wait for /continue
    }

    // Checkpoint always pauses in any mode
    if (step.type === 'checkpoint') {
      execution.status = 'paused';
      stepResult.status = 'running';
      execution.stepResults.push(stepResult);
      // Will be resumed by /continue
      await persistExecution(db, execution);
      return;
    }

    execution.stepResults.push(stepResult);

    try {
      const { output, skippedToStepId } = await executeStep(step, execution, db);
      stepResult.status = 'completed';
      stepResult.completedAt = new Date().toISOString();
      stepResult.output = output;

      // Merge step output into context
      const outputVar = step.config.outputVariable;
      if (outputVar) {
        execution.context[outputVar] = output[outputVar] ?? output;
      } else {
        // Merge all output keys into context under step index key
        const key = `step_${execution.currentStepIndex + 1}`;
        execution.context[key] = output;
      }

      if (skippedToStepId) {
        // Jump to the specified step index
        const targetIdx = steps.findIndex((s) => s.id === skippedToStepId);
        if (targetIdx >= 0) {
          // Mark intermediate steps as skipped
          for (let i = execution.currentStepIndex + 1; i < targetIdx; i++) {
            execution.stepResults.push({
              stepId: steps[i].id,
              stepIndex: i,
              status: 'skipped',
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            });
          }
          execution.currentStepIndex = targetIdx;
          continue;
        }
      }

      execution.currentStepIndex++;
      await persistExecution(db, execution);
    } catch (err) {
      stepResult.status = 'failed';
      stepResult.completedAt = new Date().toISOString();
      stepResult.error = (err as Error).message;
      execution.status = 'failed';
      execution.error = (err as Error).message;
      await persistExecution(db, execution);
      return;
    }

    // In guided mode: pause AFTER each step (user reviews output, then continues)
    if (execution.mode === 'guided' && execution.currentStepIndex < steps.length) {
      execution.status = 'paused';
      await persistExecution(db, execution);
      return;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const finalStatus = execution.status as string;
  if (finalStatus !== 'aborted' && finalStatus !== 'failed') {
    execution.status = 'completed';
    execution.completedAt = new Date().toISOString();
  }
  await persistExecution(db, execution);
}

// ── Route factory ────────────────────────────────────────────────

// ── Human-readable step output summary ──────────────────────────

function humanizeOutput(output: Record<string, unknown>, stepType: string): string {
  const firstVal = Object.values(output)[0];
  if (firstVal && typeof firstVal === 'object' && (firstVal as Record<string, unknown>)._stub) {
    return `⚠ ${(firstVal as Record<string, unknown>)._message || 'Step completed (feature coming soon)'}`;
  }
  switch (stepType) {
    case 'wait': return `Waited ${(output as { waitedSeconds?: number }).waitedSeconds ?? 0} seconds.`;
    case 'checkpoint': return `Checkpoint reached: ${(output as { message?: string }).message || 'Please review before continuing.'}`;
    case 'decision_gate': {
      const o = output as { conditionMet?: boolean };
      return `Condition evaluated: ${o.conditionMet ? 'true — continuing' : 'false — may skip ahead'}`;
    }
    case 'transform': return `Fields mapped: ${Object.keys(output).join(', ')}`;
    case 'api_call': {
      const key = Object.keys(output)[0];
      const r = output[key] as { status?: number; statusText?: string; ok?: boolean };
      return r?.status ? `API response: ${r.status} ${r.statusText || ''} — ${r.ok ? 'success' : 'error'}` : JSON.stringify(output).slice(0, 300);
    }
    case 'database_query': {
      const key = Object.keys(output)[0];
      const r = output[key] as { rowCount?: number };
      return r?.rowCount !== undefined ? `Query returned ${r.rowCount} rows.` : JSON.stringify(output).slice(0, 300);
    }
    case 'data_import': {
      const key = Object.keys(output)[0];
      const r = output[key] as { rowCount?: number; columns?: string[] };
      return r?.rowCount !== undefined
        ? `Imported ${r.rowCount} rows. Columns: ${(r.columns || []).slice(0, 8).join(', ')}.`
        : JSON.stringify(output).slice(0, 300);
    }
    case 'data_transform': {
      const key = Object.keys(output)[0];
      const r = output[key] as { rowCount?: number };
      return r?.rowCount !== undefined ? `Transformed dataset: ${r.rowCount} rows.` : JSON.stringify(output).slice(0, 300);
    }
    case 'data_merge': {
      const key = Object.keys(output)[0];
      const r = output[key] as { rowCount?: number };
      return r?.rowCount !== undefined ? `Merged dataset: ${r.rowCount} rows.` : JSON.stringify(output).slice(0, 300);
    }
    case 'data_export': {
      const key = Object.keys(output)[0];
      const r = output[key] as { success?: boolean; destination?: string };
      return r?.success ? `Data exported to ${r.destination || 'destination'} successfully.` : JSON.stringify(output).slice(0, 300);
    }
    case 'notification': return `Notification NOT sent (step is coming soon — no webhook wired). Message would be: ${(output.resolvedMessage as string) || ''}`;
    case 'email_send': return `Email NOT sent (step is coming soon — no provider wired). Would go to "${(output.to as string) || ''}", subject "${(output.subject as string) || ''}"`;
    default: {
      const json = JSON.stringify(output, null, 2);
      return json.length > 800 ? json.slice(0, 800) + '\n…(truncated)' : json;
    }
  }
}

// ── AI Workflow Guide System Prompts ────────────────────────────

const WORKFLOW_GUIDE_SYSTEM_PROMPT = `You are a friendly AI workflow designer helping professionals across 55+ domains — legal, finance, compliance, healthcare, engineering, education, HR, marketing, research, creative work, and more — automate their repetitive multi-step tasks. Adapt your language and examples to the user's own domain; never assume they work in any particular field.

Your job is to understand:
1. What manual task or process they want to automate
2. What inputs or data they start with (files, documents, user input, data from systems)
3. What steps they take (read, analyze, transform, check, notify, export)
4. What the end result should be (document, system update, notification, report)
5. Who triggers it and how often (manual, scheduled, event-driven)

Rules:
- Ask ONE or TWO clear questions per reply. Never more.
- Be warm, concise. Maximum 3-4 sentences or a short bulleted list.
- After 2-4 exchanges you will have enough context to design the workflow.
- Focus on what's achievable: "input → Claude analysis → export" is the most reliable core; api_call and database_query can extend it. (Email and webhook-notification steps are not yet available — do not promise them.)
- When you have enough information, end your response with: "I have a clear picture of your workflow — click **Generate Workflow** when you're ready!"
- Never write the workflow JSON yourself in this chat — that happens via the Generate step.`;

const WORKFLOW_GENERATE_SYSTEM_PROMPT = `You are an expert workflow designer for professionals in any domain (legal, finance, compliance, healthcare, engineering, education, HR, marketing, research, creative, and more). Based on the conversation, generate a complete workflow configuration tailored to the user's domain.

Return ONLY valid JSON with NO markdown fences, NO explanation — just raw JSON:

{
  "id": "custom-[8-char-hex]",
  "label": "Full descriptive workflow name (4-8 words)",
  "shortLabel": "Max 15 chars",
  "description": "1-2 sentence description of what this workflow does",
  "icon": "ClipboardList",
  "category": "assessment",
  "estimatedTime": "5-10 min",
  "tags": ["tag1", "tag2"],
  "isCustom": true,
  "steps": [...]
}

VALID icons: Bell, RefreshCcw, FileScan, Gavel, GitCompareArrows, Rss, ShieldAlert, BarChart3, PackageCheck, ClipboardList
VALID categories: monitoring, assessment, advisory, reporting, comparison, custom

STEP TYPES — use these to build the steps array:

input step (collect from user):
{ "id": "step_1", "label": "...", "description": "...", "type": "input", "config": { "inputFields": [{ "id": "field_id", "label": "Label", "type": "textarea", "required": true, "placeholder": "..." }] } }
Field types: text, textarea, select (add "options": [...]), file, url

claude step (AI analysis):
{ "id": "step_2", "label": "...", "description": "...", "type": "claude", "config": { "thinking": "think_hard", "creativity": "balanced", "outputFormat": "detailed-findings", "promptTemplate": "Analyze: {{field_id}}" } }
thinking options: quick, think, think_hard, investigate
outputFormat options: executive-summary, detailed-findings, action-plan, gap-scoring-matrix, regulatory-comparison, quick-briefing

export step:
{ "id": "step_3", "label": "Export Report", "description": "...", "type": "export", "config": { "exportFormat": "docx" } }

api_call step (call external system):
{ "id": "step_4", "label": "...", "description": "...", "type": "api_call", "config": { "connectionId": "REPLACE_WITH_CONNECTION_ID", "method": "POST", "endpointPath": "/api/endpoint", "body": "{\\"data\\": \\"{{step_2.output}}\\"}", "outputVariable": "api_result" } }

wait step:
{ "id": "step_6", "label": "Wait", "description": "...", "type": "wait", "config": { "waitSeconds": 60 } }

checkpoint step (human review):
{ "id": "step_7", "label": "Human Review", "description": "...", "type": "checkpoint", "config": { "checkpointMessage": "Please review the analysis before continuing." } }

DESIGN PRINCIPLES:
- Start simple: input → claude → export is the most reliable pattern
- Use template variables like {{field_id}} to pass data between steps
- Give steps clear, action-oriented labels
- Most workflows should have 3-6 steps
- Add api_call only if the user explicitly wants to connect to an external system
- NEVER generate "notification" or "email_send" steps — they are not yet implemented and would silently do nothing at runtime`;

// ── Request user helpers ──────────────────────────────────────────
interface ReqUser { id?: string; role?: string }
function reqUser(req: { user?: ReqUser }): { userId?: string; isAdmin: boolean } {
  const user = (req as { user?: ReqUser }).user;
  // Solo mode (no auth) has no req.user → treat as admin (sees/acts on all),
  // matching the timeline + council ownership conventions.
  const isAdmin = !user || user.role === 'admin';
  return { userId: user?.id, isAdmin };
}

export async function createWorkflowRoutes(db: DatabaseAdapter, anthropic?: Anthropic): Promise<Router> {
  const router = Router();

  // One-shot startup sweep: mark executions left 'running' by a prior process
  // (fire-and-forget loop lost on restart) as 'failed' so they stop showing as
  // eternal-running in the timeline + approvals card. Fire-and-forget; never
  // blocks route construction.
  void reconcileOrphanedRunning(db);

  // ── GET /api/workflows — list the built-in workflow definitions.
  // Populates the workflow pickers in the trigger / schedule / automation UIs
  // (EventTriggersPage, WorkflowsPage). These are the same definitions
  // getWorkflowById() resolves at execution time, so every id here is runnable.
  router.get('/', (_req, res) => {
    res.json({
      workflows: WORKFLOWS.map((w) => ({
        id: w.id,
        name: w.label,
        shortLabel: w.shortLabel,
        description: w.description,
        category: w.category,
        estimatedTime: w.estimatedTime,
        tags: w.tags,
      })),
    });
  });

  // ── POST /api/workflows/executions — start a new execution
  router.post('/executions', async (req, res) => {
    const { workflow, mode = 'guided', input = {} } = req.body as {
      workflow: WorkflowDefinition;
      mode: ExecutionMode;
      input: Record<string, unknown>;
    };

    if (!workflow?.id || !Array.isArray(workflow.steps)) {
      return res.status(400).json({ error: 'Invalid workflow definition' });
    }

    const { userId } = reqUser(req);
    const executionId = randomUUID();
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflow.id,
      workflowDefinition: workflow,
      mode,
      status: 'pending',
      currentStepIndex: 0,
      context: { input, workflow: { label: workflow.label, id: workflow.id } },
      stepResults: [],
      startedAt: new Date().toISOString(),
      userId,
      createdBy: userId,
    };
    executions.set(executionId, execution);
    await persistExecution(db, execution);

    // Start execution asynchronously
    runExecution(execution, db).catch((err) => {
      execution.status = 'failed';
      execution.error = err.message;
      console.error('[workflow-engine] Execution error:', err);
      void persistExecution(db, execution);
    });

    res.json({ executionId, status: execution.status });
  });

  // ── GET /api/workflows/executions/:id/status
  router.get('/executions/:id/status', async (req, res) => {
    const access = await decideExecutionAccess(db, req.params.id, reqUser(req));
    if (access !== 'allow') return res.status(404).json({ error: 'Execution not found' });
    const execution = await getExecution(db, req.params.id);
    if (!execution) return res.status(404).json({ error: 'Execution not found' });

    const steps = execution.workflowDefinition.steps;
    const currentStep = execution.currentStepIndex < steps.length
      ? steps[execution.currentStepIndex]
      : null;

    res.json({
      id: execution.id,
      workflowId: execution.workflowId,
      mode: execution.mode,
      status: execution.status,
      currentStepIndex: execution.currentStepIndex,
      currentStep,
      totalSteps: steps.length,
      stepResults: execution.stepResults,
      context: execution.context,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      error: execution.error,
    });
  });

  // ── POST /api/workflows/executions/:id/continue — approve current paused step
  // Rehydrates from PostgreSQL when not in the hot cache (restart survival).
  router.post('/executions/:id/continue', async (req, res) => {
    const access = await decideExecutionAccess(db, req.params.id, reqUser(req));
    if (access !== 'allow') return res.status(404).json({ error: 'Execution not found' });
    const execution = await getExecution(db, req.params.id);
    if (!execution) return res.status(404).json({ error: 'Execution not found' });
    if (execution.status !== 'paused') {
      return res.status(400).json({ error: `Execution is not paused (status: ${execution.status})` });
    }

    // Apply any output overrides provided by the reviewer
    const { overrides } = req.body as { overrides?: Record<string, unknown> };
    if (overrides) {
      Object.assign(execution.context, overrides);
    }

    // Mark current step as approved and advance
    const currentResult = execution.stepResults.find(
      (r) => r.stepIndex === execution.currentStepIndex && r.status === 'running'
    );
    if (currentResult) {
      currentResult.status = 'completed';
      currentResult.completedAt = new Date().toISOString();
    }

    execution.status = 'running';

    // Advance to next step (for guided mode: currentStepIndex was already incremented before pause)
    // For checkpoint steps: the step itself needs to be completed and we advance
    const currentStepType = execution.workflowDefinition.steps[execution.currentStepIndex]?.type;
    if (currentStepType === 'checkpoint') {
      execution.currentStepIndex++;
    }

    runExecution(execution, db).catch((err) => {
      execution.status = 'failed';
      execution.error = err.message;
      void persistExecution(db, execution);
    });

    res.json({ executionId: execution.id, status: execution.status });
  });

  // ── POST /api/workflows/executions/:id/modify-step — modify output before continuing
  router.post('/executions/:id/modify-step', async (req, res) => {
    const access = await decideExecutionAccess(db, req.params.id, reqUser(req));
    if (access !== 'allow') return res.status(404).json({ error: 'Execution not found' });
    const execution = await getExecution(db, req.params.id);
    if (!execution) return res.status(404).json({ error: 'Execution not found' });
    if (execution.status !== 'paused') {
      return res.status(400).json({ error: 'Execution is not paused' });
    }

    const { modifications } = req.body as { modifications: Record<string, unknown> };
    if (!modifications) return res.status(400).json({ error: 'modifications is required' });

    // Apply modifications to context
    Object.assign(execution.context, modifications);

    // Update the last step result output
    const lastResult = execution.stepResults[execution.stepResults.length - 1];
    if (lastResult) {
      lastResult.output = { ...lastResult.output, ...modifications, _modified: true };
    }

    await persistExecution(db, execution);
    res.json({ success: true, context: execution.context });
  });

  // ── POST /api/workflows/executions/:id/skip-step
  router.post('/executions/:id/skip-step', async (req, res) => {
    const access = await decideExecutionAccess(db, req.params.id, reqUser(req));
    if (access !== 'allow') return res.status(404).json({ error: 'Execution not found' });
    const execution = await getExecution(db, req.params.id);
    if (!execution) return res.status(404).json({ error: 'Execution not found' });
    if (execution.status !== 'paused') {
      return res.status(400).json({ error: 'Execution is not paused' });
    }

    // Mark current step as skipped
    const lastResult = execution.stepResults[execution.stepResults.length - 1];
    if (lastResult && lastResult.status === 'running') {
      lastResult.status = 'skipped';
      lastResult.completedAt = new Date().toISOString();
    }

    execution.currentStepIndex++;
    execution.status = 'running';
    await persistExecution(db, execution);

    runExecution(execution, db).catch((err) => {
      execution.status = 'failed';
      execution.error = err.message;
      void persistExecution(db, execution);
    });

    res.json({ executionId: execution.id, status: execution.status });
  });

  // ── POST /api/workflows/executions/:id/abort
  router.post('/executions/:id/abort', async (req, res) => {
    const access = await decideExecutionAccess(db, req.params.id, reqUser(req));
    if (access !== 'allow') return res.status(404).json({ error: 'Execution not found' });
    const execution = await getExecution(db, req.params.id);
    if (!execution) return res.status(404).json({ error: 'Execution not found' });

    execution.status = 'aborted';
    execution.completedAt = new Date().toISOString();
    await persistExecution(db, execution);

    res.json({ executionId: execution.id, status: 'aborted' });
  });

  // ── GET /api/workflows/executions — list recent executions
  // Reads the durable PostgreSQL store (survives restarts); falls back to the
  // in-memory map if the table/columns are unavailable (pre-migration deploy).
  router.get('/executions', async (req, res) => {
    // Team-mode non-admins see only their own executions (round-2 medium finding).
    const { userId, isAdmin } = reqUser(req);
    const ownerFilter = isAdmin ? undefined : userId;
    try {
      const list = await listExecutionSummaries(db, 50, ownerFilter);
      res.json(list);
    } catch {
      const list = Array.from(executions.values())
        .filter((e) => !ownerFilter || e.userId === ownerFilter || e.createdBy === ownerFilter)
        .map((e) => ({
          id: e.id,
          workflowId: e.workflowId,
          workflowLabel: e.workflowDefinition.label,
          mode: e.mode,
          status: e.status,
          currentStepIndex: e.currentStepIndex,
          totalSteps: e.workflowDefinition.steps.length,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
        }))
        .sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1))
        .slice(0, 50);
      res.json(list);
    }
  });

  // ── POST /api/workflows/executions/record — client-loop run summary
  // The WorkflowsPage step loop runs claude steps client-side; it posts its
  // run summary here so navigating away no longer orphans the run (4.1.4).
  router.post('/executions/record', async (req, res) => {
    const { id, workflowId, workflowLabel, status, currentStepIndex, stepStates, sessionId, startedAt, completedAt } =
      req.body as {
        id?: string; workflowId?: string; workflowLabel?: string; status?: string;
        currentStepIndex?: number; stepStates?: unknown; sessionId?: string;
        startedAt?: string; completedAt?: string;
      };
    if (!id || !workflowId) {
      return res.status(400).json({ error: 'id and workflowId are required' });
    }
    const validStatuses = ['pending', 'running', 'paused', 'completed', 'failed', 'aborted'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }
    await recordClientRun(db, {
      id,
      workflowId,
      workflowLabel: workflowLabel || workflowId,
      status: status as WorkflowExecution['status'],
      currentStepIndex: currentStepIndex ?? 0,
      stepStates: stepStates ?? [],
      sessionId,
      startedAt,
      completedAt,
      userId: reqUser(req).userId,
    });
    res.json({ success: true, id });
  });

  // ── GET /api/workflows/approvals/pending — parked runs across BOTH engines
  // (paused interactive executions + scheduled runs awaiting approval).
  // Backs the HomeV2 pending-approvals card.
  router.get('/approvals/pending', async (req, res) => {
    try {
      const items = await listPendingApprovals(db, reqUser(req));
      res.json({ items, count: items.length });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/workflows/runs/:id/approve — resume a scheduled run parked
  // at an approval gate (re-enters the executor loop at the stored step index
  // with the stored context — migration 230 columns).
  router.post('/runs/:id/approve', async (req, res) => {
    try {
      const access = await decideRunAccess(db, req.params.id, reqUser(req));
      if (access !== 'allow') return res.status(404).json({ error: `Run not found: ${req.params.id}` });
      const result = await resumeApprovedRun(db, req.params.id);
      res.json({
        runId: result.runId,
        success: result.success,
        stepsCompleted: result.stepsCompleted,
        stepsSkipped: result.stepsSkipped,
        awaitingApproval: result.awaitingApproval ?? false,
        error: result.error,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return res.status(404).json({ error: msg });
      if (msg.includes('not awaiting approval')) return res.status(409).json({ error: msg });
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/workflows/runs/:id/reject — terminally reject a parked run
  router.post('/runs/:id/reject', async (req, res) => {
    const { reason } = req.body as { reason?: string };
    try {
      const access = await decideRunAccess(db, req.params.id, reqUser(req));
      if (access !== 'allow') return res.status(404).json({ error: `Run not found: ${req.params.id}` });
      await rejectRun(db, req.params.id, reason);
      res.json({ runId: req.params.id, status: 'rejected' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return res.status(404).json({ error: msg });
      if (msg.includes('not awaiting approval')) return res.status(409).json({ error: msg });
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/workflows/execute-step — run a single step ad-hoc
  router.post('/execute-step', async (req, res) => {
    const { step, context = {} } = req.body as { step: WorkflowStep; context?: Record<string, unknown> };
    if (!step?.type) return res.status(400).json({ error: 'step is required' });

    const fakeExecution: WorkflowExecution = {
      id: `adhoc-${randomUUID()}`,
      workflowId: 'adhoc',
      workflowDefinition: {
        id: 'adhoc', label: 'Ad-hoc', shortLabel: 'Ad-hoc', icon: 'ClipboardList',
        description: '', category: 'assessment', estimatedTime: '', steps: [step], tags: [],
      },
      mode: 'automatic',
      status: 'running',
      currentStepIndex: 0,
      context,
      stepResults: [],
      startedAt: new Date().toISOString(),
    };

    try {
      const { output } = await executeStep(step, fakeExecution, db);
      res.json({ output, summary: humanizeOutput(output, step.type) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // ── POST /api/workflows/guide-message — AI-guided workflow discovery: one turn
  router.post('/guide-message', async (req, res) => {
    if (!anthropic) return res.status(503).json({ error: 'AI service not configured' });
    const { messages, userMessage } = req.body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      userMessage: string;
    };
    if (!userMessage?.trim()) return res.status(400).json({ error: 'userMessage is required' });
    try {
      const allMessages = [...messages, { role: 'user' as const, content: userMessage.trim() }];
      const result = await callChat({
        model: await getRoutedUtilityModel(db),
        maxTokens: 512,
        system: WORKFLOW_GUIDE_SYSTEM_PROMPT,
        messages: allMessages,
      });
      res.json({ response: result.text });
    } catch (err) {
      const msg = safeError(err);
      res.status(500).json({ error: msg });
    }
  });

  // ── POST /api/workflows/guide-generate — generate WorkflowDefinition from conversation
  router.post('/guide-generate', async (req, res) => {
    if (!anthropic) return res.status(503).json({ error: 'AI service not configured' });
    const { messages } = req.body as { messages: Array<{ role: 'user' | 'assistant'; content: string }> };
    if (!messages?.length) return res.status(400).json({ error: 'messages are required' });
    try {
      const conversationSummary = messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
      const result = await callChat({
        model: mapModelToProvider('claude-sonnet-4-6'),
        maxTokens: 2048,
        system: WORKFLOW_GENERATE_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Here is the discovery conversation:\n\n${conversationSummary}\n\nGenerate the workflow configuration JSON now.`,
        }],
      });
      const text = result.text.trim();
      const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const workflowDefinition = JSON.parse(cleaned) as WorkflowDefinition;
      // Ensure isCustom flag + unique id
      workflowDefinition.isCustom = true;
      if (!workflowDefinition.id || workflowDefinition.id === 'custom-[8-char-hex]') {
        workflowDefinition.id = `custom-${randomUUID().slice(0, 8)}`;
      }
      res.json({ workflowDefinition });
    } catch (err) {
      const msg = safeError(err);
      res.status(500).json({ error: msg });
    }
  });

  return router;
}
