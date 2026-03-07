import { useState, useEffect } from 'react';

interface Props {
  onInputChange: (inputs: Record<string, unknown>) => void;
}

const DOC_TYPES = [
  'AML/CFT Policy',
  'Business-Wide Risk Assessment (BWRA)',
  'KYC/CDD Procedures',
  'Transaction Monitoring Policy',
  'STR/SAR Procedures',
  'Sanctions Policy & Procedures',
  'Training Programme',
  'Board Report',
  'Governance Framework',
  'Risk Appetite Statement',
];

export default function DocumentCreation({ onInputChange }: Props) {
  const [docType, setDocType] = useState('');
  const [docName, setDocName] = useState('');
  const [context, setContext] = useState('');

  useEffect(() => {
    onInputChange({ docType, docName, context });
  }, [docType, docName, context]);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-adv-gray">Document type</label>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        >
          <option value="">Select document type...</option>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Document name (optional)</label>
        <input
          type="text"
          value={docName}
          onChange={(e) => setDocName(e.target.value)}
          placeholder="e.g., Nordea AML/CFT Policy v2.0"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Additional context</label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Entity type, jurisdiction, specific requirements, or existing document to update..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          rows={3}
        />
      </div>
    </div>
  );
}
