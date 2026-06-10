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

// ── Content Factory ─────────────────────────────────────────────────────────
// Standard-complexity marketing mission: research → draft long-form → repurpose
// across channels → brand-voice consistency pass → visual brief → handoff for
// manual publishing. v1 produces the content bundle for human review; v2 will
// integrate CMS Service Packs (WordPress / Ghost / Buffer) for direct publishing.

const CONTENT_FACTORY_TEMPLATE: MissionTemplate = {
  id: 'tmpl_content_factory_v1',
  name: 'Content Factory',
  description:
    'Take a topic and a brand voice; ANTON researches angles, drafts a long-form anchor (blog post / newsletter), repurposes it for short-form channels (Twitter, LinkedIn, Instagram), runs a brand-voice consistency pass, and generates a visual brief. v1 delivers the content bundle to your inbox for manual publishing — direct CMS publish lands when the Service Pack is wired.',
  pillar: 'work',
  category: 'marketing',
  version: '1.0.0',
  author: 'ANTON',
  parameters_schema: [
    {
      key: 'topic',
      label: 'Topic or angle',
      type: 'textarea',
      required: true,
      help: 'What is this content about? One paragraph. Include the angle you want, the message, or the question to answer.',
    },
    {
      key: 'brand_voice',
      label: 'Brand voice + style',
      type: 'textarea',
      required: true,
      help: 'Describe the voice (formal / playful / authoritative / friendly). Forbidden phrases. Sentence-length preference. Tone references. The consistency pass scores against this.',
    },
    {
      key: 'channels',
      label: 'Channels (comma-separated)',
      type: 'string',
      required: true,
      default: 'blog,twitter,linkedin,newsletter',
      help: 'Which channels to produce variants for. Supported: blog, twitter, linkedin, newsletter, instagram, threads. Order matters — first listed is the long-form anchor.',
    },
    {
      key: 'audience',
      label: 'Target reader',
      type: 'string',
      required: true,
      help: 'Who is this for? e.g. "compliance officers at mid-market banks", "indie founders pre-PMF", "first-time home buyers in Sweden".',
    },
    {
      key: 'word_count_anchor',
      label: 'Anchor length',
      type: 'select',
      options: ['short_600', 'standard_1200', 'long_2200'],
      default: 'standard_1200',
      help: 'Length of the long-form anchor in words.',
    },
  ],
  task_graph_template: {
    tasks: [
      {
        local_id: 't1',
        title: 'Research the topic',
        description: 'Gather angles, framings, supporting evidence, and counter-arguments worth addressing.',
        task_type: 'llm',
        estimated_tokens: 6000,
        sort_order: 1,
        depends_on: [],
        prompt: 'Research the topic for the target audience. Identify: (1) 3-5 distinct angles worth covering, (2) the strongest framing for the chosen audience, (3) supporting evidence types you can credibly invoke, (4) honest counter-arguments / nuance to address. Output Markdown.',
      },
      {
        local_id: 't2',
        title: 'Draft long-form anchor',
        description: 'Produce the canonical long-form piece (blog post or newsletter) — the source from which short-form variants will derive.',
        task_type: 'llm',
        estimated_tokens: 14000,
        sort_order: 2,
        depends_on: ['t1'],
        prompt: 'Draft the long-form anchor at the requested word count, in the requested brand voice, for the named audience. Structure: hook → context → main argument → evidence / examples → counter-argument addressed → close with a single takeaway. Output Markdown ready to publish.',
      },
      {
        local_id: 't3',
        title: 'Checkpoint — review the anchor draft',
        description: 'Human reviews the long-form draft before downstream repurposing locks in its tone.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 3,
        depends_on: ['t2'],
        checkpoint_message: 'The long-form anchor is ready. Review the headline, opening, argument, and close. Approve to generate channel variants, or reject with feedback so the anchor can be revised.',
      },
      {
        local_id: 't4',
        title: 'Repurpose for short-form channels',
        description: 'Derive Twitter, LinkedIn, Instagram, etc. variants from the anchor. Each variant honours its channel norms (length, format, hook style).',
        task_type: 'analysis',
        estimated_tokens: 10000,
        sort_order: 4,
        depends_on: ['t3'],
        prompt: 'For each requested channel (excluding the anchor channel), produce a variant of the anchor adapted to that channel\'s norms: Twitter = thread of 6-12 tweets / hooky opener / clear takeaway; LinkedIn = 1200-1800 char post / pattern-interrupt opener / list-driven body; Instagram = caption + carousel outline (8-10 slides); Threads = informal medium-form. Preserve the central argument and brand voice across variants. Output Markdown with one section per channel.',
      },
      {
        local_id: 't5',
        title: 'Brand-voice consistency pass',
        description: 'Score every variant against the brand-voice description; flag deviations and propose fixes.',
        task_type: 'analysis',
        estimated_tokens: 5000,
        sort_order: 5,
        depends_on: ['t4'],
        prompt: 'Score every variant (anchor + channel variants) against the brand-voice description on a 1-5 scale across: tone match, vocabulary fit, forbidden-phrase compliance, sentence rhythm. For any score ≤ 3, propose a specific rewrite. Output a brand-voice scorecard in Markdown.',
      },
      {
        local_id: 't6',
        title: 'Visual brief',
        description: 'Generate alt text + image / illustration prompts for hero + carousel + thumbnail assets.',
        task_type: 'llm',
        estimated_tokens: 4000,
        sort_order: 6,
        depends_on: ['t4'],
        prompt: 'For the content bundle, produce a visual brief: (1) hero image — alt text + image prompt suitable for a Midjourney / DALL·E / Stable Diffusion run, (2) thumbnail — alt text + prompt, (3) for Instagram carousel: one prompt per slide. Match the brand voice.',
      },
      {
        local_id: 't7',
        title: 'Checkpoint — approve content bundle',
        description: 'Human reviews the full bundle (anchor + variants + visual brief + scorecard) before delivery.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 7,
        depends_on: ['t5', 't6'],
        checkpoint_message: 'The content bundle is complete: anchor + channel variants + visual brief + brand-voice scorecard. Approve to deliver to your Mission Inbox for publishing, or send back with feedback.',
      },
      {
        local_id: 't8',
        title: 'Deliver bundle',
        description: 'Final delivery to Mission Inbox. CMS publish is out-of-scope for v1.',
        task_type: 'notification',
        estimated_tokens: 0,
        sort_order: 8,
        depends_on: ['t7'],
        prompt: 'Deliver the content bundle to the Mission Inbox. Include: anchor draft, channel variants, visual brief, brand-voice scorecard, and a one-line summary of recommended next publishing steps.',
      },
    ],
  },
  default_data_scope: {},
  default_budget: {
    token_budget_max: 400_000,
    time_budget_max_seconds: 7 * 24 * 60 * 60,    // 7 days elapsed
    time_active_max_seconds: 60 * 60,              // 1 hour active
  },
  default_autonomy_level: 'check_in',
  success_criteria_template:
    'Deliver a content bundle that (a) is on-brief for the supplied topic + audience, (b) covers every requested channel with channel-appropriate adaptation, (c) scores ≥ 4/5 on brand-voice consistency across all variants, (d) includes a usable visual brief.',
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

// ── Outbound Sales Machine ──────────────────────────────────────────────────
// Programme-complexity sales mission: refine ICP → research target accounts →
// draft personalised outreach + sequence → build reply-handling playbook. v1
// is LLM-only (no CRM integration); produces the outreach pack for manual
// execution. v2 will integrate a CRM Service Pack for direct sending + reply
// routing.

const OUTBOUND_SALES_TEMPLATE: MissionTemplate = {
  id: 'tmpl_outbound_sales_machine_v1',
  name: 'Outbound Sales Machine',
  description:
    'Refine your ICP → build a target account list → research each account → draft personalised outreach + a follow-up sequence → produce a reply-handling playbook. v1 delivers the outreach pack to your inbox for manual execution. v2 (planned) will integrate CRM Service Packs for direct send + reply routing.',
  pillar: 'work',
  category: 'sales',
  version: '1.0.0',
  author: 'ANTON',
  parameters_schema: [
    {
      key: 'icp_description',
      label: 'Ideal customer profile',
      type: 'textarea',
      required: true,
      help: 'Describe your ideal customer — company size, sector, role of buyer, urgency triggers, current alternatives, willingness-to-pay signals. Specificity here drives everything downstream.',
    },
    {
      key: 'offering',
      label: 'What you\'re selling',
      type: 'textarea',
      required: true,
      help: 'Product / service description, core problem solved, headline pricing approach (fixed-fee / SaaS tier / hourly), key differentiators.',
    },
    {
      key: 'value_prop',
      label: 'Why they should care',
      type: 'textarea',
      required: true,
      help: 'The single sharpest reason a buyer in the ICP would take a meeting. Avoid generic claims; ground it in measurable outcomes or named pain.',
    },
    {
      key: 'target_count',
      label: 'How many accounts to research',
      type: 'number',
      required: true,
      default: 20,
      help: 'Number of target accounts to identify and personalise outreach for. 10-50 is the sensible range.',
    },
    {
      key: 'outreach_channel',
      label: 'Outreach channel',
      type: 'select',
      options: ['email', 'linkedin', 'both'],
      default: 'both',
      help: 'Which channel(s) to draft for. "both" produces a paired email + LinkedIn open per account.',
    },
  ],
  task_graph_template: {
    tasks: [
      {
        local_id: 't1',
        title: 'Refine ICP into a scorecard',
        description: 'Turn the prose ICP description into a structured account-scoring rubric.',
        task_type: 'llm',
        estimated_tokens: 4000,
        sort_order: 1,
        depends_on: [],
        prompt: 'Convert the prose ICP into a structured scoring rubric: 5-8 criteria, each with weight, definition, and what "high fit / medium fit / low fit" looks like. Output as a Markdown table.',
      },
      {
        local_id: 't2',
        title: 'Generate target account candidates',
        description: 'Propose N candidate accounts that match the ICP rubric, with reasoning per candidate.',
        task_type: 'analysis',
        estimated_tokens: 8000,
        sort_order: 2,
        depends_on: ['t1'],
        prompt: 'Propose N (target_count) candidate accounts that match the ICP rubric. For each: name, sector, approximate size, why-they-fit (against the rubric), suspected pain point, recommended buyer role + persona. NOTE: this is a starter list from general knowledge — real production would enrich via data providers. Output as a Markdown table.',
      },
      {
        local_id: 't3',
        title: 'Checkpoint — approve account list',
        description: 'Human reviews and prunes the account list before research and outreach drafting locks in.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 3,
        depends_on: ['t2'],
        checkpoint_message: 'Account list is ready. Review fit-quality and prune / replace any accounts that don\'t belong before per-account research starts.',
      },
      {
        local_id: 't4',
        title: 'Per-account research',
        description: 'For each approved account, surface the latest signals: recent news, role changes, hiring patterns, public statements relevant to the offering.',
        task_type: 'llm',
        estimated_tokens: 14000,
        sort_order: 4,
        depends_on: ['t3'],
        prompt: 'For each account in the approved list, produce a brief: (1) what we know about the company, (2) the specific buyer (role, likely priorities), (3) angle of approach — which pain the offering solves for them specifically, (4) any public signals (recent news / hiring / leadership changes) worth referencing. Output as one section per account.',
      },
      {
        local_id: 't5',
        title: 'Draft personalised outreach',
        description: 'For each account, draft the opening message (email or LinkedIn or both) keyed to the research.',
        task_type: 'llm',
        estimated_tokens: 16000,
        sort_order: 5,
        depends_on: ['t4'],
        prompt: 'For each account, draft personalised first-touch outreach for the requested channel(s). Email: subject line + 90-130 words / 1 specific angle / 1 clear ask / no generic claims. LinkedIn open: 250-400 chars, observation-led, single ask. Use the per-account research from t4 — generic openings are unacceptable.',
      },
      {
        local_id: 't6',
        title: 'Build follow-up sequence',
        description: 'For each account, draft a 4-touch sequence: day 1 / day 3 / day 7 / day 14. Each touch advances a different angle.',
        task_type: 'analysis',
        estimated_tokens: 10000,
        sort_order: 6,
        depends_on: ['t5'],
        prompt: 'For each account, design a 4-touch sequence: D1 = the first-touch opener from t5; D3 = bump with new angle (e.g. case-study reference); D7 = value-add (relevant insight / resource, no ask); D14 = direct closer or break-up. Each touch must use a different angle, not just repeat the ask.',
      },
      {
        local_id: 't7',
        title: 'Checkpoint — approve outreach pack',
        description: 'Human reviews the personalised outreach + sequence before reply-handling playbook is generated.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 7,
        depends_on: ['t6'],
        checkpoint_message: 'Outreach pack is ready (N accounts × first-touch + 4-touch sequence). Approve to generate the reply-handling playbook, or send back specific accounts for revision.',
      },
      {
        local_id: 't8',
        title: 'Reply-handling playbook',
        description: 'Categorise likely reply types and draft response templates for each.',
        task_type: 'llm',
        estimated_tokens: 6000,
        sort_order: 8,
        depends_on: ['t7'],
        prompt: 'Build the reply-handling playbook. Categorise replies into: warm-interest, asking-for-info, objection (price / fit / timing), polite-decline, unsubscribe-request, out-of-office. For each: signal phrases that identify it, recommended response (3-5 sentence template), routing decision (schedule meeting / send case study / nurture / archive).',
      },
      {
        local_id: 't9',
        title: 'Deliver outreach pack',
        description: 'Final delivery to Mission Inbox + Grow pillar interactions log.',
        task_type: 'notification',
        estimated_tokens: 0,
        sort_order: 9,
        depends_on: ['t8'],
        prompt: 'Deliver the full pack to the Mission Inbox: ICP scorecard, approved account list, per-account research briefs, first-touch + 4-touch sequences, reply-handling playbook. Write a Grow pillar signal noting the campaign launch.',
      },
    ],
  },
  default_data_scope: {},
  default_budget: {
    token_budget_max: 800_000,
    time_budget_max_seconds: 30 * 24 * 60 * 60,   // 30 days elapsed
    time_active_max_seconds: 4 * 60 * 60,          // 4 hours active
  },
  default_autonomy_level: 'check_in',
  success_criteria_template:
    'Deliver an outreach pack that: (a) is genuinely personalised per account (no generic openers), (b) carries one clear ask per touch, (c) maps a 4-touch sequence that advances different angles, (d) includes a reply-handling playbook the human can execute without re-thinking response logic for common reply types.',
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

// ── Outbound Sales v2 (real action: Gmail send) ─────────────────────────────
// First template that exercises the Action Layer end-to-end: draft a
// personalised email (llm) → human approval checkpoint → REAL send through
// the Gmail Service Pack's send_message workflow (api-type pack, executed
// via the browser task type + the gmail.rfc5322_send composer).
//
// Safety: default autonomy is 'briefing' and the send task carries an OAuth
// credential, so the autonomy gate pauses it for explicit approval even
// after the content checkpoint. Requires the built-in 'gmail' Service Pack
// plus an oauth2 credential with the gmail.send scope in the vault.

const OUTBOUND_SALES_V2_TEMPLATE: MissionTemplate = {
  id: 'tmpl_outbound_sales_v2',
  name: 'Outbound Sales v2 — Draft & Send (Gmail)',
  description:
    'Draft one personalised outreach email and actually send it through Gmail. Flow: research + draft (LLM) → checkpoint (you review the draft and paste the final subject/body into the send task) → real send via the Gmail Service Pack under the briefing autonomy gate. Requires a Gmail oauth2 credential (gmail.send scope) in the Credential Vault. v1 (Outbound Sales Machine) remains the LLM-only campaign builder.',
  pillar: 'work',
  category: 'sales',
  version: '2.0.0',
  author: 'ANTON',
  parameters_schema: [
    {
      key: 'recipient_email',
      label: 'Recipient email',
      type: 'string',
      required: true,
      help: 'The single recipient for this send. Run the mission once per recipient (or use Outbound Sales Machine v1 to build a campaign pack first).',
    },
    {
      key: 'recipient_context',
      label: 'What you know about the recipient',
      type: 'textarea',
      required: true,
      help: 'Company, role, recent signals, why now. Specificity drives the draft quality — generic openers are unacceptable.',
    },
    {
      key: 'offering',
      label: 'What you\'re selling',
      type: 'textarea',
      required: true,
      help: 'Product / service, core problem solved, headline pricing approach, key differentiator.',
    },
    {
      key: 'value_prop',
      label: 'Why they should care',
      type: 'textarea',
      required: true,
      help: 'The single sharpest reason this recipient would take a meeting. Ground it in measurable outcomes or named pain.',
    },
    {
      key: 'gmail_credential_id',
      label: 'Gmail credential id',
      type: 'string',
      required: false,
      help: 'Credential Vault id (cred_…) of your Gmail oauth2 credential with the gmail.send scope. If left blank, set auth_credential_id on the send task via "Edit task" before approving the plan.',
    },
  ],
  task_graph_template: {
    tasks: [
      {
        local_id: 't1',
        title: 'Draft the outreach email',
        description: 'Personalised first-touch email for the recipient: subject line + plain-text body, grounded in the recipient context and value proposition.',
        task_type: 'llm',
        estimated_tokens: 5000,
        sort_order: 1,
        depends_on: [],
        prompt: 'Draft a personalised first-touch outreach email to ${recipient_email}. Use the recipient context, offering, and value proposition from the mission brief. Requirements: subject line ≤ 60 chars; body 90-130 words plain text; one specific angle keyed to the recipient context; one clear ask; no generic claims, no flattery filler. Output EXACTLY this format:\n\nSUBJECT: <subject line>\n\nBODY:\n<plain-text body>',
      },
      {
        local_id: 't2',
        title: 'Checkpoint — approve the draft & arm the send task',
        description: 'Human reviews the draft, then pastes the final subject and body into the send task before approving.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 2,
        depends_on: ['t1'],
        checkpoint_message: 'The draft is ready. Before approving: open the "Send via Gmail" task → Edit task → set module_config.params.subject and module_config.params.body_text to the final text (and auth_credential_id to your Gmail credential if not already set). Approving this checkpoint releases the send to the briefing autonomy gate for final confirmation.',
      },
      {
        local_id: 't3',
        title: 'Send via Gmail',
        description: 'Real send through the Gmail Service Pack send_message workflow (RFC 5322 composer; header-injection safe). Pauses at the briefing autonomy gate because it runs with an authenticated session.',
        task_type: 'browser',
        estimated_tokens: 0,
        sort_order: 3,
        depends_on: ['t2'],
        module_config: {
          service_id: 'gmail',
          workflow_id: 'send_message',
          params: {
            to: '${recipient_email}',
            subject: 'SET AT CHECKPOINT — paste the approved subject here',
            body_text: 'SET AT CHECKPOINT — paste the approved body here',
          },
          auth_credential_id: '${gmail_credential_id}',
        },
      },
      {
        local_id: 't4',
        title: 'Deliver send receipt',
        description: 'Record the send outcome to the Mission Inbox.',
        task_type: 'notification',
        estimated_tokens: 0,
        sort_order: 4,
        depends_on: ['t3'],
        prompt: 'Deliver the send receipt (draft + Gmail API response) to the Mission Inbox.',
      },
    ],
  },
  default_data_scope: {},
  default_budget: {
    token_budget_max: 100_000,
    time_budget_max_seconds: 3 * 24 * 60 * 60,    // 3 days elapsed
    time_active_max_seconds: 30 * 60,              // 30 min active
  },
  default_autonomy_level: 'briefing',
  success_criteria_template:
    'One personalised outreach email: (a) drafted to the supplied recipient with a specific angle and a single ask, (b) explicitly approved by the human at the checkpoint, (c) actually sent through the Gmail API with the send receipt recorded in the mission.',
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

// ── E-Commerce Autopilot ────────────────────────────────────────────────────
// Programme-complexity commerce mission: audit current state → listing
// optimisation plan → ad-spend recommendation → inventory health → order-ops
// runbook → reporting cadence. v1 produces the operating model for manual
// execution; v2 will integrate Shopify / Amazon Service Packs for direct
// listing updates + ad-spend management.

const ECOMMERCE_AUTOPILOT_TEMPLATE: MissionTemplate = {
  id: 'tmpl_ecommerce_autopilot_v1',
  name: 'E-Commerce Autopilot',
  description:
    'Audit your current e-commerce setup → produce a listing-optimisation plan → ad-spend recommendation → inventory-health review → order-ops runbook → reporting cadence. v1 delivers the operating model for manual execution. v2 (planned) integrates Shopify / Amazon / Etsy Service Packs for direct listing + ad-spend management.',
  pillar: 'work',
  category: 'commerce',
  version: '1.0.0',
  author: 'ANTON',
  parameters_schema: [
    {
      key: 'store_type',
      label: 'Store platform',
      type: 'select',
      required: true,
      options: ['shopify', 'amazon', 'etsy', 'woocommerce', 'tiktok_shop', 'multi'],
      help: 'Which platform(s) you sell on. "multi" produces a coordinated cross-channel operating model.',
    },
    {
      key: 'catalog_description',
      label: 'Catalog description',
      type: 'textarea',
      required: true,
      help: 'What you sell. Categories, top SKUs, price range, what differentiates your products. Include any seasonal patterns.',
    },
    {
      key: 'markets',
      label: 'Markets served',
      type: 'string',
      required: true,
      help: 'Geographies (e.g. "US + EU", "Sweden only", "global except restricted"). Drives tax / shipping / compliance considerations.',
    },
    {
      key: 'focus_areas',
      label: 'Focus areas (comma-separated)',
      type: 'string',
      required: true,
      default: 'listing-optimisation,ad-spend,inventory,order-ops',
      help: 'Which areas to prioritise. Supported: listing-optimisation, ad-spend, inventory, order-ops, returns, customer-service.',
    },
    {
      key: 'monthly_revenue',
      label: 'Monthly revenue (optional)',
      type: 'number',
      required: false,
      help: 'For prioritisation only — drives recommendation scale (e.g. ad-spend budget bands).',
    },
  ],
  task_graph_template: {
    tasks: [
      {
        local_id: 't1',
        title: 'Current-state audit',
        description: 'Identify operational gaps and quick-wins across the focus areas from the catalog + market description.',
        task_type: 'llm',
        estimated_tokens: 6000,
        sort_order: 1,
        depends_on: [],
        prompt: 'Audit the current setup from the catalog + markets + focus_areas. For each focus area, identify: (1) what likely works today, (2) the biggest operational gap, (3) one or two quick-wins (≤ 1 week effort), (4) one structural improvement (1-3 months effort). Output as a Markdown table per focus area.',
      },
      {
        local_id: 't2',
        title: 'Listing optimisation plan',
        description: 'For the focus areas including listing-optimisation, produce a per-SKU plan (titles, descriptions, imagery, SEO, pricing approach).',
        task_type: 'analysis',
        estimated_tokens: 8000,
        sort_order: 2,
        depends_on: ['t1'],
        prompt: 'Produce the listing-optimisation plan. Cover: (1) title patterns and length per platform, (2) description structure (hook → benefits → specifications → social proof), (3) imagery checklist (hero / lifestyle / dimensional / detail), (4) platform-specific SEO (Shopify = product tags + collections; Amazon = backend keywords + A+ content; Etsy = title + tags + materials), (5) pricing posture (premium / mid / value) relative to category competitors. Output Markdown.',
      },
      {
        local_id: 't3',
        title: 'Ad-spend recommendation',
        description: 'If ad-spend is a focus area, recommend a channel allocation and budget framework keyed to revenue.',
        task_type: 'llm',
        estimated_tokens: 5000,
        sort_order: 3,
        depends_on: ['t1'],
        prompt: 'Recommend ad-spend strategy. Cover: (1) channel mix appropriate to the platform + market (e.g. Shopify global = Meta + Google Shopping + TikTok; Amazon = Sponsored Products + Sponsored Brands; Etsy = Etsy Ads + Pinterest), (2) starting budget per channel as % of monthly_revenue (or absolute if revenue not given), (3) test-budget framework (how to test new creatives / audiences without burning budget), (4) the key 4 metrics to watch (ROAS, CPM, CTR, conversion rate) with target ranges.',
      },
      {
        local_id: 't4',
        title: 'Inventory + order-ops review',
        description: 'Inventory stocking patterns + order operations playbook (returns, complaints, escalations).',
        task_type: 'analysis',
        estimated_tokens: 7000,
        sort_order: 4,
        depends_on: ['t1'],
        prompt: 'Cover: (1) inventory — stocking patterns by season, reorder-point methodology, slow-mover identification, (2) order operations — order acknowledgement / shipping cadence / tracking comms / refund + return policy / dispute resolution. Tailor language to the platform (Shopify Inbox / Amazon Buyer-Seller Messaging / Etsy Messages). Output Markdown.',
      },
      {
        local_id: 't5',
        title: 'Checkpoint — review the optimisation plan',
        description: 'Human reviews the listing + ads + inventory plans before reporting cadence is locked.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 5,
        depends_on: ['t2', 't3', 't4'],
        checkpoint_message: 'Optimisation plan is ready: listings + ads + inventory + order-ops. Approve to generate the reporting cadence spec, or send back specific sections with feedback.',
      },
      {
        local_id: 't6',
        title: 'Reporting cadence spec',
        description: 'Weekly + monthly dashboard structure — what to look at, what to act on.',
        task_type: 'llm',
        estimated_tokens: 4000,
        sort_order: 6,
        depends_on: ['t5'],
        prompt: 'Design the reporting cadence: (1) daily 5-min check (revenue + ad-spend + inventory alerts), (2) weekly review (top SKUs / ad performance / returns / customer-service queue), (3) monthly deep-dive (margin / inventory turnover / channel ROI / customer-lifetime-value). For each, specify: metrics, source, threshold for action.',
      },
      {
        local_id: 't7',
        title: 'Final checkpoint — sign off the operating model',
        description: 'Human approves the full e-commerce operating model bundle.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 7,
        depends_on: ['t6'],
        checkpoint_message: 'Full operating model ready (audit + listing optimisation + ad spend + inventory + order-ops + reporting cadence). Sign off to deliver to your Mission Inbox.',
      },
      {
        local_id: 't8',
        title: 'Deliver operating model',
        description: 'Final delivery — full bundle into Mission Inbox.',
        task_type: 'notification',
        estimated_tokens: 0,
        sort_order: 8,
        depends_on: ['t7'],
        prompt: 'Deliver the full e-commerce operating model bundle to the Mission Inbox. Include a "first 30 days" implementation checklist as the cover note.',
      },
    ],
  },
  default_data_scope: {},
  default_budget: {
    token_budget_max: 700_000,
    time_budget_max_seconds: 30 * 24 * 60 * 60,
    time_active_max_seconds: 3 * 60 * 60,
  },
  default_autonomy_level: 'check_in',
  success_criteria_template:
    'Deliver an e-commerce operating model that: (a) is grounded in the platform + market constraints supplied, (b) addresses every requested focus area with both quick-wins and structural moves, (c) is actionable — every recommendation is specific enough that the operator can execute without re-thinking.',
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

// ── Financial Analyst ───────────────────────────────────────────────────────
// Standard-complexity finance mission: frame portfolio → macro context →
// thesis review → position monitoring → risk flags → composed digest. Each
// run produces a structured digest; cadence (daily/weekly) is a parameter.
// v1 is LLM-only — real-data integration comes when the Markets pillar's
// data pipes are exposed as Service Packs.

const FINANCIAL_ANALYST_TEMPLATE: MissionTemplate = {
  id: 'tmpl_financial_analyst_v1',
  name: 'Financial Analyst',
  description:
    'Produces a structured markets digest with thesis tracking, position monitoring, and risk flags. v1 is LLM-only — runs against your stated portfolio focus and tracked theses. v2 (planned) will pipe in real-time market data from the Markets pillar.',
  pillar: 'work',
  category: 'finance',
  version: '1.0.0',
  author: 'ANTON',
  parameters_schema: [
    {
      key: 'portfolio_focus',
      label: 'Portfolio focus',
      type: 'textarea',
      required: true,
      help: 'What instruments / sectors / themes to track. e.g. "US large-cap tech, EU defence, gold, BTC". Include any specific tickers worth watching.',
    },
    {
      key: 'risk_appetite',
      label: 'Risk appetite',
      type: 'select',
      required: true,
      options: ['conservative', 'balanced', 'aggressive'],
      default: 'balanced',
      help: 'Shapes the risk-flag sensitivity and recommended-action tone.',
    },
    {
      key: 'cadence',
      label: 'Digest cadence',
      type: 'select',
      required: true,
      options: ['daily', 'weekly'],
      default: 'weekly',
      help: 'How often this mission runs. Daily = shorter format, focused on yesterday\'s moves. Weekly = wider lens.',
    },
    {
      key: 'theses_to_track',
      label: 'Theses to track',
      type: 'textarea',
      required: false,
      help: 'Pre-existing theses you want ANTON to monitor. One per line. e.g. "Defence rotation in EU continues through 2026 elections". Leave blank if you want ANTON to propose theses from the portfolio focus.',
    },
  ],
  task_graph_template: {
    tasks: [
      {
        local_id: 't1',
        title: 'Frame portfolio focus',
        description: 'Extract specific instruments, sectors, and themes from the portfolio description.',
        task_type: 'llm',
        estimated_tokens: 3000,
        sort_order: 1,
        depends_on: [],
        prompt: 'Frame the portfolio focus precisely. Output: (1) named instruments / tickers, (2) sector exposures, (3) thematic exposures, (4) the implicit correlation map (what moves together in this portfolio).',
      },
      {
        local_id: 't2',
        title: 'Macro context',
        description: 'Current macro view — regime, key indicators worth watching.',
        task_type: 'analysis',
        estimated_tokens: 5000,
        sort_order: 2,
        depends_on: ['t1'],
        prompt: 'Provide a macro context appropriate to the portfolio. Cover: (1) current regime call (risk-on / risk-off / mixed), (2) the 3-5 indicators most relevant to this portfolio, (3) named tail risks for the period. Acknowledge knowledge-cutoff limitations honestly — flag where current-state info matters and is missing.',
      },
      {
        local_id: 't3',
        title: 'Thesis review',
        description: 'For each tracked thesis, what is the latest? Confirm, mutate, or retire.',
        task_type: 'llm',
        estimated_tokens: 7000,
        sort_order: 3,
        depends_on: ['t2'],
        prompt: 'For each tracked thesis (or for proposed theses if none supplied), assess: (1) what evidence would confirm / contradict it, (2) what we can say about its current standing given the macro context, (3) recommended action — confirm / mutate / retire / put on watch. Be specific about evidence gaps.',
      },
      {
        local_id: 't4',
        title: 'Position monitoring',
        description: 'Flag concentration risk, correlation breakdown, drawdown risk against risk_appetite.',
        task_type: 'analysis',
        estimated_tokens: 5000,
        sort_order: 4,
        depends_on: ['t1'],
        prompt: 'Score the portfolio against the supplied risk_appetite. Flag: (1) concentration risk (single-name / sector / factor), (2) correlation risk (instruments that look diversified but move together), (3) drawdown sensitivity (what kind of regime change would hurt). Output as a risk matrix.',
      },
      {
        local_id: 't5',
        title: 'Risk flags for the period',
        description: 'What could blow up this period? What to watch.',
        task_type: 'llm',
        estimated_tokens: 4000,
        sort_order: 5,
        depends_on: ['t2', 't4'],
        prompt: 'Generate the risk-flag list for the cadence period. Each flag: (1) named risk, (2) precondition / trigger, (3) impact on the portfolio if it materialises, (4) what to watch in the data. Order by descending probability × impact.',
      },
      {
        local_id: 't6',
        title: 'Compose the digest',
        description: 'Pull macro + thesis + position + risk into the structured deliverable.',
        task_type: 'llm',
        estimated_tokens: 6000,
        sort_order: 6,
        depends_on: ['t3', 't4', 't5'],
        prompt: 'Compose the digest. Structure: (1) Headline view (3 sentences), (2) macro context (one paragraph), (3) thesis updates (one short paragraph per thesis), (4) position monitoring (the risk matrix), (5) risk flags (ordered list), (6) action recommendations (the 3 things worth doing this period). Tone matched to risk_appetite. Output Markdown.',
      },
      {
        local_id: 't7',
        title: 'Checkpoint — review digest',
        description: 'Human reviews the digest before delivery.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 7,
        depends_on: ['t6'],
        checkpoint_message: 'The markets digest is ready. Review for accuracy + tone before delivery. If any thesis call is wrong, send back with feedback.',
      },
      {
        local_id: 't8',
        title: 'Deliver digest',
        description: 'Final delivery to Mission Inbox.',
        task_type: 'notification',
        estimated_tokens: 0,
        sort_order: 8,
        depends_on: ['t7'],
        prompt: 'Deliver the markets digest to the Mission Inbox. If this is a recurring mission instance, include "delta from last digest" as the opening line.',
      },
    ],
  },
  default_data_scope: {},
  default_budget: {
    token_budget_max: 350_000,
    time_budget_max_seconds: 7 * 24 * 60 * 60,
    time_active_max_seconds: 45 * 60,
  },
  default_autonomy_level: 'check_in',
  success_criteria_template:
    'Deliver a markets digest that: (a) reads as a real analyst\'s output — opinions backed by reasoning, (b) is honest about what we don\'t know (knowledge-cutoff limits), (c) tracks the supplied theses with explicit confirm / mutate / retire calls, (d) produces 3 specific action recommendations toned to the supplied risk_appetite.',
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

// ── AI Agency ───────────────────────────────────────────────────────────────
// Programme-complexity agency mission: refine offering → intake script → SOW
// template → delivery playbook → reporting cadence → invoicing template →
// expansion plan. Designed for someone running a productized AI service who
// needs the operating system, not just the AI delivery.

const AI_AGENCY_TEMPLATE: MissionTemplate = {
  id: 'tmpl_ai_agency_v1',
  name: 'AI Agency',
  description:
    'Build the operating system for a productized AI service offering: refine your offering → client intake script → SOW template → delivery playbook with quality gates → reporting cadence → invoicing + payment terms → client expansion plan. v1 produces the full playbook bundle.',
  pillar: 'work',
  category: 'agency',
  version: '1.0.0',
  author: 'ANTON',
  parameters_schema: [
    {
      key: 'service_offering',
      label: 'Service offering',
      type: 'textarea',
      required: true,
      help: 'What you sell. e.g. "AI compliance audits for fintech startups, 4-week engagement, fixed-fee €15k, deliverable = audit report + remediation roadmap".',
    },
    {
      key: 'target_client_profile',
      label: 'Target client profile',
      type: 'textarea',
      required: true,
      help: 'Who you serve. Size, stage, sector, decision-maker role, urgency triggers.',
    },
    {
      key: 'pricing_model',
      label: 'Pricing model',
      type: 'select',
      required: true,
      options: ['fixed_fee', 'hourly', 'retainer', 'value_based'],
      default: 'fixed_fee',
      help: 'How you charge. Shapes the SOW template and invoicing flow.',
    },
    {
      key: 'delivery_window_days',
      label: 'Standard delivery window (days)',
      type: 'number',
      required: true,
      default: 28,
      help: 'Standard engagement length in days. Drives the reporting cadence and quality-gate placement.',
    },
    {
      key: 'team_size',
      label: 'Team size',
      type: 'number',
      required: false,
      default: 1,
      help: 'How many people deliver per engagement. 1 = solo operator; > 1 changes the delivery playbook to address handoffs.',
    },
  ],
  task_graph_template: {
    tasks: [
      {
        local_id: 't1',
        title: 'Refine service offering',
        description: 'Sharpen scope, deliverable, exclusions, and the value claim.',
        task_type: 'llm',
        estimated_tokens: 5000,
        sort_order: 1,
        depends_on: [],
        prompt: 'Sharpen the service offering. Output: (1) one-sentence positioning (X for Y, doing Z, in W time), (2) precise scope inclusions, (3) explicit exclusions (the things people will ask for that aren\'t in scope), (4) deliverable specification (format, length, depth), (5) the value claim (what the client gets that they couldn\'t get elsewhere).',
      },
      {
        local_id: 't2',
        title: 'Client intake script',
        description: 'Discovery / qualification call structure.',
        task_type: 'analysis',
        estimated_tokens: 6000,
        sort_order: 2,
        depends_on: ['t1'],
        prompt: 'Design the 45-min discovery + qualification call. Sections: (1) 5-min context warm-up, (2) 15-min discovery questions (problem space, urgency, decision process, budget), (3) 10-min fit check (red-flag + green-flag signals), (4) 10-min walkthrough of the offering, (5) 5-min next-step ask. Include the 8 specific questions to ask. Include the disqualification criteria.',
      },
      {
        local_id: 't3',
        title: 'SOW / proposal template',
        description: 'Statement-of-work + proposal template appropriate to the pricing model.',
        task_type: 'llm',
        estimated_tokens: 8000,
        sort_order: 3,
        depends_on: ['t1'],
        prompt: 'Generate a SOW / proposal template. Sections: (1) Context (what the client told us), (2) Objective (what success looks like for them), (3) Scope (inclusions / exclusions from t1), (4) Deliverables (with format + acceptance criteria), (5) Timeline (week-by-week milestones), (6) Pricing — adapted to the pricing_model (fixed = total + payment schedule; hourly = rate + estimated hours + cap; retainer = monthly + scope ceiling; value = % of value created with floor + cap), (7) Terms (revisions, cancellation, IP).',
      },
      {
        local_id: 't4',
        title: 'Delivery playbook',
        description: 'Phase-by-phase delivery with quality gates.',
        task_type: 'analysis',
        estimated_tokens: 10000,
        sort_order: 4,
        depends_on: ['t1'],
        prompt: 'Design the delivery playbook over the delivery_window_days. Break into 3-4 phases. For each phase: (1) duration, (2) work to do, (3) artefacts produced, (4) quality gate (what we check before moving on), (5) client touchpoint (kickoff / mid-engagement / closeout review). If team_size > 1, also specify handoff points and ownership transitions. Output as Markdown phase-by-phase.',
      },
      {
        local_id: 't5',
        title: 'Checkpoint — approve operating model',
        description: 'Human reviews the foundation before billing + expansion plans are layered in.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 5,
        depends_on: ['t2', 't3', 't4'],
        checkpoint_message: 'Foundation ready: offering + intake + SOW + delivery playbook. Approve to layer in billing and expansion plans, or send back with feedback.',
      },
      {
        local_id: 't6',
        title: 'Reporting + comms cadence',
        description: 'Client-facing reporting structure across the engagement.',
        task_type: 'llm',
        estimated_tokens: 4000,
        sort_order: 6,
        depends_on: ['t5'],
        prompt: 'Design the client-facing reporting cadence: (1) weekly check-in template (what you did / what\'s next / risks / asks of client), (2) mid-engagement review (mid-point with deliverable preview + course-correction window), (3) closeout (final deliverable presentation + lessons learned + expansion conversation).',
      },
      {
        local_id: 't7',
        title: 'Invoicing + payment template',
        description: 'Invoice template, payment terms, and the late-payment follow-up cadence.',
        task_type: 'llm',
        estimated_tokens: 4000,
        sort_order: 7,
        depends_on: ['t5'],
        prompt: 'Generate the billing pack adapted to pricing_model: (1) invoice template (line items, terms, payment methods), (2) payment-terms language (net-7 / net-14 / 50-50 / monthly retainer / on-deliverable), (3) late-payment follow-up cadence (D+3 friendly nudge → D+7 firm → D+14 escalation → D+21 stop-work clause).',
      },
      {
        local_id: 't8',
        title: 'Client expansion plan',
        description: 'Upsell paths, retention triggers, and the "from engagement to retainer" conversion playbook.',
        task_type: 'analysis',
        estimated_tokens: 5000,
        sort_order: 8,
        depends_on: ['t5'],
        prompt: 'Design the expansion plan. Cover: (1) natural follow-on engagements that come from the core offering, (2) the retainer conversion conversation (when in the engagement to raise it, what to offer), (3) referral mechanics, (4) retention triggers (when to proactively reach out post-engagement — month 1 / 3 / 6 cadence).',
      },
      {
        local_id: 't9',
        title: 'Final checkpoint — sign off',
        description: 'Human signs off the full agency operating system.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 9,
        depends_on: ['t6', 't7', 't8'],
        checkpoint_message: 'Agency operating system is complete: offering + intake + SOW + delivery + reporting + billing + expansion. Sign off to deliver.',
      },
      {
        local_id: 't10',
        title: 'Deliver playbook bundle',
        description: 'Final delivery to Mission Inbox.',
        task_type: 'notification',
        estimated_tokens: 0,
        sort_order: 10,
        depends_on: ['t9'],
        prompt: 'Deliver the full agency operating system bundle to the Mission Inbox. Include a "first engagement implementation checklist" as the cover.',
      },
    ],
  },
  default_data_scope: {},
  default_budget: {
    token_budget_max: 700_000,
    time_budget_max_seconds: 30 * 24 * 60 * 60,
    time_active_max_seconds: 3 * 60 * 60,
  },
  default_autonomy_level: 'check_in',
  success_criteria_template:
    'Deliver an agency operating system that: (a) is specific to the supplied offering — generic templates are unacceptable, (b) gives the operator a runnable system from first contact through engagement closeout, (c) covers the boring-but-critical parts (invoicing, late-payment, scope-creep) as carefully as the work itself.',
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

// ── Property Manager ────────────────────────────────────────────────────────
// Programme-complexity real-estate mission: portfolio audit → listing
// templates → tenant comms playbook → maintenance triage rubric → rent
// collection workflow → compliance register → vendor management. v1
// delivers the operating model; v2 will integrate property-management
// platform Service Packs (Buildium / AppFolio / Booqable).

const PROPERTY_MANAGER_TEMPLATE: MissionTemplate = {
  id: 'tmpl_property_manager_v1',
  name: 'Property Manager',
  description:
    'Stand up a property-management operating model: portfolio audit → listing templates → tenant comms playbook → maintenance triage rubric → rent collection workflow → compliance register → vendor management. v1 delivers the playbook bundle. v2 (planned) will integrate property-management platforms for direct tenant comms + maintenance routing.',
  pillar: 'work',
  category: 'real-estate',
  version: '1.0.0',
  author: 'ANTON',
  parameters_schema: [
    {
      key: 'portfolio_size',
      label: 'Portfolio size (units)',
      type: 'number',
      required: true,
      help: 'How many units / properties under management.',
    },
    {
      key: 'unit_types',
      label: 'Unit types',
      type: 'select',
      required: true,
      options: ['residential', 'commercial', 'short_term_rental', 'mixed'],
      help: 'What you manage. "mixed" produces a coordinated model.',
    },
    {
      key: 'jurisdiction',
      label: 'Jurisdiction',
      type: 'string',
      required: true,
      help: 'Where the properties are. e.g. "Sweden — Stockholm + Göteborg". Drives compliance register scope.',
    },
    {
      key: 'tenant_comm_channel',
      label: 'Primary tenant comms channel',
      type: 'select',
      required: true,
      options: ['email', 'sms', 'app', 'mixed'],
      default: 'email',
      help: 'How tenants reach you most often.',
    },
    {
      key: 'pain_points',
      label: 'Current pain points',
      type: 'textarea',
      required: false,
      help: 'What\'s hardest right now? Late payments? Maintenance backlog? Vacancy? Vendor reliability? Drives where the playbook leans.',
    },
  ],
  task_graph_template: {
    tasks: [
      {
        local_id: 't1',
        title: 'Portfolio audit',
        description: 'Categorise the portfolio + identify operational gaps from the inputs.',
        task_type: 'llm',
        estimated_tokens: 5000,
        sort_order: 1,
        depends_on: [],
        prompt: 'Audit the portfolio from the supplied inputs (size, unit_types, jurisdiction, pain_points). Output: (1) operational profile (small / medium / professional scale), (2) the 3 biggest operational risks given the inputs, (3) quick-wins (≤ 1 week), (4) structural improvements (1-3 months).',
      },
      {
        local_id: 't2',
        title: 'Listing template pack',
        description: 'Listing copy + photo brief + pricing approach per unit type.',
        task_type: 'analysis',
        estimated_tokens: 6000,
        sort_order: 2,
        depends_on: ['t1'],
        prompt: 'Produce listing templates per unit_type. Each: (1) headline pattern, (2) description structure (hook → features → location → ideal-tenant profile), (3) photo brief (must-haves + nice-to-haves), (4) pricing posture relative to local market. If short_term_rental, also include calendar / rate optimisation guidance.',
      },
      {
        local_id: 't3',
        title: 'Tenant comms playbook',
        description: 'Onboarding, lease renewal, complaints, move-out templates.',
        task_type: 'llm',
        estimated_tokens: 8000,
        sort_order: 3,
        depends_on: ['t1'],
        prompt: 'Build the tenant comms playbook across the lifecycle: (1) onboarding (welcome / handover / first-30-days check-in), (2) routine touchpoints (quarterly satisfaction / annual review), (3) lease renewal (60-day, 30-day, signed), (4) complaints (acknowledgement / investigation / resolution / follow-up), (5) move-out (notice received / inspection schedule / deposit return). Adapt template language to the supplied tenant_comm_channel. Include the SLA for response time per category.',
      },
      {
        local_id: 't4',
        title: 'Maintenance triage rubric',
        description: 'Severity classification → vendor routing → SLA targets.',
        task_type: 'analysis',
        estimated_tokens: 5000,
        sort_order: 4,
        depends_on: ['t1'],
        prompt: 'Build the maintenance triage rubric. Severity bands: (1) emergency (health/safety/major-damage — immediate response), (2) urgent (functional impact — 24-48hr), (3) standard (1-2 weeks), (4) cosmetic / scheduled (next maintenance window). For each band: signal phrases that identify it, vendor type to route to, communication SLA to tenant, escalation if vendor misses.',
      },
      {
        local_id: 't5',
        title: 'Checkpoint — review operating model',
        description: 'Human reviews listings + comms + maintenance triage before rent + compliance plans are layered.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 5,
        depends_on: ['t2', 't3', 't4'],
        checkpoint_message: 'Core operating model ready: listings + tenant comms + maintenance triage. Approve to layer in rent collection + compliance + vendor management.',
      },
      {
        local_id: 't6',
        title: 'Rent collection workflow',
        description: 'Invoice cadence + late-payment escalation + payment-plan templates.',
        task_type: 'llm',
        estimated_tokens: 5000,
        sort_order: 6,
        depends_on: ['t5'],
        prompt: 'Build the rent-collection workflow. Cover: (1) routine invoice cadence (when sent, what reminder leads up to due date), (2) day-0 → day-3 → day-7 → day-14 → day-30 late-payment escalation with tone-appropriate templates for the jurisdiction, (3) payment-plan templates (when to offer, what terms), (4) eviction-or-legal escalation threshold and process — keyed to local law where possible.',
      },
      {
        local_id: 't7',
        title: 'Compliance + risk register',
        description: 'Jurisdiction-aware reminder list — fire safety, gas / electrical certs, insurance renewals, local-regulator filings.',
        task_type: 'analysis',
        estimated_tokens: 4000,
        sort_order: 7,
        depends_on: ['t1'],
        prompt: 'Generate the compliance + risk register for the supplied jurisdiction + unit_types. Cover statutory obligations the property manager owns: fire safety / gas safety / electrical certs / insurance / energy-performance / local-authority registrations / tax filings. For each: cadence, lead time to renew, evidence requirement, who to contact. Acknowledge that this is general guidance; the operator should confirm against current local law.',
      },
      {
        local_id: 't8',
        title: 'Vendor management',
        description: 'Sourcing / onboarding / performance-review templates for tradespeople.',
        task_type: 'llm',
        estimated_tokens: 4000,
        sort_order: 8,
        depends_on: ['t5'],
        prompt: 'Build the vendor-management playbook: (1) sourcing — what to look for in a tradesperson per category (plumber / electrician / cleaner / handyman / specialist), (2) onboarding — what documents to collect (insurance / certifications / rates), (3) job-card template, (4) performance-review rubric (quality / timeliness / communication / price), (5) when to part ways.',
      },
      {
        local_id: 't9',
        title: 'Final checkpoint — sign off operating model',
        description: 'Human signs off the full property-management operating model.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 9,
        depends_on: ['t6', 't7', 't8'],
        checkpoint_message: 'Full property-management operating model ready. Sign off to deliver the playbook bundle to your Mission Inbox.',
      },
      {
        local_id: 't10',
        title: 'Deliver playbook bundle',
        description: 'Final delivery to Mission Inbox.',
        task_type: 'notification',
        estimated_tokens: 0,
        sort_order: 10,
        depends_on: ['t9'],
        prompt: 'Deliver the full property-management operating model bundle to the Mission Inbox. Include a "first 90 days" implementation checklist as the cover.',
      },
    ],
  },
  default_data_scope: {},
  default_budget: {
    token_budget_max: 700_000,
    time_budget_max_seconds: 30 * 24 * 60 * 60,
    time_active_max_seconds: 3 * 60 * 60,
  },
  default_autonomy_level: 'check_in',
  success_criteria_template:
    'Deliver a property-management operating model that: (a) addresses every lifecycle phase from listing to move-out, (b) is keyed to the supplied jurisdiction with honest acknowledgement of regulatory-currency limits, (c) gives the operator runnable templates rather than generic principles.',
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

// ── Trend Scout ─────────────────────────────────────────────────────────────
// Standard-complexity intelligence mission: domain framing → source map →
// signal scoring rubric → baseline scan → pattern analysis → briefing
// template. v1 produces the scouting playbook + initial baseline; v2 will
// integrate the Radar pillar for continuous source monitoring.

const TREND_SCOUT_TEMPLATE: MissionTemplate = {
  id: 'tmpl_trend_scout_v1',
  name: 'Trend Scout',
  description:
    'Stand up a structured trend-watching capability: domain framing → source map → signal scoring rubric → baseline scan → pattern analysis → briefing template. v1 delivers the scouting playbook + an initial baseline. v2 (planned) will integrate the Radar pillar for continuous source monitoring.',
  pillar: 'work',
  category: 'intelligence',
  version: '1.0.0',
  author: 'ANTON',
  parameters_schema: [
    {
      key: 'domains',
      label: 'Domains to watch',
      type: 'textarea',
      required: true,
      help: 'Fields, sectors, or themes to monitor. Be specific — "AI regulation in the EU" is better than "AI regulation". Multiple domains = a richer cross-pattern picture.',
    },
    {
      key: 'signal_threshold',
      label: 'Signal sensitivity',
      type: 'select',
      required: true,
      options: ['low', 'medium', 'high'],
      default: 'medium',
      help: 'low = report only major shifts; medium = report patterns + meaningful single signals; high = report all signals worth noting (more noise).',
    },
    {
      key: 'sources',
      label: 'Preferred sources (optional)',
      type: 'textarea',
      required: false,
      help: 'Sources you already trust — URLs, publications, accounts, RSS feeds. ANTON will use these as the spine of the source map.',
    },
    {
      key: 'report_cadence',
      label: 'Report cadence',
      type: 'select',
      required: true,
      options: ['daily', 'weekly', 'monthly'],
      default: 'weekly',
      help: 'How often the scouting digest runs.',
    },
    {
      key: 'audience_brief',
      label: 'Audience',
      type: 'string',
      required: true,
      help: 'Who reads the output? e.g. "myself", "the leadership team", "external client". Shapes tone and length.',
    },
  ],
  task_graph_template: {
    tasks: [
      {
        local_id: 't1',
        title: 'Domain framing',
        description: 'Decompose the named domains into 5-8 watchable sub-themes.',
        task_type: 'llm',
        estimated_tokens: 4000,
        sort_order: 1,
        depends_on: [],
        prompt: 'Decompose the named domains into 5-8 watchable sub-themes. Each sub-theme should be specific enough that a single signal can be assigned to it without ambiguity. Output as a Markdown list with one sentence rationale per sub-theme.',
      },
      {
        local_id: 't2',
        title: 'Source map',
        description: 'For each sub-theme, identify high-signal sources across categories.',
        task_type: 'analysis',
        estimated_tokens: 6000,
        sort_order: 2,
        depends_on: ['t1'],
        prompt: 'For each sub-theme from t1, identify high-signal sources across: (1) academic / research, (2) industry / trade press, (3) news / mainstream, (4) social / individual experts, (5) regulatory / official. For each source, note: type, signal-to-noise estimate (high / medium / low), refresh cadence. Build on the user\'s preferred sources where supplied.',
      },
      {
        local_id: 't3',
        title: 'Signal scoring rubric',
        description: 'What counts as a meaningful signal — thresholds + criteria — adapted to signal_threshold.',
        task_type: 'llm',
        estimated_tokens: 4000,
        sort_order: 3,
        depends_on: ['t1'],
        prompt: 'Design the signal-scoring rubric. Cover: (1) what makes a signal worth reporting (novelty / corroboration / source credibility / magnitude / proximity-to-decision), (2) the threshold for the supplied signal_threshold (low = only major shifts; medium = patterns + meaningful singles; high = all worth-noting), (3) the explicit dismiss criteria (what looks like a signal but isn\'t). Output as a Markdown scorecard.',
      },
      {
        local_id: 't4',
        title: 'Baseline scan',
        description: 'Initial pass on current signals against each sub-theme using ANTON\'s knowledge.',
        task_type: 'analysis',
        estimated_tokens: 10000,
        sort_order: 4,
        depends_on: ['t2', 't3'],
        prompt: 'Run a baseline scan: for each sub-theme, what signals are visible to you right now? Score each against the rubric. Be honest about knowledge-cutoff limits — flag where your information is potentially stale. Output as a Markdown table: sub-theme | signal | source-type | score | confidence | notes.',
      },
      {
        local_id: 't5',
        title: 'Pattern analysis',
        description: 'Cross-reference sub-themes for emerging convergence — signals that gain weight together.',
        task_type: 'llm',
        estimated_tokens: 6000,
        sort_order: 5,
        depends_on: ['t4'],
        prompt: 'Cross-reference the baseline signals across sub-themes. Identify emerging patterns where signals reinforce each other. For each pattern: name it, list contributing signals, score its probability + impact, name what would confirm / contradict it. This is the highest-value output of the mission — surface patterns the audience couldn\'t see by reading the same sources individually.',
      },
      {
        local_id: 't6',
        title: 'Checkpoint — review watchlist + rubric',
        description: 'Human approves sub-themes + sources + scoring rubric before the briefing format is locked.',
        task_type: 'checkpoint',
        estimated_tokens: 0,
        sort_order: 6,
        depends_on: ['t2', 't3', 't5'],
        checkpoint_message: 'Watchlist is ready: sub-themes + sources + scoring rubric + baseline + patterns. Approve to design the recurring briefing template, or send back specific sub-themes to refine.',
      },
      {
        local_id: 't7',
        title: 'Briefing template',
        description: 'Recurring report format keyed to the supplied audience + cadence.',
        task_type: 'llm',
        estimated_tokens: 4000,
        sort_order: 7,
        depends_on: ['t6'],
        prompt: 'Design the recurring briefing template adapted to audience_brief + report_cadence. Sections: (1) headline (1 sentence — the single most important thing this period), (2) what changed (3-5 bullets), (3) emerging patterns (the cross-cutting view), (4) honest gaps (what we didn\'t see clearly), (5) recommended action / watch items. Match length + tone to audience.',
      },
      {
        local_id: 't8',
        title: 'Deliver scouting playbook + baseline',
        description: 'Final delivery: watchlist + scoring rubric + baseline scan + pattern analysis + briefing template.',
        task_type: 'notification',
        estimated_tokens: 0,
        sort_order: 8,
        depends_on: ['t7'],
        prompt: 'Deliver the full scouting playbook bundle to the Mission Inbox: watchlist, source map, scoring rubric, baseline scan, pattern analysis, briefing template. Include a "how to run this on each cadence" one-page guide as the cover.',
      },
    ],
  },
  default_data_scope: {},
  default_budget: {
    token_budget_max: 400_000,
    time_budget_max_seconds: 14 * 24 * 60 * 60,
    time_active_max_seconds: 60 * 60,
  },
  default_autonomy_level: 'check_in',
  success_criteria_template:
    'Deliver a trend-scouting capability that: (a) is structured enough to be re-run each period without ANTON re-thinking the rubric, (b) surfaces emerging patterns the audience couldn\'t see by reading the same sources individually, (c) is honest about knowledge-cutoff and source-coverage limits.',
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

/**
 * Seed built-in mission templates. Idempotent — uses ON CONFLICT DO NOTHING
 * via insertTemplate so re-running the seeder is safe.
 */
export async function seedBuiltinTemplates(db: DatabaseAdapter): Promise<{ seeded: number }> {
  const state = createMissionState(db);
  const templates: MissionTemplate[] = [
    KNOWLEDGE_SYNTHESIS_TEMPLATE,
    AMLR_READINESS_TEMPLATE,
    CONTENT_FACTORY_TEMPLATE,
    OUTBOUND_SALES_TEMPLATE,
    OUTBOUND_SALES_V2_TEMPLATE,
    ECOMMERCE_AUTOPILOT_TEMPLATE,
    FINANCIAL_ANALYST_TEMPLATE,
    AI_AGENCY_TEMPLATE,
    PROPERTY_MANAGER_TEMPLATE,
    TREND_SCOUT_TEMPLATE,
  ];
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
