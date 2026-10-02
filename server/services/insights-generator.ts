/**
 * Cross-Workflow Insights Generator
 *
 * Analyzes knowledge atoms across sessions to generate insights:
 * - Trends (what's changing over time)
 * - Patterns (what's recurring)
 * - Anomalies (what's unusual)
 * - Recommendations (what to do next)
 */

import { getRoutedUtilityModel } from './utility-model.js';
import { callChat } from './provider-router.js';
import { atomOwnerSql, type SearchScope } from './hybrid-search.js';
import { extractJsonReply, hasArrayField, stripReasoning } from './coding-workspace.js';
import { chargeMonthlyUsage } from './budget-manager.js';
import type { DatabaseAdapter } from '../db/database.js';

export type InsightTimeRange = 'day' | 'week' | 'month' | 'all';

/** The only spans a time range may name: the INTERVAL below is written from this table, never from input. */
const TIME_RANGE_INTERVAL: Readonly<Record<InsightTimeRange, string>> = {
  day: '1 day',
  week: '7 days',
  month: '30 days',
  all: '365 days',
};

/** A time range from a query string, or undefined for anything else ('foo', 'constructor'). */
export function parseInsightTimeRange(v: unknown): InsightTimeRange | undefined {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TIME_RANGE_INTERVAL, v) ? v as InsightTimeRange : undefined;
}

/** The SQL condition for a time range, or '' when there is none. */
export function timeRangeSql(range: InsightTimeRange | undefined): string {
  const interval = range ? TIME_RANGE_INTERVAL[range] : undefined;
  return interval ? ` AND created_at >= NOW() - INTERVAL '${interval}'` : '';
}

const INSIGHT_TYPES = ['trend', 'pattern', 'anomaly', 'recommendation'] as const;
const INSIGHT_SEVERITIES = ['info', 'warning', 'critical'] as const;

interface RawInsight {
  type?: unknown;
  title?: unknown;
  description?: unknown;
  severity?: unknown;
  confidence?: unknown;
  supporting_atom_indices?: unknown;
}

const isInsightList = (v: unknown): boolean => Array.isArray(v) || hasArrayField('insights')(v);

/**
 * The insights in a model reply, or null when it carries none. The prompt asks
 * for {"insights": [...]} and the call asks for JSON (jsonMode); a model may
 * still answer with a bare array, fence it, or wrap it in prose or reasoning
 * (GLM on OpenRouter did), which the strict JSON.parse this replaced turned
 * into a silent "no insights".
 */
export function parseInsightsReply(text: string): RawInsight[] | null {
  const reply = extractJsonReply(text ?? '', isInsightList);
  if (reply) {
    if (Array.isArray(reply.value)) return reply.value as RawInsight[];
    if (hasArrayField('insights')(reply.value)) return (reply.value as { insights: RawInsight[] }).insights;
  }
  // A bare array inside prose: no fence and no object around it.
  const plain = stripReasoning(text ?? '');
  const start = plain.indexOf('[');
  const end = plain.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const value: unknown = JSON.parse(plain.slice(start, end + 1));
      if (Array.isArray(value)) return value as RawInsight[];
    } catch { /* not JSON */ }
  }
  return null;
}

interface InsightParams {
  timeRange?: InsightTimeRange;
  category?: string;
  areaId?: string;
  limit?: number;
  /**
   * Whose atoms are read — REQUIRED, like hybridSearch's scope, so a new caller
   * has to decide. On a team server a non-admin's scope is their own atoms and
   * the shared ones (atomOwnerSql); the routes build it with searchScopeForRequest.
   * These atoms are quoted to the model and their ids returned with the insights,
   * so an unscoped read handed every user's atoms to whoever asked.
   */
  scope: SearchScope;
  /** Charge the call's tokens to this person's monthly budget (a route a team user can call). */
  chargeUser?: { id?: string | null } | null;
}

interface Insight {
  id: string;
  type: 'trend' | 'pattern' | 'anomaly' | 'recommendation';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  confidence: number;
  supporting_atoms: string[]; // atom IDs
  created_at: string;
}

/**
 * The model call goes through the provider router on the routed utility model
 * (Settings "Utility model", mapped to the configured provider) — no client
 * is constructed or passed in any more.
 */
export async function createInsightsGenerator(db: DatabaseAdapter) {

  /**
   * Generate insights from recent knowledge atoms using Claude
   */
  async function generateInsights(params: InsightParams): Promise<Insight[]> {
    // Build query to fetch recent atoms
    const owner = atomOwnerSql(params.scope, 'owner_user_id');
    let query = `SELECT * FROM knowledge_atoms WHERE is_active = 1${owner.sql}`;
    const queryParams: any[] = [...owner.params];

    query += timeRangeSql(params.timeRange);

    if (params.category) {
      query += ' AND category = ?';
      queryParams.push(params.category);
    }

    if (params.areaId) {
      query += ' AND source_area_id = ?';
      queryParams.push(params.areaId);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    const limit = typeof params.limit === 'number' && Number.isFinite(params.limit)
      ? Math.min(100, Math.max(1, Math.floor(params.limit))) : 100;
    queryParams.push(limit);

    const atoms = await db.all(query, ...queryParams) as any[];

    if (atoms.length === 0) {
      return [];
    }

    // Group atoms by category for analysis
    const atomsByCategory = atoms.reduce((acc, atom) => {
      if (!acc[atom.category]) acc[atom.category] = [];
      acc[atom.category].push(atom);
      return acc;
    }, {} as Record<string, any[]>);

    // Build context for Claude
    const context = `You are analyzing ${atoms.length} knowledge atoms from the last ${params.timeRange || 'period'}.

Atoms by category:
${(Object.entries(atomsByCategory) as [string, any[]][]).map(([cat, categoryAtoms]) =>
  `- ${cat}: ${categoryAtoms.length} atoms`
).join('\n')}

Sample atoms (most recent 20, numbered from 0):
${atoms.slice(0, 20).map((a, i) =>
  `${i}. [${a.category}] ${a.content} (confidence: ${a.confidence}, sentiment: ${a.sentiment || 'neutral'})`
).join('\n')}

Generate 3-5 insights. Answer with one JSON object {"insights": [...]}, where each insight has:
{
  "type": "trend" | "pattern" | "anomaly" | "recommendation",
  "title": "Short title (5-10 words)",
  "description": "Detailed description (1-2 sentences)",
  "severity": "info" | "warning" | "critical",
  "confidence": 0.0-1.0,
  "supporting_atom_indices": [array of indices from the sample above that support this insight]
}

Focus on:
- TRENDS: Changes over time (increasing/decreasing patterns)
- PATTERNS: Recurring behaviors or decisions
- ANOMALIES: Unusual or unexpected findings
- RECOMMENDATIONS: Actionable next steps based on the data

Return ONLY the JSON object, no markdown, no explanation.`;

    // Utility tier: a short structured summary, not a module run. A call that
    // fails (a daily spend cap, a refused model) is thrown to the route, which
    // tells the person why; an unreadable reply is "no insights".
    const message = await callChat({
      model: await getRoutedUtilityModel(db),
      system: 'You analyse knowledge atoms and answer with one JSON object only.',
      maxTokens: 2048,
      messages: [
        {
          role: 'user',
          content: context,
        },
      ],
      jsonMode: true,
      purpose: 'intelligence-insights',
      db,
    });
    if (params.chargeUser) await chargeMonthlyUsage(db, params.chargeUser, message.inputTokens, message.outputTokens);

    try {
      const rawInsights = parseInsightsReply(message.text);
      if (!rawInsights) throw new Error('the reply carried no insights JSON');

      // Only the fields the page shows, each checked. The prompt numbers the
      // first 20 atoms, so an index outside them (or not an integer) names nothing.
      const sampleSize = Math.min(atoms.length, 20);
      const now = Date.now();
      const insights: Insight[] = rawInsights
        .filter((raw): raw is RawInsight => !!raw && typeof raw === 'object' && typeof raw.title === 'string' && raw.title.trim() !== '')
        .slice(0, 10)
        .map((raw, idx) => {
          const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
            ? Math.min(1, Math.max(0, raw.confidence)) : 0.5;
          const indices: unknown[] = Array.isArray(raw.supporting_atom_indices) ? raw.supporting_atom_indices : [];
          const valid = indices.filter((i): i is number => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < sampleSize);
          return {
            id: `insight-${now}-${idx}`,
            type: (INSIGHT_TYPES as readonly unknown[]).includes(raw.type) ? raw.type as Insight['type'] : 'pattern',
            title: String(raw.title).trim().slice(0, 200),
            description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 2000) : '',
            severity: (INSIGHT_SEVERITIES as readonly unknown[]).includes(raw.severity) ? raw.severity as Insight['severity'] : 'info',
            confidence,
            supporting_atoms: [...new Set(valid)].map((i) => String(atoms[i].id)),
            created_at: new Date(now).toISOString(),
          };
        });

      return insights;
    } catch (err) {
      console.error('[insights-generator] purpose=intelligence-insights failed to generate insights:', err instanceof Error ? err.message : err);
      return [];
    }
  }

  /**
   * Get atom distribution by category
   */
  async function getAtomDistribution(params: InsightParams): Promise<Record<string, number>> {
    const owner = atomOwnerSql(params.scope, 'owner_user_id');
    let query = `SELECT category, COUNT(*) as count FROM knowledge_atoms WHERE is_active = 1${owner.sql}`;
    const queryParams: any[] = [...owner.params];

    query += timeRangeSql(params.timeRange);

    query += ' GROUP BY category';

    const rows = await db.all(query, ...queryParams) as Array<{ category: string; count: number }>;

    return rows.reduce((acc, row) => {
      acc[row.category] = row.count;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Get top entities by interaction count
   */
  async function getTopEntities(limit: number, scope: SearchScope): Promise<Array<{
    entity_type: string;
    entity_id: string;
    entity_name: string | null;
    atom_count: number;
  }>> {
    // Entity names and counts come from the refs of the atoms this scope may
    // read — the names are the clients and people in colleagues' atoms otherwise.
    // Unscoped (solo, admin) it is the original statement, joining nothing.
    const owner = atomOwnerSql(scope, 'ka.owner_user_id');
    const query = `
      SELECT
        entity_type,
        entity_id,
        MAX(entity_name) as entity_name,
        COUNT(DISTINCT atom_id) as atom_count
      FROM knowledge_entity_refs${owner.sql ? `
      JOIN knowledge_atoms ka ON ka.id = knowledge_entity_refs.atom_id
      WHERE 1=1${owner.sql}` : ''}
      GROUP BY entity_type, entity_id
      ORDER BY atom_count DESC
      LIMIT ?
    `;

    return await db.all(query, ...owner.params, limit) as any[];
  }

  /**
   * Get sentiment trend over time
   */
  async function getSentimentTrend(days: number, scope: SearchScope): Promise<Array<{
    date: string;
    positive: number;
    negative: number;
    warning: number;
    critical: number;
  }>> {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const owner = atomOwnerSql(scope, 'owner_user_id');
    const query = `
      SELECT
        DATE(created_at) as date,
        SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative,
        SUM(CASE WHEN sentiment = 'warning' THEN 1 ELSE 0 END) as warning,
        SUM(CASE WHEN sentiment = 'critical' THEN 1 ELSE 0 END) as critical
      FROM knowledge_atoms
      WHERE is_active = 1
        AND created_at >= ?${owner.sql}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    return await db.all(query, since, ...owner.params) as any[];
  }

  return {
    generateInsights,
    getAtomDistribution,
    getTopEntities,
    getSentimentTrend,
  };
}

export type InsightsGenerator = ReturnType<typeof createInsightsGenerator>;
