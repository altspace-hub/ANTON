import { useState, useEffect } from 'react';

interface Props {
  onInputChange: (inputs: Record<string, unknown>) => void;
}

export default function RiskAssessment({ onInputChange }: Props) {
  const [assessmentType, setAssessmentType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [scope, setScope] = useState('');

  useEffect(() => {
    onInputChange({ assessmentType, entityType, scope });
  }, [assessmentType, entityType, scope]);

  const types = [
    { id: 'bwra', label: 'Business-Wide Risk Assessment', description: 'Entity-level ML/TF risk assessment' },
    { id: 'maturity', label: 'Maturity Assessment', description: '5-level scoring across AML dimensions' },
    { id: 'product-risk', label: 'Product/Service Risk', description: 'Risk assessment per product or service line' },
    { id: 'customer-risk', label: 'Customer Risk Model', description: 'Customer risk categorization framework' },
    { id: 'control-effectiveness', label: 'Control Effectiveness', description: 'Assessment of existing AML controls' },
  ];

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-adv-gray">Assessment type</label>
        <div className="space-y-1.5">
          {types.map((t) => (
            <button
              key={t.id}
              onClick={() => setAssessmentType(t.id)}
              className={`flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                assessmentType === t.id
                  ? 'border-adv-teal bg-adv-teal-dim'
                  : 'border-border bg-adv-dark hover:border-adv-gray-med'
              }`}
            >
              <div>
                <div className={`text-xs font-medium ${assessmentType === t.id ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                  {t.label}
                </div>
                <div className="text-[11px] text-adv-gray-med">{t.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Entity type</label>
        <input
          type="text"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder="e.g., Nordic retail bank with 2M customers"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Scope details</label>
        <textarea
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder="Business lines in scope, jurisdictions, specific risk factors to consider..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          rows={2}
        />
      </div>
    </div>
  );
}
