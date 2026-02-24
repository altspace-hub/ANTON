import type { PrecisionLevel } from '@/lib/types';

const PRECISION_LEVELS: { id: PrecisionLevel; label: string; tooltip: string }[] = [
  { id: 'strict', label: 'Strict', tooltip: 'Deterministic, factual' },
  { id: 'precise', label: 'Precise', tooltip: 'Low variance, focused' },
  { id: 'balanced', label: 'Balanced', tooltip: 'Default balance' },
  { id: 'creative', label: 'Creative', tooltip: 'More variation, ideas' },
  { id: 'exploratory', label: 'Exploratory', tooltip: 'High variance, novel' },
];

interface PrecisionSelectorProps {
  value: PrecisionLevel;
  onChange: (level: PrecisionLevel) => void;
}

export function PrecisionSelector({ value, onChange }: PrecisionSelectorProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-adv-gray">Precision</span>
        <span className="text-[10px] text-adv-gray-med">Controls temperature across providers</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRECISION_LEVELS.map((level) => (
          <button
            key={level.id}
            onClick={() => onChange(level.id)}
            title={level.tooltip}
            className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
              value === level.id
                ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
            }`}
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}
