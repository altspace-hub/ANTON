import React, { useState, useEffect } from 'react';
import {
  Zap,
  Play,
  Pause,
  RefreshCw,
  Settings,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';
import { PatternCard } from '../features/intelligence/PatternCard';
import { DetectedPattern } from '../features/intelligence/types';

interface SchedulerStatus {
  enabled: boolean;
  cronExpression: string;
  isRunning: boolean;
  lastRun: any;
  recentRuns: any[];
}

interface DetectionRun {
  id: number;
  run_time: string;
  patterns_detected: number;
  duration_ms: number;
  status: 'success' | 'error';
  error_message?: string;
  is_manual: number;
}

export default function PatternDetectionPage() {
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [detectionHistory, setDetectionHistory] = useState<DetectionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningDetection, setRunningDetection] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // Scheduler config
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [cronExpression, setCronExpression] = useState('');
  const [schedulerEnabled, setSchedulerEnabled] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [statusFilter, severityFilter, typeFilter]);

  async function loadData() {
    try {
      setLoading(true);

      // Load patterns
      let patternsUrl = `/api/patterns?status=${statusFilter}&limit=100`;
      if (severityFilter) patternsUrl += `&severity=${severityFilter}`;
      if (typeFilter) patternsUrl += `&type=${typeFilter}`;

      const [patternsRes, schedulerRes, historyRes] = await Promise.all([
        fetch(patternsUrl),
        fetch('/api/patterns/scheduler/status'),
        fetch('/api/patterns/scheduler/history?limit=20'),
      ]);

      const patternsData = await patternsRes.json();
      const schedulerData = await schedulerRes.json();
      const historyData = await historyRes.json();

      setPatterns(patternsData.patterns || []);
      setSchedulerStatus(schedulerData);
      setDetectionHistory(historyData.runs || []);

      // Update scheduler config form
      if (schedulerData.cronExpression) {
        setCronExpression(schedulerData.cronExpression);
        setSchedulerEnabled(schedulerData.enabled);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function runDetectionNow() {
    try {
      setRunningDetection(true);
      const res = await fetch('/api/patterns/scheduler/run-now', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        alert(`Detection complete! ${data.patternsDetected} patterns detected in ${data.duration_ms}ms`);
        await loadData();
      } else {
        alert(`Detection failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to run detection:', error);
      alert('Failed to run detection');
    } finally {
      setRunningDetection(false);
    }
  }

  async function toggleScheduler() {
    try {
      const endpoint = schedulerStatus?.isRunning
        ? '/api/patterns/scheduler/stop'
        : '/api/patterns/scheduler/start';

      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        await loadData();
      }
    } catch (error) {
      console.error('Failed to toggle scheduler:', error);
    }
  }

  async function updateSchedulerConfig() {
    try {
      const res = await fetch('/api/patterns/scheduler/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: schedulerEnabled,
          cronExpression,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowConfigModal(false);
        await loadData();
        alert('Scheduler configuration updated');
      }
    } catch (error) {
      console.error('Failed to update scheduler config:', error);
      alert('Failed to update configuration');
    }
  }

  async function resolvePattern(pattern: DetectedPattern) {
    if (!confirm(`Mark pattern "${pattern.title}" as resolved?`)) return;

    try {
      const notes = prompt('Resolution notes (optional):');
      await fetch(`/api/patterns/${pattern.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'resolved',
          resolvedBy: 'user',
          notes,
        }),
      });
      await loadData();
    } catch (error) {
      console.error('Failed to resolve pattern:', error);
      alert('Failed to resolve pattern');
    }
  }

  async function investigatePattern(pattern: DetectedPattern) {
    try {
      await fetch(`/api/patterns/${pattern.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'investigating',
        }),
      });
      await loadData();
    } catch (error) {
      console.error('Failed to update pattern:', error);
    }
  }

  const activeCount = patterns.filter(p => p.status === 'active').length;
  const criticalCount = patterns.filter(p => p.severity === 'critical' && p.status === 'active').length;
  const warningCount = patterns.filter(p => p.severity === 'warning' && p.status === 'active').length;

  if (loading && !patterns.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-adv-teal" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="border-b border-adv-gray-med/20 bg-adv-dark-2">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-adv-teal-dim rounded-lg">
              <Zap className="w-6 h-6 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-adv-white">Pattern Detection</h1>
              <p className="text-sm text-adv-gray">Automated cross-workflow pattern analysis</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-adv-teal" />
                <span className="text-sm text-adv-gray">Active Patterns</span>
              </div>
              <div className="text-2xl font-bold text-adv-white">{activeCount}</div>
            </div>

            <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-adv-gray">Critical</span>
              </div>
              <div className={`text-2xl font-bold ${criticalCount > 0 ? 'text-red-400' : 'text-adv-white'}`}>
                {criticalCount}
              </div>
            </div>

            <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-adv-gray">Warnings</span>
              </div>
              <div className={`text-2xl font-bold ${warningCount > 0 ? 'text-amber-400' : 'text-adv-white'}`}>
                {warningCount}
              </div>
            </div>

            <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-adv-teal" />
                <span className="text-sm text-adv-gray">Last Run</span>
              </div>
              <div className="text-sm font-medium text-adv-white">
                {schedulerStatus?.lastRun
                  ? new Date(schedulerStatus.lastRun.run_time).toLocaleTimeString()
                  : 'Never'}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              <button
                onClick={toggleScheduler}
                className={`flex items-center gap-2 px-4 py-2 rounded transition ${
                  schedulerStatus?.isRunning
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-adv-teal text-white hover:bg-adv-teal-dark'
                }`}
              >
                {schedulerStatus?.isRunning ? (
                  <>
                    <Pause className="w-4 h-4" />
                    Stop Scheduler
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start Scheduler
                  </>
                )}
              </button>

              <button
                onClick={runDetectionNow}
                disabled={runningDetection}
                className="flex items-center gap-2 px-4 py-2 bg-adv-card hover:bg-adv-dark-2 border border-adv-gray-med/20 text-adv-white rounded transition disabled:opacity-50"
              >
                {runningDetection ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Run Now
                  </>
                )}
              </button>

              <button
                onClick={() => setShowConfigModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-adv-card hover:bg-adv-dark-2 border border-adv-gray-med/20 text-adv-white rounded transition"
              >
                <Settings className="w-4 h-4" />
                Configure
              </button>
            </div>

            <div className="text-sm text-adv-gray">
              {schedulerStatus?.isRunning && (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Scheduler running: {schedulerStatus.cronExpression}
                </span>
              )}
              {!schedulerStatus?.isRunning && <span>Scheduler stopped</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-6 w-full">
        {/* Left: Patterns */}
        <div className="col-span-8 space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4 bg-adv-card border border-adv-gray-med/20 rounded-lg p-3">
            <div className="flex gap-2">
              <span className="text-sm text-adv-gray">Status:</span>
              {['active', 'investigating', 'resolved', 'dismissed'].map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1 text-sm rounded capitalize ${
                    statusFilter === status
                      ? 'bg-adv-teal text-white'
                      : 'bg-adv-dark-2 text-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="border-l border-adv-gray-med/20 pl-4 flex gap-2">
              <span className="text-sm text-adv-gray">Severity:</span>
              {['critical', 'warning', 'info', 'positive'].map(sev => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(severityFilter === sev ? null : sev)}
                  className={`px-2 py-1 text-xs rounded capitalize ${
                    severityFilter === sev
                      ? 'bg-adv-teal text-white'
                      : 'bg-adv-dark-2 text-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Pattern List */}
          <div className="space-y-3">
            {patterns.length === 0 && (
              <div className="text-center py-12 text-adv-gray bg-adv-card border border-adv-gray-med/20 rounded-lg">
                No patterns found. Try adjusting your filters or run detection.
              </div>
            )}

            {patterns.map(pattern => (
              <PatternCard
                key={pattern.id}
                pattern={pattern}
                onInvestigate={() => investigatePattern(pattern)}
                onResolve={() => resolvePattern(pattern)}
              />
            ))}
          </div>
        </div>

        {/* Right: Detection History */}
        <div className="col-span-4">
          <div className="bg-adv-card border border-adv-gray-med/20 rounded-lg p-4 sticky top-4">
            <h3 className="font-semibold text-adv-white mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-adv-teal" />
              Detection History
            </h3>

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {detectionHistory.length === 0 && (
                <p className="text-xs text-adv-gray py-4">No detection runs yet</p>
              )}

              {detectionHistory.map(run => (
                <div key={run.id} className="p-3 bg-adv-dark-2 rounded text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-adv-white font-medium">
                      {new Date(run.run_time).toLocaleString()}
                    </span>
                    {run.status === 'success' ? (
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-400" />
                    )}
                  </div>

                  <div className="text-adv-gray">
                    {run.patterns_detected} patterns • {run.duration_ms}ms
                  </div>

                  {run.is_manual === 1 && (
                    <span className="text-xs text-adv-teal">Manual run</span>
                  )}

                  {run.error_message && (
                    <div className="text-red-400 mt-1">Error: {run.error_message}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Config Modal */}
      {showConfigModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowConfigModal(false)}
        >
          <div
            className="bg-adv-card rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-adv-white mb-4">Scheduler Configuration</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-adv-gray mb-2">
                  <input
                    type="checkbox"
                    checked={schedulerEnabled}
                    onChange={e => setSchedulerEnabled(e.target.checked)}
                    className="mr-2"
                  />
                  Enable automatic detection
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-adv-gray mb-2">
                  Cron Expression
                </label>
                <input
                  type="text"
                  value={cronExpression}
                  onChange={e => setCronExpression(e.target.value)}
                  placeholder="0 */6 * * *"
                  className="w-full px-3 py-2 bg-adv-dark-2 border border-adv-gray/20 rounded text-adv-white focus:outline-none focus:border-adv-teal"
                />
                <p className="text-xs text-adv-gray mt-1">
                  Examples: "0 */6 * * *" (every 6h), "0 0 * * *" (daily at midnight)
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="flex-1 px-4 py-2 bg-adv-dark-2 hover:bg-adv-gray/10 text-adv-gray rounded transition"
                >
                  Cancel
                </button>
                <button
                  onClick={updateSchedulerConfig}
                  className="flex-1 px-4 py-2 bg-adv-teal hover:bg-adv-teal-dark text-white rounded transition"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
