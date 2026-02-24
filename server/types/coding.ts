// ── Status/Enum Union Types ──────────────────────────────────────────────────

export type CodingProjectTier = 'lite' | 'medium' | 'large';

export type CodingProjectStatus =
  | 'onboarding' | 'discovery' | 'architecture' | 'estimation' | 'planning'
  | 'implementation' | 'testing' | 'operational_readiness' | 'completed' | 'paused' | 'archived';

export type CodingReleaseStatus = 'planned' | 'in_progress' | 'testing' | 'review' | 'completed' | 'cancelled';

export type CodingTaskStatus = 'pending' | 'planned' | 'in_progress' | 'review' | 'testing' | 'completed' | 'blocked' | 'cancelled';

export type ComplexityBand = 'small' | 'medium' | 'large';

export type ReviewType = 'architecture' | 'security' | 'compliance' | 'product' | 'technical' | 'goal_alignment' | 'operational';

export type ReviewVerdict = 'endorse' | 'flag' | 'dissent';

export type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'skipped';

export type CodingReviewStatus = 'pending' | 'in_progress' | 'completed' | 'overdue' | 'skipped';

export type TestType = 'unit' | 'integration' | 'regression' | 'acceptance' | 'security' | 'performance';

export type CodeSourceType = 'paste' | 'directory' | 'repository';

export type ExplanationLevel = 'high' | 'medium' | 'deep';

export type SecurityMode = 'vulnerability' | 'pentest_planning' | 'red_blue_team' | 'nist_csf' | 'iso_27001' | 'dora';

export type TechDebtSeverity = 'low' | 'medium' | 'high' | 'critical';

export type TechDebtStatus = 'open' | 'in_progress' | 'resolved' | 'accepted_risk' | 'deferred';

export type TechDebtSource = 'phase_0' | 'implementation' | 'review' | 'alignment_check' | 'manual';

export type ChangeType = 'task' | 'release' | 'goal' | 'architecture' | 'stack';

export type ChangeLevel = 'task' | 'release' | 'project';

export type ChangeStatus = 'proposed' | 'approved' | 'implemented' | 'rejected';

export type EnvironmentStatus = 'pending' | 'in_progress' | 'verified' | 'failed';

export type EnvironmentMode = 'auto' | 'guided' | 'handoff' | 'docker';

export type DependencyEcosystem = 'npm' | 'pypi' | 'cargo' | 'maven' | 'gradle' | 'nuget' | 'go' | 'gem' | 'composer' | 'other';

export type LicenceRisk = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type MaintenanceStatus = 'active' | 'maintained' | 'minimal' | 'abandoned' | 'unknown';

export type ReviewLens = 'developer' | 'security' | 'compliance' | 'product' | 'architecture' | 'dependency_audit';

// ── Core Interfaces ──────────────────────────────────────────────────────────

export interface CodingProject {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  tier: CodingProjectTier;
  status: CodingProjectStatus;
  directory_path?: string;
  git_initialized: boolean;
  discovery_summary?: string;
  architecture_summary?: string;
  baseline_summary?: string;
  tech_stack: string[];
  expert_panels: string[];
  cost_estimate: CostEstimate;
  cost_actual: CostTracker;
  environment_status: EnvironmentStatus;
  environment_mode?: EnvironmentMode;
  current_phase: number;
  current_release_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CodingRelease {
  id: string;
  coding_project_id: string;
  release_number: number;
  name: string;
  description?: string;
  scope?: string;
  status: CodingReleaseStatus;
  acceptance_criteria: string[];
  test_plan: Record<string, unknown>;
  complexity_estimate: ComplexityEstimate;
  complexity_actual: ComplexityEstimate;
  milestone_date?: string;
  deadline_id?: string;
  git_branch?: string;
  review_required_personas: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CodingTask {
  id: string;
  coding_release_id: string;
  coding_project_id: string;
  task_number: string;
  title: string;
  description?: string;
  status: CodingTaskStatus;
  assigned_role?: string;
  complexity_band: ComplexityBand;
  acceptance_criteria: string[];
  execution_plan?: ExecutionPlan;
  progress_log: ProgressEntry[];
  completion_record?: CompletionRecord;
  completion_notes?: string;
  review_status: ReviewStatus;
  git_commit_hash?: string;
  git_branch?: string;
  depends_on: string[];
  blocks: string[];
  file_manifest: FileManifestData;
  test_results?: string;
  tokens_consumed: TokenUsage;
  sort_order: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CodingReview {
  id: string;
  coding_project_id: string;
  coding_release_id?: string;
  coding_task_id?: string;
  reviewer_persona_id: string;
  review_type: ReviewType;
  verdict?: ReviewVerdict;
  findings?: string;
  recommendations?: string;
  severity_summary: Record<string, number>;
  is_mandatory: boolean;
  status: CodingReviewStatus;
  review_requested_at: string;
  review_completed_at?: string;
  escalation_sent_at?: string;
  workflow_execution_id?: string;
  tokens_consumed: TokenUsage;
  created_at: string;
}

export interface CodingTestRun {
  id: string;
  coding_project_id: string;
  coding_release_id?: string;
  coding_task_id?: string;
  test_type: TestType;
  test_suite_name?: string;
  results: Record<string, unknown>;
  pass_count: number;
  fail_count: number;
  skip_count: number;
  total_count: number;
  duration_ms?: number;
  ci_compatible: boolean;
  workflow_execution_id?: string;
  run_at: string;
  run_by: string;
}

export interface CodeReviewSession {
  id: string;
  session_id?: string;
  project_id?: string;
  source_type: CodeSourceType;
  source_path?: string;
  source_url?: string;
  explanation_level: ExplanationLevel;
  review_lenses: ReviewLens[];
  security_mode?: SecurityMode;
  file_hashes: Record<string, string>;
  findings_summary: Record<string, unknown>;
  previous_session_id?: string;
  is_diff_review: boolean;
  diff_summary?: string;
  tokens_consumed: TokenUsage;
  created_at: string;
  updated_at: string;
}

export interface CodingTechDebt {
  id: string;
  coding_project_id: string;
  title: string;
  description?: string;
  rationale?: string;
  severity: TechDebtSeverity;
  owner?: string;
  target_release_id?: string;
  status: TechDebtStatus;
  source: TechDebtSource;
  source_task_id?: string;
  resolved_at?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CodingChange {
  id: string;
  coding_project_id: string;
  change_type: ChangeType;
  change_level: ChangeLevel;
  title: string;
  rationale?: string;
  initiated_by?: string;
  original_state: Record<string, unknown>;
  revised_state: Record<string, unknown>;
  impact_assessment: Record<string, unknown>;
  affected_release_ids: string[];
  affected_task_ids: string[];
  stakeholder_notifications: Record<string, unknown>;
  status: ChangeStatus;
  cost_delta?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CodingDependency {
  id: string;
  code_review_session_id?: string;
  coding_project_id?: string;
  package_name: string;
  current_version?: string;
  latest_version?: string;
  ecosystem: DependencyEcosystem;
  vulnerability_count: number;
  vulnerability_details: VulnerabilityDetail[];
  licence?: string;
  licence_risk?: LicenceRisk;
  last_updated?: string;
  maintenance_status?: MaintenanceStatus;
  is_direct: boolean;
  recommendation?: string;
  created_at: string;
}

// ── Supporting Types ─────────────────────────────────────────────────────────

export interface ExecutionPlan {
  what: string;
  why: string;
  expertise_needed: string[];
  files_to_create: string[];
  files_to_modify: string[];
  files_to_delete: string[];
  tests_to_write: string[];
  estimated_complexity: ComplexityBand;
  risks: string[];
  assumptions: string[];
}

export interface CompletionRecord {
  files_created: FileChange[];
  files_modified: FileChange[];
  files_deleted: string[];
  tests_written: string[];
  tests_passed: number;
  tests_failed: number;
  decisions_made: Decision[];
  git_commit_hash?: string;
  git_branch?: string;
  review_notes?: string;
  duration_ms?: number;
}

export interface FileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  language?: string;
  lines_added?: number;
  lines_removed?: number;
  summary?: string;
}

export interface Decision {
  question: string;
  decision: string;
  rationale: string;
  alternatives_considered?: string[];
}

export interface ProgressEntry {
  timestamp: string;
  step: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  detail?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  cost_usd: number;
}

export interface CostEstimate {
  optimistic?: CostBreakdown;
  realistic?: CostBreakdown;
  pessimistic?: CostBreakdown;
}

export interface CostBreakdown {
  total_tokens: number;
  total_cost_usd: number;
  by_phase: Record<string, number>;
}

export interface CostTracker {
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  by_phase: Record<string, { input: number; output: number; cost_usd: number }>;
}

export interface ComplexityEstimate {
  total_tasks?: number;
  small?: number;
  medium?: number;
  large?: number;
  total_effort_days?: number;
}

export interface FileManifestData {
  files?: FileManifestEntry[];
  total_files?: number;
  total_lines?: number;
}

export interface FileManifestEntry {
  path: string;
  action: 'create' | 'modify' | 'enhance';
  language?: string;
  description?: string;
  content?: string;
}

export interface VulnerabilityDetail {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string;
  fixed_in?: string;
}

// ── API Request/Response Types ───────────────────────────────────────────────

export interface CreateCodingProjectRequest {
  name: string;
  description?: string;
  tier: CodingProjectTier;
  project_id?: string;
  directory_path?: string;
}

export interface StartReviewRequest {
  source_type: CodeSourceType;
  code?: string;
  source_path?: string;
  source_url?: string;
  explanation_level?: ExplanationLevel;
  review_lenses: ReviewLens[];
  security_mode?: SecurityMode;
  model?: string;
  thinking?: string;
}

export interface ScriptGenerateRequest {
  description: string;
  data_sample?: string;
  constraints?: string;
  clarification_answers?: Record<string, string>;
  model?: string;
  thinking?: string;
}

export interface ApplicationGenerateRequest {
  description: string;
  app_type: 'react' | 'html' | 'python-cli' | 'node-api';
  clarification_answers?: Record<string, string>;
  model?: string;
  thinking?: string;
}
