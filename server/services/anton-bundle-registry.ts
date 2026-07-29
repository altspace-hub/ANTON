// ═══════════════════════════════════════════════════════════
// .anton bundle format — type registry (pure data module)
//
// Split out of anton-bundler.ts (2026-07-29): the registry was the
// only thing anton-validator.ts needed from the 3,400-line bundler,
// but the value-import dragged the bundler's whole pillar tree
// (gap-assessment-engine, structured-extractor, dynamic
// coding-workspace/orchestrator imports) into validator and
// importer. This module holds format DATA only: bundle types,
// registry entries, governance metadata, the provider list, and
// the generator string. No service imports, no DB, no Express.
// Third enabling refactor for the Code Studio standalone
// extraction (W0.1 of its DEVELOPMENT_PLAN_v1).
//
// Rule: nothing in this file may import from another service.
// ═══════════════════════════════════════════════════════════

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** All bundle types in the .anton format registry */
export type AntonBundleType =
  | 'module'
  | 'skill'
  | 'persona'
  | 'workflow'
  | 'skill-pack'
  | 'coding-blueprint'
  // ANTON Studio (Phase 5): the FULL governed Studio project as a portable,
  // reusable blueprint — charter + release/task plan + all 4 panel decision
  // records + chosen frameworks + learned project atoms + the final code
  // (manifest + written files) + the test results. SOURCE-BEARING.
  | 'coding-studio-project'
  | 'coding-review-profile'
  | 'script-lite-template'
  | 'script-medium-template'
  | 'instruction-builder-project'
  | 'compliance-ruleset'
  | 'radar-config'
  | 'quality-baseline'
  | 'brand-template'
  | 'output-chain'
  | 'review-panel'
  | 'project-template'
  | 'audience-profile'
  | 'lesson-plan'
  | 'study-pack'
  | 'assessment-bank'
  | 'regulatory-knowledge-pack'
  | 'market-index'
  | 'market-thesis'
  | 'market-intelligence-model'
  | 'market-investigation'
  | 'market-data-source-config'
  | 'market-atom-collection'
  | 'market-strategy-pack'
  | 'contact-bundle'
  // Risk Atlas (spec v0.1 + Addendum 1)
  | 'risk-atlas-industry-pack'
  | 'risk-atlas-fcp-domain-pack'
  | 'risk-atlas-export'
  // Hardware Build (Tier 5 of the Coding area, spec v4)
  // — three-layer knowledge base + path artefacts + project bundles
  | 'hardware-knowledge-pack'
  | 'hardware-template'
  | 'hardware-project'
  | 'humanitarian-deployment-kit'
  | 'diagnostic-case-bundle'
  | 'patch-bundle'
  | 'lifecycle-advisory-bundle'
  // Portals (spec v0.2)
  // — user-created ANTON-only web spaces with capability descriptors
  | 'portal'
  // Evidence Pack (spec EVIDENCE_PACK_SPEC.md)
  // — regulator-ready audit bundle: signed manifest + per-item canonical
  //   bodies + compliance mapping (EU AI Act Annex IV, AMLR auditability)
  | 'evidence-pack'
  // Portals Visitor Layer v0.8 (PORTALS_VISITOR_LAYER_BUILD_BRIEF_v2.md)
  // #43 — Visitor Home config: bookmark bar + 15-category grid + featured
  //       portals. Shipped per region / pillar-mode / deployment.
  | 'starter-pack'
  // #44 — portable career profile (Talent spec). Works as the candidate's
  //       CV: aspirations, career path, growth map, assessments, rendered CV.
  | 'career-profile'
  // #45 — curated list of videos; shareable + importable across ANTONs.
  | 'video-playlist'
  // BEEHIVE (server/services/beehive/beehive-bundle.ts)
  // — concluded multi-party deliberation. Export-only in v1 (no importer);
  //   produced for sharing/archival of the synthesis + reasoning trail.
  | 'hive-collaborative-output'
  // Reproducibility records (CORE_EXPERIENCE_REVIEW 2026-06, Wave 2.2 + 2.5)
  // — module-run is THE heart-of-vision item: a single module run a coworker
  //   can inspect (prompt, config, hashes, output) and reproduce via the
  //   rerun pipeline. Importable via POST /api/exchange/import-run.
  | 'module-run'
  // — gap-assessment + legal-research-session are RECORDS, export-only in
  //   this wave (no importer): findings/transcripts for sharing + archival.
  | 'gap-assessment'
  | 'legal-research-session';

/** Registry entry — describes a bundle type without needing full handler objects */
export interface BundleTypeEntry {
  label: string;
  description: string;
  contentsKey: string;          // key in the `contents` count object
  primaryContentDir: string;    // subdirectory under contents/ (e.g. 'modules')
}

export const BUNDLE_TYPE_REGISTRY: Record<AntonBundleType, BundleTypeEntry> = {
  'module':                       { label: 'Expert Module',             description: 'Custom expert module with system prompt and config', contentsKey: 'modules',              primaryContentDir: 'modules' },
  'skill':                        { label: 'Skill',                     description: 'Reusable prompt fragment',                          contentsKey: 'skills',               primaryContentDir: 'skills' },
  'persona':                      { label: 'Persona',                   description: 'Expert persona definition',                         contentsKey: 'personas',             primaryContentDir: 'personas' },
  'workflow':                     { label: 'Workflow',                   description: 'Multi-step workflow template',                      contentsKey: 'workflows',            primaryContentDir: 'workflows' },
  'skill-pack':                   { label: 'Skill Pack',                 description: 'Curated bundle of modules and workflows',           contentsKey: 'skill_packs',          primaryContentDir: 'skill-packs' },
  'coding-blueprint':             { label: 'Coding Blueprint',           description: 'Full software project template',                    contentsKey: 'coding_blueprints',    primaryContentDir: 'coding-blueprints' },
  // ANTON Studio project blueprint (Phase 5). Payload files live at the archive
  // root (charter.md, plan.json, panels.json, atoms.json, test-results.json, the
  // code/ tree) — hence the empty primaryContentDir (like module-run / beehive).
  'coding-studio-project':        { label: 'ANTON Studio Project',       description: 'A governed ANTON Studio build, packaged for reuse: charter + release/task plan + all 4 core-team panel decisions + chosen frameworks + learned project atoms (the lessons) + the final code (manifest + written files) + the test results. Honest about what does NOT travel (scoped DB contents, secrets).', contentsKey: 'coding_studio_projects', primaryContentDir: '' },
  'coding-review-profile':        { label: 'Code Review Profile',        description: 'Code review lens configuration',                    contentsKey: 'coding_review_profiles', primaryContentDir: 'coding-review-profiles' },
  'script-lite-template':         { label: 'Script Lite Template',       description: 'Data analysis script template',                     contentsKey: 'script_lite_templates', primaryContentDir: 'script-lite-templates' },
  'script-medium-template':       { label: 'Script Medium Template',     description: 'Multi-file application template',                   contentsKey: 'script_medium_templates', primaryContentDir: 'script-medium-templates' },
  'instruction-builder-project':  { label: 'Instruction Builder Project', description: 'AI tool instruction set project',                  contentsKey: 'instruction_builder_projects', primaryContentDir: 'instruction-builder-projects' },
  'compliance-ruleset':           { label: 'Compliance Ruleset',         description: 'Custom compliance rule configuration',              contentsKey: 'compliance_rulesets',  primaryContentDir: 'compliance-rulesets' },
  'radar-config':                 { label: 'Radar Configuration',        description: 'Regulatory radar source configuration',             contentsKey: 'radar_configs',        primaryContentDir: 'radar-configs' },
  'quality-baseline':             { label: 'Quality Baseline',           description: 'Quality thresholds per module/area',                contentsKey: 'quality_baselines',    primaryContentDir: 'quality-baselines' },
  'brand-template':               { label: 'Brand Template',             description: 'Export styling and branding configuration',         contentsKey: 'brand_templates',      primaryContentDir: 'brand-templates' },
  'output-chain':                 { label: 'Output Chain',               description: 'Sequential module chain for document production',   contentsKey: 'output_chains',        primaryContentDir: 'output-chains' },
  'review-panel':                 { label: 'Review Panel',               description: 'Expert review perspective configuration',           contentsKey: 'review_panels',        primaryContentDir: 'review-panels' },
  'project-template':             { label: 'Project Template',           description: 'Complete project setup with all components',        contentsKey: 'project_templates',    primaryContentDir: 'project-templates' },
  'audience-profile':             { label: 'Audience Profile',           description: 'Stakeholder communication adaptation profile',      contentsKey: 'audience_profiles',    primaryContentDir: 'audience-profiles' },
  'lesson-plan':                  { label: 'Lesson Plan',                description: 'Teacher-authored lesson plan for School Mode',       contentsKey: 'lesson_plans',         primaryContentDir: 'lesson-plans' },
  'study-pack':                   { label: 'Study Pack',                 description: 'Student study material bundle with review cards',    contentsKey: 'study_packs',          primaryContentDir: 'study-packs' },
  'assessment-bank':              { label: 'Assessment Bank',            description: 'Question bank for School Mode assessments',          contentsKey: 'assessment_banks',     primaryContentDir: 'assessment-banks' },
  'regulatory-knowledge-pack':   { label: 'Regulatory Knowledge Pack',  description: 'Pre-structured regulatory entity graph for FCP modules', contentsKey: 'knowledge_packs',    primaryContentDir: 'knowledge-packs' },
  'market-index':                { label: 'Market Index',               description: 'Custom index definition with holdings and NAV history',   contentsKey: 'market_indexes',               primaryContentDir: 'market-indexes' },
  'market-thesis':               { label: 'Market Thesis',              description: 'Investment thesis with evidence atoms and predictions',    contentsKey: 'market_theses',                primaryContentDir: 'market-theses' },
  'market-intelligence-model':   { label: 'Market Intelligence Model',  description: 'Signal weights, calibration, and consul performance data', contentsKey: 'market_intelligence_models',   primaryContentDir: 'market-intelligence-models' },
  'market-investigation':        { label: 'Market Investigation',       description: 'Investigation with 5 Whys analysis and findings',         contentsKey: 'market_investigations',        primaryContentDir: 'market-investigations' },
  'market-data-source-config':   { label: 'Market Data Source Config',  description: 'Data source configurations (API keys stripped)',           contentsKey: 'market_data_source_configs',   primaryContentDir: 'market-data-source-configs' },
  'market-atom-collection':      { label: 'Market Atom Collection',     description: 'Curated atoms with relationships and tags',               contentsKey: 'market_atom_collections',      primaryContentDir: 'market-atom-collections' },
  'market-strategy-pack':        { label: 'Market Strategy Pack',       description: 'Composite bundle: index templates, thesis frameworks, signal weights', contentsKey: 'market_strategy_packs', primaryContentDir: 'market-strategy-packs' },
  'contact-bundle':              { label: 'Contact Bundle',             description: 'ANTON identity card: public key, display name, and bio for P2P connection', contentsKey: 'contact_bundles', primaryContentDir: 'contact-bundles' },
  // ── Risk Atlas (spec v0.1 + Addendum 1) ─────────────────────────────────
  'risk-atlas-industry-pack':    { label: 'Risk Atlas Industry Pack',   description: 'Industry-specific exposure points, threat catalogue, vulnerability + control libraries, regulatory tie-ins for the Risk Atlas', contentsKey: 'risk_atlas_industry_packs',   primaryContentDir: 'risk-atlas-industry-packs' },
  'risk-atlas-fcp-domain-pack':  { label: 'Risk Atlas FCP Domain Pack', description: 'FCP domain overlay (AML, sanctions, fraud, ABC, market abuse, tax-evasion-facilitation, export controls) — composes with industry packs', contentsKey: 'risk_atlas_fcp_domain_packs', primaryContentDir: 'risk-atlas-fcp-domain-packs' },
  'risk-atlas-export':           { label: 'Risk Atlas Export',          description: 'Full Atlas snapshot — threat paths, controls, scores, appetite, audit trail — for sharing or successor handover',         contentsKey: 'risk_atlas_exports',          primaryContentDir: 'risk-atlas-exports' },
  // ── Hardware Build (Tier 5 of the Coding area, spec v4) ────────────────
  'hardware-knowledge-pack':       { label: 'Hardware Knowledge Pack',     description: 'Three-layer HKP: specification (SheetsData MCP + own content), diagnostic cases, lifecycle events for one hardware variant',           contentsKey: 'hardware_knowledge_packs',    primaryContentDir: 'hardware-knowledge-packs' },
  'hardware-template':             { label: 'Hardware Template',           description: 'Partially-filled hardware project skeleton — clone, specialise, build',                                                                  contentsKey: 'hardware_templates',          primaryContentDir: 'hardware-templates' },
  'hardware-project':              { label: 'Hardware Project',            description: 'Complete hardware project from Develop path: requirements, BOM, wiring, firmware, quality artefacts, lifecycle history',              contentsKey: 'hardware_projects',           primaryContentDir: 'hardware-projects' },
  'humanitarian-deployment-kit':   { label: 'Humanitarian Deployment Kit', description: 'Hardware project + fleet deployment + capacity-transfer + sustaining partnership for humanitarian field deployment',                  contentsKey: 'humanitarian_deployment_kits',primaryContentDir: 'humanitarian-deployment-kits' },
  'diagnostic-case-bundle':        { label: 'Diagnostic Case',             description: 'Structured fault-pattern + resolution case from the Diagnose path, packaged for community contribution and reuse',                    contentsKey: 'diagnostic_cases',            primaryContentDir: 'diagnostic-cases' },
  'patch-bundle':                  { label: 'Patch Bundle',                description: 'Governed change package from the Maintain path: change scope, impact assessment, rollback plan, verification plan, audit trail',     contentsKey: 'patch_bundles',               primaryContentDir: 'patch-bundles' },
  'lifecycle-advisory-bundle':     { label: 'Lifecycle Advisory',          description: 'Authoritative lifecycle event (CVE, EOL, recall, regulatory update) with applicability assessment and recommended action',           contentsKey: 'lifecycle_advisories',        primaryContentDir: 'lifecycle-advisories' },
  // ── Portals (spec v0.2) ─────────────────────────────────────────────────
  'portal':                        { label: 'Portal',                       description: 'User-created ANTON-only web space: pages, assets, capability descriptor, schema, walkthrough transcript — portable origin',   contentsKey: 'portals',                     primaryContentDir: 'portals' },
  // ── Evidence Pack ───────────────────────────────────────────────────────
  'evidence-pack':                 { label: 'Evidence Pack',                description: 'Regulator-ready audit bundle: signed manifest + per-item canonical content + compliance mapping (EU AI Act Annex IV, AMLR auditability)', contentsKey: 'evidence_packs',          primaryContentDir: 'evidence-packs' },
  // ── Visitor Layer v0.8 ──────────────────────────────────────────────────
  'starter-pack':                  { label: 'Starter Pack',                 description: 'Visitor Home configuration: bookmark bar + 15-category grid + featured portals. Ships per region / pillar-mode / deployment',          contentsKey: 'starter_packs',            primaryContentDir: 'starter-packs' },
  'career-profile':                { label: 'Career Profile',               description: 'Portable CV + aspiration data. Candidate-owned, AAP-signed, importable across ANTON instances',                                          contentsKey: 'career_profiles',          primaryContentDir: 'career-profiles' },
  'video-playlist':                { label: 'Video Playlist',               description: 'Curated collection of videos with metadata; shareable and importable',                                                                   contentsKey: 'video_playlists',          primaryContentDir: 'video-playlists' },
  // ── BEEHIVE ─────────────────────────────────────────────────────────────
  // Export-only (no importer in v1). The beehive bundler writes its payload
  // files (hive.json, participants.json, rounds.json, …) directly under
  // contents/ — hence the empty primaryContentDir.
  'hive-collaborative-output':     { label: 'Hive Collaborative Output',    description: 'Concluded BEEHIVE deliberation: final synthesis, full reasoning trail, rounds, dissents, approvals, and convergence path',                contentsKey: 'hive_collaborative_outputs', primaryContentDir: '' },
  // ── Reproducibility records (Wave 2.2 + 2.5) ────────────────────────────
  // Like the beehive bundle, these write their payload files at the archive
  // root (run.json, output.md, …) — hence the empty primaryContentDir.
  'module-run':                    { label: 'Module Run',                   description: 'One module run, reproducibly packaged: composed prompt + config snapshot + pinned source hashes + input/output (+ structured payload and quality score when cached). Importable as a read-only session via POST /api/exchange/import-run; reproducible there with the Rerun pipeline. Source CONTENTS (files/URLs) do not travel — only their names and sha256 hashes.', contentsKey: 'module_runs', primaryContentDir: '' },
  'gap-assessment':                { label: 'Gap Assessment',               description: 'Compliance gap assessment record: context, per-article findings (criterion facts, rubric version, computed + overridden scores with reasons, evidence refs), evidence manifest with hashes, iteration summaries, second opinions. Export-only in this wave — a shareable/archival record, not yet an importable template.', contentsKey: 'gap_assessments', primaryContentDir: '' },
  'legal-research-session':        { label: 'Legal Research Session',       description: "Counsel's Desk session record: Q&A transcript, pinned findings, the verified-citation ledger with statuses, mode/expert-role config. Export-only in this wave — a shareable/archival record, not yet importable.", contentsKey: 'legal_research_sessions', primaryContentDir: '' },
};

export interface GovernanceMetadata {
  /** ISO date when the underlying content takes effect (e.g. a regulation's application date) */
  effective_date?: string;
  /** Canonical URL of the source material (e.g. EUR-Lex permalink) */
  source_url?: string;
  /** Name/email of the person who verified the bundle content */
  validated_by?: string;
  /** Author confirmed accuracy at time of build */
  content_confirmed?: boolean;
}

/**
 * The honest universal provider list: a module bundle is a prompt + config,
 * runnable against any provider ANTON supports. Used when a module carries
 * no provider-specific configuration (previously hardcoded ['anthropic']).
 */
export const ALL_LLM_PROVIDERS: readonly string[] = [
  'anthropic', 'openai', 'azure-openai', 'google', 'mistral', 'ollama', 'openai-compatible',
];

/** "openexpert/<version>" — written into every spec manifest as `generator`. */
export const ANTON_GENERATOR: string = (() => {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')
    ) as { name?: string; version?: string };
    return `${pkg.name ?? 'openexpert'}/${pkg.version ?? '0.0.0'}`;
  } catch {
    return 'openexpert/0.0.0';
  }
})();
