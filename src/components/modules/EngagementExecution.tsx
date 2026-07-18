import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';

interface Props {
  onInputChange: (inputs: Record<string, unknown>) => void;
}

const JURISDICTIONS = [
  'EU AMLR/AMLD6',
  'Sweden',
  'Finland',
  'Norway',
  'Denmark',
  'Iceland',
  'UK',
  'Germany',
  'Netherlands',
  'France',
  'Multi-jurisdiction',
];

type AnalysisDepth = 'quick' | 'standard' | 'deep';

export default function EngagementExecution({ onInputChange }: Props) {
  const [clientName, setClientName] = useState('');
  const [engagementRef, setEngagementRef] = useState('');
  const [scopeFocus, setScopeFocus] = useState('');
  const [analysisDepth, setAnalysisDepth] = useState<AnalysisDepth>('standard');
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<string[]>([]);
  const [areasOfConcern, setAreasOfConcern] = useState('');

  useEffect(() => {
    onInputChange({
      clientName,
      engagementRef,
      scopeFocus,
      analysisDepth,
      jurisdictions: selectedJurisdictions,
      areasOfConcern,
    });
  }, [clientName, engagementRef, scopeFocus, analysisDepth, selectedJurisdictions, areasOfConcern]);

  const toggleJurisdiction = (j: string) => {
    setSelectedJurisdictions((prev) =>
      prev.includes(j) ? prev.filter((x) => x !== j) : [...prev, j]
    );
  };

  const depthOptions: { id: AnalysisDepth; label: string; description: string }[] = [
    { id: 'quick', label: 'Quick Scan', description: 'High-level overview' },
    { id: 'standard', label: 'Standard', description: 'Full analysis' },
    { id: 'deep', label: 'Deep Dive', description: 'Maximum detail' },
  ];

  return (
    <div className="space-y-3">
      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-lg border border-adv-teal/30 bg-adv-teal-soft p-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-teal" />
        <p className="text-[11px] leading-relaxed text-adv-gray">
          Upload the engagement letter as a document. The AI will parse it into scope items and analyze each systematically.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Client name</label>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="e.g., Nordea, SEB, Handelsbanken"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Engagement reference / project name</label>
        <input
          type="text"
          value={engagementRef}
          onChange={(e) => setEngagementRef(e.target.value)}
          placeholder="e.g., PROJ-2026-042 or 'Nordea AML Review Q1'"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Scope focus</label>
        <textarea
          value={scopeFocus}
          onChange={(e) => setScopeFocus(e.target.value)}
          placeholder="Paste scope items from the engagement letter, or describe the deliverables manually..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          rows={4}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Analysis depth</label>
        <div className="flex gap-1.5">
          {depthOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setAnalysisDepth(opt.id)}
              className={`flex-1 rounded-lg border p-2 text-center transition-colors ${
                analysisDepth === opt.id
                  ? 'border-adv-teal bg-adv-teal-dim'
                  : 'border-border bg-adv-dark hover:border-adv-gray-med'
              }`}
            >
              <div className={`text-xs font-medium ${analysisDepth === opt.id ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                {opt.label}
              </div>
              <div className="text-xs text-adv-gray">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Jurisdictions</label>
        <div className="flex flex-wrap gap-1.5">
          {JURISDICTIONS.map((j) => (
            <button
              key={j}
              onClick={() => toggleJurisdiction(j)}
              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                selectedJurisdictions.includes(j)
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med'
              }`}
            >
              {j}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Areas of concern (optional)</label>
        <textarea
          value={areasOfConcern}
          onChange={(e) => setAreasOfConcern(e.target.value)}
          placeholder="Any known issues, audit findings, or areas requiring special attention..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          rows={2}
        />
      </div>
    </div>
  );
}
