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
import type Database from 'better-sqlite3';
import AnthropicSDK from '@anthropic-ai/sdk';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignalSource =
  | 'radar' | 'deadline' | 'quality' | 'pattern' | 'workflow'
  | 'assignment' | 'compliance' | 'apprentice' | 'knowledge_graph' | 'proactive';

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
}

// ── Config loader ─────────────────────────────────────────────────────────────

export function getOrchestratorConfig(db: Database.Database): OrchestratorConfig {
  const row = db.prepare('SELECT * FROM orchestrator_config WHERE id = ?').get('default') as OrchestratorConfig | undefined;
  return row ?? {
    heartbeat_enabled: 1,
    heartbeat_interval_minutes: 30,
    briefing_schedule: 'daily',
    radar_urgency_threshold: 0.7,
    quality_decline_threshold: 1.5,
    deadline_alert_days: 14,
    heartbeat_model: 'claude-haiku-4-5-20251001',
    briefing_model: 'claude-sonnet-4-6',
    orchestrator_paused: 0,
    fully_disabled: 0,
  };
}

// ── Signal Readers ────────────────────────────────────────────────────────────

/** Read high-urgency new regulatory radar items since lastChecked */
function readRadarSignals(db: Database.Database, threshold: number, since: Date): PlatformSignal[] {
  const rows = db.prepare(`
    SELECT ri.id, ri.title, ri.urgency_score, ri.relevance_score, ri.item_type,
           ri.published_date, ri.summary, rs.display_name as source_name
    FROM radar_items ri
    LEFT JOIN radar_sources rs ON ri.source_id = rs.id
    WHERE ri.urgency_score >= ?
      AND ri.status = 'new'
      AND (ri.created_at >= ? OR ri.published_date >= ?)
    ORDER BY ri.urgency_score DESC
    LIMIT 10
  `).all(threshold, since.toISOString(), since.toISOString().substring(0, 10)) as Array<{
    id: string; title: string; urgency_score: number; relevance_score: number;
    item_type: string; published_date: string; summary: string | null; source_name: string | null;
  }>;

  return rows.map(r => ({
    source: 'radar' as const,
    signal_id: r.id,
    summary: `${r.item_type === 'consultation' ? 'Consultation' : 'Regulatory update'}: "${r.title}" from ${r.source_name ?? 'regulatory source'} — urgency ${Math.round(r.urgency_score * 100)}%`,
    urgency: r.urgency_score,
    relevance: r.relevance_score,
    detected_at: r.published_date ?? new Date().toISOString(),
    raw_data: { id: r.id, title: r.title, item_type: r.item_type, summary: r.summary },
  }));
}

/** Read approaching and overdue deadlines */
function readDeadlineSignals(db: Database.Database, alertDays: number): PlatformSignal[] {
  const rows = db.prepare(`
    SELECT id, title, due_date, category, priority, status,
           julianday(due_date) - julianday('now') as days_remaining
    FROM deadlines
    WHERE status NOT IN ('completed','cancelled')
      AND julianday(due_date) - julianday('now') <= ?
    ORDER BY due_date ASC
    LIMIT 15
  `).all(alertDays) as Array<{
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
function readQualitySignals(db: Database.Database, declineThreshold: number): PlatformSignal[] {
  // Find modules where recent average is below baseline by threshold
  const rows = db.prepare(`
    SELECT qs.module_id,
           AVG(qs.score_overall) as recent_avg,
           qb.baseline_score,
           qb.baseline_score - AVG(qs.score_overall) as decline,
           COUNT(*) as sample_count
    FROM quality_scores qs
    JOIN quality_baselines qb ON qb.module_id = qs.module_id
    WHERE qs.scored_at >= datetime('now', '-14 days')
    GROUP BY qs.module_id
    HAVING decline >= ? AND sample_count >= 2
    ORDER BY decline DESC
    LIMIT 8
  `).all(declineThreshold) as Array<{
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
function readPatternSignals(db: Database.Database, since: Date): PlatformSignal[] {
  const rows = db.prepare(`
    SELECT id, pattern_type, pattern_subtype, description, confidence_score, created_at
    FROM detected_patterns
    WHERE status = 'active'
      AND confidence_score >= 0.6
      AND created_at >= ?
    ORDER BY confidence_score DESC
    LIMIT 5
  `).all(since.toISOString()) as Array<{
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
function readComplianceSignals(db: Database.Database): PlatformSignal[] {
  const rows = db.prepare(`
    SELECT rv.id, rv.description, rv.severity, rv.affected_entity, rv.created_at,
           cr.title as rule_title
    FROM rule_violations rv
    JOIN compliance_rules cr ON cr.id = rv.rule_id
    WHERE rv.remediation_status = 'open'
      AND rv.severity IN ('critical','high')
    ORDER BY CASE rv.severity WHEN 'critical' THEN 0 ELSE 1 END, rv.created_at DESC
    LIMIT 8
  `).all() as Array<{
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
function readAssignmentSignals(db: Database.Database): PlatformSignal[] {
  const rows = db.prepare(`
    SELECT id, assigned_to, execution_id, due_at, notes,
           julianday('now') - julianday(due_at) as days_overdue
    FROM step_assignments
    WHERE status = 'pending'
      AND due_at IS NOT NULL
      AND due_at < datetime('now')
    ORDER BY due_at ASC
    LIMIT 10
  `).all() as Array<{
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
function readWorkflowSignals(db: Database.Database, since: Date): PlatformSignal[] {
  const rows = db.prepare(`
    SELECT id, workflow_id, status, error_message, started_at, completed_at
    FROM workflow_runs
    WHERE status IN ('failed','error')
      AND started_at >= ?
    ORDER BY started_at DESC
    LIMIT 8
  `).all(since.toISOString()) as Array<{
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
function readApprenticeSignals(db: Database.Database, since: Date): PlatformSignal[] {
  const rows = db.prepare(`
    SELECT ap.id, ap.module_id, ap.area_id, ap.current_stage, ap.sessions_completed,
           ap.quality_avg, ap.last_session
    FROM apprentice_profiles ap
    WHERE ap.last_session >= ?
      AND ap.sessions_completed >= 5
      AND ap.quality_avg >= 7.5
      AND ap.current_stage < 4
    ORDER BY ap.quality_avg DESC
    LIMIT 5
  `).all(since.toISOString()) as Array<{
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

/** Read unread high-severity proactive insights */
function readProactiveSignals(db: Database.Database): PlatformSignal[] {
  const rows = db.prepare(`
    SELECT id, insight_type, title, body, severity, created_at
    FROM proactive_insights
    WHERE read = 0 AND dismissed = 0
      AND severity IN ('high','critical')
    ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, created_at DESC
    LIMIT 5
  `).all() as Array<{
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

// ── Signal Aggregation ────────────────────────────────────────────────────────

export async function aggregateSignals(
  db: Database.Database,
  since: Date
): Promise<PlatformSignal[]> {
  const config = getOrchestratorConfig(db);

  const allSignals: PlatformSignal[] = [
    ...readRadarSignals(db, config.radar_urgency_threshold, since),
    ...readDeadlineSignals(db, config.deadline_alert_days),
    ...readQualitySignals(db, config.quality_decline_threshold),
    ...readPatternSignals(db, since),
    ...readComplianceSignals(db),
    ...readAssignmentSignals(db),
    ...readWorkflowSignals(db, since),
    ...readApprenticeSignals(db, since),
    ...readProactiveSignals(db),
  ];

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

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : 'NO';
    return text.toUpperCase().startsWith('YES');
  } catch {
    // On LLM error, use rule-based fallback
    return signals.filter(s => s.urgency >= 0.5).length >= 2;
  }
}

// ── Briefing Generation (Sonnet — daily, moderate reasoning) ─────────────────

const BRIEFING_SYSTEM_PROMPT = `You are ANTON's AI Orchestrator — an intelligent operations management layer for Financial Crime Prevention compliance teams.

Your role is to read platform signals and produce a clear, actionable situational briefing that helps the compliance team prioritise their work.

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
      "signal_source": "radar|deadline|quality|pattern|workflow|assignment|compliance|apprentice|proactive",
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

Omit proposals for signals where the right action is unclear or confidence is below 0.6.`;

export async function generateBriefing(
  signals: PlatformSignal[],
  anthropic: AnthropicSDK,
  model: string,
  period: 'daily' | 'weekly' | 'on_demand' | 'heartbeat' = 'daily'
): Promise<{ content: string; proposals: OrchestratorProposal[] }> {
  const signalSummary = signals
    .slice(0, 20)
    .map(s => `[${s.source.toUpperCase()}] urgency=${s.urgency.toFixed(2)} relevance=${s.relevance.toFixed(2)}\nID: ${s.signal_id}\n${s.summary}`)
    .join('\n\n');

  const userMessage = `Generate a ${period} compliance operations briefing based on these platform signals.

PLATFORM SIGNALS (${signals.length} total):
${signalSummary || 'No significant signals detected.'}

Current date: ${new Date().toISOString().substring(0, 10)}`;

  let raw = '';
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      system: BRIEFING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
    raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
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

export function saveBriefing(
  db: Database.Database,
  briefing: Omit<OrchestratorBriefing, 'id'>,
  userId: string = 'solo'
): string {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO orchestrator_briefings
      (id, user_id, period, signals_read, proposals_count, content, signals_data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    briefing.period,
    briefing.signals_read,
    briefing.proposals_count,
    briefing.content,
    JSON.stringify(briefing.signals_data)
  );

  // Save individual proposals
  for (const p of briefing.proposals) {
    db.prepare(`
      INSERT INTO orchestrator_proposals
        (id, briefing_id, signal_source, signal_id, signal_summary,
         action_type, proposed_action, confidence_score, urgency_score, rationale, estimated_effort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
  db.prepare(`
    UPDATE orchestrator_stage SET
      total_briefings = total_briefings + 1,
      total_proposals = total_proposals + ?,
      updated_at = datetime('now')
    WHERE id = 'default'
  `).run(briefing.proposals.length);

  return id;
}

// ── Stage Progression Check ───────────────────────────────────────────────────

export function checkStageProgression(db: Database.Database): { advanced: boolean; newStage?: number; reason?: string } {
  const stage = db.prepare('SELECT * FROM orchestrator_stage WHERE id = ?').get('default') as {
    current_stage: number;
    stage_entered_at: string;
    total_briefings: number;
    total_proposals: number;
    proposals_rated: number;
    proposals_good_or_relevant: number;
    proposals_irrelevant_or_wrong: number;
    stage_history: string;
  } | undefined;

  if (!stage || stage.current_stage >= 4) return { advanced: false };

  const daysSinceEntry = Math.floor(
    (Date.now() - new Date(stage.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Stage 1 → 2 criteria
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
      const now = new Date().toISOString();
      const history = JSON.parse(stage.stage_history || '[]') as unknown[];
      history.push({ stage: 1, entered_at: stage.stage_entered_at, exited_at: now, reason: `Criteria met: ${Math.round(goodRate * 100)}% good/relevant, ${Math.round(badRate * 100)}% irrelevant/wrong` });

      db.prepare(`
        UPDATE orchestrator_stage SET
          current_stage = 2,
          stage_entered_at = ?,
          stage_history = ?,
          updated_at = ?
        WHERE id = 'default'
      `).run(now, JSON.stringify(history), now);

      return { advanced: true, newStage: 2, reason: `Stage 1 criteria met after ${daysSinceEntry} days` };
    }
  }

  return { advanced: false };
}

// ── Full Heartbeat Cycle ──────────────────────────────────────────────────────

export async function runHeartbeatCycle(
  db: Database.Database,
  anthropic: AnthropicSDK,
  period: 'daily' | 'weekly' | 'on_demand' | 'heartbeat' = 'heartbeat',
  forceBriefing: boolean = false
): Promise<{ action: 'none' | 'briefing_generated'; briefingId?: string; signalCount: number }> {
  const config = getOrchestratorConfig(db);

  if (config.fully_disabled || config.orchestrator_paused) {
    return { action: 'none', signalCount: 0 };
  }

  const start = Date.now();
  const since = new Date(Date.now() - (period === 'weekly' ? 7 : 1) * 24 * 60 * 60 * 1000);

  let signals: PlatformSignal[] = [];
  let action: 'none' | 'briefing_generated' = 'none';
  let briefingId: string | undefined;
  let error: string | undefined;

  try {
    signals = await aggregateSignals(db, since);
    const significant = forceBriefing || (await assessSignificance(signals, anthropic));

    if (significant || period !== 'heartbeat') {
      const { content, proposals } = await generateBriefing(signals, anthropic, config.briefing_model, period);
      briefingId = saveBriefing(db, {
        period,
        content,
        signals_read: signals.length,
        proposals_count: proposals.length,
        signals_data: signals,
        proposals,
      });
      action = 'briefing_generated';
    }
  } catch (err) {
    error = String(err);
    console.error('[orchestrator] Heartbeat cycle error:', err);
  }

  // Log heartbeat
  db.prepare(`
    INSERT INTO orchestrator_heartbeats
      (id, signals_checked, signals_significant, action_taken, duration_ms, error_message, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    signals.length,
    signals.filter(s => s.urgency >= 0.6).length,
    action,
    Date.now() - start,
    error ?? null,
    error ? 'error' : 'ok'
  );

  // Check stage progression daily
  if (period === 'daily' || period === 'on_demand') {
    checkStageProgression(db);
  }

  return { action, briefingId, signalCount: signals.length };
}
