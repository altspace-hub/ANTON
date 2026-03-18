/**
 * Cross-Workflow Insights Generator
 *
 * Analyzes knowledge atoms across sessions to generate insights:
 * - Trends (what's changing over time)
 * - Patterns (what's recurring)
 * - Anomalies (what's unusual)
 * - Recommendations (what to do next)
 */

import type { DatabaseAdapter } from '../db/database.js';
import Anthropic from '@anthropic-ai/sdk';

interface InsightParams {
  timeRange?: 'day' | 'week' | 'month' | 'all';
  category?: string;
  areaId?: string;
  limit?: number;
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

export async function createInsightsGenerator(db: DatabaseAdapter, client: Anthropic) {

  /**
   * Generate insights from recent knowledge atoms using Claude
   */
  async function generateInsights(params: InsightParams = {}): Promise<Insight[]> {
    // Build query to fetch recent atoms
    let query = 'SELECT * FROM knowledge_atoms WHERE is_active = 1';
    const queryParams: any[] = [];

    if (params.timeRange) {
      const timeMap = {
        day: '1 day',
        week: '7 days',
        month: '30 days',
        all: '365 days',
      };
      query += ` AND created_at >= NOW() - INTERVAL '${timeMap[params.timeRange]}'`;
    }

    if (params.category) {
      query += ' AND category = ?';
      queryParams.push(params.category);
    }

    if (params.areaId) {
      query += ' AND source_area_id = ?';
      queryParams.push(params.areaId);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    queryParams.push(params.limit ?? 100);

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

Sample atoms (most recent 20):
${atoms.slice(0, 20).map(a =>
  `[${a.category}] ${a.content} (confidence: ${a.confidence}, sentiment: ${a.sentiment || 'neutral'})`
).join('\n')}

Generate 3-5 insights as JSON array. Each insight should have:
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

Return ONLY the JSON array, no markdown, no explanation.`;

    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001', // Fast and cost-effective
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: context,
          },
        ],
      });

      let responseText = '';
      for (const block of message.content) {
        if (block.type === 'text') responseText += block.text;
      }

      // Parse JSON response
      const cleaned = responseText.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      const rawInsights = JSON.parse(cleaned) as Array<{
        type: string;
        title: string;
        description: string;
        severity: string;
        confidence: number;
        supporting_atom_indices: number[];
      }>;

      // Convert to Insight objects
      const insights: Insight[] = rawInsights.map((raw, idx) => ({
        id: `insight-${Date.now()}-${idx}`,
        type: raw.type as any,
        title: raw.title,
        description: raw.description,
        severity: raw.severity as any,
        confidence: raw.confidence,
        supporting_atoms: (raw.supporting_atom_indices || [])
          .filter(i => i < atoms.length)
          .map(i => atoms[i].id),
        created_at: new Date().toISOString(),
      }));

      return insights;
    } catch (err) {
      console.error('[insights-generator] Failed to generate insights:', err);
      return [];
    }
  }

  /**
   * Get atom distribution by category
   */
  async function getAtomDistribution(params: InsightParams = {}): Record<string, number> {
    let query = 'SELECT category, COUNT(*) as count FROM knowledge_atoms WHERE is_active = 1';
    const queryParams: any[] = [];

    if (params.timeRange) {
      const timeMap = {
        day: '1 day',
        week: '7 days',
        month: '30 days',
        all: '365 days',
      };
      query += ` AND created_at >= NOW() - INTERVAL '${timeMap[params.timeRange]}'`;
    }

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
  async function getTopEntities(limit: number = 10): Array<{
    entity_type: string;
    entity_id: string;
    entity_name: string | null;
    atom_count: number;
  }> {
    const query = `
      SELECT
        entity_type,
        entity_id,
        entity_name,
        COUNT(DISTINCT atom_id) as atom_count
      FROM knowledge_entity_refs
      GROUP BY entity_type, entity_id
      ORDER BY atom_count DESC
      LIMIT ?
    `;

    return await db.all(query, limit) as any[];
  }

  /**
   * Get sentiment trend over time
   */
  async function getSentimentTrend(days: number = 30): Array<{
    date: string;
    positive: number;
    negative: number;
    warning: number;
    critical: number;
  }> {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const query = `
      SELECT
        DATE(created_at) as date,
        SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative,
        SUM(CASE WHEN sentiment = 'warning' THEN 1 ELSE 0 END) as warning,
        SUM(CASE WHEN sentiment = 'critical' THEN 1 ELSE 0 END) as critical
      FROM knowledge_atoms
      WHERE is_active = 1
        AND created_at >= ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    return await db.all(query, since) as any[];
  }

  return {
    generateInsights,
    getAtomDistribution,
    getTopEntities,
    getSentimentTrend,
  };
}

export type InsightsGenerator = ReturnType<typeof createInsightsGenerator>;
