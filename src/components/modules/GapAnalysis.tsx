import { useState, useEffect } from 'react';

interface Props {
  onInputChange: (inputs: Record<string, unknown>) => void;
}

export default function GapAnalysis({ onInputChange }: Props) {
  const [entityType, setEntityType] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [customerSegments, setCustomerSegments] = useState('');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [knownConcerns, setKnownConcerns] = useState('');

  useEffect(() => {
    onInputChange({ entityType, jurisdiction, customerSegments, focusAreas, knownConcerns });
  }, [entityType, jurisdiction, customerSegments, focusAreas, knownConcerns]);

  const allFocusAreas = [
    'Customer Due Diligence (CDD)',
    'Beneficial Ownership',
    'Transaction Monitoring',
    'Suspicious Activity Reporting',
    'Sanctions Screening',
    'Risk Assessment',
    'Governance & Oversight',
    'Training & Awareness',
    'Record Keeping',
    'Data Management',
  ];

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-adv-gray">Entity type</label>
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
        >
          <option value="">Select...</option>
          <option value="credit-institution">Credit Institution</option>
          <option value="payment-institution">Payment Institution</option>
          <option value="e-money">E-Money Institution</option>
          <option value="investment-firm">Investment Firm</option>
          <option value="insurance">Insurance Company</option>
          <option value="crypto-asset">Crypto-Asset Service Provider</option>
          <option value="other">Other Obliged Entity</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Jurisdiction</label>
        <select
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value)}
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
        >
          <option value="">Select...</option>
          <option value="eu">EU (AMLR/AMLD6)</option>
          <option value="sweden">Sweden</option>
          <option value="finland">Finland</option>
          <option value="norway">Norway</option>
          <option value="denmark">Denmark</option>
          <option value="iceland">Iceland</option>
          <option value="uk">United Kingdom</option>
          <option value="multi">Multi-jurisdiction</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Customer segments</label>
        <input
          type="text"
          value={customerSegments}
          onChange={(e) => setCustomerSegments(e.target.value)}
          placeholder="e.g., Retail, Corporate, PEPs, Correspondent banking"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">AMLR focus areas</label>
        <div className="flex flex-wrap gap-1.5">
          {allFocusAreas.map((area) => (
            <button
              key={area}
              onClick={() =>
                setFocusAreas((prev) =>
                  prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
                )
              }
              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                focusAreas.includes(area)
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med'
              }`}
            >
              {area}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Known concerns (optional)</label>
        <textarea
          value={knownConcerns}
          onChange={(e) => setKnownConcerns(e.target.value)}
          placeholder="Any known compliance gaps, audit findings, or areas of concern..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          rows={2}
        />
      </div>
    </div>
  );
}
