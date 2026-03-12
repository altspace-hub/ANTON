import React, { useState, useEffect } from 'react';
import {
  Atom,
  Users,
  TrendingUp,
  AlertTriangle,
  Brain,
  Filter,
  Calendar,
  Loader2,
  Archive,
} from 'lucide-react';
import { PatternCard } from '../features/intelligence/PatternCard';
import { EntityHeatMapCell } from '../features/intelligence/EntityHeatMapCell';
import { TemporalChart } from '../features/intelligence/TemporalChart';
import { InstitutionalMemoryTab } from '../features/intelligence/InstitutionalMemoryTab';
import { InsightsTab } from '../features/intelligence/InsightsTab';
import {
  IntelligenceSummary,
  DetectedPattern,
  TimelineEntry,
  TemporalDataPoint,
  EntityNode,
} from '../features/intelligence/types';
import { useNavigate } from 'react-router-dom';

export default function IntelligenceDashboard() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<'timeline' | 'heatmap' | 'temporal' | 'memory' | 'insights'>('insights');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<IntelligenceSummary | null>(null);
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [entities, setEntities] = useState<EntityNode[]>([]);

  // Temporal data
  const [atomsPerDay, setAtomsPerDay] = useState<TemporalDataPoint[]>([]);
  const [patternsPerWeek, setPatternsPerWeek] = useState<TemporalDataPoint[]>([]);
  const [entityActivity, setEntityActivity] = useState<TemporalDataPoint[]>([]);
  const [qualityTrend, setQualityTrend] = useState<TemporalDataPoint[]>([]);

  // Filters
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'patterns' | 'atoms'>('all');
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);

    // Load each section independently so one failure doesn't block others
    try {
      const summaryRes = await fetch('/api/intelligence/summary');
      const summaryData = await summaryRes.json();
      setSummary(summaryData);

      // Build timeline from summary + patterns
      try {
        const patternsRes = await fetch('/api/patterns?status=active&limit=50');
        const patternsData = await patternsRes.json();
        const patternsArray = Array.isArray(patternsData.patterns) ? patternsData.patterns : [];
        setPatterns(patternsArray);

        const recentAtoms = Array.isArray(summaryData.recentAtoms) ? summaryData.recentAtoms : [];
        const entries: TimelineEntry[] = [
          ...patternsArray.map((p: DetectedPattern) => ({
            type: 'pattern' as const,
            data: p,
            timestamp: p.detected_at,
          })),
          ...recentAtoms.map((a: any) => ({
            type: 'atom' as const,
            data: a,
            timestamp: a.created_at,
          })),
        ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTimelineEntries(entries);
      } catch (err) {
        console.error('Failed to load timeline data:', err);
      }
    } catch (error) {
      console.error('Failed to load summary:', error);
    }

    // Load entities independently
    try {
      const entitiesRes = await fetch('/api/knowledge-graph/entities?limit=50');
      const entitiesData = await entitiesRes.json();
      setEntities(Array.isArray(entitiesData) ? entitiesData : []);
    } catch (err) {
      console.error('Failed to load entities:', err);
    }

    // Load temporal data independently
    try {
      const [atomsRes, patternsRes2, activityRes, qualityRes] = await Promise.all([
        fetch('/api/intelligence/temporal/atoms-per-day?days=30'),
        fetch('/api/intelligence/temporal/patterns-per-week?weeks=12'),
        fetch('/api/intelligence/temporal/entity-activity?weeks=12'),
        fetch('/api/intelligence/temporal/quality-trend?weeks=12'),
      ]);

      setAtomsPerDay(await atomsRes.json());
      setPatternsPerWeek(await patternsRes2.json());
      setEntityActivity(await activityRes.json());
      setQualityTrend(await qualityRes.json());
    } catch (err) {
      console.error('Failed to load temporal data:', err);
    }

    setLoading(false);
  }

  async function handleResolvePattern(pattern: DetectedPattern) {
    try {
      await fetch(`/api/patterns/${pattern.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', resolvedBy: 'user' }),
      });
      loadDashboardData();
    } catch (error) {
      console.error('Failed to resolve pattern:', error);
    }
  }

  function handleInvestigatePattern(pattern: DetectedPattern) {
    // Navigate to pattern detail or knowledge view
    navigate(`/knowledge`);
  }

  function handleEntityClick(entity: EntityNode) {
    navigate(`/knowledge`);
  }

  // Map DB severity values to filter groups for consistent matching
  const severityGroup = (sev: string | undefined): string => {
    switch (sev) {
      case 'critical': case 'high': return 'critical';
      case 'warning': case 'medium': return 'warning';
      case 'info': case 'low': return 'info';
      case 'positive': return 'positive';
      default: return sev ?? 'info';
    }
  };

  const filteredTimeline = timelineEntries.filter(entry => {
    if (timelineFilter === 'patterns' && entry.type !== 'pattern') return false;
    if (timelineFilter === 'atoms' && entry.type !== 'atom') return false;
    if (severityFilter && entry.type === 'pattern') {
      const sev = (entry.data as DetectedPattern).severity;
      if (severityGroup(sev) !== severityFilter) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-adv-teal" />
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="border-b border-border bg-secondary rounded-t-lg">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Brain className="w-6 h-6 text-adv-teal" />
            <h1 className="text-2xl font-bold text-adv-off-white">Cross-Workflow Intelligence</h1>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Atom className="w-4 h-4 text-adv-teal" />
                <span className="text-sm text-adv-gray">Knowledge Atoms</span>
              </div>
              <div className="text-2xl font-bold text-adv-off-white">{summary?.totalAtoms || 0}</div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-adv-teal" />
                <span className="text-sm text-adv-gray">Entities Tracked</span>
              </div>
              <div className="text-2xl font-bold text-adv-off-white">{summary?.totalEntities || 0}</div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-adv-teal" />
                <span className="text-sm text-adv-gray">Active Patterns</span>
              </div>
              <div className="text-2xl font-bold text-adv-off-white">{summary?.totalPatterns || 0}</div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className={`w-4 h-4 ${(summary?.criticalPatterns || 0) > 0 ? 'text-red-500' : 'text-adv-gray'}`} />
                <span className="text-sm text-adv-gray">Critical Alerts</span>
              </div>
              <div className={`text-2xl font-bold ${(summary?.criticalPatterns || 0) > 0 ? 'text-red-400' : 'text-adv-off-white'}`}>
                {summary?.criticalPatterns || 0}
              </div>
            </div>
          </div>

          {/* View Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveView('insights')}
              className={`px-4 py-2 rounded-t-lg transition-colors ${
                activeView === 'insights'
                  ? 'bg-card text-adv-teal border-t border-l border-r border-border'
                  : 'text-adv-gray hover:text-adv-off-white'
              }`}
            >
              AI Insights
            </button>
            <button
              onClick={() => setActiveView('timeline')}
              className={`px-4 py-2 rounded-t-lg transition-colors ${
                activeView === 'timeline'
                  ? 'bg-card text-adv-teal border-t border-l border-r border-border'
                  : 'text-adv-gray hover:text-adv-off-white'
              }`}
            >
              Activity Feed
            </button>
            <button
              onClick={() => setActiveView('memory')}
              className={`px-4 py-2 rounded-t-lg transition-colors ${
                activeView === 'memory'
                  ? 'bg-card text-adv-teal border-t border-l border-r border-border'
                  : 'text-adv-gray hover:text-adv-off-white'
              }`}
            >
              Institutional Memory
            </button>
            <button
              onClick={() => setActiveView('heatmap')}
              className={`px-4 py-2 rounded-t-lg transition-colors ${
                activeView === 'heatmap'
                  ? 'bg-card text-adv-teal border-t border-l border-r border-border'
                  : 'text-adv-gray hover:text-adv-off-white'
              }`}
            >
              Entity Heat Map
            </button>
            <button
              onClick={() => setActiveView('temporal')}
              className={`px-4 py-2 rounded-t-lg transition-colors ${
                activeView === 'temporal'
                  ? 'bg-card text-adv-teal border-t border-l border-r border-border'
                  : 'text-adv-gray hover:text-adv-off-white'
              }`}
            >
              Temporal View
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeView === 'insights' && <InsightsTab />}

        {activeView === 'memory' && <InstitutionalMemoryTab />}

        {activeView === 'timeline' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-4 bg-card border border-border rounded-lg p-3">
              <Filter className="w-4 h-4 text-adv-gray" />
              <div className="flex gap-2">
                <button
                  onClick={() => setTimelineFilter('all')}
                  className={`px-3 py-1 text-sm rounded ${
                    timelineFilter === 'all'
                      ? 'bg-adv-teal text-white'
                      : 'bg-secondary text-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setTimelineFilter('patterns')}
                  className={`px-3 py-1 text-sm rounded ${
                    timelineFilter === 'patterns'
                      ? 'bg-adv-teal text-white'
                      : 'bg-secondary text-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  Patterns Only
                </button>
                <button
                  onClick={() => setTimelineFilter('atoms')}
                  className={`px-3 py-1 text-sm rounded ${
                    timelineFilter === 'atoms'
                      ? 'bg-adv-teal text-white'
                      : 'bg-secondary text-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  Atoms Only
                </button>
              </div>

              <div className="border-l border-border pl-4 flex gap-2 items-center">
                <span className="text-sm text-adv-gray">Severity:</span>
                {['critical', 'warning', 'info', 'positive'].map(sev => (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(severityFilter === sev ? null : sev)}
                    className={`px-2 py-1 text-xs rounded capitalize ${
                      severityFilter === sev
                        ? 'bg-adv-teal text-white'
                        : 'bg-secondary text-adv-gray hover:text-adv-off-white'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-3">
              {filteredTimeline.length === 0 && (
                <div className="text-center py-12 text-adv-gray">
                  No entries found. Try adjusting your filters.
                </div>
              )}

              {filteredTimeline.map((entry, idx) => (
                <div key={idx}>
                  {entry.type === 'pattern' ? (
                    <PatternCard
                      pattern={entry.data}
                      onInvestigate={() => handleInvestigatePattern(entry.data)}
                      onResolve={() => handleResolvePattern(entry.data)}
                    />
                  ) : (
                    <div className="bg-card border border-border rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Atom className="w-4 h-4 text-adv-teal mt-1" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs px-2 py-0.5 rounded bg-adv-teal-dim text-adv-teal border border-adv-teal/30">
                              {entry.data.atom_type}
                            </span>
                            <span className="text-xs text-adv-gray">
                              {new Date(entry.data.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-adv-off-white">{entry.data.content}</p>
                          {entry.data.quality_score !== undefined && (
                            <div className="mt-2 text-xs text-adv-gray">
                              Quality: {(entry.data.quality_score * 100).toFixed(0)}%
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'heatmap' && (
          <div>
            <div className="mb-4 text-sm text-adv-gray">
              Entity size represents interaction count. Color intensity shows recency.
            </div>
            <div className="flex flex-wrap gap-4 justify-center">
              {entities.length === 0 && (
                <div className="text-center py-12 text-adv-gray">
                  No entities tracked yet.
                </div>
              )}
              {entities.map((entity, idx) => (
                <EntityHeatMapCell
                  key={idx}
                  entity={entity}
                  size={Math.min(10, entity.interaction_count)}
                  onClick={() => handleEntityClick(entity)}
                />
              ))}
            </div>
          </div>
        )}

        {activeView === 'temporal' && (
          <div className="grid grid-cols-2 gap-6">
            <TemporalChart
              title="Atoms Created per Day (Last 30 Days)"
              data={atomsPerDay}
              color="#2DD4A8"
              valueKey="count"
            />
            <TemporalChart
              title="Patterns Detected per Week (Last 12 Weeks)"
              data={patternsPerWeek}
              color="#F5A623"
              valueKey="count"
            />
            <TemporalChart
              title="Entity Activity (Entities per Week)"
              data={entityActivity}
              color="#3498DB"
              valueKey="entity_count"
            />
            <TemporalChart
              title="Average Quality Score (per Week)"
              data={qualityTrend}
              color="#27AE60"
              valueKey="avg_quality"
            />
          </div>
        )}
      </div>
    </div>
  );
}
