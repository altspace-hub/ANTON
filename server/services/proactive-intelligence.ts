/**
 * proactive-intelligence.ts
 * Generates proactive insights by analysing cross-session knowledge atoms,
 * patterns, and entity relationships. Surfaces insights the user hasn't asked for
 * but would want to know.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';


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

export async function createProactiveIntelligenceService(db: DatabaseAdapter) {
  /**
   * Manually create an insight (used by radar, compliance, file watcher).
   */
  async function createInsight(input: CreateInsightInput): Promise<ProactiveInsight> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO proactive_insights
        (id, insight_type, title, body, severity, source_session_ids, source_atom_ids,
         area_id, module_id, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
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

    return (await getInsight(id))!;
  }

  /**
   * Get a single insight.
   */
  async function getInsight(insightId: string): Promise<ProactiveInsight | null> {
    const row = await db.get('SELECT * FROM proactive_insights WHERE id = ?', insightId) as RawInsightRow | undefined;
    return row ? parseInsight(row) : null;
  }

  /**
   * List active (not dismissed) insights for a user, newest first.
   */
  async function listInsights(
    userId: string,
    options: { dismissed?: boolean; areaId?: string; limit?: number } = {},
  ): Promise<ProactiveInsight[]> {
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
    conditions.push("(expires_at IS NULL OR expires_at > datetime('now'))");

    const where = conditions.join(' AND ');
    const limit = options.limit ?? 50;
    params.push(limit);

    const rows = await db.all(`
      SELECT * FROM proactive_insights
      WHERE ${where}
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
        created_at DESC
      LIMIT ?
    `, ...params) as RawInsightRow[];

    return rows.map(parseInsight);
  }

  /**
   * Count unread, non-dismissed insights (for the notification bell badge).
   */
  async function countUnread(userId: string): Promise<number> {
    const row = await db.get(`
      SELECT COUNT(*) as count FROM proactive_insights
      WHERE user_id = ? AND read = 0 AND dismissed = 0
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `, userId) as { count: number };
    return row.count;
  }

  /**
   * Mark insight as read.
   */
  async function markRead(insightId: string): Promise<void> {
    await db.run(`
      UPDATE proactive_insights SET read = 1, read_at = datetime('now') WHERE id = ?
    `, insightId);
  }

  /**
   * Dismiss an insight.
   */
  async function dismissInsight(insightId: string, actionTaken?: string): Promise<void> {
    await db.run(`
      UPDATE proactive_insights
      SET dismissed = 1, dismissed_at = datetime('now'), action_taken = ?
      WHERE id = ?
    `, actionTaken ?? null, insightId);
  }

  /**
   * Analyse recent knowledge atoms and session patterns to generate new insights.
   * This is the core "proactive" engine — runs periodically in the background.
   */
  async function runInsightGeneration(userId: string): Promise<{ generated: number }> {
    let generated = 0;

    // Pattern 1: Conflicting knowledge atoms across sessions
    const conflicts = await db.all(`
      SELECT ka1.id as atom1_id, ka2.id as atom2_id,
             ka1.content as content1, ka2.content as content2,
             ka1.source_session_id as session1_id, ka2.source_session_id as session2_id
      FROM knowledge_atoms ka1
      JOIN knowledge_atoms ka2 ON ka1.category = ka2.category
        AND ka1.id < ka2.id
        AND ka1.source_session_id != ka2.source_session_id
      WHERE ka1.is_active = 1 AND ka2.is_active = 1
        AND ka1.atom_type = 'conclusion' AND ka2.atom_type = 'conclusion'
        AND ka1.created_at >= datetime('now', '-14 days')
      LIMIT 5
    `) as Array<{
      atom1_id: string; atom2_id: string;
      content1: string; content2: string;
      session1_id: string; session2_id: string;
    }>;

    for (const conflict of conflicts) {
      // Skip if already have a recent conflict insight for these atoms
      const existing = await db.get(`
        SELECT id FROM proactive_insights
        WHERE user_id = ? AND insight_type = 'conflict'
          AND source_atom_ids LIKE ? AND dismissed = 0
          AND created_at > datetime('now', '-7 days')
      `, userId, `%${conflict.atom1_id}%`) as { id: string } | undefined;

      if (!existing) {
        await createInsight({
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
    const areaActivity = await db.all(`
      SELECT area_id, MAX(updated_at) as last_active, COUNT(*) as session_count
      FROM sessions
      WHERE user_id = ? AND area_id IS NOT NULL
        AND updated_at < datetime('now', '-14 days')
      GROUP BY area_id
      HAVING COUNT(*) >= 3
      LIMIT 3
    `, userId) as Array<{ area_id: string; last_active: string; session_count: number }>;

    for (const area of areaActivity) {
      const existing = await db.get(`
        SELECT id FROM proactive_insights
        WHERE user_id = ? AND insight_type = 'gap'
          AND area_id = ? AND dismissed = 0
          AND created_at > datetime('now', '-7 days')
      `, userId, area.area_id) as { id: string } | undefined;

      if (!existing) {
        const daysSince = Math.floor((Date.now() - new Date(area.last_active).getTime()) / (1000 * 60 * 60 * 24));
        await createInsight({
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
