/**
 * area-config.ts
 * Type definitions for the Area & Module config system.
 * These mirror what is stored in area.json and module.json on disk.
 */

// ── Guided input field types ─────────────────────────────────

export type FieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multi-select'
  | 'chips'
  | 'boolean'
  | 'file'
  | 'number';

export interface SelectOption {
  value: string;
  label: string;
}

export interface GuidedInputField {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: SelectOption[];   // for select / multi-select / chips
  defaultValue?: unknown;
}

// ── Module defaults ──────────────────────────────────────────

export interface ModuleDefaults {
  thinking: 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first';
  creativity: 'strict' | 'balanced' | 'creative';
  model?: string;
  outputFormats: string[];
  transparencyLevel?: 0 | 1 | 2;
  knowledgeSources?: {
    claudeKnowledge?: { enabled: boolean; webSearchEnabled: boolean; description: string };
    onlineReference?: { enabled: boolean; urls: string[]; fetchDepth: 'summary' | 'full' };
    localFolder?: { enabled: boolean; folderPaths: string[]; recursive: boolean };
    combinedMode?: { enabled: boolean; priority: 'local_first' | 'claude_first' | 'merged'; instructions: string };
  };
}

// ── Module config (module.json) ──────────────────────────────

export interface ModuleConfig {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  color: string;
  defaults: ModuleDefaults;
  guidedInputs?: GuidedInputField[];
  recommendedPersonas?: string[];
  recommendedSkills?: string[];
  tags?: string[];
  /** Model tier recommendation (optional — defaults to opus if absent) */
  modelTier?: ModelTier;
  /**
   * Output Transformation System — one of the eight Phase 1 content types.
   * Drives the structured extractor and the renderer registry filter.
   * Absent modules fall back to 'analytic_report' (the most permissive schema).
   */
  contentType?: 'gap_analysis' | 'risk_register' | 'process_map' | 'policy_document'
             | 'analytic_report' | 'plan_document' | 'entity_register' | 'scorecard';
  /** Populated at load time — not stored in JSON */
  systemPrompt?: string;
  areaId?: string;
}

// ── Model tier recommendation ─────────────────────────────────

export type ModelTierValue = 'haiku' | 'sonnet' | 'opus' | 'ollama-local';

export interface ModelTier {
  /** Model recommended for typical use of this module */
  recommended: ModelTierValue;
  /** Minimum viable model (still produces useful output) */
  minimum?: ModelTierValue;
  /** Model for professional/complex use of this module */
  professional?: ModelTierValue;
  /** Human-readable note explaining the tier recommendation */
  notes?: string;
}

// ── Area config (area.json) ──────────────────────────────────

export type DomainCluster =
  | 'finance'
  | 'legal'
  | 'tech'
  | 'health'
  | 'business'
  | 'social'
  | 'science'
  | 'general'
  // New clusters for expansion areas
  | 'inclusion'    // Financial inclusion, mobile money, microfinance
  | 'agriculture'  // Farming, livestock, rural
  | 'enterprise'   // Micro-business, artisan, food business
  | 'rights'       // Workers, land, consumer, government services
  | 'community';   // Community health, education, literacy

export interface AreaConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  color: string;
  cluster: DomainCluster;
  /** Populated at load time */
  modules?: ModuleConfig[];
  /** Populated at load time — content of area-context.md */
  areaContext?: string;
}

// ── Loaded area (full object served to client) ────────────────

export interface LoadedArea extends AreaConfig {
  modules: ModuleConfig[];
  areaContext: string;
}
