// ── Missions — Task Decomposition ───────────────────────────────────────────
// LLM-driven generation of a TaskGraphTemplate from a mission brief.
//
// Phase 1: produces a flat task list with simple linear dependencies. Phase 2
// adds module-aware decomposition (selecting concrete ANTON modules per task)
// and parallel sub-graphs. Phase 3 adds checkpoint placement based on risk
// classification (EU AI Act high-risk → mandatory human checkpoints).

import { callChat, type StreamChatConfig, type ChatResult } from '../provider-router.js';
import type { Mission, TaskGraphTemplate, TaskGraphNode, MissionTemplate } from './types.js';

interface DecompositionResult {
  graph: TaskGraphTemplate;
  reasoning: string;
  model: string;
  tokensUsed: number;
}

/** 90s timeout — decomposition is a one-shot planning call. */
async function callChatWithTimeout(config: StreamChatConfig, timeoutMs = 90_000): Promise<ChatResult> {
  return Promise.race<ChatResult>([
    callChat(config),
    new Promise<ChatResult>((_, reject) =>
      setTimeout(() => reject(new Error(`Decomposition LLM call timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

/**
 * Decompose a mission brief into a task graph. Returns the proposed graph
 * for human review (Check-in autonomy) or auto-approval (higher autonomy).
 *
 * If the mission has a template_id, the template's task_graph_template is
 * used as a starting point and the LLM is asked to refine it for the
 * specific objective. Otherwise, the LLM generates from scratch.
 */
export async function decomposeMission(
  mission: Mission,
  template?: MissionTemplate,
): Promise<DecompositionResult> {
  const prompt = template
    ? buildTemplateRefinementPrompt(mission, template)
    : buildFromScratchPrompt(mission);

  const result = await callChatWithTimeout({
    model: 'claude-sonnet-4-6',
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    maxTokens: 6000,
    thinkingLevel: 'think_hard',
  });

  const graph = parseGraph(result.text);
  if (!graph || graph.tasks.length === 0) {
    throw new Error('Decomposition produced no tasks. The LLM may have failed to follow the JSON schema.');
  }

  return {
    graph: normalizeGraph(graph),
    reasoning: result.thinking || '',
    model: 'claude-sonnet-4-6',
    tokensUsed: result.inputTokens + result.outputTokens,
  };
}

// ── Prompt construction ────────────────────────────────────────────────────

function buildFromScratchPrompt(mission: Mission): { system: string; user: string } {
  const system = `You are ANTON's Mission Planner. You decompose a high-level mission objective into a concrete, executable task graph.

Output ONLY a JSON object on a single line, no preamble, no markdown fences. The schema is:
{
  "tasks": [
    {
      "local_id": "t1",                                 // unique within this graph
      "title": "...",                                   // short imperative title
      "description": "...",                             // 1-3 sentences
      "task_type": "llm" | "research" | "analysis" | "export" | "review" | "checkpoint",
      "estimated_tokens": 5000,                         // realistic estimate
      "depends_on": ["t1", ...],                        // local_ids this task depends on
      "sort_order": 1,
      "prompt": "...",                                  // for type=llm — the actual task prompt
      "checkpoint_message": "..."                       // for type=checkpoint — message to human
    }
  ]
}

PLANNING RULES:
1. Tasks must be concrete and executable — not vague ("do research" → "search EUR-Lex for AMLR Article 8-15 requirements").
2. Dependencies must be explicit. No circular references.
3. Include a final 'checkpoint' task for human review BEFORE any external delivery, regardless of autonomy level.
4. Estimate tokens realistically — research tasks are ~2-10K, analysis ~10-30K, synthesis ~10-30K.
5. Aim for 3-8 total tasks for most missions. Don't over-decompose.
6. The first task should always be a research/context-gathering task. The last task should always be a checkpoint.
7. Keep prompts self-contained — they will be executed without seeing the mission brief in full, only via the mission summary in context.

DO NOT include any text outside the JSON object.`;

  const user = `MISSION BRIEF
─────────────
Title: ${mission.title}
Objective: ${mission.objective}
${mission.context ? `Context: ${mission.context}\n` : ''}Success criteria: ${mission.success_criteria}
Autonomy level: ${mission.autonomy_level}
Token budget: ${mission.token_budget_max.toLocaleString()}
${mission.deadline ? `Deadline: ${mission.deadline}\n` : ''}
Decompose this mission into a task graph now.`;

  return { system, user };
}

function buildTemplateRefinementPrompt(mission: Mission, template: MissionTemplate): { system: string; user: string } {
  const system = `You are ANTON's Mission Planner. You are refining a mission-template task graph to fit a specific mission objective.

Output ONLY a JSON object on a single line, no preamble, no markdown fences. The schema is:
{
  "tasks": [
    {
      "local_id": "t1",
      "title": "...",
      "description": "...",
      "task_type": "llm" | "research" | "analysis" | "export" | "review" | "checkpoint",
      "estimated_tokens": 5000,
      "depends_on": ["t1", ...],
      "sort_order": 1,
      "prompt": "...",
      "checkpoint_message": "..."
    }
  ]
}

REFINEMENT RULES:
1. Start from the template task graph. You may add, remove, or modify tasks but preserve the template's overall shape.
2. Replace template placeholders (e.g. \${client_name}, \${jurisdiction}) with concrete values from the mission brief.
3. Add tasks if the specific objective demands them; remove tasks that don't apply.
4. Keep checkpoint placement consistent with the template.
5. Estimate tokens realistically based on the specific scope.

DO NOT include any text outside the JSON object.`;

  const user = `TEMPLATE
────────
Name: ${template.name}
Description: ${template.description ?? ''}
Pillar: ${template.pillar}
Category: ${template.category ?? ''}
Required modules: ${template.required_modules.join(', ') || '(none)'}

TEMPLATE TASK GRAPH (starting point):
${JSON.stringify(template.task_graph_template, null, 2)}

MISSION BRIEF
─────────────
Title: ${mission.title}
Objective: ${mission.objective}
${mission.context ? `Context: ${mission.context}\n` : ''}Success criteria: ${mission.success_criteria}
Autonomy level: ${mission.autonomy_level}
Token budget: ${mission.token_budget_max.toLocaleString()}

Refine the template task graph for this specific mission now.`;

  return { system, user };
}

// ── Output parsing ─────────────────────────────────────────────────────────

function parseGraph(text: string): TaskGraphTemplate | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(cleaned) as TaskGraphTemplate;
    if (parsed && Array.isArray(parsed.tasks)) return parsed;
  } catch { /* try regex fallback */ }
  // Fallback: find the first {...} block
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as TaskGraphTemplate;
    if (parsed && Array.isArray(parsed.tasks)) return parsed;
  } catch { /* give up */ }
  return null;
}

/**
 * Light normalisation — fill in defaults, ensure unique local_ids, sort_order.
 * Returns a copy. Validates that all dependencies reference existing local_ids.
 */
function normalizeGraph(graph: TaskGraphTemplate): TaskGraphTemplate {
  const seenIds = new Set<string>();
  const tasks: TaskGraphNode[] = [];
  graph.tasks.forEach((t, idx) => {
    let localId = t.local_id?.trim() || `t${idx + 1}`;
    // Disambiguate duplicate ids
    while (seenIds.has(localId)) localId = `${localId}_${idx + 1}`;
    seenIds.add(localId);
    tasks.push({
      local_id: localId,
      title: (t.title ?? `Task ${idx + 1}`).trim(),
      description: t.description?.trim(),
      task_type: t.task_type ?? 'llm',
      module_id: t.module_id,
      area_id: t.area_id,
      module_config: t.module_config ?? {},
      estimated_tokens: t.estimated_tokens ?? 5000,
      estimated_duration_seconds: t.estimated_duration_seconds,
      depends_on: t.depends_on?.filter(d => typeof d === 'string') ?? [],
      parent_local_id: t.parent_local_id,
      sort_order: t.sort_order ?? idx + 1,
      prompt: t.prompt,
      checkpoint_message: t.checkpoint_message,
    });
  });
  // Strip dependencies that reference unknown ids
  for (const t of tasks) {
    t.depends_on = (t.depends_on ?? []).filter(d => seenIds.has(d) && d !== t.local_id);
  }
  return { tasks };
}
