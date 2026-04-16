/**
 * RoundNavigator — round timeline + Queen advance/converge actions.
 *
 * Shows each round as a row with its phase, contribution count, consensus,
 * and (when ended) summary. Active round is highlighted.
 */

import { useState } from 'react';
import { ArrowRight, Play, Hexagon, Sparkles, Check } from 'lucide-react';

export interface RoundSummary {
  id: number;
  round_number: number;
  phase: 'opening' | 'deliberation' | 'convergence' | 'dissent_capture';
  summary: string | null;
  consensus_temperature: number | null;
  contribution_count: number;
  started_at: string;
  ended_at: string | null;
}

interface RoundNavigatorProps {
  rounds: RoundSummary[];
  hiveStatus: 'forming' | 'active' | 'converging' | 'concluded' | 'archived';
  isQueen: boolean;
  selectedRound: number | null;
  onSelectRound: (round: number | null) => void;
  onAdvanceRound: () => Promise<void>;
  onTriggerConvergence: () => Promise<void>;
}

const PHASE_LABEL: Record<RoundSummary['phase'], string> = {
  opening: 'Opening',
  deliberation: 'Deliberation',
  convergence: 'Convergence',
  dissent_capture: 'Dissent capture',
};

const PHASE_CLASSES: Record<RoundSummary['phase'], string> = {
  opening: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10',
  deliberation: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10',
  convergence: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10',
  dissent_capture: 'text-adv-red border-adv-red/40 bg-adv-red/10',
};

export default function RoundNavigator({
  rounds, hiveStatus, isQueen, selectedRound, onSelectRound,
  onAdvanceRound, onTriggerConvergence,
}: RoundNavigatorProps) {
  const [advancing, setAdvancing] = useState(false);
  const [converging, setConverging] = useState(false);

  const canAdvance = isQueen && (hiveStatus === 'forming' || hiveStatus === 'active');
  const canConverge = isQueen && hiveStatus === 'active' && rounds.length > 0;

  async function advance() {
    setAdvancing(true);
    try { await onAdvanceRound(); } finally { setAdvancing(false); }
  }
  async function converge() {
    if (!confirm('Trigger convergence? Participants can still submit dissents but the round phase will switch to convergence.')) return;
    setConverging(true);
    try { await onTriggerConvergence(); } finally { setConverging(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-teal flex items-center gap-1.5">
          <Hexagon className="h-3.5 w-3.5" />
          Rounds
        </h3>
        {isQueen && (
          <div className="flex items-center gap-1.5">
            {canAdvance && (
              <button
                onClick={advance}
                disabled={advancing || converging}
                className="rounded border border-adv-teal/40 bg-adv-teal/10 px-2 py-1 text-[11px] text-adv-teal hover:bg-adv-teal/20 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Play className="h-3 w-3" />
                {rounds.length === 0 ? 'Open round 1' : `Advance to round ${rounds.length + 1}`}
              </button>
            )}
            {canConverge && (
              <button
                onClick={converge}
                disabled={advancing || converging}
                className="rounded border border-adv-gold/40 bg-adv-gold/10 px-2 py-1 text-[11px] text-adv-gold hover:bg-adv-gold/20 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                Converge
              </button>
            )}
          </div>
        )}
      </div>

      {rounds.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-adv-gray italic">
          No rounds yet — {isQueen ? 'open Round 1 to begin deliberation.' : 'waiting for the Queen to start.'}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {/* "All rounds" row */}
          <li>
            <button
              onClick={() => onSelectRound(null)}
              className={`w-full px-4 py-2 text-left text-xs flex items-center justify-between hover:bg-adv-dark/30 transition-colors ${selectedRound === null ? 'bg-adv-dark/40' : ''}`}
            >
              <span className="text-adv-off-white font-medium">All rounds</span>
              <span className="text-adv-gray">{rounds.length}</span>
            </button>
          </li>
          {rounds.map(r => {
            const isSelected = selectedRound === r.round_number;
            const isActive = !r.ended_at;
            return (
              <li key={r.id}>
                <button
                  onClick={() => onSelectRound(r.round_number)}
                  className={`w-full px-4 py-2.5 text-left flex items-start gap-2 hover:bg-adv-dark/30 transition-colors ${isSelected ? 'bg-adv-dark/40' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-adv-off-white">Round {r.round_number}</span>
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${PHASE_CLASSES[r.phase]}`}>
                        {PHASE_LABEL[r.phase]}
                      </span>
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-adv-teal">
                          <span className="h-1.5 w-1.5 rounded-full bg-adv-teal animate-pulse" />
                          live
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-adv-gray">
                          <Check className="h-2.5 w-2.5" />
                          closed
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-adv-gray flex items-center gap-2">
                      <span>{r.contribution_count} contributions</span>
                      {r.consensus_temperature != null && (
                        <>
                          <span>·</span>
                          <span>consensus {(r.consensus_temperature * 100).toFixed(0)}%</span>
                        </>
                      )}
                    </div>
                    {r.summary && isSelected && (
                      <p className="mt-1.5 text-[11px] text-adv-off-white whitespace-pre-wrap leading-snug">{r.summary}</p>
                    )}
                  </div>
                  <ArrowRight className="h-3 w-3 text-adv-gray shrink-0 mt-0.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
