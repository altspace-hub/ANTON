import type { CreativityLevel } from '@/lib/types';

const options: Array<{
  id: CreativityLevel;
  label: string;
  description: string;
}> = [
  { id: 'strict', label: 'Strict', description: 'Precise, factual, formal regulatory language' },
  { id: 'balanced', label: 'Balanced', description: 'Accurate and accessible, professional but readable' },
  { id: 'creative', label: 'Creative', description: 'Engaging with real-world examples, maintains accuracy' },
];

interface CreativitySliderProps {
  value: CreativityLevel;
  onChange: (value: CreativityLevel) => void;
}

export default function CreativitySlider({ value, onChange }: CreativitySliderProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-adv-off-white">
        Writing style
      </label>
      <div className="flex rounded-lg border border-border bg-adv-dark-2 p-1">
        {options.map((opt) => {
          const isActive = value === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-all ${
                isActive
                  ? 'bg-adv-teal text-adv-dark shadow-sm'
                  : 'text-adv-gray hover:text-adv-off-white'
              }`}
              title={opt.description}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-adv-gray-med">
        {options.find((o) => o.id === value)?.description}
      </p>
    </div>
  );
}
