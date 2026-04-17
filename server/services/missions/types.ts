// ── ANTON Missions — Shared Types ───────────────────────────────────────────
// See ANTON_MISSIONS_SPEC_v2.md for the conceptual model.

export type AutonomyLevel = 'check_in' | 'briefing' | 'full_autonomy';

export type MissionStatus =
  | 'draft'        // Human writing brief
  | 'briefed'      // ANTON proposed plan; awaiting human approval (check_in) or auto-start (briefing/full_autonomy)
  | 'active'       // Executing tasks
  | 'paused'       // Waiting for human or external event
  | 'review'       // Awaiting human review of outputs
  | 'completed'
  | 'aborted';

export type MissionPriority = 'low' | 'normal' | 'high' | 'critical';

export type Pillar = 'work' | 'life' | 'school';

export type ProviderPreference = 'any' | 'anthropic' | 'mistral' | 'openai' | 'gemini' | 'ollama';

export type ModelStrategyTier = 'planning' | 'execution' | 'utility';

export interface ModelStrategy {
  planning_model: string;        // 'auto' | concrete model id
  execution_model: string;
  utility_model: string;
  provider_preference: ProviderPreference;
  fallback_enabled: boolean;
  cost_optimise: boolean;
}

export interface DataScope {
  modules_allowed?: string[];
  modules_denied?: string[];
  knowledge_sources?: string[];
  atom_read_scopes?: string[];
  atom_write_scope?: string;
  inherit_atoms_from_missions?: string[];
  external_services_allowed?: string[];
  external_services_denied?: string[];
}

export interface NotificationPreferences {
  fyi_channel?: 'email' | 'in_app' | 'none';
  review_channel?: 'email' | 'push' | 'in_app';
  urgent_channel?: 'email' | 'push' | 'sms' | 'in_app';
  fyi_batch?: 'realtime' | 'daily' | 'weekly';
}

export type TaskType =
  | 'llm'
  | 'research'
  | 'analysis'
  | 'export'
  | 'review'
  | 'notification'
  | 'checkpoint'
  | 'conditional'
  | 'parallel_group'
  | 'browser'        // Phase 2
  | 'api_call'       // Phase 2
  | 'database_query';

export type TaskStatus =
  | 'queued'
  | 'active'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'blocked'
  | 'paused';

export type DependencyType = 'blocking' | 'informational';

export type DecisionType =
  | 'approach_selection'
  | 'module_selection'
  | 'data_source_selection'
  | 'quality_tradeoff'
  | 'priority_adjustment'
  | 'scope_adjustment'
  | 'escalation_decision'
  | 'self_correction'
  | 'task_spawn'
  | 'plan_decomposition';

// ── Core entities ──────────────────────────────────────────────────────────

export interface Mission {
  id: string;
  title: string;
  objective: string;
  context: string | null;
  success_criteria: string;
  autonomy_level: AutonomyLevel;
  status: MissionStatus;
  priority: MissionPriority;

  token_budget_max: number;
  token_budget_consumed: number;
  time_budget_max_seconds: number;
  time_active_max_seconds: number;
  time_active_consumed_seconds: number;
  financial_budget_max: number;
  financial_budget_consumed: number;

  data_scope: DataScope;
  notification_preferences: NotificationPreferences;
  model_strategy: ModelStrategy;

  template_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  deadline: string | null;

  mission_summary: string | null;
  mission_summary_updated_at: string | null;
}

export interface MissionTask {
  id: string;
  mission_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  task_type: TaskType;
  status: TaskStatus;
  priority: number;

  module_id: string | null;
  area_id: string | null;
  module_config: Record<string, unknown>;

  provider: string | null;
  model: string | null;
  model_tier: ModelStrategyTier | null;

  estimated_tokens: number | null;
  actual_tokens_consumed: number;
  estimated_duration_seconds: number | null;
  actual_duration_seconds: number | null;

  output_summary: string | null;
  output_full: string | null;
  quality_score: number | null;
  confidence_score: number | null;
  atoms_produced: number;

  retry_count: number;
  max_retries: number;
  last_error: string | null;

  sort_order: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface MissionTaskDependency {
  id: number;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: DependencyType;
}

export interface MissionActivity {
  id: number;
  mission_id: string;
  task_id: string | null;
  timestamp: string;
  activity_type: string;
  description: string | null;
  details: Record<string, unknown>;
  tokens_consumed: number;
}

export interface MissionDecision {
  id: string;
  mission_id: string;
  task_id: string | null;
  timestamp: string;
  decision_type: DecisionType;
  description: string;
  options_considered: Array<{ option: string; score?: number; reasoning?: string }>;
  selected_option: string;
  confidence: number;
  reasoning: string | null;
  overridden_by_human: boolean;
  override_reasoning: string | null;
  compliance_check_passed: boolean;
}

export interface MissionTemplateParameter {
  key: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'boolean' | 'textarea';
  required?: boolean;
  default?: string | number | boolean;
  options?: string[];
  help?: string;
}

export interface MissionTemplate {
  id: string;
  name: string;
  description: string | null;
  pillar: Pillar;
  category: string | null;
  version: string;
  author: string | null;

  parameters_schema: MissionTemplateParameter[];
  task_graph_template: TaskGraphTemplate;
  default_data_scope: DataScope;
  default_budget: Partial<Pick<Mission, 'token_budget_max' | 'time_budget_max_seconds' | 'time_active_max_seconds'>>;
  default_autonomy_level: AutonomyLevel;
  success_criteria_template: string | null;
  required_modules: string[];

  times_used: number;
  avg_completion_time_seconds: number | null;
  avg_quality_score: number | null;
  avg_token_consumption: number | null;

  is_builtin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Task graph used both as an LLM decomposition output and as a template
 * shape. `dependencies` lists task local-ids; controller resolves to real ids.
 */
export interface TaskGraphTemplate {
  tasks: TaskGraphNode[];
}

export interface TaskGraphNode {
  local_id: string;                       // identifier within the graph (e.g. "t1", "t1.1")
  title: string;
  description?: string;
  task_type: TaskType;
  module_id?: string;
  area_id?: string;
  module_config?: Record<string, unknown>;
  estimated_tokens?: number;
  estimated_duration_seconds?: number;
  depends_on?: string[];                  // list of local_ids
  parent_local_id?: string;               // for sub-tasks
  sort_order?: number;
  prompt?: string;                        // for task_type='llm' — the actual prompt to run
  checkpoint_message?: string;            // for task_type='checkpoint' — message to human
}

// ── Computed/derived shapes ────────────────────────────────────────────────

export interface MissionWithTasks {
  mission: Mission;
  tasks: MissionTask[];
  dependencies: MissionTaskDependency[];
  activity_count: number;
  decisions_count: number;
}

export interface BudgetStatus {
  tokens: { consumed: number; max: number; pct: number; warning: boolean; exceeded: boolean };
  time: { consumed_seconds: number; max_seconds: number; pct: number; warning: boolean; exceeded: boolean };
  financial: { consumed: number; max: number; pct: number; warning: boolean; exceeded: boolean };
}

// ── Service input types ────────────────────────────────────────────────────

export interface CreateMissionInput {
  title: string;
  objective: string;
  success_criteria: string;
  context?: string;
  autonomy_level?: AutonomyLevel;
  priority?: MissionPriority;
  budget?: Partial<Pick<Mission, 'token_budget_max' | 'time_budget_max_seconds' | 'time_active_max_seconds'>>;
  data_scope?: DataScope;
  notification_preferences?: NotificationPreferences;
  model_strategy?: Partial<ModelStrategy>;
  template_id?: string;
  template_parameters?: Record<string, string | number | boolean>;
  deadline?: string;
}

// ── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_MODEL_STRATEGY: ModelStrategy = {
  planning_model: 'auto',
  execution_model: 'auto',
  utility_model: 'auto',
  provider_preference: 'any',
  fallback_enabled: true,
  cost_optimise: false,
};

export const DEFAULT_DATA_SCOPE: DataScope = {};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  fyi_channel: 'in_app',
  review_channel: 'in_app',
  urgent_channel: 'in_app',
  fyi_batch: 'realtime',
};
