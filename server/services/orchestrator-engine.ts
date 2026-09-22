/**
 * orchestrator-engine.ts
 *
 * ANTON Orchestrator — Core Intelligence Engine (Phase 1: Observer)
 *
 * Reads signals from all existing platform subsystems, aggregates them into a
 * prioritised situational picture, and generates briefings with proposals using
 * the LLM. No workflow execution happens here — that is Phase 2+.
 *
 * Signal sources (all read from real ANTON tables):
 *   - radar_items          → Regulatory Radar (urgency/relevance scored)
 *   - deadlines            → Time Intelligence (approaching + overdue)
 *   - quality_scores       → Quality Ratchet (trend analysis vs baselines)
 *   - detected_patterns    → Pattern Detection Engine
 *   - rule_violations      → Compliance-as-Code (open violations)
 *   - step_assignments     → Collaborative Canvas (overdue assignments)
 *   - apprentice_profiles  → Apprentice Model (stage progressions)
 *   - workflow_runs        → Workflow Engine (failed / stalled runs)
 *   - proactive_insights   → Proactive Intelligence (unread high-severity)
 */

import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import type { DatabaseAdapter } from '../db/database.js';

import AnthropicSDK from '@anthropic-ai/sdk';
import { callChat, mapModelToProvider, resolveModel } from './provider-router.js';
import type { ChatResult, StreamChatConfig } from './provider-router.js';
import { getProviderFromModelId } from './model-adapter.js';
import { enqueueAudit } from './audit-queue.js';
import { MODEL_CAPABILITIES, estimateCost } from '../config/model-capabilities.js';
import { capabilityModelId } from './engine-model-id.js';
import { checkAndRecordSpendGate, SPEND_GATE_STATE_KEY } from './orchestrator-spend-gate.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignalSource =
  | 'radar' | 'deadline' | 'quality' | 'pattern' | 'workflow'
  | 'assignment' | 'compliance' | 'apprentice' | 'knowledge_graph' | 'proactive'
  | 'task_agent'
  | 'market';

export type ActionType =
  | 'workflow_trigger' | 'workflow_chain' | 'quality_intervention'
  | 'deadline_action' | 'pattern_suggestion' | 'maintenance';

export interface PlatformSignal {
  source: SignalSource;
  signal_id: string;
  summary: string;
  urgency: number;        // 0.0–1.0
  relevance: number;      // 0.0–1.0
  detected_at: string;
  raw_data: Record<string, unknown>;
}

export interface OrchestratorProposal {
  signal_source: SignalSource;
  signal_id: string | null;
  signal_summary: string;
  action_type: ActionType;
  proposed_action: string;
  confidence_score: number;
  urgency_score: number;
  rationale: string;
  estimated_effort: string;
}

export interface OrchestratorBriefing {
  id: string;
  period: 'daily' | 'weekly' | 'on_demand' | 'heartbeat';
  content: string;
  signals_read: number;
  proposals_count: number;
  signals_data: PlatformSignal[];
  proposals: OrchestratorProposal[];
}

interface OrchestratorConfig {
  heartbeat_enabled: number;
  heartbeat_interval_minutes: number;
  briefing_schedule: string;
  radar_urgency_threshold: number;
  quality_decline_threshold: number;
  deadline_alert_days: number;
  heartbeat_model: string;
  briefing_model: string;
  /** Model for workflow-plan generation (Stage 2+). */
  planning_model: string;
  orchestrator_paused: number;
  fully_disabled: number;
  /** When 1, enables extended thinking on briefing + workflow plan generation */
  briefing_thinking_enabled?: number;
  /** Time for daily/weekly briefing (HH:MM format) */
  briefing_time?: string;
  /** ISO timestamp of when the orchestrator was paused */
  paused_at?: string | null;
}

// ── Hard limits (safety ceiling — cannot be overridden via config) ────────────
//
// A limit that is declared and never checked is a promise the code does not
// keep. The Wave 5 track D review (2026-09-16) found five of the seven limits
// here had no call site. Each one that stays is enforced somewhere named:
//
//   MAX_PROPOSALS_PER_BRIEFING      saveBriefing()                        this file
//   MAX_HEARTBEATS_PER_HOUR         scheduledTick()                       orchestrator-heartbeat.ts
//   MAX_AUTO_EXECUTIONS_PER_DAY     isAutoExecutionAllowed()              orchestrator-pattern-engine.ts
//   MIN_HEARTBEAT_INTERVAL_MINUTES  effectiveHeartbeatIntervalMinutes()   orchestrator-heartbeat.ts
//   MAX_TRAIL_ENTRIES               addTrailEntry()                       this file
//   MAX_COST_PER_CYCLE_USD          CycleCostMeter in runHeartbeatCycle() this file
//
// MAX_CHAIN_DEPTH (was 10) is DELETED. The same review found no code that
// follows a chain: orchestrator_workflow_chains is never written or read,
// chained_from/chained_to on orchestrator_executions are never set, and
// 'workflow_chain' survives only as a proposal action_type label. A depth cap
// on chaining that does not exist was a claim, not a limit — reintroduce it
// together with the code that chains.
//
// The limits are compiled in and served read-only (GET /api/orchestrator/limits).
// tests/services/orchestrator-limits.test.ts fails when a key here has no call site.

export const ORCHESTRATOR_HARD_LIMITS = {
  /** Maximum proposals generated per briefing — saveBriefing() truncates the list. */
  MAX_PROPOSALS_PER_BRIEFING: 10,
  /** Maximum heartbeat cycles per hour — a scheduled tick skips when orchestrator_heartbeats holds this many rows from the last hour. */
  MAX_HEARTBEATS_PER_HOUR: 6,
  /** Maximum auto-executions per day (Stage 3+) — isAutoExecutionAllowed(). */
  MAX_AUTO_EXECUTIONS_PER_DAY: 20,
  /** Minimum interval between heartbeats in minutes — a shorter configured interval is clamped up to this at scheduling time. */
  MIN_HEARTBEAT_INTERVAL_MINUTES: 10,
  /** Maximum reasoning trail entries per trail — addTrailEntry() refuses the next one. */
  MAX_TRAIL_ENTRIES: 100,
  /** Maximum priced model cost per heartbeat cycle in USD — the cycle aborts once its calls exceed this. */
  MAX_COST_PER_CYCLE_USD: 5.0,
} as const;

// ── Config loader ─────────────────────────────────────────────────────────────

export async function getOrchestratorConfig(db: DatabaseAdapter): Promise<OrchestratorConfig> {
  const row = await db.get('SELECT * FROM orchestrator_config WHERE id = ?', 'default') as OrchestratorConfig | undefined;
  return row ?? freshInstallConfig();
}

/**
 * The config a fresh install runs on before an orchestrator_config row exists.
 *
 * The heartbeat is OFF here: it is earned (see heartbeatEarned() in
 * orchestrator-heartbeat.ts) and switched on deliberately, not left running on
 * a machine that has never rated a proposal. The models come from the provider
 * router's tiers, so they follow the Settings default engine instead of a
 * literal model id that goes stale (the previous fallback named 4.x ids). The
 * stored row, where one exists, is not touched by this.
 */
export function freshInstallConfig(): OrchestratorConfig {
  return {
    heartbeat_enabled: 0,
    heartbeat_interval_minutes: 30,
    briefing_schedule: 'daily',
    radar_urgency_threshold: 0.7,
    quality_decline_threshold: 1.5,
    deadline_alert_days: 14,
    heartbeat_model: process.env.ORCHESTRATOR_HEARTBEAT_MODEL || resolveModel('medium'),
    briefing_model: process.env.ORCHESTRATOR_BRIEFING_MODEL || resolveModel('large'),
    planning_model: resolveModel('large'),
    orchestrator_paused: 0,
    fully_disabled: 0,
  };
}

// ── Signal Readers ────────────────────────────────────────────────────────────

/** Read high-urgency new regulatory radar items since lastChecked */
async function readRadarSignals(db: DatabaseAdapter, threshold: number, since: Date): Promise<PlatformSignal[]> {
  const rows = await db.all(`
    SELECT ri.id, ri.title, ri.urgency_score, ri.relevance_score, ri.item_type,
           ri.published_at, ri.summary, rs.display_name as source_name
    FROM radar_items ri
    LEFT JOIN radar_sources rs ON ri.source_id = rs.id
    WHERE ri.urgency_score >= ?
      AND ri.status = 'new'
      AND (ri.created_at >= ? OR ri.published_at >= ?)
    ORDER BY ri.urgency_score DESC
    LIMIT 10
  `, threshold, since.toISOString(), since.toISOString().substring(0, 10)) as Array<{
    id: string; title: string; urgency_score: number; relevance_score: number;
    item_type: string; published_at: string; summary: string | null; source_name: string | null;
  }>;

  return rows.map(r => ({
    source: 'radar' as const,
    signal_id: r.id,
    summary: `${r.item_type === 'consultation' ? 'Consultation' : 'Regulatory update'}: "${r.title}" from ${r.source_name ?? 'regulatory source'} — urgency ${Math.round(r.urgency_score * 100)}%`,
    urgency: r.urgency_score,
    relevance: r.relevance_score,
    detected_at: r.published_at ?? new Date().toISOString(),
    raw_data: { id: r.id, title: r.title, item_type: r.item_type, summary: r.summary },
  }));
}

/** Read approaching and overdue deadlines */
async function readDeadlineSignals(db: DatabaseAdapter, alertDays: number): Promise<PlatformSignal[]> {
  const rows = await db.all(`
    SELECT id, title, due_date, category, priority, status,
           EXTRACT(EPOCH FROM due_date::timestamp - NOW()) / 86400.0 as days_remaining
    FROM deadlines
    WHERE status NOT IN ('completed','cancelled')
      AND EXTRACT(EPOCH FROM due_date::timestamp - NOW()) / 86400.0 <= ?
    ORDER BY due_date ASC
    LIMIT 15
  `, alertDays) as Array<{
    id: string; title: string; due_date: string; category: string | null;
    priority: string | null; status: string; days_remaining: number;
  }>;

  return rows.map(r => {
    const daysLeft = Math.round(r.days_remaining);
    const isOverdue = daysLeft < 0;
    const urgency = isOverdue ? 0.95 : Math.max(0.4, 1 - (daysLeft / alertDays) * 0.5);
    return {
      source: 'deadline' as const,
      signal_id: r.id,
      summary: isOverdue
        ? `OVERDUE: "${r.title}" was due ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago`
        : `Deadline approaching: "${r.title}" in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} (${r.due_date.substring(0, 10)})`,
      urgency,
      relevance: 0.9,
      detected_at: new Date().toISOString(),
      raw_data: { id: r.id, title: r.title, due_date: r.due_date, days_remaining: daysLeft, category: r.category },
    };
  });
}

/** Read quality degradation signals — modules with declining scores */
async function readQualitySignals(db: DatabaseAdapter, declineThreshold: number): Promise<PlatformSignal[]> {
  // Find modules where recent average is below baseline by threshold
  const rows = await db.all(`
    SELECT qs.module_id,
           AVG(qs.score_overall) as recent_avg,
           qb.baseline_score,
           qb.baseline_score - AVG(qs.score_overall) as decline,
           COUNT(*) as sample_count
    FROM quality_scores qs
    JOIN quality_baselines qb ON qb.module_id = qs.module_id
    WHERE qs.scored_at >= NOW() - INTERVAL '14 days' AND qs.origin = 'run'
    GROUP BY qs.module_id
    HAVING qb.baseline_score - AVG(qs.score_overall) >= ? AND COUNT(*) >= 2
    ORDER BY decline DESC
    LIMIT 8
  `, declineThreshold) as Array<{
    module_id: string; recent_avg: number; baseline_score: number; decline: number; sample_count: number;
  }>;

  return rows.map(r => ({
    source: 'quality' as const,
    signal_id: r.module_id,
    summary: `Quality decline in "${r.module_id}": ${r.baseline_score.toFixed(1)} baseline → ${r.recent_avg.toFixed(1)} recent average (${r.decline.toFixed(1)} point drop over ${r.sample_count} sessions)`,
    urgency: Math.min(0.9, 0.4 + (r.decline / 3) * 0.5),
    relevance: 0.8,
    detected_at: new Date().toISOString(),
    raw_data: { module_id: r.module_id, recent_avg: r.recent_avg, baseline_score: r.baseline_score, decline: r.decline },
  }));
}

/** Read newly detected patterns that may warrant action */
async function readPatternSignals(db: DatabaseAdapter, since: Date): Promise<PlatformSignal[]> {
  const rows = await db.all(`
    SELECT id, pattern_type, pattern_subtype, description, confidence_score, created_at
    FROM detected_patterns
    WHERE status = 'active'
      AND confidence_score >= 0.6
      AND created_at >= ?
    ORDER BY confidence_score DESC
    LIMIT 5
  `, since.toISOString()) as Array<{
    id: string; pattern_type: string; pattern_subtype: string | null;
    description: string | null; confidence_score: number; created_at: string;
  }>;

  return rows.map(r => ({
    source: 'pattern' as const,
    signal_id: r.id,
    summary: `New pattern detected: ${r.pattern_type}${r.pattern_subtype ? ` / ${r.pattern_subtype}` : ''} — confidence ${Math.round(r.confidence_score * 100)}%${r.description ? `. ${r.description}` : ''}`,
    urgency: 0.4,
    relevance: r.confidence_score,
    detected_at: r.created_at,
    raw_data: { id: r.id, pattern_type: r.pattern_type, pattern_subtype: r.pattern_subtype, confidence_score: r.confidence_score },
  }));
}

/** Read open compliance violations */
async function readComplianceSignals(db: DatabaseAdapter): Promise<PlatformSignal[]> {
  const rows = await db.all(`
    SELECT rv.id, rv.description, rv.severity, rv.affected_entity, rv.created_at,
           cr.title as rule_title
    FROM rule_violations rv
    JOIN compliance_rules cr ON cr.id = rv.rule_id
    WHERE rv.remediation_status = 'open'
      AND rv.severity IN ('critical','high')
    ORDER BY CASE rv.severity WHEN 'critical' THEN 0 ELSE 1 END, rv.created_at DESC
    LIMIT 8
  `) as Array<{
    id: string; description: string; severity: string;
    affected_entity: string | null; created_at: string; rule_title: string;
  }>;

  return rows.map(r => ({
    source: 'compliance' as const,
    signal_id: r.id,
    summary: `${r.severity.toUpperCase()} compliance violation: "${r.rule_title}"${r.affected_entity ? ` — entity: ${r.affected_entity}` : ''} — remediation open`,
    urgency: r.severity === 'critical' ? 0.95 : 0.75,
    relevance: 1.0,
    detected_at: r.created_at,
    raw_data: { id: r.id, description: r.description, severity: r.severity, rule_title: r.rule_title },
  }));
}

/** Read overdue step assignments (Collaborative Canvas) */
async function readAssignmentSignals(db: DatabaseAdapter): Promise<PlatformSignal[]> {
  const rows = await db.all(`
    SELECT id, assigned_to, execution_id, due_at, notes,
           EXTRACT(EPOCH FROM NOW() - due_at::timestamp) / 86400.0 as days_overdue
    FROM step_assignments
    WHERE status = 'pending'
      AND due_at IS NOT NULL
      AND due_at < NOW()
    ORDER BY due_at ASC
    LIMIT 10
  `) as Array<{
    id: string; assigned_to: string | null; execution_id: string;
    due_at: string; notes: string | null; days_overdue: number;
  }>;

  if (rows.length === 0) return [];

  // Group by assignee for a consolidated signal
  const grouped = rows.reduce<Record<string, typeof rows>>((acc, r) => {
    const key = r.assigned_to ?? 'unassigned';
    (acc[key] = acc[key] ?? []).push(r);
    return acc;
  }, {});

  return Object.entries(grouped).slice(0, 5).map(([assignee, items]) => ({
    source: 'assignment' as const,
    signal_id: items[0].id,
    summary: `${items.length} overdue assignment${items.length !== 1 ? 's' : ''} for ${assignee} — oldest overdue by ${Math.round(items[0].days_overdue)} day${Math.round(items[0].days_overdue) !== 1 ? 's' : ''}`,
    urgency: Math.min(0.8, 0.4 + Math.min(items.length, 5) * 0.08),
    relevance: 0.7,
    detected_at: new Date().toISOString(),
    raw_data: { assignee, count: items.length, execution_ids: items.map(i => i.execution_id) },
  }));
}

/** Read recent failed/stalled workflow runs */
async function readWorkflowSignals(db: DatabaseAdapter, since: Date): Promise<PlatformSignal[]> {
  const rows = await db.all(`
    SELECT id, workflow_id, status, error_message, started_at, completed_at
    FROM workflow_runs
    WHERE status IN ('failed','error')
      AND started_at >= ?
    ORDER BY started_at DESC
    LIMIT 8
  `, since.toISOString()) as Array<{
    id: string; workflow_id: string | null; status: string;
    error_message: string | null; started_at: string; completed_at: string | null;
  }>;

  return rows.map(r => ({
    source: 'workflow' as const,
    signal_id: r.id,
    summary: `Workflow run failed${r.workflow_id ? ` (${r.workflow_id})` : ''} — status: ${r.status}${r.error_message ? `. Error: ${r.error_message.substring(0, 100)}` : ''}`,
    urgency: 0.6,
    relevance: 0.7,
    detected_at: r.started_at,
    raw_data: { id: r.id, workflow_id: r.workflow_id, status: r.status, error_message: r.error_message },
  }));
}

/** Read apprentice stage changes — modules ready for progression or recently advanced */
async function readApprenticeSignals(db: DatabaseAdapter, since: Date): Promise<PlatformSignal[]> {
  const rows = await db.all(`
    SELECT ap.id, ap.module_id, ap.area_id, ap.current_stage, ap.sessions_completed,
           ap.quality_avg, ap.last_session
    FROM apprentice_profiles ap
    WHERE ap.last_session >= ?
      AND ap.sessions_completed >= 5
      AND ap.quality_avg >= 7.5
      AND ap.current_stage < 4
    ORDER BY ap.quality_avg DESC
    LIMIT 5
  `, since.toISOString()) as Array<{
    id: string; module_id: string; area_id: string | null;
    current_stage: number; sessions_completed: number; quality_avg: number; last_session: string;
  }>;

  const stageNames = ['', 'Observer', 'Guided', 'Supervised', 'Autonomous'];

  return rows.map(r => ({
    source: 'apprentice' as const,
    signal_id: r.id,
    summary: `Module "${r.module_id}" is performing strongly at Stage ${r.current_stage} (${stageNames[r.current_stage]}): ${r.sessions_completed} sessions, avg quality ${r.quality_avg.toFixed(1)}. May be ready for stage progression.`,
    urgency: 0.3,
    relevance: 0.6,
    detected_at: r.last_session,
    raw_data: { module_id: r.module_id, current_stage: r.current_stage, sessions_completed: r.sessions_completed, quality_avg: r.quality_avg },
  }));
}

/** Read Knowledge Graph signals — high-frequency entities with recent activity */
async function readKnowledgeGraphSignals(db: DatabaseAdapter): Promise<PlatformSignal[]> {
  try {
    // 2026-07-17: entity_relationships uses source_id/target_id (NOT from_id/to_id),
    // and they reference entity_nodes.entity_id (NOT .id). The previous query named
    // nonexistent columns, correlated on the wrong key, AND used an unaliased
    // derived table (a Postgres syntax error) — so it silently returned zero
    // signals on every heartbeat. This counts relationships touching the entity.
    const rows = await db.all(`
      SELECT en.entity_type, en.canonical_name, en.interaction_count,
             en.last_seen,
             (SELECT COUNT(*) FROM entity_relationships er
              WHERE er.source_id = en.entity_id OR er.target_id = en.entity_id) as relationship_count
      FROM entity_nodes en
      WHERE en.interaction_count >= 5
        AND en.last_seen >= NOW() - INTERVAL '7 days'
      ORDER BY en.interaction_count DESC
      LIMIT 5
    `) as Array<{
      entity_type: string; canonical_name: string; interaction_count: number;
      last_seen: string; relationship_count: number;
    }>;

    return rows.map(r => ({
      source: 'knowledge_graph' as const,
      signal_id: `kg-${r.entity_type}-${r.canonical_name}`,
      summary: `Knowledge graph: "${r.canonical_name}" (${r.entity_type}) with ${r.interaction_count} interactions and ${r.relationship_count} relationships — frequently referenced entity`,
      urgency: Math.min(0.6, 0.3 + (r.interaction_count / 50) * 0.3),
      relevance: 0.7,
      detected_at: r.last_seen,
      raw_data: { entity_type: r.entity_type, canonical_name: r.canonical_name, interaction_count: r.interaction_count },
    }));
  } catch { return []; }
}

/** Read unread high-severity proactive insights */
async function readProactiveSignals(db: DatabaseAdapter): Promise<PlatformSignal[]> {
  const rows = await db.all(`
    SELECT id, insight_type, title, body, severity, created_at
    FROM proactive_insights
    WHERE read = 0 AND dismissed = 0
      AND severity IN ('high','critical')
    ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, created_at DESC
    LIMIT 5
  `) as Array<{
    id: string; insight_type: string; title: string; body: string;
    severity: string; created_at: string;
  }>;

  return rows.map(r => ({
    source: 'proactive' as const,
    signal_id: r.id,
    summary: `${r.severity.toUpperCase()} insight (${r.insight_type}): "${r.title}"`,
    urgency: r.severity === 'critical' ? 0.85 : 0.65,
    relevance: 0.75,
    detected_at: r.created_at,
    raw_data: { id: r.id, insight_type: r.insight_type, title: r.title, body: r.body.substring(0, 200) },
  }));
}

/** Read recently completed ANTON Task Agent tasks with outputs */
async function readTaskAgentSignals(db: DatabaseAdapter, since: Date): Promise<PlatformSignal[]> {
  try {
    const rows = await db.all(`
      SELECT t.id, t.user_id, t.title, t.status, t.chosen_approach_id,
             t.execution_summary, t.completed_at,
             a.name AS approach_name
      FROM anton_tasks t
      LEFT JOIN anton_approaches a ON a.id = t.chosen_approach_id
      WHERE t.status = 'completed'
        AND t.completed_at >= ?
      ORDER BY t.completed_at DESC
      LIMIT 10
    `, since.toISOString()) as Array<{
      id: string; user_id: string; title: string; status: string;
      chosen_approach_id: string | null; execution_summary: string | null;
      completed_at: string; approach_name: string | null;
    }>;

    return rows.map(r => ({
      source: 'task_agent' as const,
      signal_id: r.id,
      summary: `ANTON Task completed: "${r.title}"${r.approach_name ? ` (approach: ${r.approach_name})` : ''}${r.execution_summary ? ` — ${r.execution_summary.substring(0, 150)}` : ''}`,
      urgency: 0.5,
      relevance: 0.65,
      detected_at: r.completed_at,
      raw_data: { user_id: r.user_id, task_id: r.id, approach: r.approach_name, execution_summary: r.execution_summary?.substring(0, 300) },
    }));
  } catch {
    return [];
  }
}

/** Read market signals: high-severity patterns, expired predictions, regime changes */
async function readMarketSignals(db: DatabaseAdapter, since: Date): Promise<PlatformSignal[]> {
  const signals: PlatformSignal[] = [];

  // 1. High-severity pattern detections
  const patterns = await db.all(`
    SELECT id, pattern_type, title, description, severity, confidence, detected_at
    FROM market_pattern_detections
    WHERE status = 'new' AND severity IN ('high', 'critical') AND detected_at >= ?
    ORDER BY detected_at DESC LIMIT 8
  `, since.toISOString()) as Array<{
    id: string; pattern_type: string; title: string; description: string;
    severity: string; confidence: number; detected_at: string;
  }>;

  for (const p of patterns) {
    signals.push({
      source: 'market',
      signal_id: p.id,
      summary: `Market pattern detected (${p.severity}): ${p.title} — ${p.description.substring(0, 120)}`,
      urgency: p.severity === 'critical' ? 0.8 : 0.5 + (p.confidence * 0.3),
      relevance: 0.7,
      detected_at: p.detected_at,
      raw_data: { type: 'pattern', pattern_type: p.pattern_type, severity: p.severity, confidence: p.confidence },
    });
  }

  // 2. Predictions expired unvalidated
  const expired = await db.all(`
    SELECT id, title, predicted_outcome, confidence, deadline
    FROM market_predictions
    WHERE status = 'active' AND deadline < ?
    ORDER BY deadline DESC LIMIT 8
  `, new Date().toISOString()) as Array<{
    id: string; title: string; predicted_outcome: string; confidence: number; deadline: string;
  }>;

  for (const e of expired) {
    signals.push({
      source: 'market',
      signal_id: e.id,
      summary: `Market prediction expired unvalidated: "${e.title}" — predicted: ${e.predicted_outcome} (deadline: ${e.deadline})`,
      urgency: 0.4 + (e.confidence * 0.2),
      relevance: 0.6,
      detected_at: e.deadline,
      raw_data: { type: 'expired_prediction', prediction_id: e.id, confidence: e.confidence },
    });
  }

  // 3. Recent regime changes (no ended_at = still active)
  const regimes = await db.all(`
    SELECT id, regime_type, confidence, impact_description, started_at
    FROM market_regime_history
    WHERE ended_at IS NULL AND started_at >= ?
    ORDER BY started_at DESC LIMIT 5
  `, since.toISOString()) as Array<{
    id: string; regime_type: string; confidence: number; impact_description: string | null; started_at: string;
  }>;

  for (const r of regimes) {
    signals.push({
      source: 'market',
      signal_id: r.id,
      summary: `Market regime change detected: ${r.regime_type}${r.impact_description ? ` — ${r.impact_description.substring(0, 100)}` : ''}`,
      urgency: 0.7,
      relevance: 0.8,
      detected_at: r.started_at,
      raw_data: { type: 'regime_change', regime_type: r.regime_type, confidence: r.confidence },
    });
  }

  return signals;
}

// ── Signal Aggregation ────────────────────────────────────────────────────────

export async function aggregateSignals(
  db: DatabaseAdapter,
  since: Date
): Promise<PlatformSignal[]> {
  const config = await getOrchestratorConfig(db);

  // Each reader is wrapped in try/catch — tables may not exist yet
  const safeRead = async (fn: () => Promise<PlatformSignal[]>): Promise<PlatformSignal[]> => {
    try { return await fn(); } catch { return []; }
  };

  const results = await Promise.all([
    safeRead(() => readRadarSignals(db, config.radar_urgency_threshold, since)),
    safeRead(() => readDeadlineSignals(db, config.deadline_alert_days)),
    safeRead(() => readQualitySignals(db, config.quality_decline_threshold)),
    safeRead(() => readPatternSignals(db, since)),
    safeRead(() => readComplianceSignals(db)),
    safeRead(() => readAssignmentSignals(db)),
    safeRead(() => readWorkflowSignals(db, since)),
    safeRead(() => readApprenticeSignals(db, since)),
    safeRead(() => readProactiveSignals(db)),
    safeRead(() => readKnowledgeGraphSignals(db)),
    safeRead(() => readTaskAgentSignals(db, since)),
    safeRead(() => readMarketSignals(db, since)),
  ]);

  const allSignals: PlatformSignal[] = results.flat();

  // Sort by urgency × relevance descending
  return allSignals.sort((a, b) => (b.urgency * b.relevance) - (a.urgency * a.relevance));
}

// ── Model calls — one ledger row per call ─────────────────────────────────────
//
// Until 2026-09-16 the orchestrator's audit_log rows were written per TRAIL,
// not per call: module 'orchestrator', model NULL, zero tokens, status
// 'completed' — 7,031 rows, 3,753 of them for cycles the spend gate had
// skipped without calling any model. Every model call now goes through
// callModel(), which writes exactly one audit_log row carrying the dispatched
// model id, its resolved provider, the token counts the router returned and
// the priced cost; a call that fails is recorded as 'error'. Nothing else in
// this file writes audit_log.

export type OrchestratorLlmStep = 'significance' | 'briefing' | 'narrative' | 'management_report' | 'workflow_plan';

export interface LlmCallUsage {
  step: OrchestratorLlmStep;
  /** The id that was dispatched, engine prefix included (sdk:claude-sonnet-5). */
  model: string;
  /** Resolved provider id — anthropic_sdk for sdk: ids, anthropic for the API. */
  provider: string;
  thinkingLevel?: string;
  inputTokens: number;
  outputTokens: number;
  /** null when MODEL_CAPABILITIES has no price for the model (an honest unknown, not $0). */
  costUsd: number | null;
  /** null when the call returned no thinking text. */
  thinking: string | null;
  durationMs: number;
}

interface ModelCallContext {
  step: OrchestratorLlmStep;
  /** The reasoning trail the call belongs to, when one is open. */
  trailId?: string;
}

function providerFor(model: string): string {
  try { return getProviderFromModelId(model); } catch { return 'unknown'; }
}

/** Priced from the capability table, keyed by the bare model (sdk: stripped). */
function costFor(model: string, inputTokens: number, outputTokens: number): number | null {
  const key = capabilityModelId(model);
  return key in MODEL_CAPABILITIES ? estimateCost(key, inputTokens, outputTokens) : null;
}

function auditModelCall(
  call: Pick<LlmCallUsage, 'model' | 'provider' | 'thinkingLevel' | 'inputTokens' | 'outputTokens' | 'costUsd'>,
  ctx: ModelCallContext,
  status: 'success' | 'error',
): void {
  try {
    enqueueAudit({
      moduleId: 'orchestrator',
      model: call.model,
      provider: call.provider,
      thinkingLevel: call.thinkingLevel,
      inputTokenCount: call.inputTokens,
      outputTokenCount: call.outputTokens,
      estimatedCostUsd: call.costUsd ?? undefined,
      responseStatus: status,
      knowledgeSourcesUsed: [`orchestrator:${ctx.step}`, ...(ctx.trailId ? [`trail:${ctx.trailId}`] : [])],
    });
  } catch {
    // The ledger must never break the cycle.
  }
}

/**
 * Dispatch a model call through the provider router and record it in the
 * ledger. `config.model` must already be the id to dispatch (mapModelToProvider
 * applied), so the audit row names what actually ran.
 */
async function callModel(
  config: StreamChatConfig & { model: string },
  ctx: ModelCallContext,
): Promise<{ result: ChatResult; usage: LlmCallUsage }> {
  const model = config.model;
  const provider = providerFor(model);
  const started = Date.now();
  let result: ChatResult;
  try {
    result = await callChat(config);
  } catch (err) {
    auditModelCall(
      { model, provider, thinkingLevel: config.thinkingLevel, inputTokens: 0, outputTokens: 0, costUsd: null },
      ctx,
      'error',
    );
    throw err;
  }
  const inputTokens = result.inputTokens ?? 0;
  const outputTokens = result.outputTokens ?? 0;
  const usage: LlmCallUsage = {
    step: ctx.step,
    model,
    provider,
    thinkingLevel: config.thinkingLevel,
    inputTokens,
    outputTokens,
    costUsd: costFor(model, inputTokens, outputTokens),
    thinking: result.thinking ? result.thinking : null,
    durationMs: Date.now() - started,
  };
  auditModelCall(usage, ctx, 'success');
  return { result, usage };
}

// ── Heartbeat Assessment (small model — cheap, frequent) ─────────────────────

export interface SignificanceAssessment {
  significant: boolean;
  /** How the verdict was reached — the rule that decided, or the model. */
  method: 'forced' | 'no_signals' | 'high_urgency' | 'too_few' | 'model' | 'model_failed_rule_fallback';
  /** Set only when the model was consulted. */
  usage?: LlmCallUsage;
  /** The model call's failure, when the fallback rule decided. */
  error?: string;
}

/**
 * The deterministic part of the significance check. Returns null when the
 * rules cannot decide and the model must be asked — the caller opens the
 * reasoning trail before that call so the call is recorded against it.
 */
export function assessSignificanceByRule(signals: PlatformSignal[]): SignificanceAssessment | null {
  if (signals.length === 0) return { significant: false, method: 'no_signals' };
  // Any signal with urgency >= 0.7 is always significant
  if (signals.some(s => s.urgency >= 0.7)) return { significant: true, method: 'high_urgency' };
  // Fewer than 3 moderate signals never warrant a briefing
  if (signals.length < 3) return { significant: false, method: 'too_few' };
  return null;
}

/** Ask the model whether ≥3 moderate signals collectively warrant a briefing. */
export async function assessSignificanceWithModel(
  signals: PlatformSignal[],
  ctx: { trailId?: string; /** config.heartbeat_model; env ORCHESTRATOR_HEARTBEAT_MODEL still wins. */ model?: string } = {},
): Promise<SignificanceAssessment> {
  const prompt = `You are a compliance operations AI. Evaluate if these platform signals require immediate attention.
Reply ONLY with "YES" or "NO".

Signals (${signals.length} total, showing top 5):
${signals.slice(0, 5).map(s => `- [${s.source}] urgency=${s.urgency.toFixed(2)}: ${s.summary}`).join('\n')}

Do these signals collectively warrant generating a situational briefing for the compliance team?`;

  try {
    const { result, usage } = await callModel({
      model: mapModelToProvider(process.env.ORCHESTRATOR_HEARTBEAT_MODEL || ctx.model || resolveModel('medium')),
      system: 'You are a compliance operations AI.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 10,
    }, { step: 'significance', trailId: ctx.trailId });
    return { significant: result.text.trim().toUpperCase().startsWith('YES'), method: 'model', usage };
  } catch (err) {
    // On LLM error, use rule-based fallback
    return {
      significant: signals.filter(s => s.urgency >= 0.5).length >= 2,
      method: 'model_failed_rule_fallback',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Quick assessment: do these signals need a briefing? Rules first; the model only when they cannot decide. */
export async function assessSignificance(
  signals: PlatformSignal[],
  _anthropic?: AnthropicSDK | null
): Promise<boolean> {
  const byRule = assessSignificanceByRule(signals);
  if (byRule) return byRule.significant;
  return (await assessSignificanceWithModel(signals)).significant;
}

function describeAssessment(assessment: SignificanceAssessment, signals: PlatformSignal[]): string {
  const verdict = assessment.significant ? 'SIGNIFICANT' : 'ROUTINE';
  switch (assessment.method) {
    case 'forced':
      return `Assessment result: ${verdict}. Force-briefing requested.`;
    case 'high_urgency':
      return `Assessment result: ${verdict}. ${signals.filter(s => s.urgency >= 0.7).length} high-urgency signal(s) (urgency ≥ 0.7) — decided by rule, no model call.`;
    case 'no_signals':
      return `Assessment result: ${verdict}. No signals detected — decided by rule, no model call.`;
    case 'too_few':
      return `Assessment result: ${verdict}. ${signals.length} moderate signal(s), fewer than the 3 needed to consult the model — decided by rule, no model call.`;
    case 'model':
      return `Assessment result: ${verdict}. ${assessment.usage?.model ?? 'the model'} assessed ${signals.length} moderate signals collectively (${(assessment.usage?.inputTokens ?? 0) + (assessment.usage?.outputTokens ?? 0)} tokens).`;
    case 'model_failed_rule_fallback':
      return `Assessment result: ${verdict}. The model call failed (${assessment.error ?? 'unknown error'}); the fallback rule (≥2 signals with urgency ≥ 0.5) decided.`;
  }
}

// ── Briefing Generation (Sonnet — daily, moderate reasoning) ─────────────────

const BRIEFING_SYSTEM_PROMPT = `You are ANTON's AI Orchestrator — an intelligent operations management layer for Financial Crime Prevention compliance teams.

Your role is to read platform signals and knowledge atoms (insights from completed work) and produce a clear, actionable situational briefing that helps the compliance team prioritise their work.

GUIDELINES:
- Be specific: reference actual signal data (names, scores, dates, counts)
- Be concise: compliance professionals are busy; every line must earn its place
- Be actionable: every proposal must name a specific module, workflow, or action
- Be calibrated: high-confidence proposals only; omit low-value observations
- Ordering: highest urgency × relevance first
- Tone: professional, direct, no filler

PROPOSAL QUALITY STANDARDS:
- "Run the AMLR Gap Analysis module on crypto CDD controls" ✓
- "You should review some things" ✗
- "Trigger the BWRA preparation workflow with Q1 data attached" ✓
- "Consider looking at quality" ✗

OUTPUT FORMAT: Return a JSON object with this exact structure:
{
  "summary": "X signals detected. Y need immediate attention.",
  "briefing_markdown": "# ANTON Orchestrator Briefing\\n\\n...full markdown content...",
  "proposals": [
    {
      "signal_source": "radar|deadline|quality|pattern|workflow|assignment|compliance|apprentice|proactive|task_agent",
      "signal_id": "id from signal or null",
      "signal_summary": "what was detected",
      "action_type": "workflow_trigger|workflow_chain|quality_intervention|deadline_action|pattern_suggestion|maintenance",
      "proposed_action": "specific action to take",
      "confidence_score": 0.85,
      "urgency_score": 0.9,
      "rationale": "why this is recommended",
      "estimated_effort": "e.g. 30 min automated + 15 min review"
    }
  ]
}

Omit proposals for signals where the right action is unclear or confidence is below 0.8.
Only include proposals where you are highly confident (≥0.8) that the action is correct and actionable.`;

export async function generateBriefing(
  signals: PlatformSignal[],
  anthropic: AnthropicSDK | null | undefined,
  model: string,
  period: 'daily' | 'weekly' | 'on_demand' | 'heartbeat' = 'daily',
  thinkingEnabled = false,
  db?: DatabaseAdapter,
  ctx: { trailId?: string } = {}
): Promise<{ content: string; proposals: OrchestratorProposal[]; usage: LlmCallUsage }> {
  const signalSummary = signals
    .slice(0, 20)
    .map(s => `[${s.source.toUpperCase()}] urgency=${s.urgency.toFixed(2)} relevance=${s.relevance.toFixed(2)}\nID: ${s.signal_id}\n${s.summary}`)
    .join('\n\n');

  // Query recent knowledge atoms to enrich briefing context
  let atomSection = '';
  if (db) {
    try {
      const recentAtoms = await db.all(`
        SELECT ka.content, ka.atom_type, ka.category, ka.confidence, ka.sentiment,
               wo.workflow_name
        FROM knowledge_atoms ka
        LEFT JOIN workflow_outputs wo ON wo.id = ka.source_output_id
        WHERE ka.is_active = 1
          AND ka.created_at >= NOW() - INTERVAL '14 days'
          AND ka.confidence >= 0.6
        ORDER BY ka.confidence DESC, ka.created_at DESC
        LIMIT 25
      `) as Array<{
        content: string; atom_type: string; category: string;
        confidence: number; sentiment: string | null; workflow_name: string | null;
      }>;

      if (recentAtoms.length > 0) {
        const grouped: Record<string, string[]> = {};
        for (const a of recentAtoms) {
          const key = a.category || 'observation';
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(`- ${a.content} (${a.atom_type}, ${Math.round(a.confidence * 100)}% conf${a.workflow_name ? `, from: ${a.workflow_name}` : ''})`);
        }
        atomSection = `\n\nKNOWLEDGE ATOMS (${recentAtoms.length} recent insights from completed work):\n` +
          Object.entries(grouped).map(([cat, items]) => `### ${cat.toUpperCase()}\n${items.join('\n')}`).join('\n\n');
      }
    } catch { /* atoms are optional enrichment */ }
  }

  const userMessage = `Generate a ${period} compliance operations briefing based on these platform signals and recent knowledge atoms.

PLATFORM SIGNALS (${signals.length} total):
${signalSummary || 'No significant signals detected.'}
${atomSection}

Current date: ${new Date().toISOString().substring(0, 10)}`;

  // Always use deep thinking for orchestrator briefings — higher quality, better reasoning
  const isOpus = model === 'claude-opus-4-8';
  const maxTokens = isOpus ? 16000 : (model === 'claude-sonnet-4-6') ? 48000 : 4000;

  let raw = '';
  let usage: LlmCallUsage;
  try {
    const call = await callModel({
      model: mapModelToProvider(model),
      system: BRIEFING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens,
      thinkingLevel: 'investigate',
    }, { step: 'briefing', trailId: ctx.trailId });
    raw = call.result.text;
    usage = call.usage;
  } catch (err) {
    // A briefing without the model is not a briefing. This used to return a
    // placeholder ("LLM briefing generation temporarily unavailable") with no
    // proposals, and the caller saved it, logged "Briefing generated — 0
    // proposals" and recorded the heartbeat as 'ok' — which is how the
    // briefing path stayed dead from 2026-05-08 for four months while every
    // cycle reported success. Propagate; the heartbeat row then says 'error'
    // and names the cause.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Briefing generation failed on ${mapModelToProvider(model)}: ${msg}`);
  }

  // Parse JSON response
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]) as {
      summary: string;
      briefing_markdown: string;
      proposals: OrchestratorProposal[];
    };
    return {
      content: parsed.briefing_markdown || raw,
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
      usage,
    };
  } catch {
    // Treat entire response as markdown content, no structured proposals
    return { content: raw, proposals: [], usage };
  }
}

// ── Briefing Persistence ──────────────────────────────────────────────────────

export async function saveBriefing(
  db: DatabaseAdapter,
  briefing: Omit<OrchestratorBriefing, 'id'>,
  userId: string = 'solo'
): Promise<string> {
  const id = randomUUID();
  await db.run(`
    INSERT INTO orchestrator_briefings
      (id, user_id, period, signals_read, proposals_count, content, signals_data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    id,
    userId,
    briefing.period,
    briefing.signals_read,
    briefing.proposals_count,
    briefing.content,
    JSON.stringify(briefing.signals_data)
  );

  // Save individual proposals (hard limit: max per briefing)
  const cappedProposals = briefing.proposals.slice(0, ORCHESTRATOR_HARD_LIMITS.MAX_PROPOSALS_PER_BRIEFING);
  for (const p of cappedProposals) {
    await db.run(`
      INSERT INTO orchestrator_proposals
        (id, briefing_id, signal_source, signal_id, signal_summary,
         action_type, proposed_action, confidence_score, urgency_score, rationale, estimated_effort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      randomUUID(),
      id,
      p.signal_source,
      p.signal_id ?? null,
      p.signal_summary,
      p.action_type,
      p.proposed_action,
      p.confidence_score,
      p.urgency_score,
      p.rationale,
      p.estimated_effort ?? null
    );
  }

  // Update stage metrics
  await db.run(`
    UPDATE orchestrator_stage SET
      total_briefings = total_briefings + 1,
      total_proposals = total_proposals + ?,
      updated_at = NOW()
    WHERE id = 'default'
  `, cappedProposals.length);

  return id;
}

// ── Stage Progression Check ───────────────────────────────────────────────────

export async function checkStageProgression(db: DatabaseAdapter): Promise<{ advanced: boolean; newStage?: number; reason?: string }> {
  const stage = await db.get('SELECT * FROM orchestrator_stage WHERE id = ?', 'default') as {
    current_stage: number;
    stage_entered_at: string;
    total_briefings: number;
    total_proposals: number;
    proposals_rated: number;
    proposals_good_or_relevant: number;
    proposals_irrelevant_or_wrong: number;
    plans_approved: number;
    plans_rejected: number;
    executions_completed: number;
    executions_failed: number;
    avg_quality_score: number | null;
    auto_executions: number;
    auto_overrides: number;
    stage_history: string;
  } | undefined;

  if (!stage || stage.current_stage >= 4) return { advanced: false };

  const daysSinceEntry = Math.floor(
    (Date.now() - new Date(stage.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  async function advanceToStage(newStage: number, reason: string) {
    const now = new Date().toISOString();
    const history = JSON.parse(stage!.stage_history || '[]') as unknown[];
    history.push({
      stage: stage!.current_stage,
      entered_at: stage!.stage_entered_at,
      exited_at: now,
      reason,
    });
    // Reset per-stage rating counters so demotion evaluates fresh data
    await db.run(`
      UPDATE orchestrator_stage SET
        current_stage = ?,
        stage_entered_at = ?,
        stage_history = ?,
        proposals_rated = 0,
        proposals_good_or_relevant = 0,
        proposals_irrelevant_or_wrong = 0,
        updated_at = ?
      WHERE id = 'default'
    `, newStage, now, JSON.stringify(history), now);
    console.log(`[orchestrator] STAGE ADVANCEMENT: ${stage!.current_stage} → ${newStage}. ${reason}`);
    return { advanced: true, newStage, reason };
  }

  // ── Stage 1 → 2 criteria ──────────────────────────────────────────────────
  if (stage.current_stage === 1) {
    const minDays = 14;
    const minBriefings = 20;
    const minProposals = 50;
    const minRated = 10;
    const minGoodRate = 0.6;
    const maxBadRate = 0.15;

    if (daysSinceEntry < minDays) return { advanced: false };
    if (stage.total_briefings < minBriefings) return { advanced: false };
    if (stage.total_proposals < minProposals) return { advanced: false };
    if (stage.proposals_rated < minRated) return { advanced: false };

    const goodRate = stage.proposals_good_or_relevant / stage.proposals_rated;
    const badRate = stage.proposals_irrelevant_or_wrong / stage.proposals_rated;

    if (goodRate >= minGoodRate && badRate <= maxBadRate) {
      return await advanceToStage(2, `Stage 1 criteria met after ${daysSinceEntry} days: ${Math.round(goodRate * 100)}% good/relevant, ${Math.round(badRate * 100)}% bad`);
    }
  }

  // ── Stage 2 → 3 criteria ──────────────────────────────────────────────────
  // Must have approved enough plans with high success rate before earning auto-execute
  if (stage.current_stage === 2) {
    const minDays = 7;                // At least 7 days at Stage 2
    const minApproved = 10;           // At least 10 plans approved by human
    const minCompleted = 5;           // At least 5 executions completed
    const maxFailureRate = 0.2;       // Less than 20% failure rate
    const minQuality = 0.8;           // Average quality score ≥ 0.8

    if (daysSinceEntry < minDays) return { advanced: false };
    if (stage.plans_approved < minApproved) return { advanced: false };
    if (stage.executions_completed < minCompleted) return { advanced: false };

    const totalExecutions = stage.executions_completed + stage.executions_failed;
    if (totalExecutions < minCompleted) return { advanced: false };

    const failureRate = stage.executions_failed / totalExecutions;
    const quality = stage.avg_quality_score ?? 0;

    if (failureRate <= maxFailureRate && quality >= minQuality) {
      return await advanceToStage(3, `Stage 2 criteria met after ${daysSinceEntry} days: ${stage.plans_approved} approved, ${Math.round((1 - failureRate) * 100)}% success, ${(quality * 100).toFixed(0)}% quality`);
    }
  }

  // ── Stage 3 → 4 criteria ──────────────────────────────────────────────────
  // Must demonstrate reliable auto-execution before earning chaining capability
  if (stage.current_stage === 3) {
    const minDays = 14;               // At least 14 days at Stage 3
    const minAutoExecutions = 20;     // At least 20 auto-executions completed
    const maxOverrideRate = 0.1;      // Human overrides less than 10%
    const minQuality = 0.85;          // Higher quality bar for full autonomy

    if (daysSinceEntry < minDays) return { advanced: false };
    if (stage.auto_executions < minAutoExecutions) return { advanced: false };

    const overrideRate = stage.auto_executions > 0
      ? stage.auto_overrides / stage.auto_executions
      : 1;
    const quality = stage.avg_quality_score ?? 0;

    if (overrideRate <= maxOverrideRate && quality >= minQuality) {
      return await advanceToStage(4, `Stage 3 criteria met after ${daysSinceEntry} days: ${stage.auto_executions} auto-executions, ${Math.round(overrideRate * 100)}% override rate, ${(quality * 100).toFixed(0)}% quality`);
    }
  }

  return { advanced: false };
}

/**
 * Automatic stage demotion: if performance deteriorates significantly after
 * advancing to Stage 2+, demote back to Stage 1 for recalibration.
 */
export async function checkStageDemotion(db: DatabaseAdapter): Promise<{ demoted: boolean; fromStage?: number; reason?: string }> {
  const stage = await db.get('SELECT * FROM orchestrator_stage WHERE id = ?', 'default') as {
    current_stage: number;
    stage_entered_at: string;
    proposals_rated: number;
    proposals_good_or_relevant: number;
    proposals_irrelevant_or_wrong: number;
    stage_history: string;
  } | undefined;

  if (!stage || stage.current_stage < 2) return { demoted: false };

  // Demotion criteria: >50% bad/wrong proposals with at least 10 rated at current stage
  // Only evaluate proposals since entering the current stage
  if (stage.proposals_rated < 10) return { demoted: false };
  const badRate = stage.proposals_irrelevant_or_wrong / stage.proposals_rated;

  // Threshold: 65% bad/wrong (not 50%) — compliance AI needs room to learn domain nuance.
  // Conservative proposals marked "wrong" are not true failures.
  if (badRate >= 0.65) {
    const now = new Date().toISOString();
    const fromStage = stage.current_stage;
    const reason = `Quality degraded: ${Math.round(badRate * 100)}% of proposals rated wrong/irrelevant at Stage ${fromStage}`;
    const history = JSON.parse(stage.stage_history || '[]') as unknown[];
    history.push({
      stage: fromStage,
      entered_at: stage.stage_entered_at,
      exited_at: now,
      reason: `AUTO-DEMOTION: ${reason}`,
      was_demotion: true,
    });

    await db.run(`
      UPDATE orchestrator_stage SET
        current_stage = 1,
        stage_entered_at = ?,
        stage_history = ?,
        proposals_rated = 0,
        proposals_good_or_relevant = 0,
        proposals_irrelevant_or_wrong = 0,
        updated_at = ?
      WHERE id = 'default'
    `, now, JSON.stringify(history), now);

    // Log demotion event
    try {
      await db.run(`
        INSERT INTO orchestrator_stage_demotions
          (id, from_stage, to_stage, reason, trigger_type, triggered_by)
        VALUES (?, ?, 1, ?, 'auto_quality', 'system')
      `, randomUUID(), fromStage, reason);
    } catch { /* table may not exist */ }

    console.warn(`[orchestrator] STAGE DEMOTION: ${fromStage} → 1. Reason: ${reason}`);
    return { demoted: true, fromStage, reason };
  }

  return { demoted: false };
}

// ── Management Report Generation ──────────────────────────────────────────────

/**
 * Generate a management report summarising orchestrator performance.
 * Used by GET /orchestrator/report endpoint.
 */
export async function generateManagementReport(
  db: DatabaseAdapter,
  anthropic: AnthropicSDK | null | undefined,
  period: 'week' | 'month' = 'week'
): Promise<string> {
  const days = period === 'week' ? 7 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Gather stats
  const briefingCount = (await db.get(
    'SELECT COUNT(*) as c FROM orchestrator_briefings WHERE created_at >= ?',
    since
  ) as { c: number }).c;
  const proposalCount = (await db.get(
    'SELECT COUNT(*) as c FROM orchestrator_proposals WHERE created_at >= ?',
    since
  ) as { c: number }).c;
  const ratedCount = (await db.get(
    'SELECT COUNT(*) as c FROM orchestrator_proposals WHERE created_at >= ? AND human_rating IS NOT NULL',
    since
  ) as { c: number }).c;
  const goodCount = (await db.get(
    "SELECT COUNT(*) as c FROM orchestrator_proposals WHERE created_at >= ? AND human_rating IN ('good_catch','relevant')",
    since
  ) as { c: number }).c;
  const stage = await db.get('SELECT current_stage FROM orchestrator_stage WHERE id = ?', 'default') as
    { current_stage: number } | undefined;

  let executionStats = { c: 0 };
  try {
    executionStats = await db.get(
      'SELECT COUNT(*) as c FROM orchestrator_executions WHERE initiated_at >= ?',
      since
    ) as { c: number };
  } catch { /* ignore */ }

  const platformStats = {
    briefings: briefingCount,
    proposals: proposalCount,
    rated: ratedCount,
    good: goodCount,
    good_rate: ratedCount > 0 ? Math.round((goodCount / ratedCount) * 100) : 0,
    executions: executionStats.c,
    stage: stage?.current_stage ?? 1,
    period_days: days,
  };

  const prompt = `Generate a concise management report for ANTON Prime (AI Orchestrator) for the last ${days} days.

Platform statistics:
- Briefings generated: ${platformStats.briefings}
- Proposals made: ${platformStats.proposals}
- Proposals rated: ${platformStats.rated}
- Good/relevant: ${platformStats.good} (${platformStats.good_rate}%)
- Executions approved: ${platformStats.executions}
- Current stage: ${platformStats.stage} of 4

Report format:
# ANTON Prime — ${period === 'week' ? 'Weekly' : 'Monthly'} Management Report
## Performance Summary
## Key Activities
## Proposal Quality Analysis
## Recommendations
## Next Period Focus

Keep it concise (300–500 words). Professional tone. Include concrete numbers.`;

  try {
    const { result } = await callModel({
      model: mapModelToProvider('claude-sonnet-4-6'),
      system: 'You are a management report writer for the ANTON Prime AI Orchestrator.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1024,
    }, { step: 'management_report' });
    return result.text || 'Report generation failed';
  } catch (e) {
    // Fallback: data-only report
    return `# ANTON Prime — ${period === 'week' ? 'Weekly' : 'Monthly'} Management Report\n\n` +
      `**Period:** Last ${days} days\n\n` +
      `| Metric | Value |\n|---|---|\n` +
      `| Briefings | ${platformStats.briefings} |\n` +
      `| Proposals | ${platformStats.proposals} |\n` +
      `| Proposal quality | ${platformStats.good_rate}% good/relevant |\n` +
      `| Executions | ${platformStats.executions} |\n` +
      `| Current stage | ${platformStats.stage}/4 |\n\n` +
      `*Note: Narrative report unavailable — API error: ${String(e)}*`;
  }
}

// ── Workflow Plan Generation (Phase 2 — Opus) ─────────────────────────────────

const PLAN_SYSTEM_PROMPT = `You are ANTON's AI Orchestrator generating a complete workflow execution plan.
Given a proposal for an action, produce a concrete workflow plan that uses ANTON's existing step types.

Available step types: module_execution, checkpoint, decision_gate, api_call, database_query, transform, wait, conditional, notification, messaging_notification, export, review.

Respond with a JSON object:
{
  "name": "Descriptive workflow name",
  "description": "What this workflow accomplishes",
  "steps": [
    {
      "type": "module_execution|checkpoint|decision_gate|notification|...",
      "name": "Step name",
      "config": { "prompt": "...", "module": "...", "condition": "..." }
    }
  ],
  "knowledge_sources": ["Source description 1", "Source description 2"],
  "reviewer_role": "compliance-lead|analyst|senior-analyst|admin",
  "estimated_duration": "e.g. 30-45 min",
  "quality_threshold": 7.5
}

Keep plans specific and executable. Reference real ANTON modules and step patterns.`;

export async function generateWorkflowPlan(
  proposal: OrchestratorProposal,
  anthropic: AnthropicSDK | null | undefined,
  model: string = process.env.ORCHESTRATOR_BRIEFING_MODEL || 'claude-opus-4-8',
  thinkingEnabled = false
): Promise<string | null> {
  const userMsg = `Generate a complete workflow execution plan for this proposal:

Signal: [${proposal.signal_source}] ${proposal.signal_summary}
Proposed action: ${proposal.proposed_action}
Action type: ${proposal.action_type}
Rationale: ${proposal.rationale}
Estimated effort: ${proposal.estimated_effort ?? 'unknown'}

Produce a concrete, executable workflow plan using ANTON's existing step types.`;

  // Always use deep thinking for workflow plans — critical for execution quality
  const isOpusPlan = model === 'claude-opus-4-8';
  const planMaxTokens = isOpusPlan ? 16000 : 48000;

  try {
    const { result } = await callModel({
      model: mapModelToProvider(model),
      system: PLAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: planMaxTokens,
      thinkingLevel: 'investigate',
    }, { step: 'workflow_plan' });
    const raw = result.text;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return raw;
    JSON.parse(jsonMatch[0]); // Validate JSON
    return jsonMatch[0];
  } catch (err) {
    console.warn('[orchestrator] Workflow plan generation failed:', err);
    return null;
  }
}

// ── Narrative Summary Generation (Sonnet) ─────────────────────────────────────

export async function generateNarrativeSummary(
  trailId: string,
  db: DatabaseAdapter,
  anthropic: AnthropicSDK | null | undefined
): Promise<string> {
  const entries = await db.all(`
    SELECT entry_type, title, content FROM orchestrator_reasoning_entries
    WHERE trail_id = ? ORDER BY sequence_number ASC
  `, trailId) as Array<{ entry_type: string; title: string; content: string }>;

  if (entries.length === 0) return 'No reasoning entries recorded for this trail.';

  const entrySummary = entries
    .map(e => `[${e.entry_type}] ${e.title}: ${e.content.substring(0, 200)}`)
    .join('\n');

  const prompt = `You are ANTON's AI Orchestrator. Summarise the following reasoning trail in 2-3 plain-English sentences — like a colleague explaining what they did and why. Be specific, reference actual actions taken, and stay under 100 words.

Trail entries:
${entrySummary}

Write the narrative summary:`;

  try {
    const { result } = await callModel({
      model: mapModelToProvider('claude-sonnet-4-6'),
      system: 'You are ANTON\'s AI Orchestrator summarising reasoning trails.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
    }, { step: 'narrative', trailId });
    return result.text.trim();
  } catch {
    return '';
  }
}

// ── Workspace Trail File Export ────────────────────────────────────────────────

export async function saveTrailToWorkspace(
  trailId: string,
  db: DatabaseAdapter
): Promise<string | null> {
  try {
    const trail = await db.get('SELECT * FROM orchestrator_reasoning_trails WHERE id = ?', trailId) as
      Record<string, unknown> | undefined;
    if (!trail) return null;

    const entries = await db.all(`
      SELECT * FROM orchestrator_reasoning_entries
      WHERE trail_id = ? ORDER BY sequence_number ASC
    `, trailId) as Array<Record<string, unknown>>;

    const date = new Date().toISOString().substring(0, 10);
    const dirPath = path.join(process.cwd(), '.anton', 'orchestrator', 'trails', date);
    await fs.ensureDir(dirPath);

    const slug = String(trail.trigger_type).replace(/_/g, '-');
    const filename = `${trailId.substring(0, 8)}-${slug}.md`;
    const filePath = path.join(dirPath, filename);

    const lines: string[] = [
      `# ANTON Orchestrator — Reasoning Trail`,
      ``,
      `**Trail ID:** ${trailId}`,
      `**Trigger:** ${trail.trigger_type}`,
      `**Status:** ${trail.status}`,
      `**Started:** ${trail.created_at}`,
      `**Duration:** ${trail.duration_ms ? `${trail.duration_ms}ms` : 'n/a'}`,
      ``,
    ];

    if (trail.narrative_summary) {
      lines.push(`## Summary`, ``, String(trail.narrative_summary), ``);
    }

    lines.push(`## Reasoning Chain`, ``);

    for (const entry of entries) {
      lines.push(
        `### Step ${entry.sequence_number}: ${String(entry.entry_type).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
        `**${entry.title}**${entry.confidence != null ? ` — Confidence: ${Math.round(Number(entry.confidence) * 100)}%` : ''}`,
        ``,
        String(entry.content),
        ``
      );
      if (entry.thinking_content) {
        lines.push(`<details><summary>Extended thinking</summary>`, ``, String(entry.thinking_content), `</details>`, ``);
      }
    }

    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');

    // Store file path on trail
    await db.run(`UPDATE orchestrator_reasoning_trails SET workspace_file_path = ? WHERE id = ?`, filePath, trailId);

    return filePath;
  } catch (err) {
    console.warn('[orchestrator] Workspace trail export failed (non-fatal):', err);
    return null;
  }
}

// ── Reasoning Trail ───────────────────────────────────────────────────────────
//
// audit_log is written per model call by callModel() above — a trail no longer
// writes its own model-less row on completion (that was the source of the
// 7,031 empty 'orchestrator' rows, one per trail, including every paused one).

export type ReasoningEntryType =
  | 'signal_detection' | 'signal_assessment' | 'context_gathering'
  | 'proposal_reasoning' | 'module_selection' | 'input_configuration'
  | 'execution_decision' | 'quality_assessment' | 'chain_reasoning'
  | 'escalation_reasoning' | 'pattern_recognition' | 'pdp_alignment'
  | 'completion_summary';

export interface ReasoningEntryInput {
  entry_type: ReasoningEntryType;
  title: string;
  content: string;
  /** The model's thinking text for this step; omitted or empty is stored as NULL. */
  thinking_content?: string;
  confidence?: number;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
  /** The dispatched model id, when this step called a model. */
  model_used?: string;
  /** Input + output tokens of that call. */
  tokens_used?: number;
  /** Priced cost of that call; null when the model has no known price. */
  cost_usd?: number | null;
}

/** Create a new reasoning trail for a heartbeat cycle or approval action */
export async function createReasoningTrail(
  db: DatabaseAdapter,
  trigger_type: 'heartbeat' | 'on_demand' | 'approval' | 'rejection' | 'auto_execution' | 'chain',
  transparency_level: number = 1
): Promise<string> {
  const id = randomUUID();
  await db.run(`
    INSERT INTO orchestrator_reasoning_trails (id, trigger_type, transparency_level)
    VALUES (?, ?, ?)
  `, id, trigger_type, transparency_level);
  return id;
}

/** Trails that have hit MAX_TRAIL_ENTRIES — the refusal is logged once per trail, not per entry. */
const cappedTrails = new Set<string>();

/**
 * Append a reasoning entry to an active trail. Returns false when nothing was
 * written — the write failed, or the trail already holds MAX_TRAIL_ENTRIES.
 *
 * The cap REFUSES further entries rather than dropping the oldest. The writer
 * numbers each entry COUNT(*) + 1, so sequence_number is the entry's position
 * and the trail viewer reads entries in that order; evicting the head would
 * leave sequence 1 missing and renumber nothing. A cycle writes two to four
 * entries, so a trail at the cap is pathological and is reported as such.
 */
export async function addTrailEntry(
  db: DatabaseAdapter,
  trailId: string,
  entry: ReasoningEntryInput
): Promise<boolean> {
  try {
    // COUNT(*) is a bigint, which node-postgres returns as a string. This was
    // `.c + 1` — "1" + 1 = "11" — so the second entry of every trail was
    // numbered 11 and total_entries read 11 for a two-entry trail (4,412 of
    // them in the live table; four-entry briefing trails read 31).
    const countRow = await db.get(
      'SELECT COUNT(*) as c FROM orchestrator_reasoning_entries WHERE trail_id = ?',
      trailId
    ) as { c: number | string } | undefined;
    const existing = Number(countRow?.c ?? 0);

    if (existing >= ORCHESTRATOR_HARD_LIMITS.MAX_TRAIL_ENTRIES) {
      if (!cappedTrails.has(trailId)) {
        if (cappedTrails.size >= 1000) cappedTrails.clear();
        cappedTrails.add(trailId);
        console.warn(`[orchestrator] Trail ${trailId} holds ${existing} entries — MAX_TRAIL_ENTRIES=${ORCHESTRATOR_HARD_LIMITS.MAX_TRAIL_ENTRIES} reached; further entries are refused (first refused: ${entry.entry_type})`);
      }
      return false;
    }
    const seq = existing + 1;

    await db.run(`
      INSERT INTO orchestrator_reasoning_entries
        (id, trail_id, entry_type, sequence_number, title, content,
         thinking_content, confidence, duration_ms, metadata,
         model_used, tokens_used, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      randomUUID(),
      trailId,
      entry.entry_type,
      seq,
      entry.title,
      entry.content,
      entry.thinking_content || null,
      entry.confidence ?? null,
      entry.duration_ms ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.model_used ?? null,
      entry.tokens_used ?? null,
      entry.cost_usd ?? null
    );

    await db.run(`
      UPDATE orchestrator_reasoning_trails SET total_entries = ? WHERE id = ?
    `, seq, trailId);
    return true;
  } catch (err) {
    // Trail recording must never break the main cycle
    console.warn('[orchestrator] Trail entry write failed (non-fatal):', err);
    return false;
  }
}

/** Finalise a reasoning trail (sync DB update; async post-processing handled separately) */
export async function completeTrail(
  db: DatabaseAdapter,
  trailId: string,
  status: 'completed' | 'failed' | 'abandoned',
  durationMs: number,
  linkages?: { heartbeat_id?: string; briefing_id?: string; proposal_id?: string; execution_id?: string }
): Promise<void> {
  try {
    const now = new Date().toISOString();

    // The trail's token and cost totals are the sum of its entries' model
    // calls — rolled up here so they cannot drift from the entries.
    await db.run(`
      UPDATE orchestrator_reasoning_trails SET
        status = ?, duration_ms = ?, completed_at = ?,
        heartbeat_id  = COALESCE(?, heartbeat_id),
        briefing_id   = COALESCE(?, briefing_id),
        proposal_id   = COALESCE(?, proposal_id),
        execution_id  = COALESCE(?, execution_id),
        total_reasoning_tokens = (SELECT COALESCE(SUM(tokens_used), 0) FROM orchestrator_reasoning_entries WHERE trail_id = ?),
        total_reasoning_cost_usd = (SELECT COALESCE(SUM(cost_usd), 0) FROM orchestrator_reasoning_entries WHERE trail_id = ?)
      WHERE id = ?
    `,
      status, durationMs, now,
      linkages?.heartbeat_id ?? null,
      linkages?.briefing_id ?? null,
      linkages?.proposal_id ?? null,
      linkages?.execution_id ?? null,
      trailId, trailId,
      trailId
    );
  } catch (err) {
    console.warn('[orchestrator] Trail complete write failed (non-fatal):', err);
  }
}

/** Post-completion async enrichment: narrative summary + workspace file */
export async function enrichTrailAsync(
  trailId: string,
  db: DatabaseAdapter,
  anthropic: AnthropicSDK | null | undefined
): Promise<void> {
  try {
    const narrative = await generateNarrativeSummary(trailId, db, anthropic);
    if (narrative) {
      await db.run('UPDATE orchestrator_reasoning_trails SET narrative_summary = ? WHERE id = ?', narrative, trailId);
    }
    await saveTrailToWorkspace(trailId, db);
  } catch (err) {
    console.warn('[orchestrator] Trail enrichment failed (non-fatal):', err);
  }
}

// ── Full Heartbeat Cycle ──────────────────────────────────────────────────────

export interface HeartbeatCycleResult {
  action: 'none' | 'briefing_generated' | 'spend_gate_paused';
  briefingId?: string;
  signalCount: number;
  /** Set only when the cycle reasoned — asked the model, generated a briefing, or failed trying. */
  trailId?: string;
  /** Priced model cost of this cycle in USD — a floor, not a total, when unpricedCalls > 0. */
  costUsd: number;
  /** Model calls the ledger could not price (plan usage / no price known); each counted as $0 toward the cap. */
  unpricedCalls: number;
}

const GATE_PAUSED_LOG_INTERVAL_MS = 60 * 60 * 1000;
let gatePausedLastLoggedAt = 0;

// ── Per-cycle cost cap (MAX_COST_PER_CYCLE_USD) ───────────────────────────────

/** The cycle's priced model calls exceeded MAX_COST_PER_CYCLE_USD; the cycle stops here. */
export class CycleCostCapExceededError extends Error {
  constructor(
    readonly costUsd: number,
    readonly capUsd: number,
    readonly step: OrchestratorLlmStep,
  ) {
    super(`MAX_COST_PER_CYCLE_USD exceeded: $${costUsd.toFixed(4)} after the ${step} call is over the $${capUsd.toFixed(2)} cap — cycle aborted`);
    this.name = 'CycleCostCapExceededError';
  }
}

/**
 * Accumulates one cycle's model cost from the usage each call returns
 * (callModel prices a call from the capability table). A call the ledger
 * cannot price — costUsd null: plan usage on an engine with no price entry —
 * counts as $0 toward the cap and is tallied in `unpricedCalls`, so the cycle
 * record can say its total is a floor. Pure; exported for tests.
 *
 * Only calls made inside the cycle are metered. The narrative enrichment that
 * runs after the cycle returns (enrichTrailAsync) is outside the cap.
 */
export class CycleCostMeter {
  totalUsd = 0;
  pricedCalls = 0;
  unpricedCalls = 0;

  constructor(readonly capUsd: number = ORCHESTRATOR_HARD_LIMITS.MAX_COST_PER_CYCLE_USD) {}

  /** Record a call. Returns the cap error once the running total passes the cap, else null. */
  record(usage: Pick<LlmCallUsage, 'costUsd' | 'step'>): CycleCostCapExceededError | null {
    if (usage.costUsd === null || usage.costUsd === undefined) {
      this.unpricedCalls++;
    } else {
      this.pricedCalls++;
      this.totalUsd += usage.costUsd;
    }
    return this.totalUsd > this.capUsd ? new CycleCostCapExceededError(this.totalUsd, this.capUsd, usage.step) : null;
  }

  get exceeded(): boolean { return this.totalUsd > this.capUsd; }

  /** For trail metadata — the same three numbers on every entry that touched a model. */
  snapshot(): { cycle_cost_usd: number; cycle_priced_calls: number; cycle_unpriced_calls: number; cycle_cost_cap_usd: number } {
    return { cycle_cost_usd: this.totalUsd, cycle_priced_calls: this.pricedCalls, cycle_unpriced_calls: this.unpricedCalls, cycle_cost_cap_usd: this.capUsd };
  }

  describe(): string {
    const priced = `$${this.totalUsd.toFixed(4)} across ${this.pricedCalls} priced call(s)`;
    return this.unpricedCalls > 0
      ? `${priced} + ${this.unpricedCalls} unpriced call(s) counted as $0 (plan usage or no price known — the total is a floor)`
      : priced;
  }
}

/**
 * A reasoning trail that is written only once the cycle has something to
 * reason about. Entries are buffered until the first model call (or a
 * failure) materialises the trail; a cycle the spend gate skipped, or one the
 * rules settled without a model, discards the buffer. A no-op is not a
 * decision and leaves no trail — its only records are the heartbeat row and,
 * when paused, the skipped-cycle counter in the spend-gate state.
 */
class DeferredTrail {
  private readonly buffered: ReasoningEntryInput[] = [];
  private trailId: string | undefined;

  constructor(
    private readonly db: DatabaseAdapter,
    private readonly triggerType: 'heartbeat' | 'on_demand',
    private readonly transparencyLevel: number,
  ) {}

  get id(): string | undefined { return this.trailId; }

  async add(entry: ReasoningEntryInput): Promise<void> {
    if (this.trailId) await addTrailEntry(this.db, this.trailId, entry);
    else this.buffered.push(entry);
  }

  async materialise(): Promise<string> {
    if (this.trailId) return this.trailId;
    this.trailId = await createReasoningTrail(this.db, this.triggerType, this.transparencyLevel);
    for (const entry of this.buffered.splice(0)) await addTrailEntry(this.db, this.trailId, entry);
    return this.trailId;
  }
}

export async function runHeartbeatCycle(
  db: DatabaseAdapter,
  anthropic: AnthropicSDK | null | undefined,
  period: 'daily' | 'weekly' | 'on_demand' | 'heartbeat' = 'heartbeat',
  forceBriefing: boolean = false
): Promise<HeartbeatCycleResult> {
  const config = await getOrchestratorConfig(db);

  if (config.fully_disabled || config.orchestrator_paused) {
    return { action: 'none', signalCount: 0, costUsd: 0, unpricedCalls: 0 };
  }

  const start = Date.now();
  const meter = new CycleCostMeter();
  // on_demand gets a wider lookback (7 days) to capture more context
  const lookbackDays = period === 'weekly' ? 14 : period === 'on_demand' ? 7 : 1;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const triggerType = period === 'on_demand' ? 'on_demand' : 'heartbeat';
  const transparencyLevel = (config as OrchestratorConfig & { reasoning_transparency_level?: number }).reasoning_transparency_level ?? 1;
  const trail = new DeferredTrail(db, triggerType, transparencyLevel);

  let signals: PlatformSignal[] = [];
  let action: 'none' | 'briefing_generated' = 'none';
  let briefingId: string | undefined;
  let error: string | undefined;
  let spendGatePaused = false;

  try {
    // Step 1: Aggregate signals (deterministic — runs on every cycle)
    const signalStart = Date.now();
    signals = await aggregateSignals(db, since);
    await trail.add({
      entry_type: 'signal_detection',
      title: `${signals.length} platform signals detected`,
      content: signals.length === 0
        ? 'No signals detected across all 9 platform sources.'
        : `Aggregated ${signals.length} signals from platform sources.\n\nTop signals:\n${signals.slice(0, 5).map(s => `- [${s.source}] urgency=${s.urgency.toFixed(2)}: ${s.summary}`).join('\n')}`,
      duration_ms: Date.now() - signalStart,
      metadata: {
        total_signals: signals.length,
        significant_signals: signals.filter(s => s.urgency >= 0.6).length,
        sources_with_signals: [...new Set(signals.map(s => s.source))],
      },
    });

    // Spend gate (Wave 3.6): when the last N proposals are all unrated, pause
    // every scheduled LLM step (significance assessment + briefing generation).
    // Deterministic work (signal aggregation above, pattern detection + stage
    // checks below) keeps running. On-demand generation is never gated — it is
    // an explicit user request and itself a rating opportunity.
    if (period !== 'on_demand') {
      const gate = await checkAndRecordSpendGate(db);
      spendGatePaused = gate.paused;
      // A skipped cycle is not a decision: no trail, no audit row. Its record
      // is the skipped-cycle counter checkAndRecordSpendGate keeps in the gate
      // state, plus this line at most once an hour.
      if (gate.paused && Date.now() - gatePausedLastLoggedAt >= GATE_PAUSED_LOG_INTERVAL_MS) {
        gatePausedLastLoggedAt = Date.now();
        console.info(`[orchestrator] Spend gate active — heartbeat cycles skip the model until a recent proposal is rated (${gate.reason}). Skipped cycles are counted in app_settings.${SPEND_GATE_STATE_KEY}; this line repeats at most hourly.`);
      }
    }

    if (!spendGatePaused) {
      // Step 2: Assess significance — rules first; the model only when they
      // cannot decide, and then against an open trail so the call is recorded.
      const assessStart = Date.now();
      let assessment: SignificanceAssessment;
      if (forceBriefing) {
        assessment = { significant: true, method: 'forced' };
      } else {
        const byRule = assessSignificanceByRule(signals);
        assessment = byRule ?? await assessSignificanceWithModel(signals, { trailId: await trail.materialise(), model: config.heartbeat_model });
      }
      const { significant, usage: assessUsage } = assessment;
      // The call is metered before its entry is written so the entry carries
      // the running total; the abort itself happens after the entry exists.
      const assessCapHit = assessUsage ? meter.record(assessUsage) : null;
      await trail.add({
        entry_type: 'signal_assessment',
        title: significant ? 'Signals assessed as significant — briefing warranted' : 'Signals assessed as routine — no briefing needed',
        content: describeAssessment(assessment, signals),
        confidence: significant ? 0.9 : 0.8,
        duration_ms: Date.now() - assessStart,
        thinking_content: assessUsage?.thinking ?? undefined,
        model_used: assessUsage?.model,
        tokens_used: assessUsage ? assessUsage.inputTokens + assessUsage.outputTokens : undefined,
        cost_usd: assessUsage?.costUsd,
        metadata: {
          significant,
          method: assessment.method,
          forced: forceBriefing,
          signal_count: signals.length,
          ...(assessUsage ? { model: assessUsage.model, provider: assessUsage.provider, input_tokens: assessUsage.inputTokens, output_tokens: assessUsage.outputTokens, ...meter.snapshot() } : {}),
          ...(assessment.error ? { model_error: assessment.error } : {}),
        },
      });
      if (assessCapHit) throw assessCapHit;

      if (significant || period !== 'heartbeat') {
        // Step 3: Generate briefing + proposals — the cycle becomes a decision here.
        const trailId = await trail.materialise();
        const briefingStart = Date.now();
        const briefingModel = mapModelToProvider(config.briefing_model);
        await trail.add({
          entry_type: 'proposal_reasoning',
          title: `Generating ${period} briefing with proposal recommendations`,
          content: `Calling ${briefingModel}${briefingModel !== config.briefing_model ? ` (configured as ${config.briefing_model}, resolved to the default engine)` : ''} to analyse ${signals.length} signals and generate actionable proposals.\n\nSignal composition:\n${[...new Set(signals.map(s => s.source))].map(src => `- ${src}: ${signals.filter(s => s.source === src).length} signals`).join('\n')}`,
          metadata: { model: briefingModel, configured_model: config.briefing_model, signal_count: signals.length, period },
        });

        const briefingThinking = !!(config as OrchestratorConfig).briefing_thinking_enabled;
        const { content, proposals, usage } = await generateBriefing(signals, anthropic, config.briefing_model, period, briefingThinking, db, { trailId });

        // MAX_COST_PER_CYCLE_USD: a briefing whose call took the cycle past the
        // cap is not saved. The spend is on the ledger either way (audit row +
        // this entry); what the cap refuses is acting on it.
        const briefingCapHit = meter.record(usage);
        await trail.add({
          entry_type: 'completion_summary',
          title: briefingCapHit
            ? 'Briefing discarded — cycle cost cap exceeded'
            : `Briefing generated — ${proposals.length} proposals`,
          content: briefingCapHit
            ? `${briefingCapHit.message}\n\nCycle cost: ${meter.describe()}. The generated briefing (${proposals.length} proposals) was not saved.`
            : `Briefing generation complete.\n\nProposals generated: ${proposals.length}\n${proposals.slice(0, 5).map((p, i) => `${i + 1}. [${p.action_type}] ${p.proposed_action} (confidence: ${Math.round(p.confidence_score * 100)}%)`).join('\n')}\n\nCycle cost: ${meter.describe()}.`,
          confidence: proposals.length > 0 ? proposals.reduce((a, p) => a + p.confidence_score, 0) / proposals.length : 0,
          duration_ms: Date.now() - briefingStart,
          thinking_content: usage.thinking ?? undefined,
          model_used: usage.model,
          tokens_used: usage.inputTokens + usage.outputTokens,
          cost_usd: usage.costUsd,
          metadata: {
            proposals_count: proposals.length,
            action_types: [...new Set(proposals.map(p => p.action_type))],
            model: usage.model,
            provider: usage.provider,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cost_usd: usage.costUsd,
            ...meter.snapshot(),
            ...(briefingCapHit ? { cost_cap_exceeded: true, briefing_discarded: true } : {}),
          },
        });
        if (briefingCapHit) throw briefingCapHit;

        briefingId = await saveBriefing(db, {
          period,
          content,
          signals_read: signals.length,
          proposals_count: proposals.length,
          signals_data: signals,
          proposals,
        });
        action = 'briefing_generated';
      }
    } // end !spendGatePaused (model steps)
  } catch (err) {
    error = String(err);
    if (err instanceof CycleCostCapExceededError) {
      console.warn(`[orchestrator] ${err.message} (${meter.describe()})`);
    } else {
      console.error('[orchestrator] Heartbeat cycle error:', err);
    }
    // A failed cycle always leaves a trail naming the cause.
    try {
      await trail.materialise();
      await trail.add({
        entry_type: 'completion_summary',
        title: err instanceof CycleCostCapExceededError ? 'Cycle aborted — cost cap exceeded' : 'Cycle failed with error',
        content: `Error during heartbeat cycle: ${error}`,
        metadata: { error, ...meter.snapshot() },
      });
    } catch (trailErr) {
      console.warn('[orchestrator] Could not record the failure on a trail (non-fatal):', trailErr);
    }
  }

  // Log heartbeat — the one row every cycle leaves, paused or not.
  const heartbeatId = randomUUID();
  await db.run(`
    INSERT INTO orchestrator_heartbeats
      (id, signals_checked, signals_significant, action_taken, duration_ms, error_message, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, 
    heartbeatId,
    signals.length,
    signals.filter(s => s.urgency >= 0.6).length,
    spendGatePaused ? 'spend_gate_paused' : action,
    Date.now() - start,
    error ?? null,
    error ? 'error' : 'ok'
  );

  // Complete the trail — only a cycle that reasoned has one.
  const trailId = trail.id;
  if (trailId) {
    await completeTrail(db, trailId, error ? 'failed' : 'completed', Date.now() - start, {
      heartbeat_id: heartbeatId,
      briefing_id: briefingId,
    });
  }

  // Async enrichment: narrative summary + workspace file (non-blocking)
  if (action === 'briefing_generated' && trailId) {
    enrichTrailAsync(trailId, db, anthropic).catch(err => {
      console.error('[orchestrator] enrichTrailAsync failed (non-fatal):', err);
    });
  }

  // Pattern detection + auto-execution (non-blocking, runs after briefing)
  if (action === 'briefing_generated' || action === 'none') {
    try {
      const { detectPatterns, recordPatternDetection, shouldAutoPause } = await import('./orchestrator-pattern-engine.js');
      const patterns = await detectPatterns(db);
      if (patterns.length > 0) {
        // Two bugs lived in these four lines. recordPatternDetection is async
        // and was not awaited, so its failures surfaced out of band as loose
        // warnings; and the count below was Math.min(patterns.length, 3) — a
        // number computed from the input, not from what actually persisted. It
        // read "3 recorded" for months while the INSERT was failing on every
        // row and the table stayed empty. Count what came back instead.
        let recorded = 0;
        for (const pat of patterns.slice(0, 3)) { // max 3 pattern proposals per cycle
          const res = await recordPatternDetection(db, pat, briefingId ?? null);
          if (res.ok) recorded++;
        }
        const attempted = Math.min(patterns.length, 3);
        console.log(
          `[orchestrator] Pattern engine: ${patterns.length} patterns detected, ${recorded}/${attempted} recorded`,
        );
      }

      // NOTE (2026-07-17): the former "Stage 3+ auto-execution" block was REMOVED.
      // It SELECTed suggested_action and never ran it, then INSERTed an
      // orchestrator_executions row with outcome='auto_executed' — a record of
      // action WITHOUT action. It was also dead + broken three ways (the pattern
      // engine hardcodes auto_execute=false so the WHERE was always empty; and
      // the INSERT named columns status/started_at that don't exist and an
      // outcome value that violates the CHECK constraint, so it would throw if
      // reached). The orchestrator is honestly a Stage 1-2 OBSERVER: it briefs +
      // proposes; nothing here executes. When a real executor exists, wire it
      // here and record a truthful outcome — do not resurrect a fabricated one.
      // See docs/architecture/21-orchestrator-trust-phases.md.

      // Auto-pause check
      const { pause, reason } = await shouldAutoPause(db);
      if (pause) {
        await db.run(`
          UPDATE orchestrator_config SET
            orchestrator_paused = 1, paused_at = NOW(), paused_by = 'auto_quality_check', updated_at = NOW()
          WHERE id = 'default'
        `);
        console.warn(`[orchestrator] AUTO-PAUSED: ${reason}`);
      }
    } catch (e) {
      // Log with full error — pattern detection failure should be visible for debugging
      console.error('[orchestrator] Pattern detection error (non-fatal — heartbeat continues):', String(e));
    }
  }

  // Check stage progression + demotion on every heartbeat cycle
  try {
    const demotion = await checkStageDemotion(db);
    if (!demotion.demoted) {
      await checkStageProgression(db);
    }
  } catch (e) {
    console.error('[orchestrator] Stage check error (non-fatal):', String(e));
  }

  return {
    action: spendGatePaused ? 'spend_gate_paused' : action,
    briefingId,
    signalCount: signals.length,
    trailId,
    costUsd: meter.totalUsd,
    unpricedCalls: meter.unpricedCalls,
  };
}
