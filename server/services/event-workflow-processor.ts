/**
 * event-workflow-processor.ts
 * Background poller that picks up workflow_runs created by event-driven webhook triggers
 * (status='pending', trigger_source contains type:'event') and executes their headless steps.
 *
 * Called from server/index.ts on a 15-second interval after startup.
 * Non-fatal: any error is logged but does NOT crash the server.
 */

import type { DatabaseAdapter } from '../db/database.js';

import type { WorkflowDefinition } from '../../src/lib/workflow-definitions.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface PendingEventRun {
  id: string;
  workflow_id: string;
  trigger_source: string;
  user_id: string;
  started_at: string;
}

// Step types that can run without user interaction (mirrors workflow-executor.ts)
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
  'messaging_notification',
  'script',
  'llm',
  'parallel',
]);

// ── Poll loop ──────────────────────────────────────────────────────────────

/**
 * Poll once: pick up pending event-triggered workflow runs and execute them.
 * Safe to call on any interval — idempotent guard via status='running' claim.
 */
export async function processPendingEventRuns(db: DatabaseAdapter): Promise<void> {
  let pending: PendingEventRun[];
  try {
    // Only pick up runs whose trigger_source encodes type:'event' (set by webhook-listener)
    pending = await db.all(`
      SELECT id, workflow_id, trigger_source, user_id, started_at
      FROM workflow_runs
      WHERE status = 'pending'
        AND trigger_source LIKE '%"type":"event"%'
      ORDER BY started_at ASC
      LIMIT 10
    `) as PendingEventRun[];
  } catch {
    // Table may not exist in older deploys — silently skip
    return;
  }

  for (const run of pending) {
    // Atomic claim: update to 'running' only if still 'pending' (prevents double-execution)
    const claimed = await db.run(`
      UPDATE workflow_runs SET status = 'running' WHERE id = ? AND status = 'pending'
    `, run.id);

    if (claimed.changes === 0) continue; // Already claimed by another process

    try {
      await executeEventRun(db, run);
    } catch (err) {
      console.error(`[event-processor] Run ${run.id} failed:`, err);
      try {
        await db.run(`
          UPDATE workflow_runs SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?
        `, String(err instanceof Error ? err.message : err), run.id);
      } catch { /* non-fatal */ }
    }
  }
}

// ── Run executor ───────────────────────────────────────────────────────────

async function executeEventRun(db: DatabaseAdapter, run: PendingEventRun): Promise<void> {
  // Parse trigger context (variables injected by webhook-listener)
  let triggerContext: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(run.trigger_source) as { variables?: Record<string, unknown> };
    triggerContext = parsed.variables || {};
  } catch { /* malformed trigger_source — continue with empty context */ }

  // Fetch workflow definition
  const defRow = await db.get('SELECT steps, config, label FROM workflow_definitions WHERE id = ?'
  , run.workflow_id) as { steps: string; config: string; label: string } | undefined;

  if (!defRow) {
    await db.run(`
      UPDATE workflow_runs SET status = 'failed', error_message = 'Workflow definition not found', completed_at = NOW() WHERE id = ?
    `, run.id);
    console.warn(`[event-processor] Workflow ${run.workflow_id} not found for run ${run.id}`);
    return;
  }

  let steps: WorkflowDefinition['steps'];
  try {
    steps = JSON.parse(defRow.steps || '[]') as WorkflowDefinition['steps'];
  } catch {
    steps = [];
  }

  const context: Record<string, unknown> = {
    ...triggerContext,
    _eventRun: true,
    _runId: run.id,
    _startedAt: new Date().toISOString(),
    _userId: run.user_id,
  };

  let stepsCompleted = 0;
  let stepsSkipped = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!HEADLESS_STEP_TYPES.has(step.type)) {
      // Interactive steps (claude, input, export, checkpoint) are skipped in headless mode
      console.log(`[event-processor] Run ${run.id}: skipping interactive step ${i} (${step.type})`);
      stepsSkipped++;
      continue;
    }

    try {
      await executeHeadlessStep(step, context, db, run.id);

      const outputVar = (step.config as Record<string, unknown> | undefined)?.outputVariable as string | undefined;
      if (outputVar) context[outputVar] = context[outputVar] ?? {};

      stepsCompleted++;

      // ── onCompleteTrigger: fire a new workflow run when this step completes ──
      const trigger = step.config && (step.config as Record<string, unknown>)['onCompleteTrigger'] as {
        type: string; workflowId: string; label?: string; variables?: Record<string, string>;
      } | undefined;
      if (trigger?.type === 'start_workflow' && trigger.workflowId) {
        try {
          const { randomUUID } = await import('crypto');
          const newRunId = randomUUID();
          const triggerVars: Record<string, unknown> = {};
          if (trigger.variables) {
            for (const [k, v] of Object.entries(trigger.variables)) {
              triggerVars[k] = typeof v === 'string' && v.startsWith('{{')
                ? context[v.slice(2, -2).trim()] ?? v
                : v;
            }
          }
          await db.run(`
            INSERT INTO workflow_runs (id, workflow_id, trigger_source, status, user_id, started_at)
            VALUES (?, ?, ?, 'pending', ?, NOW())
          `, 
            newRunId,
            trigger.workflowId,
            JSON.stringify({ type: 'event', source: 'step_complete', triggeredBy: run.id, stepIndex: i, label: trigger.label || '', variables: triggerVars }),
            run.user_id
          );
          console.log(`[event-processor] Step trigger: started workflow ${trigger.workflowId} run ${newRunId}`);
        } catch (triggerErr) {
          console.warn('[event-processor] onCompleteTrigger failed (non-fatal):', triggerErr);
        }
      }

      // Update progress
      await db.run('UPDATE workflow_runs SET current_step = ? WHERE id = ?', i + 1, run.id);
    } catch (stepErr) {
      console.warn(`[event-processor] Run ${run.id} step ${i} (${step.type}) failed:`, stepErr);
      stepsSkipped++;
      // Non-fatal: continue to next step
    }
  }

  await db.run(`
    UPDATE workflow_runs
    SET status = 'completed', completed_at = NOW(), current_step = ?
    WHERE id = ?
  `, steps.length, run.id);

  console.log(`[event-processor] Run ${run.id} completed: ${stepsCompleted} steps executed, ${stepsSkipped} skipped`);
}

// ── Minimal headless step executor ────────────────────────────────────────
// Handles the most common step types for event-triggered workflows.
// For full step execution, see workflow-executor.ts.

async function executeHeadlessStep(
  step: WorkflowDefinition['steps'][number],
  context: Record<string, unknown>,
  db: DatabaseAdapter,
  runId: string,
): Promise<void> {
  const cfg = (step.config || {}) as Record<string, unknown>;

  switch (step.type) {
    case 'wait': {
      const ms = ((cfg['durationSeconds'] as number) || 1) * 1000;
      // Cap wait at 5s in event-processor (don't block the poll loop)
      await sleep(Math.min(ms, 5000));
      break;
    }

    case 'transform':
    case 'data_transform': {
      // Simple key-remap transforms: { from: 'ctx_key', to: 'output_key' }
      const mappings = (cfg['mappings'] as Array<{ from: string; to: string }>) || [];
      for (const m of mappings) {
        if (m.from && m.to && context[m.from] !== undefined) {
          context[m.to] = context[m.from];
        }
      }
      break;
    }

    case 'notification':
    case 'messaging_notification': {
      // Log notification intent — actual delivery handled by messaging integrations
      const message = resolveTemplate(cfg['message'] as string || '', context);
      console.log(`[event-processor] Run ${runId} notification: ${message.slice(0, 120)}`);
      break;
    }

    case 'api_call': {
      // Skip external API calls in event-processor to avoid unintended side effects
      // Full execution available via the manual workflow runner UI
      console.log(`[event-processor] Run ${runId}: skipping api_call step (use manual runner for external calls)`);
      break;
    }

    case 'decision_gate':
    case 'conditional': {
      // Decision gates are treated as pass-through in event mode
      break;
    }

    case 'script': {
      // Run computation template or internal endpoint
      if (cfg['template']) {
        try {
          const { createMarketComputationService } = await import('./market-computation-service.js');
          const computationService = await createMarketComputationService(db);
          const params = (cfg['params'] as Record<string, unknown>) || {};
          const result = await computationService.runTemplate(
            cfg['template'] as string,
            params,
            'event-workflow'
          );
          const outputVar = (cfg['outputVariable'] as string) || 'script_result';
          context[outputVar] = result.output;
          console.log(`[event-processor] Run ${runId}: script template ${cfg['template']} — ${result.success ? 'success' : result.error}`);
        } catch (err) {
          console.warn(`[event-processor] Run ${runId}: script template failed:`, err);
        }
      } else if (cfg['endpoint']) {
        const port = process.env.PORT || 3001;
        const url = `http://localhost:${port}${cfg['endpoint']}`;
        const method = (cfg['method'] as string || 'POST').toUpperCase();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method !== 'GET' ? JSON.stringify(cfg['body'] || {}) : undefined,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const data = await response.json().catch(() => ({}));
          const outputVar = (cfg['outputVariable'] as string) || 'script_result';
          context[outputVar] = data;
        } catch (err) {
          clearTimeout(timeout);
          console.warn(`[event-processor] Run ${runId}: script endpoint failed:`, err);
        }
      }
      break;
    }

    case 'llm': {
      const promptName = cfg['prompt'] as string;
      if (!promptName) break;

      try {
        const { readFileSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const __dir = dirname(fileURLToPath(import.meta.url));
        const promptPath = join(__dir, '..', 'prompts', `${promptName}.md`);
        let systemPrompt: string;
        try { systemPrompt = readFileSync(promptPath, 'utf-8'); } catch { systemPrompt = `Market analysis: ${promptName}`; }

        const userMessage = cfg['userMessage']
          ? resolveTemplate(cfg['userMessage'] as string, context)
          : `Analyze:\n${JSON.stringify(context, null, 2).slice(0, 4000)}`;

        const { callChat } = await import('./provider-router.js');
        const { getRoutedUtilityModel } = await import('./utility-model.js');
        const result = await callChat({
          // Per-step model when configured; otherwise the provider-routed
          // utility model (review 3.8) so headless steps run anywhere.
          model: (cfg['model'] as string) || await getRoutedUtilityModel(db),
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          maxTokens: (cfg['maxTokens'] as number) || 2048,
          thinkingLevel: (cfg['thinking'] as string) || undefined,
        });

        const outputVar = (cfg['outputVariable'] as string) || 'llm_result';
        context[outputVar] = result.text;
        console.log(`[event-processor] Run ${runId}: llm step ${promptName} completed`);
      } catch (err) {
        console.warn(`[event-processor] Run ${runId}: llm step failed:`, err);
      }
      break;
    }

    case 'parallel': {
      const templates = (cfg['templates'] as string[]) || [];
      if (templates.length === 0) break;

      try {
        const { createMarketComputationService } = await import('./market-computation-service.js');
        const computationService = await createMarketComputationService(db);
        const params = (cfg['params'] as Record<string, unknown>) || {};

        const results = await Promise.allSettled(
          templates.map(t => computationService.runTemplate(t, params, 'event-workflow'))
        );

        const outputVar = (cfg['outputVariable'] as string) || 'parallel_results';
        context[outputVar] = results.map((r, i) => ({
          template: templates[i],
          success: r.status === 'fulfilled' ? r.value.success : false,
          output: r.status === 'fulfilled' ? r.value.output : null,
        }));
        console.log(`[event-processor] Run ${runId}: parallel step completed ${templates.length} templates`);
      } catch (err) {
        console.warn(`[event-processor] Run ${runId}: parallel step failed:`, err);
      }
      break;
    }

    default:
      // All other headless types: no-op in this minimal executor
      break;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolve {{variable}} templates in a string from context. */
function resolveTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(context[key] ?? ''));
}

// ── Startup wiring ─────────────────────────────────────────────────────────

/**
 * Start the event-workflow polling loop.
 * Call once from server/index.ts after DB is initialised.
 * Returns the interval handle so it can be cleared on graceful shutdown.
 */
export function startEventWorkflowProcessor(
  db: DatabaseAdapter,
  intervalMs = 15_000,
): ReturnType<typeof setInterval> {
  console.log(`[event-processor] Starting — polling every ${intervalMs / 1000}s`);

  const tick = () => {
    processPendingEventRuns(db).catch((err) => {
      console.error('[event-processor] Poll error (non-fatal):', err);
    });
  };

  // Run once immediately on startup (picks up any runs that piled up while server was down)
  tick();

  return setInterval(tick, intervalMs);
}
