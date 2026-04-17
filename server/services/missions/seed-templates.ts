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

/**
 * Seed built-in mission templates. Idempotent — uses ON CONFLICT DO NOTHING
 * via insertTemplate so re-running the seeder is safe.
 */
export async function seedBuiltinTemplates(db: DatabaseAdapter): Promise<{ seeded: number }> {
  const state = createMissionState(db);
  const templates: MissionTemplate[] = [KNOWLEDGE_SYNTHESIS_TEMPLATE];
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
