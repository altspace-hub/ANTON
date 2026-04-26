/**
 * OrchestratorPhasePanel — surfaces the user's current phase + criteria for the next.
 *
 * Backend: /api/orchestrator-gate/status
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §C.1.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2, ShieldAlert } from 'lucide-react';
import { getAuthHeader } from '../lib/api';

type Phase = 1 | 2 | 3 | 4;

interface PhaseEligibility {
  eligible: boolean;
  reasons: string[];
  currentPhase: Phase;
  targetPhase?: Phase;
}

interface ActionEntry {
  id: string;
  label: string;
  description: string;
  tier: 'low' | 'medium' | 'high';
  notes?: string;
}

interface StatusResponse {
  current: { phase: Phase; phaseName: string };
  guided: PhaseEligibility;
  supervised: PhaseEligibility;
  autonomous: PhaseEligibility;
  actionRegistry: ActionEntry[];
}

const PHASE_LABEL: Record<Phase, string> = {
  1: 'Observer',
  2: 'Guided',
  3: 'Supervised',
  4: 'Autonomous',
};

const PHASE_DESC: Record<Phase, string> = {
  1: 'Watches and proposes briefings; never acts.',
  2: 'Proposes specific actions; user confirms each.',
  3: 'Auto-executes low-risk actions; gates medium/high.',
  4: 'Auto-executes within scope; flags only mission-style high-risk approvals.',
};

export default function OrchestratorPhasePanel() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/orchestrator-gate/status', { headers: getAuthHeader() })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<StatusResponse>;
      })
      .then(data => { if (!cancelled) setStatus(data); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load orchestrator status'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-adv-gray p-6">
        <Loader2 size={16} className="animate-spin" /> Loading orchestrator phase…
      </div>
    );
  }
  if (error) {
    return <div className="bg-adv-red/10 text-adv-red p-4 rounded">{error}</div>;
  }
  if (!status) return null;

  const phases: Phase[] = [1, 2, 3, 4];
  const currentPhase = status.current.phase;

  return (
    <div className="bg-adv-card rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <ShieldAlert className="text-adv-teal" size={20} />
        Trust Progression
      </div>
      <p className="text-sm text-adv-gray">
        ANTON's orchestrator earns autonomy in four phases. Promotion criteria are deterministic
        and demotion happens automatically on incident.
      </p>

      {/* Phase ladder */}
      <div className="flex flex-col sm:flex-row gap-2">
        {phases.map(p => {
          const isCurrent = p === currentPhase;
          const isPast = p < currentPhase;
          return (
            <div
              key={p}
              className={`flex-1 rounded p-3 border ${
                isCurrent
                  ? 'border-adv-teal bg-adv-teal/10'
                  : isPast
                    ? 'border-adv-card bg-adv-dark-2 text-adv-gray'
                    : 'border-adv-card bg-adv-dark-2'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {isPast || isCurrent
                  ? <CheckCircle2 size={14} className="text-adv-teal" />
                  : <Circle size={14} className="text-adv-gray" />}
                Phase {p} — {PHASE_LABEL[p]}
              </div>
              <div className="text-xs text-adv-gray mt-1">{PHASE_DESC[p]}</div>
            </div>
          );
        })}
      </div>

      {/* Next-phase criteria */}
      {currentPhase < 4 && (
        <div className="bg-adv-dark-2 rounded p-4">
          <div className="text-sm font-medium mb-2">
            Criteria for promotion to Phase {currentPhase + 1} ({PHASE_LABEL[(currentPhase + 1) as Phase]})
          </div>
          <ul className="text-sm text-adv-gray space-y-1">
            {(currentPhase === 1
              ? status.guided
              : currentPhase === 2
                ? status.supervised
                : status.autonomous).reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-adv-teal mt-1">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          {(currentPhase === 1
            ? status.guided.eligible
            : currentPhase === 2
              ? status.supervised.eligible
              : status.autonomous.eligible) && (
            <div className="mt-3 text-sm text-adv-teal">
              ✓ Eligible — promotion will trigger on next orchestrator heartbeat.
            </div>
          )}
        </div>
      )}

      {currentPhase === 4 && (
        <div className="bg-adv-dark-2 rounded p-4 text-sm text-adv-gray">
          Already at Autonomous (Phase 4). Demotion triggers automatically on incident.
        </div>
      )}

      {/* Action-tier registry summary */}
      <details className="text-sm">
        <summary className="cursor-pointer text-adv-gray">
          Action risk registry ({status.actionRegistry.length} actions)
        </summary>
        <div className="mt-2 space-y-1">
          {status.actionRegistry.map(a => (
            <div key={a.id} className="flex items-center gap-2 text-xs">
              <span
                className={`px-2 py-0.5 rounded text-[10px] ${
                  a.tier === 'low'
                    ? 'bg-adv-green/20 text-adv-green'
                    : a.tier === 'medium'
                      ? 'bg-adv-gold/20 text-adv-gold'
                      : 'bg-adv-red/20 text-adv-red'
                }`}
              >
                {a.tier}
              </span>
              <code className="text-adv-off-white">{a.id}</code>
              <span className="text-adv-gray">— {a.label}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
