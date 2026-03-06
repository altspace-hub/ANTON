/**
 * proactive-intelligence.ts
 * Generates proactive insights by analysing cross-session knowledge atoms,
 * patterns, and entity relationships. Surfaces insights the user hasn't asked for
 * but would want to know.
 */

import { randomUUID } from 'crypto';
import type { Database } from 'better-sqlite3';

export interface ProactiveInsight {
  id: string;
  insight_type: 'pattern' | 'gap' | 'conflict' | 'opportunity' | 'risk' | 'trend';
  title: string;
  body: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  source_session_ids: string[];
  source_atom_ids: string[];
  area_id: string | null;
  module_id: string | null;
  user_id: string;
  dismissed: boolean;
  dismissed_at: string | null;
  read: boolean;
  read_at: string | null;
  action_taken: string | null;
  created_at: string;
  expires_at: string | null;
}

interface RawInsightRow {
  id: string;
  insight_type: string;
  title: string;
  body: string;
  severity: string;
  source_session_ids: string;
  source_atom_ids: string;
  area_id: string | null;
  module_id: string | null;
  user_id: string;
  dismissed: number;
  dismissed_at: string | null;
  read: number;
  read_at: string | null;
  action_taken: string | null;
  created_at: string;
  expires_at: string | null;
}

function parseInsight(row: RawInsightRow): ProactiveInsight {
  return {
    ...row,
    insight_type: row.insight_type as ProactiveInsight['insight_type'],
    severity: row.severity as ProactiveInsight['severity'],
    source_session_ids: JSON.parse(row.source_session_ids || '[]'),
    source_atom_ids: JSON.parse(row.source_atom_ids || '[]'),
    dismissed: Boolean(row.dismissed),
    read: Boolean(row.read),
  };
}

export interface CreateInsightInput {
  insight_type: ProactiveInsight['insight_type'];
  title: string;
  body: string;
  severity?: ProactiveInsight['severity'];
  source_session_ids?: string[];
  source_atom_ids?: string[];
  area_id?: string;
  module_id?: string;
  user_id?: string;
  expires_at?: string;
}

export function createProactiveIntelligenceService(db: Database) {
  /**
   * Manually create an insight (used by radar, compliance, file watcher).
   */
  function createInsight(input: CreateInsightInput): ProactiveInsight {
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO proactive_insights
        (id, insight_type, title, body, severity, source_session_ids, source_atom_ids,
         area_id, module_id, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.insight_type,
      input.title,
      input.body,
      input.severity ?? 'medium',
      JSON.stringify(input.source_session_ids ?? []),
      JSON.stringify(input.source_atom_ids ?? []),
      input.area_id ?? null,
      input.module_id ?? null,
      input.user_id ?? 'default',
      now,
      input.expires_at ?? null,
    );

    return getInsight(id)!;
  }

  /**
   * Get a single insight.
   */
  function getInsight(insightId: string): ProactiveInsight | null {
    const row = db.prepare('SELECT * FROM proactive_insights WHERE id = ?').get(insightId) as RawInsightRow | undefined;
    return row ? parseInsight(row) : null;
  }

  /**
   * List active (not dismissed) insights for a user, newest first.
   */
  function listInsights(
    userId: string,
    options: { dismissed?: boolean; areaId?: string; limit?: number } = {},
  ): ProactiveInsight[] {
    const conditions: string[] = ['user_id = ?'];
    const params: (string | number)[] = [userId];

    if (options.dismissed !== undefined) {
      conditions.push('dismissed = ?');
      params.push(options.dismissed ? 1 : 0);
    }
    if (options.areaId) {
      conditions.push('(area_id = ? OR area_id IS NULL)');
      params.push(options.areaId);
    }
    // Filter expired insights
    conditions.push('(expires_at IS NULL OR expires_at > datetime("now"))');

    const where = conditions.join(' AND ');
    const limit = options.limit ?? 50;
    params.push(limit);

    const rows = db.prepare(`
      SELECT * FROM proactive_insights
      WHERE ${where}
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
        created_at DESC
      LIMIT ?
    `).all(...params) as RawInsightRow[];

    return rows.map(parseInsight);
  }

  /**
   * Count unread, non-dismissed insights (for the notification bell badge).
   */
  function countUnread(userId: string): number {
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM proactive_insights
      WHERE user_id = ? AND read = 0 AND dismissed = 0
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(userId) as { count: number };
    return row.count;
  }

  /**
   * Mark insight as read.
   */
  function markRead(insightId: string): void {
    db.prepare(`
      UPDATE proactive_insights SET read = 1, read_at = datetime('now') WHERE id = ?
    `).run(insightId);
  }

  /**
   * Dismiss an insight.
   */
  function dismissInsight(insightId: string, actionTaken?: string): void {
    db.prepare(`
      UPDATE proactive_insights
      SET dismissed = 1, dismissed_at = datetime('now'), action_taken = ?
      WHERE id = ?
    `).run(actionTaken ?? null, insightId);
  }

  /**
   * Analyse recent knowledge atoms and session patterns to generate new insights.
   * This is the core "proactive" engine — runs periodically in the background.
   */
  function runInsightGeneration(userId: string): { generated: number } {
    let generated = 0;

    // Pattern 1: Conflicting knowledge atoms across sessions
    const conflicts = db.prepare(`
      SELECT ka1.id as atom1_id, ka2.id as atom2_id,
             ka1.content as content1, ka2.content as content2,
             ka1.session_id as session1_id, ka2.session_id as session2_id
      FROM (
        SELECT ka.id, ka.content, s.id as session_id, s.area_id
        FROM knowledge_atoms ka
        JOIN atom_sources asrc ON asrc.atom_id = ka.id
        JOIN sessions s ON s.id = asrc.session_id
        WHERE ka.user_id = ? AND ka.atom_type = 'conclusion'
        ORDER BY ka.created_at DESC LIMIT 100
      ) ka1
      JOIN (
        SELECT ka.id, ka.content, s.id as session_id, s.area_id
        FROM knowledge_atoms ka
        JOIN atom_sources asrc ON asrc.atom_id = ka.id
        JOIN sessions s ON s.id = asrc.session_id
        WHERE ka.user_id = ? AND ka.atom_type = 'conclusion'
        ORDER BY ka.created_at DESC LIMIT 100
      ) ka2 ON ka1.area_id = ka2.area_id AND ka1.id < ka2.id
      LIMIT 5
    `).all(userId, userId) as Array<{
      atom1_id: string; atom2_id: string;
      content1: string; content2: string;
      session1_id: string; session2_id: string;
    }>;

    for (const conflict of conflicts) {
      // Skip if already have a recent conflict insight for these atoms
      const existing = db.prepare(`
        SELECT id FROM proactive_insights
        WHERE user_id = ? AND insight_type = 'conflict'
          AND source_atom_ids LIKE ? AND dismissed = 0
          AND created_at > datetime('now', '-7 days')
      `).get(userId, `%${conflict.atom1_id}%`) as { id: string } | undefined;

      if (!existing) {
        createInsight({
          insight_type: 'conflict',
          title: 'Potentially conflicting conclusions detected',
          body: `Two sessions reached different conclusions on related topics.\n\nSession A: "${conflict.content1.slice(0, 200)}"\n\nSession B: "${conflict.content2.slice(0, 200)}"\n\nConsider reviewing both to reconcile the findings.`,
          severity: 'medium',
          source_session_ids: [conflict.session1_id, conflict.session2_id],
          source_atom_ids: [conflict.atom1_id, conflict.atom2_id],
          user_id: userId,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
        generated++;
      }
    }

    // Pattern 2: Session gap detection — areas with no recent activity
    const areaActivity = db.prepare(`
      SELECT area_id, MAX(updated_at) as last_active, COUNT(*) as session_count
      FROM sessions
      WHERE user_id = ? AND area_id IS NOT NULL
        AND updated_at < datetime('now', '-14 days')
      GROUP BY area_id
      HAVING session_count >= 3
      LIMIT 3
    `).all(userId) as Array<{ area_id: string; last_active: string; session_count: number }>;

    for (const area of areaActivity) {
      const existing = db.prepare(`
        SELECT id FROM proactive_insights
        WHERE user_id = ? AND insight_type = 'gap' AND area_id = ?
          AND dismissed = 0 AND created_at > datetime('now', '-7 days')
      `).get(userId, area.area_id) as { id: string } | undefined;

      if (!existing) {
        const daysSince = Math.floor((Date.now() - new Date(area.last_active).getTime()) / (1000 * 60 * 60 * 24));
        createInsight({
          insight_type: 'gap',
          title: `No activity in ${area.area_id} for ${daysSince} days`,
          body: `You have ${area.session_count} sessions in the ${area.area_id} area, but no activity in ${daysSince} days. Consider reviewing whether ongoing commitments in this area need attention.`,
          severity: daysSince > 30 ? 'high' : 'medium',
          area_id: area.area_id,
          user_id: userId,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
        generated++;
      }
    }

    return { generated };
  }

  return {
    createInsight,
    getInsight,
    listInsights,
    countUnread,
    markRead,
    dismissInsight,
    runInsightGeneration,
  };
}
