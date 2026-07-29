// ── Coding Area Frontend Types ─────────────────────────────────────────────

// Status/Enum Types
export type CodingProjectTier = 'lite' | 'medium' | 'large';

export type CodingProjectStatus =
  | 'onboarding' | 'discovery' | 'architecture' | 'estimation' | 'planning'
  | 'implementation' | 'testing' | 'operational_readiness' | 'completed' | 'paused' | 'archived';

export type CodingReleaseStatus = 'planned' | 'in_progress' | 'testing' | 'review' | 'completed' | 'cancelled';

// Kept in step with coding_tasks_status_check and server/types/coding.ts. This listed
// 'planning' as well, which the constraint has never allowed — and a backend handler
// duly wrote it, so POST /tasks/:tid/plan 500'd for everyone. A status union that is
// wider than the column is not a harmless superset: it is a licence to write a value
// the database will reject. 'planning' IS a valid coding_projects status; it is not a
// task one.
export type CodingTaskStatus = 'pending' | 'planned' | 'in_progress' | 'review' | 'testing' | 'completed' | 'blocked' | 'cancelled';

export type ComplexityBand = 'small' | 'medium' | 'large';

export type ReviewType = 'architecture' | 'security' | 'compliance' | 'product' | 'technical' | 'goal_alignment' | 'operational';

export type ReviewVerdict = 'endorse' | 'flag' | 'dissent';

export type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'skipped';

export type TestType = 'unit' | 'integration' | 'regression' | 'acceptance' | 'security' | 'performance';

export type CodeSourceType = 'paste' | 'directory' | 'repository';

export type ExplanationLevel = 'high' | 'medium' | 'deep';

export type SecurityMode = 'vulnerability' | 'pentest_planning' | 'red_blue_team' | 'nist_csf' | 'iso_27001' | 'dora';

export type ReviewLens = 'developer' | 'security' | 'compliance' | 'product' | 'architecture' | 'dependency_audit';

export type TechDebtSeverity = 'low' | 'medium' | 'high' | 'critical';

export type TechDebtStatus = 'open' | 'in_progress' | 'resolved' | 'accepted_risk' | 'deferred';

export type ChangeStatus = 'proposed' | 'approved' | 'implemented' | 'rejected';

export type DependencyEcosystem = 'npm' | 'pypi' | 'cargo' | 'maven' | 'gradle' | 'nuget' | 'go' | 'gem' | 'composer' | 'other';

// ── Core Interfaces ─────────────────────────────────────────────────────────

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
  current_phase: number;
  current_release_id?: string;
  created_by?: string;
  /** User-configured test command as an argv ARRAY (never a shell string). */
  test_command?: string[] | null;
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
  complexity_estimate: ComplexityEstimate;
  complexity_actual: ComplexityEstimate;
  milestone_date?: string;
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
  review_status: ReviewStatus;
  depends_on: string[];
  blocks: string[];
  file_manifest: FileManifestData;
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
  status: string;
  review_requested_at: string;
  review_completed_at?: string;
  tokens_consumed: TokenUsage;
  created_at: string;
}

export interface CodingTestRun {
  id: string;
  coding_project_id: string;
  test_type: TestType;
  test_suite_name?: string;
  results: Record<string, unknown>;
  pass_count: number;
  fail_count: number;
  skip_count: number;
  total_count: number;
  duration_ms?: number;
  run_at: string;
  /** true = ANTON actually executed the command and observed the exit code; false = LLM-claimed numbers. */
  executed?: boolean;
  command?: string[] | null;
  exit_code?: number | null;
  timed_out?: boolean;
  output_tail?: string;
}

// ── Workspace apply-to-disk (Wave 5.2) ──────────────────────────────────────

export interface WorkspaceDiffStats {
  linesAdded: number;
  linesRemoved: number;
  linesModified: number;
  linesUnchanged: number;
  similarity: number;
  sectionsChanged: string[];
}

export interface WorkspaceDiffChunk {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  oldLines?: string[];
  newLines?: string[];
  lines?: string[];
  sectionTitle?: string;
}

export interface WorkspaceFilePreview {
  path: string;
  action: 'create' | 'modify' | 'unchanged';
  stats: WorkspaceDiffStats;
  chunks: WorkspaceDiffChunk[];
}

export interface WorkspaceApplyPreview {
  applicationId: string;
  format_version: string;
  workspace: string;
  kind: 'initial' | 'revision';
  files: WorkspaceFilePreview[];
  rejected_blocks: Array<{ reason: string; path?: string }>;
  duplicates: string[];
  ignored_blocks: number;
  totals: { files: number; create: number; modify: number; unchanged: number; lines_added: number; lines_removed: number; lines_modified: number };
  verification: string;
}

export interface WorkspaceApplyResult {
  applicationId: string;
  status: 'applied';
  written: number;
  unchanged: number;
  backup_dir: string | null;
  files: Array<{ path: string; action: string; hash_before: string | null; hash_after: string; backed_up: boolean }>;
  verification: string;
}

export interface WorkspaceTestRunResult {
  testRunId: string;
  executed: boolean;
  passed: boolean;
  ran: boolean;
  exit_code: number | null;
  timed_out: boolean;
  duration_ms: number;
  pass_count: number;
  fail_count: number;
  skip_count: number;
  summary_recognized: boolean;
  output_tail: string;
  spawn_error: string | null;
  hint: string | null;
  verification: string;
}

export interface WorkspaceStatus {
  directory_path: string | null;
  bound: boolean;
  validation: { ok: boolean; resolved?: string; error?: string; allowedBases: string[]; exists?: boolean };
  test_command: string[] | null;
  format_version: string;
}

export interface CodeReviewSession {
  id: string;
  session_id?: string;
  source_type: CodeSourceType;
  source_path?: string;
  explanation_level: ExplanationLevel;
  review_lenses: ReviewLens[];
  security_mode?: SecurityMode;
  findings_summary: Record<string, unknown>;
  is_diff_review: boolean;
  tokens_consumed: TokenUsage;
  created_at: string;
}

export interface CodingTechDebt {
  id: string;
  coding_project_id: string;
  title: string;
  description?: string;
  severity: TechDebtSeverity;
  status: TechDebtStatus;
  owner?: string;
  target_release_id?: string;
  created_at: string;
}

export interface CodingChange {
  id: string;
  coding_project_id: string;
  change_type: string;
  change_level: string;
  title: string;
  rationale?: string;
  status: ChangeStatus;
  impact_assessment: Record<string, unknown>;
  created_at: string;
}

export interface CodingDependency {
  id: string;
  package_name: string;
  current_version?: string;
  latest_version?: string;
  ecosystem: DependencyEcosystem;
  vulnerability_count: number;
  vulnerability_details: VulnerabilityDetail[];
  licence?: string;
  licence_risk?: string;
  maintenance_status?: string;
  is_direct: boolean;
  recommendation?: string;
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

// ── Tier Configuration ───────────────────────────────────────────────────────

export interface TierConfig {
  id: CodingProjectTier;
  label: string;
  description: string;
  icon: string;
  color: string;
  features: string[];
}

export const CODING_TIERS: TierConfig[] = [
  {
    id: 'lite',
    label: 'Script Lite',
    description: 'Generate single Python scripts from natural language',
    icon: 'FileCode',
    color: 'adv-green',
    features: ['Python scripts', 'Guided questioning', 'Sandbox preview', 'Copy & download'],
  },
  {
    id: 'medium',
    label: 'Script Medium',
    description: 'Build complete applications with live preview',
    icon: 'AppWindow',
    color: 'adv-blue',
    features: ['Multi-file apps', 'React/HTML/Python/Node', 'Live preview', 'Iterative refinement'],
  },
  {
    id: 'large',
    label: 'Coding Large',
    description: 'Professional AI-led software development with governance',
    icon: 'Building2',
    color: 'adv-gold',
    features: ['7-phase lifecycle', 'Expert panel reviews', 'Release planning', 'Goal alignment', 'Cost tracking'],
  },
];

// ── Phase Configuration ──────────────────────────────────────────────────────

export interface PhaseConfig {
  number: number;
  id: string;
  label: string;
  description: string;
}

export const CODING_PHASES: PhaseConfig[] = [
  { number: 0, id: 'onboarding', label: 'Codebase Onboarding', description: 'Baseline assessment of existing code' },
  { number: 1, id: 'discovery', label: 'Discovery', description: 'Requirements gathering and stakeholder analysis' },
  { number: 2, id: 'architecture', label: 'Architecture', description: 'Technical design with expert review' },
  { number: 3, id: 'estimation', label: 'Estimation', description: 'Complexity sizing and cost estimation' },
  { number: 4, id: 'planning', label: 'Release Planning', description: 'Milestones, releases, and task breakdown' },
  { number: 5, id: 'implementation', label: 'Implementation', description: 'Task-by-task code generation' },
  { number: 6, id: 'testing', label: 'Testing', description: 'Test execution and regression tracking' },
  { number: 7, id: 'operational_readiness', label: 'Operational Readiness', description: 'Deployment prep and documentation' },
];
