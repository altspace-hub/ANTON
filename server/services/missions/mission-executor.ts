// ── Missions — Task Executor ────────────────────────────────────────────────
// Per-task execution. Phase 1 supports two task types end-to-end:
//   • llm        — calls the LLM with the task prompt + mission context, stores text output
//   • checkpoint — pauses the mission, records a checkpoint activity entry
//
// Other task_types ('research', 'analysis', 'export', 'browser', 'api_call', etc.)
// are placeholders for Phase 2+. They currently fall back to an llm-style call.

import { callChat, type StreamChatConfig, type ChatResult } from '../provider-router.js';
import { createMissionState } from './mission-state.js';
import { createMissionGrowBridge, type LeadInput, type OpportunityInput, type SignalInput } from './mission-grow-bridge.js';
import type { DatabaseAdapter } from '../../db/database.js';
import type { Mission, MissionTask } from './types.js';

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

    // ── Mark active ────────────────────────────────────────────────────────
    const startedAt = new Date().toISOString();
    await state.updateTaskStatus(task.id, 'active', { startedAt });
    await state.logActivity(mission.id, {
      activityType: 'task_started',
      description: `Started: ${task.title}`,
      taskId: task.id,
    });

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
    const tier: 'planning' | 'execution' | 'utility' = 'execution';
    const modelId = resolveModel(tier, mission.model_strategy);

    let result: ChatResult;
    try {
      result = await callChatWithTimeout({
        model: modelId,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: Math.min(task.estimated_tokens ?? 8000, 16_000),
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
      provider: 'anthropic',
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
 * Phase 1: simple model resolver.
 *   - planning tier → claude-opus-4-7
 *   - execution tier → claude-sonnet-4-6
 *   - utility tier → claude-haiku-4-5-20251001
 *
 * Phase 2 will honour `provider_preference`, fallback chain, cost optimisation,
 * and concrete model overrides.
 */
function resolveModel(tier: 'planning' | 'execution' | 'utility', _strategy: { planning_model?: string; execution_model?: string; utility_model?: string }): string {
  if (tier === 'planning') return 'claude-opus-4-7';
  if (tier === 'utility')  return 'claude-haiku-4-5-20251001';
  return 'claude-sonnet-4-6';
}
