import { useState, useEffect } from 'react';

interface Props {
  onInputChange: (inputs: Record<string, unknown>) => void;
}

const AUDIENCES = [
  { id: 'board', label: 'Board & Senior Management', description: 'Strategic overview, governance responsibilities' },
  { id: 'compliance', label: 'Compliance Team', description: 'Detailed regulatory requirements, procedures' },
  { id: 'frontline', label: 'Front-line Staff', description: 'Practical red flags, customer interaction scenarios' },
  { id: 'relationship-managers', label: 'Relationship Managers', description: 'CDD, ongoing monitoring, risk indicators' },
  { id: 'operations-it', label: 'Operations / IT', description: 'Data handling, system requirements, technical controls' },
];

const TOPICS = [
  'AML/CFT Fundamentals',
  'Customer Due Diligence',
  'Transaction Monitoring',
  'Suspicious Activity Reporting',
  'Sanctions Compliance',
  'Beneficial Ownership',
  'PEP Handling',
  'De-risking & Financial Inclusion',
  'ML/TF Typologies',
  'Regulatory Updates',
];

export default function TrainingContent({ onInputChange }: Props) {
  const [audience, setAudience] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [additionalContext, setAdditionalContext] = useState('');

  useEffect(() => {
    onInputChange({ audience, topics, additionalContext });
  }, [audience, topics, additionalContext]);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-adv-gray">Target audience</label>
        <div className="space-y-1.5">
          {AUDIENCES.map((a) => (
            <button
              key={a.id}
              onClick={() => setAudience(a.id)}
              className={`flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                audience === a.id
                  ? 'border-adv-teal bg-adv-teal-dim'
                  : 'border-border bg-adv-dark hover:border-adv-gray-med'
              }`}
            >
              <div>
                <div className={`text-xs font-medium ${audience === a.id ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                  {a.label}
                </div>
                <div className="text-[11px] text-adv-gray-med">{a.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Topics to cover</label>
        <div className="flex flex-wrap gap-1.5">
          {TOPICS.map((topic) => (
            <button
              key={topic}
              onClick={() =>
                setTopics((prev) =>
                  prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
                )
              }
              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                topics.includes(topic)
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med'
              }`}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Additional context (optional)</label>
        <textarea
          value={additionalContext}
          onChange={(e) => setAdditionalContext(e.target.value)}
          placeholder="Specific scenarios, industry focus, regulatory changes to highlight..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          rows={2}
        />
      </div>
    </div>
  );
}
