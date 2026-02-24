import { useState, useEffect } from 'react';

interface Props {
  onInputChange: (inputs: Record<string, unknown>) => void;
}

const CATEGORIES = [
  'AML/CFT Regulation',
  'Sanctions',
  'EBA Guidelines',
  'FATF Standards',
  'National Implementation',
  'Consultation Paper',
  'Technical Standards (RTS/ITS)',
  'Supervisory Guidance',
];

export default function RegulatoryMonitor({ onInputChange }: Props) {
  const [inputMethod, setInputMethod] = useState<'describe' | 'url'>('describe');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    onInputChange({ inputMethod, description, url, category });
  }, [inputMethod, description, url, category]);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-adv-gray">How do you want to provide the regulatory development?</label>
        <div className="flex gap-2">
          <button
            onClick={() => setInputMethod('describe')}
            className={`flex-1 rounded border px-2.5 py-1.5 text-xs transition-colors ${
              inputMethod === 'describe'
                ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med'
            }`}
          >
            Describe it
          </button>
          <button
            onClick={() => setInputMethod('url')}
            className={`flex-1 rounded border px-2.5 py-1.5 text-xs transition-colors ${
              inputMethod === 'url'
                ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med'
            }`}
          >
            Paste URL
          </button>
        </div>
      </div>

      {inputMethod === 'describe' && (
        <div>
          <label className="mb-1 block text-xs text-adv-gray">Describe the development</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., The EBA published final guidelines on internal policies, procedures and controls to ensure compliance with restrictive measures..."
            className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
            rows={4}
          />
        </div>
      )}

      {inputMethod === 'url' && (
        <div>
          <label className="mb-1 block text-xs text-adv-gray">URL to regulatory text</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://eur-lex.europa.eu/..."
            className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
        >
          <option value="">Select category...</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
