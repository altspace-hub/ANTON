/**
 * AgentTelemetryPage — fleet-level performance dashboard.
 *
 * Per-agent rollup of conversation outcomes, token cost, average latency,
 * and user satisfaction. Operators use this to manage agent fleet health
 * and decide which agents to invest in / retire.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Activity, Bot, TrendingUp, AlertTriangle, ThumbsUp } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface AgentSummary {
  agent_id: string;
  agent_name: string;
  conversations_total: number;
  conversations_resolved: number;
  conversations_escalated: number;
  conversations_abandoned: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  positive_feedback: number;
  negative_feedback: number;
  resolution_rate: number;            // 0.0–1.0
  escalation_rate: number;            // 0.0–1.0
  satisfaction_score: number | null;  // -1.0 to +1.0
}

export default function AgentTelemetryPage() {
  const [summary, setSummary] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agents/telemetry/summary', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { agents?: AgentSummary[] }) => setSummary(data.agents ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load telemetry'))
      .finally(() => setLoading(false));
  }, []);

  const fleet = useMemo(() => {
    if (summary.length === 0) return null;
    return {
      total_conversations: summary.reduce((s, a) => s + a.conversations_total, 0),
      total_resolved:      summary.reduce((s, a) => s + a.conversations_resolved, 0),
      total_escalated:     summary.reduce((s, a) => s + a.conversations_escalated, 0),
      total_cost_usd:      summary.reduce((s, a) => s + a.total_cost_usd, 0),
      avg_resolution_rate: summary.reduce((s, a) => s + a.resolution_rate, 0) / summary.length,
    };
  }, [summary]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/agents" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <Activity className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Agent telemetry</h1>
            <p className="text-adv-gray text-sm">Fleet performance metrics. Drives capacity planning + agent-quality investments.</p>
          </div>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        {fleet && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-adv-card rounded-lg p-3">
              <div className="text-xs text-adv-gray">Conversations</div>
              <div className="text-2xl font-bold text-adv-off-white mt-1">{fleet.total_conversations}</div>
            </div>
            <div className="bg-adv-card rounded-lg p-3">
              <div className="text-xs text-adv-gray">Resolved</div>
              <div className="text-2xl font-bold text-adv-green mt-1">{fleet.total_resolved}</div>
            </div>
            <div className="bg-adv-card rounded-lg p-3">
              <div className="text-xs text-adv-gray">Escalated</div>
              <div className="text-2xl font-bold text-adv-gold mt-1">{fleet.total_escalated}</div>
            </div>
            <div className="bg-adv-card rounded-lg p-3">
              <div className="text-xs text-adv-gray">Total cost (USD)</div>
              <div className="text-2xl font-bold text-adv-teal mt-1">${fleet.total_cost_usd.toFixed(2)}</div>
            </div>
            <div className="bg-adv-card rounded-lg p-3">
              <div className="text-xs text-adv-gray">Avg resolution</div>
              <div className="text-2xl font-bold text-adv-blue mt-1">{(fleet.avg_resolution_rate * 100).toFixed(0)}%</div>
            </div>
          </div>
        )}

        <h2 className="text-lg font-semibold mb-2">Per-agent performance</h2>
        {loading ? (
          <div className="text-center text-adv-gray py-12">Loading…</div>
        ) : summary.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
            <Bot className="mx-auto mb-2 text-adv-gray/40" size={32} />
            No telemetry yet. Run a conversation through an agent to populate.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-adv-card text-adv-gray">
                <tr>
                  <th className="text-left p-2">Agent</th>
                  <th className="text-right p-2">Conv.</th>
                  <th className="text-right p-2">Resolution %</th>
                  <th className="text-right p-2">Escalation %</th>
                  <th className="text-right p-2">Avg latency</th>
                  <th className="text-right p-2">Cost USD</th>
                  <th className="text-right p-2">Satisfaction</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(a => (
                  <tr key={a.agent_id} className="border-b border-adv-card hover:bg-adv-card/40">
                    <td className="p-2"><code className="text-adv-teal">{a.agent_name}</code></td>
                    <td className="p-2 text-right">{a.conversations_total}</td>
                    <td className="p-2 text-right text-adv-green flex items-center justify-end gap-1">
                      <TrendingUp size={12} /> {(a.resolution_rate * 100).toFixed(0)}%
                    </td>
                    <td className="p-2 text-right text-adv-gold flex items-center justify-end gap-1">
                      <AlertTriangle size={12} /> {(a.escalation_rate * 100).toFixed(0)}%
                    </td>
                    <td className="p-2 text-right">{a.avg_latency_ms != null ? `${a.avg_latency_ms} ms` : '—'}</td>
                    <td className="p-2 text-right">${a.total_cost_usd.toFixed(2)}</td>
                    <td className="p-2 text-right flex items-center justify-end gap-1">
                      {a.satisfaction_score != null && a.satisfaction_score > 0 ? (
                        <ThumbsUp size={12} className="text-adv-green" />
                      ) : null}
                      {a.satisfaction_score != null ? a.satisfaction_score.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
