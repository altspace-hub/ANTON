/**
 * evidence-pack-collector.test.ts — Wave 3, "the evidence pack walks the real
 * surface".
 *
 * Proves, against a fake database keyed on SQL shape:
 *   - the session scope now emits run_artifact / quality_score /
 *     oversight_review / session_export items, each hashed with the same
 *     canonical-JSON scheme as the April item types (whose bodies and hashes
 *     are unchanged, so packs assembled before this wave still verify);
 *   - includePrompts:false omits the composed prompt text but keeps
 *     prompt_sha256 + prompt_chars; includePrompts:true carries the text;
 *   - migration 273's optional review columns are included when present and
 *     tolerated when absent;
 *   - the gap_assessment, engagement, task and custom scopes collect;
 *   - the assembler's manifest hash recomputes exactly as the offline
 *     verifiers do (canonicalise + pinned created.at), the instance Ed25519
 *     signature over it verifies with node:crypto the way verifier.cjs does,
 *     and re-assembling a finalised pack never overwrites its signed hash;
 *   - the compliance mapper credits the new item types where mapped and
 *     leaves the unmapped points alone.
 */
import { describe, it, expect, vi } from 'vitest';
import { createHash, createPublicKey, verify as edVerify } from 'node:crypto';

import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  collectForScope, canonicalise, redactEvidenceTexts, scopeToCustomItem,
  type CollectedItem, type ScopeDefinition,
} from '../../server/services/evidence-pack/collector.js';
import { assemblePack, finalisePack, type AssembledPack, type PackRow } from '../../server/services/evidence-pack/assembler.js';
import { mapCompliance } from '../../server/services/evidence-pack/compliance-mapper.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hashOf = (payload: unknown) => 'sha256:' + sha(canonicalise(payload));

const SESSION = {
  id: 'sess-1', module_id: 'fcp-model-validation', title: 'TM model validation Q3', summary: null,
  project_id: null, user_id: 'u1', review_status: 'draft', reviewed_by: null, reviewed_at: null,
  created_at: '2026-09-10T10:00:00.000Z', updated_at: '2026-09-10T10:05:00.000Z', config: '{}',
};
const USER_MSG = {
  id: 'msg-u', session_id: 'sess-1', role: 'user', content: 'Validate the TM model.',
  thinking_content: null, content_blocks: null, token_count: 12, cost: null, model_id: null,
  config_snapshot: null, created_at: '2026-09-10T10:00:01.000Z',
};
const SNAPSHOT = {
  model: 'sdk:claude-opus-5', engine: 'sdk', effort: 'high', modelServed: 'claude-opus-5-20260801',
  costBasis: 'plan', engineCostUsd: null, thinking: 'think_hard',
  modulePromptVersionId: 'pv-module-7', modulePromptVersion: 7, modulePromptSha256: 'ab'.repeat(32),
  foundationVersionId: 'pv-foundation-2', guardrailApplied: true, provenanceContract: true,
  mergedSkills: ['citations'], userTurnSha256: sha('Validate the TM model.'),
  selectedOutputFormats: ['detailed-findings'], systemPrompt: 'SECRET MODULE PROMPT TEXT',
};
const ASSISTANT_MSG = {
  id: 'msg-a', session_id: 'sess-1', role: 'assistant', content: '# Findings\n…',
  thinking_content: 'Reasoning…', content_blocks: null, token_count: 900, cost: null,
  model_id: 'sdk:claude-opus-5', config_snapshot: JSON.stringify(SNAPSHOT),
  created_at: '2026-09-10T10:04:00.000Z',
};
const COMPOSED_PROMPT = 'You are an FCP model validation expert. CLIENT DOCUMENT: confidential text.';
const ARTIFACT = {
  id: 'ra-1', message_id: 'msg-a', session_id: 'sess-1',
  composed_prompt: COMPOSED_PROMPT, prompt_sha256: sha(COMPOSED_PROMPT), prompt_chars: COMPOSED_PROMPT.length,
  truncated: false,
  layer_summary: [{ layer: 'composed_full', chars: COMPOSED_PROMPT.length, sha256: sha(COMPOSED_PROMPT) }],
  source_manifest: [{ type: 'uploaded_file', name: 'policy.md', sha256: 'cd'.repeat(32), charCount: 1200, contentHashed: true }],
  created_at: '2026-09-10T10:04:01.000Z',
};
const QUALITY_RUN = {
  id: 'qs-run', session_id: 'sess-1', module_id: 'fcp-model-validation', area_id: 'fcp',
  content_hash: 'ef'.repeat(8), score_overall: 8.4, score_completeness: 8, score_accuracy: 9,
  score_structure: 8, score_actionability: 8, score_citations: 9, word_count: 1400,
  score_reasoning: null, scored_at: '2026-09-10T10:04:30.000Z', scored_by: 'system',
  model_used: 'sdk:claude-sonnet-5', notes: null, origin: 'run',
};
const REVIEW_BASE = {
  id: 3, session_id: 'sess-1', module_id: 'fcp-model-validation', user_id: 'u1',
  reviewer_name: 'A. Reviewer', reviewer_role: 'MLRO', attestation: 'I have read the output in full.',
  verdict: 'approved', notes: null, export_blocked: 0, created_at: '2026-09-10T11:00:00.000Z',
};
const REVIEW_273 = {
  ...REVIEW_BASE, message_id: 'msg-a', prompt_sha256: sha(COMPOSED_PROMPT),
  output_sha256: sha('# Findings\n…'), evidence_pack_id: null,
};
const EXPORT = {
  id: 'ex-1', session_id: 'sess-1', module_id: 'fcp-model-validation', format: 'docx',
  version: 1, content_hash: 'ec394cc0372c542a', exported_at: '2026-09-10T11:30:00.000Z', exported_by: 'u1',
};
const AUDIT = {
  id: 'al-1', timestamp: '2026-09-10T10:04:00.000Z', session_id: 'sess-1', module_id: 'fcp-model-validation',
  area_id: 'fcp', model: 'sdk:claude-opus-5', provider: 'sdk', thinking_level: 'think_hard',
  input_token_count: 5000, output_token_count: 900, cached_tokens: 0, cache_creation_tokens: 0,
  estimated_cost_usd: null, response_status: 'ok', review_status: 'draft', reviewed_by: null,
  reviewed_at: null, seed: null, system_prompt_version_id: 'pv-module-7', user_id: 'u1',
  knowledge_sources_used: null, rag_chunks: null, created_at: '2026-09-10T10:04:00.000Z',
};

interface FakeDbOptions {
  /** Which shape human_oversight_reviews rows have: before or after migration 273. */
  reviewShape?: 'base' | '273';
  /** Extra tables for the other scopes. */
  gap?: boolean;
  engagement?: boolean;
  task?: boolean;
}

/**
 * A database that answers by SQL shape. Every query the collector issues is
 * matched on its FROM clause (and the parameter for the id); anything
 * unknown returns nothing, so a walker that starts reading a table this test
 * does not model surfaces as a missing item rather than a crash.
 */
function makeFakeDb(opts: FakeDbOptions = {}): { db: DatabaseAdapter; queries: string[] } {
  const queries: string[] = [];
  const reviewRow = opts.reviewShape === '273' ? REVIEW_273 : REVIEW_BASE;

  async function get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    queries.push(sql);
    const id = params[0];
    const r = (v: unknown) => v as T | undefined;
    if (sql.includes('FROM sessions WHERE id = ?')) return id === 'sess-1' ? r(SESSION) : undefined;
    if (sql.includes('FROM run_artifacts WHERE message_id = ?')) {
      if (id !== 'msg-a') return undefined;
      // Honour the column projection the collector asked for.
      return r(sql.includes('NULL AS composed_prompt') ? { ...ARTIFACT, composed_prompt: null } : ARTIFACT);
    }
    if (sql.includes('FROM gap_assessments WHERE id = ?')) return opts.gap && id === 'ga-1' ? r(GAP) : undefined;
    if (sql.includes('FROM engagements WHERE id = ?')) return opts.engagement && id === 'eng-1' ? r(ENGAGEMENT) : undefined;
    if (sql.includes('FROM anton_tasks WHERE id = ?')) return opts.task && id === 'task-1' ? r(TASK) : undefined;
    if (sql.includes('FROM missions.missions WHERE id = ?')) return undefined;   // linked mission gone
    return undefined;
  }
  async function all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    queries.push(sql);
    const id = params[0];
    const rows = (v: unknown[]) => v as T[];
    if (sql.includes('FROM messages WHERE session_id = ?')) return id === 'sess-1' ? rows([USER_MSG, ASSISTANT_MSG]) : [];
    if (sql.includes('FROM audit_log WHERE session_id = ?')) return id === 'sess-1' ? rows([AUDIT]) : [];
    if (sql.includes('FROM versions')) return [];
    if (sql.includes('FROM quality_scores WHERE session_id = ?')) {
      // The fake honours the origin filter the way the real table would: an
      // orphan row exists for this session and must never come back.
      if (!sql.includes("origin = 'run'")) return rows([QUALITY_RUN, { ...QUALITY_RUN, id: 'qs-orphan', origin: 'orphan' }]);
      return id === 'sess-1' ? rows([QUALITY_RUN]) : [];
    }
    if (sql.includes('FROM human_oversight_reviews WHERE session_id = ?')) return id === 'sess-1' ? rows([reviewRow]) : [];
    if (sql.includes('FROM session_exports WHERE session_id = ?')) return id === 'sess-1' ? rows([EXPORT]) : [];
    if (sql.includes('FROM gap_finding_opinions WHERE assessment_id = ?')) return opts.gap ? rows([OPINION]) : [];
    if (sql.includes('FROM gap_findings WHERE assessment_id = ?')) return opts.gap ? rows([FINDING]) : [];
    if (sql.includes('FROM gap_iterations WHERE assessment_id = ?')) return opts.gap ? rows([GAP_ITERATION]) : [];
    if (sql.includes('FROM engagement_workstreams WHERE engagement_id = ?')) return opts.engagement ? rows([WORKSTREAM]) : [];
    if (sql.includes('FROM engagement_iterations WHERE engagement_id = ?')) return opts.engagement ? rows([ENG_ITERATION]) : [];
    return [];
  }
  const db: DatabaseAdapter = {
    dialect: 'postgresql',
    get, all,
    async run(): Promise<RunResult> { throw new Error('collector must never write'); },
    async exec() { throw new Error('collector must never write'); },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, queries };
}

// Gap assessment fixtures — context_config carries the evidence document texts.
const POLICY_TEXT = 'Our AML policy mandates KYC at onboarding and a risk-based CDD refresh.';
const GAP = {
  id: 'ga-1', title: 'AMLR readiness — ICA Banken', frameworks: JSON.stringify(['amlr']),
  scope_config: '{"articles":["9","10"]}',
  context_config: JSON.stringify({
    entityType: 'Credit institution', jurisdiction: 'Sweden', modelTier: 'opus',
    documents: 'legacy blob of documents',
    evidenceItems: [{ name: 'AML Policy', kind: 'document', text: POLICY_TEXT }],
  }),
  status: 'complete', current_step: 8, article_scores: '{"amlr:9":75}', capability_view: null,
  board_summary: null, roadmap: null, session_id: null, user_id: 'u1',
  created_at: '2026-09-01T09:00:00.000Z', updated_at: '2026-09-02T09:00:00.000Z',
  synthesis_reasoning: null, board_reasoning: null, roadmap_reasoning: null,
  batch_reasoning: '--- Batch 1/1 ---\nreasoning', evidence_manifest: [{ docId: `doc-${sha(POLICY_TEXT).slice(0, 8)}`, name: 'AML Policy', sha256: sha(POLICY_TEXT), chars: POLICY_TEXT.length, kind: 'document' }],
};
const FINDING = {
  id: 41, assessment_id: 'ga-1', framework: 'amlr', article_id: '9', article_title: 'Internal policies',
  requirement: 'Policies approved by the board', current_state: 'Approved v7.0', score: 'green',
  numeric_score: 90, priority: 'low', notes: null, created_at: '2026-09-01T09:30:00.000Z',
  facts: { policy_exists: true, board_approved: true }, rubric_version: 2, computed_score: 'green',
  computed_numeric_score: 90, computed_priority: 'low', overridden_by: 'u1', override_reason: 'Board minutes seen',
  overridden_at: '2026-09-01T10:00:00.000Z', override_kind: 'facts', carried_forward: false, change_reason: null,
};
const OPINION = {
  id: 7, assessment_id: 'ga-1', framework: 'amlr', article_id: '9', article_title: 'Internal policies',
  model_id: 'mistral-large-latest', facts: { policy_exists: true, board_approved: false }, computed_score: 'amber',
  computed_numeric_score: 55, computed_priority: 'medium', rubric_version: 2, rationale: 'No minutes cited.',
  current_state: 'Policy exists', evidence_refs: [{ docId: 'doc-1', quote: 'mandates KYC' }], warnings: [],
  created_at: '2026-09-02T09:00:00.000Z',
};
const GAP_ITERATION = {
  id: 'gi-1', assessment_id: 'ga-1', iteration_number: 1, status: 'complete',
  context_snapshot: JSON.stringify({ documents: 'legacy blob of documents' }), evidence_summary: null,
  findings_snapshot: '[]', capability_snapshot: null, board_snapshot: null, roadmap_snapshot: null,
  score_summary: '{"avg":90}', notes: null, created_at: '2026-09-01T12:00:00.000Z', created_by: 'u1',
  synthesis_reasoning: null, board_reasoning: null, roadmap_reasoning: null,
};

// Engagement fixtures — one iteration bridged into sess-1.
const ENGAGEMENT = {
  id: 'eng-1', project_id: null, title: 'TM tuning engagement', engagement_type: 'full', status: 'review',
  your_organisation: 'ANTON Advisory', client_name: 'Client Bank', domain_areas: '["fcp"]',
  engagement_brief: '{"objective":"Tune TM"}', quality_blueprint: '{}', thinking_level: 'think_hard',
  expert_panel: '[]', review_modes: '[]', knowledge_config: '{}', scope_confirmed_at: '2026-09-05T08:00:00.000Z',
  enable_as_benchmark: 0, workstream_plan_confirmed: 1, rag_directory_path: null, user_id: 'u1',
  created_at: '2026-09-04T08:00:00.000Z', updated_at: '2026-09-10T10:05:00.000Z', exec_model: 'sdk:claude-opus-5',
  intake_conversation: JSON.stringify([{ role: 'assistant', content: 'What is the engagement about?' }, { role: 'user', content: 'TM tuning.' }]),
  completed_at: null,
};
const WORKSTREAM = {
  id: 'ws-1', engagement_id: 'eng-1', title: 'Scenario review', description: null, expert_panel: '[]',
  thinking_level: null, timeline_start: null, timeline_end: null, execution_status: 'review',
  dependencies: '[]', sort_order: 0, created_at: '2026-09-05T08:10:00.000Z',
};
const ENG_ITERATION = {
  id: 'it-1', engagement_id: 'eng-1', workstream_id: 'ws-1', iteration_number: 1, output_content: '# Scenario review',
  confidence_assessment: '{}', gap_analysis: '[]', scope_creep_flags: '[]', resources_used: '["doc-1"]',
  expert_reviews: '{}', quality_scores: '{}', status: 'reviewed', thinking_content: 'thinking…',
  created_at: '2026-09-10T10:04:00.000Z', session_id: 'sess-1',
};

// Task fixtures — two executed steps, one with tool calls, and a linked mission that no longer exists.
const TASK = {
  id: 'task-1', user_id: 'solo', title: 'Draft the STR narrative', description: 'Write it.', status: 'completed',
  source: 'manual', source_ref: null, priority: 'normal', conversation: '[{"role":"user","content":"Draft it"}]',
  proposals: '[]', chosen_approach_id: null, chosen_approach_config: null, clarifying_questions: '[]',
  clarifying_answers: '[]', execution_run_ids: '[]', execution_summary: 'Done', intake_answers: '{}',
  execution_results: JSON.stringify([
    { step: 0, name: 'Gather facts', output: 'facts…', at: '2026-09-11T09:00:00.000Z', quality_score: 8.2, thinking: 't', source: 'task_agent',
      tool_calls: [{ name: 'WebSearch', input: { q: 'x' }, ms: 1200, is_error: false, output_preview: 'preview' }] },
    { step: 1, name: 'Write narrative', output: 'narrative…', at: '2026-09-11T09:05:00.000Z', quality_score: null },
  ]),
  current_step: 2, intake_ready: 1, task_files: '[]', active_knowledge_packs: '[]', tags: '[]', due_date: null,
  completed_at: '2026-09-11T09:06:00.000Z', created_at: '2026-09-11T08:00:00.000Z', updated_at: '2026-09-11T09:06:00.000Z',
  linked_mission_id: 'mission-gone',
};

const byType = (items: CollectedItem[], type: string) => items.filter((i) => i.itemType === type);
const bodyOf = (item: CollectedItem) => JSON.parse(item.canonicalJson) as Record<string, unknown>;

// ── Session scope ─────────────────────────────────────────────────────────────

describe('session scope walks the real surface', () => {
  it('emits run_artifact / quality_score / oversight_review / session_export with canonical hashes', async () => {
    const { db } = makeFakeDb();
    const { items } = await collectForScope(db, { type: 'session', sessionId: 'sess-1' });

    const types = items.map((i) => i.itemType);
    expect(types).toEqual(expect.arrayContaining(['session', 'message', 'audit_log', 'run_artifact', 'quality_score', 'oversight_review', 'session_export']));

    // Every item hash is sha256 over its canonical body — the same scheme as the April types.
    for (const item of items) expect(item.itemHash).toBe(hashOf(JSON.parse(item.canonicalJson)));

    const [ra] = byType(items, 'run_artifact');
    expect(ra.itemTable).toBe('run_artifacts');
    expect(ra.itemId).toBe('ra-1');
    const body = bodyOf(ra);
    expect(body.message_id).toBe('msg-a');
    expect(body.prompt_sha256).toBe(sha(COMPOSED_PROMPT));
    expect(body.prompt_chars).toBe(COMPOSED_PROMPT.length);
    expect(body.layer_summary).toEqual(ARTIFACT.layer_summary);
    expect(body.source_manifest).toEqual(ARTIFACT.source_manifest);
    expect(body.message_model_id).toBe('sdk:claude-opus-5');
    expect(ra.regulatoryRelevance).toEqual(['eu_ai_act.art_12', 'eu_ai_act.art_13']);

    const [qs] = byType(items, 'quality_score');
    expect(qs.itemId).toBe('qs-run');
    expect(bodyOf(qs).origin).toBe('run');
    expect(qs.regulatoryRelevance).toContain('eu_ai_act.art_15');

    const [rv] = byType(items, 'oversight_review');
    expect(rv.itemId).toBe('3');
    expect(bodyOf(rv).verdict).toBe('approved');
    expect(rv.regulatoryRelevance).toContain('eu_ai_act.art_14');
    expect(rv.itemSummary).toContain('A. Reviewer');

    const [ex] = byType(items, 'session_export');
    expect(ex.itemId).toBe('ex-1');
    expect(bodyOf(ex)).toEqual(EXPORT);
    expect(ex.regulatoryRelevance).toContain('amlr.auditability');
  });

  it('extracts the provenance fields of the message config snapshot onto the run record', async () => {
    const { db } = makeFakeDb();
    const { items } = await collectForScope(db, { type: 'session', sessionId: 'sess-1' });
    const provenance = bodyOf(byType(items, 'run_artifact')[0]).provenance as Record<string, unknown>;
    expect(provenance).toMatchObject({
      engine: 'sdk', effort: 'high', modelServed: 'claude-opus-5-20260801', costBasis: 'plan',
      modulePromptVersionId: 'pv-module-7', foundationVersionId: 'pv-foundation-2',
      guardrailApplied: true, provenanceContract: true, mergedSkills: ['citations'],
      userTurnSha256: sha('Validate the TM model.'),
    });
    // Only the provenance keys — the snapshot's system prompt override does not ride along.
    expect(provenance).not.toHaveProperty('systemPrompt');
    expect(provenance).not.toHaveProperty('selectedOutputFormats');
  });

  it('includePrompts:false omits the composed prompt but keeps its hash; includePrompts:true carries it', async () => {
    const closed = makeFakeDb();
    const withoutPrompts = await collectForScope(closed.db, { type: 'session', sessionId: 'sess-1' });
    const closedBody = bodyOf(byType(withoutPrompts.items, 'run_artifact')[0]);
    expect(closedBody.prompt_included).toBe(false);
    expect(closedBody.composed_prompt).toBeNull();
    expect(closedBody.prompt_sha256).toBe(sha(COMPOSED_PROMPT));
    expect(closedBody.prompt_chars).toBe(COMPOSED_PROMPT.length);
    expect(String(closedBody.prompt_omitted_reason)).toMatch(/prompt_sha256/);
    expect(withoutPrompts.items.some((i) => i.canonicalJson.includes('confidential text'))).toBe(false);
    // The prompt column was not even read.
    const artifactSql = closed.queries.find((q) => q.includes('FROM run_artifacts'));
    expect(artifactSql).toContain('NULL AS composed_prompt');

    const open = makeFakeDb();
    const withPrompts = await collectForScope(open.db, { type: 'session', sessionId: 'sess-1', includePrompts: true });
    const openBody = bodyOf(byType(withPrompts.items, 'run_artifact')[0]);
    expect(openBody.prompt_included).toBe(true);
    expect(openBody.composed_prompt).toBe(COMPOSED_PROMPT);
    expect(openBody.prompt_omitted_reason).toBeNull();
    expect(open.queries.find((q) => q.includes('FROM run_artifacts'))).not.toContain('NULL AS composed_prompt');

    // The switch changes the run record's hash and nothing else.
    const hashes = (r: CollectedItem[]) => Object.fromEntries(r.filter((i) => i.itemType !== 'run_artifact').map((i) => [`${i.itemType}:${i.itemId}`, i.itemHash]));
    expect(hashes(withoutPrompts.items)).toEqual(hashes(withPrompts.items));
    expect(closedBody).not.toEqual(openBody);
  });

  it('reads only origin = run quality scores', async () => {
    const { db, queries } = makeFakeDb();
    const { items } = await collectForScope(db, { type: 'session', sessionId: 'sess-1' });
    expect(byType(items, 'quality_score').map((i) => i.itemId)).toEqual(['qs-run']);
    expect(queries.find((q) => q.includes('FROM quality_scores'))).toContain("origin = 'run'");
  });

  it('includes migration 273 review columns when present and tolerates their absence', async () => {
    const before = await collectForScope(makeFakeDb({ reviewShape: 'base' }).db, { type: 'session', sessionId: 'sess-1' });
    const baseBody = bodyOf(byType(before.items, 'oversight_review')[0]);
    expect(baseBody).not.toHaveProperty('message_id');
    expect(baseBody).not.toHaveProperty('prompt_sha256');

    const after = await collectForScope(makeFakeDb({ reviewShape: '273' }).db, { type: 'session', sessionId: 'sess-1' });
    const fullBody = bodyOf(byType(after.items, 'oversight_review')[0]);
    expect(fullBody).toMatchObject({ message_id: 'msg-a', prompt_sha256: sha(COMPOSED_PROMPT), output_sha256: sha('# Findings\n…'), evidence_pack_id: null });
    // Same reviewer verdict, richer row → different hash, both self-consistent.
    expect(byType(after.items, 'oversight_review')[0].itemHash).not.toBe(byType(before.items, 'oversight_review')[0].itemHash);
  });

  it('keeps the April item bodies and hashes unchanged (old packs still verify)', async () => {
    const { db } = makeFakeDb();
    const { items } = await collectForScope(db, { type: 'session', sessionId: 'sess-1' });
    // The legacy types hash the raw row exactly as before — the message keeps
    // its config_snapshot string, the session its config, the audit row its columns.
    expect(byType(items, 'session')[0].itemHash).toBe(hashOf(SESSION));
    expect(byType(items, 'message').find((i) => i.itemId === 'msg-a')!.itemHash).toBe(hashOf(ASSISTANT_MSG));
    expect(byType(items, 'audit_log')[0].itemHash).toBe(hashOf(AUDIT));
    expect(byType(items, 'message').find((i) => i.itemId === 'msg-a')!.regulatoryRelevance).toEqual(['eu_ai_act.art_12', 'eu_ai_act.art_13']);
  });
});

// ── New scopes ────────────────────────────────────────────────────────────────

describe('gap_assessment scope', () => {
  it('collects the assessment, findings, second opinions and iterations, naming the models', async () => {
    const { db } = makeFakeDb({ gap: true });
    const { items, scopeLabel } = await collectForScope(db, { type: 'gap_assessment', assessmentId: 'ga-1' });
    expect(scopeLabel).toContain('1 finding(s), 1 second opinion(s), 1 iteration(s)');

    const [ga] = byType(items, 'gap_assessment');
    const body = bodyOf(ga);
    expect(body.models).toEqual({
      primary_model_tier: 'opus',
      primary_model_tier_source: 'context_config.modelTier (default sonnet when unset)',
      opinion_model_ids: ['mistral-large-latest'],
    });
    expect(body.frameworks).toEqual(['amlr']);
    expect(body.evidence_manifest).toEqual(GAP.evidence_manifest);
    expect(ga.regulatoryRelevance).toEqual(['eu_ai_act.art_12', 'amlr.art_21', 'amlr.auditability']);
    expect(String(body.hash_basis)).toMatch(/computed at collection/);

    const [f] = byType(items, 'gap_finding');
    expect(f.itemId).toBe('41');
    expect(bodyOf(f).facts).toEqual(FINDING.facts);
    expect(f.regulatoryRelevance).toEqual(['eu_ai_act.art_12', 'eu_ai_act.art_13', 'eu_ai_act.art_14', 'amlr.art_21']);

    const [o] = byType(items, 'gap_finding_opinion');
    expect(o.itemId).toBe('7');
    expect(bodyOf(o).model_id).toBe('mistral-large-latest');
    expect(o.regulatoryRelevance).toContain('eu_ai_act.art_15');

    const [it] = byType(items, 'gap_iteration');
    expect(it.itemId).toBe('gi-1');
    expect(bodyOf(it).score_summary).toEqual({ avg: 90 });

    for (const item of items) expect(item.itemHash).toBe(hashOf(JSON.parse(item.canonicalJson)));
  });

  it('withholds evidence document texts unless includePrompts, keeping their sha256', async () => {
    const closed = await collectForScope(makeFakeDb({ gap: true }).db, { type: 'gap_assessment', assessmentId: 'ga-1' });
    const closedCfg = bodyOf(byType(closed.items, 'gap_assessment')[0]).context_config as Record<string, unknown>;
    expect(closedCfg.documents).toEqual({ omitted: true, sha256: sha('legacy blob of documents'), chars: 'legacy blob of documents'.length });
    const closedItems = closedCfg.evidenceItems as Array<Record<string, unknown>>;
    expect(closedItems[0].text).toEqual({ omitted: true, sha256: sha(POLICY_TEXT), chars: POLICY_TEXT.length });
    expect(closedItems[0].name).toBe('AML Policy');
    expect(closedCfg.modelTier).toBe('opus');
    expect(closed.items.some((i) => i.canonicalJson.includes(POLICY_TEXT))).toBe(false);
    const closedIter = bodyOf(byType(closed.items, 'gap_iteration')[0]).context_snapshot as Record<string, unknown>;
    expect(closedIter.documents).toMatchObject({ omitted: true });

    const open = await collectForScope(makeFakeDb({ gap: true }).db, { type: 'gap_assessment', assessmentId: 'ga-1', includePrompts: true });
    const openCfg = bodyOf(byType(open.items, 'gap_assessment')[0]).context_config as Record<string, unknown>;
    expect((openCfg.evidenceItems as Array<Record<string, unknown>>)[0].text).toBe(POLICY_TEXT);
    expect(openCfg.documents).toBe('legacy blob of documents');
  });

  it('redactEvidenceTexts leaves non-text fields alone', () => {
    expect(redactEvidenceTexts(null)).toBeNull();
    expect(redactEvidenceTexts({ entityType: 'Bank', documents: '' })).toEqual({ entityType: 'Bank', documents: '' });
    expect(redactEvidenceTexts({ evidenceItems: [null, 'x', { name: 'no text' }] })).toEqual({ evidenceItems: [null, 'x', { name: 'no text' }] });
  });
});

describe('engagement scope', () => {
  it('collects the engagement, workstreams, iterations and the sessions the iterations were bridged into', async () => {
    const { db } = makeFakeDb({ engagement: true });
    const { items, scopeLabel } = await collectForScope(db, { type: 'engagement', engagementId: 'eng-1' });
    expect(scopeLabel).toContain('1 workstream(s), 1 iteration(s)');

    const [eng] = byType(items, 'engagement');
    const body = bodyOf(eng);
    expect(body.intake_conversation).toEqual(JSON.parse(ENGAGEMENT.intake_conversation));
    expect(body.exec_model).toBe('sdk:claude-opus-5');
    expect(body.engagement_brief).toEqual({ objective: 'Tune TM' });
    expect(eng.regulatoryRelevance).toEqual(['eu_ai_act.art_12', 'eu_ai_act.art_14']);   // scope confirmed by a human

    expect(byType(items, 'engagement_workstream').map((i) => i.itemId)).toEqual(['ws-1']);
    const [it] = byType(items, 'engagement_iteration');
    expect(it.itemId).toBe('it-1');
    expect(it.regulatoryRelevance).toEqual(['eu_ai_act.art_12', 'eu_ai_act.art_13', 'eu_ai_act.art_14']);
    expect(it.itemSummary).toContain('bridged to session');

    // The bridged session came along with its run record, review and export.
    expect(byType(items, 'session').map((i) => i.itemId)).toEqual(['sess-1']);
    expect(byType(items, 'run_artifact')).toHaveLength(1);
    expect(byType(items, 'oversight_review')).toHaveLength(1);
    expect(byType(items, 'session_export')).toHaveLength(1);
  });
});

describe('task scope', () => {
  it('collects the task row and one item per executed step, tool-call previews included', async () => {
    const { db } = makeFakeDb({ task: true });
    const { items, scopeLabel } = await collectForScope(db, { type: 'task', taskId: 'task-1' });
    expect(scopeLabel).toBe('Task "Draft the STR narrative" — 2 executed step(s)');

    const [task] = byType(items, 'task');
    const body = bodyOf(task);
    expect(body.execution_result_count).toBe(2);
    expect(body).not.toHaveProperty('execution_results');
    expect(body.conversation).toEqual([{ role: 'user', content: 'Draft it' }]);
    expect(task.regulatoryRelevance).toEqual(['eu_ai_act.art_12', 'eu_ai_act.art_14']);

    const steps = byType(items, 'task_execution_result');
    expect(steps.map((s) => s.itemId)).toEqual(['task-1#step-0', 'task-1#step-1']);
    expect(steps.every((s) => s.itemTable === 'anton_tasks')).toBe(true);
    const first = bodyOf(steps[0]);
    expect(first.task_id).toBe('task-1');
    expect(first.source_column).toBe('execution_results');
    expect(first.tool_calls).toEqual([{ name: 'WebSearch', input: { q: 'x' }, ms: 1200, is_error: false, output_preview: 'preview' }]);
    expect(steps[0].itemSummary).toContain('1 tool call(s)');
    expect(steps[0].regulatoryRelevance).toEqual(['eu_ai_act.art_12', 'eu_ai_act.art_13', 'eu_ai_act.art_15']);
    expect(steps[1].regulatoryRelevance).toEqual(['eu_ai_act.art_12']);

    // The linked mission no longer exists — the task pack is still produced.
    expect(byType(items, 'mission')).toHaveLength(0);
  });
});

describe('custom scope', () => {
  it('walks each entry with the walker its table maps to and merges the items', async () => {
    const { db } = makeFakeDb({ gap: true, task: true });
    const scope: ScopeDefinition = {
      type: 'custom',
      items: [{ table: 'sessions', id: 'sess-1' }, { table: 'gap_assessments', id: 'ga-1' }, { table: 'anton_tasks', id: 'task-1' }],
    };
    const { items, scopeLabel } = await collectForScope(db, scope);
    expect(scopeLabel).toMatch(/^3 scope\(s\): /);
    expect(byType(items, 'session')).toHaveLength(1);
    expect(byType(items, 'gap_assessment')).toHaveLength(1);
    expect(byType(items, 'task')).toHaveLength(1);
    expect(byType(items, 'run_artifact')).toHaveLength(1);
  });

  it('refuses tables it cannot walk and empty lists', async () => {
    const { db } = makeFakeDb();
    await expect(collectForScope(db, { type: 'custom', items: [{ table: 'users', id: 'u1' }] })).rejects.toThrow(/cannot walk table "users"/);
    await expect(collectForScope(db, { type: 'custom', items: [] })).rejects.toThrow(/no items/);
  });

  it('scopeToCustomItem names the root row of every single-target scope', () => {
    expect(scopeToCustomItem({ type: 'session', sessionId: 's' })).toEqual({ table: 'sessions', id: 's' });
    expect(scopeToCustomItem({ type: 'gap_assessment', assessmentId: 'g' })).toEqual({ table: 'gap_assessments', id: 'g' });
    expect(scopeToCustomItem({ type: 'engagement', engagementId: 'e' })).toEqual({ table: 'engagements', id: 'e' });
    expect(scopeToCustomItem({ type: 'task', taskId: 't' })).toEqual({ table: 'anton_tasks', id: 't' });
    expect(scopeToCustomItem({ type: 'mission', missionId: 'm' })).toEqual({ table: 'missions.missions', id: 'm' });
    expect(scopeToCustomItem({ type: 'custom', items: [] })).toBeNull();
  });
});

// ── Assembler + verifier round-trip ──────────────────────────────────────────

/**
 * A pack store: one evidence_packs row plus its items, enough for the
 * assembler, the finaliser and the signer (instance_identity).
 */
function makePackDb(initial: Partial<PackRow> = {}) {
  const pack: Record<string, unknown> = {
    id: 'EP-TEST-1', title: 'Wave 3 pack', purpose: null, scope_type: 'session',
    scope_ref: { sessionId: 'sess-1' }, scope_label: null, created_by: 'u1',
    created_at: '2026-09-16T10:00:00.000Z', finalised_at: null, status: 'draft',
    hash_manifest: null, signature: null, signer_public_key: null, item_count: 0, size_bytes: 0,
    retention_until: null, legal_hold: false, supersedes: null,
    compliance_frameworks: ['eu_ai_act', 'amlr'], compliance_gaps: {}, notes: null,
    ...initial,
  };
  let items: Array<{ item_type: string; item_id: string; item_hash: string }> = [];
  let identity: { pubkey: string; privkey: string | null; privkey_encrypted: Buffer | null; privkey_iv: Buffer | null } | null = null;
  const updates: string[] = [];

  const db: DatabaseAdapter = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM instance_identity')) return (identity ?? undefined) as T | undefined;
      if (sql.includes('SELECT status, hash_manifest FROM evidence_packs')) return { status: pack.status, hash_manifest: pack.hash_manifest } as T;
      if (sql.includes('FROM evidence_packs WHERE id = ?')) return (params[0] === pack.id ? { ...pack } : undefined) as T | undefined;
      return undefined;
    },
    async all<T>(sql: string): Promise<T[]> {
      if (sql.includes('FROM evidence_pack_items')) return items.map((i) => ({ ...i, redaction_status: 'none', redaction_reason: null })) as T[];
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      updates.push(sql);
      if (sql.includes('INSERT INTO instance_identity')) {
        identity = { pubkey: params[0] as string, privkey: params[1] as string | null, privkey_encrypted: params[2] as Buffer | null, privkey_iv: params[3] as Buffer | null };
      } else if (sql.includes('DELETE FROM evidence_pack_items')) {
        items = [];
      } else if (sql.includes('INSERT INTO evidence_pack_items')) {
        items.push({ item_type: params[1] as string, item_id: params[3] as string, item_hash: params[4] as string });
      } else if (sql.includes('UPDATE evidence_packs') && sql.includes('hash_manifest = ?')) {
        pack.item_count = params[0]; pack.hash_manifest = params[1]; pack.retention_until = params[2];
      } else if (sql.includes("SET status = 'finalised'")) {
        pack.status = 'finalised'; pack.finalised_at = '2026-09-16T10:30:00.000Z';
        pack.signature = params[0]; pack.signer_public_key = params[1];
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, pack, updates, itemsRef: () => items };
}

/** What verifier.html / verifier.cjs do: recompute the hash from the manifest with the same skeleton rules. */
function recomputeManifestHash(manifest: AssembledPack['manifest']): string {
  const hashable = { ...manifest, manifestHash: '', signature: null, signerPublicKey: null, created: { ...manifest.created, at: '__pinned__' } };
  return 'sha256:' + sha(canonicalise(hashable));
}

describe('assembler and offline verifier round-trip with the new item types', () => {
  it('the manifest hash recomputes as the verifiers do, and the instance signature verifies with node:crypto', async () => {
    const collected = await collectForScope(makeFakeDb({ reviewShape: '273' }).db, { type: 'session', sessionId: 'sess-1' });
    const { db, pack } = makePackDb();
    const scope: ScopeDefinition = { type: 'session', sessionId: 'sess-1' };
    const assembled = await assemblePack(db, {
      packId: 'EP-TEST-1', title: 'Wave 3 pack', scope, scopeLabel: collected.scopeLabel, collected, createdBy: 'u1',
    });

    expect(assembled.manifest.itemsByType).toMatchObject({ run_artifact: 1, quality_score: 1, oversight_review: 1, session_export: 1, message: 2, audit_log: 1, session: 1 });
    // Ordering: the April types first, in their April order, then the per-run records.
    expect(assembled.manifest.items.map((i) => i.type)).toEqual(['session', 'message', 'message', 'audit_log', 'run_artifact', 'quality_score', 'oversight_review', 'session_export']);
    expect(recomputeManifestHash(assembled.manifest)).toBe(assembled.manifest.manifestHash);
    expect(pack.hash_manifest).toBe(assembled.manifest.manifestHash);

    // Deterministic: the same scope assembled again yields the same hash.
    const again = await assemblePack(db, {
      packId: 'EP-TEST-1', title: 'Wave 3 pack', scope, scopeLabel: collected.scopeLabel, collected, createdBy: 'u1',
    });
    expect(again.manifest.manifestHash).toBe(assembled.manifest.manifestHash);

    // Finalise → Ed25519 signature over the manifest hash, verified exactly as verifier.cjs does.
    await finalisePack(db, 'EP-TEST-1');
    const signature = String(pack.signature);
    expect(signature.startsWith('ed25519:')).toBe(true);
    const sigB64u = signature.slice('ed25519:'.length);
    const sigBytes = Buffer.from(sigB64u.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const pubKey = createPublicKey({ key: Buffer.from(String(pack.signer_public_key), 'hex'), format: 'der', type: 'spki' });
    expect(edVerify(null, Buffer.from(assembled.manifest.manifestHash, 'utf-8'), pubKey, sigBytes)).toBe(true);
    expect(edVerify(null, Buffer.from(assembled.manifest.manifestHash + 'x', 'utf-8'), pubKey, sigBytes)).toBe(false);
  });

  it('re-assembling a finalised pack never overwrites its signed hash or its item rows', async () => {
    const collected = await collectForScope(makeFakeDb().db, { type: 'session', sessionId: 'sess-1' });
    const { db, pack, updates, itemsRef } = makePackDb();
    const scope: ScopeDefinition = { type: 'session', sessionId: 'sess-1' };
    const input = { packId: 'EP-TEST-1', title: 'Wave 3 pack', scope, scopeLabel: collected.scopeLabel, collected, createdBy: 'u1' };
    const first = await assemblePack(db, input);
    await finalisePack(db, 'EP-TEST-1');
    const signedHash = String(pack.hash_manifest);
    const signedItems = itemsRef().map((i) => `${i.item_type}:${i.item_id}`);
    updates.length = 0;

    // The source grew after signing: a second review lands. Export re-collects.
    const drifted = { ...collected, items: [...collected.items, collected.items.find((i) => i.itemType === 'oversight_review')!] };
    drifted.items[drifted.items.length - 1] = { ...drifted.items[drifted.items.length - 1], itemId: '4' };
    const rebuilt = await assemblePack(db, { ...input, collected: drifted });

    expect(rebuilt.manifest.manifestHash).not.toBe(first.manifest.manifestHash);   // the bundle says what it saw
    expect(pack.hash_manifest).toBe(signedHash);                                    // the signed hash stays
    expect(itemsRef().map((i) => `${i.item_type}:${i.item_id}`)).toEqual(signedItems);
    expect(updates.some((u) => u.includes('UPDATE evidence_packs') || u.includes('evidence_pack_items'))).toBe(false);
  });
});

// ── Compliance mapper ─────────────────────────────────────────────────────────

describe('compliance mapper credits the new item types where mapped', () => {
  async function assembledFor(opts: FakeDbOptions, scope: ScopeDefinition): Promise<AssembledPack> {
    const collected = await collectForScope(makeFakeDb(opts).db, scope);
    const { db } = makePackDb({ scope_type: scope.type });
    return assemblePack(db, { packId: 'EP-TEST-1', title: 'Mapper', scope, scopeLabel: collected.scopeLabel, collected, createdBy: 'u1', complianceFrameworks: ['eu_ai_act', 'amlr', 'gdpr', 'dora'] });
  }
  const point = (m: ReturnType<typeof mapCompliance>, id: string) => m.frameworks.flatMap((f) => f.points).find((p) => p.id === id)!;
  const evidenceTypes = (m: ReturnType<typeof mapCompliance>, id: string) => Array.from(new Set(point(m, id).evidence.map((e) => e.type))).sort();

  it('session scope: run records evidence Annex IV.2, quality scores + reviews evidence IV.8, exports the AMLR auditability dimension', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const assembled = await assembledFor({ reviewShape: '273' }, { type: 'session', sessionId: 'sess-1' });
    const m = mapCompliance(assembled, ['eu_ai_act', 'amlr', 'gdpr', 'dora']);
    expect(evidenceTypes(m, 'eu_ai_act.annex_iv.2')).toEqual(['audit_log', 'run_artifact']);
    expect(evidenceTypes(m, 'eu_ai_act.annex_iv.3')).toEqual(['message', 'run_artifact']);          // art_13 tags
    expect(evidenceTypes(m, 'eu_ai_act.annex_iv.8')).toEqual(['audit_log', 'oversight_review', 'quality_score']);
    expect(evidenceTypes(m, 'amlr.dim.completeness')).toEqual(['audit_log', 'run_artifact']);
    expect(evidenceTypes(m, 'amlr.dim.timeliness')).toEqual(['audit_log', 'message', 'oversight_review', 'run_artifact']);
    expect(evidenceTypes(m, 'amlr.dim.auditability')).toEqual(['audit_log', 'session_export']);
    expect(evidenceTypes(m, 'amlr.dim.accuracy')).toEqual(['oversight_review']);                    // via art_14
    expect(evidenceTypes(m, 'gdpr.art_22')).toEqual(['message', 'run_artifact']);
    // Unmapped on purpose: no new type pretends to be a risk-management or incident record.
    expect(point(m, 'eu_ai_act.annex_iv.4').status).toBe('gap');
    expect(point(m, 'dora.art_17').status).toBe('gap');
  });

  it('gap_assessment scope: the assessment is the general description and the processing record; iterations are lifecycle changes', async () => {
    const assembled = await assembledFor({ gap: true }, { type: 'gap_assessment', assessmentId: 'ga-1' });
    const m = mapCompliance(assembled, ['eu_ai_act', 'amlr', 'gdpr']);
    expect(evidenceTypes(m, 'eu_ai_act.annex_iv.1')).toEqual(['gap_assessment']);
    expect(evidenceTypes(m, 'eu_ai_act.annex_iv.5')).toEqual(['gap_iteration']);
    expect(evidenceTypes(m, 'eu_ai_act.annex_iv.3')).toEqual(['gap_finding']);                       // rubric facts
    expect(evidenceTypes(m, 'gdpr.art_30')).toEqual(['gap_assessment']);
    expect(evidenceTypes(m, 'amlr.art_21')).toEqual(['gap_assessment', 'gap_finding']);              // AML-framework assessment
    expect(evidenceTypes(m, 'amlr.dim.accuracy')).toEqual(['gap_finding']);                          // overridden by a human
  });

  it('engagement and task scopes: root records describe the system; task steps carry no mapping of their own', async () => {
    const eng = mapCompliance(await assembledFor({ engagement: true }, { type: 'engagement', engagementId: 'eng-1' }), ['eu_ai_act', 'gdpr']);
    expect(evidenceTypes(eng, 'eu_ai_act.annex_iv.1')).toEqual(['engagement', 'session']);
    expect(evidenceTypes(eng, 'eu_ai_act.annex_iv.5')).toEqual(['engagement_iteration']);

    const task = mapCompliance(await assembledFor({ task: true }, { type: 'task', taskId: 'task-1' }), ['eu_ai_act', 'gdpr']);
    expect(evidenceTypes(task, 'eu_ai_act.annex_iv.1')).toEqual(['task']);
    expect(evidenceTypes(task, 'gdpr.art_30')).toEqual(['task']);
    expect(evidenceTypes(task, 'eu_ai_act.annex_iv.3')).toEqual(['task_execution_result']);          // the step with thinking
    expect(point(task, 'eu_ai_act.annex_iv.5').status).toBe('gap');
  });
});
