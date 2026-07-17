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
import { callChat, mapModelToProvider } from './provider-router.js';
import { checkAndRecordSpendGate } from './orchestrator-spend-gate.js';

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

export const ORCHESTRATOR_HARD_LIMITS = {
  /** Maximum proposals generated per briefing */
  MAX_PROPOSALS_PER_BRIEFING: 10,
  /** Maximum heartbeat cycles per hour (prevents runaway scheduling) */
  MAX_HEARTBEATS_PER_HOUR: 6,
  /** Maximum auto-executions per day (Stage 3+) */
  MAX_AUTO_EXECUTIONS_PER_DAY: 20,
  /** Maximum chained workflow depth */
  MAX_CHAIN_DEPTH: 10,
  /** Minimum interval between heartbeats in minutes */
  MIN_HEARTBEAT_INTERVAL_MINUTES: 10,
  /** Maximum reasoning trail entries per trail */
  MAX_TRAIL_ENTRIES: 100,
  /** Maximum cost per heartbeat cycle in USD (raised for Opus deep thinking) */
  MAX_COST_PER_CYCLE_USD: 5.0,
} as const;

// ── Config loader ─────────────────────────────────────────────────────────────

export async function getOrchestratorConfig(db: DatabaseAdapter): Promise<OrchestratorConfig> {
  const row = await db.get('SELECT * FROM orchestrator_config WHERE id = ?', 'default') as OrchestratorConfig | undefined;
  return row ?? {
    heartbeat_enabled: 1,
    heartbeat_interval_minutes: 30,
    briefing_schedule: 'daily',
    radar_urgency_threshold: 0.7,
    quality_decline_threshold: 1.5,
    deadline_alert_days: 14,
    heartbeat_model: process.env.ORCHESTRATOR_HEARTBEAT_MODEL || 'claude-haiku-4-5-20251001',
    briefing_model: process.env.ORCHESTRATOR_BRIEFING_MODEL || 'claude-opus-4-8',
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
    WHERE qs.scored_at >= NOW() - INTERVAL '14 days'
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

// ── Heartbeat Assessment (Haiku — cheap, frequent) ────────────────────────────

/** Quick assessment: do these signals need a briefing? Returns true if significant signals found */
export async function assessSignificance(
  signals: PlatformSignal[],
  anthropic: AnthropicSDK
): Promise<boolean> {
  if (signals.length === 0) return false;
  // Any signal with urgency >= 0.7 is always significant
  if (signals.some(s => s.urgency >= 0.7)) return true;
  // If >= 3 moderate signals, ask LLM to assess
  if (signals.length < 3) return false;

  try {
    const prompt = `You are a compliance operations AI. Evaluate if these platform signals require immediate attention.
Reply ONLY with "YES" or "NO".

Signals (${signals.length} total, showing top 5):
${signals.slice(0, 5).map(s => `- [${s.source}] urgency=${s.urgency.toFixed(2)}: ${s.summary}`).join('\n')}

Do these signals collectively warrant generating a situational briefing for the compliance team?`;

    const result = await callChat({
      model: mapModelToProvider(process.env.ORCHESTRATOR_HEARTBEAT_MODEL || 'claude-haiku-4-5-20251001'),
      system: 'You are a compliance operations AI.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 10,
    });
    return result.text.trim().toUpperCase().startsWith('YES');
  } catch {
    // On LLM error, use rule-based fallback
    return signals.filter(s => s.urgency >= 0.5).length >= 2;
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
  anthropic: AnthropicSDK,
  model: string,
  period: 'daily' | 'weekly' | 'on_demand' | 'heartbeat' = 'daily',
  thinkingEnabled = false,
  db?: DatabaseAdapter
): Promise<{ content: string; proposals: OrchestratorProposal[] }> {
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
  try {
    const result = await callChat({
      model: mapModelToProvider(model),
      system: BRIEFING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens,
      thinkingLevel: 'investigate',
    });
    raw = result.text;
  } catch (err) {
    // Fallback: generate minimal briefing without LLM
    const fallbackContent = `# ANTON Orchestrator — ${period} Briefing\n\n*${signals.length} platform signals detected. LLM briefing generation temporarily unavailable.*\n\n${signals.slice(0, 5).map(s => `- **${s.source}**: ${s.summary}`).join('\n')}`;
    return { content: fallbackContent, proposals: [] };
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
    };
  } catch {
    // Treat entire response as markdown content, no structured proposals
    return { content: raw, proposals: [] };
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
  anthropic: AnthropicSDK,
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
    const result = await callChat({
      model: mapModelToProvider('claude-sonnet-4-6'),
      system: 'You are a management report writer for the ANTON Prime AI Orchestrator.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1024,
    });
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
  anthropic: AnthropicSDK,
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
    const result = await callChat({
      model: mapModelToProvider(model),
      system: PLAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: planMaxTokens,
      thinkingLevel: 'investigate',
    });
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
  anthropic: AnthropicSDK
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
    const result = await callChat({
      model: mapModelToProvider('claude-sonnet-4-6'),
      system: 'You are ANTON\'s AI Orchestrator summarising reasoning trails.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
    });
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

// ── Audit Log Integration ──────────────────────────────────────────────────────

export async function logTrailToAuditLog(
  trailId: string,
  db: DatabaseAdapter,
  trail: { trigger_type: string; status: string; total_entries: number; duration_ms?: number | null }
): Promise<void> {
  try {
    const tableExists = (await db.get(
      "SELECT COUNT(*) as c FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'audit_log'"
    ) as { c: number }).c > 0;
    if (!tableExists) return;

    await db.run(`
      INSERT INTO audit_log
        (id, timestamp, module_id, response_status, knowledge_sources_used)
      VALUES (?, NOW(), 'orchestrator', ?, ?)
    `,
      randomUUID(),
      trail.status === 'completed' ? 'completed' : 'error',
      JSON.stringify({ trail_id: trailId, trigger: trail.trigger_type, entries: trail.total_entries, duration_ms: trail.duration_ms })
    );
  } catch {
    // Audit log integration is non-fatal
  }
}

// ── Reasoning Trail ───────────────────────────────────────────────────────────

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
  thinking_content?: string;
  confidence?: number;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
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

/** Append a reasoning entry to an active trail */
export async function addTrailEntry(
  db: DatabaseAdapter,
  trailId: string,
  entry: ReasoningEntryInput
): Promise<void> {
  try {
    const seq = (await db.get(
      'SELECT COUNT(*) as c FROM orchestrator_reasoning_entries WHERE trail_id = ?',
      trailId
    ) as { c: number }).c + 1;

    await db.run(`
      INSERT INTO orchestrator_reasoning_entries
        (id, trail_id, entry_type, sequence_number, title, content,
         thinking_content, confidence, duration_ms, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      randomUUID(),
      trailId,
      entry.entry_type,
      seq,
      entry.title,
      entry.content,
      entry.thinking_content ?? null,
      entry.confidence ?? null,
      entry.duration_ms ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    );

    await db.run(`
      UPDATE orchestrator_reasoning_trails SET total_entries = ? WHERE id = ?
    `, seq, trailId);
  } catch (err) {
    // Trail recording must never break the main cycle
    console.warn('[orchestrator] Trail entry write failed (non-fatal):', err);
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
    const total = (await db.get('SELECT total_entries FROM orchestrator_reasoning_trails WHERE id = ?', trailId) as { total_entries: number } | undefined)?.total_entries ?? 0;

    await db.run(`
      UPDATE orchestrator_reasoning_trails SET
        status = ?, duration_ms = ?, completed_at = ?,
        heartbeat_id  = COALESCE(?, heartbeat_id),
        briefing_id   = COALESCE(?, briefing_id),
        proposal_id   = COALESCE(?, proposal_id),
        execution_id  = COALESCE(?, execution_id)
      WHERE id = ?
    `,
      status, durationMs, now,
      linkages?.heartbeat_id ?? null,
      linkages?.briefing_id ?? null,
      linkages?.proposal_id ?? null,
      linkages?.execution_id ?? null,
      trailId
    );

    // Audit log (sync — non-fatal)
    logTrailToAuditLog(trailId, db, { trigger_type: 'heartbeat', status, total_entries: total, duration_ms: durationMs });
  } catch (err) {
    console.warn('[orchestrator] Trail complete write failed (non-fatal):', err);
  }
}

/** Post-completion async enrichment: narrative summary + workspace file */
export async function enrichTrailAsync(
  trailId: string,
  db: DatabaseAdapter,
  anthropic: AnthropicSDK
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

export async function runHeartbeatCycle(
  db: DatabaseAdapter,
  anthropic: AnthropicSDK,
  period: 'daily' | 'weekly' | 'on_demand' | 'heartbeat' = 'heartbeat',
  forceBriefing: boolean = false
): Promise<{ action: 'none' | 'briefing_generated'; briefingId?: string; signalCount: number; trailId?: string }> {
  const config = await getOrchestratorConfig(db);

  if (config.fully_disabled || config.orchestrator_paused) {
    return { action: 'none', signalCount: 0 };
  }

  const start = Date.now();
  // on_demand gets a wider lookback (7 days) to capture more context
  const lookbackDays = period === 'weekly' ? 14 : period === 'on_demand' ? 7 : 1;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Start reasoning trail
  const triggerType = period === 'on_demand' ? 'on_demand' : 'heartbeat';
  const trailId = await createReasoningTrail(db, triggerType, (config as OrchestratorConfig & { reasoning_transparency_level?: number }).reasoning_transparency_level ?? 1);

  let signals: PlatformSignal[] = [];
  let action: 'none' | 'briefing_generated' = 'none';
  let briefingId: string | undefined;
  let heartbeatId: string | undefined;
  let error: string | undefined;
  let spendGatePaused = false;

  try {
    // Step 1: Aggregate signals
    const signalStart = Date.now();
    signals = await aggregateSignals(db, since);
    await addTrailEntry(db, trailId, {
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
      if (gate.paused) {
        console.log(`[orchestrator] Spend gate active — skipping LLM briefing generation (${gate.reason})`);
        await addTrailEntry(db, trailId, {
          entry_type: 'signal_assessment',
          title: 'Spend gate active — LLM briefing generation paused',
          content: `${gate.reason}. ${signals.length} signals were aggregated deterministically but no LLM call was made. Rate any recent proposal on the Orchestrator dashboard to resume.`,
          metadata: { spend_gate: true, unrated_streak: gate.unratedStreak, threshold: gate.threshold },
        });
      }
    }

    if (!spendGatePaused) {
    // Step 2: Assess significance
    const assessStart = Date.now();
    const significant = forceBriefing || (await assessSignificance(signals, anthropic));
    await addTrailEntry(db, trailId, {
      entry_type: 'signal_assessment',
      title: significant ? 'Signals assessed as significant — briefing warranted' : 'Signals assessed as routine — no briefing needed',
      content: significant
        ? `Assessment result: SIGNIFICANT. ${forceBriefing ? 'Force-briefing requested.' : `${signals.filter(s => s.urgency >= 0.7).length} high-urgency signals and/or ≥3 moderate signals detected.`}`
        : `Assessment result: ROUTINE. ${signals.length} signals detected but none meet the significance threshold individually or collectively.`,
      confidence: significant ? 0.9 : 0.8,
      duration_ms: Date.now() - assessStart,
      metadata: { significant, forced: forceBriefing, signal_count: signals.length },
    });

    if (significant || period !== 'heartbeat') {
      // Step 3: Generate briefing + proposals
      const briefingStart = Date.now();
      await addTrailEntry(db, trailId, {
        entry_type: 'proposal_reasoning',
        title: `Generating ${period} briefing with proposal recommendations`,
        content: `Calling ${config.briefing_model} to analyse ${signals.length} signals and generate actionable proposals.\n\nSignal composition:\n${[...new Set(signals.map(s => s.source))].map(src => `- ${src}: ${signals.filter(s => s.source === src).length} signals`).join('\n')}`,
        metadata: { model: config.briefing_model, signal_count: signals.length, period },
      });

      const briefingThinking = !!(config as OrchestratorConfig).briefing_thinking_enabled;
      const { content, proposals } = await generateBriefing(signals, anthropic, config.briefing_model, period, briefingThinking, db);

      await addTrailEntry(db, trailId, {
        entry_type: 'completion_summary',
        title: `Briefing generated — ${proposals.length} proposals`,
        content: `Briefing generation complete.\n\nProposals generated: ${proposals.length}\n${proposals.slice(0, 5).map((p, i) => `${i + 1}. [${p.action_type}] ${p.proposed_action} (confidence: ${Math.round(p.confidence_score * 100)}%)`).join('\n')}`,
        confidence: proposals.length > 0 ? proposals.reduce((a, p) => a + p.confidence_score, 0) / proposals.length : 0,
        duration_ms: Date.now() - briefingStart,
        metadata: { proposals_count: proposals.length, action_types: [...new Set(proposals.map(p => p.action_type))] },
      });

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
    } // end !spendGatePaused (LLM steps)
  } catch (err) {
    error = String(err);
    console.error('[orchestrator] Heartbeat cycle error:', err);
    await addTrailEntry(db, trailId, {
      entry_type: 'completion_summary',
      title: 'Cycle failed with error',
      content: `Error during heartbeat cycle: ${error}`,
      metadata: { error },
    });
  }

  // Log heartbeat
  heartbeatId = randomUUID();
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

  // Complete trail
  await completeTrail(db, trailId, error ? 'failed' : 'completed', Date.now() - start, {
    heartbeat_id: heartbeatId,
    briefing_id: briefingId,
  });

  // Async enrichment: narrative summary + workspace file (non-blocking)
  if (action === 'briefing_generated') {
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
        for (const pat of patterns.slice(0, 3)) { // max 3 pattern proposals per cycle
          recordPatternDetection(db, pat, briefingId ?? null);
        }
        console.log(`[orchestrator] Pattern engine: ${patterns.length} patterns detected, ${Math.min(patterns.length, 3)} recorded`);
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

  return { action, briefingId, signalCount: signals.length, trailId };
}
