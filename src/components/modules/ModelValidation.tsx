import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';

const FCP_AREAS = [
  'Transaction Monitoring',
  'Sanctions Screening',
  'Risk Scoring',
  'Customer Risk Rating',
  'PEP Screening',
  'Adverse Media Screening',
  'Name Matching',
  'Network Analysis',
  'Fraud Detection',
  'Behavioural Analytics',
];

const VALIDATION_TYPES = [
  'Initial Validation',
  'Periodic Review',
  'Post-change Validation',
  'Regulatory Required',
];

const REGULATORY_REQUIREMENTS = [
  'EBA ML/TF Guidelines',
  'AMLR Art. 6',
  'AMLA RTS',
  'FI Guidance',
  'Local supervisory expectations',
];

interface ModelValidationProps {
  onInputChange: (inputs: Record<string, unknown>) => void;
}

export default function ModelValidation({ onInputChange }: ModelValidationProps) {
  const [fcpArea, setFcpArea] = useState('Transaction Monitoring');
  const [modelName, setModelName] = useState('');
  const [validationType, setValidationType] = useState('Initial Validation');
  const [knownIssues, setKnownIssues] = useState('');
  const [regulatoryReqs, setRegulatoryReqs] = useState<string[]>([]);

  useEffect(() => {
    onInputChange({
      fcpArea,
      modelName,
      validationType,
      knownIssues,
      regulatoryRequirements: regulatoryReqs,
    });
  }, [fcpArea, modelName, validationType, knownIssues, regulatoryReqs]);

  const toggleReq = (req: string) => {
    setRegulatoryReqs((prev) =>
      prev.includes(req) ? prev.filter((r) => r !== req) : [...prev, req]
    );
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-2.5 rounded-lg border border-adv-blue/30 bg-adv-blue/5 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-adv-blue" />
        <p className="text-xs text-adv-gray leading-relaxed">
          Upload the baseline/validation framework document and the client's model documentation
          using the file uploader above.
        </p>
      </div>

      {/* FCP Area */}
      <div>
        <label className="mb-1 block text-xs font-medium text-adv-off-white">FCP area</label>
        <select
          value={fcpArea}
          onChange={(e) => setFcpArea(e.target.value)}
          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
        >
          {FCP_AREAS.map((area) => (
            <option key={area} value={area}>{area}</option>
          ))}
        </select>
      </div>

      {/* Model/system name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-adv-off-white">Model / system name</label>
        <input
          type="text"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          placeholder="e.g., NICE Actimize TM, Fircosoft Filter, in-house risk model..."
          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
        />
      </div>

      {/* Validation type */}
      <div>
        <label className="mb-1 block text-xs font-medium text-adv-off-white">Validation type</label>
        <select
          value={validationType}
          onChange={(e) => setValidationType(e.target.value)}
          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
        >
          {VALIDATION_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Known issues */}
      <div>
        <label className="mb-1 block text-xs font-medium text-adv-off-white">
          Known issues <span className="text-adv-gray-med">(optional)</span>
        </label>
        <textarea
          value={knownIssues}
          onChange={(e) => setKnownIssues(e.target.value)}
          placeholder="Describe any known issues with the model: false positive rates, missed detections, calibration concerns, performance gaps..."
          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          rows={3}
        />
      </div>

      {/* Regulatory requirements chips */}
      <div>
        <label className="mb-2 block text-xs font-medium text-adv-off-white">
          Regulatory requirements
        </label>
        <div className="flex flex-wrap gap-2">
          {REGULATORY_REQUIREMENTS.map((req) => {
            const isSelected = regulatoryReqs.includes(req);
            return (
              <button
                key={req}
                onClick={() => toggleReq(req)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-adv-teal text-adv-dark'
                    : 'border border-border text-adv-gray hover:border-adv-teal hover:text-adv-teal'
                }`}
              >
                {req}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
