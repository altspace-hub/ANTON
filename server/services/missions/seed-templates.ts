// ── Missions — Built-in Template Seeds ──────────────────────────────────────
// Phase 1 ships ONE working starter template that demonstrates the full
// pipeline without needing the Action Layer or Service Packs. Phase 2-3
// add the AMLR / Recruitment / Marketing templates from the spec.

import type { DatabaseAdapter } from '../../db/database.js';
import { createMissionState } from './mission-state.js';
import type { MissionTemplate } from './types.js';

const KNOWLEDGE_SYNTHESIS_TEMPLATE: MissionTemplate = {
  id: 'tmpl_knowledge_synthesis_v1',
  name: 'Knowledge Synthesis',
  description:
    'Generic research → analysis → synthesis flow. Use this when you have a topic or question you want ANTON to investigate, organise its findings, and produce a written deliverable for review. No external system access needed.',
  pillar: 'work',
  category: 'research',
  version: '1.0.0',
  author: 'ANTON',
  parameters_schema: [
    {
      key: 'topic',
      label: 'Topic or question',
      type: 'textarea',
      required: true,
      help: 'What should ANTON investigate? Be specific.',
    },
    {
      key: 'depth',
      label: 'Depth',
      type: 'select',
      options: ['quick', 'standard', 'deep'],
      default: 'standard',
      help: 'Quick = ~3 tasks, ~10 min. Standard = ~5 tasks, ~30 min. Deep = ~7 tasks, ~1 hour.',
    },
    {
      key: 'audience',
      label: 'Intended audience',
      type: 'string',
      required: false,
      help: 'e.g. "board of directors", "engineering team", "myself" — shapes tone and depth.',
    },
  ],
  task_graph_template: {
    tasks: [
      {
        local_id: 't1',
        title: 'Frame the question',
        description: 'Restate the topic in precise terms; identify the key sub-questions to investigate.',
        task_type: 'llm',
        estimated_tokens: 4000,
        sort_order: 1,
        depends_on: [],
        prompt: 'Restate the topic precisely. Identify 3-5 specific sub-questions worth investigating. Output as a numbered list with one sentence rationale per sub-question.',
      },
      {
        local_id: 't2',
        title: 'Investigate sub-questions',
        description: 'Address each sub-question with available knowledge. Note evidence quality and gaps.',
        task_type: 'analysis',
        estimated_tokens: 12000,
        sort_order: 2,
        depends_on: ['t1'],
        prompt: 'For each sub-question identified in the prior task, provide a substantive answer using available knowledge. Cite evidence types (general knowledge / domain reasoning / explicit references). Where evidence is weak or missing, flag it explicitly. Output as Markdown with a section per sub-question.',
      },
      {
        local_id: 't3',
        title: 'Synthesise findings',
        description: 'Pull the investigation together into a coherent narrative with key insights and open questions.',
        task_type: 'analysis',
        estimated_tokens: 10000,
        sort_order: 3,
        depends_on: ['t2'],
        prompt: 'Synthesise the investigation into a coherent narrative. Structure: (1) tl;dr (3 sentences), (2) key findings (5-8 bullets), (3) supporting evidence summary, (4) open questions / gaps, (5) recommended next steps. Output Markdown.',
      },
      {
        local_id: 't4',
        title: 'Human review checkpoint',
        description: 'The synthesis is ready. Human reviews and approves before any external use.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 4,
        depends_on: ['t3'],
        checkpoint_message: 'Synthesis is ready for your review. Approve to mark mission complete, or reject to provide feedback for revision.',
      },
    ],
  },
  default_data_scope: {},
  default_budget: {
    token_budget_max: 250_000,
    time_budget_max_seconds: 3 * 24 * 60 * 60,    // 3 days
    time_active_max_seconds: 30 * 60,              // 30 min active
  },
  default_autonomy_level: 'check_in',
  success_criteria_template:
    'Deliver a synthesis that (a) directly addresses the framed sub-questions, (b) flags gaps in evidence honestly, and (c) is suitable for the stated audience.',
  required_modules: [],
  times_used: 0,
  avg_completion_time_seconds: null,
  avg_quality_score: null,
  avg_token_consumption: null,
  is_builtin: true,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ── AMLR Readiness Programme ────────────────────────────────────────────
// End-to-end programme for an AMLR-obliged entity to stand up its FCP
// programme: scope assessment → Atlas seeding → BWRA → gap analysis →
// policies + procedures → training plan → independent audit. Each stage
// is a checkpoint so the user reviews before progression. Designed for
// a 30-90 day stand-up window.

const AMLR_READINESS_TEMPLATE: MissionTemplate = {
  id: 'tmpl_amlr_readiness_v1',
  name: 'AMLR Readiness Programme',
  description:
    'End-to-end programme for an AMLR-obliged entity (bank, CASP, payment institution, real-estate agent, notary, accountant, TCSP, dealer, gambling operator, crowdfunder, …) to stand up the Article 16 programme: FCP scope assessment → Risk Atlas → Business-Wide Risk Assessment → AMLR gap analysis → policies / procedures → training plan → independent audit. 6-12 weeks elapsed, with checkpoints between each stage.',
  pillar: 'work',
  category: 'compliance',
  version: '1.0.0',
  author: 'ANTON',
  parameters_schema: [
    {
      key: 'institution_type',
      label: 'Institution type',
      type: 'select',
      required: true,
      options: [
        'bank', 'casp', 'payment_institution', 'investment_firm', 'insurance',
        'real_estate_agent', 'law_firm_notary', 'accountant_tax_advisor', 'tcsp',
        'high_value_dealer', 'motor_vehicle_dealer', 'yacht_aircraft_broker',
        'gambling_operator', 'football_club_agent', 'crowdfunding', 'other_obliged',
      ],
      help: 'Which obliged-entity category applies. Drives industry pack selection and the gap-analysis scope.',
    },
    {
      key: 'jurisdictions',
      label: 'Operating jurisdictions',
      type: 'string',
      required: true,
      help: 'Comma-separated. e.g. "EU, UK, Nordics". Drives sanctions list scope and EBA Risk Factor Guidelines applicability.',
    },
    {
      key: 'business_description',
      label: 'Business description (paragraph)',
      type: 'textarea',
      required: true,
      help: 'Customer base, products, channels, geographies, transaction volumes. The fcp-scope-assessor uses this to recommend domain activations.',
    },
  ],
  task_graph_template: {
    tasks: [
      {
        local_id: 't1',
        title: 'FCP scope assessment',
        description: 'Run the fcp-scope-assessor module against the business description to recommend which FCP domains apply (AML/CFT mandatory; sanctions / fraud default-on; the others domain-specific).',
        task_type: 'llm',
        estimated_tokens: 6000,
        sort_order: 1,
        depends_on: [],
        prompt: 'Use the fcp-scope-assessor module on the supplied business description, jurisdictions and institution_type. Output the scope JSON (per fcp-scope-assessor system-prompt) ready to write into atlas_fcp_scope.',
      },
      {
        local_id: 't2',
        title: 'Atlas creation + pack selection',
        description: 'Create a new Risk Atlas with the right industry pack pre-selected for the institution_type. The scope from t1 is applied to atlas_fcp_scope.',
        task_type: 'analysis',
        estimated_tokens: 4000,
        sort_order: 2,
        depends_on: ['t1'],
        prompt: 'Pick the industry pack matching institution_type (fcp-bank / fcp-casp / fcp-payment-institution / fcp-investment-firm / fcp-real-estate-agent / fcp-notary-law-firm / fcp-accounting-tax-advisor / fcp-tcsp / fcp-dealer-high-value-goods / fcp-motor-vehicle-dealer / fcp-yacht-aircraft-broker / fcp-gambling-operator / fcp-football-club-agent / fcp-crowdfunding). Output the suggested Atlas creation payload (name, industry_pack_id, mode, business_description). The executor will POST /api/atlas and write the scope from t1.',
      },
      {
        local_id: 't3',
        title: 'Checkpoint — review proposed scope and pack',
        description: 'Human reviews the scope assessment + industry-pack choice + Atlas name. Approves before the BWRA runs.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 3,
        depends_on: ['t2'],
        checkpoint_message: 'Review the FCP scope and proposed Atlas. Approve to proceed to the Business-Wide Risk Assessment, or reject with feedback.',
      },
      {
        local_id: 't4',
        title: 'Business-Wide Risk Assessment (BWRA)',
        description: 'Run the business-wide-risk-assessment module on the Atlas to draft Stages 1-7 and produce a regulator-ready BWRA document.',
        task_type: 'llm',
        estimated_tokens: 30000,
        sort_order: 4,
        depends_on: ['t3'],
        prompt: 'Invoke the business-wide-risk-assessment module on the Atlas from t2 with institution_type, jurisdictions and business_description. The atlas-* sub-modules will produce per-stage diffs. Final output: regulator-ready BWRA Markdown (12 sections per the module spec).',
      },
      {
        local_id: 't5',
        title: 'AMLR Article 16 gap analysis',
        description: 'Cross-reference the BWRA against AMLR Article 16 / EBA Risk Factor Guidelines via the amlr-gap-analysis module. Produces a prioritised gap list.',
        task_type: 'llm',
        estimated_tokens: 18000,
        sort_order: 5,
        depends_on: ['t4'],
        prompt: 'Run the amlr-gap-analysis module against the BWRA from t4. Output a prioritised gap list with article references (AMLR Art. 16, 20-23, 26; EBA RFG 2023 §3.4; MiCA Art. 67-86 if CASP).',
      },
      {
        local_id: 't6',
        title: 'Policies + procedures pack',
        description: 'Generate the documented policies and procedures the Atlas + gap analysis identify as required (AML/CFT policy, KYC/CDD procedures, sanctions screening procedure, STR / SAR pathway, training, escalation).',
        task_type: 'llm',
        estimated_tokens: 25000,
        sort_order: 6,
        depends_on: ['t5'],
        prompt: 'For each control in the Atlas with a vulnerability gap or "Adequate" rating, draft the supporting policy / procedure. Use the existing policy-document module per item. Bundle the outputs as one composite deliverable.',
      },
      {
        local_id: 't7',
        title: 'Training plan + materials',
        description: 'Generate a 30-min baseline FCP training (Universal Core) plus role-specific modules (MLRO, front-office, back-office, board) per the institution_type.',
        task_type: 'llm',
        estimated_tokens: 18000,
        sort_order: 7,
        depends_on: ['t6'],
        prompt: 'Produce a training plan: baseline (30 min) + role-specific modules. For each module: learning objectives, content outline, scenario / red-flag walk-through, assessment.',
      },
      {
        local_id: 't8',
        title: 'Checkpoint — review programme bundle',
        description: 'Human reviews BWRA + gap list + policies + training plan. Approves the package before independent audit.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 8,
        depends_on: ['t7'],
        checkpoint_message: 'Review the AMLR programme bundle: BWRA + gap list + policies + training plan. Approve to release to the independent audit step, or send back with feedback.',
      },
      {
        local_id: 't9',
        title: 'Independent audit brief',
        description: 'Produce the brief for an independent audit of the programme — scope, methodology, timeline, deliverable spec.',
        task_type: 'analysis',
        estimated_tokens: 6000,
        sort_order: 9,
        depends_on: ['t8'],
        prompt: 'Draft the independent-audit brief: scope (BWRA, controls, sample of customer files, training records, escalation log), methodology (interviews, document review, sample testing), timeline (typically 4-6 weeks), and deliverable (audit report + management letter).',
      },
      {
        local_id: 't10',
        title: 'Final checkpoint — programme ready',
        description: 'Human signs off the AMLR Readiness Programme bundle as ready for board approval and external audit.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 10,
        depends_on: ['t9'],
        checkpoint_message: 'Programme ready. Sign off to mark the mission complete; the Atlas remains the living source of truth for ongoing maintenance.',
      },
    ],
  },
  default_data_scope: {},
  default_budget: {
    token_budget_max: 800_000,
    time_budget_max_seconds: 90 * 24 * 60 * 60,    // 90 days elapsed
    time_active_max_seconds: 4 * 60 * 60,           // 4 hours active
  },
  default_autonomy_level: 'check_in',
  success_criteria_template:
    'Deliver an AMLR-obliged-entity-ready programme: an active Risk Atlas; a regulator-ready BWRA; a prioritised AMLR Article 16 gap list with regulatory references; policy + procedure pack; training plan; independent-audit brief. Each artefact must cross-reference the Atlas as the source of truth.',
  required_modules: [
    'fcp-scope-assessor',
    'business-wide-risk-assessment',
    'amlr-gap-analysis',
    'policy-document',
  ],
  times_used: 0,
  avg_completion_time_seconds: null,
  avg_quality_score: null,
  avg_token_consumption: null,
  is_builtin: true,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/**
 * Seed built-in mission templates. Idempotent — uses ON CONFLICT DO NOTHING
 * via insertTemplate so re-running the seeder is safe.
 */
export async function seedBuiltinTemplates(db: DatabaseAdapter): Promise<{ seeded: number }> {
  const state = createMissionState(db);
  const templates: MissionTemplate[] = [KNOWLEDGE_SYNTHESIS_TEMPLATE, AMLR_READINESS_TEMPLATE];
  let count = 0;
  for (const tmpl of templates) {
    const existing = await state.getTemplate(tmpl.id);
    if (!existing) {
      await state.insertTemplate(tmpl);
      count++;
    }
  }
  return { seeded: count };
}
