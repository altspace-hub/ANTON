import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  onInputChange: (inputs: Record<string, unknown>) => void;
}

export default function InvestigationSupport({ onInputChange }: Props) {
  const [caseType, setCaseType] = useState('');
  const [caseDescription, setCaseDescription] = useState('');
  const [supportNeeded, setSupportNeeded] = useState('');

  useEffect(() => {
    onInputChange({ caseType, caseDescription, supportNeeded });
  }, [caseType, caseDescription, supportNeeded]);

  return (
    <div className="space-y-3">
      {/* Safeguard notice */}
      <div className="flex gap-2 rounded-lg border border-adv-gold/30 bg-adv-gold/5 p-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-adv-gold" />
        <div className="text-xs text-adv-gold">
          <strong>Important:</strong> This module structures investigation analysis only. It does NOT make
          compliance decisions. All conclusions and filing decisions must be made by qualified compliance
          professionals.
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Case type</label>
        <select
          value={caseType}
          onChange={(e) => setCaseType(e.target.value)}
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
        >
          <option value="">Select case type...</option>
          <option value="tm-alert">Transaction Monitoring Alert</option>
          <option value="sanctions-hit">Sanctions Screening Hit</option>
          <option value="sar-referral">SAR/STR Referral</option>
          <option value="pep-review">PEP Review</option>
          <option value="adverse-media">Adverse Media Finding</option>
          <option value="internal-report">Internal Suspicious Report</option>
          <option value="regulatory-request">Regulatory Information Request</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Case description</label>
        <textarea
          value={caseDescription}
          onChange={(e) => setCaseDescription(e.target.value)}
          placeholder="Describe the case, relevant facts, and what has been identified so far..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          rows={4}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Support needed</label>
        <select
          value={supportNeeded}
          onChange={(e) => setSupportNeeded(e.target.value)}
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
        >
          <option value="">Select...</option>
          <option value="structure-analysis">Structure the investigation analysis</option>
          <option value="identify-indicators">Identify relevant red flags/indicators</option>
          <option value="draft-narrative">Draft investigation narrative</option>
          <option value="regulatory-context">Provide regulatory context</option>
          <option value="typology-comparison">Compare against known typologies</option>
        </select>
      </div>
    </div>
  );
}
