/**
 * proactive-intelligence.ts
 * Generates proactive insights by analysing cross-session knowledge atoms,
 * patterns, and entity relationships. Surfaces insights the user hasn't asked for
 * but would want to know.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { atomOwnerSql, INSTANCE_WIDE_SEARCH, type SearchScope } from './hybrid-search.js';

/**
 * An owner condition for one insight row, as ownerFilter (middleware/ownership.ts)
 * builds it: ` AND user_id = ?` for a team-mode non-admin, empty for solo and
 * admins. Applied inside the UPDATE, so a colleague's insight is never touched.
 */
export interface InsightOwnerScope { sql: string; params: string[] }


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
    conditions.push("(expires_at IS NULL OR expires_at::timestamptz > NOW())");

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
        AND (expires_at IS NULL OR expires_at::timestamptz > NOW())
    `, userId) as { count: number | string } | undefined;
    // Postgres returns COUNT(*) as a string.
    return Number(row?.count ?? 0);
  }

  /**
   * Mark insight as read.
   */
  async function markRead(insightId: string, scope: InsightOwnerScope): Promise<boolean> {
    const r = await db.run(`
      UPDATE proactive_insights SET read = 1, read_at = NOW() WHERE id = ?${scope.sql}
    `, [insightId, ...scope.params]);
    return r.changes > 0;
  }

  /**
   * Dismiss an insight.
   */
  async function dismissInsight(insightId: string, actionTaken: string | undefined, scope: InsightOwnerScope): Promise<boolean> {
    const r = await db.run(`
      UPDATE proactive_insights
      SET dismissed = 1, dismissed_at = NOW(), action_taken = ?
      WHERE id = ?${scope.sql}
    `, [actionTaken ?? null, insightId, ...scope.params]);
    return r.changes > 0;
  }

  /**
   * Analyse recent knowledge atoms and session patterns to generate new insights.
   * This is the core "proactive" engine — runs periodically in the background.
   */
  async function runInsightGeneration(userId: string, atomScope: SearchScope = INSTANCE_WIDE_SEARCH): Promise<{ generated: number }> {
    let generated = 0;

    // Pattern 1: Conflicting knowledge atoms across sessions. Both atoms are
    // quoted into the caller's insight, so both must be atoms the caller may
    // read (atomOwnerSql: own + shared for a team-mode non-admin). Until
    // 2026-10-02 this read every user's atoms.
    const own1 = atomOwnerSql(atomScope, 'ka1.owner_user_id');
    const own2 = atomOwnerSql(atomScope, 'ka2.owner_user_id');
    // knowledge_atoms has no source_session_id: the run an atom came from is
    // source_execution_id (a Work run's session id). Naming the missing column
    // made this route fail on PostgreSQL.
    const conflicts = await db.all(`
      SELECT ka1.id as atom1_id, ka2.id as atom2_id,
             ka1.content as content1, ka2.content as content2,
             ka1.source_execution_id as session1_id, ka2.source_execution_id as session2_id
      FROM knowledge_atoms ka1
      JOIN knowledge_atoms ka2 ON ka1.category = ka2.category
        AND ka1.id < ka2.id
        AND ka1.source_execution_id != ka2.source_execution_id
      WHERE ka1.is_active = 1 AND ka2.is_active = 1
        AND ka1.atom_type = 'conclusion' AND ka2.atom_type = 'conclusion'
        AND ka1.created_at >= NOW() - INTERVAL '14 days'${own1.sql}${own2.sql}
      LIMIT 5
    `, [...own1.params, ...own2.params]) as Array<{
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
          AND created_at > NOW() - INTERVAL '7 days'
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

    // Pattern 2: Session gap detection — modules with no recent activity.
    // sessions has no area_id column (naming it made this route fail on
    // PostgreSQL); a session records its module. "No recent activity" is the
    // newest session being older than 14 days, not 3 old sessions among new ones.
    const moduleActivity = await db.all(`
      SELECT module_id, MAX(updated_at) as last_active, COUNT(*) as session_count
      FROM sessions
      WHERE user_id = ? AND module_id IS NOT NULL
      GROUP BY module_id
      HAVING COUNT(*) >= 3 AND MAX(updated_at) < NOW() - INTERVAL '14 days'
      LIMIT 3
    `, userId) as Array<{ module_id: string; last_active: string | Date; session_count: number | string }>;

    for (const mod of moduleActivity) {
      const existing = await db.get(`
        SELECT id FROM proactive_insights
        WHERE user_id = ? AND insight_type = 'gap'
          AND module_id = ? AND dismissed = 0
          AND created_at > NOW() - INTERVAL '7 days'
      `, userId, mod.module_id) as { id: string } | undefined;

      if (!existing) {
        const daysSince = Math.floor((Date.now() - new Date(mod.last_active).getTime()) / (1000 * 60 * 60 * 24));
        const count = Number(mod.session_count);
        await createInsight({
          insight_type: 'gap',
          title: `No activity in ${mod.module_id} for ${daysSince} days`,
          body: `You have ${count} sessions in the ${mod.module_id} module, but no activity in ${daysSince} days. Consider reviewing whether ongoing commitments there need attention.`,
          severity: daysSince > 30 ? 'high' : 'medium',
          module_id: mod.module_id,
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
