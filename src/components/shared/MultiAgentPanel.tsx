import { Users, AlertCircle } from 'lucide-react';
import { useSessionStore } from '@/stores/useSessionStore';
import HelpTooltip from './HelpTooltip';

export default function MultiAgentPanel() {
  const multiAgentEnabled = useSessionStore((state) => state.multiAgentEnabled);
  const multiAgentTeam = useSessionStore((state) => state.multiAgentTeam);
  const multiAgentStyle = useSessionStore((state) => state.multiAgentStyle);
  const setMultiAgentEnabled = useSessionStore((state) => state.setMultiAgentEnabled);
  const setMultiAgentTeam = useSessionStore((state) => state.setMultiAgentTeam);
  const setMultiAgentStyle = useSessionStore((state) => state.setMultiAgentStyle);

  return (
    <div className="rounded-xl border border-border bg-adv-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-adv-teal" />
          <h3 className="text-sm font-semibold text-adv-off-white">Multi-Agent Mode</h3>
          <HelpTooltip text="Run multiple Claude instances in parallel, each with specialized expertise, then synthesize results. ~2x cost but higher quality for complex analysis." />
        </div>
        <button
          onClick={() => setMultiAgentEnabled(!multiAgentEnabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            multiAgentEnabled ? 'bg-adv-teal' : 'bg-adv-gray-med/30'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              multiAgentEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {multiAgentEnabled && (
        <>
          {/* Cost Warning */}
          <div className="mb-4 rounded-lg border border-adv-gold/30 bg-adv-gold/10 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-adv-gold" />
              <div className="text-xs text-adv-gold">
                <strong>Cost impact:</strong> Multi-agent mode runs 3 Claude instances in parallel
                + 1 for synthesis. Approximately 2x the cost of single-agent (using Haiku for parallel agents keeps costs reasonable).
              </div>
            </div>
          </div>

          {/* Team Selection */}
          <div className="mb-3">
            <label className="mb-2 block text-xs font-medium text-adv-gray">Team</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: 'compliance' as const,
                  label: 'Compliance',
                  desc: 'Regulatory + Risk + Technical',
                },
                {
                  id: 'strategic' as const,
                  label: 'Strategic',
                  desc: 'Strategy + Finance + Change',
                },
                {
                  id: 'quality' as const,
                  label: 'Quality',
                  desc: 'Review + Peer + Red Team',
                },
              ].map((team) => (
                <button
                  key={team.id}
                  onClick={() => setMultiAgentTeam(team.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    multiAgentTeam === team.id
                      ? 'border-adv-teal bg-adv-teal/10 text-adv-teal'
                      : 'border-border bg-adv-dark-2 text-adv-off-white hover:border-adv-teal/50'
                  }`}
                >
                  <div className="text-xs font-semibold">{team.label}</div>
                  <div className="mt-1 text-xs text-adv-gray">{team.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Collaboration Style */}
          <div>
            <label className="mb-2 block text-xs font-medium text-adv-gray">
              Collaboration Style
            </label>
            <div className="flex gap-2">
              {[
                {
                  id: 'parallel' as const,
                  label: 'Parallel',
                  desc: 'Integrate all perspectives',
                },
                {
                  id: 'debate' as const,
                  label: 'Debate',
                  desc: 'Show tensions & trade-offs',
                },
                {
                  id: 'consensus' as const,
                  label: 'Consensus',
                  desc: 'Find common ground',
                },
              ].map((style) => (
                <button
                  key={style.id}
                  onClick={() => setMultiAgentStyle(style.id)}
                  className={`flex-1 rounded-lg border p-2 text-left transition-colors ${
                    multiAgentStyle === style.id
                      ? 'border-adv-teal bg-adv-teal/10 text-adv-teal'
                      : 'border-border bg-adv-dark-2 text-adv-off-white hover:border-adv-teal/50'
                  }`}
                >
                  <div className="text-xs font-semibold">{style.label}</div>
                  <div className="mt-0.5 text-xs text-adv-gray">{style.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
