// ── Missions — Task Executor ────────────────────────────────────────────────
// Per-task execution. Supported task types:
//   • llm             — calls the LLM with the task prompt + mission context
//   • checkpoint      — pauses the mission, records a checkpoint activity entry
//   • api_call        — real HTTP request (audit improvement #1A)
//   • database_query  — read-only SELECT against local or external DB (#1B)
//   • browser         — Playwright or api-workflow Service Pack runner (#1C)
//   • conditional     — evaluates a predicate; skips dependents on false
//   • parallel_group  — marker task (completes immediately)
//   • notification    — REAL delivery via mission-delivery (in_app/webhook/filesystem)
//
// 'research' / 'analysis' / 'export' fall back to an llm-style call;
// 'research' additionally gets Claude's native web_search tool when the
// resolved provider is Anthropic (2A.3).

import Anthropic from '@anthropic-ai/sdk';
import { callChat, type StreamChatConfig, type ChatResult } from '../provider-router.js';
import { createMissionState } from './mission-state.js';
import { createMissionGrowBridge, type LeadInput, type OpportunityInput, type SignalInput } from './mission-grow-bridge.js';
import { createMissionDelivery } from './mission-delivery.js';
import { resolveNotificationChannel, composeDeliveryBundle } from './mission-notification.js';
import { resolveMissionModel, providerForModel } from './mission-model-resolver.js';
import { executeApiCall } from './executors/api-call-executor.js';
import { executeDatabaseQuery } from './executors/database-query-executor.js';
import { executeBrowser } from './executors/browser-executor.js';
import type { DatabaseAdapter } from '../../db/database.js';
import type { Mission, MissionTask } from './types.js';

// Action-layer task types share post-execution plumbing. The label is used
// as the `provider`/`model` slug in recordTaskOutput — picks up cleanly in
// the mission-activity log without pretending these are LLM calls.
const ACTION_PROVIDER_LABELS: Partial<Record<string, string>> = {
  api_call: 'http',
  database_query: 'sql',
  browser: 'browser',
};

// Autonomy gate (audit improvement #2). Before running an action task the
// executor consults this function; if it returns a reason, the mission is
// paused until grantTaskApproval() stamps the approval flag.
//
// Semantics:
//   • full_autonomy — never gated (explicit `checkpoint` tasks still work).
//   • briefing      — pause only when the action will mutate state
//                     (non-GET api_call, any external database_query,
//                     credentialed browser workflow). GET reads auto-run.
//   • check_in      — pause before every action task. Belt-and-braces mode
//                     for EU-AI-Act high-risk or when the user wants to
//                     review every outbound call.
export function approvalReasonForTask(
  mission: Mission,
  task: MissionTask,
): string | null {
  if (mission.autonomy_level === 'full_autonomy') return null;
  if (!ACTION_PROVIDER_LABELS[task.task_type]) return null;
  const cfg = (task.module_config ?? {}) as Record<string, unknown>;
  if (cfg.approval_granted === true) return null;

  if (mission.autonomy_level === 'check_in') {
    return `check_in autonomy: human approval required before ${task.task_type} task '${task.title}'.`;
  }

  // briefing — only gate side-effect-producing actions.
  if (task.task_type === 'api_call') {
    const method = String((cfg.method ?? 'GET')).toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      return `briefing autonomy: approval required — api_call is ${method} (state-changing).`;
    }
    return null;
  }
  if (task.task_type === 'database_query') {
    if (cfg.target === 'external') {
      return `briefing autonomy: approval required — database_query targets an external DB.`;
    }
    return null;
  }
  if (task.task_type === 'browser') {
    if (cfg.auth_credential_id) {
      return `briefing autonomy: approval required — browser workflow runs with an authenticated session.`;
    }
    return null;
  }
  return null;
}

interface ExecutionResult {
  success: boolean;
  outputFull?: string;
  outputSummary?: string;
  tokens?: number;
  durationMs?: number;
  reason?: string;            // for checkpoint pauses
  pausedMission?: boolean;
}

/** 120s timeout per task — adjust per task_type if needed. */
async function callChatWithTimeout(config: StreamChatConfig, timeoutMs = 120_000): Promise<ChatResult> {
  return Promise.race<ChatResult>([
    callChat(config),
    new Promise<ChatResult>((_, reject) =>
      setTimeout(() => reject(new Error(`Task LLM call timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

export function createMissionExecutor(db: DatabaseAdapter) {
  const state = createMissionState(db);
  const grow = createMissionGrowBridge(db);
  const delivery = createMissionDelivery(db);

  /**
   * Execute a single ready task. Updates the task row with output, timing,
   * model used. Returns whether execution succeeded — caller (controller)
   * decides whether to continue with the next task or pause the mission.
   */
  async function executeTask(mission: Mission, task: MissionTask): Promise<ExecutionResult> {
    const start = Date.now();

    // ── Checkpoint: pause the mission, await human approval ────────────────
    if (task.task_type === 'checkpoint') {
      const reason = task.description?.trim() || `Checkpoint reached: ${task.title}`;
      await state.updateTaskStatus(task.id, 'paused');
      await state.updateMissionStatus(mission.id, 'review');
      await state.logActivity(mission.id, {
        activityType: 'checkpoint_reached',
        description: reason,
        taskId: task.id,
      });
      return { success: true, pausedMission: true, reason };
    }

    // ── parallel_group: marker that completes immediately ─────────────────
    // The task itself is a structural no-op — completes immediately so its
    // children (which depend on it) become ready. controller.advanceBatch
    // then runs those mutually-independent children in parallel via
    // Promise.allSettled, so authors get real concurrency by structuring
    // their graph with a parallel_group parent over independent siblings.
    if (task.task_type === 'parallel_group') {
      await state.recordTaskOutput(task.id, {
        full: JSON.stringify({ kind: 'parallel_group', note: 'Fan-out marker — children run concurrently via advanceBatch' }),
        summary: `parallel_group: children run concurrently`,
        provider: 'control', model: 'control', tier: 'utility',
        tokens: 0, durationSeconds: 0,
      });
      await state.logActivity(mission.id, {
        activityType: 'task_completed',
        description: `Completed: ${task.title} (parallel_group marker)`,
        taskId: task.id,
      });
      return { success: true, outputSummary: 'parallel_group marker', durationMs: Date.now() - start };
    }

    // ── conditional: predicate evaluation; skips dependents on false ──────
    if (task.task_type === 'conditional') {
      const cfg = (task.module_config ?? {}) as { predicate?: ConditionalPredicate };
      const verdict = await evaluateConditional(cfg.predicate, mission.id, state);
      await state.recordTaskOutput(task.id, {
        full: JSON.stringify({ predicate: cfg.predicate ?? null, outcome: verdict.outcome, reason: verdict.reason }),
        summary: `conditional: ${verdict.outcome ? 'true' : 'false'} — ${verdict.reason}`,
        provider: 'control', model: 'control', tier: 'utility',
        tokens: 0, durationSeconds: 0,
      });
      if (!verdict.outcome) {
        // Skip direct dependents. Transitive skipping lets advance() naturally
        // propagate: a task whose only blocking dep is 'skipped' will itself
        // be picked up as ready, but getNextReadyTask currently treats skipped
        // deps as unmet. We explicitly skip the immediate children here; a
        // future enhancement can walk the chain.
        const deps = await state.listDependencies(mission.id);
        const dependentIds = deps.filter(d => d.depends_on_task_id === task.id).map(d => d.task_id);
        for (const depId of dependentIds) {
          await state.updateTaskStatus(depId, 'skipped', { completedAt: new Date().toISOString() });
        }
        await state.logActivity(mission.id, {
          activityType: 'task_completed',
          description: `Conditional '${task.title}' → false; skipped ${dependentIds.length} dependent task${dependentIds.length === 1 ? '' : 's'}: ${verdict.reason}`,
          taskId: task.id,
        });
      } else {
        await state.logActivity(mission.id, {
          activityType: 'task_completed',
          description: `Conditional '${task.title}' → true: ${verdict.reason}`,
          taskId: task.id,
        });
      }
      return { success: true, outputSummary: `conditional=${verdict.outcome}`, durationMs: Date.now() - start };
    }

    // ── Mark active ────────────────────────────────────────────────────────
    const startedAt = new Date().toISOString();
    await state.updateTaskStatus(task.id, 'active', { startedAt });
    await state.logActivity(mission.id, {
      activityType: 'task_started',
      description: `Started: ${task.title}`,
      taskId: task.id,
    });

    // ── Autonomy gate (audit #2) ──────────────────────────────────────────
    // Pause the mission before any action task that needs human approval
    // given the mission's autonomy_level. Resume happens when
    // controller.grantTaskApproval() stamps approval_granted.
    const approvalReason = approvalReasonForTask(mission, task);
    if (approvalReason) {
      await state.updateTaskStatus(task.id, 'paused');
      await state.updateMissionStatus(mission.id, 'review');
      await state.logActivity(mission.id, {
        activityType: 'approval_required',
        description: approvalReason,
        taskId: task.id,
      });
      return { success: true, pausedMission: true, reason: approvalReason };
    }

    // ── Non-LLM action executors (api_call, database_query, browser) ──────
    // All three run a tool, record output + activity, and share retry/fail
    // semantics. Keep the shared plumbing here so each executor stays a
    // single-responsibility function.
    const actionLabel = ACTION_PROVIDER_LABELS[task.task_type];
    if (actionLabel) {
      const r = await runActionExecutor(task.task_type, mission, task);
      await state.recordTaskOutput(task.id, {
        full: r.outputFull,
        summary: r.outputSummary,
        provider: actionLabel,
        model: actionLabel,
        tier: 'utility',
        tokens: 0,
        durationSeconds: Math.round(r.durationMs / 1000),
      });
      await state.logActivity(mission.id, {
        activityType: r.success ? 'task_completed' : 'task_failed',
        description: r.success
          ? `Completed: ${task.title} (${r.outputSummary})`
          : `Failed: ${task.title} — ${r.errorReason ?? 'unknown'}`,
        taskId: task.id,
      });
      if (!r.success) {
        const fallbackMsg = `${task.task_type} failed`;
        const newRetry = task.retry_count + 1;
        if (newRetry > task.max_retries) {
          await state.updateTaskStatus(task.id, 'failed', { lastError: r.errorReason ?? fallbackMsg });
          return { success: false, reason: r.errorReason };
        }
        await state.bumpTaskRetry(task.id, r.errorReason ?? fallbackMsg);
        return { success: false, reason: r.errorReason };
      }
      return { success: true, outputFull: r.outputFull, outputSummary: r.outputSummary, durationMs: r.durationMs };
    }

    async function runActionExecutor(
      type: MissionTask['task_type'],
      m: Mission,
      t: MissionTask,
    ): Promise<{ success: boolean; outputFull: string; outputSummary: string; durationMs: number; errorReason?: string }> {
      if (type === 'api_call') return executeApiCall(db, m, t);
      if (type === 'database_query') return executeDatabaseQuery(db, m, t);
      return executeBrowser(db, m, t);
    }

    // ── notification: REAL delivery via missionDelivery (Wave-2 2A.2) ─────
    // Previously fell through to a generic LLM call whose prose merely
    // *claimed* delivery happened. Now: compose the bundle from completed
    // task outputs and dispatch through mission-delivery, honouring the
    // mission's notification_preferences (implemented channels:
    // in_app | webhook | filesystem — unimplemented preferences degrade to
    // in_app with an explicit note).
    if (task.task_type === 'notification') {
      const target = resolveNotificationChannel(task.module_config, mission.notification_preferences);
      const allTasks = await state.listTasks(mission.id);
      const bundle = composeDeliveryBundle(allTasks.filter(t => t.id !== task.id));
      const cfg = (task.module_config ?? {}) as { subject?: unknown };
      const subject = typeof cfg.subject === 'string' && cfg.subject.trim()
        ? cfg.subject.trim()
        : `Mission deliverable: ${mission.title}`;

      const deliveryResult = await delivery.deliver({
        missionId: mission.id,
        taskId: task.id,
        channel: target.channel,
        destination: target.destination,
        body: bundle || task.description || `Deliverable for mission: ${mission.title}`,
        subject,
      });

      const outputFull = JSON.stringify({
        kind: 'notification',
        channel: target.channel,
        delivery_id: deliveryResult.delivery_id,
        status: deliveryResult.status,
        note: target.note,
        error: deliveryResult.error ?? null,
        bundle_chars: bundle.length,
      }, null, 2);
      const summary = [
        `delivery → ${target.channel}: ${deliveryResult.status}`,
        target.note ?? undefined,
        deliveryResult.error ? `(${deliveryResult.error.slice(0, 200)})` : undefined,
      ].filter((s): s is string => Boolean(s)).join(' — ');

      // 'failed' = the delivery exhausted its own retries; surface as a task
      // failure (with task-level retry semantics). 'delivered' and 'pending'
      // (queued for the delivery retry tick) both complete the task.
      if (deliveryResult.status === 'failed') {
        const reason = deliveryResult.error ?? 'delivery failed';
        const newRetry = task.retry_count + 1;
        if (newRetry > task.max_retries) {
          await state.updateTaskStatus(task.id, 'failed', { lastError: reason });
        } else {
          await state.bumpTaskRetry(task.id, reason);
        }
        await state.logActivity(mission.id, {
          activityType: 'task_failed',
          description: `Delivery failed: ${task.title} — ${reason}`,
          taskId: task.id,
        });
        return { success: false, reason, durationMs: Date.now() - start };
      }

      await state.recordTaskOutput(task.id, {
        full: outputFull,
        summary,
        provider: 'delivery',
        model: target.channel,
        tier: 'utility',
        tokens: 0,
        durationSeconds: Math.round((Date.now() - start) / 1000),
      });
      await state.logActivity(mission.id, {
        activityType: 'task_completed',
        description: `Delivered: ${task.title} (${summary})`,
        taskId: task.id,
      });
      return { success: true, outputFull, outputSummary: summary, durationMs: Date.now() - start };
    }

    // ── Build per-task system prompt ───────────────────────────────────────
    // Phase 1: simple — mission objective + success criteria + accumulated
    // outputs from prior tasks. Phase 2 will use mission-context.ts for
    // full model-aware reconstruction.
    const priorTasks = (await state.listTasks(mission.id))
      .filter(t => t.status === 'completed' && t.id !== task.id)
      .slice(-6); // include up to 6 prior outputs

    const priorBlock = priorTasks.length > 0
      ? `Prior task outputs (most recent first):\n${priorTasks
          .reverse()
          .map(t => `[${t.title}]:\n${truncate(t.output_full ?? '', 1500)}`)
          .join('\n\n---\n\n')}`
      : 'No prior task outputs yet — this is the first executable task in the mission.';

    const systemPrompt = `You are ANTON, executing a task within a long-running autonomous mission.

MISSION
───────
Title: ${mission.title}
Objective: ${mission.objective}
${mission.context ? `Context: ${mission.context}\n` : ''}Success criteria: ${mission.success_criteria}

CURRENT TASK
────────────
Title: ${task.title}
Type: ${task.task_type}
${task.description ? `Description: ${task.description}\n` : ''}
${priorBlock}

QUALITY BAR
───────────
- Be specific. Cite evidence and reasoning, not just conclusions.
- If you cannot complete the task with available information, explicitly say what's missing.
- Output a focused result for THIS task only — do not solve the entire mission.
- Output Markdown. No preamble. No "Here's my response:" — just the work.

STRUCTURED CRM CAPTURE (optional)
─────────────────────────────────
If your task surfaces sales-relevant records, emit them as fenced JSON
blocks alongside the prose. They will be routed to the Grow CRM. Only emit
when you have real data — do NOT speculate.
- \`\`\`grow_lead { "firstName": "...", "lastName": "...", "email": "...", "organisation": { "name": "..." } }\`\`\`
- \`\`\`grow_opportunity { "title": "...", "value": 50000, "currency": "EUR", "stageId": "qualified" }\`\`\`
- \`\`\`grow_signal { "signalType": "regulatory", "title": "...", "priority": "high", "source": "..." }\`\`\``;

    // The actual task prompt (from decomposition) is the user message.
    const userPrompt = (task.module_config as { prompt?: string })?.prompt
      || task.description
      || `Carry out: ${task.title}`;

    // ── LLM call ───────────────────────────────────────────────────────────
    // 2A.4 — honour the mission's model_strategy (execution tier) instead of
    // the previous hardcoded Claude mapping.
    const tier: 'planning' | 'execution' | 'utility' = 'execution';
    const modelId = resolveMissionModel(tier, mission.model_strategy);
    const provider = providerForModel(modelId);

    // 2A.3 — research tasks get Claude's native web_search tool (other task
    // types can opt in via module_config.web_search === true). Anthropic
    // only: web_search_20250305 is Claude-specific, so non-Anthropic
    // providers skip silently and run the plain LLM call.
    const cfgForSearch = task.module_config as { web_search?: unknown } | null;
    const wantsWebSearch = task.task_type === 'research' || cfgForSearch?.web_search === true;
    const useWebSearch = wantsWebSearch && provider === 'anthropic' && Boolean(process.env.ANTHROPIC_API_KEY);

    let result: ChatResult;
    try {
      const maxTokens = Math.min(task.estimated_tokens ?? 8000, 16_000);
      result = useWebSearch
        ? await callAnthropicWithWebSearch({
            model: modelId,
            system: systemPrompt,
            user: userPrompt,
            maxTokens,
          })
        : await callChatWithTimeout({
            model: modelId,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens,
            thinkingLevel: 'think',
          });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const newRetry = task.retry_count + 1;
      if (newRetry > task.max_retries) {
        await state.updateTaskStatus(task.id, 'failed', { lastError: message });
        await state.logActivity(mission.id, {
          activityType: 'task_failed',
          description: `${task.title} failed after ${task.max_retries} retries: ${message}`,
          taskId: task.id,
        });
        return { success: false, reason: message };
      }
      await state.bumpTaskRetry(task.id, message);
      await state.logActivity(mission.id, {
        activityType: 'task_retried',
        description: `${task.title} retry ${newRetry}/${task.max_retries}: ${message}`,
        taskId: task.id,
      });
      return { success: false, reason: message };
    }

    const durationMs = Date.now() - start;
    const totalTokens = result.inputTokens + result.outputTokens;
    const summary = result.text.length > 600 ? result.text.slice(0, 600).trim() + '…' : result.text;

    await state.recordTaskOutput(task.id, {
      full: result.text,
      summary,
      provider,
      model: modelId,
      tier,
      tokens: totalTokens,
      durationSeconds: Math.round(durationMs / 1000),
    });
    await state.bumpTokenBudget(mission.id, totalTokens);
    await state.logActivity(mission.id, {
      activityType: 'task_completed',
      description: `Completed: ${task.title}`,
      taskId: task.id,
      tokensConsumed: totalTokens,
    });

    // Spec §13.3 — route any structured CRM blocks the LLM emitted to the
    // Grow tables. Failures on individual records are logged but do not
    // fail the task (the prose output is the primary deliverable).
    await dispatchGrowBlocks(mission.id, task.id, result.text);

    return { success: true, outputFull: result.text, outputSummary: summary, tokens: totalTokens, durationMs };
  }

  /**
   * Scan task output for fenced grow_* JSON blocks and route each to the
   * appropriate Grow table via the bridge. Best-effort — never throws.
   */
  async function dispatchGrowBlocks(missionId: string, taskId: string, text: string): Promise<void> {
    const blocks = extractGrowBlocks(text);
    for (const b of blocks) {
      try {
        if (b.kind === 'grow_lead')         await grow.recordLead(missionId, taskId, b.data as unknown as LeadInput);
        else if (b.kind === 'grow_opportunity') await grow.recordOpportunity(missionId, taskId, b.data as unknown as OpportunityInput);
        else                                await grow.recordSignal(missionId, taskId, b.data as unknown as SignalInput);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await state.logActivity(missionId, {
          activityType: 'grow_dispatch_failed',
          description: `Failed to record ${b.kind}: ${msg}`,
          taskId,
          details: { kind: b.kind, error: msg },
        });
      }
    }
  }

  return { executeTask };
}

export type MissionExecutor = ReturnType<typeof createMissionExecutor>;

// ── Helpers ────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trim() + '… [truncated]';
}

interface GrowBlock { kind: 'grow_lead' | 'grow_opportunity' | 'grow_signal'; data: Record<string, unknown> }

/**
 * Extract fenced ```grow_lead / grow_opportunity / grow_signal``` blocks
 * from LLM output. Tolerates surrounding whitespace and extra language tags.
 * Malformed JSON inside a block is silently skipped.
 */
export function extractGrowBlocks(text: string): GrowBlock[] {
  const out: GrowBlock[] = [];
  const re = /```(grow_lead|grow_opportunity|grow_signal)\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const kind = match[1] as GrowBlock['kind'];
    const raw = match[2].trim();
    try {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        out.push({ kind, data: data as Record<string, unknown> });
      }
    } catch { /* skip malformed block */ }
  }
  return out;
}

/**
 * Direct Anthropic call with the native web_search tool (Wave-2 2A.3).
 * Mirrors the established pattern in pathfinder-engine / radar-fetcher:
 * web_search_20250305 is Claude-specific so it can't go through callChat
 * (which never forwards tools on the non-streaming Anthropic path), and
 * web search + extended thinking are mutually exclusive — research tasks
 * trade thinking for live sources. Streamed internally to dodge the SDK's
 * long-request restriction; bounded by an overall timeout.
 */
async function callAnthropicWithWebSearch(
  params: { model: string; system: string; user: string; maxTokens: number },
  timeoutMs = 180_000,
): Promise<ChatResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: params.model,
    max_tokens: params.maxTokens,
    system: params.system,
    messages: [{ role: 'user', content: params.user }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] as unknown as Anthropic.Messages.Tool[],
  });
  const response = await Promise.race([
    stream.finalMessage(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Web-search task timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
  let text = '';
  for (const block of response.content) {
    if (block.type === 'text') text += block.text;
  }
  return {
    text,
    thinking: '',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ── Conditional predicates ─────────────────────────────────────────────────
// Union kept small on purpose — mission authors compose branching logic from
// concrete task outputs rather than free-form DSL. always_true / always_false
// exist for manually-gated placeholder branches that the human flips later
// via an edit.

export type ConditionalPredicate =
  | { kind: 'always_true' }
  | { kind: 'always_false' }
  | { kind: 'task_output_contains'; task_id: string; substring: string; case_sensitive?: boolean; expect?: boolean }
  | { kind: 'task_output_nonempty'; task_id: string; expect?: boolean };

interface ConditionalVerdict {
  outcome: boolean;
  reason: string;
}

async function evaluateConditional(
  predicate: ConditionalPredicate | undefined,
  _missionId: string,
  state: ReturnType<typeof createMissionState>,
): Promise<ConditionalVerdict> {
  if (!predicate) return { outcome: true, reason: 'no predicate — treating as true (vacuous)' };
  switch (predicate.kind) {
    case 'always_true':  return { outcome: true,  reason: 'always_true' };
    case 'always_false': return { outcome: false, reason: 'always_false' };
    case 'task_output_contains': {
      const t = await state.getTask(predicate.task_id);
      if (!t) return { outcome: false, reason: `referenced task ${predicate.task_id} not found` };
      const haystackRaw = `${t.output_summary ?? ''}\n${t.output_full ?? ''}`;
      const needle = predicate.substring;
      const found = predicate.case_sensitive
        ? haystackRaw.includes(needle)
        : haystackRaw.toLowerCase().includes(needle.toLowerCase());
      const expect = predicate.expect !== false;
      const outcome = expect ? found : !found;
      return {
        outcome,
        reason: `${found ? 'found' : 'did not find'} '${needle.slice(0, 40)}' in task ${predicate.task_id.slice(0, 12)}; expect=${expect}`,
      };
    }
    case 'task_output_nonempty': {
      const t = await state.getTask(predicate.task_id);
      if (!t) return { outcome: false, reason: `referenced task ${predicate.task_id} not found` };
      const nonempty = Boolean((t.output_full ?? '').trim() || (t.output_summary ?? '').trim());
      const expect = predicate.expect !== false;
      const outcome = expect ? nonempty : !nonempty;
      return { outcome, reason: `task ${predicate.task_id.slice(0, 12)} output ${nonempty ? 'non-empty' : 'empty'}; expect=${expect}` };
    }
    default: {
      const _exhaustive: never = predicate;
      return { outcome: false, reason: `unknown predicate kind: ${JSON.stringify(_exhaustive)}` };
    }
  }
}
