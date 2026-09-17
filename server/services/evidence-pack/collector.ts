/**
 * collector.ts — walk the existing audit surface for a defined scope and
 * return the set of items that belong in the evidence pack.
 *
 * Scope types:
 *   - 'session'        — one session and everything reachable from it
 *   - 'project'        — every session in a project, transitively
 *   - 'mission'        — a mission, its tasks, activity, decisions, browser traces
 *   - 'gap_assessment' — an assessment, its findings, second opinions, iterations
 *   - 'engagement'     — an engagement, its workstreams, iterations and the
 *                        sessions those iterations were bridged into
 *   - 'task'           — a Task Agent task and its per-step execution results
 *   - 'custom'         — a list of {table, id} pairs, each walked as the scope
 *                        its table belongs to (how "add this to a pack" works)
 *
 * For every collected item the collector computes:
 *   1. The canonical JSON representation (stable key order, no drift).
 *   2. SHA-256 of that representation.
 *   3. A regulatory relevance tag set (per spec §7).
 *
 * Hash basis: every item hash is sha256 over the canonical JSON of the item
 * body AS COLLECTED. Where a source row already carries a content hash
 * (run_artifacts.prompt_sha256, session_exports.content_hash,
 * gap_assessments.evidence_manifest) that hash travels inside the body, so a
 * verifier can check the source hash independently of the pack hash. Rows
 * without a stored hash (gap findings, engagement iterations, task steps) are
 * pinned only by the pack hash computed here; each such item says so in its
 * `hash_basis` field.
 *
 * Prompts: the composed system prompt of a run (run_artifacts.composed_prompt)
 * can carry client documents, so it is only included when the scope was
 * created with `includePrompts: true`. When excluded, prompt_sha256 +
 * prompt_chars still travel, so the artifact remains verifiable against the
 * prompt text held by the instance. The same switch governs evidence document
 * texts inside a gap assessment's context_config.
 *
 * Critical: nothing here writes back. Mutation lives in assembler.ts.
 *
 * Spec §3.3: do NOT create a parallel audit subsystem. Every field surfaced
 * here comes from an existing table.
 */

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger('evidence-pack-collector');

// ── Scope shapes ───────────────────────────────────────────────────────────

export type ScopeType =
  | 'session' | 'project' | 'workflow_run' | 'mission' | 'canvas' | 'date_range' | 'custom'
  | 'gap_assessment' | 'engagement' | 'task';

export interface SessionScope { type: 'session'; sessionId: string; includePrompts?: boolean }
export interface ProjectScope { type: 'project'; projectId: string; includePrompts?: boolean }
export interface MissionScope { type: 'mission'; missionId: string }
export interface GapAssessmentScope { type: 'gap_assessment'; assessmentId: string; includePrompts?: boolean }
export interface EngagementScope { type: 'engagement'; engagementId: string; includePrompts?: boolean }
export interface TaskScope { type: 'task'; taskId: string }
// Declared so SQL routes can validate the scope_type union without a separate
// enum living elsewhere. Not collected yet.
export interface WorkflowRunScope { type: 'workflow_run'; workflowRunId: string }
export interface CanvasScope { type: 'canvas'; canvasId: string }
export interface DateRangeScope { type: 'date_range'; from: string; to: string; userId?: string }
/** A list of source rows. Each `table` maps onto one of the walkers above. */
export interface CustomScope { type: 'custom'; items: Array<{ table: string; id: string }>; includePrompts?: boolean }
export type ScopeDefinition =
  | SessionScope | ProjectScope | WorkflowRunScope
  | MissionScope | CanvasScope | DateRangeScope | CustomScope
  | GapAssessmentScope | EngagementScope | TaskScope;

/** Tables a custom-scope entry may name, and the walker each one gets. */
export const CUSTOM_SCOPE_TABLES: Record<string, Exclude<ScopeType, 'custom' | 'workflow_run' | 'canvas' | 'date_range'>> = {
  sessions: 'session',
  projects: 'project',
  'missions.missions': 'mission',
  gap_assessments: 'gap_assessment',
  engagements: 'engagement',
  anton_tasks: 'task',
};

/** The custom-scope entry that names the root row of a single-target scope. */
export function scopeToCustomItem(scope: ScopeDefinition): { table: string; id: string } | null {
  switch (scope.type) {
    case 'session': return { table: 'sessions', id: scope.sessionId };
    case 'project': return { table: 'projects', id: scope.projectId };
    case 'mission': return { table: 'missions.missions', id: scope.missionId };
    case 'gap_assessment': return { table: 'gap_assessments', id: scope.assessmentId };
    case 'engagement': return { table: 'engagements', id: scope.engagementId };
    case 'task': return { table: 'anton_tasks', id: scope.taskId };
    default: return null;
  }
}

interface CollectOptions {
  /** Include composed prompts + evidence document texts verbatim. Default false. */
  includePrompts: boolean;
}

function optionsFor(scope: ScopeDefinition): CollectOptions {
  return { includePrompts: 'includePrompts' in scope && scope.includePrompts === true };
}

// ── Item shape ─────────────────────────────────────────────────────────────

export interface CollectedItem {
  itemType: string;                    // 'session' | 'message' | 'audit_log' | 'output_version' | 'run_artifact' | ...
  itemTable: string;                   // source table name
  itemId: string;                      // source PK (always stringified)
  itemSummary: string;                 // short human-readable label for the index
  canonicalJson: string;               // stable canonicalised content
  itemHash: string;                    // sha256 of canonicalJson (hex)
  regulatoryRelevance: string[];       // ["eu_ai_act.art_13", "amlr.auditability"]
}

export interface CollectedItems {
  items: CollectedItem[];
  scopeLabel: string;                  // "Session 'AML Q2 review' + 3 messages + 12 audit entries"
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function collectForScope(db: DatabaseAdapter, scope: ScopeDefinition): Promise<CollectedItems> {
  const opts = optionsFor(scope);
  switch (scope.type) {
    case 'session': return collectSessionScope(db, scope.sessionId, opts);
    case 'project': return collectProjectScope(db, scope.projectId, opts);
    case 'mission': return collectMissionScope(db, scope.missionId);
    case 'gap_assessment': return collectGapAssessmentScope(db, scope.assessmentId, opts);
    case 'engagement': return collectEngagementScope(db, scope.engagementId, opts);
    case 'task': return collectTaskScope(db, scope.taskId);
    case 'custom': return collectCustomScope(db, scope, opts);
    default:
      throw new Error(`Unsupported scope type: ${scope.type}`);
  }
}

// ── Session scope ──────────────────────────────────────────────────────────

async function collectSessionScope(db: DatabaseAdapter, sessionId: string, opts: CollectOptions): Promise<CollectedItems> {
  const items: CollectedItem[] = [];
  const session = await collectSessionTree(db, sessionId, items, opts);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  log.info({ sessionId, itemCount: items.length, includePrompts: opts.includePrompts }, 'session_scope_collected');
  return {
    items,
    scopeLabel: `Session "${session.title}" (${items.length} items: ${countByType(items)})`,
  };
}

/**
 * Session row + everything reachable from it. Returns the session row, or
 * null when the session no longer exists (callers walking bridged sessions
 * treat that as "skip", the session scope itself as "not found").
 */
async function collectSessionTree(
  db: DatabaseAdapter, sessionId: string, items: CollectedItem[], opts: CollectOptions,
): Promise<SessionRow | null> {
  const session = await db.get<SessionRow>(
    `SELECT id, module_id, title, summary, project_id, user_id, review_status,
            reviewed_by, reviewed_at, created_at, updated_at, config
     FROM sessions WHERE id = ?`, sessionId,
  );
  if (!session) return null;
  items.push(toItem({
    itemType: 'session',
    itemTable: 'sessions',
    itemId: session.id,
    summary: `Session "${session.title}" (${session.module_id})`,
    payload: session,
    relevance: regulatoryRelevanceForSession(session),
  }));
  await collectSessionRelated(db, sessionId, items, opts);
  return session;
}

// ── Project scope ──────────────────────────────────────────────────────────

async function collectProjectScope(db: DatabaseAdapter, projectId: string, opts: CollectOptions): Promise<CollectedItems> {
  const project = await db.get<ProjectRow>(
    `SELECT id, name, description, status, created_at FROM projects WHERE id = ?`, projectId,
  );
  if (!project) throw new Error(`Project ${projectId} not found`);

  const items: CollectedItem[] = [];
  items.push(toItem({
    itemType: 'project',
    itemTable: 'projects',
    itemId: project.id,
    summary: `Project "${project.name}"`,
    payload: project,
    relevance: ['eu_ai_act.art_12'],
  }));

  // Walk every session in the project, then per-session related artefacts.
  const sessionRows = await db.all<{ id: string; title: string; module_id: string }>(
    `SELECT id, title, module_id FROM sessions WHERE project_id = ? ORDER BY created_at ASC`,
    projectId,
  );
  for (const s of sessionRows) {
    await collectSessionTree(db, s.id, items, opts);
  }

  log.info({ projectId, sessionCount: sessionRows.length, itemCount: items.length }, 'project_scope_collected');
  return {
    items,
    scopeLabel: `Project "${project.name}" — ${sessionRows.length} session(s), ${items.length} items`,
  };
}

// ── Mission scope ──────────────────────────────────────────────────────────

async function collectMissionScope(db: DatabaseAdapter, missionId: string): Promise<CollectedItems> {
  const mission = await db.get<MissionRow>(
    `SELECT id, title, objective, context, success_criteria, autonomy_level,
            status, priority, created_at, updated_at
     FROM missions.missions WHERE id = ?`, missionId,
  );
  if (!mission) throw new Error(`Mission ${missionId} not found`);

  const items: CollectedItem[] = [];
  items.push(toItem({
    itemType: 'mission',
    itemTable: 'missions.missions',
    itemId: mission.id,
    summary: `Mission "${mission.title}" (${mission.status}, ${mission.autonomy_level})`,
    payload: mission,
    relevance: ['eu_ai_act.art_12', 'eu_ai_act.art_14'],   // missions = autonomous AI; oversight matters
  }));

  // Tasks — every step the mission ran or planned to run, with the model
  // that ran it, its output and its quality gate (migration 115 columns).
  const tasks = await db.all<MissionTaskRow>(
    `SELECT id, mission_id, parent_task_id, title, description, task_type, status, priority,
            module_id, area_id, provider, model, model_tier, actual_tokens_consumed,
            actual_duration_seconds, output_summary, output_full, quality_score,
            confidence_score, retry_count, last_error, sort_order,
            created_at, started_at, completed_at
     FROM missions.mission_tasks WHERE mission_id = ?
     ORDER BY sort_order ASC, created_at ASC`, missionId,
  );
  for (const t of tasks) {
    const relevance = ['eu_ai_act.art_12'];
    if (t.quality_score !== null && t.quality_score !== undefined) relevance.push('eu_ai_act.art_15');
    items.push(toItem({
      itemType: 'mission_task',
      itemTable: 'missions.mission_tasks',
      itemId: t.id,
      summary: `Task "${t.title}" (${t.task_type}, ${t.status}${t.model ? `, ${t.model}` : ''})`,
      payload: { ...t, hash_basis: HASH_BASIS_COLLECTED },
      relevance,
    }));
  }

  // Activity log — narrative of what happened.
  const activity = await db.all<{ id: number | string; mission_id: string; task_id: string | null; timestamp: string; activity_type: string; description: string | null; details: unknown; tokens_consumed: number }>(
    `SELECT id, mission_id, task_id, timestamp, activity_type, description, details, tokens_consumed
     FROM missions.mission_activity WHERE mission_id = ?
     ORDER BY timestamp ASC, id ASC LIMIT 1000`, missionId,
  );
  for (const a of activity) {
    items.push(toItem({
      itemType: 'mission_activity',
      itemTable: 'missions.mission_activity',
      itemId: String(a.id),
      summary: `${a.activity_type}: ${a.description ?? '(no description)'}`,
      payload: { ...a, id: String(a.id), details: parseJsonValue(a.details), hash_basis: HASH_BASIS_COLLECTED },
      relevance: ['eu_ai_act.art_12'],
    }));
  }

  // Decisions — Article 14 evidence (what was decided, the options weighed,
  // the confidence, and whether a human overrode it).
  const decisions = await db.all<MissionDecisionRow>(
    `SELECT id, mission_id, task_id, timestamp, decision_type, description, options_considered,
            selected_option, confidence, reasoning, overridden_by_human, override_reasoning,
            compliance_check_passed
     FROM missions.mission_decisions WHERE mission_id = ?
     ORDER BY timestamp ASC`, missionId,
  );
  for (const d of decisions) {
    items.push(toItem({
      itemType: 'mission_decision',
      itemTable: 'missions.mission_decisions',
      itemId: d.id,
      summary: `Decision (${d.decision_type}): ${d.description}${d.overridden_by_human ? ' — overridden by human' : ''}`,
      payload: { ...d, options_considered: parseJsonValue(d.options_considered), hash_basis: HASH_BASIS_COLLECTED },
      relevance: ['eu_ai_act.art_12', 'eu_ai_act.art_14'],
    }));
  }

  // Browser traces — Playwright sessions are valuable provenance for any
  // mission that hit external systems. Action rows are noisy (one per click);
  // we cap at the first 200 per session for pack size sanity. Screenshots
  // and the encrypted cookie snapshot stay out of the pack.
  const browserSessions = await db.all<{ id: string; mission_id: string; task_id: string | null; browser: string | null; headless: boolean | null; status: string | null; pages_visited: number | null; actions_count: number | null; domains_allowed: unknown; forms_submitted: number | null; created_at: string; closed_at: string | null }>(
    `SELECT id, mission_id, task_id, browser, headless, status, pages_visited, actions_count,
            domains_allowed, forms_submitted, created_at, closed_at
     FROM missions.browser_sessions WHERE mission_id = ?
     ORDER BY created_at ASC`, missionId,
  );
  for (const bs of browserSessions) {
    items.push(toItem({
      itemType: 'browser_session',
      itemTable: 'missions.browser_sessions',
      itemId: bs.id,
      summary: `Browser session ${bs.id} (${bs.status ?? 'unknown'}, ${bs.actions_count ?? 0} actions)`,
      payload: { ...bs, domains_allowed: parseJsonValue(bs.domains_allowed), hash_basis: HASH_BASIS_COLLECTED },
      relevance: ['eu_ai_act.art_12', 'eu_ai_act.art_14'],
    }));
    const actions = await db.all<{ id: string; session_id: string; mission_id: string | null; task_id: string | null; timestamp: string; action_type: string; url: string | null; selector: string | null; success: boolean | null; error_message: string | null; result_summary: string | null; llm_reasoning: string | null }>(
      `SELECT id, session_id, mission_id, task_id, timestamp, action_type, url, selector,
              success, error_message, result_summary, llm_reasoning
       FROM missions.browser_actions WHERE session_id = ?
       ORDER BY timestamp ASC LIMIT 200`, bs.id,
    );
    for (const a of actions) {
      items.push(toItem({
        itemType: 'browser_action',
        itemTable: 'missions.browser_actions',
        itemId: a.id,
        summary: `${a.action_type}${a.url ? ` ${a.url}` : ''}${a.success === false ? ' (failed)' : ''}`,
        payload: { ...a, hash_basis: HASH_BASIS_COLLECTED },
        relevance: ['eu_ai_act.art_12'],
      }));
    }
  }

  log.info({
    missionId, taskCount: tasks.length, activityCount: activity.length,
    decisionCount: decisions.length, browserSessionCount: browserSessions.length,
    itemCount: items.length,
  }, 'mission_scope_collected');

  return {
    items,
    scopeLabel: `Mission "${mission.title}" — ${tasks.length} task(s), ${activity.length} activity entries, ${decisions.length} decisions, ${browserSessions.length} browser session(s)`,
  };
}

interface MissionRow {
  id: string; title: string; objective: string; context: string | null;
  success_criteria: string; autonomy_level: string; status: string; priority: string;
  created_at: string; updated_at: string;
}
interface MissionTaskRow {
  id: string; mission_id: string; parent_task_id: string | null;
  title: string; description: string | null; task_type: string;
  status: string; priority: number; module_id: string | null; area_id: string | null;
  provider: string | null; model: string | null; model_tier: string | null;
  actual_tokens_consumed: number | null; actual_duration_seconds: number | null;
  output_summary: string | null; output_full: string | null;
  quality_score: number | null; confidence_score: number | null;
  retry_count: number | null; last_error: string | null; sort_order: number | null;
  created_at: string; started_at: string | null; completed_at: string | null;
}
interface MissionDecisionRow {
  id: string; mission_id: string; task_id: string | null; timestamp: string;
  decision_type: string; description: string; options_considered: unknown;
  selected_option: string; confidence: number | string | null; reasoning: string | null;
  overridden_by_human: boolean; override_reasoning: string | null; compliance_check_passed: boolean;
}

// ── Gap assessment scope ───────────────────────────────────────────────────

async function collectGapAssessmentScope(
  db: DatabaseAdapter, assessmentId: string, opts: CollectOptions,
): Promise<CollectedItems> {
  const row = await db.get<GapAssessmentRow>(
    `SELECT id, title, frameworks, scope_config, context_config, status, current_step,
            article_scores, capability_view, board_summary, roadmap, session_id, user_id,
            created_at, updated_at, synthesis_reasoning, board_reasoning, roadmap_reasoning,
            batch_reasoning, evidence_manifest
     FROM gap_assessments WHERE id = ?`, assessmentId,
  );
  if (!row) throw new Error(`Gap assessment ${assessmentId} not found`);

  const items: CollectedItem[] = [];

  // Second opinions first: the assessment item lists every model that scored it.
  const opinions = await db.all<GapFindingOpinionRow>(
    `SELECT id, assessment_id, framework, article_id, article_title, model_id, facts,
            computed_score, computed_numeric_score, computed_priority, rubric_version,
            rationale, current_state, evidence_refs, warnings, created_at
     FROM gap_finding_opinions WHERE assessment_id = ?
     ORDER BY model_id ASC, framework ASC, article_id ASC`, assessmentId,
  );
  const opinionModelIds = Array.from(new Set(opinions.map((o) => o.model_id))).sort();

  const contextConfig = parseJsonObject(row.context_config);
  const frameworks = parseJsonValue(row.frameworks);
  const amlScoped = isAmlFrameworkList(frameworks);
  const assessmentRelevance = ['eu_ai_act.art_12'];
  if (amlScoped) assessmentRelevance.push('amlr.art_21', 'amlr.auditability');

  items.push(toItem({
    itemType: 'gap_assessment',
    itemTable: 'gap_assessments',
    itemId: row.id,
    summary: `Gap assessment "${row.title}" (${row.status}, step ${row.current_step})`,
    payload: {
      id: row.id,
      title: row.title,
      status: row.status,
      current_step: row.current_step,
      session_id: row.session_id,
      user_id: row.user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      frameworks,
      scope_config: parseJsonValue(row.scope_config),
      context_config: opts.includePrompts ? contextConfig : redactEvidenceTexts(contextConfig),
      evidence_texts_included: opts.includePrompts,
      // Content-addressed manifest of the evidence documents (docId + sha256 per
      // document) — written by the assessment engine at run time, so the
      // documents can be verified even when their texts are not in the pack.
      evidence_manifest: parseJsonValue(row.evidence_manifest),
      article_scores: parseJsonValue(row.article_scores),
      capability_view: parseJsonValue(row.capability_view),
      board_summary: parseJsonValue(row.board_summary),
      roadmap: parseJsonValue(row.roadmap),
      synthesis_reasoning: row.synthesis_reasoning,
      board_reasoning: row.board_reasoning,
      roadmap_reasoning: row.roadmap_reasoning,
      batch_reasoning: row.batch_reasoning,
      // The models that scored this assessment. The primary run is recorded
      // as the tier the assessor configured (the engine resolves the tier to
      // a model id at run time and does not persist the resolved id); second
      // opinions record the actual model id per row.
      models: {
        primary_model_tier: typeof contextConfig?.modelTier === 'string' ? contextConfig.modelTier : 'sonnet',
        primary_model_tier_source: 'context_config.modelTier (default sonnet when unset)',
        opinion_model_ids: opinionModelIds,
      },
      hash_basis: HASH_BASIS_COLLECTED,
    },
    relevance: assessmentRelevance,
  }));

  const findings = await db.all<GapFindingRow>(
    `SELECT id, assessment_id, framework, article_id, article_title, requirement,
            current_state, score, numeric_score, priority, notes, created_at,
            facts, rubric_version, computed_score, computed_numeric_score, computed_priority,
            overridden_by, override_reason, overridden_at, override_kind,
            carried_forward, change_reason
     FROM gap_findings WHERE assessment_id = ?
     ORDER BY framework ASC, article_id ASC`, assessmentId,
  );
  for (const f of findings) {
    const relevance = ['eu_ai_act.art_12'];
    if (f.facts !== null && f.facts !== undefined) relevance.push('eu_ai_act.art_13');   // rubric facts explain the score
    if (f.overridden_by) relevance.push('eu_ai_act.art_14');                           // a human changed the outcome
    if (amlScoped) relevance.push('amlr.art_21');
    items.push(toItem({
      itemType: 'gap_finding',
      itemTable: 'gap_findings',
      itemId: String(f.id),
      summary: `${f.framework} ${f.article_id}: ${f.score ?? 'unscored'}${f.overridden_by ? ' (overridden)' : ''}`,
      payload: {
        ...f,
        id: String(f.id),
        facts: parseJsonValue(f.facts),
        hash_basis: HASH_BASIS_COLLECTED,
      },
      relevance,
    }));
  }

  for (const o of opinions) {
    items.push(toItem({
      itemType: 'gap_finding_opinion',
      itemTable: 'gap_finding_opinions',
      itemId: String(o.id),
      summary: `Second opinion by ${o.model_id} on ${o.framework} ${o.article_id}: ${o.computed_score ?? 'unscored'}`,
      payload: {
        ...o,
        id: String(o.id),
        facts: parseJsonValue(o.facts),
        evidence_refs: parseJsonValue(o.evidence_refs),
        warnings: parseJsonValue(o.warnings),
        hash_basis: HASH_BASIS_COLLECTED,
      },
      relevance: ['eu_ai_act.art_12', 'eu_ai_act.art_15'],   // a second model = robustness check on the first
    }));
  }

  // Iterations — the assessment's lifecycle (Annex IV point 5).
  const iterations = await db.all<GapIterationRow>(
    `SELECT id, assessment_id, iteration_number, status, context_snapshot, evidence_summary,
            findings_snapshot, capability_snapshot, board_snapshot, roadmap_snapshot,
            score_summary, notes, created_at, created_by,
            synthesis_reasoning, board_reasoning, roadmap_reasoning
     FROM gap_iterations WHERE assessment_id = ?
     ORDER BY iteration_number ASC`, assessmentId,
  );
  for (const it of iterations) {
    const contextSnapshot = parseJsonObject(it.context_snapshot);
    items.push(toItem({
      itemType: 'gap_iteration',
      itemTable: 'gap_iterations',
      itemId: it.id,
      summary: `Iteration ${it.iteration_number} (${it.status ?? 'unknown'})`,
      payload: {
        ...it,
        context_snapshot: opts.includePrompts ? contextSnapshot : redactEvidenceTexts(contextSnapshot),
        evidence_texts_included: opts.includePrompts,
        findings_snapshot: parseJsonValue(it.findings_snapshot),
        capability_snapshot: parseJsonValue(it.capability_snapshot),
        board_snapshot: parseJsonValue(it.board_snapshot),
        roadmap_snapshot: parseJsonValue(it.roadmap_snapshot),
        score_summary: parseJsonValue(it.score_summary),
        hash_basis: HASH_BASIS_COLLECTED,
      },
      relevance: ['eu_ai_act.art_12'],
    }));
  }

  // Quality Ratchet scores keyed on the assessment id (quality_scores.session_id
  // may hold a gap_assessments.id — migration 272).
  await collectQualityScores(db, assessmentId, items);

  // A bridged session, when the assessment has one.
  if (row.session_id) await collectSessionTree(db, row.session_id, items, opts);

  log.info({
    assessmentId, findingCount: findings.length, opinionCount: opinions.length,
    iterationCount: iterations.length, itemCount: items.length,
  }, 'gap_assessment_scope_collected');

  return {
    items,
    scopeLabel: `Gap assessment "${row.title}" — ${findings.length} finding(s), ${opinions.length} second opinion(s), ${iterations.length} iteration(s)`,
  };
}

interface GapAssessmentRow {
  id: string; title: string; frameworks: string | null; scope_config: string | null;
  context_config: string | null; status: string | null; current_step: number | null;
  article_scores: string | null; capability_view: string | null; board_summary: string | null;
  roadmap: string | null; session_id: string | null; user_id: string | null;
  created_at: string; updated_at: string;
  synthesis_reasoning: string | null; board_reasoning: string | null;
  roadmap_reasoning: string | null; batch_reasoning: string | null;
  evidence_manifest: unknown;
}
interface GapFindingRow {
  id: number | string; assessment_id: string; framework: string; article_id: string;
  article_title: string | null; requirement: string | null; current_state: string | null;
  score: string | null; numeric_score: number | null; priority: string | null; notes: string | null;
  created_at: string; facts: unknown; rubric_version: number | null;
  computed_score: string | null; computed_numeric_score: number | null; computed_priority: string | null;
  overridden_by: string | null; override_reason: string | null; overridden_at: string | null;
  override_kind: string | null; carried_forward: boolean | null; change_reason: string | null;
}
interface GapFindingOpinionRow {
  id: number | string; assessment_id: string; framework: string; article_id: string;
  article_title: string | null; model_id: string; facts: unknown;
  computed_score: string | null; computed_numeric_score: number | null; computed_priority: string | null;
  rubric_version: number | null; rationale: string | null; current_state: string | null;
  evidence_refs: unknown; warnings: unknown; created_at: string;
}
interface GapIterationRow {
  id: string; assessment_id: string; iteration_number: number; status: string | null;
  context_snapshot: string | null; evidence_summary: string | null; findings_snapshot: string | null;
  capability_snapshot: string | null; board_snapshot: string | null; roadmap_snapshot: string | null;
  score_summary: string | null; notes: string | null; created_at: string; created_by: string | null;
  synthesis_reasoning: string | null; board_reasoning: string | null; roadmap_reasoning: string | null;
}

// ── Engagement scope ───────────────────────────────────────────────────────

async function collectEngagementScope(
  db: DatabaseAdapter, engagementId: string, opts: CollectOptions,
): Promise<CollectedItems> {
  const row = await db.get<EngagementRow>(
    `SELECT id, project_id, title, engagement_type, status, your_organisation, client_name,
            domain_areas, engagement_brief, quality_blueprint, thinking_level, expert_panel,
            review_modes, knowledge_config, scope_confirmed_at, enable_as_benchmark,
            workstream_plan_confirmed, rag_directory_path, user_id, created_at, updated_at,
            exec_model, intake_conversation, completed_at
     FROM engagements WHERE id = ?`, engagementId,
  );
  if (!row) throw new Error(`Engagement ${engagementId} not found`);

  const items: CollectedItem[] = [];
  const engagementRelevance = ['eu_ai_act.art_12'];
  if (row.scope_confirmed_at) engagementRelevance.push('eu_ai_act.art_14');   // a human confirmed the scope
  items.push(toItem({
    itemType: 'engagement',
    itemTable: 'engagements',
    itemId: row.id,
    summary: `Engagement "${row.title}" (${row.engagement_type}, ${row.status})`,
    payload: {
      ...row,
      domain_areas: parseJsonValue(row.domain_areas),
      engagement_brief: parseJsonValue(row.engagement_brief),
      quality_blueprint: parseJsonValue(row.quality_blueprint),
      expert_panel: parseJsonValue(row.expert_panel),
      review_modes: parseJsonValue(row.review_modes),
      knowledge_config: parseJsonValue(row.knowledge_config),
      // The model-led intake conversation (migration 268) — how scope and
      // client intelligence were established.
      intake_conversation: parseJsonValue(row.intake_conversation),
      hash_basis: HASH_BASIS_COLLECTED,
    },
    relevance: engagementRelevance,
  }));

  const workstreams = await db.all<EngagementWorkstreamRow>(
    `SELECT id, engagement_id, title, description, expert_panel, thinking_level,
            timeline_start, timeline_end, execution_status, dependencies, sort_order, created_at
     FROM engagement_workstreams WHERE engagement_id = ?
     ORDER BY sort_order ASC, created_at ASC`, engagementId,
  );
  for (const w of workstreams) {
    items.push(toItem({
      itemType: 'engagement_workstream',
      itemTable: 'engagement_workstreams',
      itemId: w.id,
      summary: `Workstream "${w.title}" (${w.execution_status ?? 'unknown'})`,
      payload: {
        ...w,
        expert_panel: parseJsonValue(w.expert_panel),
        dependencies: parseJsonValue(w.dependencies),
        hash_basis: HASH_BASIS_COLLECTED,
      },
      relevance: ['eu_ai_act.art_12'],
    }));
  }

  // Iterations — the execution results. Each one may be bridged into a real
  // session (migration 228); that session's run record, audit rows, quality
  // scores and reviews are collected through the session walker.
  const iterations = await db.all<EngagementIterationRow>(
    `SELECT id, engagement_id, workstream_id, iteration_number, output_content,
            confidence_assessment, gap_analysis, scope_creep_flags, resources_used,
            expert_reviews, quality_scores, status, thinking_content, created_at, session_id
     FROM engagement_iterations WHERE engagement_id = ?
     ORDER BY created_at ASC`, engagementId,
  );
  const bridgedSessionIds: string[] = [];
  for (const it of iterations) {
    const relevance = ['eu_ai_act.art_12'];
    if (it.thinking_content) relevance.push('eu_ai_act.art_13');
    if (it.status === 'reviewed' || it.status === 'approved') relevance.push('eu_ai_act.art_14');
    items.push(toItem({
      itemType: 'engagement_iteration',
      itemTable: 'engagement_iterations',
      itemId: it.id,
      summary: `Iteration ${it.iteration_number} (${it.status ?? 'draft'})${it.session_id ? ' — bridged to session' : ''}`,
      payload: {
        ...it,
        confidence_assessment: parseJsonValue(it.confidence_assessment),
        gap_analysis: parseJsonValue(it.gap_analysis),
        scope_creep_flags: parseJsonValue(it.scope_creep_flags),
        resources_used: parseJsonValue(it.resources_used),
        expert_reviews: parseJsonValue(it.expert_reviews),
        quality_scores: parseJsonValue(it.quality_scores),
        hash_basis: HASH_BASIS_COLLECTED,
      },
      relevance,
    }));
    if (it.session_id) bridgedSessionIds.push(it.session_id);
  }
  for (const sid of Array.from(new Set(bridgedSessionIds))) {
    await collectSessionTree(db, sid, items, opts);
  }

  log.info({
    engagementId, workstreamCount: workstreams.length, iterationCount: iterations.length,
    bridgedSessionCount: bridgedSessionIds.length, itemCount: items.length,
  }, 'engagement_scope_collected');

  return {
    items,
    scopeLabel: `Engagement "${row.title}" — ${workstreams.length} workstream(s), ${iterations.length} iteration(s), ${items.length} items`,
  };
}

interface EngagementRow {
  id: string; project_id: string | null; title: string; engagement_type: string; status: string;
  your_organisation: string | null; client_name: string | null; domain_areas: string | null;
  engagement_brief: string | null; quality_blueprint: string | null; thinking_level: string | null;
  expert_panel: string | null; review_modes: string | null; knowledge_config: string | null;
  scope_confirmed_at: string | null; enable_as_benchmark: number | null;
  workstream_plan_confirmed: number | null; rag_directory_path: string | null;
  user_id: string | null; created_at: string; updated_at: string;
  exec_model: string | null; intake_conversation: string | null; completed_at: string | null;
}
interface EngagementWorkstreamRow {
  id: string; engagement_id: string; title: string; description: string | null;
  expert_panel: string | null; thinking_level: string | null;
  timeline_start: string | null; timeline_end: string | null; execution_status: string | null;
  dependencies: string | null; sort_order: number | null; created_at: string;
}
interface EngagementIterationRow {
  id: string; engagement_id: string; workstream_id: string | null; iteration_number: number;
  output_content: string | null; confidence_assessment: string | null; gap_analysis: string | null;
  scope_creep_flags: string | null; resources_used: string | null; expert_reviews: string | null;
  quality_scores: string | null; status: string | null; thinking_content: string | null;
  created_at: string; session_id: string | null;
}

// ── Task scope ─────────────────────────────────────────────────────────────

async function collectTaskScope(db: DatabaseAdapter, taskId: string): Promise<CollectedItems> {
  const row = await db.get<TaskRow>(
    `SELECT id, user_id, title, description, status, source, source_ref, priority, conversation,
            proposals, chosen_approach_id, chosen_approach_config, clarifying_questions,
            clarifying_answers, execution_run_ids, execution_summary, intake_answers,
            execution_results, current_step, intake_ready, task_files, active_knowledge_packs,
            tags, due_date, completed_at, created_at, updated_at, linked_mission_id
     FROM anton_tasks WHERE id = ?`, taskId,
  );
  if (!row) throw new Error(`Task ${taskId} not found`);

  const items: CollectedItem[] = [];
  const executionResults = parseJsonValue(row.execution_results);
  const steps: TaskStepRecord[] = Array.isArray(executionResults)
    ? executionResults.filter((s): s is TaskStepRecord => !!s && typeof s === 'object')
    : [];

  items.push(toItem({
    itemType: 'task',
    itemTable: 'anton_tasks',
    itemId: row.id,
    summary: `Task "${row.title}" (${row.status}, ${steps.length} executed step(s))`,
    payload: {
      ...row,
      conversation: parseJsonValue(row.conversation),
      proposals: parseJsonValue(row.proposals),
      chosen_approach_config: parseJsonValue(row.chosen_approach_config),
      clarifying_questions: parseJsonValue(row.clarifying_questions),
      clarifying_answers: parseJsonValue(row.clarifying_answers),
      execution_run_ids: parseJsonValue(row.execution_run_ids),
      intake_answers: parseJsonValue(row.intake_answers),
      task_files: parseJsonValue(row.task_files),
      active_knowledge_packs: parseJsonValue(row.active_knowledge_packs),
      tags: parseJsonValue(row.tags),
      // Each executed step is its own item (task_execution_result) so it can
      // be hashed, cited and redacted on its own.
      execution_results: undefined,
      execution_result_count: steps.length,
      hash_basis: HASH_BASIS_COLLECTED,
    },
    relevance: ['eu_ai_act.art_12', 'eu_ai_act.art_14'],   // proposal → confirmation is the oversight loop
  }));

  steps.forEach((step, index) => {
    const stepIndex = typeof step.step === 'number' ? step.step : index;
    const relevance = ['eu_ai_act.art_12'];
    if (typeof step.thinking === 'string' && step.thinking.length > 0) relevance.push('eu_ai_act.art_13');
    if (typeof step.quality_score === 'number') relevance.push('eu_ai_act.art_15');
    items.push(toItem({
      itemType: 'task_execution_result',
      itemTable: 'anton_tasks',
      itemId: `${row.id}#step-${stepIndex}`,
      summary: `Step ${stepIndex + 1} "${typeof step.name === 'string' ? step.name : 'unnamed'}"${typeof step.quality_score === 'number' ? ` (quality ${step.quality_score})` : ''}${Array.isArray(step.tool_calls) ? `, ${step.tool_calls.length} tool call(s)` : ''}`,
      payload: {
        task_id: row.id,
        source_column: 'execution_results',
        index,
        ...step,
        hash_basis: HASH_BASIS_COLLECTED,
      },
      relevance,
    }));
  });

  // A task compiled into a mission run (migration 231) carries the mission's
  // own record. Best effort: the bridge has no FK, so a deleted mission is
  // simply absent.
  let missionItemCount = 0;
  if (row.linked_mission_id) {
    try {
      const mission = await collectMissionScope(db, row.linked_mission_id);
      items.push(...mission.items);
      missionItemCount = mission.items.length;
    } catch (err) {
      log.warn({ taskId, missionId: row.linked_mission_id, err: err instanceof Error ? err.message : String(err) }, 'task_linked_mission_unavailable');
    }
  }

  log.info({ taskId, stepCount: steps.length, missionItemCount, itemCount: items.length }, 'task_scope_collected');

  return {
    items,
    scopeLabel: `Task "${row.title}" — ${steps.length} executed step(s)${missionItemCount ? `, linked mission (${missionItemCount} items)` : ''}`,
  };
}

interface TaskRow {
  id: string; user_id: string; title: string; description: string; status: string;
  source: string; source_ref: string | null; priority: string | null; conversation: string | null;
  proposals: string | null; chosen_approach_id: string | null; chosen_approach_config: string | null;
  clarifying_questions: string | null; clarifying_answers: string | null;
  execution_run_ids: string | null; execution_summary: string | null; intake_answers: string | null;
  execution_results: string | null; current_step: number | null; intake_ready: number | null;
  task_files: string | null; active_knowledge_packs: string | null; tags: string | null;
  due_date: string | null; completed_at: string | null; created_at: string; updated_at: string;
  linked_mission_id: string | null;
}
/** server/types/step-record.ts SharedStepRecord, read loosely — old rows predate the type. */
interface TaskStepRecord {
  step?: number; name?: string; output?: string; at?: string; thinking?: string;
  quality_score?: number | null;
  tool_calls?: Array<{ name: string; input: Record<string, unknown>; ms: number; is_error: boolean; output_preview?: string }>;
  [key: string]: unknown;
}

// ── Custom scope ───────────────────────────────────────────────────────────

async function collectCustomScope(db: DatabaseAdapter, scope: CustomScope, opts: CollectOptions): Promise<CollectedItems> {
  if (scope.items.length === 0) throw new Error('Custom scope has no items');
  const items: CollectedItem[] = [];
  const labels: string[] = [];
  for (const entry of scope.items) {
    const walker = CUSTOM_SCOPE_TABLES[entry.table];
    if (!walker) throw new Error(`Custom scope cannot walk table "${entry.table}"`);
    const sub: ScopeDefinition = walker === 'session' ? { type: 'session', sessionId: entry.id, includePrompts: opts.includePrompts }
      : walker === 'project' ? { type: 'project', projectId: entry.id, includePrompts: opts.includePrompts }
      : walker === 'mission' ? { type: 'mission', missionId: entry.id }
      : walker === 'gap_assessment' ? { type: 'gap_assessment', assessmentId: entry.id, includePrompts: opts.includePrompts }
      : walker === 'engagement' ? { type: 'engagement', engagementId: entry.id, includePrompts: opts.includePrompts }
      : { type: 'task', taskId: entry.id };
    const collected = await collectForScope(db, sub);
    items.push(...collected.items);
    labels.push(collected.scopeLabel);
  }
  log.info({ entryCount: scope.items.length, itemCount: items.length }, 'custom_scope_collected');
  return {
    items,
    scopeLabel: `${scope.items.length} scope(s): ${labels.join(' · ')}`,
  };
}

// ── Per-session walker ─────────────────────────────────────────────────────

async function collectSessionRelated(
  db: DatabaseAdapter, sessionId: string, items: CollectedItem[], opts: CollectOptions,
): Promise<void> {
  // Messages — every assistant message is Article 13 transparency evidence
  // when thinking_content is non-null.
  const messages = await db.all<MessageRow>(
    `SELECT id, session_id, role, content, thinking_content, content_blocks,
            token_count, cost, model_id, config_snapshot, created_at
     FROM messages WHERE session_id = ? ORDER BY created_at ASC`, sessionId,
  );
  for (const m of messages) {
    items.push(toItem({
      itemType: 'message',
      itemTable: 'messages',
      itemId: m.id,
      summary: `${m.role} message at ${m.created_at}${m.thinking_content ? ' (with thinking)' : ''}`,
      payload: m,
      relevance: regulatoryRelevanceForMessage(m),
    }));
  }

  // Run records — one per assistant message (migration 223): the composed
  // prompt (pinned by sha256), its layers, the resolved knowledge sources with
  // per-source hashes, plus the provenance fields the message's config
  // snapshot carries (engine, effort, model served, prompt versions, ...).
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    const artifact = await db.get<RunArtifactRow>(
      `SELECT id, message_id, session_id, ${opts.includePrompts ? 'composed_prompt' : 'NULL AS composed_prompt'},
              prompt_sha256, prompt_chars, truncated, layer_summary, source_manifest, created_at
       FROM run_artifacts WHERE message_id = ?`, m.id,
    );
    if (!artifact) continue;
    items.push(toItem({
      itemType: 'run_artifact',
      itemTable: 'run_artifacts',
      itemId: artifact.id,
      summary: `Run record for assistant message ${m.id} (prompt ${artifact.prompt_chars} chars, ${artifact.prompt_sha256.slice(0, 12)}…)`,
      payload: runArtifactPayload(artifact, m, opts),
      relevance: ['eu_ai_act.art_12', 'eu_ai_act.art_13'],
    }));
  }

  // Audit log — one row per AI call. Token costs, model, seed, review status.
  const auditRows = await db.all<AuditLogRow>(
    `SELECT id, timestamp, session_id, module_id, area_id, model, provider,
            thinking_level, input_token_count, output_token_count, cached_tokens,
            cache_creation_tokens, estimated_cost_usd, response_status, review_status,
            reviewed_by, reviewed_at, seed, system_prompt_version_id, user_id,
            knowledge_sources_used, rag_chunks, created_at
     FROM audit_log WHERE session_id = ? ORDER BY timestamp ASC`, sessionId,
  );
  for (const a of auditRows) {
    items.push(toItem({
      itemType: 'audit_log',
      itemTable: 'audit_log',
      itemId: a.id,
      summary: `AI call ${a.model} at ${a.timestamp}`,
      payload: a,
      relevance: regulatoryRelevanceForAuditEntry(a),
    }));
  }

  // Output versions — every saved version of a session-bound output.
  const versionRows = await db.all<VersionRow>(
    `SELECT id, entity_type, entity_id, version_number, label, content, created_at
     FROM versions
     WHERE entity_type = 'session_output' AND entity_id = ?
     ORDER BY version_number ASC`, sessionId,
  );
  for (const v of versionRows) {
    items.push(toItem({
      itemType: 'output_version',
      itemTable: 'versions',
      itemId: String(v.id),
      summary: `Output v${v.version_number}${v.label ? ` (${v.label})` : ''}`,
      payload: v,
      relevance: ['eu_ai_act.art_12', 'amlr.auditability'],
    }));
  }

  // Quality Ratchet scores of real outputs (origin = 'run', migration 272).
  await collectQualityScores(db, sessionId, items);

  // Human oversight reviews — the reviewer's verdict on the output.
  const reviewRows = await db.all<Record<string, unknown>>(
    `SELECT * FROM human_oversight_reviews WHERE session_id = ? ORDER BY created_at ASC, id ASC`, sessionId,
  );
  for (const r of reviewRows) {
    const review = projectOversightReview(r);
    items.push(toItem({
      itemType: 'oversight_review',
      itemTable: 'human_oversight_reviews',
      itemId: String(review.id),
      summary: `Review by ${String(review.reviewer_name)}${review.reviewer_role ? ` (${String(review.reviewer_role)})` : ''}: ${String(review.verdict)}`,
      payload: review,
      relevance: ['eu_ai_act.art_12', 'eu_ai_act.art_14'],
    }));
  }

  // Exports — what left the system, in which format, pinned by content hash.
  const exportRows = await db.all<SessionExportRow>(
    `SELECT id, session_id, module_id, format, version, content_hash, exported_at, exported_by
     FROM session_exports WHERE session_id = ? ORDER BY exported_at ASC`, sessionId,
  );
  for (const e of exportRows) {
    items.push(toItem({
      itemType: 'session_export',
      itemTable: 'session_exports',
      itemId: e.id,
      summary: `Export ${e.format} v${e.version} (${e.content_hash}) at ${e.exported_at}`,
      payload: e,
      relevance: ['eu_ai_act.art_12', 'amlr.auditability'],
    }));
  }
}

/**
 * Quality Ratchet scores for a session-like id. Only `origin = 'run'` rows —
 * scores the ratchet produced for a real output; orphans (test residue,
 * migration 272) never enter a pack.
 */
async function collectQualityScores(db: DatabaseAdapter, sessionLikeId: string, items: CollectedItem[]): Promise<void> {
  const rows = await db.all<QualityScoreRow>(
    `SELECT id, session_id, module_id, area_id, content_hash, score_overall, score_completeness,
            score_accuracy, score_structure, score_actionability, score_citations, word_count,
            score_reasoning, scored_at, scored_by, model_used, notes, origin
     FROM quality_scores WHERE session_id = ? AND origin = 'run'
     ORDER BY scored_at ASC`, sessionLikeId,
  );
  for (const q of rows) {
    items.push(toItem({
      itemType: 'quality_score',
      itemTable: 'quality_scores',
      itemId: q.id,
      summary: `Quality score ${q.score_overall} by ${q.scored_by ?? 'system'}${q.model_used ? ` (${q.model_used})` : ''}`,
      payload: q,
      relevance: ['eu_ai_act.art_12', 'eu_ai_act.art_15'],   // measured output quality = accuracy monitoring
    }));
  }
}

/** Provenance keys the message config snapshot carries since Waves 0/1 (routes/claude.ts). */
const PROVENANCE_KEYS = [
  'model', 'engine', 'effort', 'modelServed', 'costBasis', 'engineCostUsd', 'thinking',
  'modulePromptVersionId', 'modulePromptVersion', 'modulePromptSha256', 'foundationVersionId',
  'guardrailApplied', 'provenanceContract', 'mergedSkills', 'userTurnSha256',
] as const;

function runArtifactPayload(artifact: RunArtifactRow, message: MessageRow, opts: CollectOptions): Record<string, unknown> {
  const snapshot = parseJsonObject(message.config_snapshot);
  let provenance: Record<string, unknown> | null = null;
  if (snapshot) {
    for (const key of PROVENANCE_KEYS) {
      if (!(key in snapshot)) continue;
      if (!provenance) provenance = {};
      provenance[key] = snapshot[key];
    }
  }
  return {
    id: artifact.id,
    message_id: artifact.message_id,
    session_id: artifact.session_id,
    created_at: artifact.created_at,
    // The pin: sha256 over the full, untruncated composed prompt, written at run time.
    prompt_sha256: artifact.prompt_sha256,
    prompt_chars: artifact.prompt_chars,
    truncated: artifact.truncated,
    layer_summary: parseJsonValue(artifact.layer_summary),
    source_manifest: parseJsonValue(artifact.source_manifest),
    prompt_included: opts.includePrompts,
    composed_prompt: opts.includePrompts ? artifact.composed_prompt : null,
    prompt_omitted_reason: opts.includePrompts
      ? null
      : 'Pack created without includePrompts: composed prompts can carry client documents. prompt_sha256 pins the full prompt text held by the instance.',
    message_model_id: message.model_id,
    // Provenance fields from the message's config snapshot: which engine ran,
    // at what effort, which dated model was served, how the run is billed,
    // the content-addressed module + foundation prompt versions, whether the
    // guardrail and provenance contract layers were applied, the merged
    // skills, and the sha256 of the user turn.
    provenance,
    hash_basis: 'sha256 over canonical JSON of this body at collection; prompt_sha256 and the per-layer / per-source hashes inside were written at run time',
  };
}

const OVERSIGHT_REVIEW_BASE_KEYS = [
  'id', 'session_id', 'module_id', 'user_id', 'reviewer_name', 'reviewer_role',
  'attestation', 'verdict', 'notes', 'export_blocked', 'created_at',
] as const;
/** Columns migration 273 adds (another track); included when present, tolerated when absent. */
const OVERSIGHT_REVIEW_OPTIONAL_KEYS = ['message_id', 'prompt_sha256', 'output_sha256', 'evidence_pack_id'] as const;

function projectOversightReview(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of OVERSIGHT_REVIEW_BASE_KEYS) out[k] = row[k] ?? null;
  for (const k of OVERSIGHT_REVIEW_OPTIONAL_KEYS) if (k in row) out[k] = row[k] ?? null;
  out.hash_basis = HASH_BASIS_COLLECTED;
  return out;
}

// ── Regulatory tagging (spec §7) ───────────────────────────────────────────

function regulatoryRelevanceForSession(s: SessionRow): string[] {
  const tags = ['eu_ai_act.art_12'];
  if (s.reviewed_by) tags.push('eu_ai_act.art_14');
  return tags;
}

function regulatoryRelevanceForMessage(m: MessageRow): string[] {
  const tags = ['eu_ai_act.art_12'];
  if (m.thinking_content && m.thinking_content.length > 0) tags.push('eu_ai_act.art_13');
  return tags;
}

function regulatoryRelevanceForAuditEntry(a: AuditLogRow): string[] {
  const tags = ['eu_ai_act.art_12'];
  if (a.seed !== null && a.seed !== undefined) tags.push('eu_ai_act.art_15');
  if (a.review_status && a.review_status !== 'draft') tags.push('eu_ai_act.art_14');
  if (a.area_id === 'fcp' || a.area_id === 'aml') tags.push('amlr.art_21', 'amlr.auditability');
  return tags;
}

/** True when a gap assessment's framework list names an AML framework (amlr, amld6, ...). */
function isAmlFrameworkList(frameworks: unknown): boolean {
  if (!Array.isArray(frameworks)) return false;
  return frameworks.some((f) => {
    const id = typeof f === 'string' ? f : (f && typeof f === 'object' && typeof (f as { id?: unknown }).id === 'string') ? (f as { id: string }).id : '';
    return /aml/i.test(id);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

const HASH_BASIS_COLLECTED = 'sha256 over canonical JSON of this body, computed at collection (the source row stores no content hash)';

function toItem(input: {
  itemType: string; itemTable: string; itemId: string;
  summary: string; payload: unknown; relevance: string[];
}): CollectedItem {
  const canonicalJson = canonicalise(input.payload);
  return {
    itemType: input.itemType,
    itemTable: input.itemTable,
    itemId: input.itemId,
    itemSummary: input.summary,
    canonicalJson,
    itemHash: 'sha256:' + createHash('sha256').update(canonicalJson).digest('hex'),
    regulatoryRelevance: input.relevance,
  };
}

/**
 * Stable JSON: keys sorted recursively. Identical content always produces
 * identical bytes, which keeps the manifest hash deterministic across
 * re-assembly of the same scope (acceptance criterion §13.4).
 */
export function canonicalise(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v instanceof Date) return v.toISOString();
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    out[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
  }
  return out;
}

/** JSON-text columns arrive as strings; jsonb columns arrive parsed. Either way, hand back the value. */
function parseJsonValue(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed) as unknown; } catch { return v; }
}

function parseJsonObject(v: unknown): Record<string, unknown> | null {
  const parsed = parseJsonValue(v);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}

/**
 * Replace evidence document texts inside a gap-assessment context with
 * { omitted, sha256, chars } stubs. Mirrors the run_artifact prompt rule:
 * the text stays verifiable (sha256 of the exact text the assessor uploaded,
 * the same digest the engine's content-derived docIds are built from) without
 * putting client documents in the pack.
 */
export function redactEvidenceTexts(cfg: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!cfg) return null;
  const out: Record<string, unknown> = { ...cfg };
  if (typeof out.documents === 'string' && out.documents.length > 0) {
    out.documents = textStub(out.documents);
  }
  if (Array.isArray(out.evidenceItems)) {
    out.evidenceItems = out.evidenceItems.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const rec = item as Record<string, unknown>;
      return typeof rec.text === 'string' && rec.text.length > 0 ? { ...rec, text: textStub(rec.text) } : rec;
    });
  }
  return out;
}

function textStub(text: string): { omitted: true; sha256: string; chars: number } {
  return { omitted: true, sha256: createHash('sha256').update(text, 'utf8').digest('hex'), chars: text.length };
}

function countByType(items: CollectedItem[]): string {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.itemType, (counts.get(i.itemType) ?? 0) + 1);
  return Array.from(counts.entries()).map(([t, n]) => `${n} ${t}`).join(', ');
}

// ── Source row shapes ──────────────────────────────────────────────────────

interface SessionRow {
  id: string; module_id: string; title: string; summary: string | null;
  project_id: string | null; user_id: string | null;
  review_status: string | null; reviewed_by: string | null; reviewed_at: string | null;
  created_at: string; updated_at: string; config: string | null;
}
interface ProjectRow {
  id: string; name: string; description: string | null;
  status: string | null; created_at: string;
}
interface MessageRow {
  id: string; session_id: string; role: string; content: string;
  thinking_content: string | null; content_blocks: string | null;
  token_count: number | null; cost: number | null; model_id: string | null;
  config_snapshot: string | null; created_at: string;
}
interface AuditLogRow {
  id: string; timestamp: string; session_id: string | null; module_id: string | null;
  area_id: string | null; model: string | null; provider: string | null;
  thinking_level: string | null;
  input_token_count: number | null; output_token_count: number | null;
  cached_tokens: number | null; cache_creation_tokens: number | null;
  estimated_cost_usd: number | null; response_status: string | null;
  review_status: string | null; reviewed_by: string | null; reviewed_at: string | null;
  seed: number | null; system_prompt_version_id: string | null;
  user_id: string | null; knowledge_sources_used: string | null;
  rag_chunks: string | null; created_at: string;
}
interface VersionRow {
  id: number; entity_type: string; entity_id: string; version_number: number;
  label: string | null; content: string; created_at: string;
}
interface RunArtifactRow {
  id: string; message_id: string; session_id: string | null;
  composed_prompt: string | null; prompt_sha256: string; prompt_chars: number;
  truncated: boolean; layer_summary: unknown; source_manifest: unknown; created_at: string;
}
interface QualityScoreRow {
  id: string; session_id: string | null; module_id: string; area_id: string | null;
  content_hash: string; score_overall: number; score_completeness: number | null;
  score_accuracy: number | null; score_structure: number | null; score_actionability: number | null;
  score_citations: number | null; word_count: number | null; score_reasoning: string | null;
  scored_at: string; scored_by: string | null; model_used: string | null; notes: string | null;
  origin: string;
}
interface SessionExportRow {
  id: string; session_id: string; module_id: string | null; format: string;
  version: number; content_hash: string; exported_at: string; exported_by: string | null;
}
