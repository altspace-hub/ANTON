// ── Missions — Task Decomposition ───────────────────────────────────────────
// LLM-driven generation of a TaskGraphTemplate from a mission brief.
//
// Phase 1: produces a flat task list with simple linear dependencies. Phase 2
// adds module-aware decomposition (selecting concrete ANTON modules per task)
// and parallel sub-graphs. Phase 3 adds checkpoint placement based on risk
// classification (EU AI Act high-risk → mandatory human checkpoints).

import { callChat, type StreamChatConfig, type ChatResult } from '../provider-router.js';
import { resolveMissionModel } from './mission-model-resolver.js';
import { createServicePackManager } from './service-pack-manager.js';
import { createCredentialVault } from './mission-credential-vault.js';
import type { DatabaseAdapter } from '../../db/database.js';
import type { Mission, TaskGraphTemplate, TaskGraphNode, MissionTemplate, TaskType } from './types.js';

interface DecompositionResult {
  graph: TaskGraphTemplate;
  reasoning: string;
  model: string;
  tokensUsed: number;
}

// ── Action capability context (Wave-2 2A.5) ────────────────────────────────
// The decomposer may only emit action tasks (api_call / browser) that the
// instance can actually execute. We query the installed Service Packs and
// active vault credentials at decomposition time and feed BOTH the prompt
// (so the LLM plans against real capabilities, not hallucinated ones) and
// normalizeGraph (which rejects action tasks when nothing is installed).

export interface ActionCapabilityContext {
  packs: Array<{
    service_id: string;
    service_name: string;
    interaction_type: string;
    workflows: Array<{ id: string; description: string; parameters: string[] }>;
  }>;
  credentials: Array<{ id: string; name: string; service_name: string | null; credential_type: string }>;
}

export function actionTasksAllowed(capabilities: ActionCapabilityContext | undefined): boolean {
  return Boolean(capabilities && (capabilities.packs.length > 0 || capabilities.credentials.length > 0));
}

/** Query installed packs + active credentials. Best-effort: a failure returns an empty context (decomposer stays LLM-only). */
export async function buildActionCapabilityContext(db: DatabaseAdapter): Promise<ActionCapabilityContext> {
  const ctx: ActionCapabilityContext = { packs: [], credentials: [] };
  try {
    const packMgr = createServicePackManager(db);
    // Idempotent — guarantees the built-in packs (Gmail, HubSpot, Notion, …)
    // are visible even before the Service Packs UI has been opened once.
    await packMgr.seedBuiltinPacks();
    const packs = await packMgr.listPacks();
    ctx.packs = packs.map(p => ({
      service_id: p.service_id,
      service_name: p.service_name,
      interaction_type: p.interaction_type,
      workflows: Object.entries(p.workflows).map(([id, wf]) => ({
        id,
        description: wf.description,
        parameters: (wf.parameters ?? []).map(param => param.required ? `${param.name} (required)` : param.name),
      })),
    }));
  } catch { /* packs table missing / unseeded — keep empty */ }
  try {
    const vault = createCredentialVault(db);
    const creds = await vault.listCredentials({ activeOnly: true });
    ctx.credentials = creds.map(c => ({
      id: c.id, name: c.name, service_name: c.service_name, credential_type: c.credential_type,
    }));
  } catch { /* vault table missing — keep empty */ }
  return ctx;
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
  capabilities?: ActionCapabilityContext,
): Promise<DecompositionResult> {
  const allowActions = actionTasksAllowed(capabilities);
  const prompt = template
    ? buildTemplateRefinementPrompt(mission, template, capabilities)
    : buildFromScratchPrompt(mission, capabilities);

  // 2A.4 — honour model_strategy.planning_model; the historical default for
  // decomposition is Sonnet (not the Opus planning-tier default), mapped to
  // the configured provider.
  const model = resolveMissionModel('planning', mission.model_strategy, 'claude-sonnet-4-6');

  const result = await callChatWithTimeout({
    model,
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
    graph: normalizeGraph(graph, { allowActionTasks: allowActions }),
    reasoning: result.thinking || '',
    model,
    tokensUsed: result.inputTokens + result.outputTokens,
  };
}

// ── Prompt construction ────────────────────────────────────────────────────

/**
 * Action-capability section shared by both prompts. When packs/credentials
 * are installed it documents the api_call/browser task types + their
 * module_config shapes and lists ONLY what is actually installed; when
 * nothing is installed it forbids action tasks outright.
 */
function buildActionSection(capabilities?: ActionCapabilityContext): string {
  if (!actionTasksAllowed(capabilities)) {
    return `
ACTION TASKS:
No Service Packs or credentials are installed on this instance. Do NOT emit
"api_call" or "browser" task types — plan with llm/research/analysis tasks
and describe any external action as a manual step in a checkpoint message.`;
  }
  const caps = capabilities as ActionCapabilityContext;
  const packLines = caps.packs.map(p => {
    const wfs = p.workflows.map(w => `      - workflow "${w.id}": ${w.description}${w.parameters.length ? ` (params: ${w.parameters.join(', ')})` : ''}`).join('\n');
    return `    • ${p.service_id} (${p.service_name}, ${p.interaction_type})${wfs ? `\n${wfs}` : ''}`;
  }).join('\n');
  const credLines = caps.credentials.map(c => `    • ${c.id} — ${c.name}${c.service_name ? ` (${c.service_name}, ${c.credential_type})` : ` (${c.credential_type})`}`).join('\n');
  return `
ACTION TASKS (real external actions — use ONLY the installed capabilities below):
Two additional task_type values are available:
  • "api_call" — a real HTTP request. module_config MUST be:
    { "url": "https://…", "method": "GET|POST|PUT|PATCH|DELETE", "headers": {…}?, "body": …?, "auth_credential_id": "cred_…"? }
  • "browser" — runs a named Service Pack workflow (browser OR api packs). module_config MUST be:
    { "service_id": "<installed pack id>", "workflow_id": "<workflow in that pack>", "params": { … }, "auth_credential_id": "cred_…"? }

INSTALLED SERVICE PACKS:
${packLines || '    (none)'}

AVAILABLE CREDENTIALS (reference by id in auth_credential_id; secrets stay server-side):
${credLines || '    (none)'}

ACTION RULES:
- Only reference service_id / workflow_id / credential ids listed above. Never invent integrations.
- Any state-changing action (sending, posting, writing) MUST be preceded by a "checkpoint" task so the human approves the content first. The autonomy gate will additionally pause credentialed/state-changing actions.
- Prefer llm/analysis tasks when no installed capability matches the need.`;
}

function buildFromScratchPrompt(mission: Mission, capabilities?: ActionCapabilityContext): { system: string; user: string } {
  const allowActions = actionTasksAllowed(capabilities);
  const system = `You are ANTON's Mission Planner. You decompose a high-level mission objective into a concrete, executable task graph.

Output ONLY a JSON object on a single line, no preamble, no markdown fences. The schema is:
{
  "tasks": [
    {
      "local_id": "t1",                                 // unique within this graph
      "title": "...",                                   // short imperative title
      "description": "...",                             // 1-3 sentences
      "task_type": "llm" | "research" | "analysis" | "export" | "review" | "checkpoint"${allowActions ? ' | "api_call" | "browser"' : ''},
      "estimated_tokens": 5000,                         // realistic estimate
      "depends_on": ["t1", ...],                        // local_ids this task depends on
      "sort_order": 1,
      "prompt": "...",                                  // for type=llm — the actual task prompt
      "checkpoint_message": "...",                      // for type=checkpoint — message to human
      "module_config": { ... }                          // for action types — see ACTION TASKS
    }
  ]
}
${buildActionSection(capabilities)}

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

function buildTemplateRefinementPrompt(mission: Mission, template: MissionTemplate, capabilities?: ActionCapabilityContext): { system: string; user: string } {
  const allowActions = actionTasksAllowed(capabilities);
  const system = `You are ANTON's Mission Planner. You are refining a mission-template task graph to fit a specific mission objective.

Output ONLY a JSON object on a single line, no preamble, no markdown fences. The schema is:
{
  "tasks": [
    {
      "local_id": "t1",
      "title": "...",
      "description": "...",
      "task_type": "llm" | "research" | "analysis" | "export" | "review" | "checkpoint"${allowActions ? ' | "api_call" | "browser"' : ''},
      "estimated_tokens": 5000,
      "depends_on": ["t1", ...],
      "sort_order": 1,
      "prompt": "...",
      "checkpoint_message": "...",
      "module_config": { ... }
    }
  ]
}
${buildActionSection(capabilities)}

REFINEMENT RULES:
1. Start from the template task graph. You may add, remove, or modify tasks but preserve the template's overall shape.
2. Replace template placeholders (e.g. \${client_name}, \${jurisdiction}) with concrete values from the mission brief.
3. Add tasks if the specific objective demands them; remove tasks that don't apply.
4. Keep checkpoint placement consistent with the template.
5. Estimate tokens realistically based on the specific scope.
6. If the template contains "api_call" or "browser" tasks but ACTION TASKS are not available on this instance, replace each with a "checkpoint" task describing the manual step the human must perform instead.

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

// Task types the decomposer may emit without action capability.
const PASSIVE_TASK_TYPES: ReadonlySet<string> = new Set<TaskType>([
  'llm', 'research', 'analysis', 'export', 'review', 'notification',
  'checkpoint', 'conditional', 'parallel_group',
]);

// Action task types — permitted only when the instance has installed
// capability (Service Packs / credentials). Each carries a required
// module_config shape, validated below.
const ACTION_TASK_TYPES: ReadonlySet<string> = new Set<TaskType>([
  'api_call', 'browser', 'database_query',
]);

/** Validate the module_config shape of an action task. Returns an error string or null. */
export function validateActionTaskConfig(taskType: string, moduleConfig: Record<string, unknown> | undefined): string | null {
  const cfg = moduleConfig ?? {};
  if (taskType === 'api_call') {
    if (typeof cfg.url !== 'string' || !cfg.url.trim()) return 'api_call task requires module_config.url (string)';
    return null;
  }
  if (taskType === 'browser') {
    if (typeof cfg.service_id !== 'string' || !cfg.service_id.trim()) return 'browser task requires module_config.service_id (string)';
    if (typeof cfg.workflow_id !== 'string' || !cfg.workflow_id.trim()) return 'browser task requires module_config.workflow_id (string)';
    return null;
  }
  if (taskType === 'database_query') {
    if (typeof cfg.query !== 'string' || !cfg.query.trim()) return 'database_query task requires module_config.query (string)';
    return null;
  }
  return null;
}

export interface NormalizeGraphOptions {
  /** Permit api_call / browser / database_query nodes (instance has packs/credentials). Default false. */
  allowActionTasks?: boolean;
}

/**
 * Light normalisation — fill in defaults, ensure unique local_ids, sort_order.
 * Returns a copy. Validates that all dependencies reference existing local_ids.
 *
 * Task-type policy (Wave-2 2A.5):
 *   • Passive types pass through; unknown strings coerce to 'llm' (safe).
 *   • Action types are rejected with a clear error unless allowActionTasks —
 *     and even then a malformed module_config (missing url / service_id /
 *     workflow_id / query) fails loudly rather than persisting a task that
 *     can only error at execution time.
 */
export function normalizeGraph(graph: TaskGraphTemplate, options?: NormalizeGraphOptions): TaskGraphTemplate {
  const allowActions = options?.allowActionTasks === true;
  const seenIds = new Set<string>();
  const tasks: TaskGraphNode[] = [];
  graph.tasks.forEach((t, idx) => {
    let localId = t.local_id?.trim() || `t${idx + 1}`;
    // Disambiguate duplicate ids
    while (seenIds.has(localId)) localId = `${localId}_${idx + 1}`;
    seenIds.add(localId);

    const rawType = t.task_type ?? 'llm';
    let taskType: TaskType;
    if (ACTION_TASK_TYPES.has(rawType)) {
      if (!allowActions) {
        throw new Error(
          `Decomposition emitted an action task ('${rawType}': "${t.title ?? localId}") but no Service Packs or credentials are installed on this instance.`,
        );
      }
      const configError = validateActionTaskConfig(rawType, t.module_config);
      if (configError) {
        throw new Error(`Invalid action task "${t.title ?? localId}": ${configError}`);
      }
      taskType = rawType as TaskType;
    } else {
      taskType = PASSIVE_TASK_TYPES.has(rawType) ? (rawType as TaskType) : 'llm';
    }

    tasks.push({
      local_id: localId,
      title: (t.title ?? `Task ${idx + 1}`).trim(),
      description: t.description?.trim(),
      task_type: taskType,
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

/**
 * Cycle detection over dependency edges (task_id depends on
 * depends_on_task_id). Used by the task insert/edit endpoints to re-validate
 * the graph before persisting a dependency change. Pure + iterative DFS.
 */
export function hasDependencyCycle(edges: Array<{ task_id: string; depends_on_task_id: string }>): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.task_id);
    if (list) list.push(e.depends_on_task_id);
    else adj.set(e.task_id, [e.depends_on_task_id]);
  }
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map<string, number>();
  for (const start of adj.keys()) {
    if ((colour.get(start) ?? WHITE) !== WHITE) continue;
    // Iterative DFS with an explicit stack of [node, nextChildIndex]
    const stack: Array<[string, number]> = [[start, 0]];
    colour.set(start, GREY);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const [node, childIdx] = frame;
      const children = adj.get(node) ?? [];
      if (childIdx >= children.length) {
        colour.set(node, BLACK);
        stack.pop();
        continue;
      }
      frame[1] = childIdx + 1;
      const child = children[childIdx];
      const c = colour.get(child) ?? WHITE;
      if (c === GREY) return true;
      if (c === WHITE) {
        colour.set(child, GREY);
        stack.push([child, 0]);
      }
    }
  }
  return false;
}
