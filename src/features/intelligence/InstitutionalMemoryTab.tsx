/**
 * Institutional Memory Tab
 *
 * Displays checkpoint decision history, clusters, and similarity insights.
 * Shows how the system learns from past decisions.
 */

import React, { useState, useEffect } from 'react';
import {
  Brain,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  TrendingDown,
  GitBranch,
  Users,
  Filter,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface CheckpointDecision {
  id: string;
  decision: string;
  reasoning: string;
  context: string;
  workflowId: string;
  stepIndex: number;
  confidence: number;
  userFeedback: number | null;
  createdAt: string;
  decidedBy: string;
  isOverride: boolean;
  overrideCategory?: string;
}

interface DecisionCluster {
  id: string;
  clusterName: string;
  representativeDecision: string;
  decisionCount: number;
  avgConfidence: number;
  positiveFeedback: number;
  negativeFeedback: number;
  decisions: Array<{ id: string; decision: string; similarity: number }>;
}

interface InsightSummary {
  hasHistory: boolean;
  totalDecisions: number;
  distribution: Record<string, number>;
  positiveFeedback: number;
  negativeFeedback: number;
  feedbackScore: number;
  dominantDecision: string;
  dominantDecisionRate: number;
  insight: string;
}

export function InstitutionalMemoryTab() {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<InsightSummary | null>(null);
  const [history, setHistory] = useState<CheckpointDecision[]>([]);
  const [clusters, setClusters] = useState<DecisionCluster[]>([]);
  const [activeView, setActiveView] = useState<'history' | 'clusters'>('clusters');
  const [workflowFilter, setWorkflowFilter] = useState<string | null>(null);

  useEffect(() => {
    loadMemoryData();
  }, [workflowFilter]);

  async function loadMemoryData() {
    try {
      setLoading(true);

      const queryParams = workflowFilter
        ? `?workflowId=${workflowFilter}`
        : '';

      // Load insights summary
      const insightsRes = await fetch(`/api/memory/insights${queryParams}`);
      const insightsData = await insightsRes.json();
      setInsights(insightsData);

      // Load decision history
      const historyParams = workflowFilter ? `?workflowId=${workflowFilter}&limit=50` : '?limit=50';
      const historyRes = await fetch(`/api/memory/checkpoints${historyParams}`);
      const historyData = await historyRes.json();
      setHistory(historyData.recentDecisions || []);

      // Load clusters
      const clusterParams = workflowFilter ? `?workflowId=${workflowFilter}&numClusters=6` : '?numClusters=6';
      const clustersRes = await fetch(`/api/memory/clusters${clusterParams}`);
      const clustersData = await clustersRes.json();
      setClusters(clustersData.clusters || []);
    } catch (error) {
      console.error('Failed to load institutional memory data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleFeedback(decisionId: string, feedback: 1 | -1) {
    try {
      await fetch(`/api/memory/checkpoints/${decisionId}/feedback`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      loadMemoryData(); // Refresh
    } catch (error) {
      console.error('Failed to record feedback:', error);
    }
  }

  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  }

  function getFeedbackIcon(feedback: number | null) {
    if (feedback === 1) return <ThumbsUp className="w-4 h-4 text-green-400" />;
    if (feedback === -1) return <ThumbsDown className="w-4 h-4 text-red-400" />;
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-adv-teal" />
      </div>
    );
  }

  if (!insights?.hasHistory) {
    return (
      <div className="text-center py-12">
        <Brain className="w-12 h-12 text-adv-gray mx-auto mb-3" />
        <p className="text-adv-gray">No checkpoint decisions recorded yet.</p>
        <p className="text-sm text-adv-gray-med mt-2">
          Institutional Memory learns from checkpoint decisions made during workflows.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-adv-teal" />
            <span className="text-sm text-adv-gray">Total Decisions</span>
          </div>
          <div className="text-2xl font-bold text-adv-white">{insights.totalDecisions}</div>
        </div>

        <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <ThumbsUp className="w-4 h-4 text-green-400" />
            <span className="text-sm text-adv-gray">Positive Feedback</span>
          </div>
          <div className="text-2xl font-bold text-green-400">{insights.positiveFeedback}</div>
        </div>

        <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <ThumbsDown className="w-4 h-4 text-red-400" />
            <span className="text-sm text-adv-gray">Negative Feedback</span>
          </div>
          <div className="text-2xl font-bold text-red-400">{insights.negativeFeedback}</div>
        </div>

        <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            {insights.feedbackScore > 0 ? (
              <TrendingUp className="w-4 h-4 text-green-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
            <span className="text-sm text-adv-gray">Feedback Score</span>
          </div>
          <div
            className={`text-2xl font-bold ${
              insights.feedbackScore > 0 ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {insights.feedbackScore > 0 ? '+' : ''}
            {insights.feedbackScore}
          </div>
        </div>
      </div>

      {/* Insight Summary */}
      <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-adv-teal mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-adv-white mb-1">Insights</h3>
            <p className="text-sm text-adv-gray">{insights.insight}</p>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-3">
        <div className="flex items-start gap-3 text-sm text-adv-gray">
          <Filter className="w-4 h-4 mt-0.5" />
          <div>
            <p>Showing all workflow checkpoint decisions across all workflows.</p>
            <p className="text-xs text-adv-gray-med mt-1">
              Future enhancement: Add workflow-specific filtering
            </p>
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex gap-2 border-b border-adv-gray-med/20">
        <button
          onClick={() => setActiveView('clusters')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeView === 'clusters'
              ? 'border-adv-teal text-adv-teal'
              : 'border-transparent text-adv-gray hover:text-adv-off-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            <span>Decision Clusters</span>
          </div>
        </button>
        <button
          onClick={() => setActiveView('history')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeView === 'history'
              ? 'border-adv-teal text-adv-teal'
              : 'border-transparent text-adv-gray hover:text-adv-off-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            <span>Decision History</span>
          </div>
        </button>
      </div>

      {/* Clusters View */}
      {activeView === 'clusters' && (
        <div className="grid grid-cols-2 gap-4">
          {clusters.length === 0 && (
            <div className="col-span-2 text-center py-12 text-adv-gray">
              Not enough decisions to cluster yet.
            </div>
          )}

          {clusters.map((cluster) => (
            <div
              key={cluster.id}
              className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4"
            >
              <div className="flex items-start gap-3 mb-3">
                <GitBranch className="w-5 h-5 text-adv-teal mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-adv-white mb-1">
                    {cluster.clusterName}
                  </h3>
                  <p className="text-xs text-adv-gray">
                    {cluster.decisionCount} decisions •{' '}
                    {(cluster.avgConfidence * 100).toFixed(0)}% avg confidence
                  </p>
                </div>
              </div>

              <div className="mb-3">
                <p className="text-sm text-adv-off-white">
                  "{cluster.representativeDecision.substring(0, 150)}
                  {cluster.representativeDecision.length > 150 ? '...' : ''}"
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs text-adv-gray">
                <div className="flex items-center gap-1">
                  <ThumbsUp className="w-3 h-3 text-green-400" />
                  <span>{cluster.positiveFeedback}</span>
                </div>
                <div className="flex items-center gap-1">
                  <ThumbsDown className="w-3 h-3 text-red-400" />
                  <span>{cluster.negativeFeedback}</span>
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <Users className="w-3 h-3" />
                  <span>{cluster.decisionCount}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History View */}
      {activeView === 'history' && (
        <div className="space-y-3">
          {history.length === 0 && (
            <div className="text-center py-12 text-adv-gray">
              No decisions recorded for this checkpoint type.
            </div>
          )}

          {history.map((decision) => (
            <div
              key={decision.id}
              className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4"
            >
              <div className="flex items-start gap-3 mb-2">
                <Brain className="w-4 h-4 text-adv-teal mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded bg-adv-teal-dim text-adv-teal border border-adv-teal/30">
                      {decision.workflowId} • Step {decision.stepIndex}
                    </span>
                    {decision.isOverride && (
                      <span className="text-xs px-2 py-0.5 rounded bg-yellow-900/30 text-yellow-400 border border-yellow-600/30">
                        Override
                      </span>
                    )}
                    {decision.confidence !== null && decision.confidence !== undefined && (
                      <span className={`text-xs font-medium ${getConfidenceColor(decision.confidence)}`}>
                        {(decision.confidence * 100).toFixed(0)}% confidence
                      </span>
                    )}
                    {decision.userFeedback !== null && (
                      <div className="ml-auto">{getFeedbackIcon(decision.userFeedback)}</div>
                    )}
                  </div>

                  <p className="text-sm text-adv-off-white mb-2">"{decision.decision}"</p>

                  {decision.reasoning && (
                    <p className="text-xs text-adv-gray mb-2">
                      Reasoning: {decision.reasoning.substring(0, 200)}
                      {decision.reasoning.length > 200 ? '...' : ''}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-adv-gray-med">
                    <span>{new Date(decision.createdAt).toLocaleString()}</span>
                    <span>•</span>
                    <span>by {decision.decidedBy}</span>

                    {decision.userFeedback === null && (
                      <div className="ml-auto flex gap-2">
                        <button
                          onClick={() => handleFeedback(decision.id, 1)}
                          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-adv-dark-2 text-adv-gray hover:text-green-400 transition-colors"
                          title="Thumbs up — this was a good decision"
                        >
                          <ThumbsUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleFeedback(decision.id, -1)}
                          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-adv-dark-2 text-adv-gray hover:text-red-400 transition-colors"
                          title="Thumbs down — this was a poor decision"
                        >
                          <ThumbsDown className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
