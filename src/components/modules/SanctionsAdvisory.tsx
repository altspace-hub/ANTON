import { useState, useEffect } from 'react';

interface Props {
  onInputChange: (inputs: Record<string, unknown>) => void;
}

const SUB_TASKS = [
  { id: 'regime-briefing', label: 'Regime Briefing', description: 'Overview of a specific sanctions regime' },
  { id: 'eba-guidelines', label: 'EBA Guidelines Implementation', description: 'Implement EBA sanctions guidelines' },
  { id: 'screening-assessment', label: 'Screening Assessment', description: 'Assess screening systems and processes' },
  { id: 'policy-review', label: 'Policy Review', description: 'Review sanctions policy and procedures' },
  { id: 'derisking-analysis', label: 'De-risking Analysis', description: 'Analyze de-risking decisions and alternatives' },
  { id: 'incident-response', label: 'Incident Response', description: 'Sanctions hit/breach response guidance' },
];

export default function SanctionsAdvisory({ onInputChange }: Props) {
  const [subTask, setSubTask] = useState('');
  const [regime, setRegime] = useState('');
  const [context, setContext] = useState('');

  useEffect(() => {
    onInputChange({ subTask, regime, context });
  }, [subTask, regime, context]);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-adv-gray">Advisory type</label>
        <div className="space-y-1.5">
          {SUB_TASKS.map((st) => (
            <button
              key={st.id}
              onClick={() => setSubTask(st.id)}
              className={`flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                subTask === st.id
                  ? 'border-adv-teal bg-adv-teal-dim'
                  : 'border-border bg-adv-dark hover:border-adv-gray-med'
              }`}
            >
              <div>
                <div className={`text-xs font-medium ${subTask === st.id ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                  {st.label}
                </div>
                <div className="text-[11px] text-adv-gray">{st.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Sanctions regime (if applicable)</label>
        <input
          type="text"
          value={regime}
          onChange={(e) => setRegime(e.target.value)}
          placeholder="e.g., EU, US/OFAC, UN, UK"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Additional context</label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Specific details about the situation, entity type, or concerns..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          rows={3}
        />
      </div>
    </div>
  );
}
