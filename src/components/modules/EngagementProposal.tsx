import { useState, useEffect } from 'react';

interface Props {
  onInputChange: (inputs: Record<string, unknown>) => void;
}

const ENGAGEMENT_TYPES = [
  'AML Gap Analysis',
  'Policy Review',
  'BWRA',
  'Sanctions Review',
  'TM Assessment',
  'Regulatory Implementation',
  'Training Programme',
  'Data Quality Assessment',
  'Full AML Programme Review',
];

const DIFFERENTIATORS = [
  'Nordic expertise',
  'Regulatory relationships',
  'Technology partnerships',
  'Implementation track record',
  'Industry specialization',
  'AMLA/AMLR expertise',
  'Cross-border experience',
];

export default function EngagementProposal({ onInputChange }: Props) {
  const [clientName, setClientName] = useState('');
  const [engagementType, setEngagementType] = useState('');
  const [proposalDeadline, setProposalDeadline] = useState('');
  const [selectedDifferentiators, setSelectedDifferentiators] = useState<string[]>([]);
  const [budgetRange, setBudgetRange] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [winThemes, setWinThemes] = useState('');

  useEffect(() => {
    onInputChange({
      clientName,
      engagementType,
      proposalDeadline,
      differentiators: selectedDifferentiators,
      budgetRange,
      specialRequirements,
      winThemes,
    });
  }, [clientName, engagementType, proposalDeadline, selectedDifferentiators, budgetRange, specialRequirements, winThemes]);

  const toggleDifferentiator = (d: string) => {
    setSelectedDifferentiators((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-adv-gray">Client name</label>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="e.g., Nordea, SEB, Handelsbanken"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Engagement type</label>
        <select
          value={engagementType}
          onChange={(e) => setEngagementType(e.target.value)}
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
        >
          <option value="">Select...</option>
          {ENGAGEMENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Proposal deadline</label>
        <input
          type="text"
          value={proposalDeadline}
          onChange={(e) => setProposalDeadline(e.target.value)}
          placeholder="e.g., 2026-03-15 or 'End of March'"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Key differentiators</label>
        <div className="flex flex-wrap gap-1.5">
          {DIFFERENTIATORS.map((d) => (
            <button
              key={d}
              onClick={() => toggleDifferentiator(d)}
              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                selectedDifferentiators.includes(d)
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Budget range (optional)</label>
        <input
          type="text"
          value={budgetRange}
          onChange={(e) => setBudgetRange(e.target.value)}
          placeholder="e.g., EUR 50,000-80,000"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Special requirements</label>
        <textarea
          value={specialRequirements}
          onChange={(e) => setSpecialRequirements(e.target.value)}
          placeholder="Any specific client requirements, procurement rules, format requirements..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          rows={2}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Win themes</label>
        <textarea
          value={winThemes}
          onChange={(e) => setWinThemes(e.target.value)}
          placeholder="2-3 key messages that should come through in the proposal..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          rows={2}
        />
      </div>
    </div>
  );
}
