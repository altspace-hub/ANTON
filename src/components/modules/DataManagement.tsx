import { useState, useEffect } from 'react';

interface Props {
  onInputChange: (inputs: Record<string, unknown>) => void;
}

export default function DataManagement({ onInputChange }: Props) {
  const [scope, setScope] = useState('');
  const [systems, setSystems] = useState('');
  const [concerns, setConcerns] = useState('');

  useEffect(() => {
    onInputChange({ scope, systems, concerns });
  }, [scope, systems, concerns]);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-adv-gray">Assessment scope</label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
        >
          <option value="">Select scope...</option>
          <option value="full-readiness">Full AMLA Data Readiness Assessment</option>
          <option value="customer-data">Customer Data Quality</option>
          <option value="transaction-data">Transaction Data Completeness</option>
          <option value="reporting-data">Regulatory Reporting Data</option>
          <option value="screening-data">Screening Data Requirements</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Source systems</label>
        <input
          type="text"
          value={systems}
          onChange={(e) => setSystems(e.target.value)}
          placeholder="e.g., Core banking, CRM, TM system, Screening tool"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Known data concerns (optional)</label>
        <textarea
          value={concerns}
          onChange={(e) => setConcerns(e.target.value)}
          placeholder="Data quality issues, known gaps, legacy system constraints..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          rows={2}
        />
      </div>
    </div>
  );
}
