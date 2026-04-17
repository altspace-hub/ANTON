// ── Risk Atlas — shared TypeScript types ──────────────────────────────────
//
// The seven-stage causal chain expressed in TypeScript. The deterministic
// scoring rules from the spec live here as constants and are enforced by
// atlas-residual-calculator.ts (NEVER by an LLM).

// ── Enums ────────────────────────────────────────────────────────────────

export type AtlasStatus = 'draft' | 'active' | 'review' | 'archived';
export type AtlasMode   = 'socratic' | 'draft' | 'expert' | 'autonomous';

export type ExposureCategory =
  | 'service' | 'customer_segment' | 'channel' | 'partner'
  | 'geography' | 'product' | 'process' | 'system';

export type FcpDomain =
  | 'amlcft' | 'sanctions' | 'fraud' | 'abc'
  | 'market_abuse' | 'tax_evasion_facilitation' | 'export_controls' | 'modern_slavery';

export const FCP_DOMAINS: readonly FcpDomain[] = [
  'amlcft', 'sanctions', 'fraud', 'abc',
  'market_abuse', 'tax_evasion_facilitation', 'export_controls', 'modern_slavery',
] as const;

export type ControlType     = 'prevent' | 'detect' | 'respond';
export type ControlStrength = 'strong'  | 'adequate' | 'weak';
export type ControlQualityRollup = ControlStrength | 'absent';

export type AppetitePosition = 'within' | 'boundary' | 'outside' | 'unacceptable';

export type ReviewActivity =
  | 'full_review' | 'threat_update' | 'control_test' | 'residual_rescore'
  | 'appetite' | 'regulatory_check';

export type ReviewFrequency =
  | 'annual' | 'semi-annual' | 'quarterly' | 'monthly'
  | 'on_change' | 'on_new_regulation';

export type PackSource = 'builtin' | 'community' | 'certified' | 'sovereign';

// ── Score primitives ─────────────────────────────────────────────────────

/** 1-5 ordinal score on each scoring dimension. */
export type Score1to5 = 1 | 2 | 3 | 4 | 5;

/**
 * Deterministic constants — these are the only place the residual calculus
 * lives in the TypeScript layer. The same values are encoded in the SQL
 * CHECK constraints and the application validator.
 */
export const RESIDUAL_REDUCTION: Record<ControlQualityRollup, number> = {
  strong: 2,
  adequate: 1,
  weak: 0,
  absent: 0,
};

export const APPETITE_POSITION_FROM_RESIDUAL: Record<Score1to5, AppetitePosition> = {
  1: 'within',
  2: 'within',
  3: 'boundary',
  4: 'outside',
  5: 'unacceptable',
};

// ── Row shapes — 1:1 with migration 125 columns ──────────────────────────

export interface RiskAtlasRow {
  id: string;
  name: string;
  description: string | null;
  project_id: string | null;
  business_description: string | null;
  industry_pack_id: string | null;
  status: AtlasStatus;
  mode: AtlasMode;
  entity_id: string | null;
  owner_user_id: string | null;
  created_by: string | null;
  org_id: string;
  last_review_at: string | null;
  next_review_due_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtlasExposurePointRow {
  id: string;
  atlas_id: string;
  name: string;
  description: string | null;
  category: ExposureCategory | string | null;
  source_pack_exposure_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtlasThreatPathRow {
  id: string;
  atlas_id: string;
  path_code: string;          // TP-1, TP-2, …
  name: string;
  description: string | null;
  source_pack_path_id: string | null;
  fcp_domain: FcpDomain | null;
  created_at: string;
  updated_at: string;
}

export interface AtlasVulnerabilityRow {
  id: string;
  atlas_id: string;
  vuln_code: string;          // V-1, V-2, …
  name: string;
  description: string | null;
  severity: Score1to5;
  source_pack_vuln_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtlasInherentScoreRow {
  id: string;
  threat_path_id: string;
  exposure_score: Score1to5;
  threat_score: Score1to5;
  vulnerability_score: Score1to5;
  inherent_score: Score1to5;  // = max of the three above (deterministic)
  rationale: string | null;
  scored_at: string;
  scored_by: string | null;
}

export interface AtlasControlRow {
  id: string;
  atlas_id: string;
  control_code: string;       // C-1, C-2, …
  name: string;
  description: string | null;
  type: ControlType;
  strength: ControlStrength;
  evidence: string | null;
  owner_role: string | null;
  source_pack_control_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtlasControlVulnerabilityMapRow {
  id: number;
  control_id: string;
  vulnerability_id: string;
  type: ControlType;          // role this control plays for THIS vulnerability
  notes: string | null;
}

export interface AtlasResidualScoreRow {
  id: string;
  threat_path_id: string;
  residual_score: Score1to5;
  control_quality_rollup: ControlQualityRollup;
  open_vulnerability_notes: string | null;
  calculated_at: string;
}

export interface AtlasAppetiteStatementRow {
  id: string;
  atlas_id: string;
  threat_path_id: string | null;     // NULL = company-wide (Stage 7b)
  appetite_position: AppetitePosition;
  required_action: string | null;
  target_date: string | null;
  budget_eur: string | number | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtlasEscalationTriggerRow {
  id: string;
  atlas_id: string;
  trigger_event: string;
  required_action: string;
  timeline: string | null;
  source: 'user' | 'pack' | 'regulatory';
  created_at: string;
}

export interface AtlasReviewCycleRow {
  id: string;
  atlas_id: string;
  activity: ReviewActivity;
  frequency: ReviewFrequency;
  owner_user_id: string | null;
  next_due_at: string | null;
  last_run_at: string | null;
  deadline_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtlasIndustryPackRow {
  id: string;
  name: string;
  description: string | null;
  version: string;
  source: PackSource;
  pack_path: string | null;
  pack_bundle_uri: string | null;
  parent_pack_id: string | null;
  certified_by: string | null;
  amlr_obliged: boolean;
  is_enabled: boolean;
  installed_at: string;
  updated_at: string;
}

// ── Derived / computed shapes ────────────────────────────────────────────

/** Inputs to the deterministic residual calculator. */
export interface ResidualCalcInput {
  inherent_score: Score1to5;
  /** Worst-of strengths across all controls linked to vulnerabilities of this path.
   *  'absent' = no controls are linked. */
  control_quality_rollup: ControlQualityRollup;
}

/** Output of the calculator — fully deterministic from the inputs. */
export interface ResidualCalcResult {
  residual_score: Score1to5;
  appetite_position: AppetitePosition;
  reduction_applied: number;        // 0, 1, or 2
  rationale: string;                // human-readable explanation of the maths
}

/** Fully hydrated view of one threat path. */
export interface ThreatPathFull {
  path: AtlasThreatPathRow;
  exposures: AtlasExposurePointRow[];
  vulnerabilities: AtlasVulnerabilityRow[];
  inherent: AtlasInherentScoreRow | null;
  controls: AtlasControlRow[];      // all controls touching any vulnerability of this path
  residual: AtlasResidualScoreRow | null;
  appetite: AtlasAppetiteStatementRow | null;
}

/** Atlas dashboard — summary view. */
export interface AtlasDashboard {
  atlas: RiskAtlasRow;
  pack: AtlasIndustryPackRow | null;
  paths_total: number;
  paths_by_appetite: Record<AppetitePosition, number>;
  paths_by_residual: Record<Score1to5, number>;
  paths_outside_appetite: ThreatPathFull[];
  next_review_at: string | null;
  last_event_at: string | null;
}

// ── Industry pack content shape (loaded from .anton bundles) ─────────────

export interface PackExposureLibraryEntry {
  id: string;
  name: string;
  description: string;
  category: ExposureCategory | string;
}

export interface PackThreatPathLibraryEntry {
  id: string;
  code: string;
  name: string;
  description: string;
  typical_inherent: Score1to5;
  fcp_domain?: FcpDomain;
  exposure_refs?: string[];          // ids from exposure-points.json
  vulnerability_refs?: string[];     // ids from vulnerabilities.json
}

export interface PackVulnerabilityLibraryEntry {
  id: string;
  code: string;
  name: string;
  description: string;
  typical_severity: Score1to5;
}

export interface PackControlLibraryEntry {
  id: string;
  code: string;
  name: string;
  description: string;
  default_type: ControlType;
  default_strength_when_in_place: ControlStrength;
  evidence_examples?: string[];
  owner_role?: string;
  vulnerability_refs?: string[];
}

export interface IndustryPackManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  /** 'industry' | 'fcp-domain' | 'overlay'. Defaults to 'industry' when omitted. */
  pack_kind?: 'industry' | 'fcp-domain' | 'overlay';
  amlr_obliged?: boolean;
  parent_pack_id?: string;
  recommends_fcp_domains?: Array<{ domain: FcpDomain; rationale: string }>;
  recommends_fcp_domains_optional?: Array<{ domain: FcpDomain; rationale: string }>;
  typical_size_range?: Array<'micro' | 'small' | 'medium' | 'large' | 'enterprise'>;
  typical_jurisdictions?: string[];
}

/**
 * Calibration anchors for the deterministic 1-5 scoring at Stage 4.
 * Each domain or industry pack ships its own anchors so the scoring
 * remains comparable within a domain across Atlases.
 */
export interface SeverityBenchmarks {
  exposure_anchors?: Partial<Record<'1' | '2' | '3' | '4' | '5', string>>;
  threat_credibility_anchors?: Partial<Record<'1' | '2' | '3' | '4' | '5', string>>;
  vulnerability_anchors?: Partial<Record<'1' | '2' | '3' | '4' | '5', string>>;
}

export interface IndustryPackContent {
  manifest: IndustryPackManifest;
  exposurePoints: PackExposureLibraryEntry[];
  threatPaths: PackThreatPathLibraryEntry[];
  vulnerabilities: PackVulnerabilityLibraryEntry[];
  controls: PackControlLibraryEntry[];
  glossary?: Record<string, string>;
  socraticScripts?: Record<string, string>;   // stage-1.md etc. (raw markdown)
  appetiteHeuristics?: Record<string, AppetitePosition>;
  escalationTriggers?: Array<{ event: string; action: string; timeline?: string }>;
  regulatoryTags?: string[];
  severityBenchmarks?: SeverityBenchmarks;
}
