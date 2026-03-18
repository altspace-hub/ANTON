/**
 * orchestrator-pattern-engine.ts
 *
 * Phase 3: Pattern Recognition Engine for ANTON Orchestrator.
 *
 * Detects recurring patterns from platform signal history and either:
 *   - Proposes automation (Stage 2: human approval required)
 *   - Auto-executes (Stage 3+: if auto_execute=1 and within hard limits)
 *
 * Pattern types:
 *   - workflow_recurrence: same workflow triggered repeatedly on a schedule
 *   - quality_drop: quality decline in a specific module
 *   - signal_cluster: multiple high-urgency signals from the same source
 *   - deadline_cluster: multiple deadlines in a short window
 *   - compliance_repeat: same rule violated repeatedly
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

import { ORCHESTRATOR_HARD_LIMITS } from './orchestrator-engine.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DetectedPattern {
  pattern_id: string;
  pattern_type: string;
  name: string;
  description: string;
  suggested_action: string;
  confidence: number;
  signal_data: Record<string, unknown>;
  auto_execute: boolean;
}

// ── Built-in pattern detectors ─────────────────────────────────────────────────

/** Detect quality drops: module score declining consistently */
async function detectQualityDropPatterns(db: DatabaseAdapter): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  try {
    const rows = await db.all(`
      SELECT qs.module_id,
             AVG(CASE WHEN qs.scored_at >= NOW() - INTERVAL '7 days' THEN qs.score_overall END) as recent_avg,
             AVG(CASE WHEN qs.scored_at < NOW() - INTERVAL '7 days' AND qs.scored_at >= NOW() - INTERVAL '21 days' THEN qs.score_overall END) as prior_avg,
             COUNT(*) as total_scores
      FROM quality_scores qs
      WHERE qs.scored_at >= NOW() - INTERVAL '21 days'
      GROUP BY qs.module_id
      HAVING AVG(CASE WHEN qs.scored_at >= NOW() - INTERVAL '7 days' THEN qs.score_overall END) IS NOT NULL AND AVG(CASE WHEN qs.scored_at < NOW() - INTERVAL '7 days' AND qs.scored_at >= NOW() - INTERVAL '21 days' THEN qs.score_overall END) IS NOT NULL
        AND AVG(CASE WHEN qs.scored_at < NOW() - INTERVAL '7 days' AND qs.scored_at >= NOW() - INTERVAL '21 days' THEN qs.score_overall END) - AVG(CASE WHEN qs.scored_at >= NOW() - INTERVAL '7 days' THEN qs.score_overall END) >= 1.5
        AND COUNT(*) >= 4
      ORDER BY (prior_avg - recent_avg) DESC
      LIMIT 5
    `) as Array<{ module_id: string; recent_avg: number; prior_avg: number; total_scores: number }>;

    for (const r of rows) {
      const decline = r.prior_avg - r.recent_avg;
      const confidence = Math.min(0.95, 0.6 + decline * 0.1);
      patterns.push({
        pattern_id: `qd-${r.module_id}`,
        pattern_type: 'quality_drop',
        name: `Quality decline: ${r.module_id}`,
        description: `Module "${r.module_id}" average score dropped from ${r.prior_avg.toFixed(1)} to ${r.recent_avg.toFixed(1)} over 7 days (${r.total_scores} samples)`,
        suggested_action: `Review and re-tune system prompt for ${r.module_id} module — quality has declined consistently`,
        confidence,
        signal_data: { module_id: r.module_id, recent_avg: r.recent_avg, prior_avg: r.prior_avg, decline },
        auto_execute: false,
      });
    }
  } catch (e) { if (String(e).includes('no such table')) { /* expected on fresh DB */ } else { console.warn('[pattern-engine] qualityDrop:', e); } }
  return patterns;
}

/** Detect workflow recurrence: same workflow run multiple times in a period */
async function detectWorkflowRecurrencePatterns(db: DatabaseAdapter): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  try {
    const rows = await db.all(`
      SELECT workflow_id, COUNT(*) as run_count,
             MIN(started_at) as first_run, MAX(started_at) as last_run,
             AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_rate
      FROM workflow_runs
      WHERE started_at >= NOW() - INTERVAL '30 days'
      GROUP BY workflow_id
      HAVING COUNT(*) >= 3
      ORDER BY run_count DESC
      LIMIT 8
    `) as Array<{ workflow_id: string; run_count: number; first_run: string; last_run: string; success_rate: number }>;

    for (const r of rows) {
      // Only suggest automation if success rate is good
      if (r.success_rate < 0.7) continue;
      const daysBetween = (new Date(r.last_run).getTime() - new Date(r.first_run).getTime()) / (1000 * 60 * 60 * 24);
      const avgFrequencyDays = daysBetween / (r.run_count - 1);
      const confidence = Math.min(0.9, 0.5 + (r.run_count * 0.08) + (r.success_rate * 0.2));
      patterns.push({
        pattern_id: `wr-${r.workflow_id}`,
        pattern_type: 'workflow_recurrence',
        name: `Recurring workflow: ${r.workflow_id}`,
        description: `"${r.workflow_id}" has been run ${r.run_count} times in 30 days (avg every ${avgFrequencyDays.toFixed(1)} days, ${Math.round(r.success_rate * 100)}% success rate)`,
        suggested_action: `Schedule "${r.workflow_id}" to run automatically every ${Math.round(avgFrequencyDays)} day(s) — pattern shows consistent manual execution`,
        confidence,
        signal_data: { workflow_id: r.workflow_id, run_count: r.run_count, avg_frequency_days: avgFrequencyDays, success_rate: r.success_rate },
        auto_execute: false, // Automation scheduling requires human approval
      });
    }
  } catch (e) { if (String(e).includes('no such table')) { /* expected */ } else { console.warn('[pattern-engine] workflowRecurrence:', e); } }
  return patterns;
}

/** Detect signal clusters: multiple high-urgency signals from the same source recently */
async function detectSignalClusterPatterns(db: DatabaseAdapter): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  try {
    // Check radar items clustering
    const radarClusters = await db.all(`
      SELECT item_type, COUNT(*) as count, AVG(urgency_score) as avg_urgency
      FROM radar_items
      WHERE fetched_at >= NOW() - INTERVAL '3 days'
        AND urgency_score >= 0.6
      GROUP BY item_type
      HAVING COUNT(*) >= 3
    `) as Array<{ item_type: string; count: number; avg_urgency: number }>;

    for (const r of radarClusters) {
      patterns.push({
        pattern_id: `sc-radar-${r.item_type}`,
        pattern_type: 'signal_cluster',
        name: `Regulatory signal cluster: ${r.item_type}`,
        description: `${r.count} high-urgency ${r.item_type} signals detected in the last 3 days (avg urgency ${Math.round(r.avg_urgency * 100)}%)`,
        suggested_action: `Generate comprehensive regulatory briefing covering all recent ${r.item_type} developments — cluster suggests coordinated regulatory activity`,
        confidence: Math.min(0.85, 0.55 + r.count * 0.08),
        signal_data: { item_type: r.item_type, count: r.count, avg_urgency: r.avg_urgency },
        auto_execute: false,
      });
    }
  } catch (e) { if (String(e).includes('no such table')) { /* expected */ } else { console.warn('[pattern-engine] signalCluster:', e); } }
  return patterns;
}

/** Detect deadline clusters: multiple deadlines in a 2-week window */
async function detectDeadlineClusterPatterns(db: DatabaseAdapter): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  try {
    const result = await db.all(`
      SELECT COUNT(*) as count,
             STRING_AGG(title, ' | ') as titles,
             MIN(due_date) as earliest
      FROM deadlines
      WHERE status NOT IN ('completed','cancelled')
        AND due_date::date - CURRENT_DATE BETWEEN 0 AND 14
    `) as { count: number; titles: string | null; earliest: string | null } | undefined;

    if (result && result.count >= 3) {
      patterns.push({
        pattern_id: 'dc-upcoming',
        pattern_type: 'deadline_cluster',
        name: `Deadline cluster: ${result.count} due in 14 days`,
        description: `${result.count} active deadlines fall within the next 14 days — workload spike risk`,
        suggested_action: 'Generate priority triage and resource allocation plan for upcoming deadline cluster',
        confidence: 0.80,
        signal_data: { count: result.count, earliest: result.earliest },
        auto_execute: false,
      });
    }
  } catch (e) { if (String(e).includes('no such table')) { /* expected */ } else { console.warn('[pattern-engine] deadlineCluster:', e); } }
  return patterns;
}

// ── Auto-pause quality check ───────────────────────────────────────────────────

/**
 * Check if orchestrator quality is declining (auto-pause trigger).
 * Returns true if quality issues warrant pausing the orchestrator.
 */
export async function shouldAutoPause(db: DatabaseAdapter): { pause: boolean; reason: string } {
  try {
    // Check if more than 40% of proposals in last 7 days are rated as wrong/irrelevant
    const ratings = await db.get(`
      SELECT
        SUM(CASE WHEN human_rating IN ('wrong', 'irrelevant') THEN 1 ELSE 0 END) as bad,
        COUNT(*) as total
      FROM orchestrator_proposals
      WHERE decided_at >= NOW() - INTERVAL '7 days'
        AND human_rating IS NOT NULL
    `) as { bad: number; total: number } | undefined;

    if (ratings && ratings.total >= 5 && (ratings.bad / ratings.total) >= 0.4) {
      return {
        pause: true,
        reason: `${Math.round(ratings.bad / ratings.total * 100)}% of recent proposals rated wrong/irrelevant (${ratings.bad}/${ratings.total}) — auto-pausing for recalibration`,
      };
    }
  } catch { /* ignore */ }
  return { pause: false, reason: '' };
}

// ── Pattern detection main entry ───────────────────────────────────────────────

/**
 * Run all pattern detectors and return unique detected patterns.
 * Deduplicates against recently detected patterns (same pattern_id in last 24h).
 */
export async function detectPatterns(db: DatabaseAdapter): DetectedPattern[] {
  const allPatterns: DetectedPattern[] = [
    ...detectQualityDropPatterns(db),
    ...detectWorkflowRecurrencePatterns(db),
    ...detectSignalClusterPatterns(db),
    ...detectDeadlineClusterPatterns(db),
  ];

  // Dedup: skip if same pattern_id was detected in last 24h
  const recentIds = new Set<string>();
  try {
    const recent = await db.get(
      "SELECT signal_data FROM orchestrator_pattern_detections WHERE detected_at >= NOW() - INTERVAL '24 hours'"
    ) as Array<{ signal_data: string | null }>;
    for (const r of recent) {
      if (r.signal_data) {
        try {
          const d = JSON.parse(r.signal_data) as { pattern_id?: string };
          if (d.pattern_id) recentIds.add(d.pattern_id);
        } catch { /* ignore */ }
      }
    }
  } catch (e) { if (!String(e).includes('no such table')) { console.warn('[pattern-engine] dedup check:', e); } }

  return allPatterns.filter(p => !recentIds.has(p.pattern_id));
}

// ── Persist pattern detection + create proposal ────────────────────────────────

/**
 * Record a detected pattern in the DB and optionally create a briefing proposal.
 * Returns the created proposal ID, or null if skipped.
 */
export async function recordPatternDetection(
  db: DatabaseAdapter,
  pattern: DetectedPattern,
  briefingId: string | null
): string | null {
  const detectionId = randomUUID();
  try {
    // Upsert pattern definition
    const existing = await db.get('SELECT id FROM orchestrator_patterns WHERE id = ?', pattern.pattern_id);
    if (!existing) {
      await db.run(`
        INSERT INTO orchestrator_patterns
          (id, pattern_type, name, description, suggested_action, auto_execute, executions_count, last_detected_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, NOW())
      `, 
        pattern.pattern_id, pattern.pattern_type, pattern.name,
        pattern.description, pattern.suggested_action,
        pattern.auto_execute ? 1 : 0
      );
    } else {
      await db.run(`
        UPDATE orchestrator_patterns SET
          executions_count = executions_count + 1,
          last_detected_at = NOW(),
          updated_at = NOW()
        WHERE id = ?
      `, pattern.pattern_id);
    }

    // Create proposal if briefing exists
    let proposalId: string | null = null;
    if (briefingId) {
      proposalId = randomUUID();
      await db.run(`
        INSERT INTO orchestrator_proposals
          (id, briefing_id, signal_source, signal_summary, action_type,
           proposed_action, confidence_score, urgency_score, rationale)
        VALUES (?, ?, 'pattern', ?, 'pattern_suggestion', ?, ?, 0.6, ?)
      `, 
        proposalId, briefingId,
        pattern.description,
        pattern.suggested_action,
        pattern.confidence,
        `Pattern "${pattern.name}" detected: ${pattern.description}`,
      );
    }

    // Log detection
    await db.run(`
      INSERT INTO orchestrator_pattern_detections
        (id, pattern_id, signal_data, proposal_id, auto_executed)
      VALUES (?, ?, ?, ?, 0)
    `, detectionId, pattern.pattern_id, JSON.stringify({ ...pattern.signal_data, pattern_id: pattern.pattern_id }), proposalId);

    return proposalId;
  } catch (e) {
    console.warn('[pattern-engine] recordPatternDetection error:', e);
    return null;
  }
}

/** Check auto-execution eligibility and return count of auto-executions today */
export function getAutoExecutionCount(db: DatabaseAdapter): number {
  try {

    return r.c;
  } catch { return 0; }
}

/** Check if daily auto-execution limit has been reached */
export function isAutoExecutionAllowed(db: DatabaseAdapter): boolean {
  return getAutoExecutionCount(db) < ORCHESTRATOR_HARD_LIMITS.MAX_AUTO_EXECUTIONS_PER_DAY;
}
