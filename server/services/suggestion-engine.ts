import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';

export interface Suggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  type: 'deadline' | 'quality' | 'radar' | 'workflow' | 'followup';
  title: string;
  description: string;
  actionUrl?: string;
  actionLabel?: string;
  createdAt: string;
}

interface DeadlineRow {
  id: string;
  title: string;
  due_date: string;
  status: string;
  priority: string;
}

interface QualityBaselineRow {
  module_id: string;
  baseline_score: number;
}

interface SessionRow {
  id: string;
  module_id: string;
  title: string;
  updated_at: string;
}

const MODULE_NEXT_STEP: Record<string, { module: string; label: string; url: string }> = {
  'gap-analysis':        { module: 'document-creation', label: 'Create remediation policy', url: '/modules/document-creation' },
  'document-creation':   { module: 'risk-assessment',   label: 'Assess risk profile',        url: '/modules/risk-assessment' },
  'sanctions-advisory':  { module: 'gap-analysis',      label: 'Run sanctions gap analysis', url: '/modules/gap-analysis' },
  'regulatory-monitor':  { module: 'gap-analysis',      label: 'Analyse regulatory impact',  url: '/modules/gap-analysis' },
  'risk-assessment':     { module: 'document-creation', label: 'Document risk findings',     url: '/modules/document-creation' },
  'training-content':    { module: 'document-creation', label: 'Create supporting policy',   url: '/modules/document-creation' },
  'data-management':     { module: 'gap-analysis',      label: 'Run data gap analysis',      url: '/modules/gap-analysis' },
  'investigation-support': { module: 'document-creation', label: 'Document investigation findings', url: '/modules/document-creation' },
};

function daysFromNow(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export async function generateSuggestions(
  db: DatabaseAdapter,
  _userId?: string
): Promise<Suggestion[]> {
  const suggestions: Suggestion[] = [];

  // ── 1. Deadline-based suggestions ───────────────────────────────────────────
  // Find deadlines due within the next 7 days that are not completed
  try {
    const upcomingDeadlines = await db.all(
        `SELECT id, title, due_date, status, priority
         FROM deadlines
         WHERE status != 'completed'
           AND due_date IS NOT NULL
           AND due_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
         ORDER BY due_date::date ASC
         LIMIT 3`
      ) as DeadlineRow[];

    for (const deadline of upcomingDeadlines) {
      const days = daysFromNow(deadline.due_date);
      const isOverdue = days < 0;
      const urgencyLabel = isOverdue
        ? `Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}`
        : days === 0
        ? 'Due today'
        : `Due in ${days} day${days !== 1 ? 's' : ''}`;

      suggestions.push({
        id: randomUUID(),
        priority: isOverdue || days <= 1 ? 'high' : days <= 3 ? 'medium' : 'low',
        type: 'deadline',
        title: `Deadline: ${deadline.title}`,
        description: urgencyLabel,
        actionUrl: '/deadlines',
        actionLabel: 'View Deadlines',
        createdAt: new Date().toISOString(),
      });
    }
  } catch {
    // deadlines table may not exist — fail gracefully
  }

  // ── 2. Quality-based suggestions ────────────────────────────────────────────
  // Find modules with a quality baseline below 7 (out of 10)
  try {
    const lowQuality = await db.all(
        `SELECT module_id, baseline_score
         FROM quality_baselines
         WHERE baseline_score < 7
         ORDER BY baseline_score ASC
         LIMIT 2`
      ) as QualityBaselineRow[];

    for (const row of lowQuality) {
      const moduleLabel = row.module_id
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      suggestions.push({
        id: randomUUID(),
        priority: 'medium',
        type: 'quality',
        title: `Quality opportunity: ${moduleLabel}`,
        description: `Average output score is ${row.baseline_score.toFixed(1)}/10. Consider refining the system prompt or reviewing recent outputs.`,
        actionUrl: `/modules/${row.module_id}`,
        actionLabel: 'Open Module',
        createdAt: new Date().toISOString(),
      });
    }
  } catch {
    // quality_baselines table may not exist — fail gracefully
  }

  // ── 3. Recent session follow-up suggestions ─────────────────────────────────
  // Suggest logical next modules based on the last 3 sessions
  try {
    const recentSessions = await db.all(
        `SELECT id, module_id, title, updated_at
         FROM sessions
         ORDER BY updated_at DESC
         LIMIT 3`
      ) as SessionRow[];

    const seen = new Set<string>();
    for (const session of recentSessions) {
      const next = MODULE_NEXT_STEP[session.module_id];
      if (next && !seen.has(next.module)) {
        seen.add(next.module);
        suggestions.push({
          id: randomUUID(),
          priority: 'low',
          type: 'followup',
          title: next.label,
          description: `Based on your recent "${session.title}" session — a logical next step is the ${next.module
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')} module.`,
          actionUrl: next.url,
          actionLabel: 'Open Module',
          createdAt: new Date().toISOString(),
        });
      }
    }
  } catch {
    // sessions table error — fail gracefully
  }

  // ── Sort and cap ─────────────────────────────────────────────────────────────
  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  return suggestions.slice(0, 5);
}
