/**
 * Insights Tab
 *
 * Displays AI-generated insights from knowledge atoms:
 * - Trends (what's changing)
 * - Patterns (what's recurring)
 * - Anomalies (what's unusual)
 * - Recommendations (what to do next)
 */

import React, { useState, useEffect } from 'react';
import {
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Repeat,
  Target,
  Loader2,
  Download,
  RefreshCw,
  Brain,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Insight {
  id: string;
  type: 'trend' | 'pattern' | 'anomaly' | 'recommendation';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  confidence: number;
  supporting_atoms: string[];
  created_at: string;
}

interface AtomDistribution {
  [category: string]: number;
}

interface TopEntity {
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  atom_count: number;
}

export function InsightsTab() {
  const [loading, setLoading] = useState(true);
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [distribution, setDistribution] = useState<AtomDistribution>({});
  const [topEntities, setTopEntities] = useState<TopEntity[]>([]);
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'all'>('week');
  const [brief, setBrief] = useState<string | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, [timeRange]);

  async function loadDashboardData() {
    try {
      setLoading(true);

      // Load distribution and top entities
      const [distRes, entitiesRes] = await Promise.all([
        fetch(`/api/intelligence/distribution?timeRange=${timeRange}`),
        fetch(`/api/intelligence/top-entities?limit=10`),
      ]);

      const distData = await distRes.json();
      const entitiesData = await entitiesRes.json();

      setDistribution(distData);
      setTopEntities(Array.isArray(entitiesData) ? entitiesData : entitiesData.topEntities || []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function generateInsights() {
    try {
      setGeneratingInsights(true);

      const res = await fetch(`/api/intelligence/insights?timeRange=${timeRange}&limit=100`);
      const data = await res.json();

      setInsights(data.insights || []);
    } catch (error) {
      console.error('Failed to generate insights:', error);
    } finally {
      setGeneratingInsights(false);
    }
  }

  async function generateBrief() {
    setGeneratingBrief(true);
    try {
      const [summaryRes, patternsRes] = await Promise.all([
        fetch('/api/intelligence/summary'),
        fetch('/api/patterns?status=active&limit=10'),
      ]);
      const summaryData = await summaryRes.json();
      const patternsData = await patternsRes.json();
      const r = await fetch('/api/ai-assist/intelligence-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalAtoms: summaryData.totalAtoms,
          totalEntities: summaryData.totalEntities,
          totalPatterns: summaryData.totalPatterns,
          criticalPatterns: summaryData.criticalPatterns,
          distribution,
          topEntities,
          patterns: patternsData.patterns || [],
          timeRange,
        }),
      });
      if (r.ok) {
        const { brief: b } = await r.json();
        setBrief(b as string);
      }
    } catch { /* ignore */ } finally { setGeneratingBrief(false); }
  }

  async function exportAtoms(format: 'json' | 'csv') {
    try {
      const url = `/api/intelligence/export?format=${format}&timeRange=${timeRange}`;
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to export atoms:', error);
    }
  }

  function getInsightIcon(type: string) {
    switch (type) {
      case 'trend':
        return <TrendingUp className="w-5 h-5 text-blue-400" />;
      case 'pattern':
        return <Repeat className="w-5 h-5 text-purple-400" />;
      case 'anomaly':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'recommendation':
        return <Target className="w-5 h-5 text-green-400" />;
      default:
        return <Lightbulb className="w-5 h-5 text-adv-teal" />;
    }
  }

  function getSeverityColor(severity: string) {
    switch (severity) {
      case 'critical':
        return 'border-red-500/30 bg-red-900/10';
      case 'warning':
        return 'border-yellow-500/30 bg-yellow-900/10';
      default:
        return 'border-adv-teal/30 bg-adv-teal-soft';
    }
  }

  function getConfidenceColor(confidence: number) {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-adv-teal" />
      </div>
    );
  }

  const totalAtoms = Object.values(distribution).reduce((sum, count) => sum + count, 0);

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['day', 'week', 'month', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 text-sm rounded ${
                timeRange === range
                  ? 'bg-adv-teal text-white'
                  : 'bg-adv-card text-adv-gray hover:text-adv-off-white'
              }`}
            >
              {range === 'all' ? 'All Time' : `Last ${range.charAt(0).toUpperCase() + range.slice(1)}`}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => exportAtoms('json')}
            className="flex items-center gap-2 px-3 py-1 text-sm rounded bg-adv-card text-adv-gray hover:text-adv-off-white border border-adv-gray-med/20"
            title="Export as JSON"
          >
            <Download className="w-4 h-4" />
            JSON
          </button>
          <button
            onClick={() => exportAtoms('csv')}
            className="flex items-center gap-2 px-3 py-1 text-sm rounded bg-adv-card text-adv-gray hover:text-adv-off-white border border-adv-gray-med/20"
            title="Export as CSV"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
          <div className="text-sm text-adv-gray mb-1">Total Atoms</div>
          <div className="text-2xl font-bold text-adv-white">{totalAtoms}</div>
        </div>

        <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
          <div className="text-sm text-adv-gray mb-1">Top Category</div>
          <div className="text-2xl font-bold text-adv-white capitalize">
            {Object.entries(distribution).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}
          </div>
        </div>

        <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
          <div className="text-sm text-adv-gray mb-1">Entities Tracked</div>
          <div className="text-2xl font-bold text-adv-white">{topEntities.length}</div>
        </div>
      </div>

      {/* Category Distribution */}
      <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
        <h3 className="text-sm font-medium text-adv-white mb-3">Atom Distribution</h3>
        <div className="space-y-2">
          {Object.entries(distribution).map(([category, count]) => (
            <div key={category} className="flex items-center gap-3">
              <div className="w-24 text-xs text-adv-gray capitalize">{category}</div>
              <div className="flex-1 bg-adv-dark-2 rounded-full h-2">
                <div
                  className="bg-adv-teal rounded-full h-2 transition-all"
                  style={{ width: `${(count / totalAtoms) * 100}%` }}
                />
              </div>
              <div className="w-12 text-xs text-adv-off-white text-right">{count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Narrative Brief */}
      <div className="bg-adv-card border border-adv-teal/20 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-adv-white flex items-center gap-2">
            <Brain className="w-4 h-4 text-adv-teal" />
            Intelligence Brief
          </h3>
          <button
            onClick={generateBrief}
            disabled={generatingBrief || totalAtoms === 0}
            className="flex items-center gap-2 px-3 py-1 text-sm rounded bg-adv-teal text-white hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingBrief ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Brain className="w-4 h-4" />Generate Brief</>}
          </button>
        </div>
        {!brief && !generatingBrief && (
          <p className="text-center py-6 text-adv-gray text-sm">
            Click "Generate Brief" for a plain-English narrative of what your intelligence data means and what to do next.
          </p>
        )}
        {brief && (
          <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{brief}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* AI Insights */}
      <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-adv-white flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-adv-teal" />
            AI-Generated Insights
          </h3>
          <button
            onClick={generateInsights}
            disabled={generatingInsights || totalAtoms === 0}
            className="flex items-center gap-2 px-3 py-1 text-sm rounded bg-adv-teal text-white hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingInsights ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Generate Insights
              </>
            )}
          </button>
        </div>

        {insights.length === 0 && !generatingInsights && (
          <div className="text-center py-8 text-adv-gray text-sm">
            Click "Generate Insights" to analyze patterns and trends in your knowledge atoms.
          </div>
        )}

        {insights.length > 0 && (
          <div className="space-y-3">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className={`border rounded-lg p-4 ${getSeverityColor(insight.severity)}`}
              >
                <div className="flex items-start gap-3">
                  {getInsightIcon(insight.type)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-adv-white">{insight.title}</h4>
                      <span className="text-xs px-2 py-0.5 rounded bg-adv-dark-2 text-adv-gray capitalize">
                        {insight.type}
                      </span>
                      <span className={`text-xs font-medium ${getConfidenceColor(insight.confidence)}`}>
                        {(insight.confidence * 100).toFixed(0)}% confident
                      </span>
                    </div>
                    <p className="text-sm text-adv-off-white">{insight.description}</p>
                    {insight.supporting_atoms.length > 0 && (
                      <div className="mt-2 text-xs text-adv-gray">
                        Based on {insight.supporting_atoms.length} supporting atoms
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Entities */}
      <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
        <h3 className="text-sm font-medium text-adv-white mb-3">Most Referenced Entities</h3>
        <div className="space-y-2">
          {(!topEntities || topEntities.length === 0) && (
            <div className="text-center py-4 text-adv-gray text-sm">
              No entities tracked yet.
            </div>
          )}
          {topEntities && Array.isArray(topEntities) && topEntities.map((entity, idx) => (
            <div key={`${entity.entity_type}:${entity.entity_id}`} className="flex items-center gap-3">
              <div className="w-6 text-xs text-adv-gray text-right">#{idx + 1}</div>
              <div className="flex-1">
                <div className="text-sm text-adv-off-white">
                  {entity.entity_name || entity.entity_id}
                </div>
                <div className="text-xs text-adv-gray capitalize">{entity.entity_type}</div>
              </div>
              <div className="text-xs text-adv-gray">{entity.atom_count} atoms</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
